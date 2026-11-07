// Offline only: production functions, real local Quran measure, synthetic students and fake DOM/cloud.
// Run: node --test tests/*.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replaceAll('\r\n', '\n');
const store = fs.readFileSync(path.join(root, 'programs-store.js'), 'utf8').replaceAll('\r\n', '\n');
const baseline = cp.execFileSync('git', ['show', '6810c38:index.html'], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n');
const { harness: quickHarness, student: quickStudent, entry: quickEntry } = require('./helpers/quick-entry-harness.cjs');
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
const qctx = vm.createContext({ window: {} });
for (const file of ['quran-meta', 'quran-lines', 'quran-words', 'quran-measure'])
    vm.runInContext(fs.readFileSync(path.join(root, 'quran', file + '.js'), 'utf8'), qctx);
const { QURAN_META, QURAN_LINES, QURAN_WORDS, QuranMeasure } = qctx.window;
assert.equal(QuranMeasure.init(QURAN_META, QURAN_LINES, QURAN_WORDS).ok, true);
const today = '2026-11-01', yesterday = '2026-10-31', uid = 'synthetic-admin';
const entry = (kind, at, by = uid, end = 10) => ({ kind, at, by, spec: { from: [67, 1], to: [67, end] }, points: 4, rep: 1 });
const student = (entries = {}) => ({ id: 1, sid: 'synthetic-sid', name: 'طالب وهمي', lastSurah: 114, lastAyah: 1,
    lastSardRange: 'موضع وهمي', history: { [today]: { attended: true, hijri: 'وهمي', criteria: { early: true }, criteriaPoints: 5,
        absence: 'excused', note: 'تبقى', entries } } });
function harness(list = [student()], goldenRepair = true) {
    const state = { program: 'general', uid, settings: { features: { goldenBoard: false, pomodoro: false }, points: { attendance: 0 } },
        writes: [], messages: [], prompts: [], updates: 0, confirm: true, school: true, writable: true, measure: true, archived: false };
    const elements = new Map();
    const element = id => {
        if (elements.has(id)) return elements.get(id);
        const classes = new Set(), attrs = {};
        const el = { value: '', checked: false, disabled: false, textContent: '', innerText: '', innerHTML: '', style: {}, attrs,
            classList: { add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n)),
                contains: n => classes.has(n), toggle(n, on = !classes.has(n)) { if (on) classes.add(n); else classes.delete(n); } },
            setAttribute: (n, v) => { attrs[n] = v; }, removeAttribute: n => { delete attrs[n]; },
            scrollIntoView: options => { state.scrolled = { id, options }; }, focus: () => { state.focused = id; },
            querySelectorAll: () => [] };
        elements.set(id, el); return el;
    };
    const quranMeta = { surahs: { references: QURAN_META.surahs.map((s, i) => ({ number: i + 1, name: QURAN_META.titles[i], numberOfAyahs: s[1] })) } };
    const ctx = vm.createContext({ console, structuredClone, QuranMeasure, quranMeta,
        document: { body: element('body'), getElementById: element,
            querySelectorAll: selector => selector === 'nav .nav-btn' ? [element('mainNav'), element('pomoNav')] : [],
            querySelector: selector => selector.includes('page-pomodoro') ? element('pomoNav') : null },
        window: { almahraAuth: { get currentUser() { return state.uid ? { uid: state.uid } : null; } },
            almahraPrograms: { getCurrentProgramId: () => state.program, getCurrentSeasonId: () => 'season-1',
                getCurrentProgram: () => ({ id: state.program, settings: state.settings }), getSettings: () => state.settings,
                isCurrentSeasonArchived: () => state.archived,
                PROGRAM_DEFS: { general: { defaultSettings: { grades: [] } } } },
            almahraData: { patchStudent: (id, fields) => {
                state.writes.push({ id, fields: copy(fields) });
                return state.pendingWrite || Promise.resolve({ success: true });
            } } },
        prepareSchoolDay: () => state.school, canWriteCloud: () => state.writable,
        canWriteView: () => state.writable, requireSchoolDay: () => state.school, refreshToday() {}, isWriteLockedView: () => state.archived,
        requireQuranMeasure: () => state.measure, measureReady: () => true, closeGeneralWeeklySheetModal() {},
        showToast: (message, type) => state.messages.push({ message, type }),
        confirm: message => { state.prompts.push(message); return state.confirm; },
        updateAllUIs: () => { state.updates++; ctx.updateGeneralUndoButton(); },
        getAttendanceState: () => ({ state: 'present' }), generalAttendanceStart: () => yesterday,
        densityFor: () => null, roundPointTotal: n => n, collectCriteriaFromRows: () => [] });
    const run = code => vm.runInContext(code, ctx);
    run(html.match(/const GOLDEN_BOARD_UNDER_REPAIR = (?:true|false);/)[0].replace('= true', `= ${goldenRepair}`));
    const install = (...names) => names.forEach(name => run(source(name)));
    require('./helpers/tv-harness.cjs').installTv(run, install);
    ctx.fixture = list;
    run(`let students = fixture, currentEditingStudentId = 1, todayStr = '${today}';
        const DEL_FIELD = Object.freeze({ __almahraDelete: true });`);
    run(html.match(/let generalUndoInProgress = false;/)[0]);
    run(html.match(/const generalQuickEntry = .*;/)[0]);
    install('canOpenGeneralFrontierFix', 'updateFrontierFixVisibility');
    run(html.match(/const ivPairs = .*;/)[0]); run(html.match(/const measureEntry = .*;/)[0]); run(html.match(/const rangeLabelOf = .*;/)[0]);
    install('generalValidPoint', 'generalOriginalPosition', 'computeGeneralFrontier', 'generalQuickContext', 'generalQuickContextMatches', 'isGeneralProgram', 'getProgramSettings', 'generalGoldenHidden', 'canWriteHistory', 'applyFieldsLocally', 'restoreStudent', 'commitStudentPatch', 'commitGeneralStudentPatch', 'computeFrontier', 'isFurther', 'endPointOf',
        'pinBaseFields', 'computeLastDaily', 'getGeneralUndoTarget', 'generalUndoLabel', 'updateGeneralUndoButton', 'undoLastGeneralEntry',
        'updateSmartSimplification', 'switchSmartTab', 'dayAccreditationTexts', 'dayStats', 'getDayHarvest', 'saveProgramSettings');
    return { state, ctx, list, run, element, install, undo: () => run('undoLastGeneralEntry()'), target: () => run('getGeneralUndoTarget(students[0])') };
}

