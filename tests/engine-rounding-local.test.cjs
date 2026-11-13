// اختبار قبول ح1 «تقريب جيد جداً» (general فقط) — 2026-11-13. يُرى أحمر قبل البناء.
// المصدر: notes/features/engine/journey-fixes-card.md §1 (الجرد)، §4 ح1 (ق1–ق6د)، §5أ (ر1–ر3).
// الأساس: 274bd05. الميزان الحقيقي quran/*.js وgeneral-points.js الحالي عبر quick-entry-harness.cjs؛ الدوال من index.html بـsource().
// قراءات الكاتب لما لم تنصّ عليه البطاقة حرفاً (مذكورة هنا ليعرفها كاتب الكود):
// - الصفحات الـ64 والـ506 مأخوذة بـ QuranMeasure.measure({ page: [p] }) كما في سكربت البطاقة، و«الصفحة ذات 15 سطراً» = |lines − 15| < 1e-9.
// - ق3 «جديداً ومراجعةً» بمعامل 3 للاثنين (kindMult { newMemorization: 3, review: 3 })، وإلا لم يكن 33.8 للمراجعة؛ بقية الأمثلة بالافتراضي العام (الجديد 3).
// - ق6د: المجتمع = سكربت البطاقة حرفياً (كل وجه، كل ربع، كل سورة، كل آية، ونوافذ 2/3/5/8/11/20 آية داخل السورة) × التقديرات الثلاثة، الجديد بمعامل 3.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const cp = require('node:child_process');
const path = require('node:path');
const { harness: quick, student: quickStudent, source, html, root, QuranMeasure, generalEntryPoints, copy } = require('./helpers/quick-entry-harness.cjs');
const BASE = '274bd05';
const lf = text => text.replaceAll('\r\n', '\n');
const atBase = file => lf(cp.execFileSync('git', ['show', BASE + ':' + file], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

// ===== الإعداد: تقديرات العام الافتراضية من programs-store.js =====
const storeText = lf(fs.readFileSync(path.join(root, 'programs-store.js'), 'utf8'));
const defs = vm.runInNewContext(`(${storeText.match(/export const PROGRAM_DEFS = ([\s\S]*?);\n/)[1]})`);
const GRADES = copy(defs.general.defaultSettings.grades);
const DEFAULT_MULT = copy(defs.general.defaultSettings.kindMult);           // { newMemorization: 3, review: 1 }
const settings = (kindMult = DEFAULT_MULT) => ({ grades: copy(GRADES), kindMult: copy(kindMult) });
const points = (lines, kind, gradeId, kindMult) => generalEntryPoints({ lines, kind, gradeId, settings: settings(kindMult) }).points;

// ===== المقاطع =====
const PAGE3 = { from: [2, 6], to: [2, 16] };    // الصفحة 3 = البقرة 6←16 (11 آية)
const PAGE4 = { from: [2, 17], to: [2, 24] };   // الصفحة 4 = البقرة 17←24 (8 آيات)
const linesOf = spec => QuranMeasure.measure({ spec }).lines;
const pageLines = p => QuranMeasure.measure({ page: [p] }).lines;
// القائمة حرفياً من design-v1/verify/full-journey-emu-2026-11-13/engine-rounding-check.txt
const PAGES_64 = [3, 12, 14, 26, 33, 61, 76, 105, 112, 126, 130, 134, 142, 149, 162, 176, 185, 203, 209, 216, 226, 242, 260, 265, 272, 280,
    288, 289, 296, 298, 314, 326, 343, 346, 347, 354, 355, 356, 370, 372, 373, 374, 375, 376, 379, 401, 448, 450, 451, 456, 457, 468, 469, 479,
    480, 482, 493, 495, 508, 513, 533, 557, 573, 588];
const PAGES_15 = Array.from({ length: 604 }, (_, i) => i + 1).filter(p => Math.abs(pageLines(p) - 15) < 1e-9);

// ===== ح1 — ر1 (ق1–ق3): يفشل اليوم =====
test('ق1 (ر1): الصفحة 3 (البقرة 6←16) جيد جداً جديداً بمعامل 3 = 15 × 3 × 0.75 = 33.75 ← 33.8', () => {
    assert.equal(points(linesOf(PAGE3), 'new', 'very-good'), 33.8);
});
test('ق2 (ر1): الصفحة 4 (البقرة 17←24) جيد جداً جديداً = 33.8 (بلا تغيير)', () => {
    assert.equal(points(linesOf(PAGE4), 'new', 'very-good'), 33.8);
});
test('ق3 (ر1): الصفحات ذات الـ15 سطراً في الميزان = 506، والصفحات الـ64 منها', () => {
    assert.equal(PAGES_15.length, 506);
    assert.equal(PAGES_64.length, 64);
    assert.deepEqual(PAGES_64.filter(p => !PAGES_15.includes(p)), []);
});
test('ق3 (ر1): كل صفحة من الـ64 جيد جداً = 33.8 جديداً ومراجعةً (معامل 3 للاثنين)', () => {
    const mult = { newMemorization: 3, review: 3 };
    const wrong = [];
    for (const p of PAGES_64) for (const kind of ['new', 'review']) {
        const got = points(pageLines(p), kind, 'very-good', mult);
        if (got !== 33.8) wrong.push(`${kind} ص${p}=${got}`);
    }
    assert.deepEqual(wrong, [], `${wrong.length} حالة ليست 33.8`);
});
test('ق3 (ر1): كل الصفحات الـ506 ذات الـ15 سطراً جيد جداً = 33.8 جديداً ومراجعةً', () => {
    const mult = { newMemorization: 3, review: 3 };
    const wrong = [];
    for (const p of PAGES_15) for (const kind of ['new', 'review']) {
        const got = points(pageLines(p), kind, 'very-good', mult);
        if (got !== 33.8) wrong.push(`${kind} ص${p}=${got}`);
    }
    assert.deepEqual(wrong, [], `${wrong.length} حالة ليست 33.8`);
});

// ===== ح1 — ر2 (ق4–ق6، ق6د): أخضر قبل البناء وبعده إلا ق6د =====
test('ق4 (ر2): الصفحة 3 ممتاز = 45 وجيد = 22.5 (بلا تغيير)', () => {
    assert.equal(points(linesOf(PAGE3), 'new', 'excellent'), 45);
    assert.equal(points(linesOf(PAGE3), 'new', 'good'), 22.5);
});
test('ق4 (ر2): الصفحات الـ506 ممتاز = 45 وجيد = 22.5 (بلا تغيير)', () => {
    const wrong = [];
    for (const p of PAGES_15) {
        const L = pageLines(p);
        if (points(L, 'new', 'excellent') !== 45) wrong.push(`ممتاز ص${p}`);
        if (points(L, 'new', 'good') !== 22.5) wrong.push(`جيد ص${p}`);
    }
    assert.deepEqual(wrong, []);
});
test('ق5 (ر2): وزن الفرسان dayAcceptedWeightTenths ليوم فيه البقرة 6←16 جيد جداً = { new: 450, review: 0, total: 450 } (بلا تغيير)', () => {
    const ctx = vm.createContext({ QuranMeasure });
    for (const name of ['ivPairs', 'measureEntry']) vm.runInContext(html.match(new RegExp(`const ${name} = .*;`))[0], ctx);
    vm.runInContext(source('dayAcceptedWeightTenths'), ctx);
    const pts = generalEntryPoints({ lines: linesOf(PAGE3), kind: 'new', gradeId: 'very-good', settings: settings() });
    ctx.day = { attended: true, entries: { e: { kind: 'new', spec: PAGE3, grade: 'very-good', mult: pts.mult, points: pts.points, rep: 1 } } };
    ctx.kindMult = DEFAULT_MULT;
    assert.deepEqual(copy(vm.runInContext('dayAcceptedWeightTenths(day, kindMult)', ctx)), { new: 450, review: 0, total: 450 });
    // ولكل صفحة من الـ64: 15 سطراً × 3 = 450 عُشراً
    const wrong = [];
    for (const p of PAGES_64) {
        ctx.day = { attended: true, entries: { e: { kind: 'new', iv: QuranMeasure.measure({ page: [p] }).intervals, grade: 'very-good', mult: 3, rep: 1 } } };
        const w = copy(vm.runInContext('dayAcceptedWeightTenths(day, kindMult)', ctx));
        if (w.total !== 450 || w.new !== 450) wrong.push(`ص${p}=${w.total}`);
    }
    assert.deepEqual(wrong, []);
});
test('ق6 (ر2): مقادير البقرة 6←16 = 11 آية · 1 وجه · 0.32 ربع · 0.08 حزب · 0.04 جزء، والأسطر 14.999999999999996 كما هي (الميزان لا يُمس)', () => {
    const m = QuranMeasure.measure({ spec: PAGE3 });
    assert.equal(m.ayahs, 11);
    assert.equal(m.pages, 1);
    assert.equal(Number(m.quarters.toFixed(2)), 0.32);
    assert.equal(Number(m.hizb.toFixed(2)), 0.08);
    assert.equal(Number(m.juz.toFixed(2)), 0.04);
    assert.equal(m.lines, 14.999999999999996);
    assert.equal(QuranMeasure.measure({ spec: PAGE4 }).lines, 15);
});
test('ق6 (ر2): الميزان quran/*.js مطابق لـ274bd05 حرفياً', () => {
    for (const file of ['quran-meta', 'quran-lines', 'quran-words', 'quran-measure'])
        assert.equal(lf(fs.readFileSync(path.join(root, 'quran', file + '.js'), 'utf8')), atBase(`quran/${file}.js`), file);
});

// ق6د: الفرق بين generalEntryPoints الحالي ونسخة 274bd05 على المجتمع كله
const qmeta = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(root, 'quran', 'quran-meta.js'), 'utf8'), qmeta);
const AYAH_COUNTS = qmeta.window.QURAN_META.surahs.map(s => s[1]);
function population() {
    const pop = [];
    for (let p = 1; p <= 604; p++) pop.push(['وجه ' + p, QuranMeasure.measure({ page: [p] }).lines]);
    for (let q = 1; q <= 240; q++) pop.push(['ربع ' + q, QuranMeasure.measure({ quarter: [q] }).lines]);
    for (let su = 1; su <= 114; su++) pop.push(['سورة ' + su, QuranMeasure.measure({ surah: [su] }).lines]);
    for (let su = 1; su <= 114; su++) {
        const n = AYAH_COUNTS[su - 1];
        for (let a = 1; a <= n; a++) {
            pop.push([`${su}:${a}`, QuranMeasure.measure({ from: [su, a], to: [su, a] }).lines]);
            for (const w of [2, 3, 5, 8, 11, 20]) if (a + w - 1 <= n)
                pop.push([`${su}:${a}-${a + w - 1}`, QuranMeasure.measure({ from: [su, a], to: [su, a + w - 1] }).lines]);
        }
    }
    return pop;
}
test('ق6د (ر2): لا تغيير خارج حدّ النصف — الفرق عن 274bd05 على 120417 حالة = 2002 بالضبط، كلها على الحد والجديد = القديم + 0.1', () => {
    const oldCtx = vm.createContext({});
    vm.runInContext(atBase('general-points.js'), oldCtx);
    const oldPoints = oldCtx.generalEntryPoints;
    const pop = population();
    assert.equal(pop.length, 40139);
    const s = settings({ newMemorization: 3, review: 3 });
    let cases = 0, diffs = 0; const offHalf = [], notPlusTenth = [];
    for (const [name, lines] of pop) for (const gradeId of ['excellent', 'very-good', 'good']) {
        cases++;
        const cur = generalEntryPoints({ lines, kind: 'new', gradeId, settings: s }).points;
        const old = oldPoints({ lines, kind: 'new', gradeId, settings: s }).points;
        if (cur === old) continue;
        diffs++;
        const raw = lines * 3 * (GRADES.find(g => g.id === gradeId).percent / 100);
        if (!(Math.abs(raw * 10 - Math.floor(raw * 10) - 0.5) < 1e-6)) offHalf.push(`${name} ${gradeId}`);
        if (Math.round(cur * 10) !== Math.round(old * 10) + 1) notPlusTenth.push(`${name} ${gradeId} ${old}→${cur}`);
    }
    assert.equal(cases, 120417);
    assert.deepEqual(offHalf, [], 'فرق خارج حدّ النصف');
    assert.deepEqual(notPlusTenth, [], 'فرق ليس +0.1');
    assert.equal(diffs, 2002);
});

