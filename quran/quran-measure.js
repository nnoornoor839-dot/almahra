/*
 * ميزان المصحف الواحد (طبعة مصحف المدينة ١٤٤١هـ) — المكان الوحيد الذي يحسب وجهاً أو ربعاً أو حزباً أو جزءاً في المهرة.
 * نقي: بلا DOM ولا Firebase؛ يعمل في المتصفح (window.QuranMeasure) وفي node (require).
 * الوزن: لكل آية وزن بالأسطر النصية (السطر المشترك بين آيتين يُقسم بنسبة الكلمات)؛ الوجه والربع نسبة أوزان.
 * سطرا اسم السورة والبسملة ليسا أسطراً نصية فلا وزن لهما. التقريب ليس هنا: يُنسَّق عند العرض فقط.
 * المدخلات: quran-meta.js (QURAN_META) + quran-lines.js (QURAN_LINES) + quran-words.js (QURAN_WORDS)، وتُمرَّر إلى init صراحةً.
 * التصميم: notes/quarters-fix/design.md §٢. خارج هذه الخطوة عمداً: label وformat (الخطوتان ٢ و٣).
 */
(function (root) {
  'use strict';

  const N = 6236, PAGES = 604, QUARTERS = 240, JUZ = 30, SURAHS = 114;
  const EPS = 1e-9;

  class QuranMeasureError extends Error {
    constructor(code, message) { super(message); this.name = 'QuranMeasureError'; this.code = code; }
  }
  const fail = (code, msg) => { throw new QuranMeasureError(code, msg); };

  const MAX_REP = 100000;        // حدّ أعلى للتكرار يمنع فيض الضرب (rep كمية مراجعات في يوم، لا تبلغ هذا)

  // بصمة بيانات الطبعة المعتمدة (مصحف المدينة ١٤٤١هـ): تكشف أي تحريف صامت في الأرقام
  // لا يكشفه فحص بنيوي (موضع علامة ربع صحيح الشكل، سطر استمرار محذوف، عدد كلمات مزيَّف).
  // إن غُيِّرت الطبعة عمداً: شغّل node لحساب fingerprint الجديد (الدالة أدناه) وحدّث هذا الثابت بعد مراجعة بشرية.
  const EXPECTED_FINGERPRINT = '7c339a76';
  function fnv1a(str) { let h = 0x811c9dc5 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return ('00000000' + h.toString(16)).slice(-8); }
  function fingerprint(META, LINES, WORDS) {
    const canon = JSON.stringify([
      META.surahs.map(s => [s[0], s[1]]), META.pages, META.quarters, META.juz,
      LINES.pages.map(p => p.map(e => Array.isArray(e) ? e : ['n', e])),
      WORDS
    ]);
    return fnv1a(canon);
  }

  let ix = null; // الفهرس بعد init ناجحة

  // ---------- init ----------
  function build(META, LINES, WORDS) {
    if (!META || !Array.isArray(META.surahs) || !Array.isArray(META.pages) || !Array.isArray(META.quarters) || !Array.isArray(META.juz)) fail('BAD_META', 'quran-meta.js مفقود أو ناقص');
    if (!LINES || !Array.isArray(LINES.pages) || LINES.pages.length !== PAGES) fail('BAD_LINES', 'quran-lines.js مفقود أو مخالف للطبعة');
    if (typeof WORDS !== 'string' || WORDS.length !== 2 * N) fail('BAD_WORDS', 'جدول الكلمات (quran-words.js) مفقود أو مخالف للطبعة');
    if (META.surahs.length !== SURAHS || META.pages.length !== PAGES || META.quarters.length !== QUARTERS || META.juz.length !== JUZ) fail('BAD_META', 'quran-meta.js لا يطابق الطبعة (١١٤ سورة / ٦٠٤ وجه / ٢٤٠ ربع / ٣٠ جزء)');

    const surahStart = new Int32Array(SURAHS + 1), surahCount = new Int32Array(SURAHS + 1);
    const surahOf = new Int16Array(N), ayahNo = new Int16Array(N);
    let expect = 0;
    META.surahs.forEach((s, i) => {
      if (s[0] !== expect) fail('BAD_META', 'فهرس أول آية في السورة ' + (i + 1) + ' لا يطابق التسلسل');
      surahStart[i + 1] = s[0]; surahCount[i + 1] = s[1];
      for (let k = 0; k < s[1]; k++) { surahOf[s[0] + k] = i + 1; ayahNo[s[0] + k] = k + 1; }
      expect += s[1];
    });
    if (expect !== N) fail('BAD_META', 'مجموع الآيات ' + expect + ' لا يساوي ' + N);
    const abs = (s, a) => surahStart[s] + a - 1;

    // بدايات الحاويات (فهرس مطلق) ويجب أن تتصاعد بدءاً من ٠
    const toStarts = (refs, name) => {
      const out = refs.map(([s, a]) => { if (!(s >= 1 && s <= SURAHS && a >= 1 && a <= surahCount[s])) fail('BAD_META', name + ' فيه موضع خارج المصحف'); return abs(s, a); });
      if (out[0] !== 0) fail('BAD_META', name + ' لا يبدأ من أول المصحف');
      for (let i = 1; i < out.length; i++) if (out[i] <= out[i - 1]) fail('BAD_META', name + ' غير متصاعد');
      return out;
    };
    const pageStart = toStarts(META.pages, 'pages'), quarterStart = toStarts(META.quarters, 'quarters'), juzStart = toStarts(META.juz, 'juz');
    for (let j = 0; j < JUZ; j++) if (juzStart[j] !== quarterStart[8 * j]) fail('BAD_META', 'بداية الجزء ' + (j + 1) + ' ليست بداية الربع ' + (8 * j + 1));
    const hizbStart = Array.from({ length: 60 }, (_, h) => quarterStart[4 * h]);

    const containerOf = (starts) => {
      const of = new Int16Array(N); let c = 0;
      for (let ai = 0; ai < N; ai++) { while (c + 1 < starts.length && starts[c + 1] <= ai) c++; of[ai] = c + 1; }
      return of;
    };
    const pageOf = containerOf(pageStart), quarterOf = containerOf(quarterStart), hizbOf = containerOf(hizbStart), juzOf = containerOf(juzStart);

    // كلمات كل آية: حرفان بالأساس ٣٦؛ يجب أن يكونا رقمين صالحين والعدد ١..٢٥٥ قبل التخزين في Uint8Array (وإلا بُترت القيمة صامتةً)
    const ayahWords = new Uint8Array(N);
    const B36 = /^[0-9a-z]{2}$/;
    for (let ai = 0; ai < N; ai++) {
      const two = WORDS.substr(2 * ai, 2);
      if (!B36.test(two)) fail('BAD_WORDS', 'ترميز كلمات الآية ' + ai + ' غير صالح (ليس رقمين بالأساس ٣٦)');
      const w = parseInt(two, 36);
      if (!(w >= 1 && w <= 255)) fail('BAD_WORDS', 'عدد كلمات الآية ' + ai + ' خارج ١..٢٥٥ (' + w + ')');
      ayahWords[ai] = w;
    }

    // الأسطر النصية بالترتيب: [فهرس الآية، فهرس الكلمة]؛ العناوين/البسملة أعداد سالبة تُتجاوز
    const tPage = [], tAi = [], tWj = [];
    LINES.pages.forEach((pg, pi) => {
      if (!Array.isArray(pg)) fail('BAD_LINES', 'الوجه ' + (pi + 1) + ' في quran-lines.js ليس مصفوفة');
      pg.forEach(e => { if (Array.isArray(e)) { tPage.push(pi + 1); tAi.push(e[0]); tWj.push(e[1]); } });
    });
    const L = tPage.length;
    if (L !== 8820) fail('BAD_LINES', 'عدد الأسطر النصية ' + L + ' لا يساوي ٨٨٢٠ (طبعة ١٤٤١هـ)');
    if (tAi[0] !== 0 || tWj[0] !== 0) fail('BAD_LINES', 'أول سطر نصي ليس بداية المصحف [0,0]');
    for (let k = 0; k < L; k++) {
      const ai = tAi[k], wj = tWj[k];
      if (!(Number.isInteger(ai) && ai >= 0 && ai < N && Number.isInteger(wj) && wj >= 0 && wj < ayahWords[ai])) fail('BAD_LINES', 'السطر ' + k + ' يشير إلى موضع غير صالح');
      if (k > 0 && !(ai > tAi[k - 1] || (ai === tAi[k - 1] && wj > tWj[k - 1]))) fail('BAD_LINES', 'ترتيب الأسطر غير متصاعد عند ' + k);
    }

    // وزن الآية بالأسطر: كل سطر يوزّع واحداً صحيحاً على الآيات التي يمسّها بنسبة كلماتها فيه
    const ayahLines = new Float64Array(N);
    for (let k = 0; k < L; k++) {
      const a0 = tAi[k], w0 = tWj[k];
      const a1 = k + 1 < L ? tAi[k + 1] : N - 1, w1 = k + 1 < L ? tWj[k + 1] : ayahWords[N - 1];
      const contrib = [];
      if (a0 === a1) contrib.push([a0, w1 - w0]);
      else {
        contrib.push([a0, ayahWords[a0] - w0]);
        for (let b = a0 + 1; b < a1; b++) contrib.push([b, ayahWords[b]]);
        if (w1 > 0) contrib.push([a1, w1]);
      }
      const n = contrib.reduce((s, c) => s + c[1], 0);
      if (!(n > 0)) fail('BAD_LINES', 'السطر ' + k + ' بلا كلمات');
      contrib.forEach(([a, w]) => { ayahLines[a] += w / n; });
    }
    for (let ai = 0; ai < N; ai++) if (!(ayahLines[ai] > 0)) fail('BAD_LINES', 'الآية ' + ai + ' بلا وزن سطري');

    // صفحة بداية كل آية حسب الأسطر = خريطة الصفحات في quran-meta (يكشف نسخة أسطر مخالفة)
    {
      let k = 0;
      for (let ai = 0; ai < N; ai++) {
        while (k + 1 < L && (tAi[k + 1] < ai || (tAi[k + 1] === ai && tWj[k + 1] <= 0))) k++;
        if (tPage[k] !== pageOf[ai]) fail('MISMATCH', 'quran-lines.js لا يطابق quran-meta.js عند الآية ' + ai + ' (وجه الأسطر ' + tPage[k] + ' ووجه الخريطة ' + pageOf[ai] + ')');
      }
    }

    const sumBy = (of, n) => { const t = new Float64Array(n + 1); for (let ai = 0; ai < N; ai++) t[of[ai]] += ayahLines[ai]; return t; };
    const pageTotal = sumBy(pageOf, PAGES), quarterTotal = sumBy(quarterOf, QUARTERS);

    // البصمة أخيراً: بعد الفحوص البنيوية (التي تعطي رسائل أدق)، تكشف التحريف الصامت الذي لا يكشفه أيٌّ منها:
    // إزاحة علامة ربع صحيحة الشكل (F3)، أو أي اختلاف في الأرقام لا يكسر بنية. F1/F2 يكشفهما الفحص البنيوي قبلها.
    if (fingerprint(META, LINES, WORDS) !== EXPECTED_FINGERPRINT) fail('FINGERPRINT', 'بيانات الطبعة لا تطابق البصمة المعتمدة (مصحف المدينة ١٤٤١هـ)؛ إن غُيِّرت الطبعة عمداً فحدّث EXPECTED_FINGERPRINT بعد مراجعة بشرية');

    const endsOf = (starts) => starts.map((_, i) => (i + 1 < starts.length ? starts[i + 1] - 1 : N - 1));
    return {
      surahStart, surahCount, surahOf, ayahNo, abs,
      pageStart, quarterStart, juzStart, hizbStart,
      pageEnd: endsOf(pageStart), quarterEnd: endsOf(quarterStart), hizbEnd: endsOf(hizbStart), juzEnd: endsOf(juzStart),
      pageOf, quarterOf, hizbOf, juzOf, ayahLines, pageTotal, quarterTotal, textLines: L,
      titles: META.titles || null
    };
  }

  function init(META, LINES, WORDS) {
    try { ix = build(META, LINES, WORDS); return { ok: true }; }
    catch (e) {
      ix = null;
      if (e instanceof QuranMeasureError) return { ok: false, reason: e.message, code: e.code };
      return { ok: false, reason: 'تعذّرت تهيئة الميزان: ' + (e && e.message), code: 'INIT_FAILED' };
    }
  }
  const isReady = () => ix !== null;
  const need = () => { if (!ix) fail('NOT_READY', 'الميزان لم يُهيَّأ: استدعِ init أولاً أو تحقق من نتيجتها'); return ix; };

  // ---------- الفترات ----------
  const isIdx = v => Number.isInteger(v) && v >= 0 && v < N;
  // دمج الفترات المتداخلة والمتجاورة؛ الفترة المعكوسة [b,a] تُصحَّح؛ مدخلاتها فهارس مطلقة من ٠ شاملة الطرفين
  function mergeIntervals(intervals) {
    if (!Array.isArray(intervals)) fail('BAD_SPEC', 'الفترات ليست مصفوفة');
    const s = [];                                      // حلقة مفهرسة لا map: map تتخطّى الخانات المتخلخلة (new Array(1)) صامتةً
    for (let i = 0; i < intervals.length; i++) {
      const iv = intervals[i];
      if (!Array.isArray(iv) || iv.length !== 2 || !isIdx(iv[0]) || !isIdx(iv[1])) fail('BAD_SPEC', 'فترة غير صالحة (يجب [a, b] بطول ٢): ' + JSON.stringify(iv));
      s.push(iv[0] <= iv[1] ? [iv[0], iv[1]] : [iv[1], iv[0]]);
    }
    s.sort((x, y) => x[0] - y[0]);
    const out = [];
    s.forEach(iv => { const m = out[out.length - 1]; if (m && iv[0] <= m[1] + 1) m[1] = Math.max(m[1], iv[1]); else out.push([iv[0], iv[1]]); });
    return out;
  }

  function checkAyah(s, a, what) {
    const I = need();
    if (!(Number.isInteger(s) && s >= 1 && s <= SURAHS)) fail('BAD_SPEC', what + ': رقم السورة ' + s + ' خارج ١..١١٤');
    if (!(Number.isInteger(a) && a >= 1 && a <= I.surahCount[s])) fail('BAD_SPEC', what + ': الآية ' + a + ' خارج السورة ' + s + ' (١..' + I.surahCount[s] + ')');
  }
  // «من سورة:آية إلى سورة:آية» كما يفسّرها البرنامج اليوم؛ الصاعد عبر السور (البداية بعد النهاية):
  // بداية السورة الأولى من الآية المدخلة إلى آخرها + السور بينهما كاملة + السورة الأخيرة من أولها إلى الآية المدخلة
  function rangeIntervals(s1, a1, s2, a2) {
    const I = need();
    checkAyah(s1, a1, 'من'); checkAyah(s2, a2, 'إلى');
    if (s1 === s2) return [[I.abs(s1, Math.min(a1, a2)), I.abs(s1, Math.max(a1, a2))]];
    if (s1 < s2) return [[I.abs(s1, a1), I.abs(s2, a2)]];
    const iv = [[I.abs(s1, a1), I.abs(s1, I.surahCount[s1])]];
    if (s1 - 1 > s2) iv.push([I.abs(s2 + 1, 1), I.abs(s1 - 1, I.surahCount[s1 - 1])]);
    iv.push([I.abs(s2, 1), I.abs(s2, a2)]);
    return iv.sort((x, y) => x[0] - y[0]);
  }

  const SPEC_KEYS = ['parts', 'juz', 'hizb', 'quarter', 'page', 'surah', 'from'];
  const list = (spec, key, lo, hi) => {
    const v = spec[key];
    if (!Array.isArray(v) || v.length === 0) fail('BAD_SPEC', key + ' يجب أن تكون قائمة غير فارغة');
    for (let i = 0; i < v.length; i++) { const x = v[i]; if (!(Number.isInteger(x) && x >= lo && x <= hi)) fail('BAD_SPEC', key + ': القيمة ' + x + ' خارج ' + lo + '..' + hi); }  // حلقة مفهرسة: تكشف الخانة المتخلخلة (undefined)
    return v;
  };
  // وصف المقطع → فترات مطلقة. يقبل تسجيلاً كاملاً: e.iv (المخزون المطبَّع) يتقدّم على e.spec
  const E_KEYS = ['iv', 'spec', 'kind', 'rep', 'label', 'assumed', 'note', 'criteria'];   // حقول التسجيل المسموح أن ترافق iv/spec
  const owns = (o, k) => Object.prototype.hasOwnProperty.call(o, k);                        // مفاتيح ذاتية فقط (لا موروثة)
  const ownKeys = (o) => Object.keys(o);                                                    // Object.keys ذاتية أصلاً
  // أي مفتاح يُهمَل صامتاً = خلل؛ لذا كل مفتاح في كل مستوى إمّا جزء من الشكل أو حقل تسجيل معروف، وإلا BAD_SPEC
  function specToIntervals(e) {
    const I = need();
    if (e === null || typeof e !== 'object' || Array.isArray(e)) fail('BAD_SPEC', 'وصف المقطع مفقود أو ليس كائناً');
    if (owns(e, 'iv')) {
      // iv (المخزون المطبَّع) يتقدّم؛ لا يُقبل معه مفتاح مُهمَل، ولا شكل spec عارٍ (التباس: أيّهما يُقاس؟)
      if (!Array.isArray(e.iv)) fail('BAD_SPEC', 'iv يجب أن تكون مصفوفة فترات');
      const extra = ownKeys(e).filter(x => x !== 'iv' && !E_KEYS.includes(x));
      if (extra.length) fail('BAD_SPEC', 'حقول غير معروفة مع iv: ' + extra.join(' / '));
      if (SPEC_KEYS.some(k => owns(e, k) && e[k] !== undefined)) fail('BAD_SPEC', 'وصف ملتبس: iv مع شكل spec عارٍ في المستوى نفسه');
      if (e.spec !== undefined && (e.spec === null || typeof e.spec !== 'object' || Array.isArray(e.spec))) fail('BAD_SPEC', 'spec المرافق لـ iv ليس كائناً');
      return mergeIntervals(e.iv);
    }
    const wrapped = owns(e, 'spec');
    if (wrapped) {
      // التسجيل الملفوف: لا يُقبل في مستواه إلا spec وحقول التسجيل المعروفة (لا مفتاح شكل خارجي يُهمَل)
      const extraOuter = ownKeys(e).filter(x => x !== 'spec' && !E_KEYS.includes(x));
      if (extraOuter.length) fail('BAD_SPEC', 'حقول غير معروفة في التسجيل مع spec: ' + extraOuter.join(' / '));
    }
    const spec = wrapped ? e.spec : e;
    if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) fail('BAD_SPEC', 'spec ليس كائناً');
    const specKeys = ownKeys(spec);
    const present = SPEC_KEYS.filter(k => owns(spec, k) && spec[k] !== undefined);
    if (present.length !== 1) fail('BAD_SPEC', 'وصف المقطع يجب أن يحوي شكلاً واحداً بالضبط من: ' + SPEC_KEYS.join(' / '));
    const k = present[0];
    // لا مفاتيح زائدة تُهمل صامتةً: الشكل المختار (وto رفيقة from)، وفي الشكل العاري (غير الملفوف) تُسمح حقول التسجيل المعروفة
    const allowed = new Set([k, ...(k === 'from' ? ['to'] : []), ...(wrapped ? [] : E_KEYS)]);
    const extra = specKeys.filter(x => !allowed.has(x));
    if (extra.length) fail('BAD_SPEC', 'حقول غير معروفة في وصف المقطع: ' + extra.join(' / '));
    if (k === 'parts') {
      if (!Array.isArray(spec.parts) || spec.parts.length === 0) fail('BAD_SPEC', 'parts يجب أن تكون قائمة غير فارغة');
      return mergeIntervals([].concat(...spec.parts.map(p => specToIntervals({ spec: p }))));
    }
    if (k === 'juz') return mergeIntervals(list(spec, 'juz', 1, JUZ).map(j => [I.juzStart[j - 1], I.juzEnd[j - 1]]));
    if (k === 'hizb') return mergeIntervals(list(spec, 'hizb', 1, 60).map(h => [I.hizbStart[h - 1], I.hizbEnd[h - 1]]));
    if (k === 'quarter') return mergeIntervals(list(spec, 'quarter', 1, QUARTERS).map(q => [I.quarterStart[q - 1], I.quarterEnd[q - 1]]));
    if (k === 'page') return mergeIntervals(list(spec, 'page', 1, PAGES).map(p => [I.pageStart[p - 1], I.pageEnd[p - 1]]));
    if (k === 'surah') return mergeIntervals(list(spec, 'surah', 1, SURAHS).map(s => [I.abs(s, 1), I.abs(s, I.surahCount[s])]));
    // from/to: كلٌّ [سورة، آية] بطول ٢ بالضبط (لا خانة ثالثة تُهمل صامتةً)
    if (!Array.isArray(spec.from) || spec.from.length !== 2 || !Array.isArray(spec.to) || spec.to.length !== 2) fail('BAD_SPEC', 'from وto يجب أن يكون كلٌّ منهما [سورة، آية] بطول ٢');
    return mergeIntervals(rangeIntervals(spec.from[0], spec.from[1], spec.to[0], spec.to[1]));
  }

  // ---------- القياس ----------
  // عدد الحاويات التي تقع كاملةً داخل [a,b]: بدايات/نهايات الحاوية وخريطة الآية→الحاوية (أعداد صحيحة، بلا مقارنة كسور)
  function countFull(starts, ends, of, a, b) {
    let c0 = of[a] - 1; if (starts[c0] < a) c0++;
    let c1 = of[b] - 1; if (ends[c1] > b) c1--;
    return Math.max(0, c1 - c0 + 1);
  }
  const zeroResult = (rep) => ({
    ayahs: 0, lines: 0, pages: 0, quarters: 0, hizb: 0, juz: 0, rep,
    full: { pages: 0, quarters: 0, hizb: 0, juz: 0 },
    span: { firstPage: null, lastPage: null, firstQuarter: null, lastQuarter: null, firstJuz: null, lastJuz: null },
    intervals: []
  });

  // intervals: فترات مطلقة؛ rep يضاعف الكمية (آيات/أسطر/أوجه/أرباع) ولا يضاعف full (التكرار كمية والتغطية تغطية)
  function measureIntervals(intervals, rep = 1) {
    const I = need();
    if (!(Number.isSafeInteger(rep) && rep >= 1 && rep <= MAX_REP)) fail('BAD_REP', 'التكرار يجب أن يكون عدداً صحيحاً بين ١ و' + MAX_REP + ' (وصل: ' + rep + ')');
    const merged = mergeIntervals(intervals);
    if (merged.length === 0) return zeroResult(rep);
    let ayahs = 0, weight = 0;
    const pageAcc = new Float64Array(PAGES + 1), quarterAcc = new Float64Array(QUARTERS + 1);
    const full = { pages: 0, quarters: 0, hizb: 0, juz: 0 };
    merged.forEach(([a, b]) => {
      for (let ai = a; ai <= b; ai++) { const w = I.ayahLines[ai]; ayahs++; weight += w; pageAcc[I.pageOf[ai]] += w; quarterAcc[I.quarterOf[ai]] += w; }
      full.pages += countFull(I.pageStart, I.pageEnd, I.pageOf, a, b);
      full.quarters += countFull(I.quarterStart, I.quarterEnd, I.quarterOf, a, b);
      full.hizb += countFull(I.hizbStart, I.hizbEnd, I.hizbOf, a, b);
      full.juz += countFull(I.juzStart, I.juzEnd, I.juzOf, a, b);
    });
    let pages = 0, quarters = 0;
    for (let p = 1; p <= PAGES; p++) if (pageAcc[p] > 0) pages += pageAcc[p] / I.pageTotal[p];
    for (let q = 1; q <= QUARTERS; q++) if (quarterAcc[q] > 0) quarters += quarterAcc[q] / I.quarterTotal[q];
    const first = merged[0][0], lastAi = merged[merged.length - 1][1];
    return {
      ayahs: ayahs * rep, lines: weight * rep, pages: pages * rep, quarters: quarters * rep,
      hizb: quarters * rep / 4, juz: quarters * rep / 8, rep, full,
      span: { firstPage: I.pageOf[first], lastPage: I.pageOf[lastAi], firstQuarter: I.quarterOf[first], lastQuarter: I.quarterOf[lastAi], firstJuz: I.juzOf[first], lastJuz: I.juzOf[lastAi] },
      intervals: merged
    };
  }
  const measure = (spec, rep = 1) => measureIntervals(specToIntervals(spec), rep);

  const intervalsOf = (x) => Array.isArray(x) ? x : (x && typeof x === 'object' && Array.isArray(x.intervals) ? x.intervals : fail('BAD_SPEC', 'عنصر بلا فترات'));
  // تغطية اليوم/الموسم: اتحاد فترات عدة تسجيلات ثم قياسها مرة واحدة (نصف ربع صباحاً + نصفه مساءً = ربع مكتمل)
  function coverage(list) {
    if (!Array.isArray(list)) fail('BAD_SPEC', 'coverage تأخذ قائمة فترات أو نتائج قياس');
    const all = [];
    for (let i = 0; i < list.length; i++) { const iv = intervalsOf(list[i]); for (let j = 0; j < iv.length; j++) all.push(iv[j]); }  // مفهرس: يكشف الخانة المتخلخلة
    return measureIntervals(all, 1);
  }
  const QTY = ['ayahs', 'lines', 'pages', 'quarters'];
  // مجموع نتائج قياس: الكميات تُجمع كما هي (بتكرارها)، وfull والامتداد من تغطية اتحاد فتراتها فلا يُجمع full بين تسجيلات
  function sum(results) {
    if (!Array.isArray(results)) fail('BAD_SPEC', 'sum تأخذ قائمة نتائج قياس');
    const cov = coverage(results);
    const out = { ayahs: 0, lines: 0, pages: 0, quarters: 0 };
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r === null || typeof r !== 'object') fail('BAD_SPEC', 'نتيجة قياس غير صالحة في sum');
      for (const key of QTY) if (typeof r[key] !== 'number' || !Number.isFinite(r[key])) fail('BAD_SPEC', 'نتيجة قياس بلا مقدار عددي منتهٍ: ' + key);
      if (!Number.isInteger(r.ayahs)) fail('BAD_SPEC', 'ayahs في نتيجة القياس ليس عدداً صحيحاً');
      out.ayahs += r.ayahs; out.lines += r.lines; out.pages += r.pages; out.quarters += r.quarters;
    }
    return { ayahs: out.ayahs, lines: out.lines, pages: out.pages, quarters: out.quarters, hizb: out.quarters / 4, juz: out.quarters / 8, rep: 1, full: cov.full, span: cov.span, intervals: cov.intervals };
  }

  // تطبيع «من/إلى» حسب اتجاه الطالب. النازل الذي أدخل البداية بعد النهاية لا يُحسب: يُطلب تأكيد العكس. الصاعد يحتفظ بتفسيره مع وسم
  function normalize(from, to, dir = 'up') {
    if (dir !== 'up' && dir !== 'down') fail('BAD_SPEC', 'الاتجاه up أو down');
    if (!Array.isArray(from) || from.length !== 2 || !Array.isArray(to) || to.length !== 2) fail('BAD_SPEC', 'from وto يجب أن يكون كلٌّ منهما [سورة، آية] بطول ٢');
    const [s1, a1] = from, [s2, a2] = to;
    if (s1 <= s2) return { intervals: mergeIntervals(rangeIntervals(s1, a1, s2, a2)), note: null };
    if (dir === 'up') return { intervals: mergeIntervals(rangeIntervals(s1, a1, s2, a2)), note: 'ascending-cross-surah' };
    checkAyah(s1, a1, 'من'); checkAyah(s2, a2, 'إلى');
    return { intervals: null, confirm: 'reverse', suggested: { from: [s2, a2], to: [s1, a1] } };
  }

  // مساعدات موضعية (لا حساب كميات فيها)
  const abs = (s, a) => { checkAyah(s, a, 'abs'); return need().abs(s, a); };
  function locate(ai) {
    const I = need();
    if (!isIdx(ai)) fail('BAD_SPEC', 'فهرس آية غير صالح: ' + ai);
    return { surah: I.surahOf[ai], ayah: I.ayahNo[ai], page: I.pageOf[ai], quarter: I.quarterOf[ai], hizb: I.hizbOf[ai], juz: I.juzOf[ai] };
  }

  const api = { init, isReady, measure, measureIntervals, coverage, sum, normalize, specToIntervals, mergeIntervals, rangeIntervals, abs, locate, QuranMeasureError, constants: { N, PAGES, QUARTERS, JUZ, EPS } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.QuranMeasure = api;
})(typeof window !== 'undefined' ? window : globalThis);
