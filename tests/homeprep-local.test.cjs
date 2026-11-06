// Fixed owner answer key; production functions and the real Quran measure.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const { harness: quick, student, copy, source, html, root, QuranMeasure, generalEntryPoints } = require('./helpers/quick-entry-harness.cjs');
const key = require('./rules/homeprep-answer-key.json');
const tv = require('../tv.js');

test('homeprep fixed answer key sha256', () => {
    assert.equal(createHash('sha256').update(fs.readFileSync(root + '/tests/rules/homeprep-answer-key.json')).digest('hex'),
        '04ff5202829c63859b5a75437de866ea90b5e42d388d36b576ccdae5bac9a8f5');
    assert.match(html, /const HOMEPREP_SCOPE = 'all';/);
    assert.match(html, /const HOMEPREP_MIN_PERCENT = 75;/);
});
function entry(kind, page, grade, at = 1) {
    const spec = copy(key.pages[page]);
    const measured = QuranMeasure.measure({ spec });
    assert.equal(measured.lines, 15, 'only the exact 15-line passages from the key');
    const score = generalEntryPoints({ lines: measured.lines, kind, gradeId: grade, settings: key.settings });
    return { kind, grade, spec, iv: measured.intervals, mult: score.mult, points: score.points, rep: 1, at, by: 'fake-admin' };
}
function fixture(row) {
    let page = 5;
    const history = {};
    row.days.forEach((code, i) => {
        if (code === '—') return;
        const date = key.days[i];
        if (code === 'غ') { history[date] = { attended: false, absence: 'unexcused' }; return; }
        const day = history[date] = { attended: true, entries: {}, criteria: {}, criteriaPoints: 0 };
        for (const token of code.split('+')) {
            if (token === 'ض5' || token === '🏠') {
                const id = token === '🏠' ? 'homeprep' : 'early';
                day.criteria[id] = token === '🏠' ? 10 : 5; day.criteriaPoints += day.criteria[id];
            } else if (token !== 'ح') {
                const kind = token.startsWith('ج') ? 'new' : 'review';
                const grade = token === 'جج' ? 'very-good' : ['ج', 'مج'].includes(token) ? 'good' : 'excellent';
                day.entries['e' + Object.keys(day.entries).length] = entry(kind, kind === 'new' ? page++ : 4, grade, Object.keys(day.entries).length + 1);
            }
        }
    });
    return student({}, { id: row.id, sid: 'synthetic-' + row.id, name: row.name, direction: 'down',
        halaqaId: row.stage === 'primary' ? 'a' : 'b', lastSurah: 2, lastAyah: 24, history });
}
function harness(scope = 'all') {
    const list = key.students.map(fixture), h = quick(list[0]);
    Object.assign(h.state.settings, copy(key.settings)); h.state.calendar = copy(key.season);
    h.ctx.fixtures = list; h.ctx.fixedToday = key.today;
    h.run('students = fixtures; todayStr = fixedToday; currentEditingStudentId = 1; let honorKnightsLog = [];');
    for (const name of ['snapQuarters', 'dayPoints']) h.run(html.match(new RegExp('const ' + name + ' = .*;'))[0]);
    h.install('densityFor', 'getCumulativeStats', 'generalAttendanceStart', 'getGeneralSchoolDates', 'getBoardDate', 'getBoardWeekRange',
        'getWorkingDatesInRange', 'addDaysToDateStr', 'summarizeRange', 'calculateStudentAttendance', 'getGeneralAttendanceEligibility', 'getBlockingCriteriaIds',
        'dayHasBlockingViolation', 'dayHasAnyViolation', 'getDisciplineCriteriaIds', 'dayMeetsDisciplineCriteria', 'getTitleRules',
        'getDayRanking', 'getDayTitleCandidates', 'getWeekTitleCandidates', 'getApprovedKnightsForMode', 'topTied', 'getMostImproved');
    if (scope === 'new') h.run(source('homePrepQualifies').replaceAll('HOMEPREP_SCOPE', "'new'"));
    h.sent = []; h.ctx.sink = message => h.sent.push(copy(message));
    Object.assign(h.ctx.window.almahraData, { isReady: () => true, getActiveProgramId: () => 'general', getActiveSeasonId: () => 's1' });
    h.run('generalTv.enabled = true; generalTv.channel = { postMessage: sink }; generalTv.dataContext = generalTvContext(); generalTv.lastHello = Date.now();');
    h.preview = () => { h.run('updateGeneralQuickPreview()'); return copy(h.run('calculateGeneralQuickEntry(students.find(s => s.id === currentEditingStudentId))')); };
    h.install('legacyEntriesOf');
    h.list = list; h.snapshot = () => copy(h.run('getGeneralTvSnapshot()'));
    h.open = (id, date = key.today) => {
        h.ctx.editId = id; h.ctx.editDate = date;
        h.run('currentEditingStudentId = editId; initGeneralQuickEntry(students.find(s => s.id === editId), editDate);');
    };
    h.prep = () => h.run("toggleGeneralOptIn(document.getElementById('generalHomePrepBtn'))");
    h.day = (id, date = key.today) => {
        h.ctx.editId = id; h.ctx.editDate = date;
        return h.run('dayPoints(students.find(s => s.id === editId).history[editDate]) + (students.find(s => s.id === editId).history[editDate]?.attended ? 10 : 0)');
    };
    h.total = id => { h.ctx.editId = id; return h.run('getCumulativeStats(students.find(s => s.id === editId)).tripPoints'); };
    return h;
}
function clearDay(h, id, index) { delete h.list.find(s => s.id === id).history[key.days[index]]; }
async function reject(h) {
    assert.equal(h.preview().errors.find(e => e.kind === 'criteria').message, key.error);
    assert.equal(h.element('generalCriteriaState').textContent, key.error);
    assert.equal(h.element('generalHomePrepBtn').attrs['aria-invalid'], 'true');
    assert.equal(h.element('generalHomePrepBtn').classList.contains('qe-error'), true);
    const writes = h.state.writes.length; await h.pressSave();
    assert.equal(h.state.writes.length, writes);
    assert.equal(h.state.messages.at(-1).message, key.error);
    assert.equal(h.state.focus, 'generalHomePrepBtn');
}
function expectEvent(h, expected, period = 'asr') {
    const event = h.sent.filter(e => e.type === 'celebrate').at(-1);
    assert.ok(event);
    for (const [field, value] of Object.entries(expected)) assert.equal(event[field], value, field);
    assert.equal(event.period, period);
}
test('real passage points, every daily/weekly/season number, board rank and impact of ten', () => {
    const h = harness();
    assert.deepEqual([entry('new', 5, 'excellent').points, entry('new', 5, 'very-good').points, entry('new', 5, 'good').points,
        entry('review', 4, 'excellent').points, entry('review', 4, 'good').points], Object.values(key.entryPoints));
    const snapshot = h.snapshot();
    for (const row of key.students) {
        for (let i = 0; i < key.days.length; i++) assert.equal(h.day(row.id, key.days[i]), row.dayPoints[i], row.name + ' day ' + i);
        const board = snapshot.stages.flatMap(s => s.board).find(s => s.name === row.name);
        assert.equal(board.points, row.season, row.name); assert.equal(board.week, row.week); assert.equal(board.rank, row.rank);
    }
    assert.deepEqual(snapshot.stages[0].board.map(r => r.name), key.boardOrder.map(id => key.students.find(s => s.id === id).name));
    for (const s of h.list) for (const day of Object.values(s.history)) if (day.criteria?.homeprep) {
        day.criteriaPoints -= day.criteria.homeprep; delete day.criteria.homeprep;
    }
    for (const row of key.students) assert.equal(h.total(row.id), row.without);
    assert.ok(h.run("getGeneralTvBoard('asr').find(e=>e.student.id===2).rank < getGeneralTvBoard('asr').find(e=>e.student.id===4).rank"));
});
test('fulfill never marks optIn; state excludes it while points include it; correct save and celebration', async () => {
    const h = harness(); clearDay(h, 1, 4); h.open(1);
    h.range('new', null, [2, 37]); h.grade('new', 'excellent');
    h.run('fulfillGeneralCriteria()');
    assert.equal(h.element('generalCriteriaState').textContent, key.fulfillStates[0]);
    assert.equal(h.preview().criteria.selection.homeprep, undefined);
    h.prep(); assert.equal(h.element('generalCriteriaState').textContent, key.fulfillStates[1]);
    h.run('fulfillGeneralCriteria()'); assert.equal(h.element('generalCriteriaState').textContent, key.fulfillStates[2]);
    h.run('fulfillGeneralCriteria()'); assert.equal(h.preview().total, key.celebrations.badr.added);
    await h.save(); expectEvent(h, key.celebrations.badr);
    h.open(1); assert.equal(h.element('generalHomePrepBtn').attrs['aria-pressed'], 'true');
});
test('good and no recitation reject visibly and on save; very-good qualifies', async () => {
    const h = harness();
    clearDay(h, 2, 3); clearDay(h, 2, 4); h.open(2, key.days[3]);
    h.range('new', null, [2, 29]); h.grade('new', 'good'); h.prep(); await reject(h);
    h.prep(); await h.save(); assert.equal(h.total(2), key.celebrations.hamzaRejectedThenSaved.total);
    // Past-day entry uses the same guarantee and sends no TV event.
    assert.equal(h.sent.filter(e => e.type === 'celebrate').length, 0);
    h.open(2); h.range('new', null, [2, 37]); h.grade('new', 'very-good'); h.prep();
    assert.deepEqual(h.preview().errors, []); await h.save(); expectEvent(h, key.celebrations.hamza);
    clearDay(h, 3, 3); clearDay(h, 3, 4); h.open(3, key.days[3]); h.prep(); await reject(h);
    h.prep(); h.run('fulfillGeneralCriteria()'); await h.save(); assert.equal(h.total(3), key.celebrations.rashid.total);
});
for (const scope of ['all', 'new']) test('pure guarantee and review-only/mixed/repeat/saved cases: ' + scope, async () => {
    const h = harness(scope), qualifies = (saved, sections) => {
        h.ctx.saved = saved; h.ctx.sections = sections;
        return h.run('homePrepQualifies(saved, sections, getProgramSettings())');
    };
    const fresh = entry('new', 5, 'excellent'), review = entry('review', 4, 'excellent'), poor = entry('review', 4, 'good');
    assert.equal(qualifies([], []), false);
    assert.equal(qualifies([], [fresh]), true);
    assert.equal(qualifies([fresh], []), true);
    assert.equal(qualifies([], [review]), scope === 'all');
    assert.equal(qualifies([fresh], [poor]), scope === 'new');
    assert.equal(qualifies([], [fresh, poor]), scope === 'new');
    assert.equal(qualifies([poor], [fresh]), scope === 'new');
    assert.equal(qualifies([], [{ ...fresh, grade: 'repeat' }]), false);
    assert.equal(qualifies([fresh], [{ ...review, grade: 'repeat' }]), scope === 'new');
    assert.equal(qualifies([], [{ ...fresh, grade: 'unknown' }]), false);
    assert.equal(qualifies([{ kind: 'legacy-points', grade: 'excellent' }], []), false);
    clearDay(h, 4, 3); clearDay(h, 4, 4); h.open(4);
    h.range('review', [2,17], [2,24]); h.grade('review', 'excellent'); h.prep();
    if (scope === 'new') { await reject(h); h.prep(); }
    await h.save();
    expectEvent(h, scope === 'all' ? key.celebrations.sultan : {
        added: key.newScope.sultan.celebrationAdded, total: key.newScope.sultan.celebrationTotal, prep: false });
});
test('late mark alone uses saved recitation, +10 and prep; saved poor grade rejects late mark', async () => {
    const h = harness(); clearDay(h, 5, 3); h.open(5);
    h.range('new', null, [2,29]); h.grade('new', 'excellent'); await h.save(); expectEvent(h, key.celebrations.adelFirst);
    h.open(5); h.prep(); assert.equal(h.preview().sections.length, 0);
    assert.equal(h.preview().total, 10); await h.save(); expectEvent(h, key.celebrations.adelLate);
    const day = h.list[4].history[key.today]; day.entries[Object.keys(day.entries)[0]].grade = 'good'; day.criteria = {}; day.criteriaPoints = 0;
    h.open(5); h.prep(); await reject(h);
});
for (const scope of ['all','new']) test('two saves with two grades, -10 cancellation and no celebration: ' + scope, async () => {
    const h = harness(scope); clearDay(h, 7, 4); h.open(7);
    h.range('new', null, [2,37]); h.grade('new','excellent'); h.prep(); await h.save();
    expectEvent(h, key.celebrations.nasserFirst, 'maghrib');
    h.open(7); assert.equal(h.element('generalHomePrepBtn').attrs['aria-pressed'], 'true');
    h.range('review',[2,17],[2,24]); h.grade('review','good');
    const count = h.sent.filter(e=>e.type==='celebrate').length;
    if (scope === 'all') {
        await reject(h); h.prep(); const calc = h.preview();
        assert.equal(calc.criteria.delta, -10); assert.equal(calc.total, key.celebrations.nasserSecond.added);
        assert.match(h.element('generalQuickPreview').textContent.replace(/[\u061c\u200e\u200f]/g, ''),/7.5.*الانضباط -10/);
    } else assert.deepEqual(h.preview().errors, []);
    await h.save();
    assert.equal(h.total(7), scope === 'all' ? key.students[6].season : key.newScope.nasser.season);
    if (scope === 'all') assert.equal(h.sent.filter(e=>e.type==='celebrate').length, count);
    assert.deepEqual(h.snapshot().stages[1].prepWeek, scope === 'all' ? key.prepWeek.maghrib : key.newScope.maghrib);
    if (scope === 'all') { h.open(7); await h.run('undoLastGeneralEntry()'); assert.equal(h.day(7), 55); }
});
test('undo full sequence guards unchanged data, -10 save, exact original deletion fields, restores rank and prep', async () => {
    const h = harness(); h.open(1);
    const before = copy(h.list[0]), writes = h.state.writes.length;
    await h.run('undoLastGeneralEntry()');
    assert.deepEqual(copy(h.list[0]), before); assert.equal(h.state.writes.length, writes);
    assert.equal(h.state.messages.at(-1).message,key.undoError);
    h.prep(); assert.equal(h.preview().total,-10);
    await h.save(); assert.equal(h.day(1),key.undo.withoutPrep.day); assert.equal(h.total(1),key.undo.withoutPrep.season);
    assert.deepEqual(h.snapshot().stages[0].prepWeek.find(r => r.name === 'بدر'), { name: 'بدر', points: 10 });
    h.open(1); h.run('sendGeneralTvCelebration(students[0], 1, false)');
    await h.run('undoLastGeneralEntry()');
    assert.equal(h.day(1),key.undo.after.day); assert.equal(h.total(1),key.undo.after.season);
    const board = h.snapshot().stages[0].board;
    assert.equal(board.find(r=>r.name==='بدر').week,key.undo.after.week);
    assert.equal(board.find(r=>r.name==='بدر').rank,key.undo.after.badrRank);
    assert.equal(board.find(r=>r.name==='سلطان').rank,key.undo.after.sultanRank);
    assert.equal(board.find(r=>r.name==='حمزة').rank,2);
    assert.deepEqual(h.snapshot().stages[0].prepWeek.find(r => r.name === 'بدر'), { name: 'بدر', points: 10 });
    assert.equal(h.sent.at(-1).type,'cancel');
    assert.deepEqual(copy(h.list[0].history[key.today].criteria),{ early:5 });
    const patch = h.state.writes.at(-1).fields;
    assert.equal(Object.keys(patch).some(k=>/criteria|attended/.test(k)),false);
    h.open(1); h.range('new',null,[2,37]); h.grade('new','excellent'); h.prep(); await h.save();
    assert.equal(h.day(1),key.undo.restored.day); assert.equal(h.total(1),key.undo.restored.season);
    assert.equal(h.snapshot().stages[0].board[0].rank,key.undo.restored.rank);
    assert.deepEqual(h.snapshot().stages[0].prepWeek,key.prepWeek.asr);
});
test('undo second worthy recitation is allowed if another remains, including map keys different from entry.id', async () => {
    const h = harness(); const day=h.list[0].history[key.today];
    day.entries.second=entry('review',4,'excellent',10); h.open(1); await h.run('undoLastGeneralEntry()');
    assert.equal(day.entries.second,undefined); assert.equal(day.criteria.homeprep,10);
});
test('prep week: weekly sums keep absence and unrecorded days, points then display name, Sunday and midweek start', () => {
    const h=harness();
    for (const stage of h.snapshot().stages) assert.deepEqual(stage.prepWeek,key.prepWeek[stage.period]);
    assert.equal(h.run('dayMeetsDisciplineCriteria(students[3].history["2026-11-22"])'),key.discipline.sultan);
    assert.equal(h.run('dayMeetsDisciplineCriteria(students[0].history["2026-11-23"])'),key.discipline.badr);
    h.list[5].history[key.today]={attended:true,criteria:{homeprep:10},criteriaPoints:10,entries:{ e:entry('new',6,'excellent') }};
    assert.deepEqual(h.snapshot().stages[0].prepWeek,key.afterFaris);
    const snapshot=h.snapshot(); assert.doesNotMatch(JSON.stringify(snapshot),/"id"|"sid"|synthetic/);
    h.run("todayStr = '2026-11-22'"); for(const s of h.list){delete s.history[key.days[3]];delete s.history[key.days[4]];}
    assert.deepEqual(h.snapshot().stages.map(s=>s.prepWeek),[[],[]]); assert.equal(h.snapshot().boardDate,key.days[2]);
    h.run("todayStr = '2026-11-23'");
    h.list[4].history={ [key.today]:{attended:true,criteria:{homeprep:10},entries:{e:entry('new',5,'excellent')}} };
    assert.deepEqual(h.snapshot().stages[0].prepWeek,[{ name: 'عادل', points: 10 }]);
    h.list[4].history[key.days[3]] = { attended: false, criteria: { homeprep: 7 } };
    h.list[4].history[key.today].criteria.homeprep = 13;
    h.list[4].history[key.days[0]] = { criteria: { homeprep: 100 } };
    h.list[4].history['2026-11-18'] = { criteria: { homeprep: 100 } };
    assert.deepEqual(h.snapshot().stages[0].prepWeek, [{ name: 'عادل', points: 20 }]);
    h.list[4].halaqaId='missing'; assert.deepEqual(h.snapshot().stages[0].prepWeek,[]);
});
test('new scope full answer-key differences, other students unchanged, and day knights', () => {
    const h=harness('new');
    const sultan=h.list[3].history[key.days[3]]; delete sultan.criteria.homeprep; sultan.criteriaPoints-=10;
    const nasser=h.list[6].history[key.today]; nasser.criteria.homeprep=10;nasser.criteriaPoints+=10;
    const snapshot=h.snapshot();
    for(const [id,expected] of [[4,key.newScope.sultan],[7,key.newScope.nasser]]) {
        assert.equal(h.total(id),expected.season);
        const row=snapshot.stages.flatMap(s=>s.board).find(r=>r.name===h.list[id-1].name);
        assert.equal(row.week,expected.week); assert.equal(h.day(id,id===4?key.days[3]:key.today),expected.day);
        if(expected.rank) assert.equal(row.rank,expected.rank);
    }
    assert.equal(snapshot.stages[0].board.find(r=>r.name==='حمزة').rank,key.newScope.hamzaRank);
    assert.deepEqual(snapshot.stages[0].prepWeek, [
        { name: 'بدر', points: 20 }, { name: 'حمزة', points: 10 }, { name: 'راشد', points: 10 },
        { name: 'سلطان', points: 10 }, { name: 'عادل', points: 10 }, { name: 'فارس', points: 10 }]);
    assert.deepEqual(snapshot.stages[1].prepWeek,key.newScope.maghrib);
    for(const row of key.students.filter(s=>![4,7].includes(s.id)))assert.equal(h.total(row.id),row.season);
    const all=harness();
    for(const [period,expected] of Object.entries(key.dayKnights)){
        const stage=all.snapshot().stages.find(s=>s.period===period);
        assert.deepEqual(stage.dayKnights[0].names,[expected.name]);
        all.ctx.stageId=period==='asr'?'primary':'middle';
        assert.equal(all.run('getDayTitleCandidates(todayStr, stageId)[0].points'),expected.points);
    }
});
test('TV prep slides after week knights, empty hidden, 20 per page, name and points only; celebration text and hiding', () => {
    const names=Array.from({length:41},(_,i)=>({name:'طالب '+i,points:40-i%4*10}));
    const snapshot={ stages:[{period:'asr',name:'أ',weekKnights:[{stage:'أ',names:['اسم']}],prepWeek:names,risingStars:[{name:'اسم'}]}] };
    const slides=tv.makeSlides(snapshot,'asr');
    assert.deepEqual(slides.map(s=>s.kind),['weekKnights','prepWeek','prepWeek','prepWeek','risingStars']);
    assert.deepEqual(slides.filter(s=>s.kind==='prepWeek').map(s=>s.items.length),[20,20,1]);
    assert.deepEqual(slides.filter(s=>s.kind==='prepWeek').flatMap(s=>s.items),names);
    assert.ok(slides.filter(s=>s.kind==='prepWeek').every(s=>s.title==='🏠 أهل التحضير هذا الأسبوع'&&s.pages===3));
    snapshot.stages[0].prepWeek=[]; assert.ok(!tv.makeSlides(snapshot,'asr').some(s=>s.kind==='prepWeek'));
    const js=fs.readFileSync(root+'/tv.js','utf8'), page=fs.readFileSync(root+'/tv.html','utf8');
    assert.match(js,/el\('celePrep'\)\.hidden = !event.prep/); assert.ok(js.includes(key.celebrationLine));
    assert.match(page,/id="celePrep" hidden/);
    const prepRender=js.slice(js.indexOf("} else if (slide.kind === 'prepWeek')"),js.indexOf('} else slide.items.forEach'));
    assert.doesNotMatch(prepRender,/item\.rank|item\.week/); assert.match(prepRender,/ar\(item\.points\)/); assert.match(prepRender,/c < 2/); assert.match(prepRender,/r < 10/);
});
test('weekly sheet optIn independent box; settings preset id and optIn roundtrip; no migration or forbidden production changes', () => {
    const h=harness(); h.install('buildGeneralWeeklySheetHtml');
    h.ctx.meta={seasonName:'اختبار'};h.ctx.week={days:[{dateStr:key.today,dayName:'الاثنين'}]};
    const sheet=h.run('buildGeneralWeeklySheetHtml(students[0],week,getProgramSettings(),meta)');
    assert.match(sheet,/<span class="gws-box"><\/span> التحضير المنزلي/);
    assert.doesNotMatch(sheet,/فاته:<\/b>[^<]*<span>التحضير المنزلي/);
    const settingsSource=source('criterionRowHtml');
    assert.match(settingsSource,/crit-optin/); assert.match(settingsSource,/يُؤشَّر عند تحققه فقط/);
    assert.match(source('collectCriteriaFromRows'),/item.optIn =/);
    assert.match(source('addCriterionRow'),/id: 'homeprep'.*points: 10.*optIn: true/);
    const store=fs.readFileSync(root+'/programs-store.js','utf8');
    const baseline=cp.execFileSync('git',['show','1e4152b:programs-store.js'],{cwd:root,encoding:'utf8'}).replaceAll('\r\n','\n');
    const defs=text=>vm.runInNewContext('('+text.match(/export const PROGRAM_DEFS = ([\s\S]*?);\n/)[1]+')');
    for(const id of ['summer','review-day'])assert.deepEqual(copy(defs(store)[id]),copy(defs(baseline)[id]));
    assert.deepEqual(copy(defs(store).general.defaultSettings.criteria.find(c=>c.id==='homeprep')),
        {id:'homeprep',name:'التحضير المنزلي',points:10,enabled:true,optIn:true});
    assert.equal(source('migrateSettings',store),source('migrateSettings',baseline));
    for(const name of ['dayStats','getCumulativeStats','summarizeRange','getCriteriaSelection','getDisciplineCriteriaIds','getGeneralTvBoard','getGeneralCelebrationRank','resetStudentToday','buildEntryPatch','commitGeneralStudentPatch'])
        assert.equal(source(name),source(name,cp.execFileSync('git',['show','1e4152b:index.html'],{cwd:root,encoding:'utf8'})),name);
});


