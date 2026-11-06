// بلا شبكة، بطلاب وهميين وتقويم الموسم وشكل الإعدادات الحقيقيين.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const cp = require('node:child_process');
const path = require('node:path');
const { harness: rawQuickHarness, student, copy, source, html, root } = require('./helpers/quick-entry-harness.cjs');
const quickHarness = (s = student({}, { frontierFix: { surah: null, ayah: null, at: 0 } })) => rawQuickHarness(s);
const { installTv } = require('./helpers/tv-harness.cjs');
const adhan = require('../vendor/adhan-4.4.3.umd.js');
const tv = require('../tv.js');
const base = cp.execFileSync('git', ['show', '0f1c43e:index.html'], { cwd: root, encoding: 'utf8' });

function board(list = [], text = html) {
    const state = { program: 'general', seasonId: 's1', ready: true, sent: [], timers: [], settings: {
        points: { attendance: 0 }, stages: [{ id: 'a', name: 'مرحلة أولى', period: 'asr' }, { id: 'b', name: 'مرحلة ثانية', period: 'maghrib' }],
        halaqas: [{ id: 'ha', stageId: 'a', active: true }, { id: 'hb', stageId: 'b', active: true }],
        grades: [], kindMult: {}, absence: [], criteria: [], workingDays: [0, 1, 2, 3, 4], features: { tiers: false } },
        season: { termStart: '2026-10-01', termEnd: '2026-12-31', calendar: [] },
        daily: {}, weekly: {}, approved: [], cards: {} };
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
        showToast: msg => { state.toast = msg; } });
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
    return { state, ctx, run, install, element, list,
        snapshot: () => copy(run('getGeneralTvSnapshot()')),
        connect() { ctx.sink = message => state.sent.push(copy(message)); run('generalTv.channel = { postMessage: sink }; generalTv.dataContext = generalTvContext(); enableGeneralTv()'); } };
}

test('three-part display names normalize spaces, join عبد in every position, and disambiguate only with fourth initial', () => {
    const h = board();
    const name = (full, all = [full]) => { h.ctx.full = full; h.ctx.names = all; return h.run('tvDisplayName(full, names)'); };
    assert.equal(name('  أحمد   محمد علي  الزهراني '), 'أحمد محمد علي');
    for (const compound of ['عبد الرحمن', 'عبد الله']) {
        assert.equal(name(`${compound} محمد علي الفلاني`), `${compound} محمد علي`);
        assert.equal(name(`أحمد ${compound} علي الفلاني`), `أحمد ${compound} علي`);
        assert.equal(name(`أحمد محمد ${compound} الفلاني`), `أحمد محمد ${compound}`);
    }
    assert.equal(name('عبدالله محمد علي الفلاني'), 'عبدالله محمد علي');
    assert.equal(name(' أحمد  علي '), 'أحمد علي'); assert.equal(name(''), '');
    const names = ['أحمد محمد علي عابد', 'أحمد محمد علي خالد'];
    assert.equal(name(names[0], names), 'أحمد محمد علي ع.'); assert.equal(name(names[1], names), 'أحمد محمد علي خ.');
    const families = ['أحمد علي حسن العتيبي', 'أحمد علي حسن الزهراني', 'أحمد علي حسن خالد', 'أحمد علي حسن ال'];
    assert.equal(name(families[0], families), 'أحمد علي حسن ع.');
    assert.equal(name(families[1], families), 'أحمد علي حسن ز.');
    assert.equal(name(families[2], families), 'أحمد علي حسن خ.');
    assert.equal(name(families[3], families), 'أحمد علي حسن ا.');
});

test('general competition rank skips ties, includes rank-ten ties, and hides ranks after ten', () => {
    const h = board([100, 100, 90, 80, 70, 60, 50, 40, 30, 20, 20, 10, 10].map((points, id) => ({ id, name: `وهمي طالب رقم${id}`, points })));
    assert.deepEqual(copy(h.run('students.map(s => getStudentRank(s.id))')), [1, 1, 3, 4, 5, 6, 7, 8, 9, 10, 10, 12, 12]);
    assert.equal(h.run('getGeneralTvLeaders().length'), 11);
    assert.deepEqual(copy(h.run('students.slice(-2).map(getGeneralCelebrationRank)')), [null, null]);
    const single = board([{ id: 1, points: 0 }]); assert.equal(single.run('getGeneralCelebrationRank(students[0])'), null);
    single.list[0].points = 10; assert.equal(single.run('getGeneralCelebrationRank(students[0])'), 1);
    for (const program of ['summer', 'review-day']) {
        h.state.program = program;
        h.run(source('getStudentRank', base).replace('function getStudentRank(', 'function oldRank('));
        assert.deepEqual(copy(h.run('students.map(s => getStudentRank(s.id))')), copy(h.run('students.map(s => oldRank(s.id))')));
    }
});

