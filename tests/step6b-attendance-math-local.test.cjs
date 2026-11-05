// Offline only: production readers, synthetic calendar/students, fake DOM and fixed clock.
// Run: node --test tests/*.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const baseline = cp.execFileSync('git', ['show', '3df7524:index.html'], { cwd: root, encoding: 'utf8' });
const copy = value => JSON.parse(JSON.stringify(value));
function source(name, text = html) {
    const start = text.search(new RegExp(`(?:async )?function ${name}\\(`));
    assert.ok(start >= 0, `production function ${name}`);
    for (let end = text.indexOf('}', start); end >= 0; end = text.indexOf('}', end + 1)) {
        const candidate = text.slice(start, end + 1);
        try { new vm.Script(`(${candidate})`); } catch { continue; }
        return candidate;
    }
    throw Error(`Unclosed function ${name}`);
}
const present = () => ({ attended: true });
const absent = (absence = 'unexcused') => ({ attended: false, absence });
const student = (id, history = {}) => ({ id, sid: `synthetic-${id}`, name: `طالب وهمي ${id}`, stage: 'g1', history });
function harness(list = [], text = html, program = 'general') {
    const state = { program, season: { termStart: '2026-11-01', termEnd: '2026-12-31', calendar: [] },
        settings: { workingDays: [0, 1, 2, 3, 4], criteria: [], points: { attendance: 0 } },
        titleRules: { requireSard: false, weeklyAttendancePct: 75 }, messages: [], sheets: [] };
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, { value: '', innerHTML: '', innerText: '', textContent: '', style: {}, querySelectorAll: () => [],
            classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } });
        return elements.get(id);
    };
    const zeroTotals = () => ({ new: { ayahs: 0, pages: 0, quarters: 0, hizb: 0, juz: 0 }, review: { ayahs: 0, pages: 0, quarters: 0, hizb: 0, juz: 0 } });
    class Clock extends Date { constructor(...args) { super(...(args.length ? args : ['2026-11-10T09:00:00Z'])); } }
    const ctx = vm.createContext({ console, Date: Clock, Intl, document: { getElementById: element },
        window: { almahraPrograms: { getCurrentProgramId: () => state.program, getCurrentSeason: () => state.season,
            getCurrentSeasonId: () => 'synthetic-season', isCurrentSeasonArchived: () => false,
            getSettings: () => ({ titleRules: state.titleRules }), getCurrentProgram: () => ({ name: 'برنامج وهمي' }) } },
        getProgramSettings: () => state.settings, getActiveCriteria: () => state.settings.criteria,
        getTiers: () => [], tiersFeatureOn: () => false, studentTierId: s => s.stage,
        roundPointTotal: n => n, snapQuarters: n => n, densityFor: () => ({}),
        dayStats: d => ({ ayahs: d?.ayahs || 0, pages: 0, quarters: 0, points: 0, golden: { ayahs: 0, pages: 0, quarters: 0 } }),
        dayPoints: d => d?.earnedPoints || 0, generalRecitationTotals: zeroTotals,
        getCumulativeStats: s => ({ tripPoints: 0, sardAyahs: 0, exactPages: 0, quarters: 0, totalAyahs: 0, totalPages: 0, totalRawQuarters: 0 }),
        generalFiveUnits: () => 'كميات وهمية', generalRecitationHtml: () => 'إنجاز وهمي', formatGeneralUnit: n => String(n),
        // رسوم الجولة الثانية مستقلة عن حاضنة الحضور هذه وتغطيها home-local.
        renderGeneralPerformance() {},
        initHadithTilt() {}, renderHomeCare() {}, renderHomeLeaders() {}, programBrandName: () => 'برنامج وهمي',
        hbN: n => String(n), hbDigits: s => s, hbCount: n => String(n), hbSetCard() {},
        showToast: msg => state.messages.push(msg),
        XLSX: { utils: { json_to_sheet: data => { state.exportRows = copy(data); return {}; }, book_new: () => ({}), book_append_sheet() {} }, writeFile() {} }
    });
    const run = code => vm.runInContext(code, ctx);
    ctx.fixtures = list;
    run(`let students = fixtures, todayStr = '2026-11-10', honorKnightsLog = [];
        const CHRONIC_MIN_STREAK = 3, FOLLOWUP_MIN_STREAK = 2;
        const ALL_DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];`);
    const install = (...names) => names.forEach(name => run(source(name, text)));
    if (text === html) require('./helpers/tv-harness.cjs').installTv(run, install);
    install('isGeneralProgram', 'isWorkingDay', 'schoolCivilDate', 'isSeasonCalendarComplete', 'getSchoolDayInfo',
        'getAttendanceState', 'generalAttendanceStart', 'formatDateLocal', 'getWeekStartDate', 'addDaysToDateStr',
        'getWorkingDaysList', 'calculateStudentAttendance', 'getConsecutiveAbsenceStreak', 'getPreviousWorkingDayInfo',
        'lastSchoolDateBeforeToday', 'getBoardDate', 'getBoardWeekRange', 'getWorkingDatesInRange', 'summarizeRange',
        'getTitleRules', 'getBlockingCriteriaIds', 'dayHasBlockingViolation', 'dayHasAnyViolation',
        'getDisciplineCriteriaIds', 'dayMeetsDisciplineCriteria', 'getWeekTitleCandidates', 'getDisciplineStars',
        'getDayRanking', 'getDisciplineRanking', 'getDayTitleCandidates', 'getDayDisciplineStars', 'getDayHarvest',
        'sumCriteriaPoints', 'getMostImproved', 'getLastActiveHijri', 'getTodayAbsentees', 'getFollowupAbsentees',
        'getChronicAbsentees', 'computeComplexStats', 'escapeHTML', 'getKnightWinCounts', 'getApprovedKnightsForMode',
        'topTied', 'buildGeneralWeeklyMessage', 'getGeneralMessageWeek', 'exportToExcel', 'renderReportsTable',
        'renderAbsenceReport', 'renderHomeDashboard', 'renderHonorBoard', 'hbEmpty', 'hbTier', 'hbWinnerRow', 'hbDuo',
        'buildAchievementText', 'getSeasonLeaders', 'updateThreeKnightsSelects', 'syncFarsDayFromDate');
    if (text === html) install('generalGoldenHidden', 'getGeneralSchoolDates', 'getGeneralDayAttendance', 'generalDayAttendanceLabel',
        'generalStudentAttendanceLabel', 'generalAttendanceLabel', 'getGeneralAttendanceEligibility', 'generalIncompleteAttendanceHtml');
    if (text === html) {
        run("let generalHomeExpanded = { context: '', stalled: false, support: false };");
        install('getStudentHalaqa', 'getGeneralUnrecordedDays', 'countLabel', 'cleanCellText', 'normalizeSaudiPhone',
            'updateHomeProgramVisibility', 'generalTodaySummary', 'generalStalledMemorization', 'generalRecitationSupport',
            'generalHomeDaysLabel', 'generalHomeHalaqaName', 'generalHomeFollowupText', 'generalTodayCardHtml',
            'generalHomeWhatsapp', 'generalHomeFollowupCard', 'renderGeneralHome', 'expandGeneralHomeList');
    }
    const countCalls = name => {
        const original = ctx[name], counter = { calls: 0 };
        ctx[name] = (...args) => { counter.calls++; return original(...args); };
        return counter;
    };
    return { state, ctx, run, install, element, list, countCalls, dates: () => copy(run('getWorkingDaysList(students)')),
        attendance: (i = 0) => copy(run(`calculateStudentAttendance(students[${i}], getWorkingDaysList(students))`)),
        today: date => { ctx.date = date; run('todayStr = date'); },
        holiday: (from, to = from) => state.season.calendar.push({ id: 'synthetic-holiday', from, to, name: '<إجازة وهمية>' }) };
}

