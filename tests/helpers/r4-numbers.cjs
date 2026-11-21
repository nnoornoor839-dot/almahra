// الجولة 4 (ل0 + ل16) — المصدر الثاني المستقل للأرقام (م11، م16)، كاتب اختبار أ26، 2026-11-19.
// لا يقرأ index.html ولا يستدعي أي دالة منه: القواعد مكتوبة هنا من البطاقة (features/accounts/teacher-r4-card.md §1 ل0/ل16) وحدها،
// والمقادير من QuranMeasure (quran/*.js)، والنقاط من general-points.js، والإعدادات الافتراضية بيانات PROGRAM_DEFS في programs-store.js،
// والأيام الثابتة من مفتاحي الإجابة (homeprep-answer-key.json، board-answer-key.json).
//
// التشغيل:
//   node tests/helpers/r4-numbers.cjs                 ← يطبع الجداول (القواعد الحالية «الآن» وقواعد ما بعد الإصلاح «بعد»)
//   node tests/helpers/r4-numbers.cjs --json          ← الناتج نفسه JSON
//   node tests/helpers/r4-numbers.cjs --write-keys <مجلد الأدلة>
//        ← يعيد توليد قيمة "undo" وحدها في المفتاحين من حساب «بعد»، ويحفظ نسخة المفتاح القديم باسم بصمته في المجلد، ويتحقق أن ما عدا undo لم يتغيّر.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const { generalEntryPoints } = require(path.join(root, 'general-points.js'));
const qctx = vm.createContext({ window: {} });
for (const f of ['quran-meta', 'quran-lines', 'quran-words', 'quran-measure']) vm.runInContext(fs.readFileSync(path.join(root, 'quran', f + '.js'), 'utf8'), qctx);
const { QURAN_META, QURAN_LINES, QURAN_WORDS, QuranMeasure } = qctx.window;
if (!QuranMeasure.init(QURAN_META, QURAN_LINES, QURAN_WORDS).ok) throw new Error('QuranMeasure');
const store = fs.readFileSync(path.join(root, 'programs-store.js'), 'utf8');
const DEFS = vm.runInNewContext(`(${store.match(/export const PROGRAM_DEFS = ([\s\S]*?);\r?\n/)[1]})`).general.defaultSettings;
const BOARD = path.join(root, 'tests/rules/board-answer-key.json'), PREP = path.join(root, 'tests/rules/homeprep-answer-key.json');
const boardKey = JSON.parse(fs.readFileSync(BOARD, 'utf8')), prepKey = JSON.parse(fs.readFileSync(PREP, 'utf8'));
const r1 = n => Math.round(n * 10) / 10;
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');