test('rising stars exclude all leaders before taking three; no previous attendance or positive average means no star', () => {
    const list = Array.from({ length: 15 }, (_, id) => ({ id, name: `طالب وهمي ${id}`, points: 100 - id,
        history: { '2026-11-01': { attended: true }, '2026-10-25': { attended: true } },
        now: { points: 100 - id, attended: 1 }, past: { points: 1, attended: 1 } }));
    const h = board(list);
    assert.deepEqual(copy(h.run('getMostImproved(20).map(e => e.student.id)')), [10, 11, 12]);
    list[10].past.attended = 0; list[11].past.points = 0;
    assert.deepEqual(copy(h.run('getMostImproved().map(e => e.student.id)')), [12, 13, 14]);
    h.run('getMostImproved = () => []'); h.run('renderHonorBoard()');
    assert.match(h.element('hbProgress').innerHTML, /لا متقدّمين هذا الأسبوع/);
    assert.equal(h.state.cards.hbCardProgress.title, 'النجم الصاعد');
    for (const program of ['summer', 'review-day']) {
        const a = board(list), b = board(list, base); a.state.program = b.state.program = program;
        assert.deepEqual(copy(a.run('getMostImproved()')), copy(b.run('getMostImproved()')));
        assert.equal(a.run('getMostImproved().length'), 5);
        if (program === 'summer') {
            a.run('getMostImproved = () => []'); b.run('getMostImproved = () => []');
            a.run('renderHonorBoard()'); b.run('renderHonorBoard()');
            assert.equal(a.element('hbProgress').innerHTML, b.element('hbProgress').innerHTML);
            assert.equal(a.state.cards.hbCardProgress.title, 'صدارة الموسم');
        }
    }
});

test('board date uses season calendar and recorded attendance, skipping empty days, holidays and future; summer stays identical', () => {
    const h = board([{ id: 1, history: { '2026-11-01': { attended: true }, '2026-11-02': { attended: false },
        '2026-11-03': { attended: true }, '2026-11-06': { attended: true } } }]);
    assert.equal(h.run('Object.hasOwn(getProgramSettings(), "features")'), false);
    h.state.season.calendar.push({ id: 'holiday', from: '2026-11-03', to: '2026-11-03', name: 'وهمية' });
    assert.equal(h.run('getBoardDate()'), '2026-11-01');
    delete h.list[0].history['2026-11-01']; assert.equal(h.run('getBoardDate()'), null);
    for (const program of ['summer', 'review-day']) {
        h.state.program = program;
        h.run(source('getBoardDate', base).replace('function getBoardDate(', 'function oldBoardDate('));
        assert.equal(h.run('getBoardDate()'), h.run('oldBoardDate()'));
    }
});

