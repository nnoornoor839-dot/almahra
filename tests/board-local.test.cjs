// §٣ من المسودة ٢: المفتاح ثابت، والدوال والميزان من الإنتاج، بلا شبكة.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { harness: quick, student, copy, source, html, root } = require('./helpers/quick-entry-harness.cjs');
const key = require('./rules/board-answer-key.json');
const tv = require('../tv.js');
const adhan = require('../vendor/adhan-4.4.3.umd.js');

test('قفل sha256: مفتاح اللوحة لا يتغير بعد اعتماده', () => {
    assert.equal(createHash('sha256').update(fs.readFileSync(root + '/tests/rules/board-answer-key.json')).digest('hex'),
        '94b98bdf821955dc7cd5d74c4dd6bcebf84d0a89acc62edf348099521823f497');
});
function harness(moment = 'monday') {
    const h = quick(student()), cutoff = moment === 'sunday' ? 3 : 5;
    Object.assign(h.state.settings, copy(key.settings)); h.state.calendar = copy(key.season);
    const list = key.students.map(s => ({ id: s.id, name: s.name, halaqaId: s.stage === 'primary' ? 'a' : 'b', history:
        Object.fromEntries(key.days.slice(0, cutoff).flatMap((date, i) => {
            const entries = s.entries[i]; if (entries === false) return [];
            if (entries === null) return [[date, { attended: false, absence: 'unexcused' }]];
            return [[date, { attended: true, criteriaPoints: s.criteria[i] || 0,
                entries: Object.fromEntries(entries.map((points, n) => ['e' + n, { kind: points === 7.5 || points <= 18 && points > 0 ? 'review' : 'new',
                    points, by: 'fake-admin', at: n + 1, grade: points === 0 ? 'repeat' : 'good', spec: { from: [2, 6], to: [2, 16] }, rep: 1 }])) }]];
        })) }));
    h.ctx.fixtures = list; h.ctx.fixedToday = key.snapshots[moment].today;
    h.run('students = fixtures; todayStr = fixedToday; generalQuickEntry.dateStr = fixedToday; let honorKnightsLog = [];');
    for (const name of ['snapQuarters', 'dayPoints']) h.run(html.match(new RegExp(`const ${name} = .*;`))[0]);
    h.install('densityFor', 'getCumulativeStats', 'generalAttendanceStart', 'getGeneralSchoolDates', 'getBoardDate', 'getBoardWeekRange',
        'getWorkingDatesInRange', 'addDaysToDateStr', 'summarizeRange', 'calculateStudentAttendance', 'getGeneralAttendanceEligibility', 'getBlockingCriteriaIds',
        'dayHasBlockingViolation', 'dayHasAnyViolation', 'getDisciplineCriteriaIds', 'dayMeetsDisciplineCriteria', 'getTitleRules',
        'getDayRanking', 'getDayTitleCandidates', 'getWeekTitleCandidates', 'getApprovedKnightsForMode', 'topTied', 'getMostImproved');
    h.ctx.sink = message => h.sent.push(copy(message)); h.sent = [];
    h.ctx.window.almahraData.isReady = () => true;
    h.ctx.window.almahraData.getActiveProgramId = () => 'general';
    h.ctx.window.almahraData.getActiveSeasonId = () => 's1';
    h.run('generalTv.enabled = true; generalTv.channel = { postMessage: sink }; generalTv.dataContext = generalTvContext()');
    h.list = list; h.snapshot = () => copy(h.run('getGeneralTvSnapshot()'));
    return h;
}

for (const moment of ['monday', 'sunday']) test('كل أرقام المفتاح وترتيبه وصفحاته: ' + moment, () => {
    const h = harness(moment), expected = key.snapshots[moment], actual = h.snapshot();
    assert.equal(actual.boardDate, expected.boardDate);
    const range = copy(h.run('getBoardWeekRange()'));
    assert.equal(range.startStr, expected.start); assert.equal(range.endStr, expected.boardDate);
    for (const period of ['asr', 'maghrib']) {
        const board = actual.stages.find(s => s.period === period).board, rows = expected[period];
        assert.deepEqual(board, rows.map(r => ({ name: key.students.find(s => s.id === r.id).name, points: r.points, week: r.week, rank: r.display })));
        h.ctx.period = period;
        assert.deepEqual(copy(h.run('getGeneralTvBoard(period).map(e => [e.student.id, e.rank])')), rows.map(r => [r.id, r.rank]));
        const slides = tv.makeSlides(actual, period).filter(s => s.kind === 'board');
        assert.equal(slides.length, period === 'asr' ? 2 : 1);
        for (const slide of slides) {
            assert.deepEqual(slide.items, rows.filter(r => r.page === slide.page).map(r => board[rows.indexOf(r)]));
            assert.equal(slide.pages, slides.length);
            assert.equal(slide.title, '🏆 لوحة النقاط — ' + actual.stages.find(s => s.period === period).name);
        }
        for (const r of rows) {
            h.ctx.id = r.id;
            assert.equal(h.run('getGeneralCelebrationRank(students.find(s => s.id === id))'), r.display);
        }
    }
    assert.doesNotMatch(JSON.stringify(actual), /"id"|"sid"|absence|attended|criteria|grade/);
});

