// اختبار قبول البند 2-1 «النجم الصاعد كل أسبوعين بالحلقة» (general فقط) — 2026-11-13. يُرى أحمر قبل البناء.
// المصدر: notes/features/knights/rising-star-card.md §2 (أ–ز)، §2ح (ق1–ق13)، §3 (جدول المدخلات)، §4 (ر1–ر10).
// الأساس: bf6a5e7. الحساب بالدوال الجديدة عبر source()؛ المخزن بحاضنة knights-r2b-harness (programs-store.js في vm)؛
// اللقطة بـinstallTv؛ الرسم بنمط openTv (tests/tv-design-local.test.cjs:52-63)؛ الواجهة والورقة في متصفح حقيقي بملف index.html كما هو ومخازن وهمية.
// قراءات الكاتب لما لم تنصّ عليه البطاقة حرفاً (مذكورة هنا ليعرفها كاتب الكود):
// - risingStarCycleAt تعيد null أو الدورة (أو { cycle })؛ والحال 'approve'/'announced' قيمةُ حقلٍ فيها.
// - اسم يوم الاثنين يُقبل «الاثنين» أو «الإثنين» (ALL_DAY_NAMES فيها «الإثنين»، والبطاقة كتبت «الاثنين»).
// - خيارات الراديو في الصندوق لها اسم يمكن الوصول إليه (label)، وخانة السبب label أو placeholder نصه «السبب (من ورقة المعلم)».
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const cp = require('node:child_process');
const path = require('node:path');
const { harness: quick, source, html, root, QuranMeasure, copy } = require('./helpers/quick-entry-harness.cjs');
const { installTv } = require('./helpers/tv-harness.cjs');
const { cloud } = require('./helpers/knights-r2b-harness.cjs');
const BASE = 'bf6a5e7';
const lf = text => text.replaceAll('\r\n', '\n');
const atBase = file => lf(cp.execFileSync('git', ['show', BASE + ':' + file], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
const norm = text => String(text).replace(/\s+/g, ' ').trim();
// «الاثنين» بالهمزة أو بدونها؛ والباقي حرفياً.
const rx = text => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll('الاثنين', 'ال[اإ]ثنين'));

// ===== الإعداد الحقيقي (§ حقائق الموسم): الافتراضي العام + أيام العمل 0–3 + الحضور 10 صراحة + misbehave حاجبة =====
const storeText = lf(fs.readFileSync(path.join(root, 'programs-store.js'), 'utf8'));
const defs = vm.runInNewContext(`(${storeText.match(/export const PROGRAM_DEFS = ([\s\S]*?);\n/)[1]})`);
const STAGES = [{ id: 'primary', name: 'ابتدائي', order: 1, period: 'asr' }, { id: 'middle', name: 'متوسط', order: 2, period: 'maghrib' }];
const TEACHERS = [{ id: 't1', name: 'سعد' }, { id: 't2', name: 'الأستاذ سعيد' }, { id: 't3', name: 'ماجد' }, { id: 't4', name: 'نايف' }];
// الحلقتان أ وب للعصر (ترتيب 0 و1)، ج للمغرب (2)، د للعصر (3). بلا حقل order: الترتيب موضعها في المصفوفة.
const HALAQAS = [{ id: 'A', name: 'أ', teacherId: 't1', stageId: 'primary', active: true }, { id: 'B', name: 'ب', teacherId: 't2', stageId: 'primary', active: true },
    { id: 'C', name: 'ج', teacherId: 't3', stageId: 'middle', active: true }, { id: 'D', name: 'د', teacherId: 't4', stageId: 'primary', active: true }];
const periodOfHalaqa = h => STAGES.find(s => s.id === h.stageId).period;
function generalSettings() {
    const d = copy(defs.general.defaultSettings);
    return { ...d, workingDays: [0, 1, 2, 3], points: { ...d.points, attendance: 10 }, stages: copy(STAGES), teachers: copy(TEACHERS), halaqas: copy(HALAQAS) };
}
const SEASON = { id: 's1', name: 'موسم 2026', status: 'active', termStart: '2026-11-15', termEnd: '2026-12-23',
    calendar: [{ from: '2026-11-20', to: '2026-11-28', kind: 'official', name: 'إجازة الخريف' }] };
const engineSettings = () => ({ ...generalSettings(), season: copy(SEASON) });
const addDays = (date, n) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const TS = { seconds: 1, nanoseconds: 0 };
// الأسابيع المجمَّدة في يوم ما = كل أسبوع انتهى أربعاؤه قبله (knightsEndedWeeks: if (end >= date) break).
function frozenUpTo(date) {
    const out = {};
    for (let w = '2026-11-15'; w <= SEASON.termEnd && addDays(w, 3) < date; w = addDays(w, 7)) out[w] = { ...TS };
    return out;
}
const schoolDays = (start, end) => { const out = []; for (let d = start; d <= end; d = addDays(d, 1)) {
    const wd = new Date(d + 'T12:00:00Z').getUTCDay(); if (wd <= 3 && !(d >= '2026-11-20' && d <= '2026-11-28') && d >= SEASON.termStart && d <= SEASON.termEnd) out.push(d); } return out; };

// ===== جدول المدخلات §3 (س = ما سبق، ن = الأسبوعان) =====
const PAST = ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02'];
const NOW = ['2026-12-06', '2026-12-07', '2026-12-08', '2026-12-09', '2026-12-13', '2026-12-14', '2026-12-15', '2026-12-16'];
// قيمة اليوم = نقاط تسجيل؛ أو { p, c } = تسجيل p ومعايير c (criteriaPoints = مجموعها). اليوم غير المذكور لا سجل له.
function day(v) {
    const p = typeof v === 'number' ? v : v.p;
    const d = { attended: true, entries: { e: { kind: 'review', spec: { from: [2, 1], to: [2, 5] }, grade: 'good', rep: 1, at: 1, by: 'synthetic-admin', points: p } } };
    if (typeof v !== 'number') { d.criteria = { ...v.c }; d.criteriaPoints = Object.values(v.c).reduce((a, b) => a + b, 0); }
    return d;
}
const r = (a, b, v) => Array.from({ length: b - a + 1 }, (_, k) => [a + k, v]);
function mk(id, halaqaId, past, now, joinedOn = '2026-11-08') {
    const history = {};
    for (const [i, v] of past) history[PAST[i - 1]] = day(v);
    for (const [i, v] of now) history[NOW[i - 1]] = day(v);
    return { id, sid: 'rs-' + id, name: 'ط' + id, halaqaId, joinedOn, direction: 'up', lastSurah: 2, lastAyah: 5, history };
}
const STUDENTS = () => [
    mk(101, 'A', r(1, 4, 50), [...r(1, 3, 60), ...r(5, 8, 60)]),
    mk(102, 'A', r(1, 4, 40), r(1, 8, 50)),
    mk(103, 'A', r(1, 4, 30), r(1, 8, 45)),
    mk(104, 'A', r(1, 4, 20), [[1, { p: 22, c: { homeprep: 10 } }], [2, { p: 22, c: { homeprep: 10 } }], [3, 32], [4, 32]]),
    mk(105, 'A', r(1, 4, 25), [...r(1, 4, 30), [5, { p: 35, c: { late: -5 } }], [6, 30]]),
    mk(201, 'B', r(1, 4, 50), r(1, 8, 55)),
    mk(202, 'B', r(1, 4, 50), r(1, 8, 52)),
    mk(203, 'B', r(1, 4, 40), r(1, 8, 45)),
    mk(204, 'B', r(1, 4, 40), r(1, 4, 40)),
    mk(301, 'C', r(1, 8, 50), r(1, 8, 70)),
    mk(302, 'C', r(1, 8, 50), r(1, 8, 65)),
    mk(303, 'C', r(1, 8, 50), r(1, 8, 60)),
    mk(304, 'C', r(1, 4, 30), [[1, 90]]),
    mk(305, 'C', r(1, 2, 20), r(1, 2, 25)),
    mk(306, 'C', r(1, 4, 40), r(1, 4, 50)),
    mk(307, 'C', r(1, 4, 30), [[1, 50], [2, { p: 50, c: { misbehave: -10 } }], [3, 50], [4, 50]]),
    mk(308, 'C', [], r(1, 4, 40), '2026-12-06'),
    mk(309, 'C', [[1, 33.3], [2, 33.3], [3, 33.4]], [[1, 45.5], [2, 40]]),
    mk(401, 'D', r(1, 4, 50), r(1, 8, 60)),
    mk(402, 'D', r(1, 4, 50), r(1, 8, 55)),
    mk(403, 'D', r(1, 4, 30), r(1, 8, 45)),
    mk(404, 'D', r(1, 4, 40), r(1, 5, 76)),
];

// ===== السطور المجمَّدة (مُدخل مُعطى، بشكل buildWeekKnightsRow): ق1ب = سطر W1 للحلقة أ فيه 104 بترشيح واحد، وW2 بلا 104 =====
function frozenRow(weekStart, h, nominees = []) {
    const i = HALAQAS.indexOf(h), stage = STAGES.find(s => s.id === h.stageId);
    return { key: SEASON.id + '|' + weekStart + '|' + h.id, v: 1, weekStart, weekEnd: addDays(weekStart, 3), halaqaId: h.id, halaqaName: h.name,
        teacherName: TEACHERS.find(t => t.id === h.teacherId).name, halaqaOrder: i, stageId: h.stageId, stageName: stage.name, period: stage.period, n: 1,
        kindMult: { newMemorization: 3, review: 1 }, weeklyAttendancePct: 75, schoolDates: schoolDays(weekStart, addDays(weekStart, 3)), homePrepPointsTenths: {},
        nominees, knights: [], rejectedApprovals: [], steps: [], frozenAt: { ...TS }, frozenAtDevice: 1000, frozenBy: 'synthetic-admin' };
}
function weekLog(frozen) {
    const log = {};
    for (const w of Object.keys(frozen)) {
        if (!schoolDays(w, addDays(w, 3)).length) continue;
        for (const h of HALAQAS) {
            const nominees = w === '2026-12-06' && h.id === 'A' ? [{ id: 104, name: 'ط104', nominations: ['2026-12-09'] }] : [];
            const row = frozenRow(w, h, nominees); log[row.key] = row;
        }
    }
    return log;
}
const seasonOn = (date, extra = {}) => { const frozenWeeks = frozenUpTo(date); return { ...copy(SEASON), frozenWeeks, weekKnightsLog: weekLog(frozenWeeks), ...extra }; };

// ===== السجل المعتمَد (§2ب) =====
const APPROVER = 'synthetic-admin';
function recordBase(hid) {
    const h = HALAQAS.find(x => x.id === hid);
    return { cycleEnd: '2026-12-16', weeks: ['2026-12-06', '2026-12-13'], halaqaId: hid, halaqaName: h.name, teacherName: TEACHERS.find(t => t.id === h.teacherId).name,
        halaqaOrder: HALAQAS.indexOf(h), stageId: h.stageId, period: periodOfHalaqa(h) };
}
const REASON_B = 'سبب المعلم المكتوب في الورقة', REASON_C = 'لم يتحسّن أحد بما يكفي';
const RECORDS = (by = APPROVER) => ({
    A: { ...recordBase('A'), choice: 'candidate', studentId: 104, studentName: 'ط104', source: 'auto', reason: '', candidates: [{ id: 104, name: 'ط104' }, { id: 105, name: 'ط105' }], approvedBy: by },
    B: { ...recordBase('B'), choice: 'other', studentId: 203, studentName: 'ط203', source: 'teacher', reason: REASON_B, candidates: [], approvedBy: by },
    C: { ...recordBase('C'), choice: 'none', studentId: null, studentName: '', source: 'teacher', reason: REASON_C,
        candidates: [{ id: 309, name: 'ط309' }, { id: 305, name: 'ط305' }, { id: 306, name: 'ط306' }], approvedBy: by }
});
const locked = rec => ({ ...rec, v: 1, approvedAt: { ...TS }, lockedAt: { ...TS } });

// ===== حاضنة المحرك النقي: بلا ساعة (Date بلا معامل يرمي) ولا مخزن =====
const ENGINE = ['formatDateLocal', 'getWeekStartDate', 'addDaysToDateStr', 'knightsSchoolDates', 'knightsAttendanceState', 'knightsDayPointsTenths',
    'dayHasBlockingViolation', 'knightsIdentityOrder'];
function engine(first) {
    class ExplicitDate extends Date { constructor(...args) { if (!args.length) throw Error('clock read'); super(...args); } static now() { throw Error('clock read'); } }
    const ctx = vm.createContext({ Date: ExplicitDate, Intl });
    const run = code => vm.runInContext(code, ctx);
    for (const name of [...first, ...ENGINE]) run(source(name));
    return { call: (name, ...args) => { ctx.args = copy(args); return copy(run(name + '(...args)')); } };
}
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]));

