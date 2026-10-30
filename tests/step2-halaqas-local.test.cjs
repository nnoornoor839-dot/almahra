// Offline only: production functions with synthetic students, fake DOM and cloud writes.
// Run: node --test tests/step2-halaqas-local.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const dataStore = fs.readFileSync(path.join(root, 'data-store.js'), 'utf8');
const programsStore = fs.readFileSync(path.join(root, 'programs-store.js'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const settleOpeningRead = () => new Promise(resolve => setImmediate(resolve));
// كما في select: تعيين قيمة غير موجودة يلغي الاختيار، وإعادة بناء الخيارات تختار أولها.
function realisticSelect(element) {
    let markup = '', options = [], value = '';
    const decode = text => text.replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&amp;', '&');
    Object.defineProperties(element, {
        innerHTML: { get: () => markup, set(html) {
            markup = html;
            options = [...html.matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)]
                .map(match => ({ value: decode(match[1]), text: decode(match[2]) }));
            value = options[0]?.value || '';
        } },
        options: { get: () => options },
        value: { get: () => value, set(next) { value = options.some(option => option.value === String(next)) ? String(next) : ''; } },
        selectedIndex: { get: () => options.findIndex(option => option.value === value) }
    });
    return element;
}
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
        halaqas: [{ id: 'halaqa-one', name: 'حلقة وهمية أولى', teacherId: 't1', stageId: 'g1', active: true }],
        points: { attendance: 0 }, kindMult: { newMemorization: 1, review: 1 },
        grades: [{ id: 'good', name: 'تقدير وهمي', percent: 100 }], criteria: [], features: {} };
}
function harness() {
    const state = { program: 'general', season: 's1', settings: settings(), all: [], messages: [], writes: [],
        ready: true, archived: false, updates: 0, closed: 0, uuid: 0 };
    state.draft = copy(state.settings);
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) {
            const node = { value: '', innerText: '', innerHTML: '', textContent: '',
            disabled: false, checked: false, dataset: {}, style: {}, options: [{ text: 'اسم وهمي' }], selectedIndex: 0,
            classList: { add() {}, remove() {}, replace() {}, toggle() {} }, focus() {} };
            elements.set(id, id === 'studentHalaqaInput' ? realisticSelect(node) : node);
        }
        return elements.get(id);
    };
    const write = async (name, ...args) => {
        state.writes.push({ name, args: copy(args) });
        return state.write ? state.write(name, ...args) : { success: true };
    };
    const programs = { getCurrentProgramId: () => state.program, getCurrentSeasonId: () => state.season,
        getCurrentProgram: () => ({ id: state.program, name: 'برنامج وهمي', settings: state.settings }),
        getCurrentSeason: () => ({ id: state.season, name: 'موسم وهمي' }), getSettings: () => state.settings,
        getSeasons: () => [],
        getAllStudents: async () => copy(state.all), isCurrentSeasonArchived: () => state.archived,
        getDefaultSettings: () => settings(), PROGRAM_DEFS: { general: { defaultSettings: settings() } },
        updateSettings: (...args) => write('settings', ...args), resetSettings: (...args) => write('reset', ...args) };
    const ctx = vm.createContext({ console, structuredClone, TextEncoder, document: { getElementById: element,
        querySelectorAll: () => [] }, window: { almahraPrograms: programs, almahraData: {
            patchStudent: (...args) => write('patch', ...args), createGeneralStudentIfAbsent: (...args) => write('create', ...args) } },
        crypto: { randomUUID: () => `fake-uuid-${++state.uuid}` }, confirm: () => true, setTimeout() {},
        showToast: (message, type) => state.messages.push({ message, type }),
        canWriteView: () => state.program === 'general' && !state.archived,
        canWriteCloud: () => state.ready && state.program === 'general' && !state.archived,
        getProgramSettings: () => state.settings, canWriteHistory: () => true,
        escapeHTML: v => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
        collectGeneralSettingRows: kind => state.draft[kind === 'teacher' ? 'teachers' : 'stages'],
        collectGeneralHalaqaRows: () => state.draft.halaqas, collectCriteriaFromRows: () => [],
        updateAllUIs: () => state.updates++, closeStudentModal: () => state.closed++,
        applyProgramFeatures() {}, updateCurrentEventBadge() {}, renderProgramSettings() {},
        tiersFeatureOn: () => false, parseTierMin: () => null,
        requireQuranMeasure: () => true, calculateRangeStats: () => ({ lines: 1, totalAyahs: 1, intervals: [[1, 1]] }),
        generalEntryPoints: () => ({ points: 5, mult: 1 }), roundPointTotal: n => n,
        getCumulativeStats: () => ({ tripPoints: 5 }), getStudentRank: () => 1,
        confetti: { create: () => () => { state.celebrations = (state.celebrations || 0) + 1; } },
        getCriteriaSelection: () => ({}), calculateQuran() {}, closeSmartModal: () => state.closed++,
        buildEntryPatch: (student, date, entry) => ({ [`history.${date}.entries.fake-entry`]: entry }),
        refreshGeneralHalaqaOptions() {} });
    const run = code => vm.runInContext(code, ctx);
    const install = (...names) => names.forEach(name => vm.runInContext(source(name), ctx));
    run("let students = []; const DEL_FIELD = {__almahraDelete: true}; let currentEditingStudentId = 1; const todayStr = 'fake-day', hijriDateStr = 'تاريخ وهمي', criteriaAtOpen = {sel: {}}; let currentSardType = 'new';");
    run(html.match(/let generalStudentSaveInFlight = false;/)[0]);
    run(html.slice(html.indexOf('        let generalSettingsHalaqaBaseline ='), html.indexOf('        function renderProgramSettings()')));
    install('isGeneralProgram', 'getStudentHalaqa', 'generalHalaqaLabel', 'generalStudentHalaqaHtml',
        'generalRecitationTeacher', 'generalStudentMembership', 'cleanCellText', 'normalizeArabicKey',
        'normalizeSaudiPhone', 'noLevelReason', 'studentsWithoutLevel', 'validateGeneralHalaqas',
        'saveProgramSettings', 'commitProgramSettings', 'fillStudentGeneralFields', 'saveStudent',
        'commitGeneralStudentPatch', 'commitStudentPatch', 'restoreStudent', 'applyFieldsLocally', 'saveSmartProgress',
        'generalTeacherIsUsed', 'removeGeneralSettingRow', 'analyzeGeneralImportRows', 'resetProgramSettings');
    for (const id of ['psPtAtt', 'psMultNew', 'psMultRev']) element(id).value = '0';
    element('psGrade_good').value = '100'; element('studentNameInput').value = 'طالب وهمي';
    run('fillStudentGeneralFields(null)');
    element('studentHalaqaInput').value = 'halaqa-one';
    for (const id of ['startSurah', 'endSurah', 'startAyah', 'endAyah']) element(id).value = '1';
    element('smartGrade').value = 'good'; element('resWeightedPoints').innerText = '5';
    return { state, ctx, run, install, element,
        openSettings() {
            Object.assign(ctx, { DAY_NAMES: [], FEATURE_LABELS: {}, isWriteLockedView: () => state.archived,
                getTitleRules: () => ({}), renderCriteriaRows() {}, renderTierRows() {}, fillFarsModeSelect() {}, updateSettingsBadges() {} });
            install('renderProgramSettings', 'generalSettingRow', 'generalHalaqaRow', 'archivedBannerHtml', 'saveBarHtml');
            run('renderProgramSettings()');
        },
        setStudents(list) { ctx.syntheticStudents = list; run('students = syntheticStudents'); },
        student: () => ({ id: 1, sid: 'fake-sid', name: 'طالب وهمي', halaqaId: 'halaqa-one', teacherId: 't2', stage: 'g2', history: {} }),
        saveSettings: () => run('saveProgramSettings()'), saveStudent: () => run('saveStudent()'), saveRecitation: () => run('saveSmartProgress()') };
}

