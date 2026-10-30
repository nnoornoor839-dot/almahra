// Offline only: production functions from index.html, synthetic data and a fake clock/DOM.
// Run: node --test tests/day5-locked-local.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const sources = new Map();
function source(name) {
    if (sources.has(name)) return sources.get(name);
    const start = html.search(new RegExp(`(?:async )?function ${name}\\(`));
    assert.ok(start >= 0, `production function ${name}`);
    // Let the JS parser find the closing brace, including templates and nested functions.
    for (let end = html.indexOf('}', start); end >= 0; end = html.indexOf('}', end + 1)) {
        const candidate = html.slice(start, end + 1);
        try { new vm.Script(`(${candidate})`); } catch { continue; }
        sources.set(name, candidate);
        return candidate;
    }
    throw Error(`Unclosed function ${name}`);
}
function classList(initial = []) {
    const values = new Set(initial);
    return { add: (...args) => args.forEach(v => values.add(v)), remove: (...args) => args.forEach(v => values.delete(v)),
        contains: v => values.has(v), replace(a, b) { if (values.delete(a)) values.add(b); },
        toggle(v, on = !values.has(v)) { if (on) values.add(v); else values.delete(v); } };
}
function harness(program = 'general', archived = false) {
    const state = { program, archived, season: 's1', messages: [], writes: [], timers: new Map(), now: 0, nextTimer: 0, prompts: 0 };
    const local = new Map([['sentinel', 'unchanged']]), localWrites = [], elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, { value: '', innerHTML: '', innerText: '', textContent: '', disabled: false,
            style: {}, classList: classList(id === 'toastMessage' ? ['hidden', 'opacity-0', 'bg-emerald-600'] : id === 'pendingSaveWarning' ? ['hidden'] : []),
            querySelectorAll: () => [], click() {}, remove() {} });
        return elements.get(id);
    };
    const nav = Array.from({ length: 6 }, (_, i) => element(`nav${i}`));
    const document = { body: { classList: classList() }, getElementById: element,
        querySelectorAll: selector => selector === 'nav .nav-btn' ? nav : selector === '.grp-score-input'
            ? [{ value: '90', dataset: { groupId: '1' } }] : [], querySelector: () => null };
    const setTimeout = (fn, delay = 0) => {
        const id = ++state.nextTimer; state.timers.set(id, { fn, at: state.now + delay }); return id;
    };
    const advance = ms => {
        const until = state.now + ms;
        for (;;) {
            const next = [...state.timers].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
            if (!next) break;
            state.now = next[1].at; state.timers.delete(next[0]); next[1].fn();
        }
        state.now = until;
    };
    const programs = Object.fromEntries(['general', 'summer', 'review-day'].map(id => [id, { id, name: `برنامج وهمي ${id}`, settings: {}, activeSeasonId: 's1' }]));
    const listeners = new Map();
    const emit = () => (listeners.get('almahra-program-changed') || []).forEach(fn => fn({ detail: { programId: state.program } }));
    const cloud = name => (...args) => { state.writes.push({ name, args }); return Promise.resolve({ success: true }); };
    const window = {
        addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
        almahraPrograms: {
            getCurrentProgramId: () => state.program, getCurrentSeasonId: () => state.season,
            isCurrentSeasonArchived: () => state.archived, getCurrentProgram: () => programs[state.program],
            getCurrentSeason: () => ({ id: state.season, name: 'موسم وهمي', startDate: '2026-01-01', endDate: '2026-02-01' }),
            getPrograms: () => programs, getKnightsLog: () => [],
            openProgram(id) { state.program = id; state.season = 's1'; state.archived = false; emit(); return true; },
            openArchivedSeason(id, season) { state.program = id; state.season = season; state.archived = true; emit(); return true; },
            ...Object.fromEntries(['updateSettings', 'updateProgramName', 'updateSeasonName', 'resetSettings', 'startNewSeason', 'deleteSeason', 'saveKnightsEntry'].map(n => [n, cloud(n)]))
        },
        almahraData: { getActiveSeasonId: () => state.season, isReadOnly: () => state.archived,
            ...Object.fromEntries(['saveAllStudents', 'patchStudent', 'commitBatch', 'upsertStudent', 'removeStudent', 'createGeneralStudentIfAbsent'].map(n => [n, cloud(n)])) }
    };
    const ctx = vm.createContext({ console, structuredClone, document, window, setTimeout,
        clearTimeout: id => state.timers.delete(id),
        localStorage: { getItem: key => local.get(key) ?? null, setItem(key, value) { localWrites.push(['set', key]); local.set(key, value); },
            removeItem(key) { localWrites.push(['remove', key]); local.delete(key); } },
        confirm() { state.prompts++; return true; }, prompt() { state.prompts++; return 'موسم وهمي'; },
        isGeneralProgram: () => state.program === 'general', canWriteHistory: () => true,
        escapeHTML: v => String(v ?? ''), closeEventPicker() {}, updateCurrentEventBadge() {}, applyProgramFeatures() {},
        renderProgramSettings() {}, updateAllUIs() {}, renderHonorBoard() {}, renderGroupsList() {}, renderGroupScoresEntry() {},
        switchTab(id) { element(id).classList.add('active'); },
        getGroupScoreMaxSelectableDate: () => '2026-12-31', getLastCompletedWeekRange: () => ({ startStr: '2026-10-25' }),
        getWeekStartDate: () => '2026-10-25',
        FileReader: class { constructor() { state.reader = this; } readAsText() {} },
        showToast(message, type = 'success') { state.messages.push({ message, type }); } });
    const run = code => vm.runInContext(code, ctx);
    const install = (...names) => names.forEach(name => run(source(name)));
    run(`let students = [{ id: 1, name: 'طالب وهمي', history: { '2026-10-25': { attended: true } } }];
        let groups = [{ id: 1, name: 'مجموعة وهمية', leaderId: 1, deputyId: null, memberIds: [] }], groupIdCounter = 2;
        let weeklyGroupLog = [{ day: 'وهمي', members: [1] }], groupDailyScores = {}, weeklyChampionGroup = { name: 'وهمي' };
        let currentThreeKnights = { name: 'وهمي' }, honorKnightsLog = [], pendingImport = { rows: [] }, pendingSettingsCommit = null;
        const todayStr = '2026-10-25', hijriDateStr = 'تاريخ وهمي';`);
    const constant = html.match(/const WRITABLE_PROGRAMS = \[[^\]]*\];/);
    assert.ok(constant); run(constant[0]);
    install('isWriteLockedView', 'writeLockedMessage', 'canWriteView', 'canWriteCloud');
    const timerStart = html.indexOf('        let _cloudSaveTimeout = null;');
    const timerEnd = html.indexOf('        function loadData()', timerStart);
    run(html.slice(timerStart, timerEnd));
    install('saveData', 'commitStudentPatch', 'commitPatches', 'applyFieldsLocally', 'restoreStudent', 'applyArchivedMode');
    element('grpScoreDateInput').value = '2026-10-25';
    const snapshot = () => run('JSON.stringify({students, groups, groupIdCounter, weeklyGroupLog, groupDailyScores, weeklyChampionGroup, currentThreeKnights})');
    return { ctx, run, install, state, local, localWrites, element, nav, document, advance, snapshot, emit };
}