test('ر0: المدخلات كما في الجدول §3 والإعداد الحقيقي', () => {
    const s = generalSettings();
    assert.equal(s.points.attendance, 10);
    assert.deepEqual(s.criteria.filter(c => c.points < 0).map(c => [c.id, c.name, c.points, c.blocksTitles]),
        [['late', 'تأخر بغير عذر', -5, false], ['misbehave', 'مخالفة الأدب في الحلقة', -10, true], ['disturb', 'إزعاج أو تشويش', -5, false]]);
    assert.deepEqual(schoolDays('2026-11-15', '2026-12-02'), PAST);
    assert.deepEqual(schoolDays('2026-12-06', '2026-12-16'), NOW);
    assert.equal(STUDENTS().length, 22);
});

// ===== ر1: الحساب (ق1–ق6 وق6ب) =====
test('ر1 (الحساب): ق1–ق6 وق6ب على rankHalaqaRisingStars وrisingStarCycles — المرشحون والأسباب وقيم العرض بالأعداد الصحيحة', () => {
    const e = engine(['rankHalaqaRisingStars', 'risingStarCycles']);
    const settings = engineSettings(), students = STUDENTS();
    const cycle = e.call('risingStarCycles', settings).find(c => c.key === '2026-12-16');
    assert.ok(cycle, 'الدورة 2');
    assert.deepEqual([cycle.pastDates, cycle.nowDates], [PAST, NOW]);
    const rank = hid => e.call('rankHalaqaRisingStars', cycle, hid, students, settings);
    const view = x => pick(x, ['id', 'pastAvg', 'nowAvg', 'growth', 'nowDays', 'homePrepDays', 'violations']);
    const reasons = res => Object.fromEntries(res.rows.map(x => [x.id, x.reason || '']));
    const top = 'من الثلاثة الأوائل';
    // ق1: حلقة أ ← [104، 105].
    const A = rank('A');
    assert.deepEqual(A.candidates.map(view), [
        { id: 104, pastAvg: 20, nowAvg: 32, growth: 60, nowDays: 4, homePrepDays: 2, violations: [] },
        { id: 105, pastAvg: 25, nowAvg: 30, growth: 20, nowDays: 6, homePrepDays: 0, violations: [{ name: 'تأخر بغير عذر', days: 1 }] }], 'ق1');
    assert.deepEqual(reasons(A), { 101: top, 102: top, 103: top, 104: '', 105: '' }, 'ق1 الأسباب');
    assert.deepEqual(A.rows.map(x => [x.id, x.pastPointsTenths, x.pastDays, x.nowPointsTenths, x.nowDays, x.totalTenths, x.rank]),
        [[101, 2000, 4, 4200, 7, 4900, 1], [102, 1600, 4, 4000, 8, 4800, 2], [103, 1200, 4, 3600, 8, 4400, 3], [104, 800, 4, 1280, 4, 1680, 5], [105, 1000, 4, 1800, 6, 2400, 4]], 'ق1 الأعشار');
    // ق2: حلقة ب بلا مرشح.
    const B = rank('B');
    assert.deepEqual(B.candidates, [], 'ق2');
    assert.deepEqual(reasons(B), { 201: top, 202: top, 203: top, 204: 'لم يتحسّن' }, 'ق2 الأسباب');
    // ق3–ق6: حلقة ج.
    const C = rank('C');
    assert.deepEqual(C.candidates.map(x => pick(x, ['id', 'pastAvg', 'nowAvg', 'growth', 'nowDays'])), [
        { id: 309, pastAvg: 33.3, nowAvg: 42.8, growth: 28.3, nowDays: 2 },
        { id: 305, pastAvg: 20, nowAvg: 25, growth: 25, nowDays: 2 },
        { id: 306, pastAvg: 40, nowAvg: 50, growth: 25, nowDays: 4 }], 'ق6: 309 ثم التعادل 305 قبل 306');
    assert.deepEqual(reasons(C), { 301: top, 302: top, 303: top, 304: 'حضر أقل من يومين', 305: '', 306: '', 307: 'مخالفة أدب', 308: 'لا سابقة', 309: '' }, 'ق3 وق4 وق5');
    // إثبات 309 = 28.3 بالأعداد الصحيحة: P = 1000 عُشراً، p = 3، N = 855، n = 2 ← round(1000 × (855×3 − 1000×2) ÷ (1000×2)) ÷ 10.
    const s309 = C.rows.find(x => x.id === 309);
    assert.deepEqual([s309.pastPointsTenths, s309.pastDays, s309.nowPointsTenths, s309.nowDays], [1000, 3, 855, 2]);
    assert.equal(Math.round(1000 * (855 * 3 - 1000 * 2) / (1000 * 2)) / 10, 28.3);
    assert.deepEqual([String(s309.pastAvg), String(s309.nowAvg), String(s309.growth)], ['33.3', '42.8', '28.3']);
    const [s305, s306] = [305, 306].map(id => C.rows.find(x => x.id === id));
    assert.equal(s306.nowPointsTenths * s306.pastDays * s305.nowDays * s305.pastPointsTenths, s305.nowPointsTenths * s305.pastDays * s306.nowDays * s306.pastPointsTenths, 'تعادل تام');
    // ق6ب: الاستبعاد بالمجموع مع الحضور ← 403 خارج و404 مرشح.
    const D = rank('D');
    assert.deepEqual(D.candidates.map(x => pick(x, ['id', 'pastAvg', 'nowAvg', 'growth', 'nowDays'])), [{ id: 404, pastAvg: 40, nowAvg: 76, growth: 90, nowDays: 5 }], 'ق6ب');
    assert.deepEqual(reasons(D), { 401: top, 402: top, 403: top, 404: '' }, 'ق6ب الأسباب');
    assert.deepEqual(D.rows.map(x => [x.id, x.totalTenths, x.rank]), [[401, 5600, 1], [402, 5200, 2], [403, 4400, 3], [404, 4300, 4]], 'ق6ب المجموع بالحضور');
});