test('general defaults are off; legacy programs and migrateSettings are unchanged, existing true stays true without change', () => {
    const oldStore = cp.execFileSync('git', ['show', '6810c38:programs-store.js'], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n');
    const defs = text => text.slice(text.indexOf('export const PROGRAM_DEFS'), text.indexOf('// الحالة الداخلية')).replace('export ', '');
    const ctx = vm.createContext({});
    vm.runInContext(defs(store) + '\n' + source('fillTierMinJuz', store) + '\n' + source('migrateSettings', store) + '\nconst SETTINGS_VERSION = 4;', ctx);
    const current = copy(vm.runInContext('PROGRAM_DEFS', ctx));
    const old = copy(vm.runInNewContext(defs(oldStore) + '\nPROGRAM_DEFS'));
    assert.equal(current.general.defaultSettings.features.goldenBoard, false);
    assert.equal(current.general.defaultSettings.features.pomodoro, false);
    for (const id of ['summer', 'review-day']) assert.deepEqual(current[id], old[id]);
    for (const id of ['general', 'summer', 'review-day']) {
        const settings = { ...copy(old[id].defaultSettings), ...(id === 'general' ? {} : { settingsVersion: 4 }) };
        const before = copy(settings); ctx.settingsFixture = settings; ctx.idFixture = id;
        const result = copy(vm.runInContext('migrateSettings(idFixture, settingsFixture)', ctx));
        assert.equal(result.changed, false, id); assert.deepEqual(result.settings, before); assert.deepEqual(settings, before);
    }
    assert.equal(source('migrateSettings', require('./helpers/board-invariants.cjs').beforeKnightsRound2b(store,'programs-store.js')), source('migrateSettings', oldStore));
    assert.equal(require('./helpers/board-invariants.cjs').beforeBoard(store, 'programs-store.js').replace('goldenBoard: false, attendance: true', 'goldenBoard: true, attendance: true')
        .replace('pomodoro: false, tiers: false', 'pomodoro: true, tiers: false'), oldStore);
});

test('undo selects current user latest today; one entry path plus derived pointers and pinned bases only, twice then no target', async () => {
    const h = harness([student({ first: entry('new', 10), second: entry('review', 20, uid, 15), other: entry('review', 30, 'another-user', 20) })]);
    const before = copy(h.list[0]);
    assert.equal(h.target().id, 'second'); h.run('updateGeneralUndoButton()');
    assert.match(h.element('smartUndoBtn').textContent, /تراجع عن: مراجعة/);
    assert.match(h.element('smartUndoBtn').textContent, /1–15.*النقاط: 4/);
    await h.undo();
    const fields = h.state.writes[0].fields;
    assert.deepEqual(Object.keys(fields).sort(), ['frontierBase', 'lastDailyBase', `history.${today}.entries.second`, 'lastDailySurah', 'lastDailyAyah', 'lastDailySardRange'].sort());
    assert.deepEqual(fields[`history.${today}.entries.second`], { __almahraDelete: true });
    const expected = copy(before); delete expected.history[today].entries.second;
    h.ctx.expected = expected;
    h.run('Object.assign(expected, pinBaseFields(expected))');
    const last = copy(h.run('computeLastDaily(expected)'));
    assert.deepEqual([fields.lastDailySurah, fields.lastDailyAyah, fields.lastDailySardRange], [last.surah, last.ayah, last.range]);
    const remaining = copy(h.list[0].history[today]); delete remaining.entries;
    const original = copy(before.history[today]); delete original.entries;
    assert.deepEqual(remaining, original);
    assert.equal(h.target().id, 'first'); await h.undo();
    assert.deepEqual(Object.keys(h.state.writes[1].fields).sort(), [`history.${today}.entries.first`, 'lastDailySurah', 'lastDailyAyah', 'lastDailySardRange'].sort());
    assert.equal(h.list[0].lastDailyAyah, 20); // Other user's newer recitation still defines the pointer.
    assert.equal(h.target(), null); await h.undo(); assert.equal(h.state.writes.length, 2);
    assert.equal(h.element('smartUndoBtn').disabled, true);
    assert.match(h.element('smartUndoBtn').textContent, /لا يوجد تسجيل لك اليوم/);
    assert.match(h.state.prompts[0], /^التراجع عن: مراجعة، .*1–15 \(النقاط: 4\)؟$/);
    assert.match(h.state.messages[0].message, /^تم التراجع عن: مراجعة/);
    assert.equal(h.state.updates, 2);
});

test('undo button, confirmation and success share points label for whole and fractional values', async () => {
    for (const points of [0, 1, 4, 12, 4.5]) {
        const h = harness([student({ only: { ...entry('new', 10), points } })]);
        const suffix = `(النقاط: ${points.toLocaleString('ar-SA-u-nu-latn', { useGrouping: false })})`;
        h.run('updateGeneralUndoButton()');
        const label = h.run('generalUndoLabel(students[0].history[todayStr].entries.only)');
        assert.ok(label.endsWith(suffix));
        assert.equal(h.element('smartUndoBtn').textContent, '↩ تراجع عن: ' + label);
        await h.undo();
        assert.equal(h.state.prompts[0], 'التراجع عن: ' + label + '؟');
        assert.equal(h.state.messages[0].message, 'تم التراجع عن: ' + label);
    }
});

test('golden visibility reads store features only; the real getProgramSettings projection has no features', () => {
    const h = harness();
    assert.deepEqual(Object.keys(h.run('getProgramSettings()')).sort(),
        ['points', 'workingDays', 'criteria', 'tiers', 'stages', 'teachers', 'halaqas', 'grades', 'kindMult', 'absence'].sort());
    assert.equal(h.run('Object.hasOwn(getProgramSettings(), "features")'), false);
    assert.equal(h.run('window.almahraPrograms.getSettings().features.goldenBoard'), false);
    assert.doesNotMatch(html, /getProgramSettings\(\)\s*(?:\.|\?\.)\s*features/);
    h.install('openPointsBreakdownModal');
    Object.assign(h.ctx, { escapeHTML: value => String(value), getPointsBreakdown: () => ({
        attendanceDays: 0, attendanceBonus: 0, groupBonus: 0, remainingPoints: 4,
        goldenAyahs: 10, goldenRawQuarters: 1, totalPoints: 4
    }) });
    for (const program of ['general', 'summer', 'review-day']) {
        h.state.program = program;
        for (const goldenBoard of [false, true, undefined]) {
            h.state.settings.features.goldenBoard = goldenBoard;
            const hidden = program === 'general' && goldenBoard === false;
            assert.equal(h.run('generalGoldenHidden()'), hidden);
            h.run('updateSmartSimplification(); switchSmartTab("mastery"); openPointsBreakdownModal(1)');
            for (const id of ['tabMasteryBtn', 'smartTabs', 'reportGoldenLegend'])
                assert.equal(h.element(id).style.display, hidden ? 'none' : '', `${program}/${goldenBoard}/${id}`);
            assert.equal(h.element('smartMasterySection').classList.contains('hidden'), true);
            const content = h.element('pbContent').innerHTML;
            assert.equal(content.includes('سرد المسار اليومي + اللوحة الذهبية معاً'), !hidden);
            assert.equal(content.includes('من ضمن البند أعلاه:'), !hidden);
        }
    }
    h.state.program = 'general';
    delete h.state.settings.features;
    assert.equal(h.run('generalGoldenHidden()'), false);
    h.ctx.window.almahraPrograms.getSettings = () => null;
    assert.equal(h.run('generalGoldenHidden()'), false);
});

test('disabling golden while mastery or exam preparation is active selects and styles the daily tab', () => {
    for (const tab of ['mastery', 'examprep']) {
        const h = harness(undefined, false); // عزل إخفاء العام بعد انتهاء الإغلاق المؤقت.
        // Activate the tab before switching from the legacy program to general.
        h.state.program = 'summer'; h.run(`switchSmartTab('${tab}')`);
        assert.equal(h.element('smartDailySection').classList.contains('hidden'), true);
        h.state.program = 'general'; h.run('updateSmartSimplification()');
        assert.equal(h.element('smartDailySection').classList.contains('hidden'), false);
        for (const id of ['smartMasterySection', 'smartExamPrepSection'])
            assert.equal(h.element(id).classList.contains('hidden'), true, id);
        assert.match(h.element('tabDailyBtn').className, /border-emerald-500/);
        for (const id of ['tabMasteryBtn', 'tabExamPrepBtn'])
            assert.doesNotMatch(h.element(id).className, /shadow-sm/);
    }
});

test('undo last recitation returns computeLastDaily pinned fallback from lastSurah/lastAyah; yesterday is never a target', async () => {
    const h = harness([student({ only: entry('new', 20) })]);
    await h.undo();
    assert.deepEqual([h.list[0].lastDailySurah, h.list[0].lastDailyAyah, h.list[0].lastDailySardRange], [114, 1, 'موضع وهمي']);
    assert.deepEqual(copy(h.run('computeLastDaily(students[0])')), { surah: 114, ayah: 1, range: 'موضع وهمي' });
    h.list[0].history[yesterday] = { entries: { old: entry('review', 999, uid, 5) } };
    assert.equal(h.target(), null); await h.undo(); assert.equal(h.state.writes.length, 1);
    const withOld = harness([student({ today: entry('new', 30) })]);
    withOld.list[0].history[yesterday] = { entries: { old: entry('review', 999, uid, 5) } };
    await withOld.undo(); assert.equal(withOld.list[0].lastDailyAyah, 5);
    assert.equal(withOld.list[0].lastDailySardRange, withOld.run('computeLastDaily(students[0]).range'));
});

test('cancel, absent auth, day/cloud/measure guards and legacy programs do not write', async () => {
    for (const [key, value] of [['confirm', false], ['uid', null], ['school', false], ['writable', false], ['measure', false], ['program', 'summer'], ['program', 'review-day']]) {
        const h = harness([student({ only: entry('new', 10) })]), before = copy(h.list);
        h.state[key] = value; await h.undo(); assert.equal(h.state.writes.length, 0, key); assert.deepEqual(h.list, before);
    }
});

test('two clicks during pending undo send one request; success applies locally and enables the next undo', async () => {
    const h = harness([student({ first: entry('new', 10), second: entry('review', 20) })]), before = copy(h.list);
    let resolveWrite;
    h.state.pendingWrite = new Promise(resolve => { resolveWrite = resolve; });
    const pending = h.undo(); await h.undo();
    assert.equal(h.state.writes.length, 1); assert.equal(h.state.prompts.length, 1);
    assert.deepEqual(h.list, before); assert.equal(h.target().id, 'second');
    h.run('updateGeneralUndoButton()');
    assert.equal(h.element('smartUndoBtn').disabled, true);
    assert.equal(h.element('smartUndoBtn').textContent, 'جارٍ التراجع…');
    assert.equal(h.state.updates, 0); assert.deepEqual(h.state.messages, []);
    resolveWrite({ success: true }); await pending;
    assert.equal(h.target().id, 'first'); assert.equal(h.state.updates, 1);
    assert.equal(h.element('smartUndoBtn').disabled, false);
    assert.match(h.element('smartUndoBtn').textContent, /تراجع عن: حفظ جديد/);
    assert.equal(h.state.messages.length, 1); assert.equal(h.state.messages[0].type, 'success');
    await h.undo(); assert.equal(h.state.writes.length, 2); assert.equal(h.target(), null);
});

test('pending general undo blocks quick save before all work; completion restores saving and consistent lastDaily pointers', async () => {
    const h = quickHarness(quickStudent({ first: quickEntry('new', [114, 1], [78, 10], 'good', 10),
        second: quickEntry('review', [114, 1], [78, 20], 'good', 20) }));
    const before = copy(h.s); let release;
    h.state.pending = new Promise(resolve => { release = resolve; }); const pending = h.run('undoLastGeneralEntry()');
    assert.equal(h.element('generalQuickSaveBtn').disabled, true);
    const prepare = h.ctx.prepareSchoolDay;
    h.ctx.prepareSchoolDay = () => assert.fail('blocked quick save must return before preparing the day');
    await h.save(); assert.equal(h.state.writes.length, 1); assert.deepEqual(h.s, before);
    h.ctx.prepareSchoolDay = prepare; release({ success: true }); await pending; h.state.pending = null;
    assert.equal(h.element('generalQuickSaveBtn').disabled, false);
    h.range('new', null, [78, 25]); h.grade('new'); h.preview(); await h.save();
    assert.equal(h.state.writes.length, 2); assert.equal(h.s.lastDailyAyah, 25);
    assert.deepEqual({ surah: h.s.lastDailySurah, ayah: h.s.lastDailyAyah, range: h.s.lastDailySardRange },
        copy(h.run('computeLastDaily(students[0])')));
});

test('pending general undo does not disable or guard legacy saving', () => {
    const h = harness(); h.install('saveSmartProgress'); h.run('generalUndoInProgress = true');
    for (const program of ['summer', 'review-day']) {
        h.state.program = program; h.run('updateGeneralUndoButton()');
        assert.equal(h.element('smartSaveBtn').disabled, false);
        let prepared = false;
        h.ctx.prepareSchoolDay = () => { prepared = true; return false; };
        h.run('saveSmartProgress()'); assert.equal(prepared, true); assert.deepEqual(h.state.messages, []);
    }
});

test('two clicks then cloud failure leave the student unchanged, re-enable undo and allow retry', async () => {
    for (const rejects of [false, true]) {
        const h = harness([student({ first: entry('new', 10), second: entry('review', 20) })]), before = copy(h.list);
        let resolveWrite, rejectWrite;
        h.state.pendingWrite = new Promise((resolve, reject) => { resolveWrite = resolve; rejectWrite = reject; });
        const pending = h.undo(); await h.undo();
        assert.equal(h.state.writes.length, 1); assert.equal(h.state.prompts.length, 1);
        assert.deepEqual(h.list, before); assert.equal(h.element('smartUndoBtn').disabled, true);
        assert.equal(h.element('smartSaveBtn').disabled, true);
        assert.equal(h.element('smartUndoBtn').textContent, 'جارٍ التراجع…');
        if (rejects) rejectWrite(new Error('synthetic failure'));
        else resolveWrite({ success: false, error: 'synthetic failure' });
        await pending;
        assert.deepEqual(h.list, before); assert.equal(h.target().id, 'second');
        assert.equal(h.element('smartUndoBtn').disabled, false);
        assert.equal(h.element('smartSaveBtn').disabled, false);
        assert.match(h.element('smartUndoBtn').textContent, /تراجع عن: مراجعة/);
        assert.equal(h.state.updates, 0);
        assert.deepEqual(h.state.messages, [{ message: 'فشل الحفظ السحابي: synthetic failure', type: 'error' }]);
        h.state.pendingWrite = null; await h.undo();
        assert.equal(h.state.writes.length, 2); assert.equal(h.target().id, 'first');
        assert.equal(h.state.writes[1].fields.lastDailyAyah, 10);
    }
});

test('day changes during confirmation: prepareSchoolDay refreshes it and cancels without writing', async () => {
    for (const nextIsSchoolDay of [true, false]) {
        const h = harness([student({ only: entry('new', 10) })]);
        // Use the real day preparation; midnight happens while the confirmation is open.
        h.install('prepareSchoolDay');
        let civilDay = today, refreshes = 0;
        h.ctx.refreshToday = () => { refreshes++; h.run(`todayStr = '${civilDay}'`); };
        h.list[0].history['2026-11-02'] = { entries: { only: entry('review', 20) } };
        const before = copy(h.list);
        h.ctx.confirm = () => { civilDay = '2026-11-02'; h.state.school = nextIsSchoolDay; return true; };
        await h.undo();
        assert.equal(refreshes, 2); assert.equal(h.run('todayStr'), civilDay);
        assert.equal(h.state.writes.length, 0); assert.deepEqual(h.list, before);
        assert.deepEqual(h.state.messages, [{ message: 'تغيّر اليوم أو التسجيل؛ أعد المحاولة', type: 'error' }]);
        assert.match(h.element('smartUndoBtn').textContent, /تراجع عن: مراجعة/);
        assert.equal(h.state.updates, 0);
    }
});

test('target changes during confirmation: cancel without writing and refresh the undo button', async () => {
    const h = harness([student({ only: entry('new', 10) })]);
    h.ctx.confirm = () => { h.list[0].history[today].entries.newer = entry('review', 20); return true; };
    await h.undo();
    assert.equal(h.state.writes.length, 0); assert.equal(h.target().id, 'newer');
    assert.deepEqual(Object.keys(h.list[0].history[today].entries), ['only', 'newer']);
    assert.deepEqual(h.state.messages, [{ message: 'تغيّر اليوم أو التسجيل؛ أعد المحاولة', type: 'error' }]);
    assert.equal(h.element('smartUndoBtn').disabled, false);
    assert.match(h.element('smartUndoBtn').textContent, /تراجع عن: مراجعة/);
});

test('general hides reset, golden tab/section/orphan bar/legend and pomodoro; legacy reset is visible and its function unchanged', () => {
    const h = harness([student({ only: entry('new', 10) })]);
    h.install('applyProgramFeatures');
    h.run('applyProgramFeatures(); switchSmartTab("mastery")');
    for (const id of ['smartResetRow', 'tabMasteryBtn', 'smartTabs', 'reportGoldenLegend', 'pomoNav']) assert.equal(h.element(id).style.display, 'none', id);
    assert.equal(h.element('smartMasterySection').classList.contains('hidden'), true);
    assert.equal(h.element('smartDailySection').classList.contains('hidden'), false);
    assert.equal(h.element('smartUndoRow').classList.contains('hidden'), false);
    for (const program of ['summer', 'review-day']) {
        h.state.program = program; h.run('updateSmartSimplification()');
        for (const id of ['smartResetRow', 'tabMasteryBtn', 'smartTabs', 'reportGoldenLegend']) assert.equal(h.element(id).style.display, '', id);
        assert.equal(h.element('smartUndoRow').classList.contains('hidden'), true);
    }
    h.state.program = 'general'; h.state.settings.features.goldenBoard = true;
    h.run('updateSmartSimplification()'); assert.equal(h.element('smartTabs').style.display, '');
    assert.equal(source('resetStudentToday'), source('resetStudentToday', baseline));
    assert.match(source('openSmartModal'), /updateSmartSimplification\(\)/);
    assert.match(source('applyProgramFeatures'), /updateSmartSimplification\(\)/);
});

test('applyProgramFeatures hides and restores pomodoro in general and legacy programs exactly as the baseline', () => {
    for (const program of ['general', 'summer', 'review-day']) {
        const h = harness(), old = harness();
        h.install('applyProgramFeatures'); old.run(source('applyProgramFeatures', baseline));
        h.state.program = old.state.program = program;
        for (const pomodoro of [false, true, false]) {
            h.state.settings.features.pomodoro = old.state.settings.features.pomodoro = pomodoro;
            h.run('applyProgramFeatures()'); old.run('applyProgramFeatures()');
            assert.equal(h.element('pomoNav').style.display, pomodoro ? '' : 'none', program);
            assert.equal(h.element('pomoNav').style.display, old.element('pomoNav').style.display, program);
        }
    }
});

test('golden messages and today harvest respect general switch; points readers and legacy behavior are unchanged', () => {
    const h = harness();
    const day = { attended: true, sardAccreditation: 'اعتماد وهمي', entries: {
        daily: entry('review', 1), golden: { ...entry('golden', 2), label: 'ذهبية وهمية' }, exam: { label: 'اختبار وهمي', kind: 'exam', points: 0, at: 3 } } };
    h.list[0].history[today] = day; h.ctx.dayFixture = day;
    assert.deepEqual(copy(h.run('dayAccreditationTexts(dayFixture)')), ['اختبار وهمي']);
    const expected = QuranMeasure.measure({ spec: day.entries.daily.spec });
    const harvest = copy(h.run('getDayHarvest(todayStr)'));
    assert.equal(harvest.ayahs, expected.ayahs); assert.equal(harvest.pages, expected.pages); assert.equal(harvest.quarters, expected.quarters);
    h.state.settings.features.goldenBoard = true;
    assert.equal(h.run('getDayHarvest(todayStr).ayahs'), expected.ayahs * 2);
    assert.deepEqual(copy(h.run('dayAccreditationTexts(dayFixture)')), ['اعتماد وهمي', 'ذهبية وهمية', 'اختبار وهمي']);
    for (const program of ['summer', 'review-day']) {
        h.state.program = program; h.state.settings.features.goldenBoard = false;
        assert.equal(h.run('getDayHarvest(todayStr).ayahs'), expected.ayahs * 2);
        assert.equal(h.run('dayAccreditationTexts(dayFixture).length'), 3);
    }
    // Only the exact manager-approved general quick-entry and undo guards are exempt.
    const quickGuard = "            if (isGeneralProgram()) { showToast('استعمل نموذج التسجيل الجديد', 'error'); return; }\n";
    const guard = "            if (isGeneralProgram() && generalUndoInProgress) { showToast('انتظر حتى ينتهي التراجع', 'error'); return; }\n";
    assert.ok(source('saveSmartProgress').startsWith('function saveSmartProgress() {\n' + quickGuard + guard));
    assert.equal(source('saveSmartProgress').replace(quickGuard, '').replace(guard, ''), source('saveSmartProgress', baseline));
    for (const name of ['buildEntryPatch', 'getCumulativeStats', 'getPointsBreakdown', 'dayStats', 'commitStudentPatch'])
        assert.equal(source(name, require('./helpers/board-invariants.cjs').beforeKnightsRound2b(html)), source(name, baseline), name);
    assert.match(source('openPointsBreakdownModal'), /generalGoldenHidden\(\)/);
    // General reports, daily production and Excel already use new/review-only quantities.
    for (const name of ['renderReportsTable', 'exportToExcel', 'computeComplexStats']) assert.match(source(name), /generalRecitation(?:Html|Totals)/);
});

test('t17 rejects all three cases with precise message, red field, scroll and focus before any settings write', async () => {
    for (const [kind, names, message] of [['teacher', [''], 'معلم بلا اسم'], ['stage', [''], 'مرحلة بلا اسم'], ['stage', [], 'أبقِ مرحلة واحدة على الأقل']]) {
        const h = harness(); h.state.settings.grades = [];
        h.element('psTvMaghrib').value = '20'; h.element('psTvIsha').value = '30';
        for (const id of ['psPtAtt', 'psMultNew', 'psMultRev']) h.element(id).value = '0';
        h.ctx.collectGeneralSettingRows = k => (k === kind ? names : ['اسم وهمي']).map((name, i) => ({ id: k + i, name }));
        h.ctx.collectGeneralHalaqaRows = () => [];
        const input = h.element('empty-' + kind); input.value = '   ';
        const boxId = kind === 'stage' ? 'psStagesList' : 'psTeachersList';
        h.element(boxId).querySelectorAll = () => names.map(() => input);
        await h.run('saveProgramSettings()');
        assert.equal(h.state.messages.at(-1).message, message);
        assert.equal(h.state.writes.length, 0);
        const expectedId = names.length ? 'empty-' + kind : boxId;
        assert.equal(h.state.scrolled.id, expectedId); assert.equal(h.state.focused, expectedId);
        if (names.length) { assert.equal(input.classList.contains('border-red-500'), true); assert.equal(input.attrs['aria-invalid'], 'true'); }
        else assert.equal(h.element(boxId).attrs.tabindex, '-1');
    }
});

test('login direction, green program card and compact mobile role are wired to their existing UI sources', async () => {
    const loginCss = /#loginOverlay input\[type="email"\],\s*#loginOverlay input\[type="password"\]\s*\{([^}]+)\}/.exec(html)[1];
    assert.match(loginCss, /direction: ltr/); assert.match(loginCss, /text-align: left/);
    assert.match(html, /\.ep-new-general \{[^}]*#10b981/);
    const mobileCss = [...html.matchAll(/@media \(max-width: 720px\) \{([\s\S]*?)\n        \}/g)].map(m => m[1]).find(css => css.includes('#authUserInfo'));
    assert.match(mobileCss, /#authUserInfo > span:first-of-type, #authUserInfo > i \{\s*display: none;/);
    assert.match(mobileCss, /#authUserInfo \{[^}]*max-width: none;[^}]*overflow: visible;/);
    assert.match(mobileCss, /#authUserInfo > span:last-of-type \{[^}]*flex-shrink: 0/);
    assert.doesNotMatch(mobileCss, /text-overflow:\s*ellipsis|max-width:\s*\d/);
    assert.match(mobileCss, /\.app-header \{\s*padding-inline: 8px; gap: 8px;/);
    assert.match(mobileCss, /#authUserBar \{\s*gap: 4px;/);
    assert.match(mobileCss, /#currentEventBadge \{\s*padding: 6px 8px; gap: 4px;/);
    assert.doesNotMatch(mobileCss, /#authUserInfo \{[^}]*display: none/);
    const withoutMobile = text => text.replace(/@media \(max-width: 720px\) \{[\s\S]*?\n        \}/, '');
    const headerCss = text => text.slice(text.indexOf('        .app-header {'), text.indexOf('        .tab-content {'));
    assert.equal(withoutMobile(headerCss(html)), withoutMobile(headerCss(baseline)), 'desktop header CSS stays unchanged');
    const h = harness(); h.install('renderEventsList'); h.ctx.escapeHTML = value => String(value);
    const programs = h.ctx.window.almahraPrograms;
    Object.assign(programs, { isReady: () => true, countStudents: async () => 0,
        PROGRAM_DEFS: Object.fromEntries(['summer', 'general', 'review-day'].map(id => [id, { icon: '', name: id }])),
        getPrograms: () => Object.fromEntries(['summer', 'general', 'review-day'].map(id => [id, { name: id, activeSeasonId: 's1' }])),
        getSeasons: () => [{ id: 's1', status: 'active', name: 'موسم وهمي' }] });
    await h.run('renderEventsList()');
    const output = h.element('epProgramsList').innerHTML;
    assert.match(output, /class="ep-new-btn ep-new-general" onclick="openProgram\('general'\)/);
    assert.match(output, /class="ep-new-btn ep-new-summer" onclick="openProgram\('summer'\)/);
    assert.match(output, /class="ep-new-btn ep-new-review" onclick="openProgram\('review-day'\)/);
});