test('calendar supplies every school date with no records; holidays, weekends, future and season boundaries excluded', () => {
    const h = harness([student(1, { '2026-10-31': present(), '2026-11-06': present(), '2026-11-12': present() })]);
    h.holiday('2026-11-02', '2026-11-04');
    assert.deepEqual(h.dates(), ['2026-11-01', '2026-11-05', '2026-11-08', '2026-11-09', '2026-11-10']);
    h.ctx.fixtures.length = 0;
    assert.equal(h.dates().length, 5);
    h.state.season.termEnd = '2026-11-08';
    assert.deepEqual(h.dates(), ['2026-11-01', '2026-11-05', '2026-11-08']);
    h.state.season.calendar = undefined;
    assert.deepEqual(h.dates(), []);
});

test('3 present + 1 absent + 2 unrecorded = 75%, one absence and two unrecorded; entries prove presence', () => {
    const h = harness([student(1, { '2026-11-01': present(), '2026-11-02': { entries: { e1: {} }, attended: false },
        '2026-11-03': present(), '2026-11-04': absent('excused'), '2026-11-05': { hijri: 'وهمي' } })]);
    h.today('2026-11-08');
    assert.deepEqual(h.attendance(), { actualDays: 3, absences: 1, unrecorded: 2, excused: 1, unexcused: 0,
        expectedDays: 4, schoolDays: 6, attendancePct: 75 });
    h.list.push(student(2, { '2026-11-04': present() }), student(3));
    assert.equal(h.attendance(1).schoolDays, 3);
    assert.equal(h.attendance(2).schoolDays, 1); // Existing 6a rule: no history starts today.
});