test('settings save rejects blank/normalized duplicate names, duplicate active pair and missing references', async () => {
    const cases = [
        [d => { d.halaqas[0].name = '  '; }, /اسم الحلقة مطلوب/],
        [d => { d.halaqas[0].name = 'أَحـمد'; d.halaqas.push({ ...d.halaqas[0], id: 'halaqa-two', name: 'احمد', teacherId: 't2' }); }, /اسم الحلقة مكرر/],
        [d => { d.halaqas.push({ ...d.halaqas[0], id: 'halaqa-two', name: 'أخرى' }); }, /حلقتين فعّالتين/],
        [d => { d.halaqas.push({ id: 'halaqa-new', name: '', teacherId: '', stageId: '', active: true }); }, /^اسم الحلقة مطلوب$/],
        [d => { d.halaqas[0].teacherId = 'missing'; }, /^معلم الحلقة أو مرحلتها غير موجود في القائمتين$/],
        [d => { d.halaqas[0].stageId = 'missing'; }, /^معلم الحلقة أو مرحلتها غير موجود في القائمتين$/]
    ];
    for (const [change, message] of cases) {
        const h = harness(); change(h.state.draft); await h.saveSettings();
        assert.equal(h.state.writes.length, 0); assert.match(h.state.messages.at(-1).message, message);
    }
    const h = harness(); h.state.draft.halaqas.push({ ...h.state.draft.halaqas[0], id: 'halaqa-two', name: 'موقوفة', active: false });
    await h.saveSettings(); assert.equal(h.state.writes[0].name, 'settings');
});

test('used halaqa teacher/stage cannot change in any season; name correction always saves the same ID', async () => {
    for (const field of ['teacherId', 'stageId']) {
        const h = harness(); h.state.all = [h.student()]; h.state.draft.halaqas[0][field] = field === 'teacherId' ? 't2' : 'g2';
        await h.saveSettings(); assert.equal(h.state.writes.length, 0);
        assert.equal(h.state.messages.at(-1).message, 'تغيير معلم الحلقة يأتي بإسناد مؤرّخ (الخطوة ٤)');
    }
    const h = harness(); h.state.all = [h.student()]; h.state.draft.halaqas[0].name = 'تصحيح اسم وهمي';
    await h.saveSettings(); assert.equal(h.state.writes.length, 1);
    assert.equal(h.state.writes[0].args[1].halaqas[0].id, 'halaqa-one');
    assert.equal(h.state.writes[0].args[1].halaqas[0].name, 'تصحيح اسم وهمي');
    const unused = harness(); unused.state.draft.halaqas[0].teacherId = 't2';
    await unused.saveSettings(); assert.equal(unused.state.writes.length, 1);
    const inactive = harness(); inactive.state.settings.halaqas[0].active = false;
    inactive.state.draft = copy(inactive.state.settings); inactive.state.draft.halaqas[0].name = 'تصحيح اسم حلقة موقوفة';
    inactive.setStudents([inactive.student()]); await inactive.saveSettings();
    assert.equal(inactive.state.writes.length, 1);
});

test('no halaqa deletion; only empty current-season halaqas can be deactivated; inactive references block deletion', async () => {
    const removed = harness(); removed.state.draft.halaqas = []; await removed.saveSettings();
    assert.equal(removed.state.writes.length, 0);
    assert.equal(removed.state.messages.at(-1).message, 'تغيّرت الحلقات من جهاز آخر؛ أعد فتح الإعدادات');
    const activeStudent = harness(); activeStudent.setStudents([activeStudent.student()]); activeStudent.state.draft.halaqas[0].active = false;
    await activeStudent.saveSettings(); assert.equal(activeStudent.state.writes.length, 0); assert.match(activeStudent.state.messages.at(-1).message, /الموسم الجاري/);
    const archiveOnly = harness(); archiveOnly.state.all = [archiveOnly.student()]; archiveOnly.state.draft.halaqas[0].active = false;
    await archiveOnly.saveSettings(); assert.equal(archiveOnly.state.writes.length, 1);
    for (const field of ['teachers', 'stages']) {
        const h = harness(); h.state.settings.halaqas[0].active = false; h.state.draft = copy(h.state.settings);
        h.state.draft[field].shift(); await h.saveSettings();
        assert.equal(h.state.writes.length, 0);
        assert.equal(h.state.messages.at(-1).message, 'معلم الحلقة أو مرحلتها غير موجود في القائمتين');
    }
});