test('كل يوم وأسبوع وموسم بالمفتاح: العلاوة خارج الصفر، والسجل لا يتغير', () => {
    const h = harness(), before = JSON.stringify(h.list);
    for (const s of key.students) {
        h.ctx.id = s.id;
        const actual = copy(h.run(`(() => { const s = students.find(s => s.id === id);
            return { daily: ${JSON.stringify(key.days)}.map(d => dayPoints(s.history[d]) + (s.history[d]?.attended ? 10 : 0)),
                season: getCumulativeStats(s).tripPoints,
                weeks: [['2026-11-15','2026-11-17'],['2026-11-22','2026-11-23']].map(([a,b]) => {
                    const v = summarizeRange(s, getWorkingDatesInRange(a,b)); return roundPointTotal(v.points + v.attended * 10); }) }; })()`));
        assert.deepEqual(actual, { daily: s.daily, season: s.season, weeks: [s.past, s.week] }, s.name);
        assert.equal(actual.weeks[0] + actual.weeks[1], actual.season);
    }
    assert.equal(JSON.stringify(h.list), before);
});

test('فرسان اليوم والأسبوع والنجم طلال؛ شرف المشرف يستبعد عشرة المجمع حرفياً', () => {
    const h = harness(), snapshot = h.snapshot();
    for (const stage of snapshot.stages) {
        assert.deepEqual(stage.dayKnights, []);
        assert.deepEqual(stage.weekKnights, []);
        assert.deepEqual(stage.risingStars, stage.period === 'asr' ? [{ name: 'طلال' }] : []);
    }
    const leaders = copy(h.run('getGeneralTvLeaders().map(e => e.student.id)'));
    assert.deepEqual(leaders, key.complexLeaders);
    assert.deepEqual(copy(h.run('getMostImproved(3).map(e => e.student.id)')), ['talal']);
    assert.deepEqual(copy(h.run("getMostImproved(3, 'asr').map(e => [e.student.id,e.growth])")), [['talal', key.rising.growth]]);
    // يكشف تغيير الاستبعاد من عشرة المجمع إلى عشرة الفترة في مسار المشرف.
    h.run("getGeneralTvBoard = () => { throw Error('شرف المشرف لا يستعمل عشرة الفترة'); }");
    assert.deepEqual(copy(h.run('getMostImproved(3).map(e => e.student.id)')), ['talal']);
    assert.match(source('renderHonorBoard'), /getMostImproved\(isGeneralProgram\(\) \? 3 : 5\)/);
});

test('الاحتفال +22.5 لماجد، زياد الثالث ولو كان الأخير، والإلغاء والتراجع يبقيان 10', async () => {
    const h = harness();
    for (const id of ['majed', 'ziyad']) {
        h.ctx.id = id; h.ctx.added = key.celebrations[id].added;
        h.run('sendGeneralTvCelebration(students.find(s => s.id === id), added)');
        const { type, id: eventId, name, ...actual } = h.sent.at(-1);
        assert.equal(type, 'celebrate'); assert.ok(eventId); assert.deepEqual(actual, { ...key.celebrations[id], prep: false });
    }
    h.run("cancelGeneralTvCelebration(students.find(s => s.id === 'majed'))");
    assert.equal(h.sent.at(-1).type, 'cancel'); assert.equal(h.sent.at(-1).id, h.sent[0].id);
    // مسار التراجع الحقيقي، مع معرّف الطالب الذي تستعمله نافذة الحفظ.
    const majed = h.list.find(s => s.id === 'majed'); majed.id = 1;
    h.run('currentEditingStudentId = 1');
    await h.run('undoLastGeneralEntry()');
    assert.equal(Object.keys(majed.history[key.today].entries).length, 0);
    const row = h.snapshot().stages[0].board.find(r => r.name === 'ماجد');
    assert.equal(row.points, key.undo.points); assert.equal(row.week, key.undo.week); assert.equal(row.rank, null);
    assert.equal(h.run("getGeneralTvBoard('asr').find(e => e.student.name === 'ماجد').rank"), key.undo.rank);
});