test('retroactive holiday removes absence and denominator immediately while preserving every record and point', () => {
    const h = harness([student(1, { '2026-11-01': present(), '2026-11-02': { ...absent(), earnedPoints: 99 } })]);
    h.today('2026-11-02');
    const before = copy(h.list);
    assert.equal(h.attendance().attendancePct, 50);
    h.holiday('2026-11-02');
    assert.equal(h.attendance().attendancePct, 100);
    assert.equal(h.attendance().absences, 0);
    assert.deepEqual(h.list, before);
});

test('streak skips only current unrecorded day; yesterday unrecorded stops; holiday neither stops nor increments', () => {
    const h = harness([student(1, { '2026-11-01': absent(), '2026-11-02': absent() })]);
    h.today('2026-11-03');
    const streak = () => h.run('getConsecutiveAbsenceStreak(students[0], getWorkingDaysList(students))');
    assert.equal(streak(), 2);
    delete h.list[0].history['2026-11-02']; h.list[0].history['2026-11-03'] = absent();
    assert.equal(streak(), 1);
    h.holiday('2026-11-02'); assert.equal(streak(), 2);
    h.list[0].history['2026-11-03'] = { entries: { e1: {} } }; assert.equal(streak(), 0);
});

test('knights: incomplete never eligible or excluded for attendance; complete 75% qualifies; daily holiday yields no candidates', () => {
    const history = { '2026-11-01': { ...present(), earnedPoints: 20 }, '2026-11-02': present(),
        '2026-11-03': present(), '2026-11-04': absent() };
    const h = harness([student(1, history), student(2, { ...history, '2026-11-04': { hijri: 'وهمي' } }),
        student(3, { '2026-11-04': { attended: true } })]); // ينقل اللوحة لليوم، ولو كانت نقاطه صفراً.
    h.today('2026-11-04');
    assert.equal(h.run("getGeneralAttendanceEligibility(students[0], getWorkingDaysList(students), 75).status"), 'eligible');
    assert.equal(h.run("getGeneralAttendanceEligibility(students[1], getWorkingDaysList(students), 75).status"), 'incomplete');
    assert.deepEqual(copy(h.run('getWeekTitleCandidates().map(e => e.student.id)')), [1]);
    h.list[1].name = '<طالب وهمي>';
    assert.match(h.run('generalIncompleteAttendanceHtml(getWorkingDaysList(students))'), /&lt;طالب وهمي&gt;.*غير مكتمل/);
    h.run('renderHonorBoard(); updateThreeKnightsSelects()');
    assert.match(h.element('hbWeeklyKnights').innerHTML, /غير مكتمل/);
    assert.match(h.element('hbDisciplineStars').innerHTML, /غير مكتمل/);
    assert.match(h.element('hbDailyKnights').innerHTML, /غير مكتمل/);
    assert.match(h.element('fars1Select').innerHTML, /&lt;طالب وهمي&gt; — غير مكتمل/);
    h.holiday('2026-11-04');
    for (const call of ["getDayRanking(todayStr)", "getDayTitleCandidates(todayStr)", "getDisciplineRanking(todayStr)", "getDayDisciplineStars(todayStr)"]) assert.deepEqual(copy(h.run(call)), []);
    assert.equal(h.run('getDayHarvest(todayStr).attended'), 0);
});