for (const local of [true, false]) {
    for (const edit of ['rename', 'add', 'attendance']) {
        test(`pre-existing missing halaqa in ${local ? 'local students' : 'another season'} allows ${edit}`, async () => {
            const h = harness(), orphan = { ...h.student(), halaqaId: 'halaqa-already-missing' };
            if (local) h.setStudents([orphan]);
            else h.state.all = [orphan];
            h.openSettings();
            await settleOpeningRead();
            assert.equal(h.run('generalSettingsHalaqaBaseline.complete'), true);
            assert.equal(h.state.writes.length, 0);
            assert.match(h.element('psPanelTiersBody').innerHTML, /إدارة الحلقات/);
            if (edit === 'rename') h.state.draft.halaqas[0].name = 'اسم مصحح';
            if (edit === 'add') h.state.draft.halaqas.push({ id: 'halaqa-new', name: 'حلقة جديدة', teacherId: 't2', stageId: 'g2', active: true });
            if (edit === 'attendance') h.element('psPtAtt').value = '7';
            await h.saveSettings();
            assert.equal(h.state.writes.length, 1);
            assert.equal(h.state.writes[0].name, 'settings');
            const saved = h.state.writes[0].args[1];
            assert.deepEqual(saved.halaqas, h.state.draft.halaqas);
            assert.equal(saved.points.attendance, edit === 'attendance' ? 7 : 0);
            assert.equal(h.state.messages.at(-1).message, '✅ حُفظت الإعدادات');
        });
    }
}

test('opening snapshot protects a used halaqa even if latest settings lose it during the wait', async () => {
    const h = harness(), wait = deferred();
    h.openSettings();
    h.state.draft.halaqas = [];
    h.ctx.window.almahraPrograms.getAllStudents = () => wait.promise;
    const saving = h.saveSettings();
    h.state.settings.halaqas.length = 0;
    wait.resolve([h.student()]); await saving;
    assert.equal(h.state.writes.length, 0);
    assert.equal(h.state.messages.at(-1).message, 'تغيّرت الحلقات من جهاز آخر؛ أعد فتح الإعدادات');
});

test('a reference arriving after opening requires a known missing local reference to be exempt', async () => {
    for (const knownMissing of [false, true]) {
        const h = harness();
        h.openSettings();
        h.state.settings.halaqas = []; h.state.draft.halaqas = [];
        if (knownMissing) h.setStudents([h.student()]);
        h.openSettings();
        // ظهور المرجع في موسم آخر وحده لا يثبت أنه كان مفقوداً عند الفتح.
        h.state.all = [h.student()];
        await h.saveSettings();
        assert.equal(h.state.writes.length, knownMissing ? 1 : 0);
        assert.equal(h.state.messages.at(-1).message, knownMissing ? '✅ حُفظت الإعدادات'
            : 'تغيّرت الحلقات من جهاز آخر؛ أعد فتح الإعدادات');
    }
});

test('known missing reference is protected if its halaqa reappears in latest settings', async () => {
    const h = harness(), wait = deferred(), latest = copy(h.state.settings);
    h.state.settings.halaqas = []; h.state.draft.halaqas = [];
    h.setStudents([h.student()]); h.openSettings();
    h.ctx.window.almahraPrograms.getAllStudents = () => wait.promise;
    const saving = h.saveSettings();
    h.state.settings = latest; wait.resolve([]); await saving;
    assert.equal(h.state.writes.length, 0);
    assert.equal(h.state.messages.at(-1).message, 'تغيّرت الحلقات من جهاز آخر؛ أعد فتح الإعدادات');
});

test('stale settings cannot remove a halaqa referenced by all-season or local students after awaiting', async () => {
    for (const local of [false, true]) {
        const h = harness(), wait = deferred(), latest = copy(h.state.settings);
        h.state.settings.halaqas = []; h.state.draft.halaqas = [];
        h.openSettings();
        h.ctx.window.almahraPrograms.getAllStudents = () => wait.promise;
        const saving = h.saveSettings();
        // جهاز آخر ينشئ الحلقة ويربط بها طالباً بينما فحص الطلاب معلّق.
        h.state.settings = latest;
        if (local) h.setStudents([h.student()]);
        wait.resolve(local ? [] : [h.student()]); await saving;
        assert.equal(h.state.writes.length, 0);
        assert.equal(h.state.messages.at(-1).message, 'تغيّرت الحلقات من جهاز آخر؛ أعد فتح الإعدادات');
    }
});

test('stale settings cannot remove a new halaqa from the latest program even without students', async () => {
    const h = harness(), wait = deferred(), latest = copy(h.state.settings);
    h.state.settings.halaqas = []; h.state.draft.halaqas = [];
    h.openSettings();
    h.ctx.window.almahraPrograms.getAllStudents = () => wait.promise;
    const saving = h.saveSettings();
    h.state.settings = latest; wait.resolve([]); await saving;
    assert.equal(h.state.writes.length, 0);
    assert.equal(h.state.messages.at(-1).message, 'تغيّرت الحلقات من جهاز آخر؛ أعد فتح الإعدادات');
});

test('Sol: a new local or all-season reference arriving during save is rejected before settings update', async () => {
    for (const local of [false, true]) {
        const h = harness(), wait = deferred();
        h.state.settings.halaqas = []; h.state.draft.halaqas = [];
        h.openSettings(); await settleOpeningRead();
        assert.equal(h.run('generalSettingsHalaqaBaseline.complete'), true);
        h.ctx.window.almahraPrograms.getAllStudents = () => wait.promise;
        const saving = h.saveSettings();
        if (local) h.setStudents([h.student()]);
        wait.resolve(local ? [] : [h.student()]); await saving;
        assert.deepEqual(h.state.settings.halaqas, []);
        assert.equal(h.state.writes.length, 0);
        assert.equal(h.state.messages.at(-1).message, 'تغيّرت الحلقات من جهاز آخر؛ أعد فتح الإعدادات');
    }
});