test('lock predicate and UI: locked programs, writable active general, and distinct archive text', () => {
    for (const [program, archived, locked] of [['summer', false, true], ['review-day', false, true], ['general', false, false], ['general', true, true]]) {
        const h = harness(program, archived);
        assert.equal(h.run('isWriteLockedView()'), locked);
        h.run('applyArchivedMode()');
        assert.equal(h.document.body.classList.contains('archived-mode'), locked);
        assert.deepEqual(h.nav.map(n => n.style.display), locked ? ['none', 'none', 'none', '', 'none', 'none'] : ['', '', '', '', '', '']);
        if (archived) {
            assert.equal(h.element('archivedBannerTitle').textContent, 'أنت تعرض موسماً مؤرشفاً');
            assert.equal(h.element('archivedBannerName').textContent, 'موسم وهمي · 2026-01-01 ← 2026-02-01 · عرض التقارير فقط');
            assert.match(h.run('writeLockedMessage()'), /موسم مؤرشف/);
            assert.doesNotMatch(h.run('writeLockedMessage()'), /مقفل للكتابة/);
        } else if (locked) {
            assert.match(h.element('archivedBannerName').textContent, new RegExp(`${program} مقفل للكتابة`));
            assert.doesNotMatch(h.element('archivedBannerTitle').textContent, /مؤرشف/);
            assert.equal(h.element('archivedBannerBack').style.display, 'none');
        }
    }
    const h = harness('summer'); h.run('applyArchivedMode()'); h.state.program = 'general'; h.run('applyArchivedMode()');
    assert.equal(h.element('archivedBanner').style.display, 'none');
    h.state.program = null; assert.equal(h.run('isWriteLockedView()'), false);
});