test('discipline and improvement do not award incomplete periods; enrollment trims each student period', () => {
    const h = harness([student(1, { '2026-11-01': { ...present(), criteria: { c: 1 }, earnedPoints: 10 },
        '2026-11-08': { ...present(), criteria: { c: 1 }, earnedPoints: 20 } }),
    student(2, { '2026-11-09': { ...present(), criteria: { c: 1 }, earnedPoints: 5 } })]);
    h.state.settings.criteria = [{ id: 'c', points: 1, disciplineCriterion: true }];
    h.today('2026-11-09');
    assert.deepEqual(copy(h.run('getDisciplineStars().stars.map(e => e.student.id)')), [2]);
    assert.deepEqual(copy(h.run('getMostImproved()')), []);
});

test('last school day crosses long holidays; board requires a recorded presence on a school day', () => {
    const h = harness([student(1, { '2026-11-09': present() })]);
    h.holiday('2026-11-02', '2026-11-19'); h.today('2026-11-19');
    assert.equal(h.run('getPreviousWorkingDayInfo().dateStr'), '2026-11-01');
    assert.equal(h.run('getBoardDate()'), null);
    h.list[0].history['2026-11-01'] = present();
    assert.equal(h.run('getBoardDate()'), '2026-11-01');
    assert.deepEqual(copy(h.run('getBoardWeekRange()')), { startStr: '2026-11-01', endStr: '2026-11-01', inProgress: false });
    h.state.season.termStart = '2026-11-02';
    assert.equal(h.run('getPreviousWorkingDayInfo().dateStr'), '');
    assert.equal(h.run('getBoardDate()'), null);
});

test('daily dashboard, reports, last presence and Excel distinguish all three states and holidays; reading never mutates', () => {
    const h = harness([student(1, { '2026-11-01': present(), '2026-11-10': { entries: { e: {} } } }),
        student(2, { '2026-11-01': present(), '2026-11-10': absent('excused') }), student(3, { '2026-11-01': present() })]);
    h.state.settings.halaqas = [{ id: 'home-active', name: 'حلقة وهمية', active: true }];
    h.list.forEach(s => { s.halaqaId = 'home-active'; });
    const before = copy(h.list);
    const stats = copy(h.run('computeComplexStats()'));
    assert.equal(stats.presentToday, 1); assert.equal(stats.absentToday, 1); assert.equal(stats.unrecordedToday, 1); assert.equal(stats.todayPct, 50);
    assert.deepEqual(copy(h.run('getTodayAbsentees().map(s => s.id)')), [2]);
    h.run('renderHomeDashboard(); renderReportsTable(); renderAbsenceReport(); exportToExcel()');
    // تغيّر بقرار المالك ٢٠٢٦-١١-٠٢ (ت٢٣)؛ تغطيه home-local
    assert.match(h.element('generalTodayCard').innerHTML, /<b>1<\/b><span>لم يُسجَّل<\/span>/);
    assert.match(h.element('reportsTableBody').innerHTML, /لم يُسجَّل/);
    assert.match(h.element('dailyTimelineTableBody').innerHTML, /لم يُسجَّل 1/);
    assert.deepEqual(h.state.exportRows.map(r => r['حالة اليوم']), ['حاضر', 'غائب', 'لم يُسجَّل']);
    assert.equal(h.run('getLastActiveHijri(students[0])'), '2026-11-10');
    h.holiday('2026-11-10');
    h.run('renderHomeDashboard(); renderReportsTable(); renderAbsenceReport(); exportToExcel()');
    // تغيّر بقرار المالك ٢٠٢٦-١١-٠٢ (ت٢٣)؛ تغطيه home-local
    assert.match(h.element('generalTodayCard').innerHTML, /اليوم إجازة/);
    assert.match(h.element('executiveAttendanceDashboard').innerHTML, /إجازة/);
    assert.match(h.element('dailyTimelineTableBody').innerHTML, /إجازة/);
    assert.deepEqual(h.state.exportRows.map(r => r['حالة اليوم']), ['إجازة', 'إجازة', 'إجازة']);
    assert.equal(h.run('getLastActiveHijri(students[0])'), '2026-11-01');
    assert.deepEqual(h.list, before);
});