// ===== ر2: الدورات والنوافذ على الموسم الحقيقي =====
test('ر2 (الدورات والنوافذ): risingStarCycles = دورتان، وrisingStarCycleAt في التواريخ الثمانية', () => {
    const e = engine(['risingStarCycles', 'risingStarCycleAt']);
    const cycles = e.call('risingStarCycles', engineSettings());
    const fields = ['key', 'weeks', 'pastDates', 'nowDates', 'announce', 'approveUntil', 'displayUntil'];
    assert.deepEqual(cycles.map(c => pick(c, fields)), [
        { key: '2026-12-02', weeks: ['2026-11-15', '2026-11-29'], pastDates: [], nowDates: PAST, announce: '2026-12-08', approveUntil: '2026-12-07', displayUntil: '2026-12-19' },
        { key: '2026-12-16', weeks: ['2026-12-06', '2026-12-13'], pastDates: PAST, nowDates: NOW, announce: '2026-12-22', approveUntil: '2026-12-21', displayUntil: '2026-12-23' }]);
    const broken = engineSettings(); delete broken.season.calendar;
    assert.deepEqual(e.call('risingStarCycles', broken), [], 'تقويم ناقص ← لا دورات بلا رمي');
    const keyOf = x => x === null ? null : (x.key ?? x.cycle?.key);
    const stateOf = x => x === null ? null : Object.values(x).find(v => v === 'approve' || v === 'announced') ?? null;
    const at = (date, mode) => e.call('risingStarCycleAt', cycles, frozenUpTo(date), date, mode);
    const expected = {
        '2026-12-03': [null, null, null], '2026-12-08': [null, null, null], '2026-12-16': [null, null, null],
        '2026-12-17': ['2026-12-16', 'approve', null], '2026-12-21': ['2026-12-16', 'approve', null],
        '2026-12-22': ['2026-12-16', 'announced', '2026-12-16'], '2026-12-23': ['2026-12-16', 'announced', '2026-12-16'],
        '2026-12-24': [null, null, null] };
    for (const [date, want] of Object.entries(expected)) {
        const admin = at(date, 'admin'), tv = at(date, 'tv');
        assert.deepEqual([keyOf(admin), stateOf(admin), keyOf(tv)], want, date);
    }
});

// ===== ر3: المخزن saveRisingStar (programs-store.js في vm) + الدمج risingStarsStored =====
test('ر3 (المخزن): saveRisingStar يكتب ق9–ق11 بمفتاح risingStars وحده، ويرفض الثانية والناقص وغير المجمَّد؛ وrisingStarsStored يجمع النسختين', async () => {
    const server = cloud();
    const doc = 'programs/general/seasons/s1';
    server.docs.set(doc, { ...seasonOn('2026-12-21'), extra: { preserved: 7 } });
    const store = server.stores().almahraPrograms;
    assert.equal(typeof store.saveRisingStar, 'function', 'saveRisingStar غير موجود في programs-store.js');
    const before = copy(server.season());
    const recs = RECORDS('fake-admin');
    for (const hid of ['B', 'C', 'A']) { // ق9 ثم ق10 ثم ق11
        const n = server.state.writes.length;
        const result = await store.saveRisingStar('general', 's1', copy(recs[hid]));
        assert.equal(result.success, true, hid + ': ' + result.error);
        const writes = server.state.writes.slice(n);
        assert.equal(writes.length, 1, hid);
        assert.equal(writes[0].path, doc);
        assert.deepEqual(Object.keys(writes[0].patch), ['risingStars'], 'لا مفتاح غير risingStars');
        assert.deepEqual(writes[0].patch.risingStars['2026-12-16'][hid], { ...recs[hid], v: 1, approvedAt: { __serverTimestamp: true }, lockedAt: { __serverTimestamp: true } });
    }
    const after = server.season();
    assert.deepEqual(Object.keys(after.risingStars['2026-12-16']).sort(), ['A', 'B', 'C']);
    for (const hid of ['A', 'B', 'C']) {
        const { approvedAt, lockedAt, ...rest } = after.risingStars['2026-12-16'][hid];
        assert.deepEqual(rest, { ...recs[hid], v: 1 }); assert.ok(approvedAt.seconds && lockedAt.seconds, hid);
    }
    assert.deepEqual(after.weekKnightsLog, before.weekKnightsLog, 'weekKnightsLog كما كان');
    assert.deepEqual(after.frozenWeeks, before.frozenWeeks, 'frozenWeeks كما كان');
    assert.deepEqual(Object.values(after.weekKnightsLog).map(row => row.v), Object.values(before.weekKnightsLog).map(row => row.v));
    assert.deepEqual(after.extra, { preserved: 7 });
    // الرفض: لا كتابة.
    const reject = async (record, message) => {
        const n = server.state.writes.length;
        const result = await store.saveRisingStar('general', 's1', record);
        assert.equal(result.success, false, JSON.stringify(record.choice));
        if (message) assert.equal(result.error, message);
        assert.equal(server.state.writes.length, n, 'لا كتابة عند الرفض');
    };
    const D = { ...recordBase('D'), studentId: 404, studentName: 'ط404', candidates: [{ id: 404, name: 'ط404' }], approvedBy: 'fake-admin' };
    await reject({ ...copy(recs.B), reason: 'سبب آخر' }, 'اعتُمد نجم هذه الحلقة لهذه الدورة؛ لا يُغيَّر');
    await reject({ ...D, choice: 'other', source: 'teacher', reason: '' }, 'سبب المعلم إلزامي');
    await reject({ ...D, choice: 'other', source: 'teacher', reason: '   ' }, 'سبب المعلم إلزامي');
    await reject({ ...D, choice: 'none', studentId: null, studentName: '', source: 'teacher', reason: '' }, 'سبب المعلم إلزامي');
    await reject({ ...D, choice: 'candidate', studentId: null, studentName: '', source: 'auto', reason: '' });
    await reject({ ...D, choice: 'غيره', source: 'auto', reason: '' });
    await reject({ ...D, cycleEnd: '2026-12-23', weeks: ['2026-12-13', '2026-12-20'], choice: 'candidate', source: 'auto', reason: '' }, 'الدورة لم تُحسم بعد');
    assert.equal(server.season().risingStars['2026-12-16'].D, undefined);
    // risingStarsStored: اعتماد في remote وآخر في saved (weekKnightsState) ← الاثنان معاً.
    const h = tvContext([], '2026-12-21', { ...seasonOn('2026-12-21'), risingStars: { '2026-12-16': { A: locked(RECORDS().A) } } });
    h.install('risingStarsStored');
    h.ctx.saved = { risingStars: { '2026-12-16': { B: locked(RECORDS().B) } } };
    h.run("weekKnightsState.set('s1', saved)");
    const merged = copy(h.run('risingStarsStored()'));
    assert.deepEqual(Object.keys(merged['2026-12-16']).sort(), ['A', 'B']);
    assert.deepEqual(merged['2026-12-16'].A, locked(RECORDS().A));
    assert.deepEqual(merged['2026-12-16'].B, locked(RECORDS().B));
});