test('summer group scoring and tie resolution leave all local data/storage intact, with no cloud write or success', () => {
    const h = harness('summer');
    h.install('saveGroupDailyScoresForDate', 'resolveGroupTie', 'applyAutoDailyGroupWinner', 'applyGroupWinnerForDate', 'commitGroupPoints');
    const before = h.snapshot();
    h.run("saveGroupDailyScoresForDate(); resolveGroupTie('2026-10-25', 1); applyAutoDailyGroupWinner('2026-10-25'); applyGroupWinnerForDate('2026-10-25', 1, new Map());");
    assert.equal(h.snapshot(), before); assert.deepEqual(h.localWrites, []); assert.deepEqual(h.state.writes, []);
    assert.ok(h.state.messages.length > 0); assert.ok(h.state.messages.every(m => m.type === 'error' && /مقفل/.test(m.message)));
});

test('saveData, per-student patch and batch never schedule or mutate in a locked view', () => {
    for (const [program, archived] of [['summer', false], ['review-day', false], ['general', true]]) {
        const h = harness(program, archived), before = h.snapshot();
        h.run('saveData()');
        assert.equal(h.run('commitStudentPatch(students[0], {name: "تغيير وهمي"})'), false);
        assert.equal(h.run('commitPatches([{student: students[0], fields: {name: "تغيير وهمي"}}])'), false);
        assert.equal(h.snapshot(), before); assert.equal(h.state.timers.size, 0); assert.deepEqual(h.state.writes, []);
    }
});

test('active general still schedules its 300ms save and patches a student', async () => {
    const h = harness(); h.run('saveData()'); h.advance(299); assert.equal(h.state.writes.length, 0);
    h.advance(1); assert.equal(h.state.writes[0].name, 'saveAllStudents'); assert.equal(h.run('_cloudSaveTimeout'), null);
    assert.equal(h.run('commitStudentPatch(students[0], {name: "تغيير وهمي"})'), true);
    assert.equal(h.run('students[0].name'), 'تغيير وهمي'); assert.equal(h.state.writes[1].name, 'patchStudent');
    await Promise.resolve();
});

test('local groups, winner logs and knights reject even direct calls before changing program data', async () => {
    const calls = [ ['saveGroupEdit'], ['deleteGroupConfirm', '1'], ['saveWinningGroup'],
        ['upsertWeeklyGroupLogEntry', "'2026-10-25', 'وهمي', 'وهمي', [1], 90"], ['removeWeeklyGroupLogEntry', "'2026-10-25', 'وهمي'"],
        ['deleteWeeklyGroupLogEntry', "'2026-10-25', 'وهمي'"], ['saveWeeklyChampionGroup'], ['clearWeeklyChampionOverride'],
        ['saveGroupsData'], ['saveWeeklyGroupLogData'], ['saveGroupDailyScoresData'], ['saveWeeklyChampionGroupData'],
        ['saveCurrentThreeKnights', '{fars: []}'], ['launchThreeKnights'], ['importPresetGroups'],
        ['resolveOrCreateStudentByName', "'وهمي', {}, []"] ];
    for (const [name, args = ''] of calls) {
        const h = harness('summer'), before = h.snapshot(); h.install(name);
        await h.run(`${name}(${args})`);
        assert.equal(h.snapshot(), before, name); assert.deepEqual(h.localWrites, [], name); assert.deepEqual(h.state.writes, [], name);
        assert.match(h.state.messages.at(-1).message, /مقفل/, name);
    }
    const h = harness('review-day'); h.local.set('almahara_current_knights_v1', 'legacy');
    h.install('loadCurrentThreeKnights'); h.run('loadCurrentThreeKnights()');
    assert.equal(h.local.get('almahara_current_knights_v1'), 'legacy'); assert.deepEqual(h.localWrites, []);
});