test('snapshot has exactly allowed keys, approved crowned first only, per-stage fallback, tied automatic winners and no private fields', () => {
    const list = [1, 2, 3].map(id => ({ id, sid: `sid-${id}`, phone: '0500000000', grade: 'secret-grade', stage: 'private-stage',
        name: `طالب وهمي ثالث${id} عائلة`, points: id * 5, history: { '2026-11-01': { attended: true } } }));
    const h = board(list);
    h.run('getMostImproved = () => [{ student: students[2], growth: 50 }]');
    const candidate = s => ({ student: s, points: 10, achievement: 'secret-achievement' });
    h.state.daily = { a: list.map(candidate), b: [candidate(list[1]), candidate(list[2])] };
    h.state.weekly = { a: [candidate(list[2])], b: [] };
    h.state.approved.push({ dateStr: '2026-11-01', mode: 'a', fars: [list[0], list[1], list[2]].map(s => ({ ...s, achievement: 'secret-achievement' })) });
    const s = h.snapshot();
    assert.deepEqual(Object.keys(s).sort(), ['type', 'boardDate', 'prayer', 'stages'].sort());
    assert.deepEqual(Object.keys(s.prayer).sort(), ['ishaMinutes', 'maghribMinutes']);
    for (const stage of s.stages) {
        assert.deepEqual(Object.keys(stage).sort(), ['name', 'period', 'board', 'dayKnights', 'weekKnights', 'risingStars'].sort());
        for (const e of stage.board) assert.deepEqual(Object.keys(e).sort(), ['name', 'points', 'rank', 'week']);
        for (const e of [...stage.dayKnights, ...stage.weekKnights]) assert.deepEqual(Object.keys(e).sort(), ['names', 'stage']);
        for (const e of stage.risingStars) assert.deepEqual(Object.keys(e), ['name']);
    }
    assert.deepEqual(s.stages.flatMap(s => s.dayKnights), [{ stage: 'مرحلة أولى', names: ['طالب وهمي ثالث1'] }, { stage: 'مرحلة ثانية', names: ['طالب وهمي ثالث2', 'طالب وهمي ثالث3'] }]);
    assert.doesNotMatch(JSON.stringify(s), /sid-|0500000000|secret|private-stage|"id"|"sid"|عائلة/);
    assert.deepEqual(s.prayer, { maghribMinutes: 20, ishaMinutes: 30 });
    h.state.settings.tvPrayer = { maghribMinutes: 15, ishaMinutes: 40 };
    assert.deepEqual(h.snapshot().prayer, h.state.settings.tvPrayer);
    h.state.approved.splice(0); assert.equal(h.snapshot().stages[0].dayKnights[0].names.length, 3);
    h.state.approved.push({ dateStr: '2026-11-01', mode: 'all', fars: [list[1]] });
    assert.deepEqual(h.snapshot().stages.flatMap(s => s.dayKnights), [
        { stage: 'مرحلة أولى', names: ['طالب وهمي ثالث1', 'طالب وهمي ثالث2', 'طالب وهمي ثالث3'] },
        { stage: 'مرحلة ثانية', names: ['طالب وهمي ثالث2', 'طالب وهمي ثالث3'] }]);
});