// ===== حاضنة اللقطة: الدوال الحقيقية بـ installTv، والساعة ثابتة على اليوم المطلوب =====
function tvContext(list, today, season) {
    const settings = generalSettings();
    const programs = { getCurrentProgramId: () => 'general', getCurrentSeasonId: () => 's1', getCurrentSeason: () => season,
        getSettings: () => settings, getCurrentProgram: () => ({ name: 'وهمي' }), isCurrentSeasonArchived: () => false,
        isFeatureEnabled: name => settings.features?.[name] !== false, PROGRAM_DEFS: { general: { defaultSettings: settings } } };
    class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [today + 'T09:00:00Z'])); } static now() { return +new Date(today + 'T09:00:00Z'); } }
    const state = { mostImproved: 0 };
    const ctx = vm.createContext({ console, Date: FixedDate, Intl, structuredClone, QuranMeasure,
        document: { getElementById: () => ({ style: {}, classList: { toggle() {} } }) },
        window: { almahraPrograms: programs, almahraAuth: { currentUser: { uid: 'fake-admin' } },
            almahraData: { isReady: () => true, getActiveProgramId: () => 'general', getActiveSeasonId: () => 's1' } },
        getCumulativeStats: () => ({ tripPoints: 0 }), summarizeRange: () => ({ points: 0, attended: 0 }),
        // الاقتراح الآلي القديم: اسم ظاهر يكشف إن وصل إلى اللقطة.
        getMostImproved: () => { state.mostImproved++; return [{ student: { name: 'اقتراح آلي' }, growth: 50 }]; },
        getActiveCriteria: () => [], showToast() {}, setInterval() {}, clearInterval() {} });
    const run = code => vm.runInContext(code, ctx);
    const install = (...names) => names.forEach(name => run(source(name)));
    ctx.fixtures = list;
    run(`let students = fixtures, todayStr = '${today}', honorKnightsLog = []; const ALL_DAY_NAMES = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];`);
    for (const name of ['ivPairs', 'measureEntry']) run(html.match(new RegExp('const ' + name + ' = .*;'))[0]);
    install('isGeneralProgram', 'getProgramSettings', 'getTiers', 'tiersFeatureOn', 'isWorkingDay', 'schoolCivilDate', 'isSeasonCalendarComplete',
        'getSchoolDayInfo', 'getGeneralSchoolDates', 'formatDateLocal', 'getWeekStartDate', 'addDaysToDateStr',
        'getBoardDate', 'getBoardWeekRange', 'getWorkingDatesInRange', 'roundPointTotal', 'knightsSchoolDates');
    installTv(run, install);
    // بعد البناء تثبّتها tv-harness؛ قبله تُثبَّت هنا إن وُجدت.
    for (const name of ['risingStarCycles', 'risingStarCycleAt', 'rankHalaqaRisingStars', 'risingStarsStored', 'getApprovedRisingStars'])
        if (!run(`typeof ${name} === 'function'`)) { try { install(name); } catch {} }
    return { run, ctx, state, install, snapshot: () => copy(run('getGeneralTvSnapshot()')) };
}

// ===== ر4: اللقطة (ق7، ق8) =====
test('ر4 (اللقطة): ق7 وق8 — stage.risingStars من المعتمَد المقفل وحده في نافذة الثلاثاء، ولا اقتراح آلي أبداً', () => {
    const recs = RECORDS();
    const approved = { '2026-12-16': { A: locked(recs.A), B: locked(recs.B), C: locked(recs.C) } };
    const asrTwo = [{ stage: 'أ', name: 'ط104' }, { stage: 'ب', name: 'ط203' }];
    const expected = {
        '2026-12-03': [[], []], '2026-12-08': [[], []], // ق7: الدورة الأولى بلا سابقة.
        '2026-12-17': [[], []], '2026-12-21': [[], []], // ق8: قبل الثلاثاء.
        '2026-12-22': [asrTwo, []], '2026-12-23': [asrTwo, []], // ق8: ج «لا نجم» لا تظهر.
        '2026-12-24': [[], []] };
    for (const [date, [asr, maghrib]] of Object.entries(expected)) {
        const h = tvContext([], date, seasonOn(date, date >= '2026-12-17' ? { risingStars: copy(approved) } : {}));
        const snap = h.snapshot();
        const byPeriod = Object.fromEntries(snap.stages.map(s => [s.period, s.risingStars]));
        assert.deepEqual(byPeriod, { asr, maghrib }, date);
        assert.equal(h.state.mostImproved, 0, date + ': اللقطة لا تستدعي getMostImproved');
    }
});

// ===== ر5: الرسم في متصفح حقيقي (بنمط tests/tv-design-local.test.cjs:52-63) =====
let browser;
before(async () => {
    const playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); });
async function openTv() {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
    const page = await context.newPage(), external = [], errors = [];
    page.on('pageerror', e => { errors[errors.length] = e.message; });
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== 'http://tv.test') { external[external.length] = url.href; return route.abort('internetdisconnected'); }
        const file = path.resolve(root, decodeURIComponent(url.pathname.slice(1)));
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
        await route.fulfill({ path: file });
    });
    await page.clock.install({ time: new Date('2026-11-01T12:00:00Z') });
    await page.goto('http://tv.test/tv.html');
    await page.evaluate(() => document.fonts.ready);
    await page.clock.pauseAt(new Date('2026-11-01T12:00:01Z'));
    const post = message => page.evaluate(message => {
        window.tvTestSender ||= new BroadcastChannel('almahra-tv'); window.tvTestSender.postMessage(message);
    }, message);
    return { page, external, errors,
        async snapshot(message) { await post(message); await page.waitForFunction(() => document.querySelector('.slide')); await page.clock.runFor(850); },
        close: () => context.close() };
}
async function safe(page, selectors) {
    const bounds = await page.locator(selectors).evaluateAll(nodes => nodes.filter(n => n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden').map(n => {
        const b = n.getBoundingClientRect(); return { text: n.textContent, x: b.x, y: b.y, right: b.right, bottom: b.bottom };
    }));
    assert.ok(bounds.length);
    for (const b of bounds) assert.ok(b.x >= 95.5 && b.y >= 53.5 && b.right <= 1824.5 && b.bottom <= 1026.5, JSON.stringify(b));
}
const RISING = 'النجم الصاعد';
const tvMessage = (risingStars, boardDate = '2026-12-22') => ({ type: 'snapshot', boardDate, stages: [{ period: 'asr', name: 'ابتدائي',
    board: [{ name: 'سعد فهد ناصر', points: 196, week: 42, rank: 1 }], dayKnights: [], risingStars }] });
const slideOf = (page, title) => page.locator('.slide').filter({ has: page.locator('h2', { hasText: title }) });

test('ر5 (الرسم): بطاقة النجم .stage «أ» فوق .kname «ط104»، بلا .muted، داخل المنطقة الآمنة؛ واللقطة القديمة بلا .stage وبلا خطأ', async () => {
    const h = await openTv();
    try {
        await h.snapshot(tvMessage([{ stage: 'أ', name: 'ط104' }]));
        const slide = slideOf(h.page, RISING);
        assert.equal(await slide.count(), 1, 'شريحة النجم موجودة');
        assert.deepEqual(await slide.locator('.stage').allTextContents(), ['أ'], 'اسم الحلقة .stage');
        assert.deepEqual(await slide.locator('.kname').allTextContents(), ['ط104']);
        assert.equal(await slide.locator('.muted').count(), 0);
        let shown = false;
        for (let i = 0; i < 8 && !shown; i++) {
            if ((await h.page.locator('.slide.active h2').innerText()).includes(RISING)) shown = true;
            else await h.page.clock.runFor(15000);
        }
        assert.ok(shown, 'الشريحة تُعرض');
        await safe(h.page, '.slide.active .slide-title, .slide.active .card, .slide.active h3, .slide.active p');
        assert.ok(await h.page.locator('.slide.active .card').evaluateAll(cards => cards.every(card => card.scrollHeight <= card.clientHeight + 1)), 'لا قصّ');
        await h.snapshot(tvMessage([{ name: 'ط104' }], '2026-12-23'));
        await h.page.waitForFunction(() => [...document.querySelectorAll('.slide')].some(s => s.textContent.includes('ط104')));
        const old = slideOf(h.page, RISING);
        assert.equal(await old.locator('.stage').count(), 0, 'لقطة قديمة بلا stage');
        assert.deepEqual(await old.locator('.kname').allTextContents(), ['ط104']);
        assert.deepEqual(h.errors, []); assert.deepEqual(h.external, []);
    } finally { await h.close(); }
});