test('student/import/settings/season entry points refuse locked writes before reading or changing inputs', async () => {
    for (const name of ['saveSmartMastery', 'saveExamPrepProgress', 'saveSmartProgress', 'saveExamScore', 'resetStudentToday',
        'markPresent', 'saveAttendanceEdit', 'saveStudent', 'saveBulkTierAssign', 'importNuclearBackup', 'startExcelImport',
        'handleExcelImport', 'confirmExcelImport', 'saveProgramSettings', 'resetProgramSettings', 'startNewSeasonFlow', 'applyReclassify',
        'addGeneralSettingRow', 'removeGeneralSettingRow', 'addTierRow', 'removeTierRow', 'addCriterionRow']) {
        const h = harness('summer'), before = h.snapshot(); h.install(name);
        await h.run(`${name}()`);
        assert.equal(h.snapshot(), before, name); assert.deepEqual(h.state.writes, [], name); assert.equal(h.state.prompts, 0, name);
        assert.match(h.state.messages.at(-1).message, /مقفل/, name);
    }
});

test('explicit picker/settings targets cannot write a locked program while general is active', async () => {
    const h = harness(); h.install('deleteArchivedSeason', 'commitProgramSettings');
    for (const id of ['summer', 'review-day']) {
        await h.run(`deleteArchivedSeason('${id}', 'old', 'وهمي')`);
        assert.equal(await h.run(`commitProgramSettings({settings: {}, newName: 'وهمي', seasonName: 'وهمي', prog: {id: '${id}'}, season: {id: 'old'}})`), false);
    }
    assert.deepEqual(h.state.writes, []); assert.equal(h.state.prompts, 0);
});