test('weekly message shares calendar math but retains holiday recitations, with no changes to points calculation', () => {
    const h = harness([student(1, { '2026-11-01': present(), '2026-11-02': { entries: { e: { kind: 'new', spec: { from: [1, 1], to: [1, 2] } } } },
        '2026-11-03': absent('excused'), '2026-11-04': { hijri: 'وهمي' } })]);
    h.today('2026-11-04'); h.holiday('2026-11-02');
    h.ctx.messageSettings = { ...h.state.settings, todayStr: '2026-11-04', dayPoints: () => 0,
        measureEntry: () => ({ lines: 3 }), surahName: () => 'سورة وهمية', brandName: 'برنامج وهمي',
        attendanceSummary: (s, from, to) => h.ctx.calculateStudentAttendance(s, h.ctx.getGeneralSchoolDates(from, to)) };
    const msg = h.run("buildGeneralWeeklyMessage(students[0], { startStr: '2026-11-01', endStr: '2026-11-07' }, messageSettings)");
    assert.match(msg, /الحضور: ١ من ٢ أيام مسجّلة \(٥٠٪\)/);
    assert.match(msg, /لم يُسجَّل: ١/); assert.match(msg, /٣ سطر/);
});

test('2 of 3 rounds to 67 only in weekly message and Excel; eligibility retains the exact percentage', () => {
    const h = harness([student(1, { '2026-11-01': present(), '2026-11-02': present(), '2026-11-03': absent() })]);
    h.today('2026-11-03');
    h.ctx.messageSettings = { ...h.state.settings, todayStr: '2026-11-03', dayPoints: () => 0,
        brandName: 'برنامج وهمي', attendanceSummary: (s, from, to) => h.ctx.calculateStudentAttendance(s, h.ctx.getGeneralSchoolDates(from, to)) };
    const msg = h.run("buildGeneralWeeklyMessage(students[0], { startStr: '2026-11-01', endStr: '2026-11-07' }, messageSettings)");
    assert.match(msg, /الحضور: ٢ من ٣ أيام مسجّلة \(٦٧٪\)/);
    h.run('exportToExcel()');
    assert.equal(h.state.exportRows[0]['نسبة الحضور'], 67);
    assert.equal(h.attendance().attendancePct, 2 / 3 * 100);
    assert.equal(h.run('getGeneralAttendanceEligibility(students[0], getWorkingDaysList(students), 67).status'), 'excluded');
});

test('last presence reuses the supplied calendar, computes start once and stops at the first present day backwards', () => {
    const h = harness([student(1, { '2026-11-01': present(), '2026-11-09': { ...present(), hijri: 'آخر حضور وهمي' } })]);
    h.ctx.schoolDates = h.dates();
    const calendar = h.countCalls('getWorkingDaysList'), start = h.countCalls('generalAttendanceStart');
    const attendance = h.countCalls('getAttendanceState');
    assert.equal(h.run('getLastActiveHijri(students[0], schoolDates)'), 'آخر حضور وهمي');
    assert.equal(calendar.calls, 0); assert.equal(start.calls, 1); assert.equal(attendance.calls, 2);
    assert.equal(h.run('getLastActiveHijri(students[0])'), 'آخر حضور وهمي');
    assert.equal(calendar.calls, 1); assert.equal(start.calls, 2); assert.equal(attendance.calls, 4);
    delete h.list[0].history['2026-11-09']; delete h.list[0].history['2026-11-01'];
    assert.equal(h.run('getLastActiveHijri(students[0], schoolDates)'), 'لم يحضر بعد');
    assert.equal(attendance.calls, 5); // No dates before this student's start (today).
});