// Tailwind من الشبكة غير متاح بلا اتصال؛ القواعد نفسها في tests/helpers/t25-browser.cjs.
const utilityCss = `*,::before,::after{box-sizing:border-box;border-width:0;border-style:solid}body{margin:0}
button,input,select{font:inherit}button{cursor:pointer;background:transparent}h1,h2,h3,h4,p{margin:0}
img{display:block;max-width:100%}.flex{display:flex}.flex-col{flex-direction:column}.flex-wrap{flex-wrap:wrap}
.items-center{align-items:center}.justify-center{justify-content:center}.justify-between{justify-content:space-between}
.flex-grow{flex-grow:1}.gap-5{gap:1.25rem}.w-full{width:100%}.mx-auto{margin-inline:auto}.p-4{padding:1rem}
.fixed{position:fixed}.inset-0{inset:0}.hidden{display:none}.no-print{print-color-adjust:exact}
.bottom-0{bottom:0}.left-0{left:0}.right-0{right:0}.flex-1{flex:1 1 0%}.z-50{z-index:50}
[class~="z-[2000]"]{z-index:2000}`;
// ===== حاضنة التطبيق: index.html كما هو في متصفح حقيقي، والمخازن وهمية بموسم الجدول §3 =====
async function openApp(today, extraSeason = {}) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const errors = [], dialogs = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => { dialogs.push(dialog.message()); dialog.accept(); });
    const config = { today, defs, settings: generalSettings(), season: { ...seasonOn(today, extraSeason), id: 's-general' }, list: STUDENTS() };
    // مفاتيح السطور بمعرّف موسم التطبيق.
    config.season.weekKnightsLog = Object.fromEntries(Object.values(config.season.weekKnightsLog).map(row => ['s-general|' + row.weekStart + '|' + row.halaqaId, { ...row, key: 's-general|' + row.weekStart + '|' + row.halaqaId }]));
    await page.addInitScript(config => {
        const { today, defs } = config;
        const NativeDate = Date;
        window.Date = class extends NativeDate {
            constructor(...args) { super(...(args.length ? args : [today + 'T09:00:00Z'])); }
            static now() { return new NativeDate(today + 'T09:00:00Z').getTime(); }
        };
        window.tailwind = {};
        window.confetti = { create: () => () => {} };
        const programs = Object.fromEntries(Object.entries(defs).map(([id, def]) => [id, { id, name: def.name,
            activeSeasonId: 's-' + id, settings: id === 'general' ? config.settings : def.defaultSettings }]));
        const seasons = Object.fromEntries(Object.keys(defs).map(id => [id, id === 'general' ? config.season
            : { ...structuredClone(config.season), id: 's-' + id, weekKnightsLog: {}, frozenWeeks: {} }]));
        const state = window.__fixture = { ready: false, current: null, list: config.list, programs, seasons, saved: [], frozenSaves: 0 };
        const listeners = [], studentListeners = [];
        state.emit = () => studentListeners.forEach(fn => fn(state.list));
        window.almahraAuth = { currentUser: { uid: 'synthetic-admin' }, isAdmin: () => true };
        window.almahraPrograms = {
            setWriteGuard() {},
            getSeasonFromServer: async () => structuredClone(seasons[state.current]),
            getStudentsFromServer: async () => structuredClone(state.list),
            getSettingsFromServer: async () => structuredClone(programs[state.current].settings),
            saveWeekKnightsRows: async (programId, seasonId, rows, meta) => {
                state.frozenSaves++;
                const season = seasons[programId];
                for (const row of rows) season.weekKnightsLog[seasonId + '|' + meta.weekStart + '|' + row.halaqaId] = { ...row, key: seasonId + '|' + meta.weekStart + '|' + row.halaqaId, v: 1, frozenAt: { seconds: 1, nanoseconds: 0 }, frozenAtDevice: 1000 };
                season.frozenWeeks = { ...season.frozenWeeks, [meta.weekStart]: { seconds: 1, nanoseconds: 0 } };
                return { success: true, season: structuredClone(season), rows: Object.values(season.weekKnightsLog) };
            },
            // المخزن الحقيقي يُختبر في ر3؛ هنا يُسجَّل السجل المرسل كما هو ويُقفل.
            saveRisingStar: async (programId, seasonId, record) => {
                state.saved.push(structuredClone(record));
                const season = seasons[programId];
                season.risingStars = { ...season.risingStars, [record.cycleEnd]: { ...season.risingStars?.[record.cycleEnd],
                    [record.halaqaId]: { ...structuredClone(record), v: 1, approvedAt: { seconds: 1, nanoseconds: 0 }, lockedAt: { seconds: 1, nanoseconds: 0 } } } };
                return { success: true, season: structuredClone(season), rows: Object.values(season.weekKnightsLog) };
            },
            PROGRAM_DEFS: defs, getInitializationErrors: () => [], isReady: () => state.ready,
            getSavedProgramId: () => 'general', getCurrentProgramId: () => state.current,
            getPrograms: () => programs, getCurrentProgram: () => programs[state.current] || null,
            getSettings: () => programs[state.current]?.settings || {},
            isFeatureEnabled: key => programs[state.current]?.settings?.features?.[key] !== false,
            getSeasons: id => [seasons[id]], getCurrentSeason: () => seasons[state.current] || null,
            getCurrentSeasonId: () => seasons[state.current]?.id || null,
            isCurrentSeasonArchived: () => false, subscribe: fn => listeners.push(fn),
            getKnightsLog: () => [], getDefaultSettings: id => defs[id].defaultSettings,
            openProgram(id) { state.current = id; window.dispatchEvent(new Event('almahra-program-changed')); state.emit(); listeners.forEach(fn => fn()); return true; }
        };
        window.almahraData = {
            setWriteGuard() {}, subscribeStudents: fn => studentListeners.push(fn), isReady: () => true, isReadOnly: () => false, lastError: () => null,
            getActiveProgramId: () => state.current, getActiveSeasonId: () => seasons[state.current]?.id,
            async patchStudent() { throw new Error('لا كتابة طلاب في هذا الاختبار'); }
        };
        window.addEventListener('DOMContentLoaded', () => {
            document.body.classList.remove('auth-not-ready');
            window.dispatchEvent(new Event('almahra-auth-ready'));
        });
    }, config);
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname !== 'almahra.test') return route.fulfill({ contentType: url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript', body: '' });
        const file = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
        if (['auth.js', 'programs-store.js', 'data-store.js'].includes(file)) return route.fulfill({ contentType: 'text/javascript', body: '' });
        if (file === 'index.html') return route.fulfill({ contentType: 'text/html', body: html.replace('</head>', `<style>${utilityCss}</style></head>`) });
        const absolute = path.resolve(root, file);
        if (!absolute.startsWith(root + path.sep) || !fs.existsSync(absolute)) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ path: absolute });
    });
    await page.goto('http://almahra.test/', { waitUntil: 'load' });
    await page.evaluate(() => window.__fixture.start ? window.__fixture.start() : (window.__fixture.ready = true));
    await page.waitForFunction(() => window.__fixture.current !== null && !document.body.classList.contains('event-not-selected'));
    await page.locator('#loadingOverlay').waitFor({ state: 'hidden' });
    const rising = async () => { await page.evaluate(async () => { await renderGeneralKnightsRising(); }); };
    const text = async selector => norm(await page.locator(selector).first().evaluate(n => n.textContent));
    const section = hid => page.locator(`#gkRising section[data-halaqa="${hid}"]`);
    return { page, errors, dialogs, rising, text, section, fixture: () => page.evaluate(() => structuredClone({ saved: window.__fixture.saved, frozenSaves: window.__fixture.frozenSaves })),
        close: () => context.close() };
}
const waitText = (page, selector, wanted) => page.waitForFunction(([selector, wanted]) =>
    (document.querySelector(selector)?.textContent || '').replace(/\s+/g, ' ').includes(wanted), [selector, wanted]);