test('supervisor never builds an unsolicited snapshot; opening is synchronous, popup blocking shows toast, hello reconnects and heartbeat is 30s', () => {
    const h = board(); let calls = 0;
    h.run('getGeneralTvSnapshot = () => { throw Error("unsolicited"); }');
    h.run('sendGeneralTvSnapshot()'); assert.equal(h.state.sent.length, 0);
    h.ctx.window.open = (...args) => { calls++; assert.deepEqual(args, ['tv.html', 'almahra-tv']); return null; };
    h.run('openGeneralTv()'); assert.equal(calls, 1); assert.equal(h.state.toast, 'اسمح بالنوافذ المنبثقة لهذا الموقع');
    h.run(source('getGeneralTvSnapshot'));
    h.ctx.BroadcastChannel = class { constructor(name) { assert.equal(name, 'almahra-tv'); h.state.channel = this; } postMessage(msg) { h.state.sent.push(copy(msg)); } };
    h.run('generalTv.dataContext = generalTvContext(); initGeneralTv()');
    h.state.channel.onmessage({ data: { type: 'hello' } });
    assert.equal(h.state.sent.at(-1).type, 'snapshot'); assert.equal(h.state.timers[0].ms, 30000);
    h.state.ready = false; const count = h.state.sent.length; h.state.timers[0].fn(); assert.equal(h.state.sent.length, count);
    h.run('clearGeneralTv()'); assert.equal(h.state.sent.at(-1).type, 'clear');
    h.state.ready = true; h.state.seasonId = 's2';
    const clearedCount = h.state.sent.length;
    h.run('sendGeneralTvSnapshot()'); assert.equal(h.state.sent.length, clearedCount);
    h.run('generalTv.dataContext = generalTvContext(); sendGeneralTvSnapshot()');
    assert.equal(h.state.sent.at(-1).type, 'snapshot');
    h.run('generalTv.lastHello = Date.now() - 90000'); h.state.timers[0].fn();
    assert.equal(h.run('generalTv.enabled'), false);
    assert.match(html, /addEventListener\('pagehide',.*type: 'bye'/);
    assert.match(source('logoutWithGeneralTv'), /await almahraLogout\(\)/);
});

test('general archived season retains a reachable honor board and its read-only TV button', () => {
    const h = board(); h.ctx.updateProgramBrand = () => {}; h.ctx.escapeHTML = String;
    h.ctx.window.almahraPrograms.isCurrentSeasonArchived = () => h.state.archived;
    h.install('updateCurrentEventBadge');
    for (const program of ['general', 'summer', 'review-day']) for (const archived of [true, false]) {
        h.state.program = program; h.state.archived = archived; h.run('updateCurrentEventBadge()');
        assert.equal(h.element('generalArchivedHonorButton').classList.hidden, program !== 'general' || !archived);
    }
    h.state.program = 'general'; h.state.archived = true; h.run('renderHonorBoard()');
    assert.equal(h.element('generalTvButton').classList.hidden, false);
    assert.match(html, /id="generalArchivedHonorButton" onclick="openHonorBoard\(\)"/);
    assert.doesNotMatch(source('openGeneralTv'), /canWrite|Archived|isWriteLocked/);
});

function connectQuick(h) {
    const sent = []; h.ctx.sink = msg => sent.push(copy(msg));
    h.ctx.window.almahraData.isReady = () => true;
    h.ctx.window.almahraData.getActiveProgramId = () => h.state.program;
    h.ctx.window.almahraData.getActiveSeasonId = () => h.state.season;
    h.run('generalTv.channel = { postMessage: sink }; generalTv.enabled = true; generalTv.lastHello = Date.now(); generalTv.dataContext = generalTvContext()');
    // اللقطة مفحوصة مستقلاً؛ هنا نراقب مسار نجاح الحفظ والتراجع الحقيقيين.
    h.ctx.sendGeneralTvSnapshot = () => {};
    return sent;
}
test('real quick save celebrates only after cloud success, never failed, zero or missed; successful undo cancels the same id', async () => {
    const h = quickHarness(), sent = connectQuick(h);
    h.range('new', [114, 1], [114, 6]); h.grade('new'); h.preview();
    let release; h.state.pending = new Promise(resolve => { release = resolve; });
    const pending = h.save(); assert.equal(sent.length, 0);
    release({ success: true }); await pending;
    assert.equal(sent.length, 1); assert.equal(sent[0].type, 'celebrate');
    assert.deepEqual(Object.keys(sent[0]).sort(), ['type', 'id', 'name', 'added', 'total', 'rank', 'period'].sort());
    h.state.pending = null; await h.run('undoLastGeneralEntry()');
    assert.deepEqual(sent[1], { type: 'cancel', id: sent[0].id });
    for (const mode of ['failed', 'zero', 'missed']) {
        const q = quickHarness(student({}, { history: {}, frontierFix: { surah: null, ayah: null, at: 0 } })), messages = connectQuick(q);
        if (mode === 'missed') { q.ctx.date = '2026-11-05'; q.run('todayStr = date'); q.reopen(); q.run("selectGeneralQuickDate('2026-11-01')"); }
        if (mode === 'zero') { q.state.settings.points = { attendance: 0 }; q.range('new', [114, 1], [114, 6]); q.grade('new', 'repeat'); }
        else { q.range('new', [114, 1], [114, 6]); q.grade('new'); }
        q.preview(); if (mode === 'failed') q.state.pending = Promise.resolve({ success: false, error: 'وهمي' });
        await q.save(); assert.equal(messages.length, 0, mode);
    }
});

test('save and undo each send one snapshot via updateAllUIs; honor board renders never send another', async () => {
    const h = quickHarness(), sent = connectQuick(h);
    // نعزل رسم الواجهات فقط، ونشغّل الإرسال والتحديث والحفظ والتراجع الفعلية.
    for (const name of ['updateSchoolCalendarAlert', 'updateGeneralAttendanceUI', 'renderCompactTripGrid',
        'renderStudentsGrid', 'renderSettingsStudents', 'renderReportsTable', 'processRealClockPomodoro',
        'updateThreeKnightsSelects', 'renderExamEntryList', 'renderExamResultsReport', 'renderHomeDashboard']) h.ctx[name] = () => {};
    h.ctx.getGeneralTvSnapshot = () => ({ type: 'snapshot' });
    h.install('sendGeneralTvSnapshot', 'updateAllUIs');
    h.range('new', [114, 1], [114, 6]); h.grade('new'); h.preview();
    let release; h.state.pending = new Promise(resolve => { release = resolve; });
    const pending = h.save(); assert.equal(sent.length, 0);
    release({ success: true }); await pending;
    assert.deepEqual(sent.map(m => m.type), ['snapshot', 'celebrate']);
    const eventId = sent[1].id;
    sent.length = 0; h.state.pending = null;
    await h.run('undoLastGeneralEntry()');
    assert.deepEqual(sent, [{ type: 'cancel', id: eventId }, { type: 'snapshot' }]);

    const b = board(); b.connect();
    b.run('renderHonorBoard(); renderHonorBoard()');
    assert.deepEqual(b.state.sent, []);
});

test('prayer settings validate integer 5–90 and defaults are absent from PROGRAM_DEFS and migration', () => {
    const h = board();
    for (const value of ['', '4', '91', '20.5', 'NaN']) {
        h.element('psTvMaghrib').value = value; h.element('psTvIsha').value = '30';
        assert.throws(() => h.run('readGeneralTvPrayer()'), /٥ إلى ٩٠/);
    }
    h.element('psTvMaghrib').value = '5'; h.element('psTvIsha').value = '90';
    assert.deepEqual(copy(h.run('readGeneralTvPrayer()')), { maghribMinutes: 5, ishaMinutes: 90 });
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'programs-store.js'), 'utf8'), /tvPrayer/);
});