// ===== القواعد (من البطاقة، مستقلة) =====
const lines = spec => QuranMeasure.measure({ spec }).lines;
const entry = (kind, from, to, grade, settings = DEFS) => {
    const l = lines({ from, to });
    return { kind, grade, spec: { from, to }, lines: l, points: generalEntryPoints({ lines: l, kind, gradeId: grade, settings }).points };
};
// ل0 (أ): الافتراضيات بمعرّف المرحلة (ابتدائي 8/1، متوسط 15/2، غيرهما بلا شرط).
const LIMITS = { primary: { newLines: 8, reviewPages: 1 }, middle: { newLines: 15, reviewPages: 2 } };
// ل0 (ب): (جديد بلا «يُعاد» ≥ newLines أو متوقف) و(مراجعة ≥ reviewPages × 15)؛ بقايا الفاصلة تُزال إلى 1e-6.
function limitMissing(stage, dayEntries, paused = false) {
    const lim = LIMITS[stage]; if (!lim) return [];
    const sum = kind => Math.round(dayEntries.filter(e => e.kind === kind && e.grade !== 'repeat').reduce((s, e) => s + e.lines, 0) * 1e6) / 1e6;
    const miss = [];
    if (!paused && sum('new') < lim.newLines) miss.push('new');
    if (sum('review') < lim.reviewPages * 15) miss.push('review');
    return miss;
}
// شرط التقدير القائم (homePrepQualifies بمعناه): كل أقسام اليوم بتقدير ≥ الحد (الافتراضي «جيد»)، ويوم بلا تسميع لا يكفي.
function gradeOk(dayEntries, settings = DEFS, minId = 'good') {
    const pct = id => settings.grades.find(g => g.id === id)?.percent ?? 0, min = pct(minId);
    const pool = dayEntries.filter(e => e.kind === 'new' || e.kind === 'review');
    return pool.length > 0 && pool.every(e => pct(e.grade) >= min);
}
const CRIT = Object.fromEntries(DEFS.criteria.map(c => [c.id, c.points]));
const FULFILL = DEFS.criteria.filter(c => c.points >= 0 && !c.optIn && c.enabled !== false).map(c => c.id);   // «استوفى المعايير»
// نقاط اليوم = 10 للحضور (attended أو تسجيل) + نقاط التسجيلات + criteriaPoints (صياغة getCumulativeStats/dayPoints بمعناها).
function dayTotal(day) {
    if (!day) return 0;
    const ents = Object.values(day.entries || {});
    const present = day.attended === true || ents.length > 0;
    return r1((present ? 10 : 0) + ents.reduce((s, e) => s + e.points, 0) + (day.criteriaPoints || 0));
}
// حساب criteria ليومٍ وفق القاعدة: «الآن» = early مشروط بالحد (ق92) وhomeprep بلا حد؛ «بعد» = early بلا شرط وhomeprep مشروط (ل0).
function criteriaFor(rule, stage, dayEntries, selected, paused = false) {
    const out = {};
    for (const id of selected) out[id] = CRIT[id];
    const below = limitMissing(stage, dayEntries, paused).length > 0;
    if (rule === 'now' && 'early' in out && below) out.early = 0;
    if (rule === 'after' && 'homeprep' in out && below) out.homeprep = 0;
    return out;
}
const sumCrit = c => Object.values(c).reduce((s, v) => s + v, 0);
function makeDay(rule, stage, ents, selected, paused) {
    const criteria = criteriaFor(rule, stage, ents, selected, paused);
    return { attended: true, entries: Object.fromEntries(ents.map((e, i) => ['e' + i, e])), criteria, criteriaPoints: sumCrit(criteria) };
}
// ل16 (أ): التراجع يحذف آخر تسجيل؛ «بعد»: إن لم يبقَ تسجيل يُحذف attended/absence/note/criteria/criteriaPoints (اليوم «لم يُسجَّل»)،
// وإلا يُعاد تقييم المشروط على الباقي. «الآن»: يبقى attended وcriteria (early وحده يُعاد تقييمه ق92).
function undo(rule, stage, day, paused) {
    const ents = Object.values(day.entries).slice(0, -1);
    if (!ents.length && rule === 'after') return { entries: {} };
    const sel = Object.keys(day.criteria || {});
    const criteria = { ...day.criteria };
    const below = limitMissing(stage, ents, paused).length > 0;
    if (rule === 'now' && Number(criteria.early) > 0 && below) criteria.early = 0;
    if (rule === 'after' && Number(criteria.homeprep) > 0 && below) criteria.homeprep = 0;
    return { attended: true, entries: Object.fromEntries(ents.map((e, i) => ['e' + i, e])), ...(sel.length ? { criteria, criteriaPoints: sumCrit(criteria) } : {}) };
}

