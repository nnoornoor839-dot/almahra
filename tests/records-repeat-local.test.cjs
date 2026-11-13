// اختبار قبول ح2 «يُعاد في المجاميع» (general فقط) — 2026-11-13. يُرى أحمر قبل البناء.
// المصدر: notes/features/engine/journey-fixes-card.md §2 (الجرد)، §4 ح2 (ق7–ق11ج)، §5أ (ر4–ر5).
// الأساس: 274bd05. الميزان الحقيقي، وgeneralRecitationTotals/generalRecitationHtml/computeComplexStats/exportToExcel/renderReportsTable
// من index.html بـsource() داخل vm، بحاضنة الحضور نمط tests/step6b-attendance-math-local.test.cjs (DOM وهمي، XLSX وهمي، ساعة ثابتة).
// قراءات الكاتب لما لم تنصّ عليه البطاقة حرفاً:
// - الطلاب ط101/ط103/ط105/ط405 مبنيون هنا بتسجيلاتهم من البطاقة (لا بيانات الرحلة)، وشرط ق10: الرقم قبل الإصلاح = بعده.
// - ق9 «مرة واحدة» = مساوٍ لقياس المقطع وحده بالضبط؛ والأرقام بمنزلتين كما في البطاقة (0.28 · 0.07 · 0.03).
// - ق11ج يُقرأ من جدول الإنتاج اليومي dailyTimelineTableBody بعد renderReportsTable، نص «حفظ: 11 آية · 1 وجه».
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const { root, html, source, QuranMeasure, copy } = require('./helpers/quick-entry-harness.cjs');
const BASE = '274bd05';
const lf = text => text.replaceAll('\r\n', '\n');
const baseHtml = lf(cp.execFileSync('git', ['show', BASE + ':index.html'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

// ===== المقاطع والتسجيلات =====
const PAGE3 = { from: [2, 6], to: [2, 16] };       // البقرة 6←16: 11 آية · 1 وجه · 0.32 ربع
const P34 = { from: [2, 6], to: [2, 24] };         // البقرة 6←24: 19 آية · 2 وجه
const MASAD = { from: [111, 1], to: [111, 5] };    // المسد 1←5: 5 آيات
const REV = { from: [1, 1], to: [2, 5] };          // الفاتحة 1 ← البقرة 5: 12 آية · 2 وجه
const DAY = '2026-11-29';
const POINTS = { excellent: 1, 'very-good': 0.75, good: 0.5, repeat: 0 };
const rec = (kind, spec, grade, at = 1) => { const lines = QuranMeasure.measure({ spec }).lines, mult = kind === 'new' ? 3 : 1;
    return { kind, spec, grade, mult, rep: 1, at, by: 'synthetic-admin', heardBy: 't1', points: Math.round(lines * mult * POINTS[grade] * 10) / 10 }; };
const day = entries => ({ attended: true, entries: Object.fromEntries(entries.map((e, i) => ['e' + i, e])) });
const student = (id, name, history) => ({ id, sid: `synthetic-${id}`, name, stage: 'g1', halaqaId: 'home-active', history });
const T101 = () => student(101, 'ط101', { [DAY]: day([rec('new', PAGE3, 'excellent')]) });
const T103 = () => student(103, 'ط103', { [DAY]: day([rec('new', PAGE3, 'repeat', 1), rec('new', PAGE3, 'excellent', 2)]) });
const T105 = () => student(105, 'ط105', { [DAY]: day([rec('new', P34, 'excellent')]) });
const T405 = () => student(405, 'ط405', { [DAY]: day([rec('new', MASAD, 'excellent')]) });
const ONLY_REPEAT = () => student(201, 'كله يعاد', { [DAY]: day([rec('new', PAGE3, 'repeat')]) });
const REVIEW_REPEAT = () => student(202, 'مراجعة يعاد', { [DAY]: day([rec('review', REV, 'repeat', 1), rec('review', REV, 'excellent', 2)]) });

// ===== الحاضنة (نمط step6b-attendance-math-local) بالدوال الحقيقية للمجاميع =====
function harness(list = [], text = html) {
    const state = { program: 'general', season: { termStart: '2026-11-01', termEnd: '2026-12-31', calendar: [] },
        settings: { workingDays: [0, 1, 2, 3, 4], criteria: [], points: { attendance: 0 }, halaqas: [{ id: 'home-active', name: 'حلقة وهمية', active: true }] },
        titleRules: { requireSard: false, weeklyAttendancePct: 75 }, messages: [] };
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, { value: '', innerHTML: '', innerText: '', textContent: '', dataset: {}, style: {}, querySelectorAll: () => [],
            classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } });
        return elements.get(id);
    };
    class Clock extends Date { constructor(...args) { super(...(args.length ? args : ['2026-11-30T09:00:00Z'])); } }
    const ctx = vm.createContext({ console, Date: Clock, Intl, QuranMeasure, document: { getElementById: element },
        window: { almahraPrograms: { getCurrentProgramId: () => state.program, getCurrentSeason: () => state.season,
            getCurrentSeasonId: () => 'synthetic-season', isCurrentSeasonArchived: () => false,
            getSettings: () => ({ titleRules: state.titleRules }), getCurrentProgram: () => ({ name: 'برنامج وهمي' }) } },
        getProgramSettings: () => state.settings, getActiveCriteria: () => state.settings.criteria,
        getTiers: () => [], tiersFeatureOn: () => false, studentTierId: s => s.stage,
        roundPointTotal: n => n, snapQuarters: n => n, densityFor: () => ({}),
        dayStats: d => ({ ayahs: 0, pages: 0, quarters: 0, points: 0, golden: { ayahs: 0, pages: 0, quarters: 0 } }),
        dayPoints: () => 0,
        getCumulativeStats: () => ({ tripPoints: 0, sardAyahs: 0, exactPages: 0, quarters: 0, totalAyahs: 0, totalPages: 0, totalRawQuarters: 0 }),
        renderGeneralPerformance() {}, initHadithTilt() {}, renderHomeCare() {}, renderHomeLeaders() {}, programBrandName: () => 'برنامج وهمي',
        hbN: n => String(n), hbDigits: s => s, hbCount: n => String(n), hbSetCard() {},
        showToast: msg => state.messages.push(msg),
        XLSX: { utils: { json_to_sheet: data => { state.exportRows = copy(data); return {}; }, book_new: () => ({}), book_append_sheet() {} }, writeFile() {} }
    });
    const run = code => vm.runInContext(code, ctx);
    ctx.fixtures = list;
    run(`let students = fixtures, todayStr = '2026-11-30', honorKnightsLog = [];
        const CHRONIC_MIN_STREAK = 3, FOLLOWUP_MIN_STREAK = 2;
        const ALL_DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];`);
    for (const name of ['ivPairs', 'measureEntry']) run(text.match(new RegExp(`const ${name} = .*;`))[0]);
    const install = (...names) => names.forEach(name => run(source(name, text)));
    require('./helpers/tv-harness.cjs').installTv(run, install);
    install('isGeneralProgram', 'isWorkingDay', 'schoolCivilDate', 'isSeasonCalendarComplete', 'getSchoolDayInfo',
        'getAttendanceState', 'generalAttendanceStart', 'formatDateLocal', 'getWeekStartDate', 'addDaysToDateStr',
        'getWorkingDaysList', 'calculateStudentAttendance', 'getConsecutiveAbsenceStreak', 'getPreviousWorkingDayInfo',
        'lastSchoolDateBeforeToday', 'getBoardDate', 'getBoardWeekRange', 'getWorkingDatesInRange', 'summarizeRange',
        'getTitleRules', 'getBlockingCriteriaIds', 'dayHasBlockingViolation', 'dayHasAnyViolation',
        'getDisciplineCriteriaIds', 'dayMeetsDisciplineCriteria', 'getWeekTitleCandidates', 'getDisciplineStars',
        'getDayRanking', 'getDisciplineRanking', 'getDayTitleCandidates', 'getDayDisciplineStars', 'getDayHarvest',
        'sumCriteriaPoints', 'getMostImproved', 'getLastActiveHijri', 'getTodayAbsentees', 'getFollowupAbsentees',
        'getChronicAbsentees', 'escapeHTML', 'getKnightWinCounts', 'getApprovedKnightsForMode', 'topTied',
        'farsSelectionCount', 'updateFarsApprovalView', 'generalGoldenHidden', 'getGeneralSchoolDates', 'getGeneralDayAttendance', 'generalDayAttendanceLabel',
        'generalStudentAttendanceLabel', 'generalAttendanceLabel', 'getGeneralAttendanceEligibility', 'generalIncompleteAttendanceHtml',
        // الدوال الحقيقية موضوع الاختبار
        'generalRecitationTotals', 'formatGeneralUnit', 'generalFiveUnits', 'generalRecitationHtml',
        'computeComplexStats', 'exportToExcel', 'renderReportsTable');
    return { state, ctx, run, element, list,
        totals: (i = 0) => copy(run(`generalRecitationTotals(students[${i}])`)) };
}
const two = x => Number(x.toFixed(2));
const five = t => ({ ayahs: t.ayahs, pages: two(t.pages), quarters: two(t.quarters), hizb: two(t.hizb), juz: two(t.juz) });
const ZERO = { ayahs: 0, pages: 0, quarters: 0, hizb: 0, juz: 0 };
const once = spec => { const m = QuranMeasure.measure({ spec }); return { ayahs: m.ayahs, pages: m.pages, quarters: m.quarters, hizb: m.hizb, juz: m.juz }; };