test('summary filters with one enrollment lookup and reuses the supplied attendance result', () => {
    const h = harness([student(1, { '2026-11-01': present(), '2026-11-02': absent() })]);
    h.ctx.schoolDates = h.dates();
    const expected = copy(h.run('summarizeRange(students[0], schoolDates)'));
    h.ctx.attendance = h.run('getGeneralAttendanceEligibility(students[0], schoolDates, 75)');
    const start = h.countCalls('generalAttendanceStart'), attendance = h.countCalls('calculateStudentAttendance');
    assert.deepEqual(copy(h.run('summarizeRange(students[0], schoolDates, attendance)')), expected);
    assert.equal(start.calls, 1); assert.equal(attendance.calls, 0);
});

test('weekly candidates, discipline, incomplete rows and three selects each calculate attendance once per student', () => {
    const h = harness([student(1, { '2026-11-01': { ...present(), earnedPoints: 10 }, '2026-11-02': present() }),
        student(2, { '2026-11-01': present() })]);
    h.today('2026-11-02');
    const attendance = h.countCalls('calculateStudentAttendance');
    for (const call of ['getWeekTitleCandidates()', 'getDisciplineStars()', 'generalIncompleteAttendanceHtml(getWorkingDaysList(students))']) {
        attendance.calls = 0; h.run(call);
        assert.equal(attendance.calls, h.list.length, call);
    }
    const ids = ['fars1Select', 'fars2Select', 'fars3Select'];
    ids.forEach((id, i) => { h.element(id).value = String(i % 2 + 1); });
    attendance.calls = 0; h.run('updateThreeKnightsSelects()');
    assert.equal(attendance.calls, h.list.length);
    ids.forEach((id, i) => {
        assert.equal(h.element(id).innerHTML, h.element(ids[0]).innerHTML);
        assert.equal(h.element(id).value, String(i % 2 + 1));
    });
    assert.match(h.element(ids[0]).innerHTML, /طالب وهمي 2 — غير مكتمل/);
});

test('one updateAllUIs render over about 90 school days keeps calendar calls constant for 1 and 100 students', () => {
    const counts = [];
    for (const size of [1, 100]) {
        const h = harness(Array.from({ length: size }, (_, i) => student(i + 1, { '2026-07-01': present(), '2026-11-09': present() })));
        h.state.season.termStart = '2026-07-01';
        assert.ok(h.dates().length >= 90);
        // Keep attendance renders real; unrelated grids, timers and messages are outside this fixture.
        for (const name of ['updateSchoolCalendarAlert', 'updateGeneralAttendanceUI', 'renderCompactTripGrid', 'renderStudentsGrid',
            'renderSettingsStudents', 'processRealClockPomodoro', 'renderExamEntryList', 'renderExamResultsReport',
            'updateSettingsBadges', 'renderGeneralWeeklyMessages']) h.ctx[name] = () => {};
        h.install('updateAllUIs', 'updateAttendanceAlertBar', 'updateRecordsBadges');
        h.element('recPanelAbsence').classList.contains = cls => cls === 'active';
        h.ctx.console = { error: (message, error) => { throw error; } };
        const calendar = h.countCalls('getWorkingDaysList'), attendance = h.countCalls('calculateStudentAttendance');
        h.run('updateAllUIs()');
        counts.push({ calendar: calendar.calls, attendance: attendance.calls });
        assert.equal(attendance.calls, 3 * size); // Reports + their statistics + one set of options; home statistics removed by owner decision 2026-11-02 (ت٢٣)
        assert.match(h.element('reportsTableBody').innerHTML, /2026-11-09/);
    }
    assert.equal(counts[0].calendar, counts[1].calendar);
    assert.ok(counts[1].calendar < 10);
});