function tvHarness() {
    let time = 0; const timers = [];
    const state = tv.createTvState({ now: () => time, schedule: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, unschedule() {} });
    state.receive({ type: 'snapshot', stages: [{ period: 'asr', board: [{ name: 'وهمي', points: 1, week: 1, rank: 1 }] }] });
    return { state, timers, time: n => { time = n; }, event: id => state.receive({ type: 'celebrate', id, period: 'asr', name: 'وهمي', added: 1, total: 1, rank: null }) };
}
test('celebration queue deduplicates ids, cancels waiting/current and stale timer cannot close successor; prayer drops and clears queue', () => {
    const h = tvHarness(); h.event('a'); h.event('a'); h.event('b'); h.event('c');
    assert.equal(h.state.view().pending, 2); assert.equal(h.timers[0].ms, 7000);
    h.state.receive({ type: 'cancel', id: 'b' }); assert.equal(h.state.view().pending, 1);
    h.state.receive({ type: 'cancel', id: 'a' }); assert.equal(h.state.view().current.id, 'c');
    h.timers[0].fn(); assert.equal(h.state.view().current.id, 'c'); h.timers[1].fn(); assert.equal(h.state.view().current, null);
    h.event('d'); h.event('e'); h.state.setPrayer('المغرب'); h.event('f');
    h.state.receive({ type: 'snapshot', leaders: [{ name: 'جديد', points: 2, rank: 1 }] });
    assert.equal(h.state.view().current, null); assert.equal(h.state.view().pending, 0);
    assert.equal(h.state.view().snapshot.leaders[0].name, 'جديد');
    h.state.setPrayer(null); h.event('f'); assert.equal(h.state.view().current, null);
    h.event('g'); assert.equal(h.state.view().current.id, 'g');
});
test('90 seconds without received message, bye or clear erase names; a snapshot restores slides without celebration', () => {
    const h = tvHarness(); h.event('a'); h.time(89999); h.state.checkConnection(); assert.ok(h.state.view().snapshot);
    h.time(90000); h.state.checkConnection(); assert.equal(h.state.view().snapshot, null); assert.equal(h.state.view().current, null);
    for (const type of ['bye', 'clear']) {
        h.state.receive({ type: 'snapshot', stages: [{ period: 'asr', risingStars: [{ name: 'وهمي' }] }] }); assert.equal(h.state.view().slides.length, 1);
        assert.equal(h.state.view().current, null); h.state.receive({ type }); assert.equal(h.state.view().snapshot, null);
    }
});
test('slides skip empty sections, paginate board before knights and stars, and pause under overlays', () => {
    assert.deepEqual(tv.makeSlides({}), []);
    const snapshot = { stages: [{ period: 'asr', name: 'أ', board: Array.from({ length: 24 }, () => ({ name: 'وهمي', rank: null, week: 1, points: 1 })), dayKnights: [{ stage: 'أ', names: [] }, { stage: 'ب', names: ['وهمي'] }],
        weekKnights: [{ stage: 'ب', names: ['وهمي'] }], risingStars: Array.from({ length: 5 }, () => ({ name: 'وهمي' })) }] };
    const slides = tv.makeSlides(snapshot, 'asr');
    assert.deepEqual(slides.map(s => s.kind), ['board', 'board', 'dayKnights', 'weekKnights', 'risingStars']);
    assert.deepEqual(slides.slice(0, 2).flatMap(s => s.items), snapshot.stages[0].board); assert.equal(slides.at(-1).items.length, 3);
    const h = tvHarness(); h.state.receive({ type: 'snapshot', ...snapshot }); h.state.advance(); assert.equal(h.state.view().slide, 1);
    h.event('a'); h.state.advance(); assert.equal(h.state.view().slide, 1);
    h.state.setPrayer('العشاء'); h.state.advance(); assert.equal(h.state.view().slide, 1);
});
test('prayer periods equal adhan directly, with inclusive start/exclusive minute end and Riyadh civil day regardless of device zone', () => {
    const date = '2026-11-01', periods = tv.prayerPeriods(adhan, date);
    const direct = new adhan.PrayerTimes(new adhan.Coordinates(20.14804, 40.27224), new Date(2026, 10, 1, 12), adhan.CalculationMethod.UmmAlQura());
    assert.equal(periods[0].start, +direct.maghrib); assert.equal(periods[1].start, +direct.isha);
    for (const [i, duration] of [[0, 20], [1, 30]]) {
        const p = periods[i]; assert.equal(p.end - p.start, duration * 60000);
        assert.equal(tv.activePrayer(periods, p.start - 1), null); assert.equal(tv.activePrayer(periods, p.start), p.name);
        assert.equal(tv.activePrayer(periods, p.end - 1), p.name); assert.equal(tv.activePrayer(periods, p.end), null);
    }
    const minutes = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(direct.maghrib).split(':').reduce((h, m) => Number(h) * 60 + Number(m)));
    assert.ok(minutes >= 17 * 60 + 30 && minutes <= 18 * 60 + 15);
    assert.equal(tv.prayerPeriods(adhan, date, { maghribMinutes: 5, ishaMinutes: 90 })[1].end, +direct.isha + 90 * 60000);
    assert.equal(tv.riyadhDate(new Date('2026-11-01T21:01:00Z')), '2026-11-02');
    const script = "const tv=require('./tv.js'),a=require('./vendor/adhan-4.4.3.umd.js');process.stdout.write(JSON.stringify(tv.prayerPeriods(a,tv.riyadhDate(new Date('2026-11-01T21:01:00Z')))))";
    const results = ['Pacific/Honolulu', 'Asia/Tokyo', 'America/New_York'].map(TZ => cp.execFileSync(process.execPath, ['-e', script], { cwd: root, env: { ...process.env, TZ }, encoding: 'utf8' }));
    assert.equal(new Set(results).size, 1);
});
test('TV page has only two local scripts, no storage/cloud/external resources or HTML injection, and all constrained production code stays untouched', () => {
    const page = fs.readFileSync(path.join(root, 'tv.html'), 'utf8'), js = fs.readFileSync(path.join(root, 'tv.js'), 'utf8');
    assert.deepEqual([...page.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]), ['vendor/adhan-4.4.3.umd.js', 'tv.js']);
    assert.doesNotMatch(page + js, /localStorage|firebase|https?:|innerHTML|insertAdjacentHTML|document\.write/);
    assert.match(js, /textContent = event\.name/); assert.match(js, /requestFullscreen/); assert.match(js, /visibilitychange/);
    for (const name of ['commitGeneralStudentPatch', 'buildEntryPatch']) assert.equal(source(name), source(name, base).replaceAll('\r\n', '\n'));
    assert.match(source('saveGeneralQuickEntry'), /if \(!missed && calculation.total > 0\) sendGeneralTvCelebration/);
    for (const file of ['firestore.rules', 'programs-store.js', 'data-store.js', 'general-points.js']) {
        const original = cp.execFileSync('git', ['show', `0f1c43e:${file}`], { cwd: root });
        assert.equal(fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n'), original.toString('utf8').replaceAll('\r\n', '\n'));
    }
});