// ===== ح2 — ر4 (ق7–ق9): يفشل اليوم =====
test('ق7 (ر4): ط103 («يُعاد» البقرة 6←16 ثم ممتاز للمقطع نفسه): الحفظ = 11 آية · 1 وجه · 0.32 ربع · 0.08 حزب · 0.04 جزء', () => {
    const h = harness([T103()]);
    assert.deepEqual(five(h.totals().new), { ayahs: 11, pages: 1, quarters: 0.32, hizb: 0.08, juz: 0.04 });
    assert.deepEqual(h.totals().new, once(PAGE3));
    assert.deepEqual(h.totals().review, ZERO);
});
test('ق7 (ر4): ط103 نقاطه 45 بلا تغيير («يُعاد» = 0 + ممتاز = 45)', () => {
    const t = T103();
    assert.deepEqual(Object.values(t.history[DAY].entries).map(e => e.points), [0, 45]);
});
test('ق7 (ر4): ط103 في generalRecitationHtml = «حفظ: 11 آية · 1 وجه · 0.32 ربع · 0.08 حزب · 0.04 جزء»', () => {
    const h = harness([T103()]);
    assert.match(h.run('generalRecitationHtml(students[0])'), /حفظ: 11 آية · 1 وجه · 0\.32 ربع · 0\.08 حزب · 0\.04 جزء/);
});
test('ق8 (ر4): طالب كل تسجيلاته «يُعاد» = 0 آية · 0 وجه · 0 ربع · 0 حزب · 0 جزء', () => {
    const h = harness([ONLY_REPEAT()]);
    assert.deepEqual(h.totals().new, ZERO);
    assert.deepEqual(h.totals().review, ZERO);
});
test('ق9 (ر4): مراجعة «يُعاد» الفاتحة 1 ← البقرة 5 ثم ممتاز للمقطع نفسه = 12 آية · 2 وجه · 0.28 ربع · 0.07 حزب · 0.03 جزء (مرة واحدة)', () => {
    const h = harness([REVIEW_REPEAT()]);
    assert.deepEqual(five(h.totals().review), { ayahs: 12, pages: 2, quarters: 0.28, hizb: 0.07, juz: 0.03 });
    assert.deepEqual(h.totals().review, once(REV));
    assert.deepEqual(h.totals().new, ZERO);
});