test('absence report reads today attendance once, including summary and holiday labels', () => {
    const h = harness([student(1, { '2026-11-01': present(), '2026-11-10': absent() }), student(2)]);
    const day = h.countCalls('getGeneralDayAttendance');
    h.run('renderAbsenceReport()');
    assert.equal(day.calls, 1);
    assert.match(h.element('absenceSummary').innerHTML, /حضر 0 · غاب 1 · لم يُسجَّل 1/);
    assert.match(h.element('absenceDetailList').innerHTML, /لم يُسجَّل: 1/);
    h.holiday('2026-11-10'); day.calls = 0;
    h.run('renderAbsenceReport()');
    assert.equal(day.calls, 1);
    assert.match(h.element('absenceSummary').innerHTML, /إجازة/);
    assert.match(h.element('absenceDetailList').innerHTML, /إجازة/);
});

test('weekly honor winner has no fixed zero unrecorded suffix; incomplete student still has a warning', () => {
    const h = harness([student(1, { '2026-11-01': { ...present(), earnedPoints: 10 }, '2026-11-02': present() }),
        student(2, { '2026-11-01': present() })]);
    h.today('2026-11-02'); h.run('renderHonorBoard()');
    const weekly = h.element('hbWeeklyKnights').innerHTML;
    assert.match(weekly, /طالب وهمي 1/); assert.match(weekly, /10 نقطة · حضر 2\/2/);
    assert.doesNotMatch(weekly, / · لم يُسجَّل 0/);
    assert.match(weekly, /طالب وهمي 2.*غير مكتمل.*لم يُسجَّل 1/);
});

test('saving unrecorded attendance without a choice shows the requested error and never writes', () => {
    const h = harness([student(1)]), writes = [], before = copy(h.list);
    h.install('saveAttendanceEdit', 'requireSchoolDay');
    h.run('let attEditStudentId = 1, attEditChoice = null;');
    h.element('attEditDateInput').value = '2026-11-10';
    h.ctx.refreshToday = () => {};
    h.ctx.canWriteCloud = () => true;
    h.ctx.commitStudentPatch = (...args) => { writes.push(args); return false; };
    h.run('saveAttendanceEdit()');
    assert.deepEqual(h.state.messages, ['اختر حاضر أو غائب']);
    assert.deepEqual(writes, []); assert.deepEqual(h.list, before);
    // The existing present/absent paths still reach the same write with their chosen value.
    h.ctx.DEL_FIELD = { __almahraDelete: true };
    for (const choice of [true, false]) {
        h.element('attEditAbsence').value = 'excused'; h.element('attEditNote').value = 'ملاحظة وهمية';
        h.run(`attEditChoice = ${choice}; saveAttendanceEdit()`);
        assert.equal(writes.at(-1)[1]['history.2026-11-10.attended'], choice);
    }
    assert.equal(writes.length, 2); assert.equal(h.state.messages.length, 1);
});

