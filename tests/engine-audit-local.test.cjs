// تدقيق المحرك السابق منقول إلى node:test بتوقعات قرارات المالك الجديدة.
// دوال الإنتاج والميزان الحقيقي؛ كل كتابة إلى سحابة وهمية، بلا ملفات مولّدة.
'use strict';
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { harness, student, entry, today, copy, root, html, QuranMeasure } = require('./helpers/quick-entry-harness.cjs');
const metaCtx = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(root, 'quran/quran-meta.js'), 'utf8'), metaCtx);
const meta = metaCtx.window.QURAN_META;
const store = fs.readFileSync(path.join(root, 'programs-store.js'), 'utf8');
const general = store.slice(store.indexOf('    general: {'));
// Use real production grade percentages, unlike the older helper's synthetic good=100%.
const grades = vm.runInNewContext('(' + general.match(/grades: (\[[\s\S]*?\])/)[1] + ')');
const kindMult = vm.runInNewContext('(' + general.match(/kindMult: (\{[^}]+\})/)[1] + ')');
const first = dir => [dir === 'up' ? 114 : 1, 1];
const anchor = dir => dir === 'up' ? 78 : 2;
const point = (s, a) => ({ surah: s, ayah: a });
const nextS = (s, dir) => s + (dir === 'up' ? -1 : 1);
const round = n => Math.round(n * 10) / 10;
function fixture(dir, mode = 'accepted', ayah = 20) {
  const s = anchor(dir), st = student({}, { direction: dir });
  if (mode === 'accepted') st.history[today].entries.n = entry('new', first(dir), [s, ayah], 'excellent', 100);
  if (['legacy', 'stored-null'].includes(mode)) Object.assign(st, { lastSurah: s, lastAyah: ayah });
  if (mode === 'legacy') delete st.frontierBase;
  if (mode === 'base') { st.frontierBase = point(s, ayah); st.lastSurah = s; st.lastAyah = ayah; }
  if (mode === 'none') st.frontierFix = { surah: null, ayah: null, at: 0, by: 'fake-admin', prev: null };
  if (mode === 'fixed') st.frontierFix = { ...point(s, ayah), at: 100, by: 'fake-admin', prev: null };
  return st;
}
function open(st = fixture('up', 'none')) {
  const h = harness(st);
  h.state.settings.grades = copy(grades); h.state.settings.kindMult = copy(kindMult); h.reopen();
  return h;
}
function setRange(h, kind, from, to) {
  h.range(kind, kind === 'new' && h.run('generalQuickEntry.locked') ? null : from, to);
}
function evaluate(h) { h.run('updateGeneralQuickPreview()'); }
function added(h) {
  return h.state.writes.flatMap(w => Object.entries(w.fields).filter(([k, e]) => k.includes('.entries.') && e && !e.__almahraDelete).map(([key, e]) => ({ date: key.split('.')[1], ...copy(e) })));
}
function observe(h) {
  const snap = {};
  for (const [name, expression] of Object.entries({ frontier: 'computeFrontier(students[0])', review: 'computeLastReview(students[0])', suggestions: 'generalQuickSuggestions(students[0])' })) {
    try { snap[name] = copy(h.run(expression)); } catch (err) { snap[name + 'Error'] = err.message; }
  }
  return { writes: h.state.writes.length, entries: added(h).map(e => ({ ...e, measured: copy(QuranMeasure.measure({ iv: e.iv ? Array.from({ length: e.iv.length / 2 }, (_, i) => e.iv.slice(i * 2, i * 2 + 2)) : QuranMeasure.specToIntervals({ spec: e.spec }) })) })),
    prompts: copy(h.state.prompts), messages: copy(h.state.messages), preview: h.element('generalQuickPreview').textContent,
    celebration: h.state.confetti ? h.element('celebrationPoints').innerText : null,
    modalOpen: h.element('smartModal').classList.contains('flex'), ...snap };
}
async function check(id, group, expected, action, verify, note = '') {
  const excluded = { F10: 'جهازان في اللحظة نفسها خارج النطاق', F12: 'فرق الساعة خارج النطاق', D03: 'تنبيه الكمية الكبيرة خارج النطاق', D05: 'أول المحفوظ لمن بدأ من الوسط خارج النطاق' };
  await test(group + ': ' + id + ' — ' + expected, excluded[group] ? { todo: excluded[group] } : {}, async () => {
    if (excluded[group]) return;
    const actual = await action(); verify(actual);
  });
}
const noWrite = a => assert.equal(a.writes, 0);
async function save(h) { evaluate(h); await h.save(); return observe(h); }
function date(h, value = '2026-11-05') { h.ctx.auditDate = value; h.run('todayStr = auditDate'); h.reopen(); }
function selectDate(h, value = today) { h.ctx.auditDate = value; h.run('selectGeneralQuickDate(auditDate)'); }
async function fix(h, s, a) {
  h.run('renderGeneralFrontierFix(1)'); h.element('frontierFixSurah').value = String(s); h.element('frontierFixAyah').value = String(a);
  await h.run('saveGeneralFrontierFix()');
}

