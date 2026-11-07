// Offline only: production functions, synthetic seasons/students and fake transactions/clock/DOM.
// Run: node --test tests/*.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const store = fs.readFileSync(path.join(__dirname, '..', 'programs-store.js'), 'utf8');
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
const calendar = () => ({ termStart: '2026-11-01', termEnd: '2026-12-31', calendar: [] });
const holiday = (fields = {}) => ({ id: 'holiday-1', name: 'إجازة وهمية', from: '2026-11-02', to: '2026-11-04',
    kind: 'official', at: 100, by: 'synthetic-admin', ...fields });
function harness() {
    const state = { program: 'general', season: { id: 's1', ...calendar() }, now: '2026-11-01T18:00:00Z',
        archived: false, messages: [], prompts: [], writes: [], rows: [], updates: 0, renders: 0,
        settings: { workingDays: [0, 1, 2, 3], teachers: [{ id: 't1', name: 'معلم وهمي' }], stages: [],
            halaqas: [{ id: 'h1', teacherId: 't1', stageId: 'g1', active: true }], absence: [], features: {}, criteria: [], grades: [], points: {}, kindMult: {} } };
    class Clock extends Date { constructor(...args) { super(...(args.length ? args : [state.now])); } }
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, { value: '', innerText: '', innerHTML: '', textContent: '', disabled: false,
            options: [{ text: 'سورة' }], selectedIndex: 0, checked: false, style: {},
            classList: { add() {}, remove() {}, toggle() {}, replace() {}, contains() { return false; } }, focus() {}, click() { state.clicked = id; } });
        return elements.get(id);
    };
    const write = (kind, ...args) => { state.writes.push({ kind, args: copy(args) }); return Promise.resolve({ success: true }); };
    const programs = { getCurrentProgramId: () => state.program, getCurrentSeasonId: () => state.season.id,
        getCurrentSeason: () => state.season, isCurrentSeasonArchived: () => state.archived,
        updateSeasonCalendar: (...args) => state.calendarSave ? state.calendarSave(...args) : write('calendar', ...args) };
    const ctx = vm.createContext({
        // Isolate calendar guards; section math and the form DOM are exercised in step8a.
        pinBaseFields: () => ({}), computeLastDaily: () => null, updateGeneralUndoButton() {},
        calculateGeneralQuickEntry: () => ({ errors: [], position: { valid: true }, sections: [], criteria: { changed: false }, total: 0, key: 'attendance-only' }),
        celebrateGeneralQuickEntry() {}, console, Date: Clock, Intl, structuredClone, crypto: { randomUUID: () => 'random-id' },
        document: { getElementById: element, querySelectorAll: selector => selector === '.school-calendar-row' ? state.rows : [] },
        window: { almahraPrograms: programs, almahraAuth: { currentUser: { uid: 'synthetic-admin' } },
            almahraData: { getActiveSeasonId: () => state.season.id, isReadOnly: () => state.archived,
                saveAllStudents: (...args) => write('restore', ...args),
                createGeneralStudentIfAbsent: (...args) => write('create', ...args), patchStudent: (...args) => write('patch', ...args) } },
        FileReader: class { constructor() { state.reader = this; } readAsText() {} },
        showToast: (message, type) => state.messages.push({ message, type }),
        confirm: message => { state.prompts.push(message); return state.confirm !== false; },
        canWriteCloud: () => !state.archived, canWriteView: () => !state.archived,
        getProgramSettings: () => state.settings, updateAllUIs: () => state.updates++,
        redrawSeasonCalendar: () => state.renders++, updateSchoolCalendarAlert() {},
        getCriteriaSelection: () => ({}), requireQuranMeasure: () => true,
        generalRecitationTeacher: () => 't1', calculateRangeStats: () => ({ lines: 1, totalAyahs: 1, intervals: [[1, 1]] }),
        roundPointTotal: n => n, pinBaseFields: () => ({}), closeSmartModal() {}, closeStudentModal() {}, closeAttendanceEditModal() {},
        generalStudentMembership: () => ({ halaqaId: 'h1', teacherId: 't1', stage: 'g1' }),
        parseTierMin: () => null, fillStudentTierFields() {}, fillStudentGeneralFields() {}, fillStudentPhoneField() {},
        saveData: () => { state.writes.push({ kind: 'restore' }); }, studentsCountLabel: n => `${n} طالب`,
        setTimeout() {} });
    const run = code => vm.runInContext(code, ctx);
    // اختبارات التقويم تعزل الإغلاق المؤقت؛ مفتاح الإنتاج المفعّل مغطّى في golden-lock-local.
    run(html.match(/const GOLDEN_BOARD_UNDER_REPAIR = (?:true|false);/)[0].replace('= true', '= false'));
    const install = (...names) => names.forEach(name => run(source(name)));
    require('./helpers/tv-harness.cjs').installTv(run, install);
    run(`let students = [{ id: 1, sid: 'synthetic-student', name: 'طالب وهمي', history: {} }];
        let todayStr = '', hijriDateStr = '', gregorianDateStr = '', currentEditingStudentId = 1;
        let attEditStudentId = 1, attEditChoice = true, attendanceDateFollowsToday = true;
        let seasonCalendarDraft = null, generalStudentSaveInFlight = false, generalImportInFlight = false;
        let pendingImport = null, _noLevelWarned = null;
        const criteriaAtOpen = { sel: {} }, DEL_FIELD = { __almahraDelete: true };`);
    run(html.match(/let generalUndoInProgress = false;/)[0]);
    install('isGeneralProgram', 'isWorkingDay', 'escapeHTML', 'schoolCivilDate', 'setupDatesAndTimezone', 'refreshToday',
        'generalQuickDateBlocked', 'prepareGeneralQuickDate', 'getGeneralMissedDays', 'getWeekStartDate', 'formatDateLocal',
        'isSeasonCalendarComplete', 'requireSchoolCalendar', 'getSchoolDayInfo', 'getAttendanceState', 'requireSchoolDay', 'prepareSchoolDay',
        'validateSeasonCalendar', 'collectSeasonCalendar', 'calendarExcludedDays', 'renderSeasonCalendar', 'saveSeasonCalendar',
        'applyFieldsLocally', 'restoreStudent', 'canWriteHistory', 'commitStudentPatch', 'saveGeneralQuickEntry', 'commitGeneralStudentPatch', 'generalQuickContext', 'generalQuickContextMatches',
        'saveStudent', 'openStudentModal', 'startExcelImport', 'handleExcelImport', 'confirmExcelImport', 'confirmGeneralExcelImport',
        'isValidStudentBackup', 'importNuclearBackup', 'openSmartModal', 'loadAttendanceForDate', 'saveAttendanceEdit',
        'openAttendanceEditModal', 'saveSmartMastery', 'saveExamPrepProgress', 'resetStudentToday', 'markPresent');
    run("const generalQuickEntry = { previewKey: 'attendance-only', context: null };");
    run('setupDatesAndTimezone(); generalQuickEntry.dateStr = todayStr; generalQuickEntry.context = generalQuickContext(students[0])');
    for (const id of ['startSurah', 'endSurah', 'startAyah', 'endAyah']) element(id).value = '1';
    element('disciplineOnlyCheck').checked = true;
    element('resWeightedPoints').innerText = '0';
    element('studentNameInput').value = 'طالب وهمي ثان';
    element('attEditDateInput').value = '2026-11-01';
    return { state, ctx, run, install, element,
        info(date) { ctx.date = date; return copy(run('getSchoolDayInfo(date)')); },
        editor(next = calendar(), expected = state.season) {
            ctx.expected = structuredClone(expected);
            run("seasonCalendarDraft = { seasonId: 's1', expected, next: {}, saving: false }");
            element('calendarTermStart').value = next.termStart;
            element('calendarTermEnd').value = next.termEnd;
            state.rows = next.calendar.map(row => ({ dataset: { id: row.id }, querySelector(selector) {
                return { value: row[{ '.calendar-name': 'name', '.calendar-from': 'from', '.calendar-to': 'to', '.calendar-kind': 'kind' }[selector]] };
            } }));
        } };
}