const CYCLE_LINE = 'الدورة: الأحد 6 / 12 ← الأربعاء 16 / 12 · الاعتماد حتى الاثنين 21 / 12 · الإعلان الثلاثاء 22 / 12';
const NO_CYCLE = 'لا دورة للنجم الصاعد الآن.';

// ===== ر6: الواجهة (ق7، ق7ب، ق9–ق12) =====
test('ر6 (الواجهة): «لا دورة» في 3 و8 و16 ديسمبر؛ الاعتماد في 21 ديسمبر (طالب آخر، لا نجم، مرشح) والقفل بعده؛ حال الثلاثاء', async () => {
    // كما يراه المشرف: التنقل الحقيقي إلى الإعدادات ← الفرسان، فالصندوق ظاهر لـgetByRole.
    const openKnightsPanel = page => page.evaluate(() => { switchTab('page-settings', document.querySelector('nav [onclick*="page-settings"]')); openSettingsSection('setPanelGeneralKnights'); });
    // ق7 وق7ب: لا دورة.
    for (const date of ['2026-12-03', '2026-12-08', '2026-12-16']) {
        const h = await openApp(date);
        try {
            await openKnightsPanel(h.page);
            await h.rising();
            const box = await h.text('#gkRising');
            // العنوان «النجم الصاعد» ثم «لا دورة…» ولا شيء غيرهما.
            assert.equal(norm(box.replace(NO_CYCLE, '').replace('النجم الصاعد', '')), '', date + ': الصندوق = ' + box);
            assert.ok(box.includes(NO_CYCLE) && box.startsWith('النجم الصاعد'), date + ': ' + box);
            assert.equal(await h.page.locator('#gkRisingPrint').count(), 0, date);
            assert.equal(await h.page.locator('#gkRising section[data-halaqa], #gkRising input[type=radio]').count(), 0, date);
            assert.equal((await h.fixture()).saved.length, 0);
            assert.deepEqual(h.errors, [], date);
        } finally { await h.close(); }
    }
    // ق9–ق11: 21 ديسمبر، نافذة الاعتماد.
    const h = await openApp('2026-12-21');
    try {
        await openKnightsPanel(h.page);
        await h.rising();
        const box = await h.text('#gkRising');
        assert.ok(box.startsWith('النجم الصاعد') && !box.includes('هذا الأسبوع'), box);
        assert.match(box, rx(CYCLE_LINE));
        assert.equal(await h.page.locator('#gkRisingPrint').isEnabled(), true, 'الطباعة مفعَّلة في الاعتماد');
        assert.match(await h.text('#gkRisingPrint'), /طباعة أوراق المرشحين/);
        assert.deepEqual(await h.page.locator('#gkRising section[data-halaqa]').evaluateAll(ns => ns.map(n => n.dataset.halaqa)), ['A', 'B', 'C', 'D']);
        assert.ok((await h.text('#gkRising section[data-halaqa="A"]')).startsWith('أ — سعد'));
        // سطور المرشحين.
        assert.ok((await h.text('#gkRising section[data-halaqa="A"]')).includes('ط104 (رقم 104): كان 20 ← صار 32، +60٪'));
        assert.ok((await h.text('#gkRising section[data-halaqa="A"]')).includes('ط105 (رقم 105): كان 25 ← صار 30، +20٪'));
        assert.ok((await h.text('#gkRising section[data-halaqa="C"]')).includes('ط309 (رقم 309): كان 33.3 ← صار 42.8، +28.3٪'));
        assert.ok((await h.text('#gkRising section[data-halaqa="B"]')).includes('لا مرشحين من البرنامج'));
        const approve = hid => h.section(hid).getByRole('button', { name: 'اعتماد', exact: true });
        const reasonBox = hid => h.section(hid).getByLabel('السبب (من ورقة المعلم)').or(h.section(hid).getByPlaceholder('السبب (من ورقة المعلم)'));
        // ق9: الحلقة ب «طالب آخر» 203.
        assert.equal(await approve('B').isEnabled(), false, 'لا اختيار ← معطَّل');
        await h.section('B').getByRole('radio', { name: 'طالب آخر من الحلقة' }).check();
        const options = (await h.section('B').locator('select option').allTextContents()).map(norm).filter(t => /^\d+ — /.test(t));
        assert.deepEqual(options, ['201 — ط201', '202 — ط202', '203 — ط203', '204 — ط204']);
        await h.section('B').locator('select').selectOption({ label: '203 — ط203' });
        assert.equal(await approve('B').isEnabled(), false, 'بلا سبب ← معطَّل');
        await reasonBox('B').fill(REASON_B);
        assert.equal(await approve('B').isEnabled(), true, 'بسبب ← مفعَّل');
        await approve('B').click();
        await h.page.waitForFunction(() => window.__fixture.saved.length === 1);
        await waitText(h.page, '#gkRising section[data-halaqa="B"]', '✅ المعتمَد: ط203 (اختيار المعلم) — السبب: ' + REASON_B);
        // ق10: الحلقة ج «لا نجم».
        await h.section('C').getByRole('radio', { name: 'لا نجم هذه الدورة' }).check();
        assert.equal(await approve('C').isEnabled(), false);
        await reasonBox('C').fill(REASON_C);
        assert.equal(await approve('C').isEnabled(), true);
        await approve('C').click();
        await h.page.waitForFunction(() => window.__fixture.saved.length === 2);
        await waitText(h.page, '#gkRising section[data-halaqa="C"]', '✅ لا نجم هذه الدورة — السبب: ' + REASON_C);
        // ق11: الحلقة أ مرشح 104 بلا سبب.
        await h.section('A').getByRole('radio', { name: 'ط104 (رقم 104)' }).check();
        assert.equal(await approve('A').isEnabled(), true, 'مرشح بلا سبب ← مفعَّل');
        await approve('A').click();
        await h.page.waitForFunction(() => window.__fixture.saved.length === 3);
        await waitText(h.page, '#gkRising section[data-halaqa="A"]', '✅ المعتمَد: ط104 (من المرشحين)');
        assert.deepEqual(h.dialogs, ['اعتماد «ط203» نجماً صاعداً لحلقة ب؟ لا يُغيَّر بعد الاعتماد.',
            'اعتماد «لا نجم هذه الدورة» لحلقة ج؟ لا يُغيَّر بعد الاعتماد.', 'اعتماد «ط104» نجماً صاعداً لحلقة أ؟ لا يُغيَّر بعد الاعتماد.']);
        const { saved, frozenSaves } = await h.fixture();
        const strip = ({ v, approvedAt, lockedAt, ...rest }) => rest;
        const recs = RECORDS();
        assert.deepEqual(saved.map(strip), [recs.B, recs.C, recs.A], 'السجل المرسل إلى المخزن بالضبط');
        assert.equal(frozenSaves, 0, 'لا كتابة غير الاعتماد');
        // القفل: لا خيارات ولا زر في المعتمَد؛ والحلقة د باقية.
        for (const hid of ['A', 'B', 'C']) {
            assert.equal(await h.section(hid).locator('input[type=radio]').count(), 0, hid + ' بلا خيارات');
            assert.equal(await approve(hid).count(), 0, hid + ' بلا زر');
        }
        assert.equal(await approve('D').count(), 1);
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
    // ق12: الثلاثاء 22 ديسمبر — أ معتمَدة، والباقي بلا اعتماد.
    const t = await openApp('2026-12-22', { risingStars: { '2026-12-16': { A: locked(RECORDS().A) } } });
    try {
        await openKnightsPanel(t.page);
        await t.rising();
        assert.match(await t.text('#gkRising'), rx(CYCLE_LINE));
        assert.equal(await t.page.locator('#gkRising input[type=radio]').count(), 0, 'لا راديو');
        assert.equal(await t.page.locator('#gkRising').getByRole('button', { name: 'اعتماد', exact: true }).count(), 0, 'لا «اعتماد»');
        assert.equal(await t.page.locator('#gkRisingPrint').isDisabled(), true, 'الطباعة معطَّلة');
        assert.ok((await t.text('#gkRising section[data-halaqa="A"]')).includes('✅ المعتمَد: ط104 (من المرشحين)'));
        for (const hid of ['B', 'C', 'D']) assert.ok((await t.text(`#gkRising section[data-halaqa="${hid}"]`)).includes('لم يُعتمد نجم لهذه الحلقة.'), hid);
        assert.equal((await t.fixture()).saved.length, 0);
        assert.deepEqual(t.errors, []);
    } finally { await t.close(); }
    assert.ok(!/<section id="gkRising"[^>]*>\s*<h3[^>]*>النجم الصاعد هذا الأسبوع</.test(html), 'العنوان الثابت «النجم الصاعد» بلا «هذا الأسبوع» (:1593)');
});

// ===== ر7: الورقة (ق1، ق1ب، ق2) عبر printRisingStarSheets ← buildRisingStarSheetHtml =====
test('ر7 (الورقة): صفحة لكل حلقة؛ الحلقة أ بعمودين (104، 105) بكل نصوص §2ج، والحلقة ب «لا مرشحين»؛ بلا آيات ولا جدول أيام', async () => {
    const h = await openApp('2026-12-18');
    try {
        assert.equal(await h.page.evaluate(() => typeof buildRisingStarSheetHtml), 'function', 'buildRisingStarSheetHtml غائبة');
        assert.equal(await h.page.locator('#risingStarPrintArea').count(), 1, 'منطقة الطباعة');
        const printed = await h.page.evaluate(async () => {
            let captured = null;
            window.print = () => {
                const area = document.getElementById('risingStarPrintArea');
                captured = { bodyClass: document.body.classList.contains('printing-rising-star-sheets'),
                    style: [...document.querySelectorAll('style')].map(s => s.textContent).join('\n'),
                    sheets: [...area.children].filter(n => n.tagName !== 'STYLE').map(n => n.textContent.replace(/\s+/g, ' ').trim()),
                    html: area.innerHTML };
            };
            await printRisingStarSheets();
            return captured;
        });
        assert.ok(printed, 'window.print استُدعي');
        assert.equal(printed.bodyClass, true);
        assert.match(printed.style, /size:\s*A4 landscape/);
        assert.match(printed.style, /break-after:\s*page/);
        assert.equal(printed.sheets.length, 4, 'صفحة لكل حلقة (أسطر W2 الأربعة)');
        const [A, B] = ['أ', 'ب'].map(name => printed.sheets.find(s => s.includes('الحلقة: ' + name)));
        assert.deepEqual(printed.sheets.map(s => ['أ', 'ب', 'ج', 'د'].find(n => s.includes('الحلقة: ' + n))), ['أ', 'ب', 'ج', 'د'], 'بترتيب halaqaOrder');
        for (const sheet of [A, B]) {
            assert.ok(sheet.includes('ورقة مرشحي النجم الصاعد · البرنامج العام'), sheet);
            assert.ok(sheet.includes('جمعية أفضلكم · موسم 2026 · لا تخرج الورقة من المسجد'));
            assert.ok(sheet.includes('الأسبوعان: الأحد 6 / 12 ← الأربعاء 16 / 12'));
            assert.match(sheet, rx('تُعاد الورقة: الاثنين 21 / 12'));
            assert.match(sheet, /☐ ?طالب آخر من عندي: الاسم ?_+ ?السبب ?_+/);
            assert.match(sheet, /☐ ?لا نجم هذه الدورة، السبب ?_+/);
            assert.match(sheet, /توقيع المعلم: ?\.+ *التاريخ: ?\.+/);
            assert.ok(!/آية|الآيات/.test(sheet), 'بلا آيات');
            for (const d of ['7 / 12', '8 / 12', '9 / 12', '13 / 12', '14 / 12', '15 / 12']) assert.ok(!sheet.includes(d), 'بلا جدول أيام: ' + d);
        }
        assert.ok(A.includes('المعلم: الأستاذ سعد'));
        assert.ok(B.includes('المعلم: الأستاذ سعيد'), 'اسم يبدأ بـ«الأستاذ » يُطبع كما هو');
        for (const sheet of printed.sheets) assert.ok(!sheet.includes('الأستاذ الأستاذ'), 'بلا «الأستاذ» مكرر: ' + sheet);
        // رأس الورقة ليس وسم header: قاعدة الطباعة العامة تخفي كل header بـ!important.
        assert.ok(!/<header/i.test(printed.html), 'الورقة المبنية بلا وسم <header');
        assert.ok(printed.html.includes('ورقة مرشحي النجم الصاعد') && printed.html.includes('لا تخرج الورقة من المسجد'), 'رأس الورقة في الورقة المبنية');
        // ق1 وق1ب: عمودان بالترتيب، 104 ثم 105.
        assert.deepEqual([...A.matchAll(/رقم (\d+)/g)].map(m => m[1]), ['104', '105'], 'عمودان');
        const i104 = A.indexOf('رقم 104'), i105 = A.indexOf('رقم 105'), iChoice = A.indexOf('☐');
        assert.ok(i104 < i105 && i105 < iChoice);
        const col104 = A.slice(A.lastIndexOf('ط104', i104), i105), col105 = A.slice(A.lastIndexOf('ط105', i105), iChoice);
        for (const part of ['كان: 20 نقطة في اليوم', 'صار: 32 نقطة في اليوم', 'التحسّن: +60٪', 'الحضور: 4 من 8', 'أيام التحضير المنزلي: 2', 'أيام فارس اليوم: 1', 'المخالفات: لا شيء'])
            assert.ok(col104.includes(part), '104: ' + part + ' | ' + col104);
        for (const part of ['كان: 25 نقطة في اليوم', 'صار: 30 نقطة في اليوم', 'التحسّن: +20٪', 'الحضور: 6 من 8', 'أيام التحضير المنزلي: 0', 'أيام فارس اليوم: 0', 'المخالفات: تأخر بغير عذر 1'])
            assert.ok(col105.includes(part), '105: ' + part + ' | ' + col105);
        assert.ok(A.includes('☐ ط104') && A.includes('☐ ط105'));
        assert.ok(!A.includes('لا مرشحين من البرنامج لهذه الدورة'));
        // ق2: الحلقة ب بلا مرشح.
        assert.ok(B.includes('لا مرشحين من البرنامج لهذه الدورة'));
        assert.deepEqual([...B.matchAll(/رقم (\d+)/g)], [], 'بلا أعمدة');
        assert.equal((await h.fixture()).saved.length, 0, 'الطباعة لا تكتب');
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

// ===== ر8: نص «!» =====
test('ر8 (نص «!»): القسم 5 = نص §2و حرفياً، والأقسام 1–4 = نصها في bf6a5e7', () => {
    const hp = require('./rules/homeprep-answer-key.json');
    const render = fn => { const h = quick(); h.state.settings = copy(hp.settings); h.run(fn); return h.run('renderGeneralKnightsGuide(getProgramSettings())'); };
    const now = render(source('renderGeneralKnightsGuide')), old = render(source('renderGeneralKnightsGuide', atBase('index.html')));
    const h3 = text => '<h3 class="font-black text-lg text-slate-800">' + text + '</h3>';
    const marker = '<section>' + h3('5. النجم الصاعد ⭐');
    const section5 = marker + '<p>لمن تحسّن في حلقته أكثر من غيره، مرة كل أسبوعين.</p><ul class="list-disc pr-6">'
        + '<li><b>كيف؟</b> نقارن متوسط نقاطك اليومية في آخر أسبوعين دراسيين بمتوسطك فيما سبق من الفصل. النقاط هنا للتسميع والانضباط، بلا نقاط الحضور.</li>'
        + '<li><b>لمن؟</b> لغير الثلاثة الأوائل في حلقتك بمجموع نقاط الأسبوعين، بشرط أن تحضر يومين على الأقل، وألا تُسجَّل عليك مخالفة أدب فيهما.</li>'
        + '<li><b>من يختار؟</b> البرنامج يرشّح حتى 3 من كل حلقة، ومعلمك يختار واحداً منهم أو من يراه، والمشرف يعتمد.</li>'
        + '<li><b>متى؟</b> يُعلن يوم الثلاثاء، ويبقى على التلفاز أسبوعين.</li></ul></section></div>';
    assert.ok(now.includes(marker) && old.includes(marker));
    assert.equal(now.slice(now.indexOf(marker)), section5, 'القسم 5');
    assert.equal(now.slice(0, now.indexOf(marker)), old.slice(0, old.indexOf(marker)), 'الأقسام 1–4');
});

// ===== ر9: لوحة الشرف (ق13) — حاضنة board بنمط tests/step8c-tv-local.test.cjs:14-52 =====
function board(list = [], text = html) {
    const state = { program: 'general', seasonId: 's1', ready: true, sent: [], timers: [], settings: {
        points: { attendance: 0 }, stages: [{ id: 'a', name: 'مرحلة أولى', period: 'asr' }, { id: 'b', name: 'مرحلة ثانية', period: 'maghrib' }],
        halaqas: [{ id: 'ha', stageId: 'a', active: true }, { id: 'hb', stageId: 'b', active: true }],
        grades: [], kindMult: {}, absence: [], criteria: [], workingDays: [0, 1, 2, 3, 4], features: { tiers: false } },
        season: { termStart: '2026-10-01', termEnd: '2026-12-31', calendar: [] },
        daily: {}, weekly: {}, approved: [], cards: {}, mostImproved: [] };
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, { value: '', innerHTML: '', textContent: '', style: {}, classList: { toggle(name, on) { this[name] = on; } } });
        return elements.get(id);
    };
    const programs = { getCurrentProgramId: () => state.program, getCurrentSeasonId: () => state.seasonId,
        getCurrentSeason: () => state.season, getSettings: () => state.settings, getCurrentProgram: () => ({ name: 'وهمي' }),
        isFeatureEnabled: name => state.settings.features?.[name] !== false,
        PROGRAM_DEFS: { general: { defaultSettings: state.settings } } };
    const ctx = vm.createContext({ console, Date, Intl, structuredClone, document: { getElementById: element },
        window: { almahraPrograms: programs, almahraAuth: { currentUser: { uid: 'fake-admin' } },
            almahraData: { isReady: () => state.ready, getActiveProgramId: () => state.program, getActiveSeasonId: () => state.seasonId } },
        getCumulativeStats: s => ({ tripPoints: s.points || 0 }),
        summarizeRange: (s, dates) => dates.at(-1) >= '2026-11-01' ? s.now || { points: 0, attended: 0 } : s.past || { points: 0, attended: 0 },
        getDayTitleCandidates: (date, stage) => state.daily[stage ?? 'all'] || [],
        getWeekTitleCandidates: stage => state.weekly[stage ?? 'all'] || [],
        getActiveCriteria: () => [], getDisciplineStars: () => ({ stars: [], daysCount: 0 }), generalIncompleteAttendanceHtml: () => '',
        hbSetCard: (id, data) => { state.cards[id] = data; }, hbCount: n => String(n), hbN: n => String(n),
        hbWinnerRow: name => name, hbTier: name => name, hbDuo: () => '', buildAchievementText: () => '',
        setInterval: (fn, ms) => { state.timers.push({ fn, ms }); return state.timers.length; }, clearInterval() {},
        showToast: msg => { state.toast = msg; }, recordMostImproved: args => state.mostImproved.push(args) });
    const run = code => vm.runInContext(code, ctx);
    const install = (...names) => names.forEach(name => run(source(name, text)));
    list.forEach(s => { s.halaqaId ??= 'ha'; });
    ctx.fixtures = list; ctx.approved = state.approved;
    run("let students = fixtures, todayStr = '2026-11-05', honorKnightsLog = approved; const ALL_DAY_NAMES = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];");
    install('isGeneralProgram', 'getProgramSettings', 'getTiers', 'tiersFeatureOn', 'isWorkingDay', 'schoolCivilDate',
        'isSeasonCalendarComplete', 'getSchoolDayInfo', 'getGeneralSchoolDates', 'formatDateLocal', 'getWeekStartDate', 'addDaysToDateStr',
        'getBoardDate', 'getBoardWeekRange', 'getWorkingDatesInRange', 'topTied', 'getStudentRank', 'getMostImproved',
        'getSeasonLeaders', 'getApprovedKnightsForMode', 'getKnightWinCounts', 'getTitleRules', 'hbEmpty', 'renderHonorBoard', 'roundPointTotal');
    if (text === html) installTv(run, install);
    // عدّاد على getMostImproved الحقيقية.
    run('const realMostImproved = getMostImproved; getMostImproved = (...args) => { recordMostImproved(args); return realMostImproved(...args); };');
    return { state, ctx, run, element };
}
test('ر9 (لوحة الشرف): ق13 — general لا تستدعي getMostImproved والبطاقة فارغة بعنوان «النجم الصاعد»؛ summer مطابق لـbf6a5e7', () => {
    const list = () => Array.from({ length: 15 }, (_, id) => ({ id, name: `طالب وهمي ${id}`, points: 100 - id,
        history: { '2026-11-01': { attended: true }, '2026-10-25': { attended: true } },
        now: { points: 100 - id, attended: 1 }, past: { points: 1, attended: 1 } }));
    const g = board(list());
    g.run('renderHonorBoard()');
    assert.deepEqual(copy(g.state.mostImproved), [], 'renderHonorBoard في general تستدعي getMostImproved');
    assert.equal(g.state.cards.hbCardProgress.title, 'النجم الصاعد');
    assert.equal(g.state.cards.hbCardProgress.tease, 'لا متقدّمين هذا الأسبوع');
    assert.match(g.element('hbProgress').innerHTML, /لا متقدّمين هذا الأسبوع/);
    const base = atBase('index.html');
    const a = board(list()), b = board(list(), base);
    a.state.program = b.state.program = 'summer';
    a.run('renderHonorBoard()'); b.run('renderHonorBoard()');
    assert.deepEqual(copy(a.state.mostImproved), [[5]]); assert.deepEqual(copy(b.state.mostImproved), [[5]]);
    assert.equal(a.element('hbProgress').innerHTML, b.element('hbProgress').innerHTML);
    assert.deepEqual(copy(a.state.cards), copy(b.state.cards));
    assert.equal(a.state.cards.hbCardProgress.title, 'الأكثر تقدّماً');
});

// ===== ر10: الثبات — دوال §1ب بنصها في bf6a5e7 (أخضر قبل البناء وبعده) =====
test('ر10 (ثبات): المحرك والفرسان والتجميد والطباعة الأسبوعية والمخزن والتلفاز كما هي في bf6a5e7', () => {
    const baseHtml = atBase('index.html'), nowHtml = lf(html);
    for (const name of ['getMostImproved', 'dayStats', 'knightsDayPointsTenths', 'knightsAttendanceState', 'knightsSchoolDates', 'knightsIdentityOrder',
        'dayHasBlockingViolation', 'summarizeRange', 'getCumulativeStats', 'getDayHalaqaKnights', 'getWeekNominations', 'rankHalaqaWeekKnights',
        'buildWeekKnightsRow', 'buildRevealSteps', 'ensureWeekKnightsFrozen', 'knightsEndedWeeks', 'knightsFreezeRow', 'lockWeekRows', 'knightsStoredSeason',
        'knightsDisplayWeekStart', 'getLockedWeekKnights', 'lockKnightsForMessage', 'sendGeneralTvSnapshot', 'renderWeekKnightsReview',
        'buildGeneralWeeklySheetHtml', 'printGeneralWeeklySheets'])
        assert.equal(source(name, nowHtml), source(name, baseHtml), name);
    const dayPoints = text => text.match(/const dayPoints = .*;/)[0];
    assert.equal(dayPoints(nowHtml), dayPoints(baseHtml), 'dayPoints');
    const baseStore = atBase('programs-store.js');
    for (const name of ['weekKnightsRows', 'weekKnightsMap', 'checkKnightsSize', 'mutateWeekKnights'])
        assert.equal(source(name, storeText), source(name, baseStore), name);
    const prop = (text, name, next) => { const i = text.indexOf('    ' + name + ':'), j = text.indexOf('    ' + next + ':', i); assert.ok(i >= 0 && j > i, name); return text.slice(i, j); };
    for (const [name, next] of [['saveWeekKnightsRows', 'lockWeekRows'], ['lockWeekRows', 'refreezeWeekKnightsRow']])
        assert.equal(prop(storeText, name, next), prop(baseStore, name, next), name);
    const refreeze = text => { const i = text.indexOf('    refreezeWeekKnightsRow:'); return text.slice(i, text.indexOf('\n    },\n', i) + 7); };
    assert.equal(refreeze(storeText), refreeze(baseStore), 'refreezeWeekKnightsRow');
    const tvCore = text => text.split("if (typeof document !== 'undefined')")[0];
    assert.equal(tvCore(lf(fs.readFileSync(path.join(root, 'tv.js'), 'utf8'))), tvCore(atBase('tv.js')), 'tv.js قبل الرسم (makeSlides والحالة)');
    const keys = cp.execFileSync('git', ['ls-tree', '--name-only', BASE, 'tests/rules/'], { cwd: root, encoding: 'utf8' }).split('\n').filter(f => f.endsWith('-answer-key.json'));
    assert.ok(keys.length >= 7);
    for (const file of ['tv.html', 'firestore.rules', 'data-store.js', 'general-points.js', ...keys])
        assert.equal(lf(fs.readFileSync(path.join(root, file), 'utf8')), atBase(file), file);
});