// ===== سيناريوهات صفحة المعلم (المواضع كما في tests/teacher-r4-local.test.cjs) =====
function teacherScenarios(rule) {
    const out = {};
    // م1: جديد البقرة 25–27 «ممتاز» + مراجعة 17–24 «جيد» + التحضير (الطالب عند 2:24، ابتدائي)
    { const ents = [entry('new', [2, 25], [2, 27], 'excellent'), entry('review', [2, 17], [2, 24], 'good')];
      const d = makeDay(rule, 'primary', ents, ['homeprep']);
      out.m1 = { newLines: ents[0].lines, reviewLines: ents[1].lines, entriesPoints: r1(ents[0].points + ents[1].points), criteria: d.criteria, dayTotal: dayTotal(d), missing: limitMissing('primary', ents), gradeOk: gradeOk(ents) }; }
    // م2: جديد البقرة 26 (الطالب عند 2:25) «ممتاز» + مراجعة 17–24 «جيد» + التحضير
    { const ents = [entry('new', [2, 26], [2, 26], 'excellent'), entry('review', [2, 17], [2, 24], 'good')];
      const d = makeDay(rule, 'primary', ents, ['homeprep']);
      out.m2 = { newLines: ents[0].lines, entriesPoints: r1(ents[0].points + ents[1].points), criteria: d.criteria, dayTotal: dayTotal(d), missing: limitMissing('primary', ents) };
      // م9: الحد 4 أسطر بدل 8 ← يُحتسب
      out.m9 = { limit4Met: ents[0].lines >= 4 && ents[1].lines >= 15 }; }
    // م3: جديد 25–27 + مراجعة 17–20 (نصف وجه تقريباً)
    { const ents = [entry('new', [2, 25], [2, 27], 'excellent'), entry('review', [2, 17], [2, 20], 'good')];
      out.m3 = { reviewLines: ents[1].lines, criteria: makeDay(rule, 'primary', ents, ['homeprep']).criteria, missing: limitMissing('primary', ents) }; }
    // م7: تسجيلان: (جديد 25 + مراجعة 17–24) ثم جديد 26؛ ثم تراجع عن الثاني
    { const a = [entry('new', [2, 25], [2, 25], 'excellent'), entry('review', [2, 17], [2, 24], 'good')];
      const d1 = makeDay(rule, 'primary', a, ['homeprep']);
      const b = [...a, entry('new', [2, 26], [2, 26], 'excellent')];
      const d2 = makeDay(rule, 'primary', b, ['homeprep']);
      const d3 = undo(rule, 'primary', d2);
      out.m7 = { firstNewLines: a[0].lines, secondNewLines: b[2].lines, totalNewLines: a[0].lines + b[2].lines,
          save1: { criteria: d1.criteria, entriesPoints: r1(a[0].points + a[1].points), dayTotal: dayTotal(d1) },
          save2: { criteria: d2.criteria, entriesPoints: r1(b.reduce((s, e) => s + e.points, 0)), dayTotal: dayTotal(d2) },
          undo2: { criteria: d3.criteria, dayTotal: dayTotal(d3) } }; }
    // م12: جديد 25–29 «جيد» (22.5) + «استوفى المعايير» ← ثم تراجع
    { const ents = [entry('new', [2, 25], [2, 29], 'good')];
      const d = makeDay(rule, 'primary', ents, FULFILL), u = undo(rule, 'primary', d);
      out.m12 = { newPoints: ents[0].points, fulfill: FULFILL, criteria: d.criteria, criteriaPoints: d.criteriaPoints, afterSave: dayTotal(d),
          afterUndo: { day: u, total: dayTotal(u) } }; }
    // م13: (جديد 25–29 «جيد» + استوفى) ثم مراجعة 17–24 «جيد» ← تراجع ← تراجع
    { const a = [entry('new', [2, 25], [2, 29], 'good')];
      const d1 = makeDay(rule, 'primary', a, FULFILL);
      const b = [...a, entry('review', [2, 17], [2, 24], 'good')];
      const d2 = makeDay(rule, 'primary', b, FULFILL);
      const u1 = undo(rule, 'primary', d2), u2 = undo(rule, 'primary', u1);
      out.m13 = { save1: dayTotal(d1), save2: dayTotal(d2), undo1: dayTotal(u1), undo1Attended: u1.attended === true, undo2: dayTotal(u2), undo2Attended: u2.attended === true }; }
    return out;
}

// ===== م16 (أ): board-answer-key — ماجد (أول يوم له اليوم، جديد 22.5) =====
function boardMajed() {
    const m = boardKey.students.find(s => s.id === 'majed');
    const ti = boardKey.days.indexOf(boardKey.today);
    if (m.entries[ti]?.[0] !== 22.5 || m.entries.slice(0, ti).some(x => x !== false)) throw new Error('شكل ماجد في المفتاح تغيّر');
    const others = boardKey.snapshots.monday.asr.filter(r => r.id !== 'majed').map(r => r.points);
    // ترتيب اللوحة: النقاط تنازلياً، المتساوون رتبة واحدة (1 + عدد من يزيد عليه)؛ من نقاطه ≤ 0 خارج اللوحة.
    const rankOf = p => p > 0 ? 1 + others.filter(x => x > p).length : null;
    const saved = { attended: true, entries: { e0: { points: 22.5 } }, criteriaPoints: m.criteria[ti] || 0 };
    const nowUndo = { attended: true, entries: {}, criteriaPoints: m.criteria[ti] || 0 };   // الآن: attended يبقى
    const afterUndo = { entries: {} };                                                     // بعد: «لم يُسجَّل»
    const row = day => { const p = dayTotal(day); return { points: p, week: p, rank: rankOf(p), onBoard: p > 0 }; };   // لا أيام سابقة له: الأسبوع = اليوم
    return { before: row(undefined), afterSave: row(saved), undoNow: row(nowUndo), undoAfter: row(afterUndo) };
}