test('school days: working weekday, weekend, term bounds, inclusive multi-day and single-day holidays, incomplete calendar', () => {
    const h = harness();
    assert.equal(h.info('2026-11-01').isSchoolDay, true);
    assert.equal(h.info('2026-11-06').reason, 'not-working-day');
    assert.equal(h.info('2026-10-31').reason, 'before-term');
    assert.equal(h.info('2027-01-01').reason, 'after-term');
    h.state.season.calendar = [holiday()];
    for (const date of ['2026-11-02', '2026-11-03', '2026-11-04']) {
        assert.deepEqual(h.info(date), { isSchoolDay: false, reason: 'holiday', name: 'إجازة وهمية', kind: 'official' });
    }
    h.state.season.calendar = [holiday({ from: '2026-11-08', to: '2026-11-08', kind: 'emergency' })];
    assert.equal(h.info('2026-11-08').reason, 'holiday');
    assert.equal(h.info('2026-11-09').isSchoolDay, true);
    for (const key of ['calendar', 'termStart', 'termEnd']) {
        h.state.season = { id: 's1', ...calendar() }; delete h.state.season[key];
        assert.equal(h.info('2026-11-01').reason, 'no-calendar');
    }
    for (const program of ['summer', 'review-day']) {
        h.state.program = program; h.state.season = { id: 's1' };
        assert.equal(h.info('2026-11-06').isSchoolDay, true);
        assert.equal(h.run('prepareSchoolDay()'), true);
    }
});