test('pending or failed opening reads exempt only missing references captured locally at opening', async () => {
    for (const failed of [false, true]) {
        for (const local of [false, true]) {
            const h = harness(), opening = deferred(), orphan = { ...h.student(), halaqaId: 'already-missing' };
            h.state.all = [orphan];
            if (local) h.setStudents([orphan]);
            h.ctx.window.almahraPrograms.getAllStudents = failed
                ? async () => { throw Error('فشل وهمي'); } : () => opening.promise;
            h.openSettings(); await settleOpeningRead();
            assert.match(h.element('psPanelTiersBody').innerHTML, /إدارة الحلقات/);
            assert.equal(h.run('generalSettingsHalaqaBaseline.complete'), false);
            assert.deepEqual(h.state.messages, []);
            h.ctx.window.almahraPrograms.getAllStudents = async () => copy(h.state.all);
            await h.saveSettings();
            assert.equal(h.state.writes.length, local ? 1 : 0);
            assert.equal(h.state.messages.at(-1).message, local ? '✅ حُفظت الإعدادات'
                : 'تغيّرت الحلقات من جهاز آخر؛ أعد فتح الإعدادات');
            opening.resolve([]);
        }
    }
});

test('late opening results cannot complete or contaminate a newer displayed snapshot', async () => {
    for (const newerComplete of [false, true]) {
        const h = harness(), oldOpening = deferred(), newOpening = deferred();
        h.state.settings.halaqas = []; h.state.draft.halaqas = [];
        h.ctx.window.almahraPrograms.getAllStudents = () => oldOpening.promise;
        h.openSettings();
        h.ctx.oldBaseline = h.run('generalSettingsHalaqaBaseline');
        h.state.settings = copy(h.state.settings);
        h.ctx.window.almahraPrograms.getAllStudents = () => newOpening.promise;
        h.openSettings();
        assert.equal(h.run('generalSettingsHalaqaBaseline === oldBaseline'), false);
        assert.equal(h.run('generalSettingsHalaqaBaseline.settings'), h.state.settings);
        if (newerComplete) { newOpening.resolve([]); await settleOpeningRead(); }
        oldOpening.resolve([h.student()]); await settleOpeningRead();
        assert.equal(h.run('generalSettingsHalaqaBaseline.complete'), newerComplete);
        assert.equal(h.run('generalSettingsHalaqaBaseline.allSeasonMissingIds.size'), 0);
        h.ctx.window.almahraPrograms.getAllStudents = async () => [h.student()];
        await h.saveSettings();
        assert.equal(h.state.writes.length, 0);
        assert.equal(h.state.messages.at(-1).message, 'تغيّرت الحلقات من جهاز آخر؛ أعد فتح الإعدادات');
        newOpening.resolve([]);
    }
});

test('opening results from another program or season cannot supply exceptions', async () => {
    for (const switched of ['program', 'season']) {
        const h = harness(), opening = deferred();
        h.ctx.window.almahraPrograms.getAllStudents = () => opening.promise;
        h.openSettings(); h.state[switched] = switched === 'program' ? 'summer' : 's2';
        opening.resolve([{ ...h.student(), halaqaId: 'already-missing' }]); await settleOpeningRead();
        assert.equal(h.run('generalSettingsHalaqaBaseline.complete'), false);
        assert.equal(h.run('generalSettingsHalaqaBaseline.allSeasonMissingIds.size'), 0);
    }
});

test('re-rendering settings during save invalidates its captured snapshot', async () => {
    const h = harness(), wait = deferred();
    h.openSettings(); await settleOpeningRead();
    h.ctx.window.almahraPrograms.getAllStudents = () => wait.promise;
    const saving = h.saveSettings();
    h.openSettings(); wait.resolve([]); await saving;
    assert.equal(h.state.writes.length, 0);
    assert.equal(h.state.messages.at(-1).message, 'تغيّرت الحلقات من جهاز آخر؛ أعد فتح الإعدادات');
});

test('used halaqa locks compare teacher, stage and activation with settings received during the wait', async () => {
    for (const field of ['teacherId', 'stageId', 'active']) {
        const h = harness(), wait = deferred(), latest = copy(h.state.settings);
        h.setStudents([h.student()]);
        if (field === 'active') h.state.settings.halaqas[0].active = h.state.draft.halaqas[0].active = false;
        else latest.halaqas[0][field] = field === 'teacherId' ? 't2' : 'g2';
        h.ctx.window.almahraPrograms.getAllStudents = () => wait.promise;
        const saving = h.saveSettings(); h.state.settings = latest;
        wait.resolve([h.student()]); await saving;
        assert.equal(h.state.writes.length, 0);
        assert.equal(h.state.messages.at(-1).message, field === 'active'
            ? 'لا يمكن إيقاف حلقة عليها طالب في الموسم الجاري' : 'تغيير معلم الحلقة يأتي بإسناد مؤرّخ (الخطوة ٤)');
    }
});

test('settings wait for cloud confirmation and report failure without success', async () => {
    const h = harness(), wait = deferred(); h.state.write = () => wait.promise;
    const saving = h.saveSettings(); await Promise.resolve(); await Promise.resolve();
    assert.equal(h.state.messages.length, 0);
    wait.resolve({ success: false, error: 'فشل وهمي' }); await saving;
    assert.equal(h.state.messages.length, 1); assert.equal(h.state.messages[0].type, 'error');
});

test('deletion uses current halaqa references after reassigning an unused teacher or stage', async () => {
    for (const [kind, field, list, replacement] of [
        ['teacher', 'teacherId', 'teachers', 't2'], ['stage', 'stageId', 'stages', 'g2']
    ]) {
        const h = harness();
        const removedId = h.state.settings.halaqas[0][field];
        h.state.draft.halaqas[0][field] = replacement;
        let removed = false;
        h.ctx.button = { closest: () => ({ dataset: { id: removedId }, remove() {
            removed = true; h.state.draft[list].shift();
        } }) };
        await h.run(`removeGeneralSettingRow(button, '${kind}')`);
        assert.equal(removed, true); assert.deepEqual(h.state.messages, []);
        await h.saveSettings();
        assert.equal(h.state.writes.length, 1);
        assert.equal(h.state.writes[0].args[1].halaqas[0][field], replacement);
        assert.equal(h.state.writes[0].args[1][list].some(row => row.id === removedId), false);
    }
});

