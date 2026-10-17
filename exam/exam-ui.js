/*
 * exam-ui.js — شاشة المختبِر للاختبار الشفوي (برنامج المهرة).
 *
 * تُفتح فوق البرنامج كشاشة كاملة: ExamUI.open(host). لا تعرف شيئاً عن «الطلاب» ولا «الموسم»؛
 * يمرّر لها المضيف كل ما تحتاجه:
 *   host.getCandidates() → [{ id, name, sub?, frontier?: { surah, ayah } }]
 *   host.store           → ExamStore (محلي الآن، سحابي لاحقاً)
 *   host.meta / host.lines / host.text → خريطة المصحف وأسطره ونصه (طبعة 1441)
 *   host.readOnly        → الموسم مؤرشف: عرض النتائج فقط
 *   host.onClose / host.onResult (اختياريان)
 * تعتمد على ExamCore (exam-core.js).
 */
(function (global) {
  'use strict';
  const C = global.ExamCore;

  // ═════════════ أدوات ═════════════
  const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  const ar = x => String(x).replace(/[0-9]/g, d => AR_DIGITS[d]).replace(/\./g, '٫');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DIFF = { easy: 'سهل', medium: 'متوسط', hard: 'صعب' };
  const clone = x => JSON.parse(JSON.stringify(x));
  function hijri(ms) {
    try { return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-arab', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ms)); }
    catch (e) { return new Date(ms).toLocaleDateString('ar'); }
  }
  function ago(ms) {
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return 'الآن';
    if (m < 60) return `قبل ${ar(m)} دقيقة`;
    const h = Math.round(m / 60); if (h < 24) return `قبل ${ar(h)} ساعة`;
    return hijri(ms);
  }
  function randomSeed() {
    try { const a = new Uint32Array(1); global.crypto.getRandomValues(a); return a[0] >>> 0; }
    catch (e) { return Math.floor(Math.random() * 4294967296) >>> 0; }
  }

  // ═════════════ عرض صفحة المصحف ═════════════
  // نفس طريقة العارض المراجَع: كل سطر من أسطر طبعة 1441 كما هو، والخط يُضبط لتتسع أعرض الأسطر.
  function createMushaf(meta, lines, textData) {
    const T = textData.text, P = lines.pages;
    const sStart = meta.surahs.map(s => s[0]);
    const surahOf = ai => { let lo = 0, hi = 113; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (sStart[m] <= ai) lo = m; else hi = m - 1; } return lo + 1; };
    const ayahNo = ai => ai - sStart[surahOf(ai) - 1] + 1;
    const name = s => meta.surahs[s - 1][2];
    const isWord = t => /[ء-يٱ-ۓ]/.test(t.replace(/[ۖ-ۜ]/g, ''));
    const juzStart = meta.juz.map(([s, a]) => sStart[s - 1] + a - 1);
    const juzOf = ai => { let k = 0; for (let j = 0; j < 30; j++) if (juzStart[j] <= ai) k = j + 1; return k; };
    // البسملة: نص الفاتحة 1:1، وفي السور التي تنص عليها بيانات الطبعة «بِّسۡمِ» بباء مشدّدة (الشدّة قبل الكسرة كما في نص المجمع)
    const BAS = T[0], BAS_SHADDA = BAS.charAt(0) + 'ّ' + BAS.slice(1);
    const shadda = new Set(lines.basmalaShadda || []);
    const cache = [];
    function chunks(ai) {
      if (cache[ai]) return cache[ai];
      const toks = T[ai].split(/\s+/).filter(Boolean), out = []; let pre = '';
      for (const t of toks) {
        if (isWord(t)) { out.push({ ai, k: out.length, t, pre }); pre = ''; }   // k: رقم الكلمة في الآية (ترقيم المحرك نفسه)
        else if (t.charAt(0) === '۞') pre += t;                  // ۞ علامة الربع: في الهامش
        else if (out.length) out[out.length - 1].t += ' ' + t;          // علامة منفصلة تلحق الكلمة السابقة
      }
      out[out.length - 1].t += ' ۝' + ar(ayahNo(ai));        // ۝ رقم الآية، ملتصق بالكلمة قبله بمسافة لا تنكسر فلا يبدأ به سطر
      return (cache[ai] = out);
    }
    function lineChunks(start, end) {
      const res = []; let ai = start[0], wj = start[1];
      while (ai < end[0] || (ai === end[0] && wj < end[1])) {
        const cs = chunks(ai);
        for (let k = wj; k < cs.length; k++) { if (ai === end[0] && k >= end[1]) return res; res.push(cs[k]); }
        ai++; wj = 0;
      }
      return res;
    }
    const firstText = pi => P[pi].find(Array.isArray);
    function nextTextStart(pi, li) {
      for (let k = li + 1; k < P[pi].length; k++) if (Array.isArray(P[pi][k])) return P[pi][k];
      for (let q = pi + 1; q < 604; q++) { const f = firstText(q); if (f) return f; }
      return [T.length, 0];
    }
    // ترويسة الصفحة: كل سورها (الصفحة ٦٠٤: الإخلاص والفلق والناس) وكل أجزائها إن تغيّر الجزء فيها.
    // آخر آية في الصفحة: ما قبل أول آية في الصفحة التالية، إلا إن كانت تلك تبدأ من وسطها (أي بدأت هنا).
    function heads(p) {
      const pi = p - 1, rows = P[pi], first = firstText(pi), nx = nextTextStart(pi, rows.length - 1);
      const lastAi = nx[1] === 0 ? nx[0] - 1 : nx[0];
      const surs = [], juzs = [];
      for (let ai = first[0]; ai <= lastAi; ai++) { const s = surahOf(ai), j = juzOf(ai); if (!surs.includes(s)) surs.push(s); if (!juzs.includes(j)) juzs.push(j); }
      return { surs, juzs };
    }
    // hl = { from, to, fromWord, toWord } مقطع السؤال المظلَّل: من الآية from (من كلمتها fromWord، والفارغة أولها)
    // إلى الآية to (حتى كلمتها toWord شاملة، والفارغة آخرها)
    const inHL = (hl, c) => {
      if (!hl) return false;
      const x = c.ai * 1e4 + c.k;
      return x >= hl.from * 1e4 + (hl.fromWord || 0) && x <= hl.to * 1e4 + (hl.toWord == null ? 9999 : hl.toWord);
    };
    function build(p, hl) {
      const pi = p - 1, rows = P[pi];
      const { surs, juzs } = heads(p);
      const page = document.createElement('div'); page.className = 'xa-page'; page.dataset.page = p;
      const head = document.createElement('div'); head.className = 'xa-ph';
      head.innerHTML = `<span>سورة ${surs.map(s => esc(name(s))).join('، ')}</span><span>الجزء ${juzs.map(ar).join('، ')}</span>`;
      const body = document.createElement('div'); body.className = 'xa-pb'; body.style.gridTemplateRows = `repeat(${rows.length},1fr)`;
      const foot = document.createElement('div'); foot.className = 'xa-pf'; foot.textContent = ar(p);
      rows.forEach((e, li) => {
        const row = document.createElement('div'); row.className = 'xa-ln';
        if (e === -1) {
          const nx = nextTextStart(pi, li); row.classList.add('ttl');
          const tt = document.createElement('div'); tt.className = 'xa-tt'; tt.textContent = 'سُورَةُ ' + name(surahOf(nx[0])); row.appendChild(tt);
        } else if (e === -2) {
          row.classList.add('bas');
          const s = surahOf(nextTextStart(pi, li)[0]);
          const tx = document.createElement('div'); tx.className = 'xa-tx'; tx.dataset.fixed = '1'; tx.textContent = shadda.has(s) ? BAS_SHADDA : BAS; row.appendChild(tx);
        } else {
          const nx = nextTextStart(pi, li), cs = lineChunks(e, nx);
          const tx = document.createElement('div'); tx.className = 'xa-tx'; tx.dataset.text = '1';
          if (nx[0] >= T.length || (nx[1] === 0 && ayahNo(nx[0]) === 1)) tx.dataset.last = '1';
          // الكلمات المتجاورة بنفس الحال (داخل السؤال أو خارجه) في مقطع واحد ليتصل التظليل بين الكلمات
          let html = '', run = null, buf = [];
          const flush = () => { if (!buf.length) return; html += (html ? ' ' : '') + (run ? `<span class="q">${esc(buf.join(' '))}</span>` : esc(buf.join(' '))); buf = []; };
          cs.forEach(c => { const q = inHL(hl, c); if (q !== run) { flush(); run = q; } buf.push(c.t); });
          flush();
          tx.innerHTML = html;
          if (cs.some(c => inHL(hl, c))) row.classList.add('qrow');
          row.appendChild(tx);
          if (cs.some(c => c.pre.indexOf('۞') >= 0)) { const mk = document.createElement('span'); mk.className = 'xa-mk'; mk.textContent = '۞'; row.appendChild(mk); }
        }
        body.appendChild(row);
      });
      page.append(head, body, foot);
      return page;
    }
    function fit(page) {
      const body = page.querySelector('.xa-pb'); const inner = body.clientWidth; if (!inner) return;
      const tx = [...page.querySelectorAll('.xa-tx[data-text]')], fixed = [...page.querySelectorAll('.xa-tx[data-fixed]')];
      const REF = 100;
      [...tx, ...fixed].forEach(e => { e.style.fontSize = REF + 'px'; e.style.whiteSpace = 'nowrap'; e.style.width = 'auto'; e.style.display = 'inline-block'; });
      const widths = tx.map(e => e.getBoundingClientRect().width);
      const maxW = Math.max(...widths, 1);
      const rowH = body.clientHeight / (body.children.length || 15);
      const fs = Math.min(inner / maxW * REF * 0.982, rowH * 0.80 * (body.children.length > 8 ? 1 : 1.25));
      if (!(fs > 0)) return;   // صفحة لم تُعرض بعد (ارتفاع صفر): لا يُكتب خط بحجم صفر، ويُعاد الضبط مع تغيير المقاس
      tx.forEach((e, i) => {
        e.style.display = 'block'; e.style.whiteSpace = 'normal'; e.style.width = '100%'; e.style.fontSize = fs + 'px';
        const nat = widths[i] * fs / REF;
        e.style.textAlignLast = (e.dataset.last === '1' && nat < inner * 0.92) ? 'center' : 'justify';
      });
      fixed.forEach(e => { e.style.display = 'block'; e.style.whiteSpace = 'normal'; e.style.width = '100%'; e.style.fontSize = fs + 'px'; });
      page.style.setProperty('--xa-fs-title', Math.min(fs * 0.86, rowH * 0.62) + 'px');
    }
    return { build, fit, name, heads, chunks, inHL };
  }

  // ═════════════ الحالة ═════════════
  let R = null, H = null, ix = null, MS = null, S = null, prevOverflow = '', saveTimer = null, resizeTimer = null, toastTimer = null;
  const $ = sel => R.querySelector(sel);

  async function open(host) {
    if (R) return;
    H = host;
    if (!C) throw new Error('exam-core.js غير محمّل');
    ix = ix || C.buildQuranIndex(host.meta, host.lines);
    MS = MS || createMushaf(host.meta, host.lines, host.text);
    S = { view: 'home', template: null, prefs: {}, examiners: [], levels: [], levelsNote: '', drafts: [], results: [], setup: null, preview: null, draft: null, result: null };
    R = document.createElement('div');
    R.className = 'xa'; R.dir = 'rtl'; R.setAttribute('role', 'dialog'); R.setAttribute('aria-modal', 'true'); R.setAttribute('aria-label', 'الاختبار الشفوي');
    R.innerHTML = '<header class="xa-top"></header><nav class="xa-tabs" hidden></nav><main class="xa-main"></main><div class="xa-dock" hidden></div><div class="xa-toast" role="status" aria-live="polite"></div>';
    document.body.appendChild(R);
    prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    R.addEventListener('click', e => run(onClick, e));
    // عناصر القوائم التي تعمل كأزرار (ليست <button>) تستجيب للوحة المفاتيح كما تستجيب للمس
    R.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target;
      if (el && el.getAttribute && el.getAttribute('role') === 'button' && el.dataset && el.dataset.act && el.tagName !== 'BUTTON') { e.preventDefault(); el.click(); }
    });
    R.addEventListener('input', e => run(onInput, e));
    R.addEventListener('change', e => run(onChange, e));
    global.addEventListener('resize', onResize);
    global.addEventListener('popstate', onPop);
    document.addEventListener('visibilitychange', flushSave);
    try { history.pushState({ xa: 1 }, ''); } catch (e) { /* بعض الصفحات تمنع ذلك */ }
    $('.xa-top').innerHTML = topBar('الاختبار الشفوي', 'close');      // زر الإغلاق ظاهر حتى أثناء التحميل
    $('.xa-main').innerHTML = '<div class="xa-wrap"><div class="xa-card xa-muted">جارٍ التحميل…</div></div>';
    try { if (document.fonts && document.fonts.load) await document.fonts.load("24px 'Amiri Quran'", 'بسم'); } catch (e) { }
    if (!R) return;
    await loadData(false);
  }

  // التحميل لا يعلق أبداً على «جارٍ التحميل»: أي فشل (قالب تالف، بيانات تالفة، تخزين معطّل) يظهر بسببه،
  // مع زر إغلاق، وخيار البدء بالقالب الافتراضي دون حذف شيء من المحفوظ.
  async function loadData(useDefault) {
    try {
      const t = useDefault ? null : await H.store.getTemplate(); if (!R) return;
      S.template = C.normalizeTemplate(t || C.defaultTemplate());
      S.prefs = await H.store.getPrefs(); if (!R) return;
      // المستويات: تُنشأ الافتراضية أول مرة (٣٠ مستوى، لكل جزء مستوى من الناس صعوداً) وتعدّلها اللجنة لاحقاً
      // قائمة المحكّمين: يُستبعد العنصر التالف (لا يُحذف من المحفوظ) فلا تتعطل الشاشة
      S.examiners = (await H.store.listExaminers()).filter(e => e && typeof e.id === 'string' && e.id && typeof e.name === 'string' && e.name.trim()); if (!R) return;
      S.levels = await H.store.listLevels(); S.levelsNote = ''; if (!R) return;
      if (!S.levels.length) { S.levels = C.defaultLevels(); await H.store.saveLevels(S.levels); }
      else if (C.validateLevels(ix, S.levels).length) { S.levelsNote = 'المستويات المحفوظة تالفة، فاستُعملت الافتراضية لهذه الجلسة (لم يُحذف المحفوظ).'; S.levels = C.defaultLevels(); }
      await refreshLists(); if (!R) return;
      show('home');
    } catch (err) {
      if (!R) return;
      console.error(err);
      S.view = 'error';
      $('.xa-top').innerHTML = topBar('الاختبار الشفوي', 'close');
      $('.xa-main').innerHTML = `<div class="xa-wrap"><section class="xa-card">
        <h2 class="xa-h2">تعذّر فتح الاختبارات</h2>
        <div class="xa-note bad" role="alert">${esc(err && err.message ? err.message : 'خطأ غير متوقع')}</div>
        <p class="xa-muted">لم يُحذف شيء من المحفوظ على هذا الجهاز.</p>
        ${useDefault ? '' : '<button class="xa-btn pri" data-act="use-default">ابدأ بالقالب الافتراضي</button>'}
      </section></div>`;
    }
  }

  function close(fromPop) {
    if (!R) return;
    flushSave();
    global.removeEventListener('resize', onResize);
    global.removeEventListener('popstate', onPop);
    document.removeEventListener('visibilitychange', flushSave);
    R.remove(); R = null;
    document.body.style.overflow = prevOverflow;
    if (!fromPop) { try { if (history.state && history.state.xa) history.back(); } catch (e) { } }
    if (H && H.onClose) H.onClose();
  }

  function onPop() {
    if (!R) return;
    if (S.view === 'home' || S.view === 'error') { close(true); return; }
    goHome();
    try { history.pushState({ xa: 1 }, ''); } catch (e) { }
  }

  async function run(fn, e) {
    try { await fn(e); }
    catch (err) { console.error(err); toast(err && err.message ? err.message : 'حدث خطأ غير متوقع', 'err'); }
  }

  function toast(msg, kind) {
    const t = $('.xa-toast'); if (!t) return;
    t.textContent = msg; t.className = 'xa-toast on' + (kind === 'err' ? ' err' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { if (R) t.className = 'xa-toast'; }, 2600);
  }

  // كل مسودة ونتيجة تُطبَّع عند القراءة، فما حُفظ قبل التحديث يعمل كالجديد
  async function refreshLists() {
    S.drafts = (await H.store.listDrafts()).map(C.normalizeStoredDraft);
    S.results = (await H.store.listResults()).map(C.normalizeStoredResult);
  }

  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (R) R.querySelectorAll('.xa-page').forEach(p => MS.fit(p)); }, 120);
  }

  // ═════════════ التنقل بين الشاشات ═════════════
  function show(view, keepScroll) {
    S.view = view;
    const top = $('.xa-top'), tabs = $('.xa-tabs'), main = $('.xa-main'), dock = $('.xa-dock');
    const y = main.scrollTop;
    tabs.hidden = true; dock.hidden = true; dock.innerHTML = ''; tabs.innerHTML = '';
    if (view === 'home') { top.innerHTML = topBar('الاختبار الشفوي', 'close'); main.innerHTML = homeView(); }
    else if (view === 'setup') { top.innerHTML = topBar('اختبار جديد', 'home'); main.innerHTML = setupView(); updateRangeSummary(); }
    else if (view === 'preview') { top.innerHTML = topBar('الأسئلة المقترحة', 'back-setup'); main.innerHTML = previewView(); }
    else if (view === 'exam') { renderExam(); return; }
    else if (view === 'result') { top.innerHTML = topBar('نتيجة الاختبار', 'home'); main.innerHTML = resultView(S.result); }
    else if (view === 'settings') { top.innerHTML = topBar('إعدادات الاختبار', 'home'); main.innerHTML = settingsView(); }
    main.scrollTop = keepScroll ? y : 0;
  }
  async function goHome() { flushSave(); await refreshLists(); S.draft = null; show('home'); }

  function topBar(title, back, extra) {
    const btn = back === 'close'
      ? '<button class="xa-icon" data-act="close" aria-label="إغلاق الاختبار الشفوي">✕</button>'
      : `<button class="xa-icon" data-act="${back}" aria-label="رجوع">→</button>`;
    return `${btn}<h1>${esc(title)}</h1>${extra || ''}`;
  }

  // ═════════════ الشاشة الأولى ═════════════
  const RESULTS_PAGE = 50;
  function homeView() {
    const ro = !!H.readOnly;
    const drafts = S.drafts.map(d => {
      const parts = (d.form && d.form.parts) || [];
      const total = parts.reduce((n, p) => n + p.questions.length, 0);
      return `<li class="xa-row">
        <div class="xa-row-main"><b>${esc(d.candidate.name)}</b><span class="xa-muted">${esc(d.rangeLabel || '')}، ${ar(total)} أسئلة، ${esc(ago(d.updatedAt))}</span></div>
        <div class="xa-row-act">
          <button class="xa-btn sm pri" data-act="continue" data-id="${esc(d.id)}" ${ro ? 'disabled' : ''}>متابعة</button>
          <button class="xa-btn sm dng" data-act="del-draft" data-id="${esc(d.id)}" ${ro ? 'disabled' : ''} aria-label="حذف اختبار ${esc(d.candidate.name)}">حذف</button>
        </div></li>`;
    }).join('');
    const shown = S.resultsShown || RESULTS_PAGE, more = S.results.length - shown;
    const results = S.results.slice(0, shown).map(r => `<li class="xa-row xa-click" data-act="open-result" data-id="${esc(r.id)}" tabindex="0" role="button">
        <div class="xa-row-main"><b>${esc(r.candidate.name)}</b><span class="xa-muted">${esc(r.rangeLabel || '')}، ${esc(hijri(r.approvedAt))}${r.attempt > 1 ? `، المحاولة ${ar(r.attempt)}` : ''}</span></div>
        <div class="xa-score-chip ${r.computed.passed === false ? 'fail' : ''}">${ar(r.computed.rounded)}<small>من ${ar(r.computed.totalMax)}</small></div></li>`).join('');
    return `<div class="xa-wrap">
      ${ro ? '<div class="xa-note">هذا الموسم مؤرشف: تُعرض النتائج فقط، ولا يُبدأ اختبار جديد.</div>' : ''}
      <button class="xa-btn pri xa-big" data-act="new" ${ro ? 'disabled' : ''}>＋ اختبار جديد</button>
      ${ro ? '' : '<button class="xa-btn" data-act="settings">إعدادات الاختبار</button>'}
      <section class="xa-card"><h2 class="xa-h2">اختبارات لم تُعتمد بعد</h2>
        ${drafts ? `<ul class="xa-list">${drafts}</ul>` : '<p class="xa-muted">لا يوجد. كل اختبار يُحفظ تلقائياً مع كل ضغطة حتى يُعتمد.</p>'}</section>
      <section class="xa-card"><h2 class="xa-h2">النتائج المعتمدة</h2>
        ${results ? `<ul class="xa-list">${results}</ul>` : '<p class="xa-muted">لا نتائج بعد.</p>'}
        ${more > 0 ? `<button class="xa-btn" data-act="more-results">عرض المزيد (${ar(Math.min(more, RESULTS_PAGE))} من ${ar(more)} متبقية)</button>` : ''}</section>
      <p class="xa-foot">تُحفظ الاختبارات في هذه المرحلة على هذا الجهاز فقط.</p>
      <p class="xa-credit">${CREDIT}</p>
    </div>`;
  }
  // إسناد المصادر (رخصة جداول Tanzil تشترط ذكره ظاهراً)
  const CREDIT = 'نص المصحف وترتيب أسطره: مصحف المدينة النبوية، مجمع الملك فهد لطباعة المصحف الشريف (طبعة ١٤٤١هـ)، جداول السور والأجزاء والأرباع: <a href="https://tanzil.net" target="_blank" rel="noopener">مشروع Tanzil</a> (CC BY 3.0)، خط المصحف: Amiri Quran (رخصة OFL)';

  // ═════════════ اختبار جديد: الطالب والنطاق ═════════════
  function questionSection(t) { return (t || S.template).sections.find(s => s.kind === 'questions' && s.enabled); }
  // قالب الاختبار بالعدد المختار لهذا الطالب: مصدر واحد للخطة المعروضة وفحص الجدوى والتوليد
  const setupTemplate = () => {
    const st = S.setup;
    // عدد خاطئ (فوق الحد مثلاً): خطأ لا عدد افتراضي، فلا تعرض بطاقة الأسئلة عدداً غير الذي سيُرفض
    if (st && st.mode === 'level') { const info = levelSetupInfo(st, S.levels, S.template); if (info.error) throw new Error(info.error); return C.examTemplate(S.template, { questionCount: info.plan.count }); }
    return C.examTemplate(S.template, { questionCount: st && st.questionCount });
  };
  const TYPE_AR = { cumulative: 'تراكمي', levelOnly: 'هذا المستوى فقط' };
  // اختبار مستوى (خالص، ليُفحص آلياً): خطة النوع والعدد، والنطاقان، والعنوان، وجملة تقول للمحكّم ما سيحدث.
  // خطأ (عدد فوق الحد مثلاً) يعود { error } فيظهر مكان الجملة ويُعطَّل التوليد.
  function levelSetupInfo(st, levels, tpl) {
    try {
      const lv = levels[st.lv]; if (!lv) return { error: 'اختر المستوى.' };
      const plan = C.planLevelExam(tpl, { levels, index: st.lv, type: st.lv === 0 ? null : st.etype, count: st.qcount });
      const ranges = C.levelRanges(levels, st.lv, plan.type);
      const label = st.lv === 0 ? lv.name : `${lv.name}، ${TYPE_AR[plan.type]}`;
      const summary = plan.type === 'cumulative'
        ? `من ${levels[0].name} إلى آخر ${lv.name}، ${ar(plan.count)} أسئلة: ${ar(plan.newCount)} من ${lv.name} و${ar(plan.prevCount)} مما قبله`
        : `${lv.name} وحده، ${ar(plan.count)} أسئلة`;
      return { plan, ranges, label, summary };
    } catch (e) { return { error: e.message }; }
  }
  function planText(t) {
    const s = questionSection(t); if (!s) return 'لا قسم أسئلة مفعّل في الورقة';
    const p = s.plan, mix = p.difficulty === 'auto' ? C.autoMix(s.questionCount) : p.difficulty;
    const unit = p.unit === 'lines' ? 'أسطر' : 'آيات';
    return `${ar(s.questionCount)} أسئلة، كل سؤال ${ar(p.length)} ${unit}${p.unit === 'lines' && p.maxOverflow ? ` (يزيد حتى ${ar(p.maxOverflow)} لإتمام الآية)` : ''}، ${ar(mix.easy)} سهل، ${ar(mix.medium)} متوسط، ${ar(mix.hard)} صعب`;
  }
  function newSetup() {
    // lv: ترتيب المستوى، etype: نوع الاختبار (فارغ = الافتراضي من الإعدادات)، qcount: عدد الأسئلة (فارغ = الافتراضي)
    return { cand: null, search: '', mode: 'level', lv: 0, etype: null, qcount: null, juz: [], s1: 1, a1: 1, s2: 1, a2: ix.surahs[0].count, p1: 1, p2: 20 };
  }
  function frontierSpec(f, I) {
    if (!f || !f.surah || !f.ayah) return null;
    const s = f.surah, a = Math.min(f.ayah, I.surahs[s - 1].count);
    const parts = [{ type: 'ayahs', from: [s, 1], to: [s, a] }];
    if (s < 114) parts.push({ type: 'surahs', from: s + 1, to: 114 });
    return { type: 'multi', parts };
  }
  // منطق شاشة النطاق خالص (بلا شاشة)، ليُفحص آلياً: null = النطاق غير مكتمل
  function rangeSpecFor(st, I, levels, tpl) {
    if (st.mode === 'level') { const info = levelSetupInfo(st, levels || [], tpl); return info.ranges ? info.ranges.union : null; }
    if (st.mode === 'mem') return frontierSpec(st.cand && st.cand.frontier, I);
    if (st.mode === 'juz') return st.juz.length ? { type: 'juz', juz: st.juz.slice().sort((a, b) => a - b) } : null;
    if (st.mode === 'surahs') return C.surahAyahSpec(I, st.s1, st.a1, st.s2, st.a2);
    return st.p1 == null || st.p2 == null ? null : { type: 'pages', from: st.p1, to: st.p2 };
  }
  const rangeSpec = st => rangeSpecFor(st, ix, S.levels, S.template);
  // تغيير خانة في شاشة النطاق. لا تُمسّ سورة النهاية حين تتغير سورة البداية (من الناس إلى الملك نطاق صحيح: تنازلي)،
  // والخانة الممسوحة تصير فارغة فلا يبقى رقمها القديم مخفياً في الحساب.
  function setupChange(st, k, v, I) {
    const n = { ...st };
    if (k === 's1') { n.s1 = +v; n.a1 = 1; }
    else if (k === 's2') { n.s2 = +v; n.a2 = I.surahs[n.s2 - 1].count; }
    else if (k === 'a1' || k === 'a2' || k === 'p1' || k === 'p2' || k === 'qcount') { const x = parseInt(v, 10); n[k] = isNaN(x) ? null : x; }
    else if (k === 'lv') { n.lv = +v; if (n.lv === 0) n.etype = null; }
    // تغيير النوع يعيد العدد إلى افتراضيّ النوع الجديد (لكل نوع عدده في الإعدادات)
    else if (k === 'etype') { n.etype = v; n.qcount = null; }
    return n;
  }
  function rangeLabel(st) {
    const nm = s => MS.name(s);
    if (st.mode === 'level') return levelSetupInfo(st, S.levels, S.template).label || '';
    if (st.mode === 'mem') { const f = st.cand.frontier; return `ما حفظه: من الناس إلى ${nm(f.surah)} ${ar(f.ayah)}`; }
    if (st.mode === 'juz') {
      const j = st.juz.slice().sort((a, b) => a - b);
      const contiguous = j.every((x, i) => i === 0 || x === j[i - 1] + 1);
      return j.length === 1 ? `الجزء ${ar(j[0])}` : contiguous ? `الأجزاء ${ar(j[0])}–${ar(j[j.length - 1])}` : `الأجزاء ${j.map(ar).join('، ')}`;
    }
    if (st.mode === 'surahs') return st.s1 === st.s2 ? `سورة ${nm(st.s1)} ${ar(st.a1)}–${ar(st.a2)}`
      : st.s1 > st.s2 ? `من ${nm(st.s1)} إلى ${nm(st.s2)} ${ar(st.a2)}` : `من ${nm(st.s1)} ${ar(st.a1)} إلى ${nm(st.s2)} ${ar(st.a2)}`;
    return `الصفحات ${ar(Math.min(st.p1, st.p2))}–${ar(Math.max(st.p1, st.p2))}`;
  }

  function setupView() {
    const st = S.setup;
    const cands = H.getCandidates();
    let candHtml;
    if (st.cand) {
      candHtml = `<div class="xa-chosen"><div><b>${esc(st.cand.name)}</b>${st.cand.sub ? `<span class="xa-muted">${esc(st.cand.sub)}</span>` : ''}</div>
        <button class="xa-btn sm" data-act="change-cand">تغيير</button></div>`;
    } else {
      const q = st.search.trim();
      const list = cands.filter(c => !q || c.name.indexOf(q) >= 0).slice(0, 60);
      candHtml = `<input class="xa-input" id="xa-cand-search" data-in="cand-search" type="search" placeholder="ابحث باسم الطالب" value="${esc(st.search)}" autocomplete="off" aria-label="ابحث باسم الطالب">
        <ul class="xa-list xa-cands">${list.map(c => `<li class="xa-row xa-click" data-act="pick-cand" data-id="${esc(c.id)}" tabindex="0" role="button"><div class="xa-row-main"><b>${esc(c.name)}</b>${c.sub ? `<span class="xa-muted">${esc(c.sub)}</span>` : ''}</div></li>`).join('') ||
          `<li class="xa-muted xa-pad">${cands.length ? 'لا اسم مطابق' : 'لا طلاب في هذا الموسم'}</li>`}</ul>`;
    }
    const hasMem = !!(st.cand && st.cand.frontier);
    const modes = [['level', 'مستوى', S.levels.length > 0], ['mem', 'ما حفظه', hasMem], ['juz', 'أجزاء', true], ['surahs', 'سور وآيات', true], ['pages', 'صفحات', true]].filter(m => m[2]);
    const surOpts = sel => ix.surahs.map(s => `<option value="${s.number}" ${s.number === sel ? 'selected' : ''}>${ar(s.number)}. ${esc(s.name)}</option>`).join('');
    let rangeBody = '';
    if (st.mode === 'level') {
      const info = levelSetupInfo(st, S.levels, S.template), et = S.template.examType, type = info.plan ? info.plan.type : (st.etype || et.default);
      rangeBody = `<div class="xa-grid2">
        <label class="xa-fld"><span>المستوى</span><select id="xa-lv" data-in="lv">${S.levels.map((l, i) => `<option value="${i}" ${i === st.lv ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
        <label class="xa-fld"><span>عدد الأسئلة</span><input id="xa-qcount" data-in="qcount" type="number" inputmode="numeric" min="1" max="${et.maxQuestions}" placeholder="${ar((st.lv === 0 ? 'levelOnly' : (st.etype || et.default)) === 'levelOnly' ? et.levelOnlyCount : et.cumulativeCount)}" value="${st.qcount != null ? st.qcount : ''}"></label></div>
        ${st.lv > 0 ? `<div class="xa-seg" role="radiogroup" aria-label="نوع الاختبار">${['cumulative', 'levelOnly'].map(t => `<button role="radio" class="${type === t ? 'on' : ''}" aria-checked="${type === t}" data-act="etype" data-t="${t}">${TYPE_AR[t]}</button>`).join('')}</div>` : ''}
        <p class="xa-muted" id="xa-level-sum">${esc(info.summary || '')}</p>
        ${S.levelsNote ? `<div class="xa-note">${esc(S.levelsNote)}</div>` : ''}`;
    } else if (st.mode === 'mem') rangeBody = `<p class="xa-muted">حسب آخر سرد مسجّل له في البرنامج: من سورة الناس إلى سورة ${esc(MS.name(st.cand.frontier.surah))} آية ${ar(st.cand.frontier.ayah)}.</p>`;
    else if (st.mode === 'juz') rangeBody = `<div class="xa-juz">${Array.from({ length: 30 }, (_, i) => i + 1).map(j => `<button class="xa-jz ${st.juz.includes(j) ? 'on' : ''}" data-act="juz" data-j="${j}" aria-pressed="${st.juz.includes(j)}" aria-label="الجزء ${j}">${ar(j)}</button>`).join('')}</div>`;
    else if (st.mode === 'surahs') rangeBody = `<div class="xa-grid2">
        <label class="xa-fld"><span>من سورة</span><select id="xa-s1" data-in="s1">${surOpts(st.s1)}</select></label>
        ${st.s1 > st.s2 ? '<div class="xa-fld"><span>آية</span><span class="xa-muted">السورة كاملة</span></div>'
          : `<label class="xa-fld"><span>آية</span><input id="xa-a1" data-in="a1" type="number" inputmode="numeric" min="1" max="${ix.surahs[st.s1 - 1].count}" value="${st.a1 == null ? '' : st.a1}"></label>`}
        <label class="xa-fld"><span>إلى سورة</span><select id="xa-s2" data-in="s2">${surOpts(st.s2)}</select></label>
        <label class="xa-fld"><span>آية</span><input id="xa-a2" data-in="a2" type="number" inputmode="numeric" min="1" max="${ix.surahs[st.s2 - 1].count}" value="${st.a2 == null ? '' : st.a2}"></label></div>`;
    else rangeBody = `<div class="xa-grid2">
        <label class="xa-fld"><span>من صفحة</span><input id="xa-p1" data-in="p1" type="number" inputmode="numeric" min="1" max="604" value="${st.p1 == null ? '' : st.p1}"></label>
        <label class="xa-fld"><span>إلى صفحة</span><input id="xa-p2" data-in="p2" type="number" inputmode="numeric" min="1" max="604" value="${st.p2 == null ? '' : st.p2}"></label></div>`;
    return `<div class="xa-wrap">
      <section class="xa-card"><h2 class="xa-h2">١. الطالب</h2>${candHtml}</section>
      <section class="xa-card"><h2 class="xa-h2">٢. نطاق الاختبار</h2>
        <div class="xa-seg" role="tablist">${modes.map(m => `<button role="tab" class="${st.mode === m[0] ? 'on' : ''}" aria-selected="${st.mode === m[0]}" data-act="mode" data-m="${m[0]}">${m[1]}</button>`).join('')}</div>
        ${rangeBody}
        <p class="xa-sum" id="xa-range-sum"></p></section>
      <section class="xa-card"><h2 class="xa-h2">٣. الأسئلة</h2><p class="xa-muted" id="xa-plan">${esc(safePlanText())}</p>
        <p class="xa-foot">تُعدَّل هذه القيم من إعدادات الاختبار.</p></section>
      <button class="xa-btn pri xa-big" id="xa-gen" data-act="gen">ولّد الأسئلة</button>
    </div>`;
  }

  const safePlanText = () => { try { return planText(setupTemplate()); } catch (e) { return e.message; } };
  // ملخص النطاق وفحص الجدوى يتحدثان مع كل تغيير
  function updateRangeSummary() {
    const out = $('#xa-range-sum'), gen = $('#xa-gen'); if (!out) return;
    const st = S.setup;
    let ok = false, msg = '';
    const pl = $('#xa-plan'); if (pl) pl.textContent = safePlanText();
    try {
      const info = st.mode === 'level' ? levelSetupInfo(st, S.levels, S.template) : null;
      if (info) { const ls = $('#xa-level-sum'); if (ls) ls.textContent = info.summary || ''; }
      const spec = rangeSpec(st);
      if (info && info.error) msg = info.error;
      else if (!spec) msg = st.mode === 'juz' ? 'اختر جزءاً واحداً على الأقل.' : 'حدد النطاق.';
      else {
        const R0 = C.resolveRange(ix, spec);
        // كل أقسام الأسئلة لا الأول وحده؛ والمستوى التراكمي بنطاقيه منفصلين كما يُولَّد
        const f = info ? C.checkLevelFeasibility(ix, S.template, { levels: S.levels, index: st.lv, type: st.lv === 0 ? null : st.etype, count: st.qcount }) : C.checkFormFeasibility(ix, R0, setupTemplate());
        msg = `النطاق: ${ar(R0.ayahs)} آية، ${ar(R0.lines)} سطراً.` + (f.ok ? '' : ' ' + f.message);
        ok = f.ok;
      }
    } catch (e) { msg = e.message; }
    out.textContent = msg; out.classList.toggle('bad', !ok);
    if (gen) gen.disabled = !(ok && st.cand);
  }

  // ═════════════ الأسئلة المقترحة ═════════════
  async function generate(newSeed) {
    const st = S.setup;
    const spec = rangeSpec(st);
    const used = await H.store.usedExtents(st.cand.id);
    // مواضعه السابقة كما يعيدها التخزين (بالسورة والآية وحدّي الكلمة، مع تاريخ المحاولة ورقمها) يوحّدها المحرك
    const exclude = used;
    const seed = newSeed != null ? newSeed : randomSeed();   // البذرة صفر صالحة
    if (st.mode === 'level') {
      // اختبار مستوى: المحرك يبني القالب بعدده الفعلي ويوزّع الأسئلة بين المستوى الجديد وما قبله
      const form = C.generateLevelForm(ix, S.template, { levels: S.levels, index: st.lv, type: st.lv === 0 ? null : st.etype, count: st.qcount, seed, exclude });
      S.preview = { form, spec: form.source, tpl: form.template, label: rangeLabel(st), excluded: used.length, levelPlan: form.levelPlan };
      return show('preview');
    }
    // قالب هذا الاختبار بعدده الفعلي: منه يُولَّد، ومنه تُنشأ العدّادات، وهو الذي يُجمَّد في المسودة
    const tpl = setupTemplate();
    const form = C.generateForm(ix, tpl, { range: spec, seed, exclude });
    S.preview = { form, spec, tpl, label: rangeLabel(st), excluded: used.length, levelPlan: null };
    show('preview');
  }
  // موضع السؤال للعرض؛ والنتيجة القديمة المختصرة (بلا صفحة) تُعرض بالسورة والآية فقط
  function qLocWith(q, name) {
    const [s1, a1] = q.from, [s2, a2] = q.to;
    const w = s1 === s2 ? `${name(s1)} ${ar(a1)}${a2 !== a1 ? '–' + ar(a2) : ''}` : `${name(s1)} ${ar(a1)} ← ${name(s2)} ${ar(a2)}`;
    return q.start && q.end ? `${w}، ص${ar(q.start.page)} س${ar(q.start.line)}${q.end.page !== q.start.page ? ` ← ص${ar(q.end.page)}` : ''}` : w;
  }
  const qLoc = q => qLocWith(q, MS.name);
  function previewView() {
    const P0 = S.preview, f = P0.form;
    const items = f.parts.map(part => part.questions.map(q => `<li class="xa-q">
        <span class="xa-qn">${ar(q.n)}</span>
        <div class="xa-row-main"><b>${esc(qLoc(q))}</b>${wordBoundsLine(q)}
          <span class="xa-muted">${ar(q.length.actual)} ${q.length.unit === 'lines' ? 'أسطر' : 'آيات'}${q.notes.length ? '، ' + esc(q.notes.join('؛ ')) : ''}</span></div>
        <span class="xa-pill ${q.difficulty}">${DIFF[q.difficulty]}</span></li>`).join('')).join('');
    const rep = f.parts.map(p => p.report);
    const errors = rep.flatMap(r => r.errors), subs = rep.flatMap(r => r.substitutions), warns = rep.flatMap(r => r.warnings);
    return `<div class="xa-wrap">
      <section class="xa-card"><div class="xa-chosen"><div><b>${esc(S.setup.cand.name)}</b><span class="xa-muted">${esc(P0.label)}</span></div></div></section>
      ${errors.length ? `<div class="xa-note bad">${errors.map(esc).join('<br>')}</div>` : ''}
      ${items ? `<section class="xa-card"><h2 class="xa-h2">الأسئلة</h2><ol class="xa-list">${items}</ol></section>` : ''}
      ${subs.length || warns.length || P0.excluded ? `<div class="xa-note">${[
        ...subs.map(s => s.note), ...warns, ...(P0.excluded ? [rep.some(r => r.repeated) ? `استُبعدت مواضع أسئلته السابقة (${ar(P0.excluded)} سؤالاً) ما أمكن، وكُرّر بعضها لأن المواضع الجديدة نفدت.` : `استُبعدت مواضع أسئلته السابقة (${ar(P0.excluded)} سؤالاً) ليأخذ أسئلة مختلفة.`] : [])].map(esc).join('<br>')}</div>` : ''}
      <div class="xa-actions">
        <button class="xa-btn" data-act="regen">أسئلة أخرى</button>
        <button class="xa-btn pri" data-act="start" ${f.ok && f.questions.length ? '' : 'disabled'}>ابدأ الاختبار</button>
      </div>
    </div>`;
  }

  async function startExam() {
    const f = S.preview.form; if (!f.ok) return;
    const cand = S.setup.cand;
    const attempts = await H.store.attemptsOf(cand.id);
    const now = Date.now(), lp = S.preview.levelPlan;
    const { template: _t, levelPlan: _l, ...formOnly } = f;   // القالب يُحفظ مرة واحدة (templateSnapshot)
    const draft = {
      id: H.store.newId('d'), schema: 2,
      candidate: { id: cand.id, name: cand.name, source: H.candidateSource || 'almahra' },
      attempt: attempts.length + 1, createdAt: now, updatedAt: now,
      templateSnapshot: clone(S.preview.tpl), form: clone(C.lockForm(formOnly)),
      rangeSpec: S.preview.spec, rangeLabel: S.preview.label,
      // المستويات التي اختُبر فيها ونوع الاختبار يُحفظان مع النتيجة كما كانا يوم الاختبار
      levels: lp ? clone(lp.levels) : null,
      examType: lp ? { type: lp.type, count: lp.count, newCount: lp.newCount, got: clone(lp.got) } : null,   // got: التوزيع الفعلي
      counters: C.newCounters(S.preview.tpl), log: [], tab: null,
      // آخر اختيار على هذا الجهاز: معرّفات من القائمة (والقديم: أسماء)
      examiners: lastExaminers().slice(0, S.template.examinerSlots.length)
    };
    draft.tab = tabsOf(draft)[0].key;
    await H.store.saveDraft(draft);
    S.draft = draft; S.preview = null;
    show('exam');
  }

  // ═════════════ أثناء الاختبار ═════════════
  function tabsOf(d) {
    const t = d.templateSnapshot, out = [];
    const qSecs = t.sections.filter(s => s.kind === 'questions' && s.enabled);
    qSecs.forEach(s => {
      const part = d.form.parts.find(p => p.sectionId === s.id);
      (part ? part.questions : []).forEach((q, i) => out.push({ key: `q:${s.id}:${i}`, label: qSecs.length > 1 ? `${s.name} ${ar(i + 1)}` : `س${ar(i + 1)}`, kind: 'q', sec: s, i, q }));
    });
    t.sections.filter(s => s.kind === 'checklist' && s.enabled).forEach(s => out.push({ key: `c:${s.id}`, label: s.name, kind: 'c', sec: s }));
    out.push({ key: 'review', label: 'المراجعة', kind: 'r' });
    return out;
  }

  // keep = إعادة رسم بعد ضغطة: تبقى الصفحات المرسومة وموضع التمرير كما هما
  function renderExam(keep) {
    const d = S.draft, res = C.computeResult(d.templateSnapshot, d.counters);
    const mainEl = $('.xa-main'), y = mainEl.scrollTop;
    let oldPages = null;
    if (keep) { const p = $('#xa-pages'); if (p) { oldPages = p; p.remove(); } }
    const tabs = tabsOf(d), cur = tabs.find(t => t.key === d.tab) || tabs[0];
    d.tab = cur.key;   // تبويب محفوظ لم يعد موجوداً (مسودة قديمة): يُصحَّح، فلا تُسجَّل الأخطاء على سؤال غير معروض
    const totalTxt = `${ar(res.total)} / ${ar(res.totalMax)}`;
    $('.xa-top').innerHTML = topBar(d.candidate.name, 'home', `<span class="xa-total" aria-live="polite" title="المجموع قبل التقريب">${totalTxt}</span>`);
    const tabsEl = $('.xa-tabs'); tabsEl.hidden = false;
    tabsEl.innerHTML = tabs.map(t => {
      let small = '', bad = false;
      if (t.kind === 'q') { const r = res.sections.find(s => s.id === t.sec.id).questions[t.i]; small = r.cancelled ? 'ملغى' : ar(r.score); bad = r.cancelled; }
      else if (t.kind === 'c') small = ar(res.sections.find(s => s.id === t.sec.id).score);
      else small = ar(res.rounded);
      return `<button class="xa-tab ${t.key === cur.key ? 'on' : ''} ${bad ? 'bad' : ''}" data-act="tab" data-t="${esc(t.key)}" aria-current="${t.key === cur.key}">${esc(t.label)}<small>${small}</small></button>`;
    }).join('');
    const main = $('.xa-main'), dock = $('.xa-dock');
    const idx = tabs.indexOf(cur);
    const nav = `<div class="xa-nav">
      <button class="xa-btn" data-act="prev" ${idx === 0 ? 'disabled' : ''}>→ السابق</button>
      <button class="xa-btn" data-act="undo" ${d.log.length ? '' : 'disabled'}>↶ تراجع</button>
      ${cur.kind === 'r' ? '' : `<button class="xa-btn" data-act="next">التالي ←</button>`}</div>`;
    dock.hidden = false;
    if (cur.kind === 'q') {
      const r = res.sections.find(s => s.id === cur.sec.id).questions[cur.i];
      const cnt = d.counters.sections[cur.sec.id].questions[cur.i];
      main.innerHTML = questionView(cur, r);
      dock.innerHTML = `<div class="xa-deds">${cur.sec.deductions.filter(x => x.enabled).map(x => {
        const rule = cur.sec.cancelRules.find(cr => cr.enabled && cr.counter === x.id);
        const carry = C.describeCarry(d.templateSnapshot, x);
        const sub = x.value ? `−${ar(x.value)}` : (carry ? carry.text : '');
        return `<button class="xa-ded d-${esc(x.id)}" data-act="ded" data-d="${esc(x.id)}" aria-label="${esc(x.name)}: ${cnt[x.id] || 0}${rule ? `، يُلغى السؤال بعد ${rule.over}` : ''}">
          <span class="xa-ded-n">${ar(cnt[x.id] || 0)}</span><b>${esc(x.name)}</b><small>${sub}${rule ? `، الحد ${ar(rule.over)}` : ''}</small></button>`;
      }).join('')}</div>${nav}`;
      if (oldPages) $('#xa-pages').replaceWith(oldPages); else mountPages(cur.q);   // mountPages ينزل إلى المقطع المظلَّل
    } else if (cur.kind === 'c') {
      main.innerHTML = checklistView(cur, res);
      dock.innerHTML = nav;
    } else {
      main.innerHTML = reviewView(res);
      dock.innerHTML = nav;
    }
    if (keep) main.scrollTop = y; else if (cur.kind !== 'q') main.scrollTop = 0;
  }

  // سؤال يبدأ أو يقف في وسط آية طويلة: يُنبَّه المحكّم بكلمات البداية والوقف من المصحف نفسه
  function wordBoundsText(q, chunksOf) {
    const out = [];
    if (q.fromWord) out.push(`ابدأ من: «${chunksOf(q.fromAbs).slice(q.fromWord, q.fromWord + 3).map(c => c.t).join(' ')}…»`);
    if (q.toWord != null) out.push(`قف عند: «…${chunksOf(q.toAbs).slice(Math.max(0, q.toWord - 2), q.toWord + 1).map(c => c.t).join(' ')}»`);
    return out;
  }
  const wordBounds = q => { const t = wordBoundsText(q, MS.chunks); return t.length ? `<div class="xa-note">${t.map(esc).join('<br>')}</div>` : ''; };
  // في القوائم (المعاينة والنتيجة): سطر صغير، فلا يتشابه سؤالان من البداية نفسها إلى وقفين مختلفين
  const wordBoundsLine = q => { const t = q.fromAbs != null ? wordBoundsText(q, MS.chunks) : []; return t.length ? `<small class="xa-muted xa-wb">${esc(t.join('، '))}</small>` : ''; };

  function questionView(tab, r) {
    const q = tab.q, sec = tab.sec;
    const parts = sec.deductions.filter(x => x.enabled && x.value).map(x => {
      const n = S.draft.counters.sections[sec.id].questions[tab.i][x.id] || 0; return n ? `${esc(x.name)} ${ar(n)} × ${ar(x.value)}` : '';
    }).filter(Boolean);
    return `<div class="xa-wrap">
      <section class="xa-card xa-qhead">
        <div class="xa-qtitle"><b>السؤال ${ar(tab.i + 1)} من ${ar(S.draft.form.parts.find(p => p.sectionId === sec.id).questions.length)}</b><span class="xa-pill ${q.difficulty}">${DIFF[q.difficulty]}</span></div>
        <div class="xa-muted">${esc(qLoc(q))}${q.notes.length ? '، ' + esc(q.notes.join('؛ ')) : ''}</div>
        ${wordBounds(q)}
        <div class="xa-qscore ${r.cancelled ? 'bad' : ''}"><span>درجة السؤال</span><b>${ar(r.score)}</b><span>من ${ar(r.max)}</span>${parts.length ? `<small>${parts.join(' + ')}</small>` : ''}</div>
        ${r.cancelled ? `<div class="xa-note bad" role="alert"><b>أُلغيت درجة هذا السؤال:</b> ${esc(r.cancelReasons.join('، '))}.</div>` : ''}
      </section>
      <div class="xa-pages" id="xa-pages"></div>
    </div>`;
  }

  function mountPages(q) {
    const box = $('#xa-pages'); if (!box) return;
    const hl = { from: q.fromAbs, to: q.toAbs, fromWord: q.fromWord, toWord: q.toWord };
    for (let p = q.start.page; p <= q.end.page; p++) { const pg = MS.build(p, hl); box.appendChild(pg); MS.fit(pg); }
    const first = box.querySelector('.q');
    if (first) { const row = first.closest('.xa-ln'); const main = $('.xa-main'); main.scrollTop = Math.max(0, row.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - 90); }
  }

  function checklistView(tab, res) {
    const sec = tab.sec, rs = res.sections.find(s => s.id === sec.id);
    const items = sec.groups.map(g => {
      const its = g.items.filter(it => it.enabled);
      if (!its.length) return '';
      return `${g.name ? `<h3 class="xa-h3">${esc(g.name)}</h3>` : ''}<div class="xa-items">${its.map(it => {
        const row = rs.items.find(x => x.id === it.id);
        return `<button class="xa-item ${row.repeats ? 'has' : ''}" data-act="item" data-s="${esc(sec.id)}" data-i="${esc(it.id)}" aria-label="${esc(it.name)}: ${row.repeats}">
          <b>${esc(it.name)}</b><span class="xa-item-n">${ar(row.repeats)}</span>${row.carried ? `<small>منها ${ar(row.carried)} من أسئلة الحفظ</small>` : ''}</button>`;
      }).join('')}</div>`;
    }).join('');
    return `<div class="xa-wrap">
      <section class="xa-card"><div class="xa-qtitle"><b>${esc(sec.name)}</b></div>
        <div class="xa-qscore"><span>الدرجة</span><b>${ar(rs.score)}</b><span>من ${ar(rs.max)}</span><small>كل خطأ يحسم ${ar(sec.perRepeat)}</small></div></section>
      <section class="xa-card">${items}<p class="xa-foot">اضغط العنصر كلما تكرر الخطأ.</p></section></div>`;
  }

  function reviewView(res) {
    const d = S.draft, t = d.templateSnapshot;
    const rows = res.sections.filter(s => s.enabled).map(s => `<tr><th>${esc(s.name)}${s.questionsMax != null ? `<small class="xa-muted"> (${ar(s.questionsTotal)} من ${ar(s.questionsMax)})</small>` : ''}</th><td>${ar(s.score)}</td><td>${ar(s.max)}</td></tr>`).join('');
    const grade = res.grade == null ? '<span class="xa-muted">لم يُضبط سلّم التقدير بعد</span>' : `<b class="${res.passed ? 'ok' : 'bad'}">${esc(res.grade)}</b>`;
    const slots = t.examinerSlots.map((lab, i) => `<label class="xa-fld"><span>${esc(lab)}</span><select class="xa-input" id="xa-ex-${i}" data-in="examiner" data-i="${i}">${
      examinerOptions(d.examiners[i], S.examiners).map(o => `<option value="${esc(o.value)}" ${o.selected ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>`).join('')
      + (S.examiners.length ? '' : '<p class="xa-muted">لا محكّمين في القائمة بعد: اختر «＋ محكّم جديد» مرة واحدة لكل محكّم، ثم تختار اسمه في كل اختبار.</p>');
    return `<div class="xa-wrap">
      <section class="xa-card"><h2 class="xa-h2">النتيجة</h2>
        <table class="xa-table"><thead><tr><th>القسم</th><td>الدرجة</td><td>من</td></tr></thead><tbody>${rows}</tbody>
          <tfoot><tr><th>المجموع</th><td>${ar(res.total)}${res.rounded !== res.total ? ` ← <b>${ar(res.rounded)}</b>` : ''}</td><td>${ar(res.totalMax)}</td></tr></tfoot></table>
        <div class="xa-kv"><span>النسبة</span><b>${ar(res.percent)}٪</b></div>
        <div class="xa-kv"><span>التقدير</span>${grade}</div></section>
      <section class="xa-card"><h2 class="xa-h2">المحكّمون</h2><div class="xa-grid2">${slots}</div></section>
      <button class="xa-btn pri xa-big" data-act="approve">اعتماد النتيجة</button>
      <p class="xa-foot">بعد الاعتماد تُقفل النتيجة ولا تُعدَّل، وتُحفظ معها نسخة الورقة التي طُبّقت.</p>
    </div>`;
  }

  // ═════════════ الإعدادات (منطق خالص يُفحص آلياً) ═════════════
  // كل إعداد مفتاح واحد يُقرأ ويُكتب في القالب. اللحن الجلي: يُحسم في الترتيل (قيمة عنصره)، ويلغي السؤال بعد حدّه،
  // وترحيل لحن السؤال الملغى. قالب بلا لحن جلي يُرحَّل يعيد null ولا تظهر بطاقته.
  function lahnParts(t) {
    const s = t.sections.find(x => x.kind === 'questions' && x.enabled !== false); if (!s) return null;
    const d = (s.deductions || []).find(x => x.carryTo && x.carryTo.item === 'lahnJali'); if (!d) return null;
    const rule = (s.cancelRules || []).find(r => r.counter === d.id);
    const target = t.sections.find(x => x.id === d.carryTo.section);
    const item = target && target.groups ? target.groups.flatMap(g => g.items).find(it => it.id === d.carryTo.item) : null;
    return rule && item ? { s, d, rule, target, item } : null;
  }
  const qSec = t => t.sections.find(x => x.kind === 'questions' && x.enabled !== false);
  // رقم يكتبه المشرف بالأرقام العربية أو الغربية، وبفاصلة عشرية عربية أو نقطة؛ الفارغ أو غير الرقم ← NaN
  const parseNum = raw => { const s = String(raw == null ? '' : raw).trim().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace('٫', '.'); return s === '' ? NaN : Number(s); };
  const lahnSet = f => (t, v) => { const p = lahnParts(t); if (!p) throw new Error('لا لحن جلي يُرحَّل في هذه الورقة'); f(p, v); };
  const SETTINGS = {
    'lahn.value': { kind: 'num', get: t => { const p = lahnParts(t); return p && (p.item.value != null ? p.item.value : p.target.perRepeat); }, set: lahnSet((p, v) => { p.item.value = v; }) },
    'lahn.over': { kind: 'int', get: t => { const p = lahnParts(t); return p && p.rule.over; }, set: lahnSet((p, v) => { p.rule.over = v; }) },
    'lahn.carryCancelled': { kind: 'bool', get: t => { const p = lahnParts(t); return p && p.d.carryTo.carryCancelled === true; }, set: lahnSet((p, v) => { p.d.carryTo.carryCancelled = v; }) },
    // العدد عبر examTemplate: توزيع صعوبة ثابت يُعاد بالنسبة نفسها للعدد الجديد (وإلا رُفض كل عدد غير الأصلي)
    'q.count': { kind: 'int', get: t => qSec(t).questionCount, replace: (t, v) => C.examTemplate(t, { questionCount: v }) },
    'q.length': { kind: 'int', get: t => qSec(t).plan.length, set: (t, v) => { qSec(t).plan.length = v; } },
    'q.overflow': { kind: 'int', get: t => qSec(t).plan.maxOverflow, set: (t, v) => { qSec(t).plan.maxOverflow = v; } },
    'q.midAyah': { kind: 'bool', get: t => qSec(t).plan.allowMidAyah === true, set: (t, v) => { qSec(t).plan.allowMidAyah = v; } },
    'q.repeat': { kind: 'bool', get: t => qSec(t).plan.allowRepeatWhenExhausted === true, set: (t, v) => { qSec(t).plan.allowRepeatWhenExhausted = v; } },
    'et.default': { kind: 'enum', values: ['cumulative', 'levelOnly'], get: t => t.examType.default, set: (t, v) => { t.examType.default = v; } },
    'et.levelOnlyCount': { kind: 'int', get: t => t.examType.levelOnlyCount, set: (t, v) => { t.examType.levelOnlyCount = v; } },
    'et.cumulativeCount': { kind: 'int', get: t => t.examType.cumulativeCount, set: (t, v) => { t.examType.cumulativeCount = v; } },
    'et.cumulativeNew': { kind: 'int', get: t => t.examType.cumulativeNew, set: (t, v) => { t.examType.cumulativeNew = v; } },
    'et.maxQuestions': { kind: 'int', get: t => t.examType.maxQuestions, set: (t, v) => { t.examType.maxQuestions = v; } },
    'round.mode': { kind: 'enum', values: ['nearest', 'up', 'down', 'none'], get: t => t.rounding.mode, set: (t, v) => { t.rounding.mode = v; } },
    'round.step': { kind: 'num', get: t => t.rounding.step, set: (t, v) => { t.rounding.step = v; } }
  };
  const readSetting = (t, key) => SETTINGS[key].get(t);
  // تغيير إعداد: يعيد { tpl، errors }. الخطأ لا يُكتب (يعود القالب نفسه) ويُذكر سببه بالعربية، مسبوقاً بأنه لم يُقبل
  function applySetting(t, key, raw) {
    const def = SETTINGS[key]; if (!def) return { tpl: t, errors: ['إعداد غير معروف'] };
    let v;
    if (def.kind === 'bool') v = raw === true || raw === 'yes';
    else if (def.kind === 'enum') { if (!def.values.includes(raw)) return { tpl: t, errors: ['اختيار غير صالح'] }; v = raw; }
    else { v = parseNum(raw); if (!isFinite(v)) return { tpl: t, errors: ['اكتب رقماً'] }; if (def.kind === 'int' && !Number.isInteger(v)) return { tpl: t, errors: ['عدد صحيح بلا كسور'] }; }
    let n;
    try { if (def.replace) n = def.replace(t, v); else { n = clone(t); def.set(n, v); } }
    catch (e) { return { tpl: t, errors: ['لم يُقبل: ' + String(e.message).replace(/^القالب غير سليم:\n- /, '').split('\n- ')[0]] }; }
    const errors = C.validateTemplate(n);
    return errors.length ? { tpl: t, errors: ['لم يُقبل: ' + errors[0]] } : { tpl: C.normalizeTemplate(n), errors: [] };
  }
  // أمثلة حيّة يحسبها المحرك نفسه بالإعدادات الحالية (لا نصوص مكتوبة)
  function settingsExamples(t, levels, I = ix) {
    const out = {};
    const p = lahnParts(t);
    if (p) {
      const run = n => { const c = C.newCounters(t); c.sections[p.s.id].questions[0][p.d.id] = n; const r = C.computeResult(t, c); return { tr: r.sections.find(x => x.id === p.target.id).deducted }; };
      const over = p.rule.over, a = run(over), b = run(over + 1);
      const tw = n => (n === 2 ? 'لحنان' : `لحن ${ar(n)} ${n > 2 && n < 11 ? 'مرات' : 'مرة'}`);
      out.lahn = `${tw(over)} في سؤال ← السؤال كما هو، ويُحسم من الترتيل ${ar(a.tr)}\n`
        + `${tw(over + 1)} في سؤال ← السؤال صفر، ${b.tr ? `ويُحسم من الترتيل أيضاً ${ar(b.tr)}` : 'والترتيل لا يتأثر'}`;
    }
    const lines = [];
    try { lines.push(planText(t)); } catch (e) { lines.push(e.message); }
    // أثر «الآيات الطويلة» و«التكرار» من المحرك: كم سؤالاً يمسّ آية الدَّين، وهل تُعاد سورة الملك لطالب سُئل فيها كلها
    if (I) {
      try {
        const s = qSec(t), a = I.abs(2, 282), cs = C.buildCandidates(I, C.resolveRange(I, { type: 'ayahs', from: [2, 275], to: [2, 286] }), s.plan).cands.filter(q => q.from <= a && a <= q.to);
        lines.push(cs.length ? `آية الدَّين (١٥ سطراً): يمسّها ${ar(cs.length)} ${cs.length === 1 ? 'سؤال' : 'أسئلة'} ممكنة${cs.some(q => q.fromWord) ? '، منها ما يبدأ من وسطها' : ''}` : 'آية الدَّين (١٥ سطراً): لا تدخل أي سؤال لأنها أطول من المسموح');
        const MULK = { type: 'surahs', from: 67, to: 67 }, f1 = C.generateForm(I, t, { range: MULK, seed: 1 });
        if (f1.ok) {
          const f2 = C.generateForm(I, t, { range: MULK, seed: 2, exclude: f1.questions.map(q => ({ from: q.from, to: q.to, fromWord: q.fromWord, toWord: q.toWord, date: 1, attempt: 1 })) });
          lines.push(f2.ok ? `طالب يُعيد سورة الملك بعد أن سُئل فيها: يُولَّد له نموذج${f2.parts.some(x => x.report.repeated) ? ' يكرّر أقدم مواضعه' : ''}` : 'طالب يُعيد سورة الملك بعد أن سُئل فيها: لا يُولَّد له نموذج (نفدت المواضع)');
        }
      } catch (e) { /* القالب قيد التعديل: يكفي ما سبق */ }
    }
    out.questions = lines.join('\n');
    try {
      const L = levels && levels.length > 2 ? levels : C.defaultLevels();
      const def = levelSetupInfo({ lv: 2, etype: null, qcount: null }, L, t);
      const other = levelSetupInfo({ lv: 2, etype: t.examType.default === 'cumulative' ? 'levelOnly' : 'cumulative', qcount: null }, L, t);
      const qs = qSec(t), n8 = [8, t.examType.maxQuestions, 6].find(n => n <= t.examType.maxQuestions && n !== qs.questionCount);
      let scaled = `كل سؤال من ${ar(qs.perQuestion)}، والحفظ من ${ar(qs.max != null ? qs.max : qs.perQuestion * qs.questionCount)} مهما كان العدد`;
      if (n8) {
        const t8 = C.examTemplate(t, { questionCount: n8 }), s8 = qSec(t8), c8 = C.newCounters(t8);
        const e = s8.deductions.filter(d => d.enabled !== false).reduce((m, d) => (d.value > (m ? m.value : 0) ? d : m), null);
        for (let k = 0, left = 7; e && left > 0; k = (k + 1) % s8.questionCount, left--) { const q = c8.sections[s8.id].questions[k]; q[e.id] = (q[e.id] || 0) + 1; }
        const h8 = C.computeResult(t8, c8).sections.find(x => x.id === s8.id);
        if (h8.questionsMax != null) scaled += `\n${ar(n8)} أسئلة، جمع ${ar(h8.questionsTotal)} من ${ar(h8.questionsMax)} ← الحفظ ${ar(h8.score)} من ${ar(h8.max)}`;
      }
      out.examType = `يظهر أولاً: ${def.summary || def.error}\nوإن اختار المحكّم الآخر: ${other.summary || other.error}\n${scaled}`;
    } catch (e) { out.examType = e.message; }
    const r = t.rounding;
    out.rounding = r.mode === 'none' ? '٨٦٫٧٥ تبقى ٨٦٫٧٥ (بلا تقريب)' : `٨٦٫٧٥ ← ${ar(C.applyRounding(8675, r) / 100)}`;
    return out;
  }
  // حفظ الإعدادات: الأسماء تُقصّ، والقالب والمستويات والمحكّمون تُفحص كلها؛ ورقم نسخة القالب يرتفع إن تغيّر
  // (النتائج المعتمدة محفوظة بنسختها فلا تتغير)
  function settingsSave(orig, tpl, levels, examiners, I = ix) {
    const lv = levels.map(l => ({ ...l, name: typeof l.name === 'string' ? l.name.trim() : l.name }));
    const exs = examiners.map(e => ({ ...e, name: typeof e.name === 'string' ? e.name.trim() : e.name }));
    const errors = [...C.validateTemplate(tpl), ...C.validateLevels(I, lv).map(e => 'المستويات: ' + e), ...C.validateExaminers(exs).map(e => 'المحكّمون: ' + e)];
    if (errors.length) return { ok: false, errors };
    const changed = JSON.stringify(C.normalizeTemplate(orig)) !== JSON.stringify(C.normalizeTemplate(tpl));
    return { ok: true, template: changed ? C.bumpVersion(C.normalizeTemplate(tpl)) : C.normalizeTemplate(orig), levels: lv, examiners: exs };
  }
  // نطاق مستوى «من سورة وآية إلى سورة وآية» يُبنى بقاعدة شاشة الاختبار نفسها (من الناس صعوداً: التنازلي صحيح)،
  // ويحفظ الحقول كما كتبها المشرف (pick) ليُعرض المستوى كما أدخله. الحقل الفارغ ← لا نطاق (يُرفض عند الحفظ)
  function levelPickRange(I, pick) {
    const n = x => { const v = parseNum(x); return Number.isInteger(v) ? v : null; };
    const p = { s1: n(pick.s1), a1: n(pick.a1), s2: n(pick.s2), a2: n(pick.a2) };
    return { pick: p, range: p.s1 && p.s2 && p.a2 ? C.surahAyahSpec(I, p.s1, p.a1 == null ? 1 : p.a1, p.s2, p.a2) : null };
  }

  // ═════════════ المحكّمون ═════════════
  // آخر من اختيروا على هذا الجهاز: من القائمة بمعرّفاتهم (ومن حُذف منها لا يُقترح)، والقديم (أسماء مكتوبة) بأسمائه
  // (خالصة) كل خانة في موضعها: الخانة الفارغة تبقى فارغة فلا ينزاح محكّم إلى غير خانته
  function lastExaminersFrom(prefs, list) {
    const last = prefs.lastExaminers || (prefs.examiners || []).map(n => ({ id: null, name: C.examinerName(n) }));
    return last.map(x => (x && x.id != null ? (list.find(e => e.id === x.id) ? { ...list.find(e => e.id === x.id) } : null) : x && C.examinerName(x).trim() ? { id: null, name: C.examinerName(x).trim() } : null));
  }
  const lastExaminers = () => lastExaminersFrom(S.prefs, S.examiners);
  // خيارات خانة محكّم (خالصة): «اختر»، ثم القائمة، واسم قديم غير مسجّل إن كان في الخانة، ثم «محكّم جديد»
  function examinerOptions(cur, list) {
    const id = cur && typeof cur === 'object' ? cur.id : null, name = C.examinerName(cur).trim();
    const inList = id != null && list.some(e => e.id === id);
    const out = [{ value: '', label: '— اختر —', selected: !name }];
    list.forEach(e => out.push({ value: e.id, label: e.name, selected: inList && e.id === id }));
    if (name && !inList) out.push({ value: '__legacy', label: `${name} (غير مسجّل في القائمة)`, selected: true });
    out.push({ value: '__new', label: '＋ محكّم جديد…', selected: false });
    return out;
  }
  async function chooseExaminer(i, value) {
    const d = S.draft;
    if (value === '__legacy') return;
    if (value === '__new') {
      const name = (global.prompt('اسم المحكّم كما يُكتب في الورقة:') || '').trim();
      if (name) {
        const same = S.examiners.find(e => e.name.trim() === name);
        const ex = same || { id: H.store.newId('e'), name };
        if (!same) { S.examiners = S.examiners.concat([ex]); await H.store.saveExaminers(S.examiners); toast('أُضيف إلى قائمة المحكّمين'); }
        d.examiners[i] = { id: ex.id, name: ex.name };
        // خانة أخرى فيها الاسم نفسه قديماً بلا معرّف: صار مسجّلاً، فتأخذ معرّفه
        d.examiners.forEach((x, j) => { if (j !== i && x && x.id == null && C.examinerName(x).trim() === ex.name.trim()) d.examiners[j] = { id: ex.id, name: ex.name }; });
      }
    } else d.examiners[i] = value ? { ...S.examiners.find(e => e.id === value) } : null;
    saveSoon(); renderExamKeepScroll();
  }

  function bump(path, delta) {
    const d = S.draft;
    if (path.k === 'q') { const c = d.counters.sections[path.s].questions[path.i]; c[path.d] = Math.max(0, (c[path.d] || 0) + delta); }
    else { const c = d.counters.sections[path.s].items; c[path.it] = Math.max(0, (c[path.it] || 0) + delta); }
  }
  function record(path) {
    const d = S.draft;
    const before = C.computeResult(d.templateSnapshot, d.counters);
    bump(path, +1);
    d.log.push(path); if (d.log.length > 500) d.log.shift();
    const after = C.computeResult(d.templateSnapshot, d.counters);
    if (path.k === 'q') {
      const b = before.sections.find(s => s.id === path.s).questions[path.i], a = after.sections.find(s => s.id === path.s).questions[path.i];
      if (!b.cancelled && a.cancelled) { try { navigator.vibrate && navigator.vibrate([60, 40, 60]); } catch (e) { } toast('أُلغيت درجة السؤال: ' + a.cancelReasons.join('، '), 'err'); }
    }
    saveSoon(); renderExamKeepScroll();
  }
  function undo() {
    const d = S.draft, path = d.log.pop(); if (!path) return;
    bump(path, -1);
    const t = d.templateSnapshot, sec = t.sections.find(s => s.id === path.s);
    const what = path.k === 'q' ? `${sec.deductions.find(x => x.id === path.d).name} (السؤال ${ar(path.i + 1)})` : sec.groups.flatMap(g => g.items).find(x => x.id === path.it).name;
    toast('تراجع: ' + what);
    saveSoon(); renderExamKeepScroll();
  }
  const renderExamKeepScroll = () => renderExam(true);

  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(flushSave, 250); }
  function flushSave() {
    clearTimeout(saveTimer); saveTimer = null;
    if (!S || !S.draft || !H) return;
    S.draft.updatedAt = Date.now();
    H.store.saveDraft(S.draft).catch(e => toast(e.message, 'err'));
  }

  let approving = false;
  async function approve(btn) {
    if (approving) return;
    const d = S.draft;
    const chosen = C.resolveExaminers(d.examiners);
    if (!chosen.ok) { toast(chosen.error, 'err'); const i = $('#xa-ex-0'); if (i) i.focus(); return; }
    const res = C.computeResult(d.templateSnapshot, d.counters);
    if (!global.confirm(`اعتماد نتيجة ${d.candidate.name}: ${ar(res.rounded)} من ${ar(res.totalMax)} (${ar(res.percent)}٪).\nبعد الاعتماد لا تُعدَّل. متابعة؟`)) return;
    // ضغطة ثانية أثناء الحفظ لا تعتمد مرتين، ومؤقت الحفظ المعلّق لا يعيد كتابة المسودة بعد حذفها
    approving = true; if (btn) btn.disabled = true;
    clearTimeout(saveTimer); saveTimer = null;
    try {
      const fin = C.finalizeResult({ template: d.templateSnapshot, counters: d.counters, form: d.form, candidate: d.candidate, examiners: chosen.examiners, attempt: d.attempt, approvedAt: Date.now(), isTest: !!H.isTest, levels: d.levels, examType: d.examType });
      const stored = C.deepFreeze(Object.assign(clone(fin), { id: H.store.newId('r'), rangeLabel: d.rangeLabel, rangeSpec: d.rangeSpec, draftId: d.id }));
      await H.store.saveResult(stored);
      // النتيجة حُفظت: من هنا لا يُترك المحكّم في شاشة مراجعة بلا مسودة، فأي فشل لاحق يُنبَّه إليه ويُكمَل إلى النتيجة
      S.draft = null; S.result = C.normalizeStoredResult(stored);
      const later = [];
      try { await H.store.deleteDraft(d.id); } catch (e) { later.push('لم تُحذف المسودة'); }
      try { S.prefs.lastExaminers = d.examiners.map(x => (C.examinerName(x).trim() ? { id: x && x.id != null ? x.id : null, name: C.examinerName(x).trim() } : null)); delete S.prefs.examiners; await H.store.savePrefs(S.prefs); } catch (e) { later.push('لم يُحفظ اختيار المحكّمين'); }
      try { await refreshLists(); } catch (e) { later.push('تعذّر تحديث القوائم'); }
      toast(later.length ? `اعتُمدت النتيجة، لكن: ${later.join('، ')}` : 'اعتُمدت النتيجة', later.length ? 'err' : undefined);
      // البرنامج المضيف يستلم النتيجة مطبَّعة (بقائمة الأسئلة المسطّحة كما كان يستلمها) ومجمّدة
      if (H.onResult) { try { H.onResult(C.deepFreeze(C.normalizeStoredResult(stored))); } catch (e) { console.error(e); } }
      show('result');
      if (H.store.usage) { const u = await H.store.usage(); if (u.nearFull) toast(`ذاكرة الجهاز قاربت الامتلاء (${Math.round(u.ratio * 100)}٪). يلزم نقل النتائج قبل أن يتعذّر الحفظ.`, 'err'); }
    } finally {
      approving = false; if (btn && R && R.contains(btn)) btn.disabled = false;
    }
  }

  // حين يختلف عدد الأسئلة عن الورقة المعتادة: مجموع الأسئلة كما صحّحه المحكّم، ثم تحويله إلى عظمى القسم
  const scaledNote = s => (s.questionsMax != null ? `<p class="xa-muted">مجموع الأسئلة ${ar(s.questionsTotal)} من ${ar(s.questionsMax)} ← ${ar(s.score)} من ${ar(s.max)}</p>` : '');

  // أسئلة قسم في نتيجة معتمدة: من قسمه (النتائج الجديدة تحفظها مقسّمة)؛ والقديمة المختصرة (قائمة واحدة بلا أقسام)
  // تُنسب إلى قسم الأسئلة الأول فقط، كي لا تُعرض مواضع القسم الأول تحت الثاني. qIndex: ترتيب القسم بين أقسام الأسئلة المفعّلة.
  function resultQuestions(r, sectionId, qIndex) {
    const f = r && r.form; if (!f) return [];
    if (Array.isArray(f.parts) && f.parts.length) { const p = f.parts.find(x => x && x.sectionId === sectionId); return p && Array.isArray(p.questions) ? p.questions : []; }
    return qIndex === 0 && Array.isArray(f.questions) ? f.questions : [];
  }

  // ═════════════ عرض نتيجة معتمدة ═════════════
  function resultView(r) {
    const c = r.computed;
    let qIndex = -1;
    const secs = c.sections.filter(s => s.enabled).map(s => {
      let detail = '';
      if (s.kind === 'questions') { const fqs = resultQuestions(r, s.id, ++qIndex); detail = `<ol class="xa-mini">${s.questions.map((q, i) => {
        const fq = fqs[i];
        return `<li><span>${fq ? esc(qLoc(fq)) + wordBoundsLine(fq) : 'السؤال ' + ar(i + 1)}</span><b class="${q.cancelled ? 'bad' : ''}">${q.cancelled ? 'ملغى' : ar(q.score)} / ${ar(q.max)}</b></li>`;
      }).join('')}</ol>`; }
      else { const its = s.items.filter(x => x.repeats); detail = its.length ? `<ul class="xa-mini">${its.map(x => `<li><span>${esc(x.name)}</span><b>${ar(x.repeats)} × ${ar(x.value != null ? x.value : Math.round(x.deducted / x.repeats * 100) / 100)}</b></li>`).join('')}</ul>` : '<p class="xa-muted">لا أخطاء</p>'; }
      return `<section class="xa-card"><div class="xa-qtitle"><b>${esc(s.name)}</b><b>${ar(s.score)} / ${ar(s.max)}</b></div>${scaledNote(s)}${detail}</section>`;
    }).join('');
    return `<div class="xa-wrap">
      <section class="xa-card xa-hero">
        <div><b class="xa-hero-name">${esc(r.candidate.name)}</b><span class="xa-muted">${esc(r.rangeLabel || '')}، ${esc(hijri(r.approvedAt))}${r.attempt > 1 ? `، المحاولة ${ar(r.attempt)}` : ''}</span></div>
        <div class="xa-hero-score">${ar(c.rounded)}<small>من ${ar(c.totalMax)}، النسبة ${ar(c.percent)}٪</small></div>
        <div class="xa-kv"><span>التقدير</span>${c.grade == null ? '<span class="xa-muted">لم يُضبط سلّم التقدير</span>' : `<b class="${c.passed ? 'ok' : 'bad'}">${esc(c.grade)}</b>`}</div>
        <div class="xa-kv"><span>المحكّمون</span><b>${esc((r.examiners || []).map(C.examinerName).filter(Boolean).join('، ') || '—')}</b></div>
      </section>
      ${secs}
      <button class="xa-btn xa-big" disabled>طباعة الورقة (في الخطوة القادمة)</button>
    </div>`;
  }

  // ═════════════ شاشة الإعدادات ═════════════
  // بطاقة لكل موضوع، وكل إعداد جملة برقم واحد أو نعم/لا، وتحت كل بطاقة مثال يحسبه المحرك بالإعدادات الحالية.
  // التعديل على نسخة عمل؛ «حفظ» يفحص كل شيء ثم يكتب، و«رجوع بلا حفظ» يترك المحفوظ كما هو.
  // الكتابة في حقل لا تعيد رسم الشاشة (فلا تضيع ضغطة زر بعدها): يتحدث خطؤه والأمثلة في مواضعها فقط.
  function openSettings() {
    S.settings = { tpl: clone(S.template), levels: clone(S.levels), examiners: clone(S.examiners), errors: {}, raw: {}, saveErrors: [], showLevels: false };
    show('settings');
  }
  const setId = k => 'xa-set-' + k.replace(/\./g, '-');
  function settingsView() {
    const W = S.settings, t = W.tpl, ex = settingsExamples(t, W.levels);
    const err = k => `<small class="xa-bad" id="${setId(k)}-err" role="alert">${esc(W.errors[k] || '')}</small>`;
    // الحقل يعرض ما كتبه المشرف إن رُفض (لا يُمسح)، وإلا القيمة المحفوظة في نسخة العمل
    const num = (k, sentence, unit) => `<label class="xa-set"><span>${esc(sentence)}</span><span class="xa-set-v"><input class="xa-input" type="text" inputmode="decimal" data-set="${k}" value="${esc(W.raw[k] != null ? W.raw[k] : ar(readSetting(t, k)))}" aria-label="${esc(sentence)}">${unit ? ` <small>${esc(unit)}</small>` : ''}</span>${err(k)}</label>`;
    const choice = (k, sentence, opts) => { const v = readSetting(t, k); return `<div class="xa-set"><span>${esc(sentence)}</span><span class="xa-seg sm" role="radiogroup" aria-label="${esc(sentence)}">${opts.map(([val, l]) => `<button role="radio" aria-checked="${v === val}" class="${v === val ? 'on' : ''}" data-act="set" data-k="${k}" data-v="${val === true ? 'yes' : val === false ? 'no' : val}">${esc(l)}</button>`).join('')}</span>${err(k)}</div>`; };
    const yn = (k, sentence) => choice(k, sentence, [[true, 'نعم'], [false, 'لا']]);
    const example = (id, text) => `<pre class="xa-example" id="xa-ex-${id}">${esc('مثال بإعداداتك الحالية:\n' + text)}</pre>`;
    const card = (title, body, id, text) => `<section class="xa-card"><h2 class="xa-h2">${esc(title)}</h2>${body}${id ? example(id, text) : ''}</section>`;
    const juzOpts = sel => Array.from({ length: 30 }, (_, i) => i + 1).map(j => `<option value="${j}" ${sel === j ? 'selected' : ''}>الجزء ${ar(j)}</option>`).join('');
    const surOpts = sel => ix.surahs.map(s => `<option value="${s.number}" ${s.number === sel ? 'selected' : ''}>${ar(s.number)}. ${esc(s.name)}</option>`).join('');
    const ayahsOf = r => { try { return r ? C.resolveRange(ix, r).ayahs : 0; } catch (e) { return 0; } };
    const lvRows = W.levels.map((l, i) => {
      const r = l.range || {}, isJuz = r.type === 'juz' && Array.isArray(r.juz) && r.juz.length === 1, isPick = !!l.pick;
      const pk = l.pick || {}, val = x => (x == null ? '' : ar(x));
      return `<div class="xa-lvrow">
        <input class="xa-input" data-lv="${i}" data-f="name" value="${esc(l.name)}" aria-label="اسم المستوى ${ar(i + 1)}">
        <select class="xa-input" data-lv="${i}" data-f="kind" aria-label="نطاق المستوى ${ar(i + 1)}">${juzOpts(isJuz && !isPick ? r.juz[0] : null)}<option value="pick" ${isPick ? 'selected' : ''}>من سورة وآية إلى سورة وآية…</option>${!isJuz && !isPick ? '<option value="" selected>نطاق مخصّص</option>' : ''}</select>
        ${isPick ? `<span class="xa-lvcustom">من <select data-lv="${i}" data-f="s1" aria-label="من سورة">${surOpts(pk.s1)}</select> آية <input class="xa-input" data-lv="${i}" data-f="a1" inputmode="numeric" value="${val(pk.a1)}" aria-label="من آية">
          إلى <select data-lv="${i}" data-f="s2" aria-label="إلى سورة">${surOpts(pk.s2)}</select> آية <input class="xa-input" data-lv="${i}" data-f="a2" inputmode="numeric" value="${val(pk.a2)}" aria-label="إلى آية"></span>` : ''}
        <small class="xa-muted" id="xa-lv-n-${i}">${ayahsOf(l.range) ? ar(ayahsOf(l.range)) + ' آية' : 'حدد النطاق'}</small>
        <button class="xa-btn sm dng" data-act="lv-del" data-i="${i}" aria-label="حذف ${esc(l.name)}">حذف</button></div>`;
    }).join('');
    const first = W.levels[0], last = W.levels[W.levels.length - 1];
    const levelsBody = W.showLevels
      ? `<p class="xa-muted">من الناس صعوداً: الأول أولاً. «من الناس إلى …» نطاق صحيح. تعديلها لا يغيّر النتائج المعتمدة.</p>${lvRows}<button class="xa-btn" data-act="lv-add">＋ مستوى</button>`
      : `<p>${ar(W.levels.length)} مستوى${first ? `: «${esc(first.name)}» ← «${esc(last.name)}»` : ''}.</p><button class="xa-btn" data-act="lv-show">تعديل المستويات</button>`;
    const exRows = W.examiners.map((e, i) => `<div class="xa-lvrow"><input class="xa-input" data-exs="${i}" value="${esc(e.name)}" placeholder="اسم المحكّم" aria-label="المحكّم ${ar(i + 1)}"><button class="xa-btn sm dng" data-act="ex-del" data-i="${i}" aria-label="حذف ${esc(e.name || 'محكّم')}">حذف</button></div>`).join('');
    const lp = lahnParts(t);
    return `<div class="xa-wrap">
      ${lp ? card('الترتيل ← اللحن الجلي', num('lahn.value', 'يُحسم عن كل لحن:', 'درجة') + num('lahn.over', 'يُلغى السؤال إذا زاد اللحن فيه عن:', 'لحون') + yn('lahn.carryCancelled', 'إذا أُلغي السؤال، يُحسم لحنه من الترتيل أيضاً:'), 'lahn', ex.lahn) : ''}
      ${card('الأسئلة', num('q.count', 'عدد الأسئلة (في الأجزاء والسور والصفحات):') + num('q.length', 'طول السؤال:', 'أسطر') + num('q.overflow', 'يزيد السؤال لإتمام الآية حتى:', 'أسطر') + yn('q.midAyah', 'الآيات الطويلة: يجوز البدء والوقف في وسطها (عند علامات الوقف المعتمدة):') + yn('q.repeat', 'إذا نفدت المواضع الجديدة، تُكرَّر أقدم مواضعه السابقة:'), 'questions', ex.questions)}
      ${card('نوع الاختبار في المستويات', choice('et.default', 'النوع الذي يظهر أولاً:', [['cumulative', 'تراكمي'], ['levelOnly', 'هذا المستوى فقط']]) + num('et.levelOnlyCount', 'أسئلة «هذا المستوى فقط»:') + num('et.cumulativeCount', 'أسئلة التراكمي:') + num('et.cumulativeNew', 'منها من المستوى الجديد:') + num('et.maxQuestions', 'أكبر عدد يختاره المحكّم:'), 'examType', ex.examType)}
      ${card('المستويات', levelsBody)}
      ${card('المحكّمون', `${exRows || '<p class="xa-muted">لا محكّمين بعد.</p>'}<button class="xa-btn" data-act="ex-add">＋ محكّم</button>`)}
      ${card('الدرجة', choice('round.mode', 'تقريب المجموع:', [['nearest', 'لأقرب'], ['up', 'لأعلى'], ['down', 'لأسفل'], ['none', 'بلا']]) + (t.rounding.mode === 'none' ? '' : num('round.step', 'إلى أقرب:', 'درجة')), 'rounding', ex.rounding)}
      <div class="xa-note bad" role="alert" id="xa-set-errors" ${W.saveErrors.length ? '' : 'hidden'}>${W.saveErrors.map(esc).join('<br>')}</div>
      <div class="xa-actions"><button class="xa-btn" data-act="home">رجوع بلا حفظ</button><button class="xa-btn pri" data-act="settings-save">حفظ الإعدادات</button></div>
      <p class="xa-foot">كل حفظ يرفع رقم نسخة الورقة، والنتائج المعتمدة محفوظة بنسختها فلا تتغير.</p>
    </div>`;
  }
  // تحديث الأمثلة وخطأ الحقل في مواضعها، بلا إعادة رسم
  function refreshSettingsLive(key) {
    const W = S.settings, ex = settingsExamples(W.tpl, W.levels);
    ['lahn', 'questions', 'examType', 'rounding'].forEach(id => { const el = $('#xa-ex-' + id); if (el && ex[id] != null) el.textContent = 'مثال بإعداداتك الحالية:\n' + ex[id]; });
    if (key) { const e = $('#' + setId(key) + '-err'); if (e) e.textContent = W.errors[key] || ''; }
  }
  function settingsChange(el) {
    const W = S.settings;
    if (el.dataset.set) {
      const k = el.dataset.set, r = applySetting(W.tpl, k, el.value);
      W.tpl = r.tpl; W.errors[k] = r.errors[0] || '';
      if (r.errors.length) W.raw[k] = el.value; else { delete W.raw[k]; el.value = ar(readSetting(W.tpl, k)); }
      return refreshSettingsLive(k);
    }
    if (el.dataset.lv != null) {
      const i = +el.dataset.lv, l = W.levels[i], f = el.dataset.f;
      if (f === 'name') { l.name = el.value; return; }
      if (f === 'kind') {
        if (el.value === 'pick') l.pick = { s1: 114, a1: 1, s2: 114, a2: ix.surahs[113].count };
        else if (el.value) { delete l.pick; l.range = { type: 'juz', juz: [+el.value] }; }
        if (l.pick) l.range = levelPickRange(ix, l.pick).range;
        return show('settings', true);   // تغيّر شكل الصف (تظهر حقول السورة والآية أو تختفي)
      }
      if (l.pick) {
        l.pick = { ...l.pick, [f]: el.value };
        if (f === 's2') l.pick.a2 = ix.surahs[(parseNum(el.value) || 1) - 1].count;
        const pr = levelPickRange(ix, l.pick); l.pick = pr.pick; l.range = pr.range;
        if (f === 's2') { const a2 = $(`[data-lv="${i}"][data-f="a2"]`); if (a2) a2.value = ar(l.pick.a2); }
        let n = 0; try { n = l.range ? C.resolveRange(ix, l.range).ayahs : 0; } catch (e) { n = 0; }
        const c = $('#xa-lv-n-' + i); if (c) c.textContent = n ? ar(n) + ' آية' : 'حدد النطاق';
      }
      return;
    }
    if (el.dataset.exs != null) { W.examiners[+el.dataset.exs].name = el.value; return; }
  }
  async function settingsSaveNow() {
    const W = S.settings;
    // حقل مرفوض لم يُصحَّح: لا حفظ صامت يهمله
    const bad = Object.keys(W.errors).filter(k => W.errors[k]);
    if (bad.length) { W.saveErrors = ['صحّح الحقول المعلَّمة بالأحمر أولاً، فما كُتب فيها لم يُقبل.']; const box = $('#xa-set-errors'); if (box) { box.hidden = false; box.textContent = W.saveErrors[0]; } return; }
    const s = settingsSave(S.template, W.tpl, W.levels, W.examiners);
    if (!s.ok) { W.saveErrors = s.errors; return show('settings', true); }
    await H.store.saveTemplate(s.template); await H.store.saveLevels(s.levels); await H.store.saveExaminers(s.examiners);
    S.template = s.template; S.levels = s.levels; S.examiners = s.examiners; S.levelsNote = ''; S.settings = null;
    toast('حُفظت الإعدادات'); show('home');
  }

  // ═════════════ الأحداث ═════════════
  async function onClick(e) {
    const el = e.target.closest('[data-act]'); if (!el || !R.contains(el) || el.disabled) return;
    const act = el.dataset.act;
    if (act === 'close') return close(false);
    if (act === 'home') return goHome();
    if (act === 'new') { if (H.readOnly) return; S.setup = newSetup(); return show('setup'); }
    if (act === 'use-default') return loadData(true);
    if (act === 'settings') { if (H.readOnly) return; return openSettings(); }
    if (S.view === 'settings' && S.settings) {
      const W = S.settings;
      if (act === 'set') { const r = applySetting(W.tpl, el.dataset.k, el.dataset.v); W.tpl = r.tpl; W.errors[el.dataset.k] = r.errors[0] || ''; delete W.raw[el.dataset.k]; return show('settings', true); }
      if (act === 'lv-show') { W.showLevels = true; return show('settings', true); }
      if (act === 'lv-add') { const n = W.levels.length; W.levels.push({ id: H.store.newId('L'), name: `المستوى ${ar(n + 1)}`, range: { type: 'juz', juz: [Math.max(1, 30 - n)] } }); return show('settings', true); }
      if (act === 'lv-del') { const l = W.levels[+el.dataset.i]; if (l && global.confirm(`حذف «${l.name}»؟ النتائج المعتمدة لا تتغير.`)) { W.levels.splice(+el.dataset.i, 1); } return show('settings', true); }
      if (act === 'ex-add') { W.examiners.push({ id: H.store.newId('e'), name: '' }); return show('settings', true); }
      if (act === 'ex-del') { const e = W.examiners[+el.dataset.i]; if (e && global.confirm(`حذف «${e.name || 'محكّم'}» من القائمة؟ النتائج المعتمدة تبقى باسمه.`)) { W.examiners.splice(+el.dataset.i, 1); } return show('settings', true); }
      if (act === 'settings-save') return settingsSaveNow();
    }
    if (act === 'more-results') { S.resultsShown = (S.resultsShown || RESULTS_PAGE) + RESULTS_PAGE; return show('home', true); }
    if (act === 'continue') { S.draft = C.normalizeStoredDraft(await H.store.getDraft(el.dataset.id)); if (S.draft) show('exam'); return; }
    if (act === 'del-draft') {
      const d = S.drafts.find(x => x.id === el.dataset.id);
      if (d && global.confirm(`حذف اختبار ${d.candidate.name} غير المعتمد؟ لا يمكن التراجع.`)) { await H.store.deleteDraft(d.id); await refreshLists(); show('home'); toast('حُذف'); }
      return;
    }
    if (act === 'open-result') { S.result = C.normalizeStoredResult(await H.store.getResult(el.dataset.id)); if (S.result) show('result'); return; }
    if (act === 'pick-cand') {
      S.setup.cand = H.getCandidates().find(c => String(c.id) === el.dataset.id) || null;
      // اختبار المستوى يبقى كما اختاره المحكّم؛ وفي غيره يُقترح «ما حفظه» لمن له آخر سرد مسجّل
      if (S.setup.mode !== 'level') S.setup.mode = S.setup.cand && S.setup.cand.frontier ? 'mem' : (S.setup.mode === 'mem' ? 'juz' : S.setup.mode);
      return show('setup');
    }
    if (act === 'change-cand') { S.setup.cand = null; if (S.setup.mode === 'mem') S.setup.mode = 'juz'; show('setup'); const s = $('#xa-cand-search'); if (s) s.focus(); return; }
    if (act === 'mode') { S.setup.mode = el.dataset.m; return show('setup', true); }
    if (act === 'etype') { S.setup = setupChange(S.setup, 'etype', el.dataset.t, ix); return show('setup', true); }
    if (act === 'juz') {
      const j = +el.dataset.j, a = S.setup.juz; const k = a.indexOf(j); if (k >= 0) a.splice(k, 1); else a.push(j);
      el.classList.toggle('on', k < 0); el.setAttribute('aria-pressed', String(k < 0)); return updateRangeSummary();
    }
    if (act === 'gen') return generate();
    if (act === 'regen') return generate(randomSeed());
    if (act === 'back-setup') return show('setup');
    if (act === 'start') return startExam();
    if (!S.draft) return;
    if (act === 'tab') { S.draft.tab = el.dataset.t; saveSoon(); return renderExam(); }
    if (act === 'prev' || act === 'next') {
      const tabs = tabsOf(S.draft), i = tabs.findIndex(t => t.key === S.draft.tab), j = Math.max(0, Math.min(tabs.length - 1, i + (act === 'next' ? 1 : -1)));
      S.draft.tab = tabs[j].key; saveSoon(); return renderExam();
    }
    if (act === 'ded') { const [, s, i] = S.draft.tab.split(':'); return record({ k: 'q', s, i: +i, d: el.dataset.d }); }
    if (act === 'item') return record({ k: 'c', s: el.dataset.s, it: el.dataset.i });
    if (act === 'undo') return undo();
    if (act === 'approve') return approve(el);
  }
  function onInput(e) {
    const el = e.target, k = el.dataset && el.dataset.in; if (!k) return;
    if (k === 'cand-search') {
      S.setup.search = el.value;
      const pos = el.selectionStart; show('setup', true); const s = $('#xa-cand-search'); if (s) { s.focus(); try { s.setSelectionRange(pos, pos); } catch (er) { } }
      return;
    }
    const st = S.setup; if (!st) return;
    if (k === 'a1' || k === 'a2' || k === 'p1' || k === 'p2' || k === 'qcount') { S.setup = setupChange(st, k, el.value, ix); updateRangeSummary(); }
  }
  function onChange(e) {
    const el = e.target, k = el.dataset && el.dataset.in, st = S.setup;
    if (k === 'examiner' && S.draft) return chooseExaminer(+el.dataset.i, el.value);
    if (S.view === 'settings' && S.settings) return settingsChange(el);
    if (!k || !st) return;
    if (k === 's1' || k === 's2' || k === 'lv') { S.setup = setupChange(st, k, el.value, ix); show('setup', true); }
  }

  global.ExamUI = { open, close: () => close(false), isOpen: () => !!R, _createMushaf: createMushaf, _pure: { rangeSpecFor, setupChange, resultQuestions, qLocWith, wordBoundsText, levelSetupInfo, examinerOptions, lastExaminersFrom, readSetting, applySetting, settingsExamples, settingsSave, levelPickRange } };
})(typeof self !== 'undefined' ? self : this);
