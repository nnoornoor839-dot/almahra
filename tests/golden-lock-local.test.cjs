// بلا شبكة: وظائف الإنتاج وطلاب وهميون، مع عزل قفل كتابة البرامج السابق في المحاكي.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness, student, entry, today, savedEntries, copy, source, html } = require('./helpers/quick-entry-harness.cjs');
const closed = 'اللوحة الذهبية مغلقة للإصلاح';

for (const program of ['summer', 'review-day', 'general']) test(`golden tab stays visible, grey and disabled in ${program} when not hidden`, () => {
    const h = harness(); h.state.program = program; h.state.settings.features.goldenBoard = true;
    h.reopen();
    const btn = h.element('tabMasteryBtn');
    assert.equal(btn.style.display, ''); assert.equal(btn.disabled, true);
    assert.equal(btn.innerHTML, '🔧 اللوحة الذهبية — مغلقة للإصلاح');
    assert.match(btn.className, /bg-slate-200/); assert.match(btn.className, /cursor-not-allowed/);
    h.run("switchSmartTab('mastery')");
    assert.equal(h.element('smartMasterySection').classList.contains('hidden'), true);
    assert.equal(h.element('smartDailySection').classList.contains('hidden'), false);
    assert.match(h.element('tabDailyBtn').className, /border-emerald-500/);
    assert.equal(h.element('generalQuickSection').classList.contains('hidden'), program !== 'general');
    assert.equal(h.state.messages.at(-1).message, closed);
});

test('general hidden golden tab and tab bar remain hidden', () => {
    const h = harness();
    h.run("switchSmartTab('mastery')");
    assert.equal(h.element('tabMasteryBtn').style.display, 'none');
    assert.equal(h.element('smartTabs').style.display, 'none');
    assert.equal(h.element('smartMasterySection').classList.contains('hidden'), true);
    assert.equal(h.element('generalQuickSection').classList.contains('hidden'), false);
});

for (const program of ['summer', 'review-day', 'general']) {
    for (const choice of ['juz', 'minor', 'half']) test(`saveSmartMastery refuses ${choice} before any work in ${program}`, () => {
        const h = harness(); h.state.program = program; h.install('saveSmartMastery');
        h.run(choice === 'minor' ? "selectedMinor = { id: 'half_amma', points: 50, name: 'محطة وهمية' }" : 'selectedJuzs = [29]');
        h.element('isHalfJuz').checked = choice === 'half';
        const before = copy(h.s);
        for (const name of ['prepareSchoolDay', 'canWriteCloud', 'requireQuranMeasure', 'buildEntryPatch', 'commitStudentPatch', 'confirm'])
            h.ctx[name] = () => assert.fail(`${name} must not be called`);
        h.run('saveSmartMastery()');
        assert.equal(h.state.writes.length, 0); assert.deepEqual(h.s, before);
        assert.equal(h.state.messages.at(-1).message, closed);
    });
}

test('station, juz and half selection entry points refuse direct calls; submit and controls stay disabled', () => {
    const h = harness(); h.state.program = 'summer';
    const controls = ['btn-qisar', 'btn-half_amma', 'btn-three_q_amma', 'juz_29'].map(h.element);
    const query = h.ctx.document.querySelectorAll;
    h.ctx.document.querySelectorAll = selector => selector === '.minor-btn, .juz-checkbox' ? controls : query(selector);
    h.install('selectMinor', 'handleJuzSelection', 'handleHalfJuzToggle', 'updateSmartButton', 'buildJuzGrid');
    h.run(html.match(/const JUZ_NAMES = \[[\s\S]*?\];/)[0]);
    h.run('buildJuzGrid()');
    assert.equal((h.element('juzGrid').innerHTML.match(/disabled/g) || []).length, 30);
    for (const call of ["selectMinor('qisar', 25, 'محطة وهمية')", 'handleJuzSelection()', 'handleHalfJuzToggle()']) {
        h.run(call);
        assert.equal(h.run('selectedMinor'), null); assert.deepEqual(copy(h.run('selectedJuzs')), []);
        assert.equal(h.state.messages.at(-1).message, closed);
    }
    h.run('selectedJuzs = [29]; updateSmartButton()');
    assert.equal(h.element('smartSubmitBtn').disabled, true);
    assert.match(h.element('smartSubmitBtn').textContent, /مغلقة للإصلاح/);
    assert.equal(h.element('isHalfJuz').disabled, true);
    for (const el of controls) assert.equal(el.disabled, true);
    assert.equal(h.state.writes.length, 0);
});

test('summer daily recitation still saves with the golden lock on', () => {
    const h = harness(); h.state.program = 'summer'; h.reopen();
    h.install('saveSmartProgress', 'calculateRangeStats', 'commitStudentPatch', 'restoreStudent');
    for (const [id, value] of Object.entries({ startSurah: 114, startAyah: 1, endSurah: 114, endAyah: 3 })) h.element(id).value = value;
    h.element('resWeightedPoints').innerText = '3';
    h.run('saveSmartProgress()');
    assert.equal(h.state.writes.length, 1);
    assert.equal(savedEntries(h)[0].kind, 'review'); assert.equal(savedEntries(h)[0].points, 3);
    assert.ok(Object.values(h.s.history[today].entries).some(e => e.kind === 'review'));
});