// ===== م16 (ب): homeprep-answer-key — تسلسل homeprep-local «undo full sequence» لبدر =====
function prepFixtures() {
    const P = { 4: prepKey.pages['4'], 5: prepKey.pages['5'], 6: prepKey.pages['6'] };
    return prepKey.students.map(row => {
        let page = 5; const history = {};
        row.days.forEach((code, i) => {
            if (code === '—') return;
            const date = prepKey.days[i];
            if (code === 'غ') { history[date] = { attended: false, absence: 'unexcused' }; return; }
            const day = history[date] = { attended: true, entries: {}, criteria: {}, criteriaPoints: 0 };
            for (const t of code.split('+')) {
                if (t === 'ض5' || t === '🏠') { const id = t === '🏠' ? 'homeprep' : 'early'; day.criteria[id] = t === '🏠' ? 10 : 5; day.criteriaPoints += day.criteria[id]; }
                else if (t !== 'ح') {
                    const kind = t.startsWith('ج') ? 'new' : 'review';
                    const grade = t === 'جج' ? 'very-good' : ['ج', 'مج'].includes(t) ? 'good' : 'excellent';
                    const spec = P[kind === 'new' ? page++ : 4];
                    day.entries['e' + Object.keys(day.entries).length] = entry(kind, spec.from, spec.to, grade, prepKey.settings);
                }
            }
        });
        return { id: row.id, name: row.name, stage: row.stage, history, row };
    });
}
function prepSequence(rule, limitsOff = false) {
    const list = prepFixtures();
    // فحص ذاتي: نقاط كل يوم والموسم كما في المفتاح (القيم المخزّنة لا يُعاد تقييمها).
    for (const s of list) prepKey.days.forEach((d, i) => { if (dayTotal(s.history[d]) !== s.row.dayPoints[i]) throw new Error(`فحص ذاتي: ${s.name} يوم ${i}`); });
    const T = prepKey.today, week = prepKey.days.slice(3);   // أسبوع اللوحة: الأحد 22 والاثنين 23
    const season = s => r1(Object.values(s.history).reduce((a, d) => a + dayTotal(d), 0));
    const wk = s => r1(week.reduce((a, d) => a + dayTotal(s.history[d]), 0));
    const board = () => {
        const rows = list.filter(s => s.stage === 'primary').map(s => ({ name: s.name, points: season(s) })).filter(r => r.points > 0)
            .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'ar'));
        let rank = 0; return rows.map((r, i) => ({ ...r, rank: (i === 0 || r.points !== rows[i - 1].points) ? (rank = i + 1) : rank }));
    };
    const prepWeek = () => list.filter(s => s.stage === 'primary').map(s => ({ name: s.name, points: r1(week.reduce((a, d) => a + (s.history[d]?.criteria?.homeprep || 0), 0)) }))
        .filter(r => r.points > 0).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'ar'));
    const badr = list[0], stage = limitsOff ? 'none' : 'primary', out = {};
    const ents = () => Object.values(badr.history[T]?.entries || {});
    // (1) تراجع والتحضير المحتسب على تسجيل وحيد: شرط التقدير على الباقي الفارغ يمنع (القائم، يبقى في ل0 (و)).
    out.blockedUndo = (badr.history[T].criteria.homeprep || 0) > 0 && !gradeOk(ents().slice(0, -1), prepKey.settings, 'very-good');
    // (2) إلغاء التحضير والحفظ بلا تسجيل جديد: early المعلَّم يُعاد تقييمه «الآن»، ولا شرط عليه «بعد».
    const before = badr.history[T].criteriaPoints;
    const crit = criteriaFor(rule, stage, ents(), Object.keys(badr.history[T].criteria).filter(id => id !== 'homeprep'));
    badr.history[T] = { ...badr.history[T], criteria: crit, criteriaPoints: sumCrit(crit) };
    out.withoutPrep = { delta: sumCrit(crit) - before, day: dayTotal(badr.history[T]), season: season(badr) };
    // (3) التراجع عن التسجيل الوحيد
    badr.history[T] = undo(rule, stage, badr.history[T]);
    const b3 = board();
    out.after = { day: dayTotal(badr.history[T]), week: wk(badr), season: season(badr), badrRank: b3.find(r => r.name === 'بدر')?.rank ?? null,
        sultanRank: b3.find(r => r.name === 'سلطان').rank, hamzaRank: b3.find(r => r.name === 'حمزة').rank,
        criteria: badr.history[T].criteria ?? null, attended: badr.history[T].attended ?? null, prepBadr: prepWeek().find(r => r.name === 'بدر') || null };
    // (4) إعادة: جديد الصفحة 6 «ممتاز» + التحضير؛ ما بقي معلَّماً من criteria يُختار كما يفتح المعلم (المحفوظ معلَّم).
    const add = entry('new', prepKey.pages['6'].from, prepKey.pages['6'].to, 'excellent', prepKey.settings);
    const keep = Object.keys(badr.history[T].criteria || {});
    const all = [...ents(), add];
    const c4 = criteriaFor(rule, stage, all, [...new Set([...keep, 'homeprep'])]);
    badr.history[T] = { attended: true, entries: Object.fromEntries(all.map((e, i) => ['e' + i, e])), criteria: c4, criteriaPoints: sumCrit(c4) };
    out.restored = { day: dayTotal(badr.history[T]), week: wk(badr), season: season(badr), rank: board()[0].name === 'بدر' ? board()[0].rank : null,
        leader: board()[0].name, prepWeekAsr: prepWeek() };
    return out;
}