test('summer and review-day readers and rendered reports match the exact 6a baseline on identical data', () => {
    const list = [student(1, { '2026-11-01': present(), '2026-11-05': absent(), '2026-11-06': { ...present(), earnedPoints: 5 } }),
        student(2, { '2026-11-01': { ...present(), earnedPoints: 4 }, '2026-11-10': absent() })];
    const calls = ['getWorkingDaysList(students)', 'calculateStudentAttendance(students[0], getWorkingDaysList(students))',
        'getConsecutiveAbsenceStreak(students[0], getWorkingDaysList(students))', 'getPreviousWorkingDayInfo()', 'getBoardDate()',
        'getBoardWeekRange()', "getWorkingDatesInRange('2026-11-01', todayStr)", 'summarizeRange(students[0], getWorkingDaysList(students))',
        'getWeekTitleCandidates()', 'getDisciplineStars()', 'getMostImproved()', 'getDayRanking(todayStr)',
        'getDisciplineRanking(todayStr)', 'getDayDisciplineStars(todayStr)', 'getDayHarvest(todayStr)',
        'getTodayAbsentees()', 'computeComplexStats()', 'getLastActiveHijri(students[0])'];
    for (const program of ['summer', 'review-day']) {
        const current = harness(copy(list), html, program), old = harness(copy(list), baseline, program);
        for (const call of calls) assert.deepEqual(copy(current.run(call)), copy(old.run(call)), `${program}: ${call}`);
        for (const h of [current, old]) h.run('renderHomeDashboard(); renderReportsTable(); renderAbsenceReport(); exportToExcel(); renderHonorBoard(); updateThreeKnightsSelects()');
        for (const id of ['homeDashboard', 'reportsTableBody', 'dailyTimelineTableBody', 'executiveAttendanceDashboard', 'absenceSummary', 'absenceDetailList',
            'hbDailyKnights', 'hbWeeklyKnights', 'hbDisciplineStars', 'fars1Select']) {
            assert.equal(current.element(id).innerHTML, old.element(id).innerHTML, `${program}: ${id}`);
        }
        assert.deepEqual(current.state.exportRows, old.state.exportRows);
    }
});

test('scope: all existing writes, points, settings and deferred group readers remain byte-identical to 6a', () => {
    // تغيّرت بقرار المالك ٢٠٢٦-١١-٠٣ (ت٢٤)؛ يغطيها students-page-local
    for (const name of ['commitStudentPatch', 'commitPatches', 'buildEntryPatch', 'saveSmartProgress', 'saveSmartMastery',
        'markPresent', 'launchThreeKnights', 'saveCurrentThreeKnights',
        'getCumulativeStats', 'getPointsBreakdown', 'getProgramSettings',
        'getWeeklyPointChampions', 'getLastCompletedWeekRange', 'applyGroupWinnerForDate']) {
        // Only the exact general undo and quick-entry guards are exempt.
        const current = source(name).replaceAll('\r\n', '\n');
        const quickGuard = "            if (isGeneralProgram()) { showToast('استعمل نموذج التسجيل الجديد', 'error'); return; }\n";
        const guard = "            if (isGeneralProgram() && generalUndoInProgress) { showToast('انتظر حتى ينتهي التراجع', 'error'); return; }\n";
        const goldenGuard = "            if (GOLDEN_BOARD_UNDER_REPAIR) { showToast('اللوحة الذهبية مغلقة للإصلاح', 'error'); return; }\n";
        const scoped = name === 'saveSmartMastery' ? current.replace(goldenGuard, '') : current;
        assert.equal(name === 'saveSmartProgress' ? scoped.replace(quickGuard, '').replace(guard, '') : scoped, source(name, baseline).replaceAll('\r\n', '\n'), name);
    }
    // Manager-requested validation message is the sole change to this save function.
    assert.equal(source('saveAttendanceEdit').replace("{ showToast('اختر حاضر أو غائب', 'error'); return; }", 'return;').replaceAll('\r\n', '\n'),
        source('saveAttendanceEdit', baseline).replaceAll('\r\n', '\n'));
    assert.equal(html.match(/const dayPoints = .*;/)[0], baseline.match(/const dayPoints = .*;/)[0]);
    for (const file of ['firestore.rules', 'programs-store.js', 'data-store.js', 'general-points.js']) {
        // الخطوة ٧ غيّرت افتراضي الذهبية والبومودورو في general فقط.
        let current = fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
        if (file === 'programs-store.js') current = current
            .replace('newMemorization: true, review: true, goldenBoard: false, attendance: true,', 'newMemorization: true, review: true, goldenBoard: true, attendance: true,')
            .replace('groups: false, pomodoro: false, tiers: false', 'groups: false, pomodoro: true, tiers: false');
        assert.equal(current,
            cp.execFileSync('git', ['show', `3df7524:${file}`], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n'), file);
    }
});