async function main() {
  for (const dir of ['up', 'down']) {
    const s = anchor(dir), ns = nextS(s, dir);
    for (const mode of ['legacy', 'stored-null', 'base', 'accepted', 'fixed']) {
      await check(`position/${dir}/${mode}`, 'F01', 'حدّ معروف: بداية مقفلة على الآية 21، والحدّ 20', () => {
        const h = open(fixture(dir, mode)); return observe(h);
      }, a => { assert.equal(a.suggestions.locked, true); assert.deepEqual(a.frontier, point(s, 20)); assert.deepEqual(a.suggestions.newStart, point(s, 21)); });
      for (const [name, from, to] of [['below', first(dir), [s, 10]], ['overlap', [s, 10], [s, 30]], ['jump', [ns, 1], [ns, 5]]]) {
        if (['accepted', 'fixed'].includes(mode)) continue; // Those paths really have no editable start.
        await check(`new-position/${dir}/${mode}/${name}`, 'F01', name === 'below' ? 'النهاية تحت البداية المقفلة تمنع الحفظ' : 'لا حقل بداية قابل للقفز؛ المقطع يبدأ من الآية التالية للحدّ', async () => {
          const h = open(fixture(dir, mode)); setRange(h, 'new', from, to); h.grade('new', 'excellent'); return save(h);
        }, a => { if (name === 'below') noWrite(a); else { assert.equal(a.entries.length, 1); assert.deepEqual(a.entries[0].spec.from, [s, 21]); } });
      }
    }
    await check(`new-position/${dir}/legacy/small-below`, 'F01', 'لا نقاط جديد لست آيات محفوظة أصلاً في بداية المسار', async () => {
      const h = open(fixture(dir, 'legacy')); setRange(h, 'new', first(dir), [first(dir)[0], 6]); h.grade('new', 'excellent'); return save(h);
    }, noWrite);
    // Independent new/review streams, repeat, boundaries, and explicit one-verse input.
    await check(`repeat/${dir}/locked`, 'CONTROL', 'يُعاد صفر نقاط ولا يحرّك الحدّ أو بداية الجديد', async () => {
      const h = open(fixture(dir)); setRange(h, 'new', null, [s, 30]); h.grade('new', 'repeat'); const a = await save(h); h.reopen(); return { ...a, reopened: copy(h.run('generalQuickSuggestions(students[0])')) };
    }, a => { assert.equal(a.entries[0].points, 0); assert.deepEqual(a.frontier, point(s, 20)); assert.deepEqual(a.reopened.newStart, point(s, 21)); });
    await check(`repeat/${dir}/first`, 'CONTROL', 'لم يحفظ شيئاً: يُعاد يبدأ من أول المسار ولا يثبت حداً', async () => {
      const h = open(fixture(dir, 'none')); setRange(h, 'new', [s, 11], [s, 20]); h.grade('new', 'repeat'); return save(h);
    }, a => { assert.equal(a.frontier, null); assert.equal(a.suggestions.locked, true); assert.deepEqual(a.suggestions.newStart, point(...first(dir))); });
    await check(`repeat/${dir}/imported`, 'F01', 'مع موضع مسجّل يبقى الجديد بعده ومقفلاً حتى مع يُعاد', async () => {
      const h = open(fixture(dir, 'legacy')); setRange(h, 'new', [s, 21], [s, 30]); h.grade('new', 'repeat'); return save(h);
    }, a => { assert.equal(a.suggestions.locked, true); assert.deepEqual(a.suggestions.newStart, point(s, 21)); });
    for (const mode of ['none', 'accepted']) for (const kind of ['new', 'review']) {
      await check(`grade-only/${dir}/${mode}/${kind}`, 'F04', 'اختيار تقدير وحده لا يثبت مقطعاً افتراضياً دون تأكيد النهاية', async () => {
        const h = open(fixture(dir, mode)); h.grade(kind, 'excellent'); return save(h);
      }, noWrite, 'اختيار آية واحدة صراحةً حالة صحيحة؛ الإشكال في نهاية لم يحددها المشرف.');
      for (const other of [false, true]) await check(`no-grade/${dir}/${mode}/${kind}/other-${other}`, 'F03', 'مقطع تغيّر بلا تقدير: إيقاف الحفظ كله برسالة واضحة', async () => {
        const h = open(fixture(dir, mode));
        setRange(h, kind, kind === 'new' && mode === 'accepted' ? null : first(dir), kind === 'new' && mode === 'accepted' ? [s, 25] : [s, 10]);
        if (other) { const k = kind === 'new' ? 'review' : 'new'; setRange(h, k, first(dir), k === 'new' && mode === 'accepted' ? [s, 25] : [s, 10]); h.grade(k, 'excellent'); }
        return save(h);
      }, noWrite);
    }
    await check(`toggle-grade/${dir}`, 'F03', 'الضغطة الثانية تحتفظ بالتقدير وتحفظ المقطع', async () => {
      const h = open(fixture(dir)); setRange(h, 'new', null, [s, 30]); h.grade('new', 'excellent'); h.grade('new', 'excellent'); return save(h);
    }, a => { assert.equal(a.entries.length, 1); assert.equal(a.entries[0].grade, 'excellent'); });
    for (const kind of ['new', 'review']) await check(`no-grade-invalid/${dir}/${kind}`, 'F03', 'مقطع غير صالح بلا تقدير لا يجوز تجاهله وحفظ القسم الآخر بصمت', async () => {
      const h = open(fixture(dir)); setRange(h, kind, first(dir), [s, 999]);
      const other = kind === 'new' ? 'review' : 'new'; setRange(h, other, first(dir), other === 'new' ? [s, 25] : [s, 10]); h.grade(other, 'excellent'); return save(h);
    }, noWrite);
    for (const kind of ['new', 'review']) for (const edge of kind === 'new' ? ['to'] : ['from', 'to']) {
      for (const [label, value] of [['blank', ''], ['zero', '0'], ['negative', '-1'], ['fraction', '2.5'], ['over-surah', String(meta.surahs[s - 1][1] + 1)]]) {
        await check(`invalid/${dir}/${kind}/${edge}/${label}`, 'CONTROL', 'آية غير صالحة مع تقدير: منع الحفظ', async () => {
          const h = open(fixture(dir, 'none')); setRange(h, kind, [s, 1], [s, 10]); h.element(`quick_${kind}_${edge}Ayah`).value = value; h.grade(kind, 'excellent'); return save(h);
        }, noWrite);
      }
    }
    for (const kind of ['new', 'review']) for (const [name, from, to] of [['reverse-ayah', [s, 20], [s, 10]], ['reverse-surah', [s, 1], [nextS(s, dir === 'up' ? 'down' : 'up'), 1]]]) {
      await check(`reverse/${dir}/${kind}/${name}`, 'CONTROL', 'المقطع المقلوب يُرفض مع ذكر القسم', async () => {
        const h = open(fixture(dir, 'legacy', 19)); setRange(h, kind, from, to); h.grade(kind, 'excellent'); return save(h);
      }, a => { noWrite(a); assert.match(a.messages.at(-1).message, /قبل البداية/); });
    }
    for (const kind of ['new', 'review']) await check(`surah-change/${dir}/${kind}`, 'OBSERVATION', 'تغيير سورة النهاية يفرّغ آيتها', async () => {
      const h = open(fixture(dir)); h.element(`quick_${kind}_toSurah`).value = String(ns); h.run(`quickSurahChanged('${kind}', 'to')`);
      return { value: h.element(`quick_${kind}_toAyah`).value, max: h.element(`quick_${kind}_toAyah`).max, used: h.run(`generalQuickSectionUsed('${kind}')`) };
    }, a => { assert.equal(a.value, ''); assert.equal(a.used, true); });
    for (const mode of ['legacy', 'stored-null', 'base', 'accepted', 'fixed', 'none']) {
      const reviews = [ ['inside', first(dir), [s, 10]], ['on', first(dir), [s, 20]], ['partial', first(dir), [s, 25]], ['all-above', [ns, 1], [ns, 5]] ];
      for (const [name, from, to] of reviews) for (const newGrade of ['', 'excellent', 'repeat']) {
        // No frontier is defined for mode=none; its policy is explicitly a decision, not a claimed rule violation.
        const above = name === 'all-above' || name === 'partial' && newGrade !== 'excellent';
        const known = mode !== 'none' || newGrade === 'excellent';
        await check(`review/${dir}/${mode}/${name}/new-${newGrade || 'absent'}`, !known ? 'D01' : above ? 'F02' : 'CONTROL',
          !known ? 'قرار مطلوب: إيقاف مراجعة لا حدّ محفوظ معروفاً لها' : above ? 'منع المراجعة التي تتجاوز الحدّ حتى إن وافق المشرف' : 'المراجعة داخل الحدّ أو عليه تُحفظ', async () => {
          const h = open(fixture(dir, mode));
          if (newGrade) { setRange(h, 'new', [s, 21], [s, 30]); h.grade('new', newGrade); }
          setRange(h, 'review', from, to); h.grade('review', 'excellent'); return save(h);
        }, a => { if (!known || above) noWrite(a); else assert.equal(a.entries.length, newGrade ? 2 : 1); });
      }
    }
    await check(`review-cancel/${dir}`, 'CONTROL', 'التجاوز ممنوع دون سؤال قابل للموافقة', async () => {
      const h = open(fixture(dir)); setRange(h, 'review', first(dir), [s, 25]); h.grade('review', 'excellent'); h.state.confirmed = false; return save(h);
    }, a => { noWrite(a); assert.equal(a.prompts.length, 0); });
    for (const reviewGrade of ['excellent', 'repeat']) for (const end of [10, 20, 25]) {
      await check(`review-suggestion/${dir}/${reviewGrade}/${end}`, reviewGrade === 'repeat' ? 'D02' : 'CONTROL', 'آخر مراجعة مقبولة تحدد التالية بالتاريخ ثم الوقت، وعند الحدّ تبدأ دورة من أول المسار', () => {
        const st = fixture(dir); st.history[today].entries.r = entry('review', first(dir), [s, end], reviewGrade, 200); return observe(open(st));
      }, a => assert.deepEqual(a.suggestions.reviewStart, reviewGrade === 'repeat' || end >= 20 ? point(...first(dir)) : point(s, 11)), reviewGrade === 'repeat' ? 'يُعاد لا يحرك مؤشر المراجعة.' : '');
    }
    await check(`review-first-memorized/${dir}`, 'D05', 'قرار مطلوب: أول المحفوظ إذا بدأ أول جديد من وسط المصحف بلا موضع سابق', async () => {
      const h = open(fixture(dir, 'none')); setRange(h, 'new', [s, 11], [s, 20]); h.grade('new', 'excellent'); return save(h);
    }, a => assert.deepEqual(a.suggestions.reviewStart, point(s, 11)), 'الكود يقترح الناس 1 أو الفاتحة 1 دائماً، ولا يخزّن بداية المحفوظ الفعلية.');
    await check(`review-not-new/${dir}`, 'CONTROL', 'المراجعة لا تغيّر بداية الجديد أو حدّه', async () => {
      const h = open(fixture(dir)); setRange(h, 'review', first(dir), [s, 10]); h.grade('review', 'excellent'); return save(h);
    }, a => { assert.deepEqual(a.frontier, point(s, 20)); assert.deepEqual(a.suggestions.newStart, point(s, 21)); assert.deepEqual(a.suggestions.reviewStart, point(s, 11)); });
    for (const grade of grades.map(g => g.id)) for (const kind of ['new', 'review']) {
      await check(`points/${dir}/${kind}/${grade}`, 'CONTROL', 'النقاط = الأسطر × معامل النوع × نسبة التقدير، وتقريب إلى عُشر', async () => {
        const st = fixture(dir, kind === 'review' ? 'accepted' : 'legacy');
        if (kind === 'new') { st.lastSurah = s + (dir === 'up' ? 1 : -1); st.lastAyah = meta.surahs[st.lastSurah - 1][1]; }
        const h = open(st); setRange(h, kind, [s, 1], [s, 10]); h.grade(kind, grade); return save(h);
      }, a => { const e = a.entries[0], pct = grades.find(g => g.id === grade).percent; assert.equal(e.points, round(e.measured.lines * (kind === 'new' ? kindMult.newMemorization : kindMult.review) * pct / 100)); });
    }
    for (const kind of ['new', 'review']) await check(`whole-quran/${dir}/${kind}`, 'D03', 'قرار مطلوب: تنبيه أو تأكيد إضافي لكمية المصحف كله', async () => {
      const h = open(fixture(dir, 'none')); const endSurah = dir === 'up' ? 1 : 114;
      setRange(h, kind, first(dir), [endSurah, meta.surahs[endSurah - 1][1]]); h.grade(kind, 'excellent'); return save(h);
    }, a => { assert.equal(a.entries[0].measured.ayahs, 6236); assert.ok(a.prompts.length > 0, 'المصحف كله دون أي تأكيد'); });
    await check(`undo-both/${dir}`, 'CONTROL', 'حفظ جديد ومراجعة ثم تراجعين: حذف المراجعة ثم الجديد وإعادة الحدّ الأصلي', async () => {
      const h = open(fixture(dir)); setRange(h, 'new', null, [s, 30]); h.grade('new', 'excellent'); setRange(h, 'review', first(dir), [s, 10]); h.grade('review', 'excellent'); h.run('fulfillGeneralCriteria()'); await save(h); h.reopen();
      await h.run('undoLastGeneralEntry()'); const once = observe(h); await h.run('undoLastGeneralEntry()'); return { once, twice: observe(h), st: copy(h.s) };
    }, a => { assert.deepEqual(a.once.frontier, point(s, 30)); assert.deepEqual(a.twice.frontier, point(s, 20)); assert.equal(Object.keys(a.st.history[today].entries).length, 1); assert.equal(a.st.history[today].attended, true); assert.equal(a.st.history[today].criteriaPoints, 8); });
    for (const bad of ['blank', 'over', 'reversed']) await check(`message/${dir}/${bad}`, 'F14', 'رسالة الخطأ تحدد هل الآية فارغة أو خارج السورة أو النهاية قبل البداية، مع ذكر الاتجاه عند الحاجة', async () => {
      const h = open(fixture(dir, 'legacy', 19)); setRange(h, 'new', [s, 20], [s, bad === 'blank' ? '' : bad === 'over' ? 999 : 10]); h.grade('new', 'excellent'); return save(h);
    }, a => { noWrite(a); assert.match(a.messages.at(-1).message, bad === 'blank' ? /آية النهاية فارغة/ : bad === 'over' ? /فيها.*آية/ : /قبل البداية.*ترتيب حفظه/); });
    await check(`undo-legacy/${dir}`, 'F05', 'طالب قديم بلا frontierBase: التراجع عن آخر جديد يرجع إلى موضعه المسجّل 10', async () => {
      const st = fixture(dir, 'legacy', 10); st.history[today].entries.n = entry('new', [s, 11], [s, 20], 'excellent', 100);
      const h = open(st); await h.run('undoLastGeneralEntry()'); return { ...observe(h), student: copy(st) };
    }, a => assert.deepEqual(a.frontier, point(s, 10)));
    await check(`fix/${dir}/history`, 'CONTROL', 'التصحيح يستبعد الجديد القديم دون حذف النقاط، ثم يقبل جديداً متصلاً ويعيد الحدّ المصحح بعد التراجع', async () => {
      const st = fixture(dir), original = copy(st.history), h = open(st); await fix(h, s, 10); const preserved = JSON.stringify(original) === JSON.stringify(st.history); h.reopen();
      setRange(h, 'new', null, [s, 15]); h.grade('new', 'excellent'); await save(h); h.reopen(); await h.run('undoLastGeneralEntry()');
      return { ...observe(h), preserved, fix: copy(st.frontierFix) };
    }, a => { assert.equal(a.preserved, true); assert.deepEqual(a.frontier, point(s, 10)); assert.equal(a.fix.by, 'fake-admin'); assert.deepEqual(a.fix.prev, point(s, 20)); });
    await check(`fix/${dir}/completed`, 'CONTROL', 'اكتمال المصحف: لا يُسجّل جديد جديد بعد نهايته', async () => {
      const endSurah = dir === 'up' ? 1 : 114, h = open(fixture(dir, 'fixed')); h.s.frontierFix = { surah: endSurah, ayah: meta.surahs[endSurah - 1][1], at: 100 }; h.reopen(); h.grade('new', 'excellent'); return save(h);
    }, noWrite);
    await check(`fix/${dir}/clock-skew`, 'F12', 'جديد بعد التصحيح من جهاز ساعته متأخرة: لا تُحتسب نقاطه ثم يُتجاهل عند حساب الحدّ', async () => {
      const h = open(fixture(dir, 'fixed')); h.s.frontierFix.at = 2000; h.reopen(); h.run('Date.now = () => 1990');
      setRange(h, 'new', null, [s, 25]); h.grade('new', 'excellent'); return save(h);
    }, a => assert.deepEqual(a.frontier, point(s, 25)), 'محاكاة فرق ساعة بين جهاز التصحيح وجهاز التسجيل؛ السجل الجديد يحمل at أقدم من التصحيح.');
    await check(`fix/${dir}/review-from-dirty`, 'F09', 'رابط التصحيح يحذّر من فقدان بداية مراجعة عُدّلت وحدها', () => {
      const h = open(fixture(dir)); h.element('quick_review_fromAyah').value = '2'; evaluate(h); h.run('openGeneralFrontierFixFromQuick()');
      return { ...observe(h), tab: h.state.tab };
    }, a => assert.ok(a.prompts.some(p => p.includes('دون حفظ'))));
    for (const start of ['last-ayah', 'next-surah', 'multi-surah']) await check(`save-boundary/${dir}/${start}`, 'CONTROL', 'حفظ الجديد عند آخر السورة وعبر السور يثبت النهاية وبداية تالية صحيحتين', async () => {
      const count = meta.surahs[s - 1][1], end = start === 'multi-surah' ? nextS(ns, dir) : start === 'next-surah' ? ns : s;
      const h = open(fixture(dir, 'fixed', count - 1)); const to = [end, start === 'last-ayah' ? count : 4]; setRange(h, 'new', null, to); h.grade('new', 'excellent'); return save(h);
    }, a => { const e = a.entries[0]; assert.deepEqual(a.frontier, point(...e.spec.to)); assert.deepEqual(a.suggestions.newStart, e.spec.to[1] === meta.surahs[e.spec.to[0] - 1][1] ? point(nextS(e.spec.to[0], dir), 1) : point(e.spec.to[0], e.spec.to[1] + 1)); });
    await check(`missed/${dir}/historical-new`, 'F06', 'تُمنع الورقة الأقدم إذا وُجد تسميع بعدها', async () => {
      const st = fixture(dir, 'fixed', 10); st.history = { '2026-11-03': { entries: { n: entry('new', [s, 21], [s, 30], 'excellent', 300) } } };
      const h = open(st); date(h); selectDate(h); if (h.run('generalQuickEntry.dateStr') !== today) return observe(h); setRange(h, 'new', null, [s, 20]); h.grade('new', 'excellent'); return save(h);
    }, a => { noWrite(a); assert.match(a.messages.at(-1).message, /سُجّل له بعد هذا اليوم/); });
    await check(`missed/${dir}/historical-review-pointer`, 'F07', 'ورقة الأحد المدخلة الخميس لا ترجع آخر مراجعة عن مراجعة الثلاثاء', async () => {
      const st = fixture(dir); st.history = { '2026-11-03': { entries: { n: entry('new', first(dir), [s, 20], 'excellent', 300), r: entry('review', first(dir), [s, 10], 'excellent', 301) } } };
      const h = open(st); date(h); selectDate(h); assert.notEqual(h.run('generalQuickEntry.dateStr'), today); return observe(h);
    }, a => assert.deepEqual(a.suggestions.reviewStart, point(s, 11)));
    await check(`missed/${dir}/review-future-frontier`, 'F08', 'مراجعة الأحد لا تعتمد على جديد الثلاثاء الذي لم يكن محفوظاً يوم الأحد', async () => {
      const st = fixture(dir, 'fixed', 10); st.history = { '2026-11-03': { entries: { n: entry('new', [s, 11], [s, 30], 'excellent', 300) } } };
      const h = open(st); date(h); selectDate(h); if (h.run('generalQuickEntry.dateStr') !== today) return observe(h); setRange(h, 'review', first(dir), [s, 25]); h.grade('review', 'excellent'); return save(h);
    }, noWrite);
    await check(`missed/${dir}/discard-input`, 'F09', 'تغيير يوم التسجيل مع إدخال غير محفوظ يتطلب تنبيهاً قبل إزالته', () => {
      const h = open(fixture(dir)); date(h); setRange(h, 'new', null, [s, 30]); h.grade('new', 'excellent'); evaluate(h); selectDate(h);
      return { ...observe(h), grade: h.run('generalQuickEntry.grades.new'), end: h.element('quick_new_toAyah').value };
    }, a => { assert.ok(a.prompts.length > 0); });
    await check(`missed/${dir}/no-undo`, 'D04', 'لا تراجع من نافذة يوم فائت؛ الحذف التاريخي خارج هذه النافذة', async () => {
      const h = open(fixture(dir)); date(h); selectDate(h); setRange(h, 'new', null, [s, 25]); h.grade('new', 'excellent'); await save(h); h.reopen(); selectDate(h); const before = h.state.writes.length; await h.run('undoLastGeneralEntry()');
      return { ...observe(h), undoDisabled: h.element('smartUndoBtn').disabled, undoHidden: h.element('smartUndoRow').classList.contains('hidden'), writesAfterUndo: h.state.writes.length - before };
    }, a => { assert.equal(a.undoDisabled, true); assert.equal(a.writesAfterUndo, 0); });
    await check(`success/${dir}/attendance-only`, 'F13', 'حفظ نموذج بلا مقاطع: رسالة النجاح تقول حفظ الحضور فقط', async () => save(open(fixture(dir))),
      a => { assert.equal(a.entries.length, 0); assert.match(a.messages.at(-1).message, /حضور|حاضراً/); });
    await check(`race/${dir}/two-clients`, 'F10', 'نموذجان على نفس الحدّ: لا تُمنح نقاط جديد مرتين للمقطع نفسه', async () => {
      const st = fixture(dir), a = open(copy(st)), b = open(copy(st));
      for (const h of [a, b]) { setRange(h, 'new', null, [s, 30]); h.grade('new', 'excellent'); evaluate(h); }
      const cloud = open(copy(st));
      // Merge the two accepted patches exactly as dotted update fields would merge.
      await a.save(); await b.save();
      for (const h of [a, b]) for (const w of h.state.writes) { cloud.ctx.auditPatch = w.fields; cloud.run('applyFieldsLocally(students[0], auditPatch)'); }
      return { a: observe(a), b: observe(b), mergedEntries: copy(cloud.s.history[today].entries) };
    }, a => assert.equal(a.a.entries.length + a.b.entries.length, 1), 'محاكاة عميلين مع لقطة واحدة وسحابة تقبل patch؛ لا تدّعي تشغيل Firestore حقيقياً.');
  }
  // Exhaustive pure checks: every ayah's successor, both directions, all whole-surah ranges and their endpoints.
  await check('exhaustive/all-successors', 'CONTROL', 'الآية التالية صحيحة لكل آية في المصحف بالاتجاهين، وآخر المصحف يعيد null', () => {
    const h = open(); let tested = 0;
    for (const dir of ['up', 'down']) for (let s = 1; s <= 114; s++) for (let a = 1; a <= meta.surahs[s - 1][1]; a++) {
      h.ctx.p = point(s, a); h.ctx.d = dir; const actual = copy(h.run('generalNextPoint(p,d)'));
      const n = nextS(s, dir), expected = a < meta.surahs[s - 1][1] ? point(s, a + 1) : n >= 1 && n <= 114 ? point(n, 1) : null;
      assert.deepEqual(actual, expected); tested++;
    } return { tested };
  }, a => assert.equal(a.tested, 12472));
  await check('exhaustive/surah-boundaries-and-measure', 'CONTROL', 'لكل سورة مقطع كامل ومقطع عابر حتى ثلاث سور: كل آية محسوبة مرة، والنهاية في اتجاه الطالب صحيحة', () => {
    const h = open(); let tested = 0;
    for (const dir of ['up', 'down']) for (let s = 1; s <= 114; s++) for (const distance of [0, 1, 3]) {
      const end = s + distance * (dir === 'up' ? -1 : 1); if (end < 1 || end > 114) continue;
      const fromAyah = distance ? Math.min(3, meta.surahs[s - 1][1]) : 1, endAyah = distance ? Math.min(4, meta.surahs[end - 1][1]) : meta.surahs[end - 1][1];
      const e = { spec: { from: [s, fromAyah], to: [end, endAyah] }, rep: 1 };
      const m = QuranMeasure.measure(e); let expected = 0;
      for (let x = Math.min(s, end); x <= Math.max(s, end); x++) expected += x === s && distance ? meta.surahs[x - 1][1] - fromAyah + 1 : x === end ? endAyah : meta.surahs[x - 1][1];
      assert.equal(m.ayahs, expected); h.ctx.e = e; h.ctx.d = dir; assert.deepEqual(copy(h.run('endPointOf(e,d)')), point(end, endAyah)); tested++;
    } return { tested };
  }, a => assert.equal(a.tested, 676));
  for (const [name, value] of [['blank', ''], ['zero', 0], ['fraction', 2.5], ['over', 41]]) await check(`fix-invalid/${name}`, 'CONTROL', 'تصحيح موضع بآية غير صالحة يُرفض', async () => {
    const h = open(fixture('up')); h.run('renderGeneralFrontierFix(1)'); h.element('frontierFixSurah').value = '78'; h.element('frontierFixAyah').value = String(value); await h.run('saveGeneralFrontierFix()'); return observe(h);
  }, noWrite);
  for (const mode of ['reject', 'throw']) await check(`cloud/${mode}`, 'CONTROL', 'فشل السحابة يبقي الإدخال والحدّ دون نجاح كاذب ويمكن إعادة المحاولة', async () => {
    const h = open(fixture('up')); setRange(h, 'new', null, [78, 30]); h.grade('new', 'excellent'); h.state.pending = mode === 'throw' ? Promise.reject(Error('audit fake rejection')) : Promise.resolve({ success: false, error: 'audit fake rejection' });
    const a = await save(h); h.state.pending = null; await h.save(); return { failed: a, retried: observe(h) };
  }, a => { assert.deepEqual(a.failed.frontier, point(78, 20)); assert.equal(a.failed.modalOpen, true); assert.equal(a.failed.celebration, null); assert.deepEqual(a.retried.frontier, point(78, 30)); });
  await check('cloud/double-click', 'CONTROL', 'أثناء انتظار السحابة لا كتابة مكررة ولا تراجع ولا إغلاق', async () => {
    const h = open(fixture('up')); setRange(h, 'new', null, [78, 30]); h.grade('new', 'excellent'); evaluate(h);
    let release; h.state.pending = new Promise(r => { release = r; }); const saving = h.save(); await h.save(); await h.run('undoLastGeneralEntry()'); h.run('closeSmartModal()'); const pending = observe(h); release({ success: true }); await saving; return { pending, final: observe(h) };
  }, a => { assert.equal(a.pending.writes, 1); assert.equal(a.pending.modalOpen, true); assert.deepEqual(a.pending.frontier, point(78, 20)); assert.deepEqual(a.final.frontier, point(78, 30)); });
  await check('frontier/corrupt-import', 'F11', 'موضع قديم خارج المصحف لا يُسقط فتح النافذة باستثناء JavaScript', () => {
    const st = fixture('up', 'legacy'); st.lastSurah = 115;
    try { open(st); return { threw: false }; } catch (err) { return { threw: true, error: err.message }; }
  }, a => assert.equal(a.threw, false));
  await check('frontier/corrupt-import-ayah', 'F11', 'موضع قديم بآية 999 لا يظهر للمشرف كموضع صحيح ولا يبقى حداً غير صالح', () => {
    const st = fixture('up', 'legacy'); st.lastAyah = 999; return observe(open(st));
  }, a => assert.equal(a.frontier, null));
}
main().catch(err => { console.error(err); process.exitCode = 1; });
