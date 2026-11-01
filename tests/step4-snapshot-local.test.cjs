// Offline only: extracted production functions, synthetic settings/students and fake cloud writes.
// Run: node --test tests/step4-snapshot-local.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const programsStore = fs.readFileSync(path.join(__dirname, '..', 'programs-store.js'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
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
function settings() {
    return { teachers: [{ id: 't1', name: 'معلم وهمي أول' }, { id: 't2', name: 'معلم وهمي ثان' }],
        stages: [{ id: 'g1', name: 'مرحلة وهمية أولى' }, { id: 'g2', name: 'مرحلة وهمية ثانية' }],
        halaqas: [{ id: 'h1', name: 'حلقة وهمية', teacherId: 't1', stageId: 'g1', active: true }],
        points: { attendance: 0 }, kindMult: { newMemorization: 1, review: 1 },
        grades: [{ id: 'good', name: 'تقدير وهمي', percent: 100 }], features: {} };
}
const oldEntry = () => ({ kind: 'new', iv: [1, 1], rep: 1, points: 5, grade: 'good', mult: 1, heardBy: 't1' });
const student = (id = 1, fields = {}) => ({ id, sid: `synthetic-${id}`, name: 'طالب وهمي',
    halaqaId: 'h1', teacherId: 't1', stage: 'g1', history: { '2026-10-31': { entries: { old: oldEntry() } } }, ...fields });