test('season management hides new-season/settings writes and disables deletion, while archive viewing stays available', () => {
    for (const program of ['summer', 'review-day', 'general']) {
        const h = harness(program);
        const api = h.ctx.window.almahraPrograms;
        api.PROGRAM_DEFS = Object.fromEntries(['summer', 'review-day', 'general'].map(id => [id, {
            icon: '📚', defaultSettings: { points: { attendance: 0 }, kindMult: {}, grades: [] }
        }]));
        api.getSeasons = () => [{ id: 's1', status: 'active' }, { id: 'old', name: 'أرشيف وهمي', status: 'archived' }];
        Object.assign(h.ctx, { getTitleRules: () => ({ blockedByCriteriaIds: [] }),
            renderCriteriaRows() {}, renderTierRows() {}, fillFarsModeSelect() {}, updateSettingsBadges() {} });
        h.run("const DAY_NAMES = ['يوم وهمي']; const FEATURE_LABELS = {};");
        h.install('renderProgramSettings', 'archivedBannerHtml', 'saveBarHtml', 'generalHalaqaRow',
            'refreshGeneralHalaqaOptions', 'collectGeneralSettingRows');
        h.run('renderProgramSettings()');
        const output = h.element('psPanelProgramBody').innerHTML;
        assert.match(output, /onclick="viewArchivedSeason/);
        if (program === 'general') {
            assert.match(output, /onclick="startNewSeasonFlow/);
            assert.match(output, /onclick="saveProgramSettings/);
            assert.doesNotMatch(output, /disabled onclick="deleteArchivedSeason/);
        } else {
            assert.doesNotMatch(output, /onclick="startNewSeasonFlow/);
            assert.doesNotMatch(output, /onclick="saveProgramSettings/);
            assert.match(output, /disabled onclick="deleteArchivedSeason/);
            assert.match(output, /مقفل للكتابة/);
            assert.doesNotMatch(output, /أنت تعرض موسماً مؤرشفاً/);
        }
    }
});

test('backup file started in general cannot replace students after a switch to summer', () => {
    const h = harness(); h.install('importNuclearBackup'); h.run('importNuclearBackup({target: {files: [{}]}})');
    const before = h.snapshot(); h.state.program = 'summer';
    h.state.reader.onload({ target: { result: JSON.stringify([{ id: 9, name: 'بديل وهمي', history: {} }]) } });
    assert.equal(h.snapshot(), before); assert.deepEqual(h.state.writes, []); assert.equal(h.state.prompts, 0);
});

test('pending-save warning appears immediately for program/archive/return transitions, independently of toast timers', () => {
    for (const transition of ["openProgram('summer')", "viewArchivedSeason('general', 'old')", 'backToActiveSeason()']) {
        const h = harness(); h.install('openProgram', 'viewArchivedSeason', 'backToActiveSeason', 'showToast');
        h.run('saveData()'); h.run(transition);
        assert.equal(h.run('_cloudSaveTimeout'), null);
        assert.equal(h.element('pendingSaveWarning').classList.contains('hidden'), false);
        assert.doesNotMatch(h.element('toastText').innerText, /لم يُحفظ/);
        h.advance(5999);
        assert.equal(h.element('pendingSaveWarning').classList.contains('hidden'), false);
        h.advance(1);
        assert.equal(h.element('pendingSaveWarning').classList.contains('hidden'), true);
        assert.deepEqual(h.state.writes, []);
    }
});

test('two transitions 500ms apart keep the cancellation warning visible after 3.3 seconds', () => {
    const h = harness(); h.install('openProgram', 'showToast');
    h.run('saveData(); openProgram("summer")');
    assert.equal(h.element('pendingSaveWarning').classList.contains('hidden'), false);
    h.advance(500); h.run('openProgram("review-day")');
    h.advance(2800);
    assert.equal(h.element('toastMessage').classList.contains('hidden'), true);
    assert.equal(h.element('pendingSaveWarning').classList.contains('hidden'), false);
    assert.deepEqual(h.state.writes, []);
});

test('another cancelled pending save renews the warning timer, and the close button dismisses it', () => {
    const h = harness(); h.install('openProgram', 'showToast');
    h.run('saveData(); openProgram("summer")');
    h.advance(5000);
    h.run('openProgram("general"); saveData(); openProgram("summer")');
    h.advance(5999);
    assert.equal(h.element('pendingSaveWarning').classList.contains('hidden'), false);
    h.advance(1);
    assert.equal(h.element('pendingSaveWarning').classList.contains('hidden'), true);
    h.run('openProgram("general"); saveData(); openProgram("summer"); hidePendingSaveWarning()');
    assert.equal(h.element('pendingSaveWarning').classList.contains('hidden'), true);
    assert.equal(h.run('_pendingSaveWarningTimeout'), null);
    assert.deepEqual(h.state.writes, []);
});

test('no pending save means no cancellation warning, including after a save timer has already fired', () => {
    for (const saved of [false, true]) {
        const h = harness(); h.install('openProgram', 'showToast');
        if (saved) { h.run('saveData()'); h.advance(300); }
        h.run('openProgram("summer")');
        assert.equal(h.element('pendingSaveWarning').classList.contains('hidden'), true);
        h.advance(500); h.run('openProgram("review-day")');
        h.advance(2800);
        assert.equal(h.element('pendingSaveWarning').classList.contains('hidden'), true);
        assert.equal(h.run('_pendingSaveWarningTimeout'), null);
        assert.doesNotMatch(h.element('toastText').innerText, /لم يُحفظ/);
        assert.equal(h.state.writes.length, saved ? 1 : 0);
    }
});