test('deletion still protects inactive halaqas and saved halaqas whose form rows are missing', async () => {
    for (const kind of ['teacher', 'stage']) {
        for (const missingRow of [false, true]) {
            const h = harness(); h.state.settings.halaqas[0].active = false;
            h.state.draft = copy(h.state.settings);
            if (missingRow) h.state.draft.halaqas = [];
            let removed = false;
            h.ctx.button = { closest: () => ({ dataset: { id: kind === 'teacher' ? 't1' : 'g1' }, remove() { removed = true; } }) };
            await h.run(`removeGeneralSettingRow(button, '${kind}')`);
            assert.equal(removed, false);
            assert.equal(h.state.messages.at(-1).message, 'لا يمكن حذف مرحلة أو معلم مرتبط بحلقة، ولو كانت موقوفة');
        }
    }
});

test('recitation uses commitStudentPatch and closes immediately while cloud is pending, with unchanged entry shape and rollback', async () => {
    const production = source('saveSmartProgress');
    assert.match(production, /^function saveSmartProgress\(/);
    assert.doesNotMatch(production, /\bawait\b|commitGeneralStudentPatch/);
    assert.ok(production.indexOf('commitStudentPatch(student, fields)') < production.indexOf('closeSmartModal()'));
    const h = harness(), student = h.student(); h.setStudents([student]); h.element('smartHeardBy').value = 't2';
    const before = copy(student);
    const wait = deferred(); h.state.write = () => wait.promise;
    assert.equal(h.saveRecitation(), undefined);
    assert.equal(h.state.closed, 1); assert.equal(h.state.updates, 1); assert.equal(h.state.celebrations, 1);
    const entry = h.state.writes[0].args[1]['history.fake-day.entries.fake-entry'];
    assert.equal(entry.heardBy, 't1'); assert.equal(entry.grade, 'good'); assert.equal(entry.mult, 1); assert.equal(entry.points, 5);
    assert.equal('halaqaId' in entry, false); assert.equal('stageId' in entry, false);
    assert.equal(student.history['fake-day'].entries['fake-entry'].heardBy, 't1');
    wait.resolve({ success: false, error: 'فشل وهمي' });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(student, before); assert.equal(h.state.messages.at(-1).type, 'error');
    const success = harness(); success.setStudents([success.student()]);
    const successWait = deferred(); success.state.write = () => successWait.promise;
    success.saveRecitation();
    assert.equal(success.state.closed, 1); assert.equal(success.state.celebrations, 1);
    successWait.resolve({ success: true }); await new Promise(resolve => setImmediate(resolve));
    assert.equal(success.state.messages.some(m => m.type === 'error'), false);
});

test('recitation refuses absent/missing/inactive halaqas and a missing teacher, including discipline-only', async () => {
    for (const kind of ['absent', 'missing', 'inactive', 'teacher']) {
        for (const disciplineOnly of [false, true]) {
            const h = harness(), student = h.student();
            if (kind === 'absent') delete student.halaqaId;
            if (kind === 'missing') student.halaqaId = 'missing';
            if (kind === 'inactive') h.state.settings.halaqas[0].active = false;
            if (kind === 'teacher') h.state.settings.teachers = [];
            h.setStudents([student]); h.element('disciplineOnlyCheck').checked = disciplineOnly;
            await h.saveRecitation(); assert.equal(h.state.writes.length, 0);
            assert.equal(h.state.messages.at(-1).message, 'اربط الطالب بحلقة فعّالة أولاً');
        }
    }
});

test('student editor locks an existing halaqa; a legacy match is only suggested and never auto-saved', () => {
    const h = harness(), student = { ...h.student(), teacherId: 't1', stage: 'g1' };
    h.ctx.input = student; h.run('fillStudentGeneralFields(input)');
    assert.equal(h.element('studentHalaqaInput').disabled, true);
    assert.match(h.element('studentHalaqaNote').textContent, /النقل بين الحلقات/);
    delete student.halaqaId; h.run('fillStudentGeneralFields(input)');
    assert.equal(h.element('studentHalaqaInput').disabled, false); assert.equal(h.element('studentHalaqaInput').value, 'halaqa-one');
    assert.equal(h.state.writes.length, 0); assert.equal('halaqaId' in student, false);
    h.state.settings.halaqas[0].active = false; h.run('fillStudentGeneralFields(input)');
    assert.equal(h.element('studentHalaqaInput').value, '');
    student.halaqaId = 'removed'; h.run('fillStudentGeneralFields(input)');
    assert.equal(h.element('studentHalaqaInput').disabled, false);
    assert.match(h.element('studentHalaqaNote').textContent, /حلقته السابقة غير موجودة/);
});

test('heard-by label and field are both hidden for general, independently of stale student teacher', () => {
    const h = harness(); h.install('refreshGeneralRecitationFields'); h.ctx.input = h.student();
    const toggles = [];
    h.element('smartHeardByWrap').classList.toggle = (name, active) => toggles.push([name, active]);
    h.run('refreshGeneralRecitationFields(input, getProgramSettings(), true)');
    assert.deepEqual(toggles, [['hidden', true]]); assert.equal(h.element('smartHeardBy').value, 't1');
});

test('student save preserves unchanged membership, derives copies for new students, rejects transfer and waits for confirmation', async () => {
    const h = harness(), student = h.student(); h.setStudents([student]); h.element('studentIdInput').value = '1';
    const wait = deferred(); h.state.write = () => wait.promise;
    const saving = h.saveStudent(); assert.equal(h.state.closed, 0); assert.equal(student.teacherId, 't2');
    const fields = h.state.writes[0].args[1];
    for (const key of ['halaqaId', 'teacherId', 'stage']) assert.equal(key in fields, false);
    wait.resolve({ success: true }); await saving; assert.equal(student.teacherId, 't2'); assert.equal(student.stage, 'g2'); assert.equal(h.state.closed, 1);
    h.state.writes = []; h.element('studentHalaqaInput').value = 'another'; await h.saveStudent();
    assert.equal(h.state.writes.length, 0); assert.match(h.state.messages.at(-1).message, /النقل بين الحلقات/);
    const created = harness(); await created.saveStudent();
    const doc = created.state.writes[0].args[0];
    assert.equal(created.state.writes[0].name, 'create'); assert.equal(doc.halaqaId, 'halaqa-one');
    assert.equal(doc.teacherId, 't1'); assert.equal(doc.stage, 'g1');
    assert.equal(JSON.stringify(doc).includes('undefined'), false);
});

test('editing basic data keeps inactive or missing membership untouched, without enabling recitation', async () => {
    for (const missing of [false, true]) {
        const h = harness(), student = h.student(); h.setStudents([student]);
        if (missing) h.state.settings.halaqas = [];
        else h.state.settings.halaqas[0].active = false;
        h.ctx.input = student; h.run('fillStudentGeneralFields(input)');
        assert.equal(h.element('studentHalaqaInput').disabled, !missing);
        assert.match(h.element('studentHalaqaNote').textContent, missing ? /حلقته السابقة غير موجودة/ : /حلقته موقوفة/);
        const select = h.element('studentHalaqaInput');
        assert.equal(select.value, student.halaqaId);
        if (missing) {
            assert.equal(select.options[0].value, student.halaqaId);
            assert.equal(select.options[0].text, 'إبقاء حلقته السابقة (غير موجودة)');
            select.value = 'not-an-option'; assert.equal(select.value, '');
            h.run('fillStudentGeneralFields(input)');
        }
        h.element('studentIdInput').value = '1';
        h.element('studentNameInput').value = 'اسم وهمي مصحح';
        h.element('studentPhoneInput').value = '0500000000';
        h.ctx.parseTierMin = () => 3;
        await h.saveStudent();
        assert.equal(h.state.writes.length, 1); assert.equal(h.state.closed, 1);
        assert.equal(student.name, 'اسم وهمي مصحح'); assert.equal(student.memorizedJuz, 3);
        assert.equal(student.parentPhone, '966500000000');
        assert.equal(student.halaqaId, 'halaqa-one'); assert.equal(student.teacherId, 't2'); assert.equal(student.stage, 'g2');
        for (const field of ['halaqaId', 'teacherId', 'stage']) assert.equal(field in h.state.writes[0].args[1], false);
        h.saveRecitation(); assert.equal(h.state.writes.length, 1);
        assert.equal(h.state.messages.at(-1).message, 'اربط الطالب بحلقة فعّالة أولاً');
    }
});

test('a missing halaqa defaults to keeping membership so a name-only correction succeeds with a realistic select', async () => {
    const h = harness(), student = { ...h.student(), halaqaId: 'missing', teacherId: 't1', stage: 'g1',
        memorizedJuz: null, parentPhone: null };
    const before = copy(student);
    h.setStudents([student]); h.ctx.input = student; h.run('fillStudentGeneralFields(input)');
    const select = h.element('studentHalaqaInput');
    assert.equal(select.disabled, false); assert.equal(select.value, 'missing');
    assert.equal(select.selectedIndex, 0);
    assert.deepEqual(select.options.map(option => option.value), ['missing', 'halaqa-one']);
    assert.equal(select.options[0].text, 'إبقاء حلقته السابقة (غير موجودة)');
    h.element('studentIdInput').value = '1'; h.element('studentNameInput').value = 'اسم وهمي مصحح';
    await h.saveStudent();
    assert.equal(h.state.writes.length, 1); assert.equal(h.state.closed, 1);
    assert.deepEqual(student, { ...before, name: 'اسم وهمي مصحح' });
    for (const field of ['halaqaId', 'teacherId', 'stage']) assert.equal(field in h.state.writes[0].args[1], false);
    h.saveRecitation(); assert.equal(h.state.writes.length, 1);
    assert.equal(h.state.messages.at(-1).message, 'اربط الطالب بحلقة فعّالة أولاً');
});

test('a missing halaqa allows linking an existing student to an active halaqa', async () => {
    const h = harness(), student = { ...h.student(), halaqaId: 'missing', teacherId: 't1', stage: 'g1' };
    h.setStudents([student]); h.ctx.input = student; h.run('fillStudentGeneralFields(input)');
    assert.equal(h.element('studentHalaqaInput').disabled, false);
    assert.equal(h.element('studentHalaqaInput').value, 'missing');
    assert.deepEqual(h.element('studentHalaqaInput').options.map(option => option.value), ['missing', 'halaqa-one']);
    assert.match(h.element('studentHalaqaNote').textContent, /حلقته السابقة غير موجودة/);
    assert.equal(student.halaqaId, 'missing'); assert.equal(h.state.writes.length, 0);
    h.element('studentHalaqaInput').value = 'halaqa-one';
    h.element('studentIdInput').value = '1'; await h.saveStudent();
    const fields = h.state.writes[0].args[1];
    assert.equal(fields.halaqaId, 'halaqa-one'); assert.equal(fields.teacherId, 't1'); assert.equal(fields.stage, 'g1');
    assert.equal(student.halaqaId, 'halaqa-one');
});

test('student create retries an ID conflict with a new ID from the latest snapshot and a stable sid', async () => {
    for (const freshSnapshot of [false, true]) {
        const h = harness();
        h.state.write = async () => {
            if (h.state.writes.length === 1) {
                if (freshSnapshot) h.setStudents([{ ...h.student(), id: 40 }]);
                return { success: false, code: 'STUDENT_ID_CONFLICT' };
            }
            return { success: true };
        };
        await h.saveStudent();
        assert.deepEqual(h.state.writes.map(w => w.args[0].id), [1, freshSnapshot ? 41 : 2]);
        assert.equal(h.state.writes[0].args[0].sid, h.state.writes[1].args[0].sid);
        assert.equal(h.state.closed, 1); assert.equal(h.element('studentSaveButton').disabled, false);
        assert.equal(h.run('students.filter(s => s.sid === "fake-uuid-1").length'), 1);
    }
});

test('student create rechecks membership after an ID conflict and stops if the halaqa changes', async () => {
    for (const change of ['inactive', 'missing', 'teacher', 'stage']) {
        const h = harness();
        h.state.write = async () => {
            h.state.settings = copy(h.state.settings);
            if (change === 'inactive') h.state.settings.halaqas[0].active = false;
            if (change === 'missing') h.state.settings.halaqas = [];
            if (change === 'teacher') h.state.settings.halaqas[0].teacherId = 't2';
            if (change === 'stage') h.state.settings.halaqas[0].stageId = 'g2';
            return { success: false, code: 'STUDENT_ID_CONFLICT' };
        };
        await h.saveStudent();
        assert.equal(h.state.writes.length, 1); // محاولة التعارض وحدها؛ لا إنشاء بعدها.
        assert.equal(h.run('students.length'), 0); assert.equal(h.state.closed, 0);
        assert.equal(h.state.messages.at(-1).message, 'تغيّرت الحلقة أثناء الحفظ؛ راجع ثم احفظ');
        assert.equal(h.element('studentSaveButton').disabled, false);
        assert.equal(h.run('generalStudentSaveInFlight'), false);
    }
});

test('student create stops after three ID conflicts with a clear error and releases the guard', async () => {
    const h = harness(); h.state.write = async () => ({ success: false, code: 'STUDENT_ID_CONFLICT' });
    await h.saveStudent();
    assert.deepEqual(h.state.writes.map(w => w.args[0].id), [1, 2, 3]);
    assert.equal(h.state.closed, 0); assert.equal(h.run('students.length'), 0);
    assert.equal(h.state.messages.at(-1).message, 'فشل الحفظ السحابي: تكرر تعارض رقم الطالب ٣ مرات؛ حدّث البيانات ثم أعد المحاولة');
    assert.equal(h.element('studentSaveButton').disabled, false); assert.equal(h.run('generalStudentSaveInFlight'), false);
    h.state.write = async () => ({ success: true }); await h.saveStudent();
    assert.equal(h.state.closed, 1);
});

test('double student save sends one create or patch and restores the button after success or failure', async () => {
    for (const editing of [false, true]) {
        for (const outcome of ['success', 'failure', 'throw']) {
            const h = harness(), wait = deferred();
            if (editing) { h.setStudents([h.student()]); h.element('studentIdInput').value = '1'; }
            h.state.write = async () => {
                await wait.promise;
                if (outcome === 'throw') throw Error('فشل وهمي');
                return { success: outcome === 'success', error: 'فشل وهمي' };
            };
            const first = h.saveStudent();
            assert.equal(h.element('studentSaveButton').disabled, true);
            await h.saveStudent(); assert.equal(h.state.writes.length, 1); assert.equal(h.state.closed, 0);
            wait.resolve(); await first;
            assert.equal(h.element('studentSaveButton').disabled, false); assert.equal(h.run('generalStudentSaveInFlight'), false);
            assert.equal(h.state.writes[0].name, editing ? 'patch' : 'create');
            assert.equal(h.state.closed, outcome === 'success' ? 1 : 0);
            if (outcome !== 'success') {
                h.state.write = async () => ({ success: true }); await h.saveStudent();
                assert.equal(h.state.writes.length, 2); assert.equal(h.state.closed, 1);
            }
        }
    }
});

test('current display and unassigned counter use halaqaId and escape names rather than stale student copies', () => {
    const h = harness(); h.state.settings.halaqas[0].name = '<حلقة وهمية>';
    h.ctx.input = h.student(); const rendered = h.run('generalStudentHalaqaHtml(input)');
    assert.match(rendered, /&lt;حلقة وهمية>/); assert.match(rendered, /معلم وهمي أول/); assert.match(rendered, /مرحلة وهمية أولى/);
    assert.doesNotMatch(rendered, /معلم وهمي ثان|مرحلة وهمية ثانية/);
    const good = h.student(), absent = h.student(), missing = { ...h.student(), halaqaId: 'missing' };
    delete absent.halaqaId; h.setStudents([good, absent, missing]); assert.equal(h.run('studentsWithoutLevel().length'), 2);
    h.state.settings.halaqas[0].active = false; assert.equal(h.run('studentsWithoutLevel().length'), 3);
    h.ctx.input = absent; assert.match(h.run('generalStudentHalaqaHtml(input)'), /بلا حلقة/);
});

test('Excel matching resolves exactly one active halaqa and rejects missing, inactive or ambiguous matches', () => {
    for (const kind of ['one', 'none', 'inactive', 'ambiguous']) {
        const h = harness();
        if (kind === 'none') h.state.settings.halaqas = [];
        if (kind === 'inactive') h.state.settings.halaqas[0].active = false;
        if (kind === 'ambiguous') h.state.settings.halaqas.push({ ...h.state.settings.halaqas[0], id: 'halaqa-two' });
        h.ctx.rows = [{ line: 2, name: 'طالب وهمي', teacher: 'معلم وهمي أول', stage: 'مرحلة وهمية أولى', phone: '' }];
        const before = JSON.stringify(h.state.settings);
        const row = h.run('analyzeGeneralImportRows(rows, getProgramSettings(), [])')[0];
        assert.equal(JSON.stringify(h.state.settings), before);
        if (kind === 'one') { assert.equal(row.status, 'new'); assert.equal(row.halaqaId, 'halaqa-one'); assert.equal(row.halaqaName, 'حلقة وهمية أولى'); }
        else { assert.equal(row.status, 'error'); assert.match(row.reason, /حلقة فعّالة/); }
    }
});

test('Excel confirmation rechecks halaqaId before writes and again after an ID conflict', async () => {
    for (const duringConflict of [false, true]) {
        const h = harness();
        Object.assign(h.ctx.window.almahraData, { getActiveProgramId: () => h.state.program,
            getActiveSeasonId: () => h.state.season, isReady: () => true, isReadOnly: () => false });
        h.run('let pendingImport = null, generalImportEpoch = 0, generalImportInFlight = null;');
        h.install('generalImportContextValid', 'generalImportCanConfirm', 'renderGeneralImportPreview',
            'confirmGeneralExcelImport', 'closeImportPreview');
        h.ctx.rawRows = [{ line: 2, name: 'طالب وهمي', teacher: 'معلم وهمي أول', stage: 'مرحلة وهمية أولى', phone: '' }];
        h.run("pendingImport = { general: true, programId: 'general', seasonId: 's1', epoch: 0, rawRows, savedStudents: [], rows: analyzeGeneralImportRows(rawRows, getProgramSettings(), []), fileName: 'synthetic.xlsx', sheetName: 'وهمية' }; renderGeneralImportPreview();");
        assert.match(h.element('importPreviewList').innerHTML, /<th[^>]*>الحلقة<\/th>/);
        assert.match(h.element('importPreviewList').innerHTML, /حلقة وهمية أولى/);
        if (duringConflict) h.state.write = async () => {
            h.state.settings.halaqas[0].id = 'halaqa-replacement';
            return { success: false, code: 'STUDENT_ID_CONFLICT' };
        };
        else h.state.settings.halaqas[0].id = 'halaqa-replacement';
        await h.run('confirmGeneralExcelImport()');
        assert.equal(h.state.writes.length, duringConflict ? 1 : 0);
        assert.match(h.state.messages.at(-1).message, /تغيّر.*الإعدادات/);
        if (!duringConflict) {
            await h.run('confirmGeneralExcelImport()');
            assert.equal(h.state.writes.length, 1);
            assert.equal(h.state.writes[0].args[0].halaqaId, 'halaqa-replacement');
            assert.equal(h.state.writes[0].args[0].teacherId, 't1');
            assert.equal(h.state.writes[0].args[0].stage, 'g1');
        }
    }
});

test('default reset refuses custom stages referenced by halaqas, even inactive and without students', async () => {
    const h = harness(); h.state.settings.halaqas[0].stageId = 'custom'; h.state.settings.halaqas[0].active = false;
    await h.run('resetProgramSettings()'); assert.equal(h.state.writes.length, 0);
    assert.match(h.state.messages.at(-1).message, /حلقة مرتبطة بمرحلة غير افتراضية/);
    const okay = harness(); await okay.run('resetProgramSettings()'); assert.equal(okay.state.writes[0].name, 'reset');
});

test('absent halaqas are read as empty without mutating settings or adding a default/migration', () => {
    const h = harness(); h.install('getProgramSettings'); delete h.state.settings.halaqas;
    const before = JSON.stringify(h.state.settings); assert.equal(h.run('getProgramSettings().halaqas.length'), 0);
    assert.equal(JSON.stringify(h.state.settings), before); assert.equal(h.state.writes.length, 0);
    for (const program of ['summer', 'review-day']) {
        h.state.program = program; assert.equal(h.run("'halaqas' in getProgramSettings()"), false);
    }
    const baseline = cp.execFileSync('git', ['show', '9628c9c:programs-store.js'], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n');
    const restored = programsStore.replaceAll('\r\n', '\n').replace('                fresh.halaqas = JSON.parse(JSON.stringify(programsCache[programId]?.settings?.halaqas || []));\n', '');
    assert.equal(restored, baseline);
});

test('store reset preserves general teachers and halaqas, waits for cloud, and keeps legacy resets unchanged', async () => {
    const start = programsStore.indexOf('    resetSettings: async (programId) => {');
    const end = programsStore.indexOf('\n    },', start) + '\n    },'.length;
    assert.ok(start >= 0 && end > start);
    for (const program of ['general', 'summer', 'review-day']) {
        const old = settings(); old.halaqas[0].active = false;
        const defaults = { teachers: [], stages: [{ id: 'default-stage' }] };
        const calls = [], wait = deferred();
        const ctx = vm.createContext({ db: {}, PROGRAMS: 'programs', SETTINGS_VERSION: 1,
            PROGRAM_DEFS: { [program]: { defaultSettings: defaults } }, programsCache: { [program]: { settings: old } },
            doc: (...args) => args.slice(1).join('/'), updateDoc: async (...args) => { calls.push(copy(args)); await wait.promise; } });
        vm.runInContext('const api = {\n' + programsStore.slice(start, end) + '\n};', ctx);
        const result = vm.runInContext(`api.resetSettings('${program}')`, ctx);
        assert.equal(calls.length, 1);
        const saved = calls[0][1].settings;
        if (program === 'general') {
            assert.deepEqual(saved.teachers, old.teachers); assert.deepEqual(saved.halaqas, old.halaqas);
        } else assert.deepEqual(saved, { ...defaults, settingsVersion: 1 });
        wait.resolve(); assert.equal((await result).success, true);
    }
});

test('createGeneralStudentIfAbsent rejects absent or invalid halaqaId before starting a transaction', async () => {
    const state = { transactions: 0 };
    const ctx = vm.createContext({ TextEncoder, structuredClone, doc: () => 'fake-ref',
        runTransaction: async (db, callback) => { state.transactions++; await callback({ get: async () => ({ exists: () => false }), set() {} }); } });
    vm.runInContext("const db = {}; const PROGRAMS = 'programs', SEASONS = 'seasons', STUDENTS = 'students'; const activeProgramId = 'general', activeSeasonId = 's1', isReady = true, isReadOnly = false;" +
        source('hasUndefined', dataStore) + source('createGeneralStudentIfAbsent', dataStore), ctx);
    const valid = { id: 1, sid: 'fake-sid', teacherId: 't1', stage: 'g1', halaqaId: 'halaqa-one', history: {} };
    for (const id of [undefined, null, '', ' ', 'bad/id', '.', '..', '__invalid__', 1]) {
        ctx.input = { ...valid, halaqaId: id };
        assert.equal((await vm.runInContext("createGeneralStudentIfAbsent(input, 's1')", ctx)).code, 'INVALID_STUDENT');
    }
    assert.equal(state.transactions, 0); ctx.input = valid;
    assert.equal((await vm.runInContext("createGeneralStudentIfAbsent(input, 's1')", ctx)).success, true);
    assert.equal(state.transactions, 1);
});