function harness() {
    const state = { program: 'general', season: 's1', settings: settings(), all: [], messages: [], writes: [],
        prompts: [], closed: 0, reads: 0, sequence: 0, updates: 0, ready: true, dataStudents: [] };
    state.draft = copy(state.settings);
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, { value: '', innerText: '', checked: false, disabled: false,
            options: [{ text: 'اسم وهمي' }], selectedIndex: 0, classList: { add() {}, remove() {}, toggle() {} } });
        return elements.get(id);
    };
    const write = async (kind, ...args) => {
        state.writes.push({ kind, args: copy(args) });
        return state.write ? state.write(kind, ...args) : { success: true };
    };
    const prog = { id: 'general', name: 'برنامج وهمي', get settings() { return state.settings; }, set settings(v) { state.settings = v; } };
    const programs = { getCurrentProgramId: () => state.program, getCurrentSeasonId: () => state.season,
        getCurrentProgram: () => state.program === 'general' ? prog : { id: state.program },
        getCurrentSeason: () => ({ id: state.season, name: 'موسم وهمي' }), getSettings: () => state.settings,
        getAllStudents: async () => copy(state.all), isCurrentSeasonArchived: () => false,
        PROGRAM_DEFS: { general: { defaultSettings: settings() } },
        updateSettings: (...args) => write('settings', ...args) };
    const ctx = vm.createContext({ console, structuredClone, document: { getElementById: element, querySelectorAll: () => [] },
        window: { almahraPrograms: programs, almahraAuth: { currentUser: { uid: 'synthetic-admin' } },
            almahraData: { getActiveProgramId: () => state.program, getActiveSeasonId: () => state.dataSeason || state.season,
                isReady: () => state.ready, getStudents: () => [...state.dataStudents],
                commitBatch: (...args) => write('batch', ...args), patchStudent: (...args) => write('patch', ...args) } },
        confirm: message => { state.prompts.push(message); return state.confirm !== false; }, setTimeout() {},
        canWriteView: () => state.program === 'general', canWriteCloud: () => state.program === 'general',
        getProgramSettings: () => { state.reads++; return state.read ? state.read() : state.settings; },
        showToast: (message, type) => state.messages.push({ message, type }),
        collectGeneralSettingRows: kind => copy(state.draft[kind === 'teacher' ? 'teachers' : 'stages']),
        collectGeneralHalaqaRows: () => copy(state.draft.halaqas), collectCriteriaFromRows: () => [],
        updateAllUIs: () => state.updates++, applyProgramFeatures() {}, updateCurrentEventBadge() {},
        pinBaseFields: () => ({}), newEntryId: () => `entry-${++state.sequence}`,
        requireQuranMeasure: () => true,
        calculateRangeStats: () => ({ lines: 1, totalAyahs: 1, intervals: [[1, 1]] }),
        measureEntry: () => ({ ayahs: 1, lines: 1 }), generalEntryPoints: () => ({ points: 5, mult: 1 }),
        roundPointTotal: n => n, getCriteriaSelection: () => ({}), calculateQuran() {},
        closeSmartModal: () => state.closed++, escapeHTML: value => String(value),
        getCumulativeStats: () => ({ tripPoints: 5 }), getStudentRank: () => 1,
        confetti: { create: () => () => {} } });
    const run = code => vm.runInContext(code, ctx);
    const install = (...names) => names.forEach(name => run(source(name)));
    run("let students = [], generalSettingsHalaqaBaseline = null; const DEL_FIELD = { __almahraDelete: true }; const todayStr = '2026-11-01', hijriDateStr = 'تاريخ وهمي', criteriaAtOpen = { sel: {} }; let currentEditingStudentId = 1, currentSardType = 'new';");
    install('isGeneralProgram', 'getStudentHalaqa', 'generalRecitationTeacher', 'normalizeArabicKey',
        'cleanCellText', 'validateGeneralHalaqas', 'generalTeacherIsUsed', 'saveProgramSettings', 'commitProgramSettings',
        'generalHalaqaStudentPatches', 'syncGeneralHalaqaStudents', 'makeEntry', 'buildEntryPatch', 'saveSmartProgress',
        'applyFieldsLocally', 'commitStudentPatch', 'canWriteHistory', 'restoreStudent');
    for (const id of ['psPtAtt', 'psMultNew', 'psMultRev']) element(id).value = '0';
    element('psGrade_good').value = '100';
    for (const id of ['startSurah', 'endSurah', 'startAyah', 'endAyah']) element(id).value = '1';
    element('smartGrade').value = 'good'; element('resWeightedPoints').innerText = '5';
    return { state, ctx, run, install, element,
        setStudents(list) { state.dataStudents = list; ctx.inputStudents = list; run('students = inputStudents'); },
        save: () => run('saveProgramSettings()'), recite: () => run('saveSmartProgress()'),
        refreshDraft() { state.draft = copy(state.settings); },
        validate(next, previous = state.settings.halaqas) {
            Object.assign(ctx, { next, previous });
            return run('validateGeneralHalaqas(next, getProgramSettings().teachers, getProgramSettings().stages, previous, students, students)');
        } };
}
const stampedEntry = h => h.state.writes.find(w => w.kind === 'patch').args[1]['history.2026-11-01.entries.entry-1'];

test('general sard stamps all three fields from one settings read, despite stale student stage and teacher', () => {
    const h = harness(), s = student(1, { stage: 'g2', teacherId: 't2' }); h.setStudents([s]);
    const first = copy(h.state.settings), second = copy(first);
    second.halaqas[0].stageId = 'g2'; second.halaqas[0].teacherId = 't2';
    h.state.read = () => h.state.reads === 1 ? first : second;
    // الحارس مفحوص مستقلاً؛ هنا نحصي قراءة الحفظ وحدها.
    h.ctx.canWriteHistory = () => true;
    const wait = deferred(); h.state.write = () => wait.promise;
    assert.equal(h.recite(), undefined); assert.equal(h.state.closed, 1);
    assert.equal(h.state.reads, 1);
    const entry = stampedEntry(h);
    assert.equal(entry.halaqaId, 'h1'); assert.equal(entry.stageId, 'g1'); assert.equal(entry.heardBy, 't1');
    assert.equal(entry.grade, 'good'); assert.equal(entry.mult, 1); assert.equal(entry.points, 5);
    assert.deepEqual(entry.iv, [1, 1]); assert.equal(entry.by, 'synthetic-admin');
    assert.equal(JSON.stringify(entry).includes('undefined'), false);
    wait.resolve({ success: true });
});