test('the daily type selector cannot select golden while closed', () => {
    const h = harness(), before = copy(h.s); h.state.program = 'summer';
    h.run("setSardType('golden')");
    assert.equal(h.run('currentSardType'), 'review'); assert.equal(h.state.messages.at(-1).message, closed);
    assert.equal(h.state.messages.at(-1).message, closed); assert.deepEqual(h.s, before);
    assert.equal(h.state.writes.length, 0);
});

test('general daily recitation still saves with the golden lock on', async () => {
    const h = harness(student({}, { lastSurah: 78, lastAyah: 10 }));
    h.range('new', null, [78, 15]); h.grade('new'); h.preview(); await h.save();
    assert.equal(h.state.writes.length, 1); assert.equal(savedEntries(h)[0].kind, 'new');
    assert.ok(Object.values(h.s.history[today].entries).some(e => e.kind === 'new'));
});

test('old golden labels, quantities and points keep the existing reading behavior', () => {
    const day = { sardAccreditation: 'اعتماد قديم وهمي', entries: {
        golden: { ...entry('golden', [114, 1], [114, 3]), points: 100, label: 'ذهبي وهمي سابق' }
    } };
    const h = harness(student(day.entries)); h.ctx.oldDay = day;
    h.install('dayAccreditationTexts');
    const before = copy(day);
    for (const program of ['summer', 'review-day', 'general']) {
        h.state.program = program; h.state.settings.features.goldenBoard = true;
        assert.deepEqual(copy(h.run('dayAccreditationTexts(oldDay)')), ['اعتماد قديم وهمي', 'ذهبي وهمي سابق']);
        assert.equal(h.run('dayStats(oldDay).points'), 100);
        assert.equal(h.run('dayStats(oldDay).golden.ayahs'), 3);
    }
    h.state.settings.features.goldenBoard = false;
    assert.deepEqual(copy(h.run('dayAccreditationTexts(oldDay)')), []); // إخفاء العام السابق يبقى كما كان.
    assert.deepEqual(day, before);
});

test('JSON restore accepts golden entries and legacy golden data through confirmation and restoration', () => {
    for (const program of ['summer', 'review-day']) for (const day of [
        { entries: { g: { kind: 'golden', points: 100 } } },
        { entries: { g: { kind: 'legacy-golden', ayahs: 3 } } },
        { goldenSard: 3, goldenPages: 1, goldenRubs: 1, sardAccreditation: 'قديم وهمي',
            entries: { g: { kind: 'golden', points: 100 } } }
    ]) {
        const h = harness(); h.state.program = program;
        h.ctx.requireSchoolCalendar = () => true;
        h.ctx.FileReader = class { constructor() { h.state.reader = this; } readAsText() {} };
        h.ctx.tiersFeatureOn = () => false;
        h.ctx.studentsCountLabel = count => String(count);
        h.ctx.saveData = () => h.state.writes.push(copy(h.run('students')));
        h.run("let _noLevelWarned = { key: 'old', ids: [1] };");
        h.install('isValidStudentBackup', 'importNuclearBackup');
        const backup = [{ id: 2, name: 'طالب نسخة وهمي', history: { [today]: day } }];
        h.run('importNuclearBackup({ target: { files: [{}] } })');
        h.state.reader.onload({ target: { result: JSON.stringify(backup) } });
        assert.equal(h.state.prompts.length, 1);
        assert.match(h.state.prompts[0], /هل أنت متأكد/);
        const restored = backup.map(s => ({ ...s, memorizedJuz: null }));
        assert.deepEqual(h.state.writes, [restored]);
        assert.deepEqual(copy(h.run('students')), restored);
        assert.equal(h.state.messages.some(({ message }) => message === closed), false);
        assert.equal(h.state.messages.at(-1).type, 'success');
    }
});

test('changing the one constant to false restores the existing mastery tab', () => {
    // سياق مستقل لأن ثابت الإنتاج لا يتغير أثناء الجلسة.
    const vm = require('node:vm');
    const h = harness(); h.state.program = 'summer';
    const ctx = vm.createContext({ document: h.ctx.document, showToast: () => assert.fail('lock is off'),
        isGeneralProgram: () => false, generalGoldenHidden: () => false });
    vm.runInContext(html.match(/const GOLDEN_BOARD_UNDER_REPAIR = (?:true|false);/)[0].replace('= true', '= false'), ctx);
    vm.runInContext(source('switchSmartTab') + "; switchSmartTab('mastery')", ctx);
    assert.equal(h.element('tabMasteryBtn').disabled, false);
    assert.equal(h.element('smartMasterySection').classList.contains('hidden'), false);
    assert.match(h.element('tabMasteryBtn').innerHTML, /اعتمادات الأجزاء/);
});