test('civil dates validate leap days and remain civil weekdays in a non-Riyadh device zone', () => {
    const h = harness();
    assert.equal(h.run("schoolCivilDate('2026-02-29')"), null);
    assert.equal(h.run("schoolCivilDate('2028-02-29').getDate()"), 29);
    const previous = process.env.TZ;
    try {
        process.env.TZ = 'America/Los_Angeles';
        assert.equal(h.info('2026-11-01').isSchoolDay, true);
    } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

test('validation rejects reversed term, invalid date, reversed/outside row, empty name and unknown kind; overlaps only warn', async () => {
    const h = harness();
    for (const [next, message] of [
        [{ ...calendar(), termStart: '2027-01-01' }, /بداية الفصل/],
        [{ ...calendar(), termEnd: '2026-02-30' }, /بشكل صحيح/],
        [{ ...calendar(), calendar: [holiday({ from: '2026-10-31' })] }, /السطر 1.*خارج الفصل/],
        [{ ...calendar(), calendar: [holiday({ from: '2026-11-05' })] }, /السطر 1.*البداية بعد/],
        [{ ...calendar(), calendar: [holiday({ name: '  ' })] }, /السطر 1.*اسم/],
        [{ ...calendar(), calendar: [holiday({ kind: 'unknown' })] }, /السطر 1.*نوع/],
        [{ ...calendar(), calendar: [holiday({ to: '2026-11-31' })] }, /السطر 1.*تاريخ/]
    ]) {
        h.ctx.next = next; assert.match(h.run('validateSeasonCalendar(next).error'), message);
        h.editor(next); await h.run('saveSeasonCalendar()'); assert.equal(h.state.writes.length, 0);
    }
    const next = { ...calendar(), calendar: [holiday(), holiday({ id: 'holiday-2', from: '2026-11-04' })] };
    h.ctx.next = next;
    assert.equal(h.run('validateSeasonCalendar(next).error'), null);
    assert.equal(h.run('validateSeasonCalendar(next).overlaps.length'), 1);
    h.editor(next); h.state.confirm = false; await h.run('saveSeasonCalendar()');
    assert.equal(h.state.writes.length, 0); assert.match(h.state.prompts.at(-1), /تداخل أو تكرار.*1 و2/);
    h.state.confirm = true; await h.run('saveSeasonCalendar()'); assert.equal(h.state.writes.length, 1);
});

test('no-holidays saves explicit [] independently, and editing preserves id while stamping only changed rows', async () => {
    const h = harness(); delete h.state.season.calendar;
    h.editor(); await h.run('saveSeasonCalendar(true)');
    assert.deepEqual(h.state.writes[0].args[3].calendar, []);
    assert.equal(Object.hasOwn(h.state.writes[0].args[2], 'calendar'), false); // serialized expected keeps missing distinct
    assert.equal(h.run('isSeasonCalendarComplete()'), true);
    const original = holiday(), second = holiday({ id: 'holiday-2', from: '2026-11-09', to: '2026-11-09' });
    h.state.season.calendar = [original, second];
    const next = { ...calendar(), calendar: [{ ...original, name: 'طارئ مصحح', kind: 'emergency' }, second] };
    h.editor(next); await h.run('saveSeasonCalendar()');
    const saved = h.state.writes.at(-1).args[3].calendar;
    assert.equal(saved[0].id, original.id); assert.equal(saved[0].by, 'synthetic-admin'); assert.ok(saved[0].at > original.at);
    assert.deepEqual(saved[1], second);
    assert.deepEqual(Object.keys(h.state.writes.at(-1).args[3]).sort(), ['calendar', 'termEnd', 'termStart']);
});

test('calendar editor sorts, previews working days, offers explicit empty choice, and archives are read-only', () => {
    const h = harness(); h.ctx.season = h.state.season;
    let ui = h.run('renderSeasonCalendar(season, false)');
    assert.match(ui, /لا توجد إجازات/); assert.match(ui, /حفظ التقويم/); assert.match(ui, /type="date"/);
    h.run('seasonCalendarDraft = null');
    h.state.season.calendar = [holiday({ id: 'later', from: '2026-11-09', to: '2026-11-09' }), holiday()];
    ui = h.run('renderSeasonCalendar(season, false)');
    assert.ok(ui.indexOf('data-id="holiday-1"') < ui.indexOf('data-id="later"'));
    assert.match(ui, /يستثني 3 من أيام الدراسة/); assert.doesNotMatch(ui, /لا توجد إجازات/);
    ui = h.run('renderSeasonCalendar(season, true)');
    assert.match(ui, /fieldset disabled/); assert.doesNotMatch(ui, /حفظ التقويم|إضافة إجازة/);
    h.state.program = 'summer'; assert.equal(h.run('renderSeasonCalendar(season, false)'), '');
});

test('calendar row controls add a random id, confirm deletion, and copy from into to for a single day', () => {
    const h = harness(); h.install('addCalendarRow', 'deleteCalendarRow', 'calendarSingleDay', 'updateCalendarPreview');
    h.editor(); h.run('addCalendarRow()');
    assert.equal(h.run('seasonCalendarDraft.next.calendar[0].id'), 'random-id');
    assert.equal(h.run('seasonCalendarDraft.next.calendar[0].kind'), 'official');
    h.editor({ ...calendar(), calendar: [holiday()] });
    const button = { closest: () => ({ dataset: { id: 'holiday-1' } }) }; h.ctx.button = button;
    h.state.confirm = false; const renders = h.state.renders; h.run('deleteCalendarRow(button)');
    assert.equal(h.state.renders, renders); assert.equal(h.state.prompts.at(-1), 'حذف سطر الإجازة؟');
    h.state.confirm = true; h.run('deleteCalendarRow(button)');
    assert.equal(h.run('seasonCalendarDraft.next.calendar.length'), 0);
    const fields = { '.calendar-from': { value: '2026-11-02' }, '.calendar-to': { value: '' }, '.calendar-preview': {} };
    h.ctx.single = { closest: () => ({ querySelector: selector => fields[selector] }) };
    h.run('calendarSingleDay(single)');
    assert.equal(fields['.calendar-to'].value, '2026-11-02');
    assert.equal(fields['.calendar-preview'].textContent, 'يستثني 1 من أيام الدراسة');
});

test('new undated calendar rows stay after dated rows, which remain sorted', () => {
    const h = harness(); h.install('addCalendarRow'); h.ctx.season = h.state.season;
    h.editor({ ...calendar(), calendar: [holiday({ id: 'later', from: '2026-11-09' }), holiday()] });
    h.run('addCalendarRow()');
    const ui = h.run('renderSeasonCalendar(season, false)');
    assert.deepEqual([...ui.matchAll(/data-id="([^"]+)"/g)].map(match => match[1]), ['holiday-1', 'later', 'random-id']);
});

test('home warning is restricted to incomplete active general and its button opens the actual settings section', () => {
    const h = harness(); h.install('updateSchoolCalendarAlert', 'openSchoolCalendar');
    delete h.state.season.calendar; h.run('updateSchoolCalendarAlert()');
    assert.match(h.element('schoolCalendarAlert').innerHTML, /أكمل التقويم الدراسي أولاً.*onclick="openSchoolCalendar\(\)"/);
    h.state.season.calendar = []; h.run('updateSchoolCalendarAlert()'); assert.equal(h.element('schoolCalendarAlert').innerHTML, '');
    delete h.state.season.calendar; h.state.archived = true; h.run('updateSchoolCalendarAlert()'); assert.equal(h.element('schoolCalendarAlert').innerHTML, '');
    h.state.archived = false; h.state.program = 'summer'; h.run('updateSchoolCalendarAlert()'); assert.equal(h.element('schoolCalendarAlert').innerHTML, '');
    h.state.program = 'general';
    h.ctx.document.querySelector = () => 'settings-navigation-button';
    h.ctx.switchTab = (id, button) => { assert.equal(id, 'page-settings'); assert.equal(button, 'settings-navigation-button'); };
    h.ctx.openSettingsSection = id => { assert.equal(id, 'setPanelProgram'); };
    h.ctx.renderProgramSettings = () => h.state.renders++;
    h.element('schoolCalendarSection').scrollIntoView = () => { h.state.scrolled = true; };
    h.run('openSchoolCalendar()'); assert.equal(h.state.scrolled, true); assert.equal(h.state.renders, 1);
});

test('successful general season creation suggests season, then opens calendar with required guidance', async () => {
    const h = harness(); h.install('startNewSeasonFlow');
    h.ctx.window.almahraPrograms.getCurrentProgram = () => ({ id: 'general' });
    h.ctx.window.almahraPrograms.startNewSeason = async () => ({ success: true });
    h.ctx.prompt = (message, suggested) => { assert.match(suggested, /^موسم /); return 'موسم وهمي'; };
    h.ctx.setTimeout = callback => callback();
    h.ctx.openSchoolCalendar = () => h.state.renders++;
    await h.run('startNewSeasonFlow()');
    assert.equal(h.state.renders, 1); assert.equal(h.state.messages.at(-1).message, 'أدخل التقويم الدراسي قبل إضافة الطلاب');
});

function storeHarness(current = calendar()) {
    const state = { current, active: 's1', reads: [], writes: [], attempts: 0 };
    const ctx = vm.createContext({ beforeWrite: async () => null, db: {}, PROGRAMS: 'programs', SEASONS: 'seasons',
        doc: (...args) => args.slice(1).join('/'),
        runTransaction: async (db, callback) => {
            state.attempts++;
            const transaction = { get: async ref => {
                state.reads.push(ref);
                return { exists: () => state.exists !== false, data: () => ref === 'programs/general' ? { activeSeasonId: state.active } : state.current };
            }, update: (ref, value) => state.writes.push({ ref, value: copy(value) }) };
            if (state.retry) { await callback({ ...transaction, update() {} }); state.current = state.retry; }
            await callback(transaction);
        } });
    const start = store.indexOf('    updateSeasonCalendar:');
    const end = store.indexOf('\n    },', start) + '\n    },'.length;
    vm.runInContext(`const api = { ${store.slice(start, end)} };`, ctx);
    return { state, async save(program = 'general', season = 's1', expected = calendar(), next = calendar()) {
        Object.assign(ctx, { program, season, expected, next });
        return vm.runInContext('api.updateSeasonCalendar(program, season, expected, next)', ctx);
    } };
}
test('transaction rejects non-general, inactive season, missing season and stale opened values; writes only three fields', async () => {
    const h = storeHarness();
    assert.equal((await h.save('summer')).success, false); assert.equal(h.state.attempts, 0);
    h.state.active = 'other'; assert.equal((await h.save()).success, false); assert.equal(h.state.writes.length, 0);
    h.state.active = 's1'; h.state.exists = false; assert.equal((await h.save()).success, false);
    h.state.exists = true;
    for (const changed of [{ ...calendar(), termStart: '2026-11-02' }, { ...calendar(), termEnd: '2026-12-30' },
        { ...calendar(), calendar: [holiday()] }, { termStart: calendar().termStart, termEnd: calendar().termEnd }]) {
        h.state.current = changed; const result = await h.save();
        assert.equal(result.error, 'تغيّر التقويم من جهاز آخر، أعد فتح الإعدادات');
    }
    h.state.current = calendar(); const next = { ...calendar(), calendar: [holiday()], settings: { forbidden: true }, startDate: 'forbidden' };
    assert.equal((await h.save('general', 's1', calendar(), next)).success, true);
    assert.deepEqual(h.state.writes, [{ ref: 'programs/general/seasons/s1', value: { ...calendar(), calendar: [holiday()] } }]);
    assert.ok(h.state.reads.includes('programs/general')); assert.ok(h.state.reads.includes('programs/general/seasons/s1'));
    const reordered = Object.fromEntries(Object.entries(holiday()).reverse());
    const keys = storeHarness({ ...calendar(), calendar: [reordered] });
    assert.equal((await keys.save('general', 's1', { ...calendar(), calendar: [holiday()] })).success, true);
    const retry = storeHarness(); retry.state.retry = { ...calendar(), calendar: [holiday()] };
    assert.equal((await retry.save()).success, false); assert.equal(retry.state.writes.length, 0);
});

test('mandatory calendar blocks every student/import/restore/registration/attendance entry before reading or writing', async () => {
    const h = harness(); delete h.state.season.calendar;
    for (const call of ['openStudentModal()', 'saveStudent()', 'startExcelImport()', 'handleExcelImport({})',
        'confirmExcelImport()', 'confirmGeneralExcelImport()', 'importNuclearBackup({})', 'openSmartModal(1)',
        'saveGeneralQuickEntry()', 'saveSmartMastery()', 'saveExamPrepProgress()', 'resetStudentToday()', 'markPresent(1)',
        'openAttendanceEditModal(1)', 'loadAttendanceForDate()', 'saveAttendanceEdit()']) {
        const before = h.state.messages.length; await h.run(call);
        assert.equal(h.state.messages.length, before + 1, call);
        assert.equal(h.state.messages.at(-1).message, 'أكمل التقويم الدراسي أولاً (الإعدادات ← التقويم الدراسي)', call);
        assert.equal(h.state.writes.length, 0, call);
    }
    assert.equal(h.state.reader, undefined); assert.equal(h.state.clicked, undefined);
    h.state.season.calendar = [];
    assert.equal(h.run('requireSchoolCalendar()'), true);
    await h.run('saveStudent()'); assert.equal(h.state.writes.at(-1).kind, 'create');
    h.run('startExcelImport()'); assert.equal(h.state.clicked, 'excelFileInput');
    await h.run('saveGeneralQuickEntry()'); assert.equal(h.state.writes.at(-1).kind, 'patch');
    h.run('saveAttendanceEdit()'); assert.equal(h.state.writes.at(-1).kind, 'patch');
    h.run("importNuclearBackup({ target: { files: [{}] } })");
    await h.state.reader.onload({ target: { result: JSON.stringify([{ id: 3, name: 'طالب نسخة وهمي', history: {}, halaqaId: 'h1' }]) } });
    assert.equal(h.state.writes.at(-1).kind, 'restore');
});

test('holiday locks every history writer, including an already open form and a dated attendance edit; old records survive', async () => {
    const h = harness(); h.state.season.calendar = [holiday({ from: '2026-11-01', to: '2026-11-01' })];
    for (const call of ['openSmartModal(1)', 'saveGeneralQuickEntry()', 'saveSmartMastery()', 'saveExamPrepProgress()',
        'resetStudentToday()', 'markPresent(1)', 'loadAttendanceForDate()', 'saveAttendanceEdit()']) {
        await h.run(call); assert.equal(h.state.messages.at(-1).message, 'اليوم إجازة: إجازة وهمية', call);
        assert.equal(h.state.writes.length, 0);
    }
    h.state.now = '2026-11-09T12:00:00Z';
    h.run('attendanceDateFollowsToday = false');
    h.element('attEditDateInput').value = '2026-11-01'; h.run('saveAttendanceEdit()');
    assert.equal(h.state.messages.at(-1).message, '2026-11-01 إجازة: إجازة وهمية');
    h.run("students[0].history['2026-11-01'] = { attended: true, entries: { old: { points: 7 } } }");
    const before = h.run('JSON.stringify(students[0])');
    assert.equal(h.run("canWriteHistory({ 'history.2026-11-01.attended': true })"), false);
    h.editor({ ...calendar(), calendar: h.state.season.calendar }); await h.run('saveSeasonCalendar()');
    assert.equal(h.run('JSON.stringify(students[0])'), before);
    h.state.program = 'summer'; assert.equal(h.run("canWriteHistory({ 'history.2026-11-01.attended': true })"), true);
});

test('complete-calendar Excel confirmation writes students, and every following row rechecks calendar completeness', async () => {
    for (const removeAfterFirst of [false, true]) {
        const h = harness();
        const rows = [2, 3].map(line => ({ line, name: `طالب استيراد وهمي ${line}`, status: 'new', teacherId: 't1', stage: 'g1', halaqaId: 'h1', phone: null }));
        Object.assign(h.ctx, { rows, generalImportContextValid: () => true, analyzeGeneralImportRows: raw => raw,
            normalizeArabicKey: name => name, closeImportPreview() {}, renderGeneralImportPreview() {} });
        h.install('generalImportCanConfirm');
        h.run("pendingImport = { rows, rawRows: rows, savedStudents: [], saving: false }");
        h.ctx.window.almahraData.createGeneralStudentIfAbsent = async student => {
            h.state.writes.push({ kind: 'create', student: copy(student) });
            if (removeAfterFirst) delete h.state.season.calendar;
            return { success: true };
        };
        await h.run('confirmGeneralExcelImport()');
        assert.equal(h.state.writes.length, removeAfterFirst ? 1 : 2);
        assert.equal(h.run('generalImportInFlight'), null);
        assert.equal(h.run('pendingImport.saving'), false);
        if (removeAfterFirst) assert.equal(h.state.messages.at(-1).message, 'أكمل التقويم الدراسي أولاً (الإعدادات ← التقويم الدراسي)');
    }
});

test('manual student retry and delayed backup reading cannot bypass a newly incomplete calendar', async () => {
    const h = harness();
    h.ctx.window.almahraData.createGeneralStudentIfAbsent = async () => {
        h.state.writes.push({ kind: 'conflict' }); delete h.state.season.calendar;
        return { success: false, code: 'STUDENT_ID_CONFLICT' };
    };
    await h.run('saveStudent()');
    assert.equal(h.state.writes.length, 1);
    assert.equal(h.run('students.length'), 1);
    h.state.season.calendar = [];
    h.run("importNuclearBackup({ target: { files: [{}] } })");
    delete h.state.season.calendar;
    h.state.reader.onload({ target: { result: '[]' } });
    assert.equal(h.state.writes.length, 1); assert.equal(h.run('students.length'), 1);
});

test('every non-school reason produces its specified save message', () => {
    const h = harness();
    for (const [instant, message] of [
        ['2026-11-06T12:00:00Z', 'ليس يوم دراسة'],
        ['2026-10-30T12:00:00Z', 'خارج الفصل الدراسي (2026-11-01 – 2026-12-31)'],
        ['2027-01-03T12:00:00Z', 'خارج الفصل الدراسي (2026-11-01 – 2026-12-31)']
    ]) {
        h.state.now = instant; h.run('saveGeneralQuickEntry()');
        assert.equal(h.state.writes.length, 0); assert.equal(h.state.messages.at(-1).message, message);
    }
});

test('receiving a new calendar while editing retains opening expected values and reports a conflict', async () => {
    const h = harness(); h.ctx.season = h.state.season;
    h.run('renderSeasonCalendar(season, false)');
    h.state.season.calendar = [holiday()];
    h.run('renderSeasonCalendar(season, false)');
    assert.deepEqual(copy(h.run('seasonCalendarDraft.expected.calendar')), []);
    const transaction = storeHarness({ ...calendar(), calendar: [holiday()] });
    h.state.calendarSave = (program, season, expected, next) => transaction.save(program, season, expected, next);
    h.element('calendarTermStart').value = '2026-11-01'; h.element('calendarTermEnd').value = '2026-12-31';
    await h.run('saveSeasonCalendar()');
    assert.equal(transaction.state.writes.length, 0);
    assert.equal(h.state.messages.at(-1).message, 'تغيّر التقويم من جهاز آخر، أعد فتح الإعدادات');
    assert.equal(h.run('seasonCalendarDraft.saving'), false);
    h.install('switchTab'); h.ctx.window.scrollTo = () => {};
    h.ctx.renderProgramSettings = () => h.run('renderSeasonCalendar(season, false)');
    h.ctx.backToSettingsHome = () => {};
    h.run("switchTab('page-settings', { classList: { add() {} } })");
    assert.deepEqual(copy(h.run('seasonCalendarDraft.expected.calendar')), [holiday()]);
});

test('opening the program card refreshes the draft after settings navigation and after a conflict/back/reopen', async () => {
    const h = harness(); h.install('switchTab', 'openSettingsSection', 'backToSettingsHome');
    h.ctx.season = h.state.season; h.ctx.window.scrollTo = () => {}; h.ctx.updateSettingsBadges = () => {};
    h.ctx.renderProgramSettings = () => {
        h.run('renderSeasonCalendar(season, false)');
        h.element('calendarTermStart').value = h.run('seasonCalendarDraft.next.termStart');
        h.element('calendarTermEnd').value = h.run('seasonCalendarDraft.next.termEnd');
    };
    h.run("switchTab('page-settings', { classList: { add() {} } })");
    h.state.season.termStart = '2026-11-02'; // cloud change while the settings home is open
    h.run("openSettingsSection('setPanelProgram')");
    assert.equal(h.run('seasonCalendarDraft.expected.termStart'), '2026-11-02');
    assert.equal(h.element('calendarTermStart').value, '2026-11-02');

    h.state.season.termEnd = '2026-12-30';
    h.ctx.renderProgramSettings(); // cloud redraw while the card is open keeps the opening snapshot
    assert.equal(h.run('seasonCalendarDraft.expected.termEnd'), '2026-12-31');
    h.element('calendarTermEnd').value = '2026-12-25';
    const transaction = storeHarness(copy(h.state.season));
    h.state.calendarSave = (program, season, expected, next) => transaction.save(program, season, expected, next);
    await h.run('saveSeasonCalendar()');
    assert.equal(h.state.messages.at(-1).message, 'تغيّر التقويم من جهاز آخر، أعد فتح الإعدادات');
    assert.equal(transaction.state.writes.length, 0);

    h.run("backToSettingsHome(); openSettingsSection('setPanelProgram')");
    const fresh = { termStart: h.state.season.termStart, termEnd: h.state.season.termEnd, calendar: [] };
    assert.deepEqual(copy(h.run('seasonCalendarDraft.expected')), fresh);
    assert.deepEqual(copy(h.run('seasonCalendarDraft.next')), fresh);
    assert.equal(h.element('calendarTermEnd').value, '2026-12-30');
    await h.run('saveSeasonCalendar()');
    assert.equal(transaction.state.writes.length, 1);
    assert.deepEqual(transaction.state.writes[0].value, fresh);
});

test('bulk backup save checks completeness again in its delayed callback', () => {
    const h = harness(), callbacks = [];
    h.ctx.setTimeout = callback => { callbacks.push(callback); return callbacks.length; };
    h.ctx.clearTimeout = () => {};
    h.ctx.window.almahraData.saveAllStudents = async () => { h.state.writes.push({ kind: 'bulk' }); return { success: true }; };
    h.run('let _cloudSaveTimeout = null, _lastCloudSyncFromMe = 0'); h.install('saveData');
    delete h.state.season.calendar; h.run('saveData()'); assert.equal(callbacks.length, 0);
    h.state.season.calendar = []; h.run('saveData()'); assert.equal(callbacks.length, 1);
    delete h.state.season.calendar; callbacks[0](); assert.equal(h.state.writes.length, 0);
    h.state.season.calendar = []; h.run('saveData()'); callbacks[1](); assert.equal(h.state.writes.length, 1);
});

test('Riyadh today and both header dates advance at 21:00 UTC; quick entry requires reopening after midnight', async () => {
    const h = harness(); h.state.now = '2026-11-01T22:30:00Z';
    h.run('setupDatesAndTimezone()'); assert.equal(h.run('todayStr'), '2026-11-02');
    for (const [id, locale, options] of [
        ['hijriDateDisplay', 'ar-SA-u-ca-islamic-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }],
        ['headerGregorian', 'ar-SA-u-nu-latn', { calendar: 'gregory', day: 'numeric', month: 'long', year: 'numeric' }]
    ]) {
        const formatted = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'Asia/Riyadh' }).format(new Date(h.state.now));
        assert.ok(h.element(id).innerText.startsWith(formatted));
    }
    h.state.now = '2026-11-01T20:59:59Z'; h.run('setupDatesAndTimezone()');
    h.state.now = '2026-11-01T21:00:01Z'; await h.run('saveGeneralQuickEntry()');
    assert.equal(h.state.writes.length, 0); assert.match(h.state.messages.at(-1).message, /أعد فتح النافذة/);
    h.run('generalQuickEntry.dateStr = todayStr; generalQuickEntry.context = generalQuickContext(students[0])');
    await h.run('saveGeneralQuickEntry()');
    const fields = h.state.writes.at(-1).args[1];
    assert.equal(fields['history.2026-11-02.attended'], true);
    assert.equal(Object.keys(fields).some(key => key.includes('2026-11-01')), false);
    assert.equal(h.state.updates, 2); // refresh and successful save after reopening
    assert.equal(h.element('attEditDateInput').value, '2026-11-02');
    assert.match(html, /setInterval\(refreshToday, 60000\)/);
});

test('midnight rechecks holidays before saving, while an explicitly selected older attendance date stays selected', () => {
    const h = harness(); h.state.now = '2026-11-01T20:59:59Z'; h.run('setupDatesAndTimezone()');
    h.state.season.calendar = [holiday()]; h.state.now = '2026-11-01T21:00:01Z'; h.run('saveGeneralQuickEntry()');
    assert.equal(h.state.writes.length, 0); assert.equal(h.state.messages.at(-1).message, 'اليوم إجازة: إجازة وهمية');
    h.run('attendanceDateFollowsToday = false'); h.element('attEditDateInput').value = '2026-11-01';
    h.state.now = '2026-11-02T21:00:01Z'; h.run('saveAttendanceEdit()');
    assert.equal(h.element('attEditDateInput').value, '2026-11-01');
    assert.equal(h.state.writes.at(-1).args[1]['history.2026-11-01.attended'], true);
});

test('midnight reloads an open attendance form following today, including a new holiday; closed or dated forms stay untouched', () => {
    for (const mode of ['school', 'holiday', 'closed', 'older']) {
        const h = harness(); h.install('updateAttendanceEditButtons');
        const open = mode !== 'closed';
        h.element('attendanceEditModal').classList.contains = name => name === 'hidden' ? !open : name === 'flex' && open;
        const status = new Set();
        h.element('attEditStatusDisplay').classList = { add: name => status.add(name), remove: name => status.delete(name) };
        h.state.now = '2026-11-01T20:59:59Z'; h.run('setupDatesAndTimezone()');
        h.run("students[0].history['2026-11-02'] = { attended: false, absence: 'excused', note: 'ملاحظة اليوم الجديد' }");
        h.element('attEditAbsence').value = 'unexcused'; h.element('attEditNote').value = 'ملاحظة قديمة';
        if (mode === 'holiday') h.state.season.calendar = [holiday()];
        if (mode === 'older') h.run('attendanceDateFollowsToday = false');
        h.state.now = '2026-11-01T21:00:01Z'; h.run('refreshToday()');
        assert.equal(h.element('attEditDateInput').value, mode === 'older' ? '2026-11-01' : '2026-11-02');
        if (mode === 'school') {
            assert.equal(h.run('attEditChoice'), false);
            assert.equal(h.element('attEditAbsence').value, 'excused');
            assert.equal(h.element('attEditNote').value, 'ملاحظة اليوم الجديد');
            assert.equal(status.has('hidden'), false);
        } else if (mode === 'holiday') {
            assert.equal(h.run('attEditChoice'), null);
            assert.equal(status.has('hidden'), true);
            assert.equal(h.state.messages.at(-1).message, 'اليوم إجازة: إجازة وهمية');
        } else {
            assert.equal(h.run('attEditChoice'), true);
            assert.equal(h.element('attEditNote').value, 'ملاحظة قديمة');
            assert.equal(h.state.messages.length, 0);
        }
        assert.equal(h.state.writes.length, 0);
        assert.equal(h.state.updates, 1);
    }
});

test('golden confirmation crossing midnight rechecks the new day before building or saving history', () => {
    const h = harness(); h.state.now = '2026-11-01T20:59:59Z'; h.run('setupDatesAndTimezone()');
    h.state.season.calendar = [holiday()];
    h.run("let selectedMinor = { id: 'qisar', name: 'محطة وهمية', points: 1 }, selectedJuzs = []");
    h.ctx.fmtQty = value => String(value);
    h.ctx.confirm = () => { h.state.now = '2026-11-01T21:00:01Z'; return true; };
    h.run('saveSmartMastery()');
    assert.equal(h.state.writes.length, 0); assert.equal(h.run('todayStr'), '2026-11-02');
    assert.equal(h.state.messages.at(-1).message, 'اليوم إجازة: إجازة وهمية');
});

test('weekly sheet shades holiday/outside-term rows without boxes and escapes the holiday name', () => {
    const h = harness(); h.install('buildGeneralWeeklySheetHtml');
    h.ctx.getStudentHalaqa = () => null;
    h.state.season.calendar = [holiday({ name: '<إجازة وهمية>' })];
    h.ctx.week = { days: [{ dateStr: '2026-11-02', dayName: 'الإثنين' }, { dateStr: '2027-01-03', dayName: 'الأحد' }, { dateStr: '2026-11-01', dayName: 'الأحد' }] };
    const sheet = h.run("buildGeneralWeeklySheetHtml(students[0], week, getProgramSettings(), { seasonName: 'موسم وهمي' })");
    const rows = sheet.match(/<tbody>([\s\S]*?)<\/tbody>/)[1].match(/<tr[\s\S]*?<\/tr>/g);
    assert.match(rows[0], /إجازة: &lt;إجازة وهمية&gt;/); assert.match(rows[0], /background:#e2e8f0/);
    assert.doesNotMatch(rows[0], /gws-box|gws-options|<input|<td><\/td>/);
    assert.match(rows[1], /خارج الفصل/); assert.doesNotMatch(rows[1], /gws-box|gws-options|<td><\/td>/);
    assert.match(rows[2], /gws-box/);
});

test('scope: points, patch/builder and shared settings are unchanged; store adds only the calendar method', () => {
    const cp = require('node:child_process'), root = path.join(__dirname, '..');
    // خط أساس الخطوة ٥ ثابت؛ HEAD صار يحتوي دالة التقويم بعد دمجها.
    const baselineHtml = cp.execFileSync('git', ['show', 'e608836:index.html'], { cwd: root, encoding: 'utf8' });
    const baselineStore = cp.execFileSync('git', ['show', 'e608836:programs-store.js'], { cwd: root, encoding: 'utf8' });
    // ٦ب غيّرت قارئات الحضور عمداً؛ اختبارها يحمي المسارين الآخرين مقابل خط أساس ٦أ.
    for (const name of ['getProgramSettings', 'commitStudentPatch', 'buildEntryPatch', 'getCumulativeStats']) {
        assert.equal(source(name, require('./helpers/board-invariants.cjs').beforeKnightsRound2b(html)).replaceAll('\r\n', '\n'), source(name, baselineHtml).replaceAll('\r\n', '\n'), name);
    }
    // الخطوة ٧ تطفئ افتراضي ميزتين في العام وحده؛ بقية الملف تبقى محمية.
    const withoutCalendar = require('./helpers/board-invariants.cjs').beforeBoard(store, 'programs-store.js').replace(/    \/\/ التقويم مستقل عن الإعدادات، مع كشف تعارض الأجهزة\.[\s\S]*?(?=    \/\/ تحديث إعدادات البرنامج)/, '')
        .replace('newMemorization: true, review: true, goldenBoard: false, attendance: true,', 'newMemorization: true, review: true, goldenBoard: true, attendance: true,')
        .replace('groups: false, pomodoro: false, tiers: false', 'groups: false, pomodoro: true, tiers: false');
    assert.equal(withoutCalendar.replaceAll('\r\n', '\n'), baselineStore.replaceAll('\r\n', '\n'));
});
