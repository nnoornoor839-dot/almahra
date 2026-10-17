/*
 * exam-core.js — منطق محرك الاختبار الشفوي (برنامج المهرة)
 *
 * منطق خالص: لا واجهة، ولا تخزين، ولا شبكة. يعمل في المتصفح (window.ExamCore) وفي Node (require).
 * لا يحمّل بيانات المصحف بنفسه؛ تُمرَّر إليه خريطة المصحف (quran-meta.js) وأسطره (quran-lines.js) — طبعة المدينة 1441هـ.
 *
 * الأقسام:
 *   ١) الحساب الدقيق: كل الدرجات أعداد صحيحة بوحدة «جزء من مئة» داخلياً، فلا تظهر أخطاء مثل 86.74999.
 *   ٢) القالب: ورقة التحكيم كلها إعدادات (أقسام أسئلة وقوائم تحقق، حسم، قواعد إلغاء، تقريب، تقدير، إعادة).
 *   ٣) الحساب: درجة كل سؤال وقسم، والمجموع والتقريب والنسبة والتقدير.
 *   ٤) التجميد: النتيجة المعتمدة تحفظ نسخة من القالب، فتعديله لاحقاً لا يغيّر نتيجة قديمة.
 *   ٥) فهرس المصحف: لكل آية صفحتها وسطر بدايتها ونهايتها.
 *   ٦) النطاق: أجزاء أو سور أو آيات أو صفحات أو أحزاب أو أرباع ← مقاطع بالآية.
 *   ٧) توليد الأسئلة: تقسيم طبقي، وتصنيف الصعوبة بالموضع، وقاعدة آخر السورة، وتقرير التوليد.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ExamCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CORE_VERSION = '1.0.0';
  const EDITION = '1441';

  class ExamError extends Error {
    constructor(code, message, details) { super(message); this.name = 'ExamError'; this.code = code; this.details = details; }
  }

  // ═════════════════════ ١) الحساب الدقيق ═════════════════════
  // الوحدة الداخلية: جزء من مئة من الدرجة. ربع الدرجة = 25 وحدة، ونصفها 50، والدرجة 100.
  const U = 100;
  const hasTwoDecimals = x => Math.abs(x * U - Math.round(x * U)) < 1e-6;
  function toUnits(x, what) {
    if (typeof x !== 'number' || !isFinite(x)) throw new ExamError('BAD_NUMBER', `${what}: ليس رقماً`);
    if (!hasTwoDecimals(x)) throw new ExamError('BAD_PRECISION', `${what}: يقبل منزلتين عشريتين على الأكثر`);
    return Math.round(x * U);
  }
  const fromUnits = v => v / U;

  const clone = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  function deepFreeze(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); }
    return o;
  }
  const isStr = s => typeof s === 'string' && s.trim().length > 0;

  // ═════════════════════ ٢) القالب ═════════════════════
  // رقم إصدار شكل القالب: 1 (أو غيابه) = ما حُفظ قبل إضافة الإعدادات الجديدة، فيُرحَّل بقيم تحفظ سلوكه القديم
  const TEMPLATE_SCHEMA = 2;
  const EXAM_TYPES = ['cumulative', 'levelOnly'];
  const DEFAULT_EXAM_TYPE = { default: 'cumulative', levelOnlyCount: 5, cumulativeCount: 5, cumulativeNew: 3, maxQuestions: 10 };

  // القالب الافتراضي = ورقة التحكيم المعتمدة في الجمعية (حفظ 70 + تجويد 20 + ترتيل وحسن أداء 10).
  // كل رقم فيه إعداد يُعدَّل. سلّم التقدير وسياسة الإعادة فارغان عمداً: سياسة اللجنة تُدخَل ولا تُخترع.
  function defaultTemplate() {
    return {
      id: 'oral-default', name: 'استمارة تحكيم الاختبار الشفوي', version: 1,
      schema: TEMPLATE_SCHEMA,
      header: { org: 'جمعية أفضلكم', department: 'الشؤون التعليمية', unit: 'قسم الإشراف والاختبارات' },
      sections: [
        {
          id: 'hifz', kind: 'questions', name: 'الحفظ', enabled: true,
          // max: عظمى القسم ثابتة؛ كل سؤال من perQuestion، ومجموع الأسئلة يُحوَّل بالنسبة إلى max (مع 5 أسئلة لا تحويل)
          questionCount: 5, perQuestion: 14, max: 70,
          deductions: [
            { id: 'tanbih', name: 'التنبيه أو التردد', value: 0.5, enabled: true },
            { id: 'hifzError', name: 'خطأ في الحفظ', value: 1, enabled: true },
            // اللحن الجلي لا يُحسم في الحفظ؛ يدخل قاعدة الإلغاء ويُرحَّل إلى عنصر «اللحن الجلي» في الترتيل.
            // carryCancelled: هل يُرحَّل لحن السؤال الملغى أيضاً (اعتُمد: لا — الإلغاء يكفي عقوبة)
            { id: 'lahnJali', name: 'لحن جلي', value: 0, enabled: true, carryTo: { section: 'tartil', item: 'lahnJali', enabled: true, carryCancelled: false } }
          ],
          cancelRules: [
            { id: 'hifzOver', counter: 'hifzError', over: 5, enabled: true, label: 'أكثر من خمسة أخطاء في الحفظ في المقطع' },
            { id: 'lahnOver', counter: 'lahnJali', over: 2, enabled: true, label: 'أكثر من لحنين جليين في السؤال' }
          ],
          // surahEndMinPages: علامة «آخر صفحتين من السورة = صعب» تسري على السور التي لا تقل عن هذا العدد من الصفحات (0 = كل السور).
          // اعتُمد 4 (٢٠٢٦-١٠-٠٤): دونه يبقى الجزء 29 صعباً 64%، وفوقه لا يتحسن جزءا تبارك وعمّ ويسقط الحكم عن سور تستحقه.
          // allowMidAyah: الآيات الطويلة يجوز البدء من وسطها (من قائمة ثابتة) · allowRepeatWhenExhausted: تكرار المواضع الأقدم عند نفادها
          plan: { unit: 'lines', length: 5, maxOverflow: 3, difficulty: 'auto', allowSurahCrossing: true, surahEndMinPages: 4, allowMidAyah: true, allowRepeatWhenExhausted: true }
        },
        {
          id: 'tajweed', kind: 'checklist', name: 'التجويد', enabled: true, max: 20, perRepeat: 0.25,
          groups: [
            { name: 'أحكام النون الساكنة والتنوين', items: [
              { id: 'izhar', name: 'الإظهار الحلقي' }, { id: 'idghamGhunna', name: 'الإدغام بغنة' },
              { id: 'idghamNoGhunna', name: 'الإدغام بغير غنة' }, { id: 'ikhfa', name: 'الإخفاء' }, { id: 'iqlab', name: 'الإقلاب' }] },
            { name: 'النون والميم المشددتان', items: [{ id: 'ghunna', name: 'إتمام الغنة' }] },
            { name: 'أحكام المد', items: [{ id: 'madd', name: 'التسوية بين المدود' }] },
            { name: 'صفات الحروف', items: [{ id: 'qalqala', name: 'بيان القلقلة' }] }
          ]
        },
        {
          id: 'tartil', kind: 'checklist', name: 'الترتيل وحسن الأداء', enabled: true, max: 10, perRepeat: 0.25,
          groups: [
            { name: '', items: [
              { id: 'istirsal', name: 'الاسترسال في القراءة' }, { id: 'voice', name: 'حسن الصوت' },
              { id: 'harakat', name: 'إتمام الحركات' }, { id: 'sukun', name: 'تحقيق السكون' },
              { id: 'lahnJali', name: 'اللحن الجلي' }, { id: 'lahnKhafi', name: 'اللحن الخفي' }] }
          ]
        }
      ],
      rounding: { mode: 'nearest', step: 1 },
      // نوع الاختبار في المستويات: تراكمي (من المستوى الأول إلى المختار) أو هذا المستوى فقط؛ والمختبِر يغيّر لكل طالب
      examType: { ...DEFAULT_EXAM_TYPE },
      gradeScale: { grades: [], failLabel: 'لم يجتز' },
      retakePolicy: { enabled: false, maxAttempts: null, waitDays: null, minPercent: null },
      examinerSlots: ['المحكّم الأول', 'المحكّم الثاني'],     // من يكتب اسمه عند اعتماد النتيجة
      signatures: ['المحكّم الأول', 'المحكّم الثاني', 'رئيس قسم الإشراف والاختبارات']
    };
  }

  const ROUND_MODES = ['nearest', 'up', 'down', 'none'];
  const DIFFS = ['easy', 'medium', 'hard'];

  // يفحص القالب ويعيد قائمة أخطاء بالعربية (فارغة = سليم). لا يرمي.
  function validateTemplate(t) {
    const E = [];
    const num = (x, what, { min = 0, gt = false } = {}) => {
      if (typeof x !== 'number' || !isFinite(x)) { E.push(`${what}: يجب أن يكون رقماً`); return false; }
      if (gt ? !(x > min) : !(x >= min)) { E.push(`${what}: يجب أن يكون ${gt ? 'أكبر من' : 'لا يقل عن'} ${min}`); return false; }
      if (!hasTwoDecimals(x)) { E.push(`${what}: منزلتان عشريتان على الأكثر`); return false; }
      return true;
    };
    const int = (x, what, lo, hi) => {
      if (!Number.isInteger(x) || x < lo || (hi != null && x > hi)) { E.push(`${what}: عدد صحيح ${hi != null ? `من ${lo} إلى ${hi}` : `لا يقل عن ${lo}`}`); return false; }
      return true;
    };
    const uniq = (arr, what) => { const seen = new Set(); arr.forEach(id => { if (seen.has(id)) E.push(`${what}: المعرّف «${id}» مكرر`); seen.add(id); }); };

    if (!t || typeof t !== 'object') return ['القالب مفقود'];
    if (!isStr(t.name)) E.push('اسم القالب مطلوب');
    int(t.version, 'رقم نسخة القالب', 1);
    if (!Array.isArray(t.sections) || t.sections.length === 0) { E.push('القالب بلا أقسام'); return E; }
    uniq(t.sections.map(s => s && s.id), 'الأقسام');

    const checklistItems = {};
    t.sections.forEach((s, i) => {
      const where = `القسم ${i + 1}${s && isStr(s.name) ? ` «${s.name}»` : ''}`;
      if (!s || typeof s !== 'object') { E.push(`${where}: غير صالح`); return; }
      if (!isStr(s.id)) E.push(`${where}: معرّف القسم مطلوب`);
      if (!isStr(s.name)) E.push(`${where}: اسم القسم مطلوب`);
      if (s.kind === 'checklist') {
        num(s.max, `${where}: الدرجة العظمى`, { gt: true });
        num(s.perRepeat, `${where}: قيمة الحسم لكل تكرار`, { gt: true });
        if (!Array.isArray(s.groups) || s.groups.length === 0) { E.push(`${where}: لا عناصر`); return; }
        const items = [];
        s.groups.forEach((g, gi) => {
          if (!g || !Array.isArray(g.items)) { E.push(`${where}: المجموعة ${gi + 1} بلا عناصر`); return; }
          g.items.forEach((it, ii) => {
            if (!it || !isStr(it.id) || !isStr(it.name)) E.push(`${where}: عنصر ${ii + 1} في المجموعة ${gi + 1} بلا معرّف أو اسم`);
            else items.push(it.id);
            if (it && it.value != null) num(it.value, `${where}: قيمة حسم العنصر «${it.name}»`, { gt: true });
          });
        });
        if (items.length === 0) E.push(`${where}: لا عناصر`);
        uniq(items, `${where}: العناصر`);
        checklistItems[s.id] = new Set(items);
      } else if (s.kind === 'questions') {
        int(s.questionCount, `${where}: عدد الأسئلة`, 1, 50);
        num(s.perQuestion, `${where}: درجة السؤال`, { gt: true });
        if (s.max != null) num(s.max, `${where}: الدرجة العظمى`, { gt: true });
        const deds = Array.isArray(s.deductions) ? s.deductions : [];
        if (deds.length === 0) E.push(`${where}: لا أنواع حسم`);
        const dids = deds.map(d => d && d.id);
        uniq(dids, `${where}: أنواع الحسم`);
        deds.forEach((d, di) => {
          if (!d || !isStr(d.id) || !isStr(d.name)) { E.push(`${where}: نوع الحسم ${di + 1} بلا معرّف أو اسم`); return; }
          num(d.value, `${where}: قيمة «${d.name}»`);
          if (d.carryTo != null && (typeof d.carryTo !== 'object' || (d.carryTo.carryCancelled != null && typeof d.carryTo.carryCancelled !== 'boolean')))
            E.push(`${where}: ترحيل «${d.name}» غير صالح (ترحيل لحن السؤال الملغى نعم أو لا)`);
        });
        if (s.cancelRules != null && !Array.isArray(s.cancelRules)) E.push(`${where}: قواعد الإلغاء يجب أن تكون قائمة`);
        const rules = Array.isArray(s.cancelRules) ? s.cancelRules : [];
        uniq(rules.map(r => r && r.id), `${where}: قواعد الإلغاء`);
        rules.forEach((r, ri) => {
          if (!r || !isStr(r.id)) { E.push(`${where}: قاعدة الإلغاء ${ri + 1} بلا معرّف`); return; }
          if (!dids.includes(r.counter)) E.push(`${where}: قاعدة الإلغاء «${r.label || r.id}» تشير إلى عدّاد غير موجود «${r.counter}»`);
          int(r.over, `${where}: حد قاعدة الإلغاء «${r.label || r.id}»`, 0);
        });
        validatePlan(s.plan, s.questionCount, where, E);
      } else {
        E.push(`${where}: نوع القسم يجب أن يكون questions أو checklist`);
      }
    });
    // الترحيل يشير إلى قسم قائمة وعنصر موجودين
    t.sections.forEach(s => {
      if (!s || s.kind !== 'questions' || !Array.isArray(s.deductions)) return;
      s.deductions.forEach(d => {
        if (!d || !d.carryTo || typeof d.carryTo !== 'object') return;
        const c = d.carryTo;
        if (!checklistItems[c.section] || !checklistItems[c.section].has(c.item)) E.push(`القسم «${s.name}»: «${d.name}» يُرحَّل إلى عنصر غير موجود (${c.section} / ${c.item})`);
      });
    });
    if (!t.sections.some(s => s && s.enabled !== false)) E.push('كل الأقسام موقوفة');

    const r = t.rounding || {};
    if (!ROUND_MODES.includes(r.mode)) E.push(`التقريب: الطريقة يجب أن تكون ${ROUND_MODES.join(' أو ')}`);
    else if (r.mode !== 'none') num(r.step, 'التقريب: الخطوة', { gt: true });

    if (t.examinerSlots != null && (!Array.isArray(t.examinerSlots) || t.examinerSlots.length < 1 || t.examinerSlots.length > 5 || !t.examinerSlots.every(isStr)))
      E.push('خانات المحكّمين: من خانة إلى خمس، ولكل خانة اسم');
    if (t.schema != null) int(t.schema, 'رقم إصدار شكل القالب', 1);
    const et = t.examType;
    if (et != null) {
      if (typeof et !== 'object') E.push('نوع الاختبار: الإعدادات غير صالحة');
      else {
        if (!EXAM_TYPES.includes(et.default)) E.push('نوع الاختبار: الافتراضي يجب أن يكون «تراكمي» أو «هذا المستوى فقط»');
        if (int(et.maxQuestions, 'نوع الاختبار: الحد الأعلى للأسئلة', 1, 50)) {
          int(et.levelOnlyCount, 'نوع الاختبار: عدد أسئلة «هذا المستوى فقط»', 1, et.maxQuestions);
          // التراكمي فيه سؤال واحد على الأقل من الجديد وواحد من السابق، وإلا لم يكن تراكمياً
          if (int(et.cumulativeCount, 'نوع الاختبار: عدد أسئلة التراكمي', 2, et.maxQuestions))
            int(et.cumulativeNew, 'نوع الاختبار: أسئلة المستوى الجديد في التراكمي', 1, et.cumulativeCount - 1);
        }
      }
    }
    E.push(...validateGradeScale(t.gradeScale));
    const rp = t.retakePolicy;
    if (rp && rp.enabled) {
      if (rp.maxAttempts != null) int(rp.maxAttempts, 'الإعادة: عدد المحاولات', 1);
      if (rp.waitDays != null) int(rp.waitDays, 'الإعادة: أيام الانتظار', 0);
      if (rp.minPercent != null && num(rp.minPercent, 'الإعادة: أدنى نسبة', { min: 0 }) && rp.minPercent > 100) E.push('الإعادة: أدنى نسبة لا تتجاوز 100');
    }
    return E;
  }

  function validatePlan(p, count, where, E) {
    if (!p || typeof p !== 'object') { E.push(`${where}: خطة الأسئلة مفقودة`); return; }
    if (!['lines', 'ayahs'].includes(p.unit)) E.push(`${where}: وحدة طول السؤال يجب أن تكون lines أو ayahs`);
    if (!Number.isInteger(p.length) || p.length < 1 || p.length > 200) E.push(`${where}: طول السؤال عدد صحيح من 1 إلى 200`);
    if (!Number.isInteger(p.maxOverflow) || p.maxOverflow < 0) E.push(`${where}: الحد الأقصى لزيادة الطول عدد صحيح لا يقل عن 0`);
    if (typeof p.allowSurahCrossing !== 'boolean') E.push(`${where}: عبور السور يجب أن يكون نعم أو لا`);
    if (p.surahEndMinPages != null && (!Number.isInteger(p.surahEndMinPages) || p.surahEndMinPages < 0 || p.surahEndMinPages > 604)) E.push(`${where}: حد صفحات السورة لعلامة «آخر السورة» عدد صحيح من 0 إلى 604`);
    if (p.allowMidAyah != null && typeof p.allowMidAyah !== 'boolean') E.push(`${where}: البدء من وسط الآيات الطويلة يجب أن يكون نعم أو لا`);
    if (p.allowRepeatWhenExhausted != null && typeof p.allowRepeatWhenExhausted !== 'boolean') E.push(`${where}: تكرار المواضع عند نفادها يجب أن يكون نعم أو لا`);
    if (p.difficulty !== 'auto') {
      const d = p.difficulty;
      if (!d || typeof d !== 'object' || !DIFFS.every(k => Number.isInteger(d[k]) && d[k] >= 0)) E.push(`${where}: توزيع الصعوبة يجب أن يكون «تلقائي» أو أعداداً صحيحة للسهل والمتوسط والصعب`);
      else if (DIFFS.reduce((n, k) => n + d[k], 0) !== count) E.push(`${where}: مجموع توزيع الصعوبة (${DIFFS.reduce((n, k) => n + d[k], 0)}) لا يساوي عدد الأسئلة (${count})`);
    }
  }

  // يرقّي قالباً محفوظاً إلى الشكل الحالي دون أن يمسّ الأصل. لا يرمي ولا يرفض حقلاً قديماً.
  // القالب القديم (بلا schema) يأخذ قيماً تحفظ سلوكه القديم حرفياً، فتُعاد حساب نتائجه ومسوداته كما كانت:
  // لحن السؤال الملغى يُرحَّل كما كان، ولا بدء من وسط الآيات، ولا تكرار للمواضع. والقالب الجديد يأخذ القيم المعتمدة.
  function migrateTemplate(t) {
    if (!t || typeof t !== 'object' || Array.isArray(t)) return t;
    const n = clone(t), old = !Number.isInteger(n.schema) || n.schema < TEMPLATE_SCHEMA;
    (Array.isArray(n.sections) ? n.sections : []).forEach(s => {
      if (!s || s.kind !== 'questions') return;
      // العظمى القديمة كانت تُشتق: درجة السؤال × العدد (= 70 في الورقة المعتمدة)
      if (s.max == null && typeof s.perQuestion === 'number' && isFinite(s.perQuestion) && Number.isInteger(s.questionCount))
        s.max = Math.round(s.perQuestion * U) * s.questionCount / U;
      (Array.isArray(s.deductions) ? s.deductions : []).forEach(d => {
        if (d && d.carryTo && typeof d.carryTo === 'object' && d.carryTo.carryCancelled == null) d.carryTo.carryCancelled = old;
      });
      if (s.plan && typeof s.plan === 'object') {
        if (s.plan.allowMidAyah == null) s.plan.allowMidAyah = !old;
        if (s.plan.allowRepeatWhenExhausted == null) s.plan.allowRepeatWhenExhausted = !old;
      }
    });
    if (n.examType == null) n.examType = { ...DEFAULT_EXAM_TYPE };
    n.schema = TEMPLATE_SCHEMA;
    return n;
  }

  // يملأ القيم الضمنية (enabled = true ...) ويرمي إن كان القالب غير سليم
  function normalizeTemplate(t) {
    const m = migrateTemplate(t);
    const errors = validateTemplate(m);
    if (errors.length) throw new ExamError('INVALID_TEMPLATE', 'القالب غير سليم:\n- ' + errors.join('\n- '), { errors });
    const n = clone(m);
    n.sections.forEach(s => {
      s.enabled = s.enabled !== false;
      if (s.kind === 'questions') {
        s.deductions.forEach(d => { d.enabled = d.enabled !== false; if (d.carryTo) d.carryTo.enabled = d.carryTo.enabled !== false; });
        s.cancelRules = (s.cancelRules || []).map(r => ({ ...r, enabled: r.enabled !== false }));
      } else {
        s.groups.forEach(g => g.items.forEach(it => { it.enabled = it.enabled !== false; }));
      }
    });
    n.gradeScale = n.gradeScale || { grades: [], failLabel: 'لم يجتز' };
    n.examinerSlots = n.examinerSlots || ['المحكّم'];
    n.retakePolicy = n.retakePolicy || { enabled: false };
    return n;
  }

  // قالب الاختبار الواحد: نسخة مطبَّعة بعدد الأسئلة الفعلي لهذا الطالب. تُكتب قبل التوليد وقبل إنشاء العدّادات،
  // وتُجمَّد في المسودة، فيُحسب الاختبار وتُعاد حسابه من العدد الذي اختُبر به فعلاً. العظمى تبقى كما هي (الحفظ بالنسبة).
  function examTemplate(template, { questionCount } = {}) {
    const n = normalizeTemplate(template);
    if (questionCount == null) return n;
    const s = n.sections.find(x => x.kind === 'questions' && x.enabled);
    if (!s || s.questionCount === questionCount) return n;
    // توزيع صعوبة ثابت يُعاد بالنسبة نفسها للعدد الجديد (أكبر الكسور أولاً)، وإلا رُفض لأن مجموعه لا يساوي العدد
    if (s.plan && s.plan.difficulty !== 'auto' && s.plan.difficulty && typeof s.plan.difficulty === 'object')
      s.plan.difficulty = scaleMix(s.plan.difficulty, questionCount);
    s.questionCount = questionCount;
    return normalizeTemplate(n);
  }
  // يوزّع n على السهل والمتوسط والصعب بنسب mix: الأجزاء الصحيحة أولاً، ثم الباقي لأكبر الكسور (التعادل بترتيب سهل ← متوسط ← صعب)
  function scaleMix(mix, n) {
    const total = DIFFS.reduce((a, k) => a + mix[k], 0);
    if (!total) return { ...autoMix(n) };
    const exact = DIFFS.map(k => mix[k] * n / total), out = {};
    DIFFS.forEach((k, i) => { out[k] = Math.floor(exact[i]); });
    let left = n - DIFFS.reduce((a, k) => a + out[k], 0);
    DIFFS.map((k, i) => [k, exact[i] - out[k], i]).sort((a, b) => b[1] - a[1] || a[2] - b[2]).forEach(([k]) => { if (left > 0) { out[k]++; left--; } });
    return out;
  }

  // وصف ترحيل نوع حسم للمحكّم: إلى أي قسم يُحسب، أو تنبيه إن كان الهدف موقوفاً (فلا يُقال «يُحسب» وهو لا يُحسب)
  function describeCarry(tpl, d) {
    if (!d || !d.carryTo || d.carryTo.enabled === false) return null;
    const sec = (tpl.sections || []).find(s => s && s.id === d.carryTo.section);
    const item = sec && Array.isArray(sec.groups) ? sec.groups.flatMap(g => g.items || []).find(it => it && it.id === d.carryTo.item) : null;
    if (!sec || !item) return { active: false, text: 'لا يُحسب: الترحيل إلى عنصر غير موجود' };
    if (sec.enabled === false) return { active: false, text: `لا يُحسب: قسم «${sec.name}» موقوف` };
    if (item.enabled === false) return { active: false, text: `لا يُحسب: عنصر «${item.name}» موقوف` };
    return { active: true, text: `يُحسب في ${sec.name}` };
  }

  // نسخة جديدة من القالب برقم نسخة أعلى (تُستدعى عند كل حفظ لتعديل)
  function bumpVersion(t) { const n = clone(t); n.version = (Number.isInteger(n.version) ? n.version : 0) + 1; return n; }

  // عظمى القسم: حقل max (قسم الأسئلة المرحَّل يحمله دائماً)، وإلا درجة السؤال × العدد كما كان
  const sectionMax = s => (s.kind === 'questions' && s.max == null ? toUnits(s.perQuestion, 'درجة السؤال') * s.questionCount : toUnits(s.max, 'الدرجة العظمى'));

  // ═════════════════════ سلّم التقدير ═════════════════════
  // كل تقدير له «حد أدنى» بالنسبة فقط؛ الحد الأعلى يُشتق مما فوقه، فيستحيل وجود فجوة أو تداخل.
  // ما دون أدنى تقدير = «لم يجتز». السلّم الفارغ = لا تقدير ولا حكم بالنجاح (حتى تضبطه اللجنة).
  function validateGradeScale(gs) {
    const E = [];
    if (!gs) return E;
    if (!Array.isArray(gs.grades)) return ['سلّم التقدير: القائمة غير صالحة'];
    if (gs.grades.length && !isStr(gs.failLabel)) E.push('سلّم التقدير: اسم «لم يجتز» مطلوب');
    const mins = new Set(), names = new Set();
    gs.grades.forEach((g, i) => {
      if (!g || !isStr(g.name)) { E.push(`سلّم التقدير: التقدير ${i + 1} بلا اسم`); return; }
      if (names.has(g.name)) E.push(`سلّم التقدير: الاسم «${g.name}» مكرر`); names.add(g.name);
      if (typeof g.min !== 'number' || !isFinite(g.min) || g.min < 0 || g.min > 100 || !hasTwoDecimals(g.min)) { E.push(`سلّم التقدير: حد «${g.name}» يجب أن يكون نسبة من 0 إلى 100 بمنزلتين على الأكثر`); return; }
      if (mins.has(g.min)) E.push(`سلّم التقدير: الحد ${g.min}% مكرر`); mins.add(g.min);
    });
    return E;
  }
  const sortedGrades = gs => (gs && gs.grades ? gs.grades.slice().sort((a, b) => b.min - a.min) : []);

  // R و T بالوحدات الداخلية؛ المقارنة R/T*100 >= min بأعداد صحيحة: R*10000 >= minUnits*T
  function gradeFor(gs, R, T) {
    const grades = sortedGrades(gs);
    if (!grades.length) return { grade: null, passed: null };
    for (const g of grades) if (R * U * U >= toUnits(g.min, 'حد التقدير') * T) return { grade: g.name, passed: true };
    return { grade: gs.failLabel, passed: false };
  }

  // الحدود المشتقة للعرض: [من، إلى) لكل تقدير، وأعلاها إلى 100
  function describeGradeScale(gs) {
    const grades = sortedGrades(gs);
    if (!grades.length) return [];
    const out = grades.map((g, i) => ({ name: g.name, from: g.min, to: i === 0 ? 100 : grades[i - 1].min, toInclusive: i === 0, passed: true }));
    const low = grades[grades.length - 1].min;
    if (low > 0) out.push({ name: gs.failLabel, from: 0, to: low, toInclusive: false, passed: false });
    return out;
  }

  // ═════════════════════ ٣) الحساب ═════════════════════
  // عدّادات فارغة على شكل القالب (كم مرة سُجّل كل خطأ)
  function newCounters(t) {
    const tpl = normalizeTemplate(t);
    const c = { sections: {} };
    tpl.sections.forEach(s => {
      if (s.kind === 'questions') {
        c.sections[s.id] = { questions: Array.from({ length: s.questionCount }, () => Object.fromEntries(s.deductions.map(d => [d.id, 0]))) };
      } else {
        c.sections[s.id] = { items: Object.fromEntries(s.groups.flatMap(g => g.items).map(it => [it.id, 0])) };
      }
    });
    return c;
  }

  const count = (obj, key, where) => {
    const v = obj && obj[key] != null ? obj[key] : 0;
    if (!Number.isInteger(v) || v < 0) throw new ExamError('BAD_COUNTER', `${where}: العدّاد «${key}» يجب أن يكون عدداً صحيحاً غير سالب`);
    return v;
  };

  function applyRounding(units, r) {
    if (!r || r.mode === 'none') return units;
    const S = toUnits(r.step, 'خطوة التقريب');
    if (r.mode === 'nearest') return Math.floor((units + S / 2) / S) * S;   // النصف يُرفع: 86.5 ← 87
    if (r.mode === 'up') return Math.ceil(units / S) * S;
    return Math.floor(units / S) * S;
  }

  function computeResult(t, counters) {
    const tpl = normalizeTemplate(t);
    const C = (counters && counters.sections) || {};
    const carried = {};    // carried[section][item] = عدد مرحَّل من أقسام الأسئلة
    const out = [];

    tpl.sections.filter(s => s.kind === 'questions').forEach(s => {
      const per = toUnits(s.perQuestion, 'درجة السؤال');
      const qs = (C[s.id] && C[s.id].questions) || [];
      // العدد يساوي القالب تماماً: عدّادات ناقصة كانت تُحسب أسئلةً بلا أخطاء، فتعطي درجة كاملة بصمت
      if (qs.length !== s.questionCount) throw new ExamError('BAD_COUNTER', `القسم «${s.name}»: عدد الأسئلة في العدّادات (${qs.length}) لا يساوي عددها في القالب (${s.questionCount})`);
      const questions = [];
      for (let i = 0; i < s.questionCount; i++) {
        const q = qs[i] || {};
        const where = `القسم «${s.name}» السؤال ${i + 1}`;
        // الإلغاء يُعرف أولاً، ثم يُرحَّل اللحن: لحن السؤال الملغى لا يُرحَّل إلا إن نصّ القالب (carryCancelled)
        const reasons = s.cancelRules.filter(r => r.enabled && s.deductions.find(d => d.id === r.counter).enabled && count(q, r.counter, where) > r.over).map(r => r.label || r.id);
        const cancelled = reasons.length > 0;
        let deducted = 0;
        s.deductions.forEach(d => {
          const n = count(q, d.id, where);
          if (d.enabled) deducted += n * toUnits(d.value, d.name);
          if (s.enabled && d.enabled && d.carryTo && d.carryTo.enabled && n > 0 && (!cancelled || d.carryTo.carryCancelled)) {
            const k = d.carryTo; (carried[k.section] = carried[k.section] || {})[k.item] = ((carried[k.section] || {})[k.item] || 0) + n;
          }
        });
        const score = cancelled ? 0 : Math.max(0, per - deducted);
        questions.push({ n: i + 1, max: fromUnits(per), deducted: fromUnits(deducted), score: fromUnits(score), cancelled, cancelReasons: reasons, _u: score });
      }
      // الحفظ بالنسبة: كل سؤال من درجته، ومجموع الأسئلة يُحوَّل إلى عظمى القسم الثابتة.
      // مع 5 أسئلة × 14 = 70 لا تحويل أصلاً، فالحساب كما كان حرفياً. والتقريب مرة واحدة لأقرب جزء من مئة.
      const rawMax = per * s.questionCount, raw = questions.reduce((a, q) => a + q._u, 0);
      const max = sectionMax(s), scaled = max !== rawMax;
      const score = scaled ? Math.round(raw * max / rawMax) : raw;
      questions.forEach(q => delete q._u);
      out.push({ id: s.id, name: s.name, kind: s.kind, enabled: s.enabled, max: fromUnits(max), score: fromUnits(score), deducted: fromUnits(max - score), questions,
        ...(scaled ? { questionsTotal: fromUnits(raw), questionsMax: fromUnits(rawMax) } : {}), _max: max, _score: score });
    });

    tpl.sections.filter(s => s.kind === 'checklist').forEach(s => {
      const max = toUnits(s.max, 'الدرجة العظمى');
      const base = toUnits(s.perRepeat, 'قيمة الحسم');
      const items = (C[s.id] && C[s.id].items) || {};
      let deducted = 0;
      const rows = s.groups.flatMap(g => g.items).map(it => {
        const direct = count(items, it.id, `القسم «${s.name}»`);
        const fromCarry = (carried[s.id] && carried[s.id][it.id]) || 0;
        const repeats = direct + fromCarry;
        const value = it.value != null ? toUnits(it.value, it.name) : base;
        if (it.enabled) deducted += repeats * value;
        return { id: it.id, name: it.name, enabled: it.enabled, value: fromUnits(value), repeats: it.enabled ? repeats : 0, carried: it.enabled ? fromCarry : 0, deducted: it.enabled ? fromUnits(repeats * value) : 0 };
      });
      const score = Math.max(0, max - deducted);
      out.push({ id: s.id, name: s.name, kind: s.kind, enabled: s.enabled, max: fromUnits(max), score: fromUnits(score), deducted: fromUnits(max - score), items: rows, _max: max, _score: score });
    });

    // ترتيب الأقسام كما في القالب
    const order = tpl.sections.map(s => s.id);
    out.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    const on = out.filter(s => s.enabled);
    const T = on.reduce((a, s) => a + s._max, 0);
    const raw = on.reduce((a, s) => a + s._score, 0);
    // التقريب لا يتجاوز العظمى ولا ينزل عن صفر (التقريب لأعلى أو بخطوة كبيرة قد يتجاوزها: 99.5 ← 100 من 99.5)
    const R = Math.min(T, Math.max(0, applyRounding(raw, tpl.rounding)));
    const g = gradeFor(tpl.gradeScale, R, T);
    out.forEach(s => { delete s._max; delete s._score; });
    return {
      sections: out,
      totalMax: fromUnits(T),
      total: fromUnits(raw),
      rounded: fromUnits(R),
      // للعرض فقط، ومقطوعة لا مقرّبة فتتسق مع التقدير (80 من 90 = 88.88 لا 88.89 التي توهم ببلوغ حدّ 88.89)
      percent: Math.floor(R * 10000 / T) / 100,
      grade: g.grade,
      passed: g.passed,
      certificateAllowed: g.passed === true
    };
  }

  // ═════════════════════ ٤) التجميد والإعادة ═════════════════════
  // سؤال كما يُحفظ في النتيجة المعتمدة: موضعه وحدّا الكلمة وصفحته وسطره وطوله، والصعوبة المطلوبة والفعلية وإشاراتها.
  // هذه بيانات «ذكاء الصعوبة» لاحقاً (أي موضع أخطأ فيه الطلاب)، فلا يُختصر منها شيء.
  const QUESTION_FIELDS = ['n', 'from', 'to', 'fromAbs', 'toAbs', 'start', 'end', 'length', 'ayahs', 'lines', 'difficulty', 'wanted', 'signals', 'crossesSurah', 'crossesPage', 'anchored', 'notes'];
  function questionRecord(q) {
    const r = {};
    QUESTION_FIELDS.forEach(k => { if (q[k] !== undefined) r[k] = clone(q[k]); });
    r.fromWord = q.fromWord == null ? null : q.fromWord;
    r.toWord = q.toWord == null ? null : q.toWord;
    return r;
  }

  // النتيجة المعتمدة. نهائية الشكل من الخطوة ٤: تحفظ الأسئلة مقسّمة بأقسامها، وحدود الكلمة، والمستويات ونوع الاختبار،
  // والمحكّمين نصوصاً أو كائنات { id، name }، فلا تُفتح هذه الدالة مرة أخرى في الخطوات اللاحقة.
  function finalizeResult({ template, counters, form = null, candidate = null, examiners = [], attempt = 1, isTest = false, approvedAt = null, levels = null, examType = null }) {
    const snap = normalizeTemplate(template);
    const computed = computeResult(snap, counters);
    let f = null;
    if (form) {
      const parts = (form.parts || []).map(p => ({ sectionId: p.sectionId, sectionName: p.sectionName, questions: (p.questions || []).map(questionRecord) }));
      // الأسئلة تُحفظ مرة واحدة داخل أقسامها (ذاكرة الجهاز محدودة)؛ والقائمة المسطّحة تُشتق عند القراءة (normalizeStoredResult)
      f = { seed: form.seed, edition: form.edition, source: form.source == null ? null : clone(form.source), parts };
      if (!parts.length) f.questions = (form.questions || []).map(questionRecord);
    }
    return deepFreeze({
      schema: 2, coreVersion: CORE_VERSION, status: 'approved', approvedAt,
      templateId: snap.id || null, templateVersion: snap.version,
      templateSnapshot: snap,
      form: f,
      candidate: clone(candidate), examiners: clone(examiners), attempt, isTest: !!isTest,
      levels: levels == null ? null : clone(levels), examType: examType == null ? null : clone(examType),
      counters: clone(counters), computed
    });
  }
  // يعيد الحساب من نسخة القالب المحفوظة في النتيجة نفسها (لا من القالب الحالي)
  const recomputeResult = result => computeResult(result.templateSnapshot, result.counters);

  // ═════════════════════ تطبيع المحفوظ قبل التحديث ═════════════════════
  // تُستدعى عند قراءة أي مسودة أو نتيجة، فيعمل الكود الجديد على المحفوظ قديماً دون شروط متناثرة في الواجهة.
  // لا تمسّ الأصل ولا القالب المجمَّد (التاريخ يبقى كما حُفظ)؛ تعيد نسخة بالحقول الجديدة.
  const examinerName = x => (x && typeof x === 'object' ? (typeof x.name === 'string' ? x.name : '') : (typeof x === 'string' ? x : ''));
  const normExaminer = x => (x && typeof x === 'object' ? { ...x, id: x.id == null ? null : x.id, name: examinerName(x) } : { id: null, name: examinerName(x) });
  const normQuestion = q => (q && typeof q === 'object' ? { ...q, fromWord: q.fromWord == null ? null : q.fromWord, toWord: q.toWord == null ? null : q.toWord } : q);
  function normForm(f) {
    if (!f || typeof f !== 'object') return f;
    if (Array.isArray(f.questions)) f.questions = f.questions.map(normQuestion);
    if (Array.isArray(f.parts)) f.parts.forEach(p => { if (p && Array.isArray(p.questions)) p.questions = p.questions.map(normQuestion); });
    // النتيجة الجديدة تحفظ الأسئلة في أقسامها فقط؛ القائمة المسطّحة تُشتق هنا لمن يقرؤها
    if (!Array.isArray(f.questions) && Array.isArray(f.parts)) f.questions = f.parts.flatMap(p => (p && Array.isArray(p.questions) ? p.questions : []));
    return f;
  }
  // ═══ قائمة المحكّمين ═══
  // كل محكّم { id، name } ثابت المعرّف، فيُقاس تشدد كل محكّم عبر نتائجه حتى لو تغيّرت كتابة اسمه.
  function validateExaminers(list) {
    if (!Array.isArray(list)) return ['قائمة المحكّمين غير صالحة'];
    const E = [], ids = new Set(), names = new Set();
    list.forEach((x, i) => {
      if (!x || !isStr(x.id)) E.push(`المحكّم ${i + 1}: معرّف مطلوب`); else if (ids.has(x.id)) E.push(`المحكّم ${i + 1}: المعرّف مكرر`); else ids.add(x.id);
      const n = x && typeof x.name === 'string' ? x.name.trim() : '';
      if (!n) E.push(`المحكّم ${i + 1}: الاسم مطلوب`); else if (names.has(n)) E.push(`الاسم «${n}» مكرر`); else names.add(n);
    });
    return E;
  }
  // المحكّمون المختارون عند الاعتماد: الخانات الفارغة تُهمل، ولا يتكرر محكّم في خانتين، ولا اعتماد بلا محكّم.
  // والاسم القديم بلا معرّف (مسودة قبل القائمة) يبقى باسمه.
  function resolveExaminers(slots) {
    const out = [];
    for (const x of Array.isArray(slots) ? slots : []) {
      const name = examinerName(x).trim(); if (!name) continue;
      const id = x && typeof x === 'object' && x.id != null ? x.id : null;
      if (out.some(o => (id != null && o.id === id) || o.name === name)) return { ok: false, error: `المحكّم «${name}» مختار مرتين` };
      out.push({ id, name });
    }
    return out.length ? { ok: true, examiners: out } : { ok: false, error: 'اختر محكّماً واحداً على الأقل' };
  }

  function normalizeStoredResult(r) {
    if (!r || typeof r !== 'object') return r;
    const n = clone(r);
    n.examiners = (Array.isArray(n.examiners) ? n.examiners : []).map(normExaminer);
    n.form = normForm(n.form);
    if (n.levels === undefined) n.levels = null;
    if (n.examType === undefined) n.examType = null;
    // قيمة الحسم لكل عنصر تُقرأ من القالب المجمَّد (لا من القسمة، فتصح للعنصر الذي لم يتكرر)
    const tpl = n.templateSnapshot && Array.isArray(n.templateSnapshot.sections) ? n.templateSnapshot : null;
    if (tpl && n.computed && Array.isArray(n.computed.sections)) n.computed.sections.forEach(cs => {
      if (!Array.isArray(cs.items)) return;
      const ts = tpl.sections.find(s => s && s.id === cs.id);
      if (!ts || !Array.isArray(ts.groups)) return;
      const all = ts.groups.flatMap(g => (g && Array.isArray(g.items) ? g.items : []));
      // value يُوضع في موضعه من computeResult (بعد enabled) لتتطابق النسخة المطبَّعة مع إعادة الحساب حرفياً
      cs.items = cs.items.map(it => {
        if (!it || it.value != null) return it;
        const ti = all.find(x => x && x.id === it.id), v = ti && ti.value != null ? ti.value : ts.perRepeat;
        if (typeof v !== 'number') return it;
        const { id, name, enabled, ...rest } = it;
        return { id, name, enabled, value: v, ...rest };
      });
    });
    return n;
  }
  // المسودة لم تُعتمد بعد، فقالبها المجمَّد يُرحَّل أيضاً (بقيم تحفظ سلوكه القديم)، فتقرأ الواجهة حقوله الجديدة مباشرة
  function normalizeStoredDraft(d) {
    if (!d || typeof d !== 'object') return d;
    const n = clone(d);
    n.examiners = (Array.isArray(n.examiners) ? n.examiners : []).map(normExaminer);
    n.form = normForm(n.form);
    n.templateSnapshot = migrateTemplate(n.templateSnapshot);
    if (n.levels === undefined) n.levels = null;
    if (n.examType === undefined) n.examType = null;
    return n;
  }

  // history: محاولات المرشح السابقة بالترتيب [{ percent, passed, date (ms) }]
  function retakeDecision(policy, history, now) {
    if (!policy || !policy.enabled) return { allowed: null, reason: 'سياسة الإعادة غير مضبوطة' };
    const last = history && history[history.length - 1];
    if (!last) return { allowed: false, reason: 'لا محاولة سابقة' };
    if (last.passed === true) return { allowed: false, reason: 'اجتاز في المحاولة الأخيرة' };
    if (policy.maxAttempts != null && history.length >= policy.maxAttempts) return { allowed: false, reason: `استنفد المحاولات (${policy.maxAttempts})` };
    if (policy.minPercent != null && last.percent < policy.minPercent) return { allowed: false, reason: `نسبته ${last.percent}% دون الحد الأدنى للإعادة ${policy.minPercent}%` };
    if (policy.waitDays != null && now - last.date < policy.waitDays * 86400000) return { allowed: false, reason: `يجب الانتظار ${policy.waitDays} يوماً بعد آخر محاولة`, availableAt: last.date + policy.waitDays * 86400000 };
    return { allowed: true, reason: 'يجوز إعادة الاختبار بنموذج مختلف' };
  }

  // ═════════════════════ الآيات الطويلة ═════════════════════
  // الآيات التي اعتمد صاحب المشروع البدء من وسطها (١٦ بداية في ٧ آيات). أرقام فقط، بلا نص قرآني:
  //   words: عدد كلمات الآية · starts: أرقام كلمات البدء (من 0) · stops: أرقام الكلمات التي يجوز الوقف بعدها
  //   (عليها صلى أو قلى أو الجائز أو اللازم؛ لا المعانقة ولا السكتة، ولا آخر كلمة لأنها آخر الآية)
  //   lines: لكل سطر من أسطر الآية [أول كلمة منها في السطر، كلمات آيات قبلها في السطر، كلماتها فيه، كل كلمات السطر]
  // الترقيم بكلمات المصحف نفسها التي تعرضها الواجهة (علامة الربع ۞ ليست كلمة، والعلامة المنفصلة تلحق كلمتها).
  // ولّدها نص مجمع الملك فهد (طبعة 1441) وأسطره، والفحوص تحمّل النص وتطابق كل رقم هنا كلمةً كلمة.
  const LONG_AYAHS = {"2:102":{"words":74,"starts":[7,56],"stops":[6,22,33,41,50,55,65,70],"lines":[[0,0,9,9],[9,0,6,6],[15,0,8,8],[23,0,10,10],[33,0,8,8],[41,0,10,10],[51,0,8,8],[59,0,11,11],[70,0,4,8]]},"2:282":{"words":128,"starts":[51,77,107,120],"stops":[9,13,21,33,50,54,70,76,85,106,109,114,119,121,123],"lines":[[0,0,9,9],[9,0,7,7],[16,0,8,8],[24,0,10,10],[34,0,11,11],[45,0,8,8],[53,0,8,8],[61,0,8,8],[69,0,10,10],[79,0,9,9],[88,0,10,10],[98,0,7,7],[105,0,8,8],[113,0,8,8],[121,0,7,7]]},"4:12":{"words":88,"starts":[49],"stops":[9,17,24,33,41,48,63,72,81,84],"lines":[[0,0,8,8],[8,0,9,9],[17,0,8,8],[25,0,9,9],[34,0,8,8],[42,0,9,9],[51,0,10,10],[61,0,8,8],[69,0,8,8],[77,0,9,9],[86,0,2,8]]},"5:41":{"words":67,"starts":[26,40,50],"stops":[25,30,39,49,57,61],"lines":[[0,7,1,8],[1,0,8,8],[9,0,8,8],[17,0,6,6],[23,0,8,8],[31,0,8,8],[39,0,10,10],[49,0,10,10],[59,0,8,8]]},"5:110":{"words":63,"starts":[26,46],"stops":[19,25,37,41,45],"lines":[[0,4,6,10],[6,0,8,8],[14,0,8,8],[22,0,6,6],[28,0,8,8],[36,0,8,8],[44,0,8,8],[52,0,8,8],[60,0,3,9]]},"24:31":{"words":78,"starts":[14,70],"stops":[13,17,61,69],"lines":[[0,0,6,6],[6,0,9,9],[15,0,8,8],[23,0,10,10],[33,0,10,10],[43,0,10,10],[53,0,9,9],[62,0,9,9],[71,0,7,7]]},"24:61":{"words":76,"starts":[49,57],"stops":[48,56,68],"lines":[[0,4,5,9],[5,0,10,10],[15,0,9,9],[24,0,7,7],[31,0,8,8],[39,0,7,7],[46,0,7,7],[53,0,8,8],[61,0,9,9],[70,0,6,6]]}};
  deepFreeze(LONG_AYAHS);
  const longAyah = (ix, ai) => (ix.longAyahs && ix.longAyahs[ai]) || null;

  // آيات قصيرة بين جارتين كبيرتين (قرار صاحب المشروع ٢٠٢٦-١٠-١٨): لا يتسع لها سؤال بآيات كاملة من الأمام ولا من الخلف،
  // فيبدأ السؤال من أولها ويجوز أن يقف عند علامة وقف مسموحة داخل الآية التالية لها (القاعدة نفسها للآيات الطويلة).
  // المفتاح الآية المحبوسة، والقيمة أرقام الكلمات في الآية التالية لها التي يجوز الوقف بعدها. أرقام فقط، يولّدها نص المجمع.
  const TRAPPED_AYAHS = {"2:234":[12,25,33,41],"2:248":[23,28,41,56],"3:153":[10,20,27,32,39,49,61,70],"4:91":[7,21,32,46,55],"5:4":[3,12,31],"7:156":[29],"8:41":[9,30]};
  deepFreeze(TRAPPED_AYAHS);
  const trappedStops = (ix, ai) => (ix.trapped && ix.trapped[ai]) || null;

  // عدد كلمات كل آية من آيات المصحف (٦٢٣٦) بالترقيم نفسه، حرفان بأساس ٣٦ لكل آية. منه يُعرف كم كلمةً في كل سطر
  // لغير المقروء من سطر يشترك فيه السؤال مع آية مجاورة. أرقام فقط، يولّدها نص المجمع، والفحوص تطابقه كلمةً كلمة.
  const AYAH_WORDS_36 = '040402030403090107080c080b0c0b0a0c0b070j0g070b0h060j0p0b0n0k0d0y130k0d0j0s0f0c0m0d0i0j0b0h0a0d0i08070a08080b0j0i0a0c08070q0e070i0k0i0s1n0o0f0d0c090k0n0i0h0o0a0b110j0n090b0o0n0d0a0t0f1d0d0s0a0q0r0u0b0r0h090p0i0c0a0a0m220c0c0p0j0h0i0x0h0i0h0v0u0c0e0b0o0a0v0f0b0i0j0m0u0e0h0g0i090g0r0f0f0v0j0a0e0u0f0l190y0w0e070j0h0v0h060a0d0c0a090o0k0b0d0909170v0c0n0g0b0m0i0e0p0t0b0e1f11080g0e0g0e0w180h1t0h0r0d0p060f0m0e210t0q0c0o0e080p0h0e0c0b0f0c0h0k0k1d0u0m0p1l0g0q0q130r0g0e0e0d07141a0u190x1s0p1b0p0z080f0r06070s090g1i170u1o0f0r091g0l1e0o0o171v130o0o0b120r0z0t0d0g0f0k0s0u0h190b0j0d0h0e0f3k0w0s0r1d01070b0i0b0d1a0f0d0g0e090t0o0o0b060i0q0q0i0b0k0f0f0p0l0r0m0q0e0b0b070i0o0y0f0k0h0k0c070k0k070n05190j080k09060u0d0b070f070p0f060v0f0j0e0d0d080a0h0w0810090r0t0s0d0x070e0t0d0i09090b0e0o0f0o0b0b0a0p0c0j0e0h0c0y0e0e0h0a0b0b0n0b0z0e0f090i0n0u0r0l0b0c0a0d0f0h090c0g0c05050b0d0n0f0d06090o060d0c0r0o0l0j0a0c060j140p230l100e070u0i0l0d080p0k090x0g0d0j0b0f0h0f0b0m0c0h100u0m090s0c0n0o0l0k090b0l0b0k0e1707070l0u0a0s0g0s0e0g110j0d0f0d1z2g0i0d0m0e0k0o0y0h0b0h1i161m0e0d080n0d0c0r0j140m0w0f0i0f0f0c0e1c0e09120s0k0e0a0k0b0a0i0b0k0k0p0s0u0f0g0g0n0j0r06030i070a0h0i0l0v0k1c100i0c0o0d0u0m0m0f0h0m0s100w1o0g130x080r0c0a0v0n1q0k0m0f070e0l0i0d0b0e0x0q0k0k0b080l07070l0k0g0h0c140t0m0b0w0a0c0e110s0k060e0x100j0g0h0b0i0b0e0e0m080h110j0m060y080e0e0e0q0p0e0f0d0b0c0b0n1h0i0q0b0f1e0n1g1p0v171p0j0q0a070n190w0p0n0i160u0s0m0e0h0l0g0d0e0o0g0d090p140y0d0d0o0c0d0e0j1v0q0f150v0q0g1f0x0a0m0s0f110d0b0n0c0k0r0g0d0d1b0c0o0o0u0k0j0j0x0p080p0g0n0h0a0j0f0q0l0g0e070h0c190f0k0d0o0n1e0k0r090b0f0p090l0o0j1f0q0m0f1r0d0l0f0m0h180t0b0o0b0e0e0c0b0c0v0g0d090d0a0p090o09090h07110d0e0c0c0a0w0b0g0g090j0q0d0e0m0s0a0j0m0h0f0c0b0e0k090n0e0f080s0h0p0f0r060l0m0e0v0m0h0c0h0a0r09050n0c1913080o0e090f0i0h0c0p0m0b0e0l0708090g0h0g180m1d0t0h0c0g0d180f0i0g090f080d0d0p0l0d0m0n0c0n0b0i0b0a0u0c0k0o0f0t0s090a0z080r0a090i070i0v0k0q0m0k0v0g0n14130s0d11080r160z0h0h080e0z110j0g0g09080t0l010d0e0a0c0606090b0b0g0h0d0504070f0c0g0p050s0c0c070j0u0m0g0g0f0q0t0b0i0b11140e0n0a0f100s0a0i0d0e0f0k0j0a120w080f0t0h0k090a0b0d0e0f0e0a070r0h0p0d0y0p0n080f060e0d0b0d0708110o0j0l160c060d0f0d0i0i09090a0j0n090g080i0b0606090707040b050a0b0b06040304030j08050g0l0g0m0a0m0c0d0m0b0b0t0n0a090i0n150e0k100d0m0i130b0f0e0f150u170v08170k0h0r0j0i0b0j0e140a0j0q0f050d0u090a0u0e0708050b0m0a110s0t0c07070c0e0q090a0c070a0c070n080g0b0i0h060b0b0c0n070b0i0m0n0d060b0k0l060o0b080a0b0k0d0j0b0a0i0g0h0j0c0l0d0l0i0g0g0a0x0z0k0j0c0d0h100i0d090h0i0h0a0c0a0e080x0c0c0k080q0q0k0a0b0o0d190d0i0m090e0w0m0q0i0n0g0d0a0d0i0k0b0b0o0i0n0o0g0a080j0x0n0i0c0r0t0n0n0f0e0s0j100v0s0g170f0n0d0e0e0f0h0g0f0g0e0m0c0m0h0a0b0g0j0m0q0c0g0h0d0g0j0g0w0q0o0o0b1a0c090f0b0k0p0r080p0i0g0i0b0e0d0h0q0n0j0u0i0e0g0g0r0p0m0h0g0g0g0c0o0n0r0f110g0k0m0i0h0r0v081g0i0m0g0i0c0g0l0e0f050q0t0s0n0e0f060f0e0i0r0h0a130i0e0t0h0g0m150p170b0g0r0i0a0g0r0b0a0h0t0h0m0g0j0c0f0b0b0a0k0f0c070m0c0b0d0b0l0g050e0a0k0j160a040f0a0p0f0p090d0x0g0h0m0e0a0b0g060a0h070m0c0a050g0t0b0r070e0o0m0a08080l0f0e0e0f0a0q090g0o0m0b0a090p080j0g0v0m0b0d0a0r0i0g0e0g130n0b0o09070e0b090b0t0j0m090v0d0a0i0c0h0b0j0a0q0b0j0n0h0f0n0j0i0j0h0d0h0f0g070i0l0e0c0h0r0l0m0h0b0i080c0f0i090c0e0b050e0d0q0d0b0t0c080q0e0b0k0z0m090i0f0j0i0a060a0909090o0c0g050a090f0i0k0i0a0c0h0e070q080a0f0h09030g05060g0f0f0p070f0e0g0b080d090h040i0i0g090w090n0j0n0j0a0d0a0i0w0j0h0a0b0r0q0q090w0j0i0o080b0m0e0f0b0m0t0c0f0e080h07090h0a060e0g0h0p0o0r0u0g0f050c0c060b0x0o0f0d110h0b0i0c0c0d0k0l0a0n090b0c0c060k08090e1a0l0e060a0b070e0h0t0j0n0f0q0o0r0p0k0f0f050e0z090j0r0b19160r0f070d0j0f070n0g0j0b080s1f0d130e0j0p0k0l080d0g0i0f0g0e0g0j0l0q0b0d110x0t0h0g0a05070g0m0e050y180h0f0c0d0i0c040c0l0p090f0d0f0q0i0d09080d090q0e0c0b0a06060a0d0607070807080709070708050709080705070b080b0c06070708070c090407080b05060604040a04050b040805030a08060504090708070805060606050407040e090406040506050308050305050505050603060e05070f0504040303060308070605090i070808070e090a0d0g0f0d0l0b04070a060a070b0d090f0l0l0j080k0f0c0m0a0w0s0e0i0b0a0i050f0c0g07080h0e070c0b0c0a060c07090j0c0n0h0h0e0g0h0f0d0o0k0m0l0f0a0r0t0j0f0i0p0p06070e0b0j0a0d0o0g0k0w0h0j0f0f0i080a090h0d0g0c0b0o0d0b070i0f0o090d0m0m050f0j0b07090c0h0m0c0e080l0c090d0h0b0n0b0g09080n0d070l0e0d0i0c0c0b090p0c0c0a090c0d0c0d080m0h0b0g0d070i0b0a0d060l0c0j0j0909050p090g0e0f0d0i0i0l0p0d0f0a0j090e0i0f0m0h0f0b0d090c0d0b0e0c0e090d0c0b0e0d090j0e0a0b0c0q0f0e0b0r0e0n0e0i0f090e09090i08050m0l0b0f03060g0b0b060a0g07090b0j0i0j0y0m120d0w0x070h080n0f0u0s0c0s0e0b0d0c0c0g080j0f080j0b090n0d0b0g0r0q0d0d0a0e0j0i0u0j080d0b0c0k090c0b06080a0c0f080a0g090d0o0c0h0a090z090a020o0d0d030f06030d0j0c0j080f0b050b0e050b0e090a060i0o0105050e0d080c0e0e0d0b070606090a0b08090b0f050d0a080i0a0b0a080b0609090g080b0b0c08080f0d090b0c0a0e0e090a07070b0908030t0b0c0b0b090i0c080a080a0809080g090p0d080709050806090706050904040904060a0405090a0e01050406040c0708040i0409050b0a0a040d0305070b040505030402050203030302040505060m0y020805080a070l0a0409050b0j090806070e08060f050d0a0b0c05060g080q0j0e0d0a0c0i08050e0h090509090q0f0c0c0g0907040i040g0s0c0d080708060c0703060d0c0a090b0e0h0b090c07060d0f060i0c08080c0h090k0i0c0d0j0b070b0f0a0e080e0908080a070a0508070b0d0d05070d060m0f08060f0d0i0d080b0a0a0h08070g0a0d0d0e0i0b0b0k080807090b0508070d0708080708060907090b0907070508080f0g060c0c0e0e0a0e0c0a0g07060n080b0j0b08060c070a0j0b090709090b0g0c06050b0d08080a090m0c0b1x0d0c0d0f090p0e0a0h0m090m110h06040c0m090p0g0e0k080o0l090b0k0f0r0k0d0a0z0h09040b0e0n0e0b0808080r0g0l0g0c080i070g0f0h0f0c0r0a0h07090i0i0t0s090b0a0b1803050504040a070505030607060l05050a0d0d090f040g0q0a050w0f0807060e0p0709040a0c05050806070j08070704060b0b08090507070705050a070c0e080709040a070a0g0905080b080c0a070a06080c080508050e05050o06060607090705080g0a060a06080807050e0808070809080b0i07090q0i0j0b0h090b09090s0c0e0f0g0e09070k090y0q0d090b0g0i0m0h0f260h1c0d1c0e0j0e0m0x0l07120a0v0b0f0b070g0i0a0h0n12080b1d0j0n24130r0m090j0m0g090c0g0h090h080909080d0a0g0l0f0k0j0a090707090b060b090b0f080b09090d08070g0b0h090f0g050b0d0a0907070f0c0e050e0d0h0d0b0d0c050b040b0m080g09090a0d09050c0104060b0b080b080508040608060707050a07060b080509050507090805070606070807040505070c060709080304030l070b08050403030403040208060d0305030805040606050406050306040404040806060506040606030306070403040604040403070805040704030b03050607040508050906040805030704030b05040403050302060905030a05030704030b05030405030406050b0907030a05040704030b040b080505030403060805040604030b06030905050909050a080504040503040905060507050402040506070404050409030607040403040605040307050j0603090a0a070g0e060j0b0j080b0f0i090j0o0b090e0b0h0e08070b0808050c0c0d080g0d0a0g120c0e0c0s0d0c0d0a0e07090b05080b0f07060c0r0l0g0k0j0e0e090c090907090a080a0c0408070b0e0g0b0d080f0i0i0b0d0h0f0b0104090j0c0c0m0d0i0h0a0g0h0a120d090g0w0i0a0b0r0f0q0a0t0f0r0j0j0p090e0f0h0i0r0c0a090a0g0d0i0k0i0q0d0n06080f0c0f0d0p0h0k0f0h080i0d06070b0e070f0j0l0d080h0t0q0s0k0g0h0q0e0i0j0f0g0j010a0b0a0c0a0c0l070v060i0b0g060d0r0d0d0j080h0d0k0r0c0i0e0n060f0g0n0c070g070g0d0s0j0c080a0l0p0j0d0e0g0f0j0c060d08070h050c0d0e0m0f0g060f0h090102080c080b0a0m0w0d08050905090b06080e0b0k0d0e0l0g080i0r0g0m090b0i060a0f0f0g0m0m0f0e0g090b0h0i0s0a0j090b0e0o0c0k090j080a01040309080i0g08080r0e0i0e0h0t0o0h0g0b0u0l0f0f070f0a0l0b0p0g0j0m0u0r01080i0o0h060a080e0e0b0g0g0e0f0b0d080c0l090d0e0a0b0i0h070b050d0c060s0s0t0h080l0g060d0p0e0d0f0o0e0z0n0h0i0i0g0g0g0d0f0e0g0e0j0p0e0u0o1c0m0d0h07030d080706080c0m1p0z0p1x0b0u0d0e0c0l0j060c0f07080b08080g080e0i0f0h0i0w0a0b0g0g0g0t0c0c0r0j0r0k0g080h0j0a0l0q0m0h090b0c0c070a0w0f0y0e080d0n090k0a0d0i0y0b0e0o0h07080g0a090a0f0o0j0l0b0e0d0d0p0h0o0y0s0s0i0a06050y0404040g040c0d070m0h0g080g0l0d0b0e0i0p0a0o0x0j0j0q0u0p010203030307080a0c080c0e080b0f06050c090a07070f050407070d080b0b060a0a080d0908070f080609060b0b0o0708070a0c0a0b07070605040d050805050b090a070c080c06060707090b0b0a0b0e0a08020202030706050904070c0304040607020407050707070304040506050a060405040a0605040604040303030503070403050704070405050603060504060406040607050404050405040505040405040403040506050404030306040403040407050605030q040307050304030304050a05050403030404040404050505030404040404040404030403040504040506040506040506050404040204050a04040304050603030306040405030404030206040306030404060a0a080c0a0f070a060807070a080b070506070n0f0w090u0g0d0907060b06090f08040407060b060a0e08050508060507040507050404040a0b0b0a06060b0704030908090904060e0a0506060404040404070a0504060a0x0g0n100v0y0o0l090509060j0g0c0d0a0k0v0k0y0d0a0c0b070j04070f08080c0f0c1009080i0q0e0b0i0h0p0b0m0b0f0f0k0d0g0e090c0a0e0b090b070e060h0m0f090y090k0g0h01060e0d0l0a0r0g0c0f0d0f0e080g0f0d0f060f0u0d06070j0i0d130q0a0e060g0u0n090n080b0n090f0m0c0a0d0j0c0d0g0b0a08040c0n0c0d0b0d0k0c070l0e0k0u0c0a090606070h0b080e0w090c060p0f0c0h010407070h0g08090e0f0g0j090n0p0j0e05080c0i0k090b0p0b0a0e0g0j0g040d0h0b0b0j0c0m0q090d0h0u0i0b0s0c0b0w0d0h0j0c01010a0a0j0c0m0j0g0f0j0d120u0y0i0b0m090m0m0o0t0m0c0c0h0d0g0a0e060f07090h0a0b060e090f080k0r0g0l0r0f0b0m0r0f01020607080608070a0b0c0b0k0409070c090c0f080b0l0e0709050709090a0p0h050c0b070b090b060708060d0c070d0b070h0b0b070604090e0a080a070h090b0a070805050f07060606060807050b0808080b0d0d080706010208050607080a050605060706060608090906050605060503040408070706070308050c0708050a08030204020507050605030504050a070503010606090k0c040e0b0j0b0e0g0e0b0d0o0d0f070h0d0o0l0g0i0a0e0b0d0c0m0b0e0g080801060f0t0i090e0p0o0o0j0g0d09190i0s0h090r0p0c0d0i0e0w0a0h0i0j0e0i0m0i0r080i0i1203040906080g0b0m0e0d180o060f0e0r0c0a07070g0f070a0b0c080l0a0f0c0d060t050f040j0j0l0805080p110k090e0v0s0r0j070i0e0c0c0j140s0s0e1i0f0m0h090c0h0s070u0a130v0k0r0i0g0j0a030b0709090c0b050a05080704090a0e08080906060c0606040a0a08080905060705060f0d0d0c05070706090d02020202030303040402050405070509060305040405090609060509090805060504060707080607070908080708050407080b0d06050506090709070102030202020404040303050606060c050806070j050807050706090807060806060807070905070507090907090a0a05030504050303030305050504040303050506030304040p04030i090g0b0g0g0v03030507030506040404040405040404040403090203040502060403020304070607050808080905050905060604070609060407030a09050708040408070409070509050307050709050406050905060605040506010202020303040406030504040506040404030404040406040406040a0404040g040804060408040604060504050402040304050409040904030405040304010403040404030404040604060406030302040303030505020203030303030405050304020304060405030202020204020302020203030503030405050902040505050304030404030507090603050602030407060406050404050303040404040403070504050406050603020504090b0910080c0f0f0h110c0m0r0k0f0s0d0c0k130p0l0f0c0s0e130l0m0i0n0l0q0i0f1b120j0h0u0m0o0j0a0a0f0h0f08091f0b140e0c0d0p110i0v0n0s0g0c0n0b0h0a0h0a0a0i0d0j0h1c0d0d1g0d0j0f0l0l1j0l120j0b08090b0n0v0g0b0e0b0f0h090z0c0l080a0n0h090i0l0f0l0h0c0b0m0e0i0k0h0h0l0b0h0b090e0d0g0i0a0r0b0g0b090i080g0c05150u0l0s0e0w0p0e070g0y0p0e0b0t0l0h0m0b190b0r0o0h090b0i0a0c07080d0i0b050909070e0b0c080f0f0c0c0c0807090d0f0d0a0405050402020b0304050304040507030a02070202070306040503070605050a0806030405050c0408090b0a0507050b0a050c050102040404060f05060607060606030509060905040302080a0403040302030706050505040403040706040503040603050403040404040b030302040304090203060302040204040402050502040605040a07050405040505080507080809090e06050i07050e040706040906030807050505040d030d080c0a0a0f0d0909070a0b09080d0d090b0e0a05070a080a08080c0g0b0b070d0d02040506050806060907060405080b06080609260202020202030204040404040203040502030304020303060502040402031l0203030302070503030204050404040304050303090503030b040405060504030203050304060503060404040402030303050403030304040305030405060505070b0a0706080707070a0708050a060805060409070d08060905070809090b0a02020202020303030303030302050303030303050403030304020703060606040303040403050503050306040305030603040203040203040202030303040305040205060404040203060302050304050302020206050a0e090f020202020203020302050405040304060506040302030204050606030404040203040504030304090405040305090203040403030404020303030302020204040403030405040404030202020203030502020603020402040303030303030303030303030304030203030406030304050502050508030303030506040604030203040403040506090206050502050604020304070708060407060402020403050406030408040606040603060303030403080504040603020505060303030404060404030903020203030406090a0e0e0404030303040205040403020402060404050403060303030303020404030303030309020403020406040404030503040302030406060302030403030202020604040404030404030401020203060603060503040305030b0a050504040605090405040305030204040305060405040202030402060304090306030203030303030303040403030707030303040304020204020206030403040302040605020103050504040303040404040303030404030302020306040904040504030305040304030305030405060302020505050609050c06030b0g0g090l0403040304060606020202030304040407040501020405040404040204020203030405020405010409040404040403040303070504040302040407040405020503020303040304050505040507070506040305040204050404050505040202040503';

  // السطر (فهرس الأسطر النصية) الذي فيه الكلمة w من الآية ai. w = 0 ← سطر أول الآية، null ← سطر آخرها
  // (فحدّ البداية الفارغ يُمرَّر 0 دائماً: fromWord || 0)
  function lineOfWord(ix, ai, w) {
    if (w == null) return ix.endLine[ai];
    let k = ix.startLine[ai];
    while (w && k + 1 <= ix.endLine[ai] && ix.tl.ai[k + 1] === ai && ix.tl.wj[k + 1] <= w) k++;
    return k;
  }
  // عدد الكلمات من الموضع (a0، w0) إلى ما قبل الموضع (a1، w1)
  function wordsBetween(ix, a0, w0, a1, w1) {
    if (a0 === a1) return w1 - w0;
    let n = ix.ayahWords[a0] - w0;
    for (let b = a0 + 1; b < a1; b++) n += ix.ayahWords[b];
    return n + w1;
  }
  // طول سؤال بالأسطر من الكلمة fw في الآية a إلى الكلمة tw (شاملة) في الآية b.
  // سؤال بآيات كاملة (fw = 0، tw = null) يُحسب كل سطر يمسّه كاملاً كما كان دائماً. وسؤال بحدّ كلمة يُحسب منه ما يُقرأ فقط
  // بنسبة الكلمات في طرفيه كليهما، أياً كانت الآية: فأول سطر المائدة ٤ فيه ٧ كلمات من آخر المائدة ٣ لا يقرؤها الطالب
  function spanLines(ix, a, fw, b, tw) {
    const sl = lineOfWord(ix, a, fw || 0), el = lineOfWord(ix, b, tw);
    let n = el - sl + 1;
    if (!fw && tw == null) return n;
    const before = wordsBetween(ix, ix.tl.ai[sl], ix.tl.wj[sl], a, fw || 0);
    const [ea, ew] = tw == null ? [b, ix.ayahWords[b]] : [b, tw + 1];   // ما بعد آخر كلمة مقروءة
    const after = el + 1 < ix.totalLines ? wordsBetween(ix, ea, ew, ix.tl.ai[el + 1], ix.tl.wj[el + 1]) : wordsBetween(ix, ea, ew, ix.N - 1, ix.ayahWords[ix.N - 1]);
    return n - before / ix.lineWords[sl] - after / ix.lineWords[el];
  }
  // موضع في المصحف للمقارنة: (الآية، الكلمة). البداية الفارغة = أول الآية، والنهاية الفارغة = آخرها
  const startPos = (a, w) => a * 1e4 + (w || 0);
  const endPos = (a, w) => a * 1e4 + (w == null ? 9999 : w);
  // يتداخل السؤال q مع أحد المقاطع [من، إلى، كلمة البداية، كلمة النهاية] (الكلمتان اختياريتان: الآية كاملة)
  const overlaps = (q, list) => list.some(([a, b, fw, tw]) => startPos(q.from, q.fromWord) <= endPos(b, tw) && startPos(a, fw) <= endPos(q.to, q.toWord));

  // ═════════════════════ ٥) فهرس المصحف ═════════════════════
  // meta: window.QURAN_META ، lines: window.QURAN_LINES (طبعة 1441). الآيات بفهرس مطلق يبدأ من 0.
  function buildQuranIndex(meta, lines) {
    if (!meta || meta.edition !== EDITION) throw new ExamError('BAD_QURAN_DATA', `خريطة المصحف مفقودة أو ليست طبعة ${EDITION}`);
    if (!lines || lines.edition !== EDITION || !Array.isArray(lines.pages) || lines.pages.length !== 604) throw new ExamError('BAD_QURAN_DATA', `أسطر المصحف مفقودة أو ليست طبعة ${EDITION}`);
    const S = meta.surahs;
    if (!Array.isArray(S) || S.length !== 114) throw new ExamError('BAD_QURAN_DATA', 'عدد السور ليس 114');
    const N = S.reduce((n, s) => n + s[1], 0);
    if (N !== 6236) throw new ExamError('BAD_QURAN_DATA', 'عدد الآيات ليس 6236');

    const surahOf = new Int16Array(N), ayahNo = new Int16Array(N);
    S.forEach((s, i) => { for (let k = 0; k < s[1]; k++) { surahOf[s[0] + k] = i + 1; ayahNo[s[0] + k] = k + 1; } });
    const abs = (s, a) => {
      if (!Number.isInteger(s) || s < 1 || s > 114) throw new ExamError('BAD_RANGE', `رقم السورة ${s} غير صالح`);
      if (!Number.isInteger(a) || a < 1 || a > S[s - 1][1]) throw new ExamError('BAD_RANGE', `سورة ${S[s - 1][2]} آياتها ${S[s - 1][1]}، والآية ${a} غير موجودة`);
      return S[s - 1][0] + a - 1;
    };

    // الأسطر النصية فقط (بلا عناوين السور والبسملة)، بترتيب المصحف
    const tl = { page: [], line: [], ai: [], wj: [] };
    const pageFirstTL = new Int32Array(605).fill(-1), pageLastTL = new Int32Array(605).fill(-1);
    lines.pages.forEach((pg, pi) => pg.forEach((e, li) => {
      if (!Array.isArray(e)) return;
      const k = tl.page.length;
      if (pageFirstTL[pi + 1] < 0) pageFirstTL[pi + 1] = k;
      pageLastTL[pi + 1] = k;
      tl.page.push(pi + 1); tl.line.push(li + 1); tl.ai.push(e[0]); tl.wj.push(e[1]);
    }));
    const L = tl.page.length;
    const before = (k, ai, wj) => tl.ai[k] < ai || (tl.ai[k] === ai && tl.wj[k] <= wj);   // بداية السطر k ≤ (ai, wj)
    const startLine = new Int32Array(N), endLine = new Int32Array(N);
    let k = 0;
    for (let ai = 0; ai < N; ai++) {
      while (k + 1 < L && before(k + 1, ai, 0)) k++;
      startLine[ai] = k;
    }
    for (let ai = 0; ai < N; ai++) {
      if (ai === N - 1) { endLine[ai] = L - 1; continue; }
      const s = startLine[ai + 1];
      endLine[ai] = (tl.ai[s] === ai + 1 && tl.wj[s] === 0) ? s - 1 : s;
    }
    // تحقق اتساق: صفحة بداية كل آية = ما في خريطة الصفحات
    const pageStartAbs = meta.pages.map(([s, a]) => abs(s, a));
    for (let p = 1; p <= 604; p++) {
      const a = pageStartAbs[p - 1], b = p < 604 ? pageStartAbs[p] - 1 : N - 1;
      for (let ai = a; ai <= b; ai++) if (tl.page[startLine[ai]] !== p) throw new ExamError('BAD_QURAN_DATA', `تعارض بين خريطة الصفحات والأسطر عند الآية ${surahOf[ai]}:${ayahNo[ai]}`);
    }
    const surahLastPage = [0], surahPages = [0];
    for (let s = 1; s <= 114; s++) {
      surahLastPage.push(tl.page[endLine[S[s - 1][0] + S[s - 1][1] - 1]]);
      surahPages.push(surahLastPage[s] - tl.page[startLine[S[s - 1][0]]] + 1);
    }
    const juzStart = meta.juz.map(([s, a]) => abs(s, a));
    const quarterStart = meta.quarters.map(([s, a]) => abs(s, a));

    // عدد كلمات كل آية، وعدد كلمات كل سطر نصي منه (بداية السطر إلى بداية الذي يليه)
    if (AYAH_WORDS_36.length !== 2 * N) throw new ExamError('BAD_QURAN_DATA', 'جدول عدد الكلمات لا يطابق عدد الآيات');
    const ayahWords = new Uint8Array(N);
    for (let ai = 0; ai < N; ai++) ayahWords[ai] = parseInt(AYAH_WORDS_36.substr(2 * ai, 2), 36);
    const lineWords = new Int32Array(L);
    for (let k = 0; k < L; k++) {
      const a0 = tl.ai[k], w0 = tl.wj[k], a1 = k + 1 < L ? tl.ai[k + 1] : N - 1, w1 = k + 1 < L ? tl.wj[k + 1] : ayahWords[N - 1];
      let n = a0 === a1 ? w1 - w0 : ayahWords[a0] - w0 + w1;
      for (let b = a0 + 1; b < a1; b++) n += ayahWords[b];
      if (!(n > 0) || w0 >= ayahWords[a0]) throw new ExamError('BAD_QURAN_DATA', `عدد كلمات السطر ${tl.line[k]} في الصفحة ${tl.page[k]} لا يتسق مع جدول الكلمات`);
      lineWords[k] = n;
    }

    // الآيات الطويلة ذات البدايات المعتمدة: تحقق اتساق مع الأسطر وجدول الكلمات (كل خانة في كل سطر)
    const longAyahs = {};
    Object.keys(LONG_AYAHS).forEach(key => {
      const [s, a] = key.split(':').map(Number), ai = abs(s, a), e = LONG_AYAHS[key];
      if (e.words !== ayahWords[ai]) throw new ExamError('BAD_QURAN_DATA', `جدول الآيات الطويلة: عدد كلمات الآية ${key}`);
      if (e.lines.length !== endLine[ai] - startLine[ai] + 1) throw new ExamError('BAD_QURAN_DATA', `جدول الآيات الطويلة لا يطابق أسطر الآية ${key}`);
      e.lines.forEach(([o, before, own, total], i) => {
        const k = startLine[ai] + i, own0 = tl.ai[k] === ai ? tl.wj[k] : 0;
        const bef = tl.ai[k] === ai ? 0 : ayahWords[tl.ai[k]] - tl.wj[k] + (() => { let m = 0; for (let b = tl.ai[k] + 1; b < ai; b++) m += ayahWords[b]; return m; })();
        const ownEnd = k + 1 < L && tl.ai[k + 1] === ai ? tl.wj[k + 1] : ayahWords[ai];
        if (o !== own0 || before !== bef || own !== ownEnd - own0 || total !== lineWords[k]) throw new ExamError('BAD_QURAN_DATA', `جدول الآيات الطويلة: السطر ${i + 1} من الآية ${key}`);
      });
      if (e.starts.some(w => !(w > 0 && w < e.words)) || e.stops.some(w => !(w >= 0 && w < e.words - 1))) throw new ExamError('BAD_QURAN_DATA', `جدول الآيات الطويلة: بداية أو وقف خارج الآية ${key}`);
      longAyahs[ai] = e;
    });
    // الآيات المحبوسة: التالية لها في السورة نفسها، وليست من الآيات الطويلة، والوقف داخلها لا آخرها
    const trapped = {};
    Object.keys(TRAPPED_AYAHS).forEach(key => {
      const [s, a] = key.split(':').map(Number), ai = abs(s, a), st = TRAPPED_AYAHS[key];
      if (ai + 1 >= N || surahOf[ai + 1] !== s || longAyahs[ai] || longAyahs[ai + 1] || !st.length || st.some((w, i) => !(w >= 0 && w < ayahWords[ai + 1] - 1) || (i && w <= st[i - 1])))
        throw new ExamError('BAD_QURAN_DATA', `جدول الآيات المحبوسة: الآية ${key}`);
      trapped[ai] = st;
    });

    return {
      edition: EDITION, N, totalLines: L,
      surahs: S.map((s, i) => ({ number: i + 1, name: s[2], start: s[0], count: s[1] })),
      surahOf, ayahNo, startLine, endLine, tl, pageFirstTL, pageLastTL, surahLastPage, surahPages, juzStart, quarterStart, pageStartAbs, longAyahs, trapped, ayahWords, lineWords,
      abs,
      sa: ai => [surahOf[ai], ayahNo[ai]],
      pageOf: ai => tl.page[startLine[ai]]
    };
  }

  // ═════════════════════ ٦) النطاق ═════════════════════
  // نطاق «من سورة وآية إلى سورة وآية» كما يختاره المحكّم. الحفظ من الناس صعوداً، فإن كانت سورة البداية بعد سورة النهاية
  // (من الناس إلى الملك ١٥) فالمعنى: سورة النهاية من أولها إلى الآية المختارة + كل ما بعدها إلى سورة البداية كاملة.
  // وإلا فالنطاق كما كان. خانة فارغة أو رقم خارج السورة ← null (حدد النطاق).
  function surahAyahSpec(ix, s1, a1, s2, a2) {
    const okS = s => Number.isInteger(s) && s >= 1 && s <= 114;
    const okA = (s, a) => Number.isInteger(a) && a >= 1 && a <= ix.surahs[s - 1].count;
    if (!okS(s1) || !okS(s2) || !okA(s2, a2)) return null;
    if (s1 > s2) return { type: 'multi', parts: [{ type: 'ayahs', from: [s2, 1], to: [s2, a2] }, { type: 'surahs', from: s2 + 1, to: s1 }] };
    if (!okA(s1, a1)) return null;
    return { type: 'ayahs', from: [s1, a1], to: [s2, a2] };
  }

  // يحوّل وصف النطاق إلى مقاطع متصلة بالآية [من، إلى] (فهرس مطلق، شامل الطرفين)، مرتبة ومدمجة.
  // الأنواع: juz{juz:[..]} · surahs{from,to} · ayahs{from:[s,a],to:[s,a]} · pages{from,to} · hizb{from,to} · quarters{from,to} · multi{parts:[..]}
  function resolveRange(ix, spec) {
    const segs = [];
    const add = (a, b) => segs.push(a <= b ? [a, b] : [b, a]);
    const intIn = (x, lo, hi, what) => { if (!Number.isInteger(x) || x < lo || x > hi) throw new ExamError('BAD_RANGE', `${what} يجب أن يكون من ${lo} إلى ${hi}`); return x; };
    const span = (starts, from, to, max, what) => {
      intIn(from, 1, max, what); intIn(to, 1, max, what);
      const lo = Math.min(from, to), hi = Math.max(from, to);
      add(starts[lo - 1], hi < max ? starts[hi] - 1 : ix.N - 1);
    };
    (function walk(sp) {
      if (!sp || typeof sp !== 'object') throw new ExamError('BAD_RANGE', 'النطاق غير محدد');
      switch (sp.type) {
        case 'juz':
          if (!Array.isArray(sp.juz) || !sp.juz.length) throw new ExamError('BAD_RANGE', 'اختر جزءاً واحداً على الأقل');
          sp.juz.forEach(j => span(ix.juzStart, j, j, 30, 'رقم الجزء')); break;
        case 'surahs': {
          intIn(sp.from, 1, 114, 'رقم السورة'); intIn(sp.to, 1, 114, 'رقم السورة');
          const lo = Math.min(sp.from, sp.to), hi = Math.max(sp.from, sp.to);
          add(ix.surahs[lo - 1].start, ix.surahs[hi - 1].start + ix.surahs[hi - 1].count - 1); break;
        }
        case 'ayahs':
          if (!Array.isArray(sp.from) || !Array.isArray(sp.to)) throw new ExamError('BAD_RANGE', 'حدد السورة والآية للبداية والنهاية');
          add(ix.abs(sp.from[0], sp.from[1]), ix.abs(sp.to[0], sp.to[1])); break;
        case 'pages': span(ix.pageStartAbs, sp.from, sp.to, 604, 'رقم الصفحة'); break;
        case 'hizb': span(ix.quarterStart.filter((_, i) => i % 4 === 0), sp.from, sp.to, 60, 'رقم الحزب'); break;
        case 'quarters': span(ix.quarterStart, sp.from, sp.to, 240, 'رقم الربع'); break;
        case 'multi':
          if (!Array.isArray(sp.parts) || !sp.parts.length) throw new ExamError('BAD_RANGE', 'النطاق المركّب فارغ');
          sp.parts.forEach(walk); break;
        default: throw new ExamError('BAD_RANGE', `نوع نطاق غير معروف: ${sp.type}`);
      }
    })(spec);
    segs.sort((a, b) => a[0] - b[0]);
    const merged = [];
    segs.forEach(s => { const m = merged[merged.length - 1]; if (m && s[0] <= m[1] + 1) m[1] = Math.max(m[1], s[1]); else merged.push([s[0], s[1]]); });
    // الأسطر التي يغطيها النطاق (قد يشترك مقطعان متجاوران في سطر واحد)
    const lineSet = new Set();
    merged.forEach(([a, b]) => { for (let k = ix.startLine[a]; k <= ix.endLine[b]; k++) lineSet.add(k); });
    const lineList = [...lineSet].sort((x, y) => x - y);
    return { segments: merged, ayahs: merged.reduce((n, [a, b]) => n + b - a + 1, 0), lines: lineList.length, lineList };
  }

  // ═════════════════════ ٧) توليد الأسئلة ═════════════════════
  // مولّد أرقام عشوائية ثابت بالبذرة (mulberry32): البذرة نفسها تعطي النموذج نفسه دائماً.
  function rng(seed) {
    let a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // تصنيف صعوبة سؤال [from, to] بموضعه. علامات الصعوبة: عبور صفحة، أو البدء في آخر صفحتين من السورة.
  // علامات السهولة: البدء من أول الصفحة، أو من أول السورة. الأصعب يغلب؛ وما لا علامة له = متوسط.
  // opts.surahEndMinPages: علامة «آخر السورة» لا تسري على سورة أقل من هذا العدد من الصفحات (0 = كل السور).
  // w = { fromWord، toWord } (اختياري): حدّا الكلمة. السطران من سطري الكلمتين، و«أول الصفحة» و«أول السورة»
  // لا يصحّان إلا لسؤال يبدأ من أول الآية.
  function classify(ix, from, to, opts, w) {
    const fw = (w && w.fromWord) || 0, tw = w && w.toWord != null ? w.toWord : null;
    const sl = lineOfWord(ix, from, fw), el = lineOfWord(ix, to, tw);
    const p1 = ix.tl.page[sl], p2 = ix.tl.page[el];
    const sur = ix.surahOf[from], minPages = (opts && opts.surahEndMinPages) || 0;
    const signals = {
      atPageStart: fw === 0 && sl === ix.pageFirstTL[p1] && ix.tl.ai[sl] === from && ix.tl.wj[sl] === 0,
      atSurahStart: fw === 0 && ix.ayahNo[from] === 1,
      crossesPage: p1 !== p2,
      nearSurahEnd: ix.surahPages[sur] >= minPages && p1 >= ix.surahLastPage[sur] - 1
    };
    const difficulty = (signals.crossesPage || signals.nearSurahEnd) ? 'hard' : (signals.atPageStart || signals.atSurahStart) ? 'easy' : 'medium';
    return { difficulty, signals };
  }

  // يبني سؤالاً يبدأ من الآية s داخل المقطع seg حسب الخطة، مع قاعدة آخر السورة/النطاق. يعيد null إن تعذّر.
  function buildQuestion(ix, seg, s, plan) {
    const byLines = plan.unit === 'lines';
    const len = (a, b) => (byLines ? ix.endLine[b] - ix.startLine[a] + 1 : b - a + 1);
    const ok = (x, y) => plan.allowSurahCrossing || ix.surahOf[x] === ix.surahOf[y];
    const want = plan.length;
    let from = s, to = s, anchored = false;
    while (len(from, to) < want && to + 1 <= seg[1] && ok(s, to + 1)) to++;
    if (len(from, to) < want) {
      // بلغ آخر السورة (والعبور مغلق أو التالية خارج النطاق) أو آخر النطاق: تُثبَّت النهاية ويُمدّ الابتداء إلى الخلف
      anchored = true;
      while (len(from, to) < want && from - 1 >= seg[0] && ok(from - 1, to)) from--;
      if (len(from, to) < want) return null;
    }
    const actual = len(from, to);
    const overflow = byLines ? actual - want : 0;
    if (overflow > plan.maxOverflow) return { invalid: 'overflow', from, to, actual, overflow };
    const atEndOfSurah = ix.ayahNo[to] === ix.surahs[ix.surahOf[to] - 1].count;
    return { from, to, actual, overflow, anchored, anchoredAt: anchored ? (to === seg[1] && !atEndOfSurah ? 'range' : 'surah') : null, crossesSurah: ix.surahOf[from] !== ix.surahOf[to] };
  }

  // كم سؤالاً من كل صعوبة في الوضع «تلقائي»: توزيع متساوٍ، والزيادة للمتوسط ثم السهل
  function autoMix(n) {
    const b = Math.floor(n / 3), r = n % 3;
    return { easy: b + (r >= 2 ? 1 : 0), medium: b + (r >= 1 ? 1 : 0), hard: b };
  }

  // أكبر عدد من الأسئلة الصالحة التي لا تتداخل في النطاق (اختيار أبكر نهاية أولاً يعطي الأكبر بالضبط).
  // يكشف ما لا يكشفه عدّ الأسطر: سور قصيرة لا تتسع لسؤال وحدها حين يُمنع العبور، أو آيات أطول من المسموح.
  // يعيد { fit، long }: long = عدد المواضع المرفوضة لأن آياتها أطول من المسموح (لتُسمّى العلة الصحيحة في الرسالة)
  function maxQuestions(ix, R, plan) {
    const { cands, long } = buildCandidates(ix, R, plan);
    const sorted = cands.slice().sort((a, b) => endPos(a.to, a.toWord) - endPos(b.to, b.toWord) || startPos(b.from, b.fromWord) - startPos(a.from, a.fromWord));
    let fit = 0, end = -1;
    sorted.forEach(q => { if (startPos(q.from, q.fromWord) > end) { fit++; end = endPos(q.to, q.toWord); } });
    return { fit, long };
  }

  // يبني سؤالاً يبدأ من الكلمة w0 في الآية s (0 = أول الآية) حين يجوز البدء من وسط الآيات الطويلة (allowMidAyah).
  // ينتهي عند أول نهاية تبلغ الطول: آخر آية، أو علامة وقف مسموحة داخل آية طويلة من الجدول،
  // أو داخل الآية التالية لآية محبوسة إن بدأ السؤال من أول المحبوسة.
  // والإعداد «لا» (أو الطول بالآيات) يعيد buildQuestion كما كانت حرفياً.
  function buildQuestionAt(ix, seg, s, w0, plan) {
    const mid = plan.allowMidAyah === true && plan.unit === 'lines';
    if (!mid) return w0 ? null : buildQuestion(ix, seg, s, plan);
    const ok = (x, y) => plan.allowSurahCrossing || ix.surahOf[x] === ix.surahOf[y];
    const want = plan.length, EPS = 1e-9;
    const tStops = w0 ? null : trappedStops(ix, s);
    const endsOf = a => { const L = longAyah(ix, a); return [...(L ? L.stops.filter(x => a !== s || x >= w0) : tStops && a === s + 1 ? tStops : []), null]; };
    const inNext = f => !!tStops && f.to === s + 1 && f.toWord != null;
    let found = null;
    outer: for (let a = s; a <= seg[1] && ok(s, a); a++) {
      for (const e of endsOf(a)) { const n = spanLines(ix, s, w0, a, e); if (n >= want - EPS) { found = { to: a, toWord: e, n }; break outer; } }
    }
    // لم يبلغ الطول (آخر السورة أو النطاق): من أول آية كما كان (تثبيت النهاية والمدّ إلى الخلف)، ومن وسطها لا سؤال
    if (!found) return w0 ? null : buildQuestion(ix, seg, s, plan);
    const mk = f => ({ from: s, to: f.to, fromWord: w0 || null, toWord: f.toWord, actual: Math.round(f.n * 10) / 10, overflow: Math.round((f.n - want) * 10) / 10,
      anchored: false, anchoredAt: null, crossesSurah: ix.surahOf[s] !== ix.surahOf[f.to], ...(inNext(f) ? { trappedStop: true } : {}) });
    const q = mk(found);
    if (found.n - want > plan.maxOverflow + EPS) {
      // آية طويلة بلا بدايات معتمدة في وسطها (النساء ٢٣): تُسأل كاملة استثناءً
      if (!w0 && found.to === s && found.toWord == null && !longAyah(ix, s)) return { ...q, longWhole: true };
      // آية محبوسة أقرب وقف بعدها يزيد على الحد قليلاً، أقل من سطر (الأعراف ١٥٦ إلى «التي كانت عليهم»: ٨٫١ سطر والحد ٨):
      // تُسأل إليه استثناءً. وزيادة سطر فأكثر على الحد لا تُقبل (الزيادة صفر: البقرة ٢٣٤ إلى أقرب وقف ٦ أسطر والحد ٥)
      if (inNext(found) && found.n - want - plan.maxOverflow < 1 - EPS) return { ...q, trappedOver: true };
      return { invalid: 'overflow', ...q };
    }
    // ونهايات أبعد داخل آية طويلة من الجدول ما دامت في حدود الزيادة: أسئلة أخرى من البداية نفسها، فلا تبقى كلمات
    // بين وقفٍ وبدايةٍ معتمدة لا يبلغها سؤال (البقرة ١٠٢ بين الوقف ٥٠ والبداية ٥٦، وآخر آية الدَّين بعد «واتقوا الله»)
    const out = [q];
    const after = (e, f) => (f == null ? false : e == null || e > f);
    let go = true;
    for (let a = found.to; go && a <= seg[1] && ok(s, a); a++) {
      for (const e of endsOf(a)) {
        if (a === found.to && !after(e, found.toWord)) continue;
        const n = spanLines(ix, s, w0, a, e);
        if (n - want > plan.maxOverflow + EPS) { go = false; break; }
        // الآيات الكاملة تُحسب بأسطرها كاملة والحدّ بالكلمة بالمقروء فقط، فقد تكون نهاية أبعد أقصر حساباً
        // (المائدة ٤ كاملة ٤ أسطر، وإلى «الطيبات» في ٥ نحو ٣٫٦): لا تُقبل نهاية دون الطول
        if (n < want - EPS) continue;
        if (longAyah(ix, a) || (tStops && a === s + 1)) out.push(mk({ to: a, toWord: e, n }));
      }
    }
    return out.length === 1 ? q : out;
  }

  // سؤال «مثبَّت النهاية» لآية لم يبلغها أي سؤال: ينتهي عند آخرها ويمتد إلى الخلف بآيات كاملة حتى يبلغ الطول
  // (البقرة ٨٤ بين جارتين طويلتين ← ٨٣ + ٨٤ = ٧ أسطر)
  function buildBackward(ix, seg, a, plan) {
    const ok = (x, y) => plan.allowSurahCrossing || ix.surahOf[x] === ix.surahOf[y];
    let from = a;
    while (spanLines(ix, from, 0, a, null) < plan.length && from - 1 >= seg[0] && ok(from - 1, a)) from--;
    const n = spanLines(ix, from, 0, a, null);
    if (n < plan.length) return null;
    const q = { from, to: a, fromWord: null, toWord: null, actual: n, overflow: n - plan.length, anchored: true, anchoredAt: 'trapped', crossesSurah: ix.surahOf[from] !== ix.surahOf[a] };
    // يتجاوز الحد من الخلف أيضاً: لا سؤال (وقد عُدّ موضعه مرفوضاً في المرور الأمامي، فلا يُعدّ مرتين)
    return q.overflow > plan.maxOverflow ? null : q;
  }

  // كل الأسئلة الممكنة في النطاق (بلا تكرار)، وعدد المواضع المرفوضة لطول آياتها.
  // مع allowMidAyah: بدايات الآيات + البدايات المعتمدة داخل الآيات الطويلة، ثم أسئلة مثبَّتة النهاية للآيات التي لم يبلغها شيء.
  function buildCandidates(ix, R, plan) {
    const mid = plan.allowMidAyah === true && plan.unit === 'lines';
    const cands = [], seen = new Set(); let long = 0;
    const add = q => {
      if (Array.isArray(q)) { q.forEach(add); return; }
      if (!q) return;
      if (q.invalid) { long++; return; }
      const key = `${q.from}:${q.fromWord || 0}-${q.to}:${q.toWord == null ? 'E' : q.toWord}`;
      if (seen.has(key)) return; seen.add(key);
      if (q.fromWord === undefined) { q.fromWord = null; q.toWord = null; }
      cands.push(q);
    };
    R.segments.forEach(seg => {
      for (let s = seg[0]; s <= seg[1]; s++) {
        add(buildQuestionAt(ix, seg, s, 0, plan));
        const L = mid && longAyah(ix, s);
        if (L) L.starts.forEach(w => add(buildQuestionAt(ix, seg, s, w, plan)));
      }
    });
    if (mid) R.segments.forEach(seg => {
      for (let a = seg[0]; a <= seg[1]; a++) if (!cands.some(q => q.from <= a && a <= q.to)) add(buildBackward(ix, seg, a, plan));
    });
    return { cands, long };
  }

  function checkFeasibility(ix, range, plan, count) {
    const R = range.segments ? range : resolveRange(ix, range);
    const have = plan.unit === 'lines' ? R.lines : R.ayahs;
    const need = count * plan.length;
    const unitName = plan.unit === 'lines' ? 'سطراً' : 'آية';
    const { fit, long } = maxQuestions(ix, R, plan);
    const byLines = Math.floor(have / plan.length), maxCount = Math.min(byLines, fit);
    if (have >= need && fit >= count) return { ok: true, have, need };
    const why = fit === 0 && long ? `كل المواضع فيه آيات أطول من الطول المطلوب بأكثر من ${plan.maxOverflow} (آيات طويلة)`
      : !plan.allowSurahCrossing && fit < byLines ? 'السور القصيرة لا تكفي سؤالاً وحدها والعبور بين السور ممنوع' : '';
    let message;
    if (maxCount === 0) message = why ? `لا سؤال يصلح في هذا النطاق: ${why}.` : `النطاق ${have} ${unitName} فقط، ولا يتسع لسؤال طوله ${plan.length}. وسّع النطاق أو قلّل طول السؤال إلى ${have}.`;
    else if (have < need && fit >= byLines) message = `النطاق ${have} ${unitName} فقط، ولا يتسع لـ ${count} أسئلة طول كل منها ${plan.length}. قلّل عدد الأسئلة إلى ${maxCount} أو الطول إلى ${Math.floor(have / count)}.`;
    else message = `النطاق يتسع لـ ${maxCount} ${maxCount === 1 ? 'سؤال' : 'أسئلة'} فقط لا تتداخل${why ? ` (${why})` : ''}. قلّل عدد الأسئلة إلى ${maxCount} أو وسّع النطاق.`;
    return { ok: false, have, need, maxCount, maxLength: have < need ? Math.floor(have / count) : null, message };
  }

  // جدوى نموذج كامل: كل أقسام الأسئلة المفعّلة تتقاسم النطاق بلا تداخل. الأقسام بخطة طول واحدة تُفحص معاً بدقة؛
  // والمختلفة تُفحص كلٌّ وحده، ثم مجموع ما تحتاجه من أسطر (شرط لازم وإن لم يكن كافياً دائماً).
  function checkFormFeasibility(ix, range, template) {
    const tpl = normalizeTemplate(template);
    const R = range.segments ? range : resolveRange(ix, range);
    const secs = tpl.sections.filter(s => s.kind === 'questions' && s.enabled);
    if (!secs.length) return { ok: false, message: 'لا قسم أسئلة مفعّل في الورقة' };
    const shape = p => [p.unit, p.length, p.maxOverflow, p.allowSurahCrossing, p.allowMidAyah === true].join('|');
    if (secs.every(s => shape(s.plan) === shape(secs[0].plan))) return checkFeasibility(ix, R, secs[0].plan, secs.reduce((a, s) => a + s.questionCount, 0));
    for (const s of secs) { const f = checkFeasibility(ix, R, s.plan, s.questionCount); if (!f.ok) return { ...f, message: `«${s.name}»: ${f.message}` }; }
    const units = [...new Set(secs.map(s => s.plan.unit))];
    if (units.length === 1) {
      const have = units[0] === 'lines' ? R.lines : R.ayahs, need = secs.reduce((a, s) => a + s.questionCount * s.plan.length, 0);
      if (have < need) return { ok: false, have, need, message: `أقسام الأسئلة معاً تحتاج ${need} ${units[0] === 'lines' ? 'سطراً' : 'آية'} والنطاق ${have} فقط.` };
    }
    return { ok: true };
  }

  // المواضع المستبعدة بأي من الصيغتين تُوحَّد إلى { a، b، fw، tw، date، attempt }، والخاطئة تُرفض (لا يفشل الاستبعاد بصمت):
  //   [من، إلى، كلمة البداية؟، كلمة النهاية؟] بالفهرس المطلق، أو { from، to، fromWord?، toWord?، date?، attempt? } بالسورة والآية أو بالفهرس.
  // كل موضع سابق يجوز تكراره عند النفاد إن سمح الإعداد (بلا تاريخ = الأقدم: تاريخه 0)، إلا ما وُسم sameForm
  // (أسئلة أقسام النموذج نفسه، يمرّرها generateForm) فهو منع قاطع لا يُكرَّر ولا يُعدّ «سؤالاً سابقاً» في التقرير.
  function normalizeExclude(ix, list) {
    if (list == null) return [];
    if (!Array.isArray(list)) throw new ExamError('BAD_EXCLUDE', 'المواضع المستبعدة يجب أن تكون قائمة');
    const okW = w => w == null || (Number.isInteger(w) && w >= 0);
    const pos = (x, what) => {
      if (Number.isInteger(x) && x >= 0 && x < ix.N) return x;
      if (Array.isArray(x) && x.length === 2) { try { return ix.abs(x[0], x[1]); } catch (e) { /* يُرفض أدناه */ } }
      throw new ExamError('BAD_EXCLUDE', `موضع مستبعد غير صالح (${what}): ${JSON.stringify(x)}`);
    };
    return list.map(e => {
      const o = Array.isArray(e) ? { from: e[0], to: e[1], fromWord: e[2], toWord: e[3] } : e;
      if (!o || typeof o !== 'object') throw new ExamError('BAD_EXCLUDE', `موضع مستبعد غير صالح: ${JSON.stringify(e)}`);
      const a = pos(o.from, 'البداية'), b = pos(o.to, 'النهاية');
      if (!okW(o.fromWord) || !okW(o.toWord) || startPos(a, o.fromWord) > endPos(b, o.toWord)) throw new ExamError('BAD_EXCLUDE', `موضع مستبعد غير صالح: ${JSON.stringify(e)}`);
      return { a, b, fw: o.fromWord == null ? null : o.fromWord, tw: o.toWord == null ? null : o.toWord, date: Number.isFinite(o.date) ? o.date : 0, attempt: Number.isInteger(o.attempt) ? o.attempt : null, sameForm: o.sameForm === true };
    });
  }

  const DIFF_AR = { easy: 'سهل', medium: 'متوسط', hard: 'صعب' };
  const FALLBACK = { hard: ['medium', 'easy'], easy: ['medium', 'hard'], medium: ['easy', 'hard'] };

  // يولّد أسئلة قسم واحد. exclude: مقاطع ممنوعة [من، إلى] (أسئلة نماذج المرشح السابقة أو أقسام أخرى).
  // allowPartial: إن لم يتسع النطاق للعدد كله، يُولَّد ما يتسع له (بدل لا شيء) ويُسجَّل في report.partial.
  // يستعمله اختبار المستويات التراكمي ليُكمل الباقي من النطاق الآخر.
  function generateQuestions(ix, { range, plan, count, seed, exclude = [], allowPartial = false }) {
    const E = []; validatePlan(plan, count, 'خطة الأسئلة', E);
    if (!Number.isInteger(count) || count < 1) E.push('عدد الأسئلة عدد صحيح لا يقل عن 1');
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) E.push('البذرة يجب أن تكون عدداً صحيحاً من 0 إلى 4294967295');
    if (E.length) throw new ExamError('BAD_PLAN', E.join('\n'), { errors: E });
    const R = resolveRange(ix, range);
    const report = { ok: false, range: { segments: R.segments.map(([a, b]) => [ix.sa(a), ix.sa(b)]), ayahs: R.ayahs, lines: R.lines }, wanted: null, got: { easy: 0, medium: 0, hard: 0 }, substitutions: [], warnings: [], errors: [] };
    const feas = checkFeasibility(ix, R, plan, count);
    if (!feas.ok && allowPartial) {
      if (feas.maxCount > 0) {
        const p2 = plan.difficulty === 'auto' ? plan : { ...plan, difficulty: scaleMix(plan.difficulty, feas.maxCount) };
        const r = generateQuestions(ix, { range, plan: p2, count: feas.maxCount, seed, exclude });
        r.report.partial = { requested: count, got: r.questions.length };
        return r;
      }
      report.partial = { requested: count, got: 0 }; report.warnings.push(feas.message); report.feasibility = feas;
      return { questions: [], report };
    }
    if (!feas.ok) { report.errors.push(feas.message); report.feasibility = feas; return { questions: [], report }; }

    // كل بدايات الآيات في النطاق مرشحة (ومع البدء من وسط الآيات الطويلة: بداياتها المعتمدة والمثبَّتة النهاية)؛
    // ويُدمج المكرر بحدود الكلمة (عدة بدايات قرب آخر السورة تنتهي إلى السؤال نفسه)
    const rank = new Map(); R.lineList.forEach((li, i) => rank.set(li, i));
    const built = buildCandidates(ix, R, plan), cands = built.cands, overflowRejected = built.long;
    cands.forEach(q => {
      const c = classify(ix, q.from, q.to, plan, q);
      q.difficulty = c.difficulty; q.signals = c.signals;
      q.stratum = Math.min(count - 1, Math.floor(rank.get(lineOfWord(ix, q.from, q.fromWord || 0)) * count / R.lines));
    });
    // المقاطع الممنوعة: كلها تُستبعد أولاً. وحين يسمح الإعداد بالتكرار عند النفاد، فما كان من محاولات سابقة (له تاريخ)
    // يُعاد إليه عند الحاجة فقط، الأقدم أولاً؛ وما لا تاريخ له (أسئلة أقسام هذا النموذج) لا يُكرَّر أبداً
    const ex = normalizeExclude(ix, exclude), allowRepeat = plan.allowRepeatWhenExhausted === true;
    const toList = es => es.map(e => [e.a, e.b, e.fw, e.tw]);
    const blocked = toList(ex), hard = toList(allowRepeat ? ex.filter(e => e.sameForm) : ex), soft = allowRepeat ? ex.filter(e => !e.sameForm) : [];
    const usable = cands.filter(q => !overlaps(q, blocked));
    // مواضع سابقة يجوز تكرارها: آخر مرة سُئلت فيها (أحدث تاريخ يتداخل معها) ورقم تلك المحاولة
    const repeatable = soft.length ? cands.filter(q => !overlaps(q, hard) && overlaps(q, blocked)).map(q => {
      const hits = soft.filter(e => overlaps(q, [[e.a, e.b, e.fw, e.tw]]));
      const last = hits.reduce((m, e) => (e.date > m.date ? e : m), hits[0]);
      return { q, lastAsked: last.date, attempt: last.attempt };
    }) : [];
    // التحذير عن أسئلة الطالب السابقة وحدها، لا عن أسئلة الأقسام الأخرى في النموذج نفسه
    const prevList = toList(ex.filter(e => !e.sameForm)), hitPrev = prevList.length ? cands.filter(q => overlaps(q, prevList)).length : 0;
    report.excludedPrev = hitPrev;
    if (hitPrev) report.warnings.push(`استُبعد ${hitPrev} موضعاً لتداخلها مع أسئلة سابقة`);
    // العلة الصحيحة: مواضع صالحة استبعدتها أسئلته السابقة كلها، أو لا موضع صالح أصلاً (آيات طويلة أو نطاق ضيق)
    if (!usable.length && !repeatable.length) { report.errors.push(cands.length ? (hitPrev ? 'كل المواضع الصالحة في النطاق سُئل فيها هذا الطالب سابقاً' : 'كل المواضع الصالحة في النطاق أُخذت في أسئلة أخرى من هذا الاختبار') : overflowRejected ? `لا موضع صالح: كل المواضع تزيد عن الطول المطلوب بأكثر من ${plan.maxOverflow} (آيات طويلة)` : 'لا موضع صالح في النطاق'); return { questions: [], report }; }

    const random = rng(seed);
    const mix = plan.difficulty === 'auto' ? autoMix(count) : { ...plan.difficulty };
    report.wanted = mix;
    const labels = []; DIFFS.forEach(d => { for (let i = 0; i < mix[d]; i++) labels.push(d); });
    for (let i = labels.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [labels[i], labels[j]] = [labels[j], labels[i]]; }
    // تبديل بين الأجزاء ليجد كل جزء الصعوبة المطلوبة إن أمكن (قبل اللجوء إلى الاستبدال)
    const avail = Array.from({ length: count }, (_, k) => new Set(usable.filter(q => q.stratum === k).map(q => q.difficulty)));
    for (let k = 0; k < count; k++) {
      if (avail[k].has(labels[k])) continue;
      for (let j = 0; j < count; j++) if (j !== k && avail[k].has(labels[j]) && avail[j].has(labels[k])) { [labels[k], labels[j]] = [labels[j], labels[k]]; break; }
    }

    const chosen = [], taken = blocked.slice(), formTaken = hard.slice();   // formTaken: ما لا يُكرَّر في هذا النموذج
    const pick = list => list[Math.floor(random() * list.length)];
    let repeated = 0;
    for (let k = 0; k < count; k++) {
      const want = labels[k];
      const free = q => !overlaps(q, taken);
      let q = null, note = null, isRepeat = false;
      let pool = usable.filter(c => c.stratum === k && c.difficulty === want && free(c));
      if (pool.length) q = pick(pool);
      for (const alt of FALLBACK[want]) {
        if (q) break;
        pool = usable.filter(c => c.stratum === k && c.difficulty === alt && free(c));
        if (pool.length) { q = pick(pool); note = `لا موضع ${DIFF_AR[want]} في هذا الجزء من النطاق، فاختير ${DIFF_AR[alt]}`; }
      }
      if (!q) {
        // لا موضع حر في هذا الجزء: أقرب جزء آخر، الصعوبة المطلوبة أولاً
        const others = [...Array(count).keys()].filter(j => j !== k).sort((a, b) => Math.abs(a - k) - Math.abs(b - k));
        outer: for (const d of [want, ...FALLBACK[want]]) for (const j of others) {
          pool = usable.filter(c => c.stratum === j && c.difficulty === d && free(c));
          if (pool.length) { q = pick(pool); note = `لا موضع حر في الجزء ${k + 1} من النطاق، فأُخذ من الجزء ${j + 1}${d !== want ? ` وهو ${DIFF_AR[d]} بدل ${DIFF_AR[want]}` : ''}`; break outer; }
        }
      }
      if (!q && repeatable.length) {
        // نفدت المواضع الجديدة: موضع سُئل فيه سابقاً، الأقدم سؤالاً أولاً، ثم هذا الجزء والصعوبة المطلوبة إن أمكن
        const open = repeatable.filter(r => !overlaps(r.q, formTaken));
        if (open.length) {
          // الأقدم سؤالاً أولاً (قرار صاحب المشروع)؛ ومنه: هذا الجزء من النطاق ثم الأقرب فالأقرب، وبترتيب الصعوبة البديلة
          const oldest = Math.min(...open.map(r => r.lastAsked)), first = open.filter(r => r.lastAsked === oldest);
          const strata = [...new Set(first.map(r => r.q.stratum))].sort((a, b) => Math.abs(a - k) - Math.abs(b - k) || a - b);
          let pool2 = null;
          for (const j of strata) { for (const d of [want, ...FALLBACK[want]]) { const p = first.filter(r => r.q.stratum === j && r.q.difficulty === d); if (p.length) { pool2 = p; break; } } if (pool2) break; }
          const r = pick(pool2); q = r.q; repeated++; isRepeat = true;
          note = r.attempt != null ? `سُئل فيه سابقاً (المحاولة ${r.attempt})` : 'سُئل فيه سابقاً';
        }
      }
      if (!q) { report.errors.push(`تعذّر السؤال ${k + 1}: لا موضع لا يتداخل مع الأسئلة الأخرى`); continue; }
      taken.push([q.from, q.to, q.fromWord, q.toWord]); formTaken.push([q.from, q.to, q.fromWord, q.toWord]);
      chosen.push({ q, want, note, stratum: k });
      if (note && !isRepeat) report.substitutions.push({ stratum: k + 1, wanted: want, got: q.difficulty, note });
    }
    // الاختيار العشوائي قد يسدّ الطريق في نطاق ضيق (سؤال يأخذ موضعاً يحجب الأخير) مع أن النطاق يتسع للعدد كله:
    // تعبئة مضمونة من أكبر مجموعة مواضع لا تتداخل (أبكر نهاية أولاً)، عشوائية الاختيار منها. لا تمسّ نموذجاً اكتمل.
    if (chosen.length < count) {
      const free = usable.filter(c => !overlaps(c, hard));
      const packed = []; let end = -1;
      free.slice().sort((a, b) => endPos(a.to, a.toWord) - endPos(b.to, b.toWord) || startPos(b.from, b.fromWord) - startPos(a.from, a.fromWord))
        .forEach(c => { if (startPos(c.from, c.fromWord) > end) { packed.push(c); end = endPos(c.to, c.toWord); } });
      if (packed.length >= count) {
        const idx = packed.map((_, i) => i);
        for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
        chosen.length = 0; repeated = 0;
        idx.slice(0, count).sort((a, b) => a - b).forEach((i, k) => chosen.push({ q: packed[i], want: packed[i].difficulty, note: null, stratum: k }));
        report.errors = report.errors.filter(e => !/^تعذّر السؤال/.test(e));
        report.substitutions = [];
        report.warnings.push('النطاق ضيق: اختيرت المواضع بحيث تتسع الأسئلة كلها بلا تداخل، فقد تختلف الصعوبة عن المطلوب');
      }
    }
    report.repeated = repeated;
    if (repeated) report.warnings.push(`كُرّر ${repeated} ${repeated === 1 ? 'موضع' : 'مواضع'} سُئل فيها الطالب سابقاً لأن المواضع الجديدة نفدت (الأقدم سؤالاً أولاً)`);

    chosen.sort((a, b) => startPos(a.q.from, a.q.fromWord) - startPos(b.q.from, b.q.fromWord));
    const questions = chosen.map(({ q, want, note }, i) => {
      const sl = lineOfWord(ix, q.from, q.fromWord || 0), el = lineOfWord(ix, q.to, q.toWord);   // البداية الفارغة = أول الآية، والنهاية الفارغة = آخرها
      const notes = [];
      if (note) notes.push(note);
      if (q.crossesSurah) notes.push('يعبر من سورة إلى التي بعدها');
      if (q.anchored) notes.push(q.anchoredAt === 'surah' ? 'ثُبّتت نهايته عند آخر السورة ومُدّ ابتداؤه إلى الخلف'
        : q.anchoredAt === 'trapped' ? 'آية لا يبلغها سؤال يبدأ منها، فثُبّتت نهايته عندها ومُدّ ابتداؤه إلى الخلف'
        : 'ثُبّتت نهايته عند آخر النطاق ومُدّ ابتداؤه إلى الخلف');
      if (q.fromWord) notes.push('يبدأ من وسط آية طويلة (بداية معتمدة)');
      if (q.toWord != null) notes.push(q.trappedStop ? 'آية قصيرة بين آيتين طويلتين: يقف عند علامة وقف داخل الآية التي بعدها' : 'يقف عند علامة وقف داخل آية طويلة');
      if (q.longWhole) notes.push('آية طويلة لا بداية معتمدة في وسطها، فتُسأل كاملة');
      else if (q.trappedOver) notes.push(`أطول من الحد (${plan.length + plan.maxOverflow} أسطر) استثناءً بنحو ${Math.max(0.1, Math.round((q.actual - plan.length - plan.maxOverflow) * 10) / 10)} سطر، لأن أقرب علامة وقف بعد الآية القصيرة أبعد منه`);
      else if (q.overflow > 0) notes.push(q.fromWord || q.toWord != null
        ? `أطول من المطلوب بنحو ${q.overflow} سطر ليقف عند أقرب علامة وقف أو آخر آية`
        : `أطول من المطلوب بـ ${q.overflow} ${q.overflow === 1 ? 'سطر' : 'أسطر'} لأن الآية لا تُقطع`);
      report.got[q.difficulty]++;
      return {
        n: i + 1, from: ix.sa(q.from), to: ix.sa(q.to), fromAbs: q.from, toAbs: q.to, fromWord: q.fromWord, toWord: q.toWord,
        start: { page: ix.tl.page[sl], line: ix.tl.line[sl] }, end: { page: ix.tl.page[el], line: ix.tl.line[el] },
        length: { unit: plan.unit, requested: plan.length, actual: q.actual, overflow: q.overflow },
        ayahs: q.to - q.from + 1, lines: el - sl + 1,
        difficulty: q.difficulty, wanted: want, signals: q.signals,
        // من الفهرس لا من إشارات classify، فيبقى صحيحاً حين تُستبدل classify في مرحلة ذكاء الصعوبة
        crossesSurah: q.crossesSurah, crossesPage: ix.tl.page[sl] !== ix.tl.page[el], anchored: q.anchored, notes
      };
    });
    if (overflowRejected) report.warnings.push(`استُبعد ${overflowRejected} موضعاً لأن الآيات فيها أطول من المسموح (الحد ${plan.maxOverflow} ${plan.unit === 'lines' ? 'أسطر' : ''} زيادة)`);
    report.items = questions.map(q => ({ n: q.n, wanted: q.wanted, got: q.difficulty, requested: q.length.requested, actual: q.length.actual, overflow: q.length.overflow, notes: q.notes }));
    report.ok = report.errors.length === 0 && questions.length === count;
    return { questions, report };
  }

  // نموذج اختبار كامل من القالب: أسئلة لكل قسم أسئلة مفعّل، بلا تداخل بين الأقسام
  function generateForm(ix, template, { range, seed, exclude = [] }) {
    // البذرة عدد صحيح من 0 إلى 2³²−1؛ وإلا حوّلها >>> بصمت إلى رقم آخر (1.5 ← 1) فلا يُعاد النموذج نفسه
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) throw new ExamError('BAD_PLAN', 'البذرة يجب أن تكون عدداً صحيحاً من 0 إلى 4294967295');
    const tpl = normalizeTemplate(template);
    const parts = [];
    let taken = exclude.slice();
    tpl.sections.filter(s => s.kind === 'questions' && s.enabled).forEach((s, i) => {
      const r = generateQuestions(ix, { range, plan: s.plan, count: s.questionCount, seed: (seed + i * 7919) >>> 0, exclude: taken });
      parts.push({ sectionId: s.id, sectionName: s.name, questions: r.questions, report: r.report });
      taken = taken.concat(r.questions.map(q => ({ from: q.fromAbs, to: q.toAbs, fromWord: q.fromWord, toWord: q.toWord, sameForm: true })));
    });
    return {
      schema: 1, coreVersion: CORE_VERSION, edition: ix.edition, templateId: tpl.id || null, templateVersion: tpl.version,
      source: clone(range), seed, locked: false, parts,
      questions: parts.flatMap(p => p.questions),
      ok: parts.every(p => p.report.ok)
    };
  }
  // ═════════════════════ ٨) المستويات ونوع الاختبار ═════════════════════
  // المستوى: { id، name، range } والنطاق بأي صيغة من صيغ resolveRange. الحفظ من الناس صعوداً، فالأول = الجزء 30.
  // تعرّفها اللجنة من داخل البرنامج؛ هذه القيم الافتراضية تُنشأ أول مرة فقط.
  const arDigits = n => String(n).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
  function defaultLevels() {
    return Array.from({ length: 30 }, (_, i) => ({ id: 'L' + (i + 1), name: `المستوى ${arDigits(i + 1)}`, range: { type: 'juz', juz: [30 - i] } }));
  }
  function validateLevels(ix, levels) {
    if (!Array.isArray(levels) || !levels.length) return ['لا مستويات'];
    const E = [], ids = new Set();
    levels.forEach((l, i) => {
      const where = `المستوى ${i + 1}`;
      if (!l || typeof l !== 'object') { E.push(`${where}: غير صالح`); return; }
      if (!isStr(l.id)) E.push(`${where}: معرّف مطلوب`); else if (ids.has(l.id)) E.push(`${where}: المعرّف «${l.id}» مكرر`); else ids.add(l.id);
      if (!isStr(l.name)) E.push(`${where}: الاسم مطلوب`);
      try { if (!l.range) throw new Error('النطاق مفقود'); resolveRange(ix, l.range); } catch (e) { E.push(`${where}${isStr(l.name) ? ` «${l.name}»` : ''}: ${e.message}`); }
    });
    return E;
  }
  // نطاقا اختبار مستوى: الجديد (المستوى نفسه)، والسابق (من المستوى الأول إلى ما قبله) في التراكمي فقط
  function levelRanges(levels, index, type) {
    const lv = levels[index];
    if (!lv) throw new ExamError('BAD_PLAN', 'المستوى غير موجود');
    if (type !== 'cumulative') return { new: clone(lv.range), prev: null, union: clone(lv.range) };
    if (index === 0) throw new ExamError('BAD_PLAN', 'المستوى الأول لا يكون اختباره تراكمياً: لا مستوى قبله');
    const prev = { type: 'multi', parts: levels.slice(0, index).map(l => clone(l.range)) };
    return { new: clone(lv.range), prev, union: { type: 'multi', parts: [...prev.parts, clone(lv.range)] } };
  }
  // نوع الاختبار وعدد أسئلته وكم منها من المستوى الجديد، من إعدادات «نوع الاختبار» وما يغيّره المحكّم لهذا الطالب.
  // type فارغ = الافتراضي (والمستوى الأول «هذا المستوى فقط» دائماً). العدد المغيَّر يأخذ من الجديد بالنسبة نفسها،
  // ولا يقل الجديد عن ١ ولا يساوي الكل في التراكمي.
  function planLevelExam(template, { levels, index, type = null, count = null }) {
    const et = normalizeTemplate(template).examType;
    if (!Array.isArray(levels) || !Number.isInteger(index) || !levels[index]) throw new ExamError('BAD_PLAN', 'المستوى غير موجود');
    if (type != null && !EXAM_TYPES.includes(type)) throw new ExamError('BAD_PLAN', 'نوع الاختبار: تراكمي أو هذا المستوى فقط');
    if (type === 'cumulative' && index === 0) throw new ExamError('BAD_PLAN', 'المستوى الأول لا يكون اختباره تراكمياً: لا مستوى قبله');
    const t = index === 0 ? 'levelOnly' : (type || et.default);
    const n = count == null ? (t === 'levelOnly' ? et.levelOnlyCount : et.cumulativeCount) : count;
    if (!Number.isInteger(n) || n < 1 || n > et.maxQuestions) throw new ExamError('BAD_PLAN', `عدد الأسئلة من 1 إلى ${et.maxQuestions} (الحد الأعلى في إعدادات نوع الاختبار)`);
    if (t === 'levelOnly') return { type: t, count: n, newCount: n, prevCount: 0 };
    if (n < 2) throw new ExamError('BAD_PLAN', 'الاختبار التراكمي سؤالان على الأقل: واحد من المستوى الجديد وواحد مما قبله');
    const newCount = n === et.cumulativeCount ? et.cumulativeNew : Math.max(1, Math.min(n - 1, Math.round(n * et.cumulativeNew / et.cumulativeCount)));
    return { type: t, count: n, newCount, prevCount: n - newCount };
  }

  // جدوى اختبار مستوى بنطاقيه كما يُولَّد فعلاً: في التراكمي لا يعبر سؤال بين المستوى الجديد وما قبله، فالمتّسع =
  // ما يتسع له الجديد وحده + ما يتسع له السابق وحده (لا نطاقهما المدمج، الذي قد يجمع أسطراً لا يقوم منها سؤال)
  function checkLevelFeasibility(ix, template, { levels, index, type = null, count = null }) {
    const lp = planLevelExam(template, { levels, index, type, count });
    const tpl = examTemplate(template, { questionCount: lp.count });
    const rg = levelRanges(levels, index, lp.type);
    if (lp.type === 'levelOnly') return checkFormFeasibility(ix, rg.new, tpl);
    const s0 = tpl.sections.find(s => s.kind === 'questions' && s.enabled);
    if (!s0) return { ok: false, message: 'لا قسم أسئلة مفعّل في الورقة' };
    // سعة كل نطاق بالقاعدة نفسها التي يطبّقها التوليد (checkFeasibility): الأصغر من عدّ الأسطر وأكبر عدد لا يتداخل
    const cap = range => { const R = resolveRange(ix, range); return Math.min(Math.floor((s0.plan.unit === 'lines' ? R.lines : R.ayahs) / s0.plan.length), maxQuestions(ix, R, s0.plan).fit); };
    const fitNew = cap(rg.new), fitPrev = cap(rg.prev);
    if (fitNew + fitPrev >= lp.count) return { ok: true, fitNew, fitPrev };
    return { ok: false, fitNew, fitPrev, maxCount: fitNew + fitPrev,
      message: `المستوى الجديد يتسع لـ ${fitNew} ${fitNew === 1 ? 'سؤال' : 'أسئلة'} وما قبله لـ ${fitPrev}، فلا يتسعان لـ ${lp.count}. قلّل عدد الأسئلة إلى ${fitNew + fitPrev}.` };
  }

  // نموذج اختبار مستوى. «هذا المستوى فقط» = نموذج عادي من نطاق المستوى. والتراكمي: من المستوى الجديد عدده، والباقي
  // من المستويات السابقة (ببذرة مشتقة، وبلا تداخل)، وإن ضاق أحدهما أُكمل من الآخر مع ملاحظة؛ ثم بترتيب المصحف وترقيم جديد.
  // يعيد شكل generateForm نفسه، ومعه template (القالب بعدده الفعلي، ليُجمَّد في المسودة) وlevelPlan.
  function generateLevelForm(ix, template, { levels, index, type = null, count = null, seed, exclude = [] }) {
    if (!Array.isArray(levels) || !Number.isInteger(index) || index < 0 || index >= levels.length) throw new ExamError('BAD_PLAN', 'المستوى غير موجود');
    const lp = planLevelExam(template, { levels, index, type, count });
    const tpl = examTemplate(template, { questionCount: lp.count });
    const rg = levelRanges(levels, index, lp.type);
    const usedLevels = lp.type === 'cumulative' ? levels.slice(0, index + 1) : [levels[index]];
    const levelPlan = { levelId: levels[index].id, levelName: levels[index].name, type: lp.type, count: lp.count, newCount: lp.newCount, ranges: clone(rg), levels: clone(usedLevels) };
    if (lp.type === 'levelOnly') {
      const f = generateForm(ix, tpl, { range: rg.new, seed, exclude });
      levelPlan.got = { new: f.parts.length ? f.parts[0].questions.length : 0, prev: 0 };
      return { ...f, template: tpl, levelPlan };
    }
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) throw new ExamError('BAD_PLAN', 'البذرة يجب أن تكون عدداً صحيحاً من 0 إلى 4294967295');
    const secs = tpl.sections.filter(s => s.kind === 'questions' && s.enabled), s0 = secs[0];
    if (!s0) throw new ExamError('BAD_PLAN', 'لا قسم أسئلة مفعّل في الورقة');

    const mixTotal = s0.plan.difficulty;   // examTemplate جعله بالعدد الفعلي إن كان ثابتاً
    // ما بقي من توزيع الصعوبة الثابت بعد ما أُخذ فعلاً، ليطلب كل نطاق ما ينقص المجموع لا توزيعاً من جديد
    const leftAfter = qs => (mixTotal === 'auto' ? null : Object.fromEntries(DIFFS.map(d => [d, Math.max(0, mixTotal[d] - qs.filter(q => q.difficulty === d).length)])));
    const mixOf = (n, base) => (mixTotal === 'auto' ? 'auto' : scaleMix(base && DIFFS.some(d => base[d]) ? base : mixTotal, n));
    const asTaken = qs => qs.map(q => ({ from: q.fromAbs, to: q.toAbs, fromWord: q.fromWord, toWord: q.toWord, sameForm: true }));
    const gen = (range, n, sd, ex, base) => generateQuestions(ix, { range, plan: { ...s0.plan, difficulty: mixOf(n, base) }, count: n, seed: sd >>> 0, exclude: ex, allowPartial: true });

    const gNew = gen(rg.new, lp.newCount, seed, exclude);
    const needPrev = lp.count - gNew.questions.length;
    const gPrev = gen(rg.prev, needPrev, seed + 104729, exclude.concat(asTaken(gNew.questions)), leftAfter(gNew.questions));
    const reports = [gNew.report, gPrev.report], all = gNew.questions.concat(gPrev.questions);
    let gMore = null;
    if (all.length < lp.count) {
      gMore = gen(rg.new, lp.count - all.length, seed + 2 * 104729, exclude.concat(asTaken(all)), leftAfter(all));
      reports.push(gMore.report); all.push(...gMore.questions);
    }
    all.sort((a, b) => startPos(a.fromAbs, a.fromWord) - startPos(b.fromAbs, b.fromWord));
    const questions = all.map((q, i) => ({ ...q, n: i + 1 }));
    const complete = questions.length === lp.count;
    // التحذيرات الفرعية عن المستبعد والمكرر تُجمع رقماً واحداً، فلا يظهر عددان متناقضان
    const isCount = w => /^استُبعد \d+ موضعاً لتداخلها/.test(w) || /^كُرّر \d+ /.test(w);
    const excludedPrev = reports.reduce((a, r) => a + (r.excludedPrev || 0), 0), repeated = reports.reduce((a, r) => a + (r.repeated || 0), 0);
    const report = {
      ok: complete,
      range: { new: gNew.report.range, prev: gPrev.report.range },
      wanted: mixTotal === 'auto' ? autoMix(lp.count) : { ...mixTotal },
      got: Object.fromEntries(DIFFS.map(d => [d, questions.filter(q => q.difficulty === d).length])),
      substitutions: reports.flatMap(r => r.substitutions), warnings: [], errors: [], excludedPrev, repeated,
      // ما طُلب من كل نطاق (الجديد، ثم السابق، ثم الإكمال إن وُجد): مجموعه = توزيع الورقة
      plannedMix: reports.map(r => r.wanted).filter(Boolean)
    };
    if (gNew.questions.length < lp.newCount) report.warnings.push(`المستوى الجديد يتسع لـ ${gNew.questions.length} من ${lp.newCount}، فأُكمل الباقي من المستويات السابقة`);
    if (gPrev.questions.length < needPrev) report.warnings.push(`المستويات السابقة اتسعت لـ ${gPrev.questions.length} من ${needPrev}، فأُكمل الباقي من المستوى الجديد`);
    if (excludedPrev) report.warnings.push(`استُبعد ${excludedPrev} موضعاً لتداخلها مع أسئلة سابقة`);
    if (repeated) report.warnings.push(`كُرّر ${repeated} ${repeated === 1 ? 'موضع' : 'مواضع'} سُئل فيها الطالب سابقاً لأن المواضع الجديدة نفدت (الأقدم سؤالاً أولاً)`);
    // نقص أحد النطاقين يُكمَل من الآخر: أخطاؤه الفرعية ملاحظات ما دام الاختبار اكتمل، وأخطاء إن لم يكتمل
    reports.forEach(r => [...r.warnings.filter(w => !isCount(w)), ...r.errors].forEach(w => {
      const list = complete ? report.warnings : report.errors; if (!list.includes(w)) list.push(w);
    }));
    if (!complete) report.errors.push(`تعذّر ${lp.count - questions.length} من ${lp.count} أسئلة: المستوى وما قبله لا يتسعان لها`);
    report.items = questions.map(q => ({ n: q.n, wanted: q.wanted, got: q.difficulty, requested: q.length.requested, actual: q.length.actual, overflow: q.length.overflow, notes: q.notes }));
    levelPlan.got = { new: gNew.questions.length + (gMore ? gMore.questions.length : 0), prev: gPrev.questions.length };
    const parts = [{ sectionId: s0.id, sectionName: s0.name, questions, report }];
    // أقسام أسئلة أخرى في الورقة (نادرة): من النطاق كله بلا تداخل
    let taken = exclude.concat(asTaken(questions));
    secs.slice(1).forEach((s, i) => {
      const r = generateQuestions(ix, { range: rg.union, plan: s.plan, count: s.questionCount, seed: (seed + (i + 1) * 7919) >>> 0, exclude: taken });
      parts.push({ sectionId: s.id, sectionName: s.name, questions: r.questions, report: r.report });
      taken = taken.concat(asTaken(r.questions));
    });
    return {
      schema: 1, coreVersion: CORE_VERSION, edition: ix.edition, templateId: tpl.id || null, templateVersion: tpl.version,
      source: clone(rg.union), seed, locked: false, parts,
      questions: parts.flatMap(p => p.questions),
      ok: parts.every(p => p.report.ok),
      template: tpl, levelPlan
    };
  }

  const lockForm = form => deepFreeze({ ...clone(form), locked: true });

  // وصف مقروء لموضع سؤال
  // textData (اختياري، نص المصحف): يُذكر به أول كلمات البداية وآخر كلمات النهاية حين يبدأ السؤال أو يقف في وسط آية
  const isWordToken = t => /[ء-يٱ-ۓ]/.test(t.replace(/[ۖ-ۜ]/g, ''));
  function ayahWords(textData, ai) {
    const out = [];
    for (const t of textData.text[ai].split(/\s+/).filter(Boolean)) {
      if (isWordToken(t)) out.push(t); else if (t.charAt(0) === '۞') continue; else if (out.length) out[out.length - 1] += ' ' + t;
    }
    return out;
  }
  function describeQuestion(ix, q, textData) {
    const [s1, a1] = q.from, [s2, a2] = q.to;
    const n1 = ix.surahs[s1 - 1].name, n2 = ix.surahs[s2 - 1].name;
    let where = s1 === s2 ? `سورة ${n1} من الآية ${a1} إلى ${a2}` : `من سورة ${n1} آية ${a1} إلى سورة ${n2} آية ${a2}`;
    if (textData && (q.fromWord || q.toWord != null)) {
      if (q.fromWord) where += `، من قوله «${ayahWords(textData, ix.abs(s1, a1)).slice(q.fromWord, q.fromWord + 3).join(' ')}…»`;
      if (q.toWord != null) where += `، إلى قوله «…${ayahWords(textData, ix.abs(s2, a2)).slice(Math.max(0, q.toWord - 2), q.toWord + 1).join(' ')}»`;
    }
    return `${where} — ص${q.start.page} س${q.start.line} إلى ص${q.end.page} س${q.end.line} (${DIFF_AR[q.difficulty]})`;
  }

  return {
    CORE_VERSION, EDITION, ExamError,
    // الحساب الدقيق
    toUnits, fromUnits,
    // القالب
    defaultTemplate, validateTemplate, normalizeTemplate, migrateTemplate, bumpVersion, TEMPLATE_SCHEMA, examTemplate, describeCarry,
    // الحساب والتقدير
    newCounters, computeResult, applyRounding, validateGradeScale, describeGradeScale,
    // التجميد والإعادة، وتطبيع المحفوظ قبل التحديث
    finalizeResult, recomputeResult, retakeDecision, deepFreeze,
    normalizeStoredResult, normalizeStoredDraft, examinerName, validateExaminers, resolveExaminers,
    // المصحف والنطاق والتوليد
    // المستويات ونوع الاختبار
    defaultLevels, validateLevels, levelRanges, planLevelExam, generateLevelForm, checkLevelFeasibility,
    buildQuranIndex, resolveRange, surahAyahSpec, classify, buildQuestion, buildCandidates, longAyah, lineOfWord, spanLines, overlaps, autoMix, checkFeasibility, checkFormFeasibility, generateQuestions, generateForm, lockForm, describeQuestion,
    _internal: { rng, sectionMax, gradeFor }
  };
});