test('browser: general opt-in has distinct pressed colors, checkmark, hover, focus and red rejection', async () => {
    const path = require('node:path');
    const { newPage } = require('./helpers/t25-browser.cjs');
    const playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
    const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    try {
        for (const width of [390, 1280]) {
            const h = await newPage(browser, { width, today: key.today, settings: key.settings,
                list: [student({}, { id: 1, sid: 'synthetic-homeprep', halaqaId: 'a', lastSurah: 2, lastAyah: 29, history: {} })] });
            try {
                await h.page.evaluate(() => openSmartModal(1));
                const button = h.page.locator('#generalHomePrepBtn');
                const style = () => button.evaluate(el => {
                    const css = getComputedStyle(el);
                    return { bg: css.backgroundColor, color: css.color, border: css.borderTopColor,
                        borderWidth: css.borderTopWidth, height: el.getBoundingClientRect().height,
                        check: getComputedStyle(el, '::before').content, shadow: css.boxShadow,
                        outline: css.outlineColor, outlineWidth: css.outlineWidth, outlineStyle: css.outlineStyle };
                });
                assert.equal(await button.getAttribute('aria-pressed'), 'false');
                const unpressed = await style();
                assert.ok(unpressed.height >= 36);
                assert.equal(unpressed.borderWidth, '1px');
                await button.hover();
                assert.notEqual((await style()).shadow, unpressed.shadow);
                await h.page.mouse.move(0, 0);
                await button.focus();
                await h.page.keyboard.press('Tab');
                await h.page.keyboard.press('Shift+Tab');
                assert.equal(await button.evaluate(el => el.matches(':focus-visible')), true);
                assert.ok(parseFloat((await style()).outlineWidth) >= 2);
                assert.equal((await style()).outlineStyle, 'solid');
                await h.page.locator('#quick_new_toAyah').fill('37');
                await h.page.locator('#quick_new_grades').getByRole('button', { name: 'ممتاز', exact: true }).click();
                await button.click();
                assert.equal(await button.getAttribute('aria-pressed'), 'true');
                assert.equal(await button.getAttribute('aria-invalid'), 'false');
                const pressed = await style();
                assert.notEqual(pressed.bg, unpressed.bg);
                assert.notEqual(pressed.color, unpressed.color);
                assert.match(pressed.check, /✓/);
                const grade = await h.page.locator('#quick_new_grades [aria-pressed="true"]').evaluate(el => {
                    const css = getComputedStyle(el); return { bg: css.backgroundColor, color: css.color };
                });
                assert.deepEqual({ bg: pressed.bg, color: pressed.color }, grade);
                const generic = await button.evaluate(el => {
                    const other = el.cloneNode(true); other.id = 'syntheticOptIn'; el.after(other);
                    const css = getComputedStyle(other);
                    const result = { bg: css.backgroundColor, color: css.color, check: getComputedStyle(other, '::before').content };
                    other.remove(); return result;
                });
                assert.deepEqual(generic, { bg: pressed.bg, color: pressed.color, check: pressed.check });
                await h.page.locator('#quick_new_grades').getByRole('button', { name: 'جيد', exact: true }).click();
                assert.equal(await button.getAttribute('aria-invalid'), 'true');
                const rejected = await style();
                assert.equal(rejected.color, 'rgb(160, 61, 56)');
                assert.equal(rejected.border, rejected.color);
                assert.equal(rejected.outline, rejected.color);
                assert.notEqual(rejected.bg, pressed.bg);
                await button.hover();
                assert.equal((await style()).color, rejected.color);
                assert.equal((await style()).border, rejected.border);
                await button.click();
                assert.equal(await button.getAttribute('aria-pressed'), 'false');
                assert.equal(await button.getAttribute('aria-invalid'), 'false');
                const restored = await style();
                assert.equal(restored.bg, unpressed.bg);
                assert.equal(restored.color, unpressed.color);
                assert.doesNotMatch(restored.check, /✓/);
                assert.deepEqual(await h.page.evaluate(() => window.__fixture.writes), []);
                assert.deepEqual(h.errors, []);
            } finally { await h.close(); }
        }
    } finally { await browser.close(); }
});