// ===== ح1 — ر3 (ق6ب، ق6ج): الحارس والمعاينة والإدخال السريع؛ يفشل اليوم =====
function generalHarness() {
    const h = quick(quickStudent({}, { direction: 'down', frontierBase: { surah: 2, ayah: 5 },
        frontierFix: { surah: 2, ayah: 5, at: 0, by: 'fake-admin', prev: null } }));
    h.state.settings.grades = copy(GRADES);
    h.state.settings.kindMult = copy(DEFAULT_MULT);
    h.reopen();
    return h;
}
const guardPatch = pts => `canWriteHistory({ 'history.2026-11-01.entries.x': { kind: 'new', spec: { from: [2, 6], to: [2, 16] }, grade: 'very-good', mult: 3, points: ${pts}, rep: 1, heardBy: 't1', at: 1, by: 'fake-admin' } })`;
test('ق6ب (ر3): الحارس canWriteHistory يقبل البقرة 6←16 جيد جداً بـpoints 33.8', () => {
    const h = generalHarness();
    assert.equal(h.run(guardPatch(33.8)), true, JSON.stringify(h.state.messages));
});
test('ق6ب (ر3): الحارس canWriteHistory يرفض البقرة 6←16 جيد جداً بـpoints 33.7 برسالة «نقاط التسميع أو معامله لا يطابقان…»', () => {
    const h = generalHarness();
    assert.equal(h.run(guardPatch(33.7)), false);
    assert.match(h.state.messages.at(-1)?.message || '', /نقاط التسميع أو معامله لا يطابقان/);
});
test('ق6ج (ر3): الإدخال السريع للبقرة 6←16 جيد جداً: نقاط المقطع 33.8 وtotal = 33.8 + المعايير', () => {
    const h = generalHarness();
    assert.deepEqual(copy(h.run('generalQuickEntry.newStart')), { surah: 2, ayah: 6 });
    h.range('new', null, [2, 16]); h.grade('new', 'very-good');
    const result = h.preview();
    assert.deepEqual(result.errors, []);
    assert.equal(result.sections.length, 1);
    assert.equal(result.sections[0].points, 33.8);
    assert.equal(result.sections[0].mult, 3);
    assert.equal(result.total, h.run('roundPointTotal')(33.8 + result.criteria.delta));
});
test('ق6ج (ر3): معاينة نافذة السرد calculateQuran للبقرة 6←16 جيد جداً تعرض 33.8 (مطابقة للإدخال السريع)', () => {
    const h = generalHarness();
    h.run(source('calculateRangeStats')); h.run(source('calculateQuran'));
    h.ctx.showRangePreview = () => {}; h.ctx.updateGrandTotal = () => {};
    h.run("currentSardType = 'new'");
    h.element('startSurah').value = '2'; h.element('startAyah').value = '6';
    h.element('endSurah').value = '2'; h.element('endAyah').value = '16';
    h.element('smartGrade').value = 'very-good'; h.element('disciplineOnlyCheck').checked = false;
    h.run('calculateQuran()');
    assert.equal(h.element('resAyahs').innerText, 11);
    assert.equal(h.element('resWeightedPoints').innerText, 33.8);
});