function compute() {
    return { teacher: { now: teacherScenarios('now'), after: teacherScenarios('after') }, board: boardMajed(),
        homeprep: { now: prepSequence('now'), after: prepSequence('after'), afterLimitsOff: prepSequence('after', true) } };
}

// ===== إعادة توليد undo في المفتاحين (بالآلية، لا كتابة يدوية) =====
function replaceUndo(file, value, evidence) {
    const buf = fs.readFileSync(file), text = buf.toString('utf8');
    const oldHash = sha(buf);
    const start = text.indexOf('\n  "undo": {');
    if (start < 0 || text.indexOf('\n  "undo": {', start + 1) >= 0) throw new Error('موضع undo غير وحيد: ' + file);
    // نهاية الكتلة: أول سطر «  }» أو «  },» بإزاحة سطرين بعد البداية.
    const endRe = /\n  \},?(?=\n)/g; endRe.lastIndex = start + 1;
    const m = endRe.exec(text); if (!m) throw new Error('نهاية undo');
    const comma = m[0].endsWith(',') ? ',' : '';
    const block = '\n  "undo": ' + JSON.stringify(value, null, 2).replace(/\n/g, '\n  ') + comma;
    const next = text.slice(0, start) + block + text.slice(m.index + m[0].length);
    const a = JSON.parse(text), b = JSON.parse(next);
    const strip = o => { const c = { ...o }; delete c.undo; return JSON.stringify(c); };
    if (strip(a) !== strip(b) || JSON.stringify(b.undo) !== JSON.stringify(value) || Object.keys(a).join() !== Object.keys(b).join()) throw new Error('ما عدا undo تغيّر: ' + file);
    if (evidence) { fs.mkdirSync(evidence, { recursive: true }); fs.writeFileSync(path.join(evidence, path.basename(file, '.json') + '.' + oldHash + '.json'), buf); }
    fs.writeFileSync(file, next);
    return { file: path.relative(root, file).replaceAll('\\', '/'), oldHash, newHash: sha(fs.readFileSync(file)), oldUndo: a.undo, newUndo: value };
}
function writeKeys(evidence) {
    const r = compute();
    // ق158 س2: هاركنس homeprep-local يضبط حد التحضير 0/0، فمفتاحه يُولَّد من البديل afterLimitsOff.
    const b = r.board.undoAfter, h = r.homeprep.afterLimitsOff;
    return [
        replaceUndo(BOARD, { points: b.points, week: b.week, rank: b.rank, onBoard: b.onBoard }, evidence),
        replaceUndo(PREP, { withoutPrep: { delta: h.withoutPrep.delta, day: h.withoutPrep.day, season: h.withoutPrep.season },
            after: { day: h.after.day, week: h.after.week, season: h.after.season, badrRank: h.after.badrRank, sultanRank: h.after.sultanRank, hamzaRank: h.after.hamzaRank },
            restored: { day: h.restored.day, week: h.restored.week, season: h.restored.season, rank: h.restored.rank, prepWeekAsr: h.restored.prepWeekAsr } }, evidence)
    ];
}

module.exports = { compute, entry, lines, limitMissing, LIMITS, FULFILL, dayTotal };
if (require.main === module) {
    const arg = process.argv[2];
    if (arg === '--write-keys') { console.log(JSON.stringify(writeKeys(process.argv[3]), null, 2)); }
    else if (arg === '--json') console.log(JSON.stringify(compute(), null, 2));
    else {
        const r = compute(), t = r.teacher;
        const show = (label, o) => console.log(label.padEnd(34), JSON.stringify(o));
        console.log('== صفحة المعلم (الآن ← بعد) ==');
        for (const k of ['m1', 'm2', 'm3', 'm7', 'm12', 'm13']) { show(k + ' الآن', t.now[k]); show(k + ' بعد', t.after[k]); }
        console.log('== م16 board-answer-key (ماجد) =='); for (const [k, v] of Object.entries(r.board)) show(k, v);
        console.log('== م16 homeprep-answer-key (بدر) =='); for (const [k, v] of Object.entries(r.homeprep)) show(k, v);
    }
}