test('الأحد قبل الورقة يبقي الأسبوع الماضي؛ أول حضور يصفّر العمود لبقية الطلاب', () => {
    const h = harness('sunday');
    h.list.find(s => s.id === 'khalid').history['2026-11-22'] = { attended: true, entries: { e: { points: 22.5 } } };
    const snapshot = h.snapshot(); assert.equal(snapshot.boardDate, '2026-11-22');
    for (const row of snapshot.stages.flatMap(s => s.board)) assert.equal(row.week, row.name === 'خالد' ? 32.5 : 0);
});

test('تبديل الساعة بالمغرب والعودة +20 ومنتصف الليل، بلا لقطة جديدة أو احتفال من الفترة الأخرى', () => {
    const snapshot = harness().snapshot(), changes = [];
    const state = tv.createTvState({ schedule: () => 1, unschedule() {}, changed: () => changes.push(state.view()) });
    const setTime = instant => { const periods = tv.prayerPeriods(adhan, tv.riyadhDate(new Date(instant)));
        state.setPeriod(tv.boardPeriod(periods, instant), tv.riyadhDate(new Date(instant)));
        state.setPrayer(tv.activePrayer(periods, instant)); };
    const periods = tv.prayerPeriods(adhan, key.today), maghrib = periods[0].start;
    setTime(maghrib - 1); state.receive(snapshot);
    const celebrate = (id, period) => state.receive({ type: 'celebrate', id, period, name: 'وهمي', added: 22.5, total: 32.5, rank: null });
    celebrate('other', 'maghrib'); assert.equal(state.view().current, null);
    celebrate('current', 'asr'); celebrate('queued', 'asr'); assert.equal(state.view().pending, 1);
    setTime(maghrib); assert.equal(state.view().period, 'maghrib'); assert.equal(state.view().prayer, 'المغرب');
    assert.equal(state.view().current, null); assert.equal(state.view().pending, 0);
    setTime(periods[0].end); assert.equal(state.view().prayer, null); assert.match(state.view().slides[0].title, /متوسط وثانوي/);
    celebrate('saad-late', 'asr'); assert.equal(state.view().current, null);
    setTime(+new Date('2026-11-23T23:59:59+03:00')); celebrate('night', 'maghrib'); celebrate('wait', 'maghrib');
    setTime(+new Date('2026-11-24T00:00:00+03:00'));
    assert.equal(state.view().period, 'asr'); assert.equal(state.view().current, null); assert.equal(state.view().pending, 0);
    assert.match(state.view().slides[0].title, /ابتدائي/); assert.equal(state.view().snapshot, snapshot); assert.ok(changes.length);
});

test('ثلاث مراحل: لوحة مغرب واحدة مدموجة برتب مشتركة وفارسين', () => {
    const h = harness();
    h.state.settings.stages[1].name = 'متوسط';
    h.state.settings.stages.push({ id: 'secondary', name: 'ثانوي', period: 'maghrib' });
    h.state.settings.halaqas.push({ id: 'c', stageId: 'secondary', active: true });
    h.list.find(s => s.id === 'ziyad').halaqaId = 'c';
    const snapshot = h.snapshot(), stage = snapshot.stages.find(s => s.period === 'maghrib');
    assert.equal(snapshot.stages.length, 2); assert.equal(stage.name, 'متوسط وثانوي');
    assert.deepEqual(stage.board.map(r => [r.name,r.rank]), [['أحمد',1],['يوسف',2],['زياد',3]]);
    assert.deepEqual(stage.dayKnights, []);
    assert.deepEqual(stage.weekKnights, []);
    assert.deepEqual(stage.risingStars, []);
    assert.equal(h.run("getGeneralCelebrationRank(students.find(s => s.id === 'ziyad'))"), 3);
    assert.equal(tv.makeSlides(snapshot, 'maghrib').filter(s => s.kind === 'board').length, 1);
    h.list.find(s => s.id === 'ziyad').halaqaId = 'off';
    h.state.settings.halaqas.push({ id: 'off', stageId: 'secondary', active: false });
    assert.equal(h.run("getGeneralTvPeriod(students.find(s => s.id === 'ziyad'))"), null);
});