test('actual TV browser script boots offline, renders message text literally and checks prayer immediately on visibility change', () => {
    let instant = new Date('2026-11-01T12:00:00Z');
    class Clock extends Date { constructor(...args) { super(...(args.length ? args : [+instant])); } static now() { return +instant; } }
    const listeners = {}, elements = new Map(), intervals = [];
    const node = () => ({ children: [], style: {}, hidden: false, textContent: '', classList: { toggle() {} },
        append(...children) { this.children.push(...children); }, replaceChildren() { this.children = []; }, setAttribute() {} });
    const el = id => { if (!elements.has(id)) elements.set(id, node()); return elements.get(id); };
    const document = { getElementById: el, createElement: node, addEventListener: (name, fn) => { listeners[name] = fn; } };
    let channel;
    const ctx = vm.createContext({ document, Date: Clock, Intl, adhan, setTimeout() {}, clearTimeout() {},
        setInterval: (fn, ms) => { intervals.push({ fn, ms }); },
        BroadcastChannel: class { constructor(name) { assert.equal(name, 'almahra-tv'); channel = this; this.sent = []; } postMessage(data) { this.sent.push(data); } } });
    vm.runInContext(fs.readFileSync(path.join(root, 'tv.js'), 'utf8'), ctx);
    assert.equal(channel.sent[0].type, 'hello'); assert.equal(el('neutral').hidden, false);
    const snapshot = { type: 'snapshot', boardDate: '2026-10-29', prayer: { maghribMinutes: 35, ishaMinutes: 40 },
        stages: [{ name: 'ابتدائي', period: 'asr', board: [{ name: '<img src=x onerror=alert(1)>', points: 7, week: 7, rank: 1 },
            ...Array.from({ length: 12 }, (_, i) => ({ name: `طالب وهمي ${i}`, points: 1, week: 1, rank: 10 }))] }] };
    channel.onmessage({ data: snapshot });
    assert.equal(el('slides').children.length, 1);
    const board = el('slides').children[0].children[2];
    assert.equal(board.children.length, 2);
    assert.equal(board.children[0].children.length, 11);
    const row = board.children[0].children[1];
    assert.equal(row.children[1].textContent, snapshot.stages[0].board[0].name);
    assert.match(el('resultsDate').textContent, /29-10/);
    channel.onmessage({ data: { type: 'celebrate', id: 'one', period: 'asr', name: '<script>literal</script>', added: 5, total: 12, rank: null } });
    assert.equal(el('celeName').textContent, '<script>literal</script>'); assert.equal(el('celeRank').textContent, '');
    channel.onmessage({ data: { type: 'cancel', id: 'one' } }); assert.equal(el('celebration').hidden, true);
    const maghrib = tv.prayerPeriods(adhan, '2026-11-01')[0].start;
    instant = new Date(maghrib + 25 * 60000); listeners.visibilitychange();
    assert.equal(el('prayer').hidden, false); assert.equal(el('content').hidden, true); assert.equal(el('fullscreen').hidden, true);
    channel.onmessage({ data: { type: 'clear' } });
    // انقطاع المشرف لا يختصر مدة الصلاة التي وصلت في آخر لقطة.
    assert.equal(el('prayer').hidden, false);
    channel.onmessage({ data: { ...snapshot, leaders: [{ name: 'جديد وهمي', points: 9, rank: 1 }] } });
    channel.onmessage({ data: { type: 'celebrate', id: 'during-prayer', name: 'يسقط', added: 5, total: 12, rank: 1 } });
    instant = new Date(maghrib + 35 * 60000); listeners.visibilitychange();
    assert.equal(el('prayer').hidden, true); assert.equal(el('celebration').hidden, true); assert.equal(el('content').hidden, false);
    instant = new Date(+instant + 90000); intervals.find(timer => timer.ms === 1000).fn();
    assert.equal(el('neutral').hidden, false); assert.equal(el('slides').children.length, 0);
});