// ===== ح2 — ر5 (ق10–ق11ج) =====
test('ق10 (ر5): بلا تغيير لغير «يُعاد» — ط101 = 11 · 1 · 0.32 · 0.08 · 0.04؛ ط105 = 19 · 2 · 0.64 · 0.16 · 0.08؛ ط405 = 5 آيات · 0.33 وجه · 0.07 ربع', () => {
    const h = harness([T101(), T105(), T405()]);
    assert.deepEqual(five(h.totals(0).new), { ayahs: 11, pages: 1, quarters: 0.32, hizb: 0.08, juz: 0.04 });
    assert.deepEqual(five(h.totals(1).new), { ayahs: 19, pages: 2, quarters: 0.64, hizb: 0.16, juz: 0.08 });
    const masad = five(h.totals(2).new);
    assert.equal(masad.ayahs, 5); assert.equal(masad.pages, 0.33); assert.equal(masad.quarters, 0.07);
});
test('ق10 (ر5): لكل طالب بلا «يُعاد» (ط101، ط105، ط405، وق7–ق9 بلا تسجيلات «يُعاد») الرقم الحالي = رقم 274bd05 حرفياً', () => {
    const noRepeat = s => { for (const d of Object.values(s.history)) for (const k of Object.keys(d.entries)) if (d.entries[k].grade === 'repeat') delete d.entries[k]; return s; };
    const list = () => [T101(), T105(), T405(), noRepeat(T103()), noRepeat(ONLY_REPEAT()), noRepeat(REVIEW_REPEAT())];
    const cur = harness(list()), old = harness(list(), baseHtml);
    for (let i = 0; i < 6; i++) assert.deepEqual(cur.totals(i), old.totals(i), `طالب ${i}`);
});
test('ق11 (ر5): تصدير إكسل لط103: «الحفظ - الآيات» = 11، «الحفظ - الأوجه» = 1، «الحفظ - الأرباع» = 0.32 (خام)', () => {
    const h = harness([T103()]);
    h.run('exportToExcel()');
    const row = h.state.exportRows[0];
    assert.equal(row['الحفظ - الآيات'], 11);
    assert.equal(row['الحفظ - الأوجه'], 1);
    assert.equal(two(row['الحفظ - الأرباع']), 0.32);
    assert.equal(row['الحفظ - الأرباع'], once(PAGE3).quarters);
});
test('ق11 (ر5): تصدير إكسل لط103 = ما في generalRecitationHtml (الوحدات الخمس للحفظ والمراجعة)', () => {
    const h = harness([T103()]);
    h.run('exportToExcel()');
    const row = h.state.exportRows[0], t = h.totals();
    for (const [kind, label] of [['new', 'الحفظ'], ['review', 'المراجعة']]) {
        const fromExcel = { ayahs: row[`${label} - الآيات`], pages: row[`${label} - الأوجه`], quarters: row[`${label} - الأرباع`], hizb: row[`${label} - الأحزاب`], juz: row[`${label} - الأجزاء`] };
        assert.deepEqual(fromExcel, t[kind], label);
    }
    assert.match(h.run('generalRecitationHtml(students[0])'), new RegExp(`حفظ: ${row['الحفظ - الآيات']} آية · ${h.run('formatGeneralUnit')(row['الحفظ - الأوجه'])} وجه`));
    assert.equal(row['الحفظ - الآيات'], 11);
});
test('ق11ب (ر5): المجمع computeComplexStats لـ{ط101، ط103}: الآيات = 11 + 11 = 22 (لا 33)، والأوجه = 2', () => {
    const h = harness([T101(), T103()]);
    const stats = copy(h.run('computeComplexStats()'));
    assert.equal(stats.ayahs, 22);
    assert.equal(stats.pages, 2);
});
test('ق11ج (ر5): السجل — الإنتاج اليومي يوم 11-29 لط103 وحده: «حفظ: 11 آية · 1 وجه»', () => {
    const h = harness([T103()]);
    h.run('renderReportsTable()');
    const rows = h.element('dailyTimelineTableBody').innerHTML.split('<tr').filter(r => r.includes(DAY));
    assert.equal(rows.length, 1, 'صف يوم 2026-11-29');
    assert.match(rows[0], /حفظ: 11 آية · 1 وجه · /);
    assert.match(rows[0], />11 آية<\/td>/);
});
test('ق7 (ر4، البند 42): السجل التراكمي — صف ط103 (generalRecitationHtml داخل renderReportsTable) = «حفظ: 11 آية · 1 وجه»', () => {
    const h = harness([T103()]);
    h.run('renderReportsTable()');
    assert.match(h.element('reportsTableBody').innerHTML, /حفظ: 11 آية · 1 وجه · /);
});
// ق12 (قرار المدير على §8-1): شارة «الآيات» في بطاقة السجل تأخذ رقمها من مصدر صفوف السجل (generalRecitationTotals) فلا تعدّ «يُعاد».
// getCumulativeStats هنا بديل يعدّ كل تسجيل بلا نظر في التقدير (كـdayStats)؛ لو قرأت الشارة منه لقالت 33.
test('ق12 (§8-1): شارة rcBadgeStats لـ{ط101، ط103} = «22 آية» (لا 33) = مجموع صفوف السجل', () => {
    const h = harness([T101(), T103()]);
    h.ctx.getCumulativeStats = s => { let totalAyahs = 0;
        for (const d of Object.values(s.history)) for (const e of Object.values(d.entries)) totalAyahs += QuranMeasure.measure({ spec: e.spec }).ayahs;
        return { tripPoints: 0, sardAyahs: 0, exactPages: 0, quarters: 0, totalAyahs, totalPages: 0, totalRawQuarters: 0 }; };
    assert.equal(h.ctx.getCumulativeStats(T103()).totalAyahs, 22, 'البديل يعدّ «يُعاد»');
    h.run(source('updateRecordsBadges'));
    h.run('updateRecordsBadges()');
    assert.equal(h.element('rcBadgeStats').textContent, '22 آية');
    const rows = [0, 1].map(i => h.totals(i)).reduce((n, t) => n + t.new.ayahs + t.review.ayahs, 0);
    assert.equal(rows, 22);
});