for (const program of ['summer', 'review-day']) {
    test(`${program} new sard keeps its existing shape without snapshot fields`, () => {
        const h = harness(); h.state.program = program; h.ctx.canWriteCloud = () => true; h.setStudents([student()]);
        h.recite(); const entry = stampedEntry(h);
        for (const key of ['halaqaId', 'stageId', 'heardBy', 'grade', 'mult']) assert.equal(key in entry, false);
        assert.equal(h.state.reads, 0);
    });
}

test('central builder stamps golden and exam when active, allows absent/inactive membership, and leaves old entries intact', () => {
    for (const kind of ['golden', 'exam']) {
        for (const membership of ['active', 'absent', 'inactive']) {
            const h = harness(), s = student(); const before = copy(s);
            if (membership === 'absent') delete s.halaqaId;
            if (membership === 'inactive') h.state.settings.halaqas[0].active = false;
            Object.assign(h.ctx, { s, entry: { kind, iv: [[1, 1]], points: 5 } });
            const patch = h.run("buildEntryPatch(s, todayStr, entry)");
            const entry = patch['history.2026-11-01.entries.entry-1'];
            assert.equal('halaqaId' in entry, membership === 'active');
            assert.equal('stageId' in entry, membership === 'active');
            if (membership === 'active') { assert.equal(entry.halaqaId, 'h1'); assert.equal(entry.stageId, 'g1'); }
            assert.deepEqual(s.history, before.history);
            assert.equal(Object.keys(patch).some(k => k.includes('2026-10-31')), false);
        }
    }
    assert.equal((html.match(/buildEntryPatch\(student, todayStr,/g) || []).length, 3);
});

test('used teacher change confirms today, appends exactly one audit and batches current season copies without touching history', async () => {
    const h = harness(), current = student(), archived = student(99), archivedBefore = copy(archived), history = copy(current.history);
    h.setStudents([current]); h.state.all = [copy(current), archived];
    h.state.draft.halaqas[0].teacherId = 't2';
    const before = Date.now(); await h.save(); const after = Date.now();
    assert.deepEqual(h.state.writes.map(w => w.kind), ['settings', 'batch']);
    const records = h.state.settings.halaqas[0].teacherHistory;
    assert.equal(records.length, 1);
    assert.deepEqual({ ...records[0], at: 0 }, { from: 't1', to: 't2', effective: '2026-11-01', by: 'synthetic-admin', at: 0 });
    assert.ok(records[0].at >= before && records[0].at <= after);
    assert.deepEqual(h.state.prompts, ['سيصير معلم وهمي ثان معلم حلقة حلقة وهمية من اليوم. التسميعات السابقة تبقى باسم معلم وهمي أول.']);
    assert.deepEqual(h.state.writes[1].args[0], [{ type: 'update', id: 1, fields: { teacherId: 't2', stage: 'g1' } }]);
    assert.equal(current.teacherId, 't2'); assert.deepEqual(current.history, history); assert.deepEqual(archived, archivedBefore);
    h.recite(); assert.equal(stampedEntry(h).heardBy, 't2');
    assert.equal(current.history['2026-10-31'].entries.old.heardBy, 't1');
});

test('canceling confirmation writes nothing, and used stage remains locked even for archived-only students', async () => {
    const h = harness(); h.state.all = [student()]; h.state.confirm = false; h.state.draft.halaqas[0].teacherId = 't2';
    await h.save(); assert.deepEqual(h.state.writes, []);
    const locked = harness(); locked.state.all = [student(99)]; locked.state.draft.halaqas[0].stageId = 'g2';
    await locked.save(); assert.deepEqual(locked.state.writes, []);
    assert.equal(locked.state.messages.at(-1).message, 'لا يمكن تغيير مرحلة حلقة مستعملة؛ أنشئ حلقة جديدة');
});

const record = () => ({ from: 't2', to: 't1', effective: '2026-10-30', by: 'synthetic-admin', at: 123 });
test('unchanged settings preserve complete teacher history; deletion, editing, insertion and reordering are rejected', async () => {
    const h = harness(); h.state.settings.halaqas[0].teacherHistory = [record(), { ...record(), at: 124 }]; h.refreshDraft();
    const before = copy(h.state.settings.halaqas[0].teacherHistory);
    await h.save(); assert.deepEqual(h.state.settings.halaqas[0].teacherHistory, before);
    for (const change of [
        row => { delete row.teacherHistory; }, row => row.teacherHistory.pop(),
        row => { row.teacherHistory[0].by = 'forged'; }, row => row.teacherHistory.push(record()),
        row => row.teacherHistory.reverse()
    ]) {
        h.refreshDraft(); change(h.state.draft.halaqas[0]); h.state.writes = []; await h.save();
        assert.deepEqual(h.state.writes, []); assert.match(h.state.messages.at(-1).message, /سجل إسناد المعلم/);
        assert.deepEqual(h.state.settings.halaqas[0].teacherHistory, before);
    }
    const next = copy(h.state.settings.halaqas);
    next[0].teacherHistory[0] = Object.fromEntries(Object.entries(next[0].teacherHistory[0]).reverse());
    assert.equal(h.validate(next), null); // ترتيب مفاتيح الكائن لا يغيّر الإسناد.
    const fresh = harness(); fresh.state.draft.halaqas[0].teacherHistory = [];
    await fresh.save(); assert.deepEqual(fresh.state.writes, []);
});

test('a longer teacher history arriving from another device rejects the old form with reopen guidance and preserves the latest audit', async () => {
    const h = harness(), wait = deferred();
    h.state.settings.halaqas[0].teacherHistory = [record()]; h.refreshDraft();
    h.ctx.opening = h.state.settings;
    h.run("generalSettingsHalaqaBaseline = { programId: 'general', seasonId: 's1', settings: opening, halaqas: structuredClone(opening.halaqas), missingIds: [], complete: false }");
    h.setStudents([student()]);
    h.ctx.window.almahraPrograms.getAllStudents = () => wait.promise;
    const saving = h.save();
    const latest = copy(h.state.settings);
    latest.halaqas[0].teacherId = 't2';
    latest.halaqas[0].teacherHistory.push({ from: 't1', to: 't2', effective: '2026-11-01', by: 'synthetic-other-admin', at: 456 });
    const expected = copy(latest);
    h.state.settings = latest; wait.resolve([student()]); await saving;
    assert.deepEqual(h.state.writes, []);
    assert.match(h.state.messages.at(-1).message, /أعد فتح الإعدادات/);
    assert.deepEqual(h.state.settings, expected);
    assert.equal(h.state.draft.halaqas[0].teacherHistory.length, 1);
    assert.equal(h.state.settings.halaqas[0].teacherHistory.length, 2);
});

test('UI collection preserves history from opening snapshot and default reset preserves nested history', async () => {
    const h = harness(); h.state.settings.halaqas[0].teacherHistory = [record()];
    const baseline = copy(h.state.settings.halaqas);
    h.ctx.baseline = baseline;
    h.run('generalSettingsHalaqaBaseline = { halaqas: baseline }');
    const fields = { '.halaqa-name': { value: 'اسم مصحح' }, '.halaqa-teacher': { value: 't1' },
        '.halaqa-stage': { value: 'g1' }, '.halaqa-active': { checked: true } };
    h.ctx.document.querySelectorAll = () => [{ dataset: { id: 'h1' }, querySelector: key => fields[key] }];
    h.install('collectGeneralHalaqaRows');
    const rows = h.run('collectGeneralHalaqaRows()');
    assert.deepEqual(copy(rows[0].teacherHistory), baseline[0].teacherHistory);
    rows[0].teacherHistory[0].by = 'changed'; assert.equal(baseline[0].teacherHistory[0].by, 'synthetic-admin');
    const start = programsStore.indexOf('    resetSettings: async (programId) => {');
    const end = programsStore.indexOf('\n    },', start) + '\n    },'.length;
    const calls = [], ctx = vm.createContext({ db: {}, PROGRAMS: 'programs', SETTINGS_VERSION: 1,
        PROGRAM_DEFS: { general: { defaultSettings: {} } }, programsCache: { general: { settings: h.state.settings } },
        doc: () => 'synthetic-ref', updateDoc: async (...args) => calls.push(copy(args)) });
    vm.runInContext('const api = {\n' + programsStore.slice(start, end) + '\n};', ctx);
    assert.equal((await vm.runInContext("api.resetSettings('general')", ctx)).success, true);
    assert.deepEqual(calls[0][1].settings.halaqas, h.state.settings.halaqas);
});

test('failed or thrown student batch leaves copies intact, and a later unchanged save repairs them without another audit', async () => {
    for (const throws of [false, true]) {
        const h = harness(), s = student(1, { stage: 'g2' }), beforeHistory = copy(s.history); h.setStudents([s]);
        h.state.draft.halaqas[0].teacherId = 't2';
        h.element('psProgName').value = 'اسم برنامج جديد'; h.element('psSeasonName').value = 'اسم موسم جديد';
        h.state.write = async kind => {
            if (kind === 'batch') { if (throws) throw Error('فشل وهمي'); return { success: false, error: 'فشل وهمي' }; }
            return { success: true };
        };
        await h.save();
        assert.equal(h.state.settings.halaqas[0].teacherId, 't2'); assert.equal(s.teacherId, 't1'); assert.equal(s.stage, 'g2');
        assert.match(h.state.messages.at(-1).message, /حُفظت الإعدادات.*احفظ الإعدادات مرة أخرى/);
        assert.match(h.state.messages.at(-1).message, /لم يُحفظ تعديل اسم البرنامج أو الموسم إن وُجد/);
        assert.deepEqual(h.state.writes.map(w => w.kind), ['settings', 'batch']);
        const audit = copy(h.state.settings.halaqas[0].teacherHistory);
        h.element('psProgName').value = ''; h.element('psSeasonName').value = '';
        h.refreshDraft(); h.state.write = null; await h.save();
        assert.equal(s.teacherId, 't2'); assert.equal(s.stage, 'g1'); assert.deepEqual(s.history, beforeHistory);
        assert.deepEqual(h.state.settings.halaqas[0].teacherHistory, audit); assert.equal(h.state.prompts.length, 1);
        h.state.writes = []; await h.save(); assert.deepEqual(h.state.writes.map(w => w.kind), ['settings']);
    }
});

test('retry from the same settings UI keeps acknowledged history and repairs copies without reopening or editing rows', async () => {
    const h = harness(), s = student(); h.setStudents([s]);
    h.ctx.opening = h.state.settings;
    h.run("generalSettingsHalaqaBaseline = { programId: 'general', seasonId: 's1', settings: opening, halaqas: structuredClone(opening.halaqas), missingIds: [], complete: false }");
    const fields = { '.halaqa-name': { value: 'حلقة وهمية' }, '.halaqa-teacher': { value: 't2' },
        '.halaqa-stage': { value: 'g1' }, '.halaqa-active': { checked: true } };
    h.ctx.document.querySelectorAll = selector => selector.includes('general-halaqa-row')
        ? [{ dataset: { id: 'h1' }, querySelector: key => fields[key] }] : [];
    h.install('collectGeneralHalaqaRows');
    h.state.write = async kind => ({ success: kind !== 'batch', error: 'فشل وهمي' });
    await h.save(); assert.equal(s.teacherId, 't1'); assert.equal(h.state.settings.halaqas[0].teacherHistory.length, 1);
    h.state.write = null; await h.save();
    assert.equal(s.teacherId, 't2'); assert.equal(h.state.settings.halaqas[0].teacherHistory.length, 1);
    assert.equal(h.state.prompts.length, 1);
});

test('a second reassignment appends to old history and an archived-only halaqa produces no student batch', async () => {
    const h = harness(); h.state.all = [student(99)];
    h.state.settings.halaqas[0].teacherHistory = [record()]; h.refreshDraft();
    h.state.draft.halaqas[0].teacherId = 't2'; await h.save();
    assert.deepEqual(h.state.writes.map(w => w.kind), ['settings']);
    assert.equal(h.state.settings.halaqas[0].teacherHistory.length, 2);
    assert.deepEqual(h.state.settings.halaqas[0].teacherHistory[0], record());
});

test('copy batches wait for settings success and cloud batch success; failed settings write creates no batch', async () => {
    const h = harness(), s = student(), wait = deferred(); h.setStudents([s]); h.state.draft.halaqas[0].teacherId = 't2';
    h.state.write = kind => kind === 'batch' ? wait.promise : { success: true };
    const saving = h.save(); await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(h.state.writes.map(w => w.kind), ['settings', 'batch']);
    assert.equal(s.teacherId, 't1'); assert.equal(h.state.messages.length, 0);
    wait.resolve({ success: true }); await saving; assert.equal(s.teacherId, 't2');
    const failed = harness(); failed.setStudents([student()]); failed.state.draft.halaqas[0].teacherId = 't2';
    failed.state.write = () => ({ success: false, error: 'فشل الإعدادات' }); await failed.save();
    assert.deepEqual(failed.state.writes.map(w => w.kind), ['settings']);
    assert.equal(failed.state.settings.halaqas[0].teacherId, 't1');
});

test('450 repairs use one batch; 451 are refused before settings with no partial writes', async () => {
    for (const count of [450, 451]) {
        const h = harness(); const list = Array.from({ length: count }, (_, i) => student(i + 1, { stage: 'g2' }));
        h.setStudents(list); await h.save();
        if (count === 450) {
            assert.deepEqual(h.state.writes.map(w => w.kind), ['settings', 'batch']); assert.equal(h.state.writes[1].args[0].length, 450);
        } else {
            assert.deepEqual(h.state.writes, []); assert.match(h.state.messages.at(-1).message, /٤٥٠/);
            assert.ok(list.every(s => s.stage === 'g2'));
        }
    }
});

test('switching seasons during settings confirmation never batches into the new season', async () => {
    const h = harness(), s = student(), wait = deferred(); h.setStudents([s]); h.state.draft.halaqas[0].teacherId = 't2';
    h.state.write = () => wait.promise;
    const saving = h.save(); await new Promise(resolve => setImmediate(resolve));
    h.state.season = 'other'; h.setStudents([student(9)]); wait.resolve({ success: true }); await saving;
    assert.deepEqual(h.state.writes.map(w => w.kind), ['settings']); assert.equal(s.teacherId, 't1');
    assert.match(h.state.messages.at(-1).message, /تغيّر الموسم/);
});

test('returning from archive before the current season snapshot sends no batch and reports retry instead of success', async () => {
    const h = harness(), wait = deferred(), current = student(1, { halaqaId: 'h2', teacherId: 't2', stage: 'g2' });
    h.state.settings.halaqas.push({ id: 'h2', name: 'حلقة ثانية وهمية', teacherId: 't2', stageId: 'g2', active: true });
    h.refreshDraft(); h.state.draft.halaqas[0].teacherId = 't2'; h.setStudents([current]);
    h.state.write = () => wait.promise;
    const saving = h.save(); await new Promise(resolve => setImmediate(resolve));
    h.state.season = 'archive'; h.setStudents([student(1)]);
    h.state.season = 's1'; h.state.ready = false; h.state.dataStudents = [];
    let collections = 0;
    h.ctx.window.almahraData.getStudents = () => { collections++; return []; };
    wait.resolve({ success: true }); await saving;
    assert.deepEqual(h.state.writes.map(w => w.kind), ['settings']);
    assert.equal(collections, 0);
    assert.equal(current.stage, 'g2');
    assert.match(h.state.messages.at(-1).message, /حُفظت الإعدادات.*احفظ الإعدادات مرة أخرى لإصلاحها/);
    assert.equal(h.state.messages.some(m => m.message.startsWith('✅')), false);
});

test('the 450 preflight refuses an unready snapshot without collecting stale displayed students', async () => {
    const h = harness(); h.setStudents(Array.from({ length: 451 }, (_, i) => student(i + 1, { stage: 'g2' })));
    h.state.ready = false; h.state.dataStudents = [];
    let collections = 0;
    h.ctx.window.almahraData.getStudents = () => { collections++; return []; };
    await h.save();
    assert.deepEqual(h.state.writes, []);
    assert.equal(collections, 0);
    assert.match(h.state.messages.at(-1).message, /لم تُحفظ الإعدادات.*احفظ الإعدادات مرة أخرى لإصلاحها/);
    assert.doesNotMatch(h.state.messages.at(-1).message, /٤٥٠/);
});

test('both the 450 preflight and the batch use ready store students instead of the displayed list', async () => {
    for (const count of [1, 451]) {
        const h = harness(); h.setStudents([]);
        h.state.dataStudents = Array.from({ length: count }, (_, i) => student(i + 1, { stage: 'g2' }));
        await h.save();
        if (count === 1) {
            assert.deepEqual(h.state.writes.map(w => w.kind), ['settings', 'batch']);
            assert.deepEqual(h.state.writes[1].args[0], [{ type: 'update', id: 1, fields: { teacherId: 't1', stage: 'g1' } }]);
        } else {
            assert.deepEqual(h.state.writes, []); assert.match(h.state.messages.at(-1).message, /٤٥٠/);
        }
    }
});

test('student session mismatch and a late count over 450 report acknowledged settings without sending a partial batch', async () => {
    for (const mismatch of [false, true]) {
        const h = harness(), wait = deferred(); h.setStudents([student(1, { stage: 'g2' })]);
        h.state.write = () => wait.promise;
        const saving = h.save(); await new Promise(resolve => setImmediate(resolve));
        if (mismatch) h.state.dataSeason = 'other';
        else h.setStudents(Array.from({ length: 451 }, (_, i) => student(i + 1, { stage: 'g2' })));
        wait.resolve({ success: true }); await saving;
        assert.deepEqual(h.state.writes.map(w => w.kind), ['settings']);
        assert.match(h.state.messages.at(-1).message, /حُفظت الإعدادات.*احفظ الإعدادات مرة أخرى/);
    }
});

test('canWriteHistory guard validates entry fields: accepts old entries and optional text snapshots, rejects non-text snapshots', () => {
    const h = harness();
    for (const stamp of [{}, { halaqaId: 'historical-halaqa', stageId: 'historical-stage' }, { halaqaId: 'h1' }]) {
        h.ctx.patch = { 'history.2026-10-31.entries.old': { ...oldEntry(), ...stamp } };
        assert.equal(h.run('canWriteHistory(patch)'), true);
    }
    for (const key of ['halaqaId', 'stageId']) {
        for (const value of [null, 1, [], {}]) {
            h.ctx.patch = { 'history.2026-10-31.entries.old': { ...oldEntry(), [key]: value } };
            assert.equal(h.run('canWriteHistory(patch)'), false);
            assert.match(h.state.messages.at(-1).message, /يجب أن يكون نصاً/);
        }
    }
});
