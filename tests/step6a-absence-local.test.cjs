// Offline only: production functions with synthetic students, clock, DOM and batch writes.
// Run: node --test tests/*.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
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
const student = (id, name, fields = {}) => ({ id, sid: `synthetic-${id}`, name, halaqaId: 'h1', history: {}, ...fields });
function harness(list = [student(1, 'طالب وهمي')]) {
    const state = { program: 'general', now: '2026-11-04T15:00:00Z', archived: false, messages: [], prompts: [], batches: [], updates: 0,
        season: { id: 's1', termStart: '2026-10-25', termEnd: '2026-12-31', calendar: [] },
        settings: { workingDays: [0, 1, 2, 3, 4], halaqas: [
            { id: 'h1', name: 'حلقة وهمية', active: true }, { id: 'h2', name: 'حلقة أخرى', active: true },
            { id: 'off', name: 'حلقة معطلة', active: false }],
        absence: [{ id: 'excused', name: 'بعذر' }, { id: 'unexcused', name: 'بغير عذر' }] } };
    class Clock extends Date { constructor(...args) { super(...(args.length ? args : [state.now])); } }
    const elements = new Map();
    const element = id => {
        if (elements.has(id)) return elements.get(id);
        const classes = new Set(['hidden']);
        let markup = '';
        const el = { value: '', checked: false, disabled: false, textContent: '', innerText: '', style: {},
            classList: { add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n)),
                contains: name => classes.has(name), toggle(name, force) {
                    const on = force === undefined ? !classes.has(name) : force;
                    if (on) classes.add(name); else classes.delete(name);
                } },
            get innerHTML() { return markup; }, set innerHTML(value) {
                markup = value;
                // Small DOM fixture: generated controls retain the same values/attributes as the markup.
                for (const match of value.matchAll(/<(input|select|textarea|div)\b([^>]*\bid="([^"]+)"[^>]*)>([\s\S]*?)(?=<|$)/g)) {
                    const child = element(match[3]);
                    child.checked = /\bchecked\b/.test(match[2]); child.disabled = /\bdisabled\b/.test(match[2]);
                    child.value = match[1] === 'textarea' ? match[4] : '';
                }
                if (id === 'generalAbsenceHalaqa') el.value = /<option value="([^"]*)"/.exec(value)?.[1] || '';
            } };
        elements.set(id, el); return el;
    };
    const programs = { getCurrentProgramId: () => state.program, getCurrentSeason: () => state.season,
        getCurrentSeasonId: () => state.season.id, isCurrentSeasonArchived: () => state.archived };
    const ctx = vm.createContext({ console, Date: Clock, Intl, structuredClone,
        document: { getElementById: element }, window: { almahraPrograms: programs, almahraData: {
            commitBatch: batch => { state.batches.push(copy(batch)); return Promise.resolve(state.batchResult || { success: true }); }
        } }, getProgramSettings: () => state.settings, canWriteCloud: () => !state.archived,
        showToast: (message, type) => state.messages.push({ message, type }),
        confirm: message => { state.prompts.push(message); return state.confirm !== false; },
        updateAllUIs() { state.updates++; ctx.updateGeneralAttendanceUI(); }, updateAttendanceEditButtons() {},
        renderCompactTripGrid() {}, renderStudentsGrid() {}, renderSettingsStudents() {}, renderReportsTable() {},
        processRealClockPomodoro() {}, updateThreeKnightsSelects() {}, renderExamEntryList() {}, renderExamResultsReport() {}, renderHomeDashboard() {} });
    const run = code => vm.runInContext(code, ctx);
    const install = (...names) => names.forEach(name => run(source(name)));
    ctx.fixtures = list;
    run(`let students = fixtures, todayStr = '', hijriDateStr = '', gregorianDateStr = '';
        let generalAbsenceDraft = null, attEditStudentId = null, attEditChoice = null, attendanceDateFollowsToday = true;
        const DEL_FIELD = Object.freeze({ __almahraDelete: true });
        const ALL_DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];`);
    install('isGeneralProgram', 'isWorkingDay', 'getStudentHalaqa', 'escapeHTML', 'schoolCivilDate', 'formatDateLocal', 'getWeekStartDate',
        'hijriForDateStr', 'setupDatesAndTimezone', 'refreshToday', 'isSeasonCalendarComplete', 'requireSchoolCalendar', 'getSchoolDayInfo', 'requireSchoolDay',
        'getAttendanceState', 'generalAttendanceStart', 'getGeneralUnrecordedDays', 'updateGeneralAttendanceUI',
        'openGeneralAbsenceModal', 'closeGeneralAbsenceModal', 'validateGeneralAbsenceDate', 'loadGeneralAbsenceList', 'toggleGeneralAbsenceRow', 'saveGeneralAbsence',
        'canWriteHistory', 'applyFieldsLocally', 'restoreStudent', 'commitPatches',
        'lastSchoolDateBeforeToday', 'openAttendanceEditModal', 'loadAttendanceForDate', 'setAttendanceEditChoice', 'updateSchoolCalendarAlert');
    run('setupDatesAndTimezone()');
    return { state, ctx, run, install, element, list,
        open(date = '2026-11-04') { ctx.selected = date; run('openGeneralAbsenceModal(selected)'); },
        mark(i, reason = 'excused', note = '') { element(`generalAbsent${i}`).checked = true;
            element(`generalReason${i}`).value = reason; element(`generalNote${i}`).value = note; },
        holiday(date = '2026-11-02') { state.season.calendar = [{ from: date, to: date, name: 'إجازة وهمية', kind: 'official' }]; } };
}

test('read states: entries override false, manual present, absent reason/note, missing and hijri-only are unrecorded; holiday takes precedence', () => {
    const h = harness();
    for (const [day, expected] of [
        [{ attended: false, entries: { e1: { kind: 'new' } } }, { state: 'present', hasEntries: true }],
        [{ attended: true }, { state: 'present', hasEntries: false }],
        [{ attended: false, absence: 'excused', note: 'ملاحظة وهمية' }, { state: 'absent', absence: 'excused', note: 'ملاحظة وهمية' }],
        [undefined, { state: 'unrecorded' }], [{ hijri: 'تاريخ وهمي' }, { state: 'unrecorded' }],
        [{ entries: {} }, { state: 'unrecorded' }]
    ]) {
        h.list[0].history['2026-11-04'] = day;
        assert.deepEqual(copy(h.run("getAttendanceState(students[0], '2026-11-04')")), expected);
    }
    h.list[0].history['2026-11-04'] = { attended: true };
    h.holiday('2026-11-04');
    assert.equal(h.run("getAttendanceState(students[0], '2026-11-04').state"), 'holiday');
    assert.equal(h.run("getAttendanceState(students[0], '2026-11-06').reason"), 'not-working-day');
});

test('list contains only selected halaqa, sorted names, active halaqas only and escaped user text', () => {
    const h = harness([student(1, 'زيد'), student(2, 'أحمد'), student(3, 'خارج الحلقة', { halaqaId: 'h2' }), student(4, '<script>وهمي</script>')]);
    h.state.settings.halaqas[0].name = '<حلقة>';
    h.open();
    assert.deepEqual(copy(h.run('generalAbsenceDraft.rows.map(r => r.id)')), h.list.filter(s => s.halaqaId === 'h1').sort((a, b) => a.name.localeCompare(b.name, 'ar')).map(s => s.id));
    assert.doesNotMatch(h.element('generalAbsenceRows').innerHTML, /خارج الحلقة|<script>/);
    assert.match(h.element('generalAbsenceRows').innerHTML, /&lt;script&gt;/);
    assert.match(h.element('generalAbsenceHalaqa').innerHTML, /&lt;حلقة&gt;/);
    assert.doesNotMatch(h.element('generalAbsenceHalaqa').innerHTML, /حلقة معطلة/);
    h.element('generalAbsenceHalaqa').value = 'h2'; h.run('loadGeneralAbsenceList()');
    assert.deepEqual(copy(h.run('generalAbsenceDraft.rows.map(r => r.id)')), [3]);
});

test('reciting student is present and disabled, manual present can be corrected; two absences use one batch and only attendance fields', () => {
    const h = harness([student(1, 'أحمد', { history: { '2026-11-04': { entries: { e1: {} } } } }),
        student(2, 'بدر', { history: { '2026-11-04': { attended: true, hijri: 'لا يتغير', criteria: { c: true } } } }), student(3, 'زيد')]);
    h.open();
    assert.match(h.element('generalAbsenceRows').innerHTML, /حاضر \(سمّع\)/);
    assert.equal(h.element('generalAbsent0').disabled, true);
    h.mark(0); h.mark(1, 'excused', '  عذر وهمي  '); h.mark(2, 'unexcused');
    h.run('saveGeneralAbsence()');
    assert.equal(h.state.batches.length, 1); assert.equal(h.state.batches[0].length, 2);
    const [manual, fresh] = h.state.batches[0];
    assert.deepEqual(manual.fields, { 'history.2026-11-04.attended': false, 'history.2026-11-04.absence': 'excused', 'history.2026-11-04.note': 'عذر وهمي' });
    assert.equal(fresh.fields['history.2026-11-04.attended'], false);
    assert.equal(fresh.fields['history.2026-11-04.absence'], 'unexcused');
    assert.equal(fresh.fields['history.2026-11-04.note'], '');
    assert.equal(typeof fresh.fields['history.2026-11-04.hijri'], 'string');
    assert.equal(h.list[1].history['2026-11-04'].hijri, 'لا يتغير');
    assert.deepEqual(h.list[1].history['2026-11-04'].criteria, { c: true });
    assert.equal(h.state.messages.at(-1).message, 'حُفظ: ٢ غائب');
    assert.equal(h.element('generalAbsent1').checked, true);
    assert.equal(h.element('generalUnrecordedAlert').classList.contains('hidden'), true);
    h.run('saveGeneralAbsence()'); assert.equal(h.state.batches.length, 1);
});

test('one missing reason rejects the whole batch and names the escaped student', () => {
    const h = harness([student(1, 'أحمد'), student(2, 'زيد<وهمي>')]); h.open();
    h.mark(0); h.mark(1, ''); h.run('saveGeneralAbsence()');
    assert.equal(h.state.batches.length, 0);
    assert.match(h.state.messages.at(-1).message, /زيد&lt;وهمي&gt;/);
    assert.equal(h.list[0].history['2026-11-04'], undefined);
});

test('previous absence is populated, editable, and unchecking deletes all three fields without writing present or changing hijri', () => {
    const h = harness([student(1, 'طالب وهمي', { history: { '2026-11-04': { attended: false, absence: 'excused', note: 'عذر', hijri: 'يبقى' } } })]);
    h.open(); assert.equal(h.element('generalAbsent0').checked, true);
    assert.equal(h.element('generalReason0').value, 'excused'); assert.equal(h.element('generalNote0').value, 'عذر');
    h.mark(0, 'unexcused', 'تصحيح'); h.run('saveGeneralAbsence()');
    assert.equal(h.list[0].history['2026-11-04'].note, 'تصحيح');
    h.element('generalAbsent0').checked = false; h.run('saveGeneralAbsence()');
    assert.deepEqual(h.state.batches[1][0].fields, Object.fromEntries(['attended', 'absence', 'note'].map(k => [`history.2026-11-04.${k}`, { __almahraDelete: true }])));
    assert.deepEqual(h.list[0].history['2026-11-04'], { hijri: 'يبقى' });
    assert.equal(h.run("getAttendanceState(students[0], '2026-11-04').state"), 'unrecorded');
    assert.match(h.element('generalUnrecordedAlert').innerHTML, /اليوم: ١ لم يُسجَّلوا بعد/);
});

test('history guard accepts only complete deletion, including at save when calendar changes', () => {
    const h = harness();
    for (const fields of ["{ 'history.2026-11-04.attended': DEL_FIELD }", "{ 'history.2026-11-04.absence': DEL_FIELD }",
        "{ 'history.2026-11-04.note': DEL_FIELD }", "{ 'history.2026-11-04.attended': DEL_FIELD, 'history.2026-11-04.absence': DEL_FIELD }"]) {
        assert.equal(h.run(`canWriteHistory(${fields})`), false);
    }
    assert.equal(h.run("canWriteHistory({ 'history.2026-11-04.attended': DEL_FIELD, 'history.2026-11-04.absence': DEL_FIELD, 'history.2026-11-04.note': DEL_FIELD })"), true);
    h.open(); h.mark(0); h.holiday('2026-11-04'); h.run('saveGeneralAbsence()');
    assert.equal(h.state.batches.length, 0); assert.match(h.state.messages.at(-1).message, /إجازة وهمية/);
});

test('holiday, future and outside-term dates show no list; old week needs confirm, cancel rejects, successful save does not ask twice', () => {
    const h = harness(); h.holiday();
    h.open('2026-11-02'); assert.equal(h.run('generalAbsenceDraft'), null);
    assert.match(h.state.messages.at(-1).message, /2026-11-02 إجازة: إجازة وهمية/);
    assert.equal(h.element('generalAbsenceRows').innerHTML, '');
    h.open('2026-11-05'); assert.equal(h.run('generalAbsenceDraft'), null); assert.match(h.state.messages.at(-1).message, /مستقبلي/);
    h.open('2026-10-20'); assert.match(h.state.messages.at(-1).message, /خارج الفصل/);
    h.state.confirm = false; h.open('2026-10-29'); assert.equal(h.run('generalAbsenceDraft'), null);
    assert.equal(h.state.prompts.at(-1), 'هذا من أسبوع سابق. هل تكمل؟');
    h.state.confirm = true; h.open('2026-10-29'); h.mark(0); h.run('saveGeneralAbsence()');
    assert.equal(h.state.prompts.length, 2); assert.equal(h.state.batches.length, 1);
});

test('no-op save writes nothing, read-only and stale season/halaqa reject; a new recitation cannot be overwritten', () => {
    const h = harness(); h.open(); h.run('saveGeneralAbsence()'); assert.equal(h.state.batches.length, 0);
    h.mark(0); h.state.archived = true; h.run('saveGeneralAbsence()'); assert.equal(h.state.batches.length, 0);
    h.state.archived = false; h.state.season.id = 's2'; h.run('saveGeneralAbsence()'); assert.equal(h.state.batches.length, 0);
    h.state.season.id = 's1'; h.list[0].history['2026-11-04'] = { entries: { e1: {} } };
    h.run('saveGeneralAbsence()'); assert.equal(h.state.batches.length, 0); assert.match(h.state.messages.at(-1).message, /سمّع/);
    h.list[0].history = {}; h.list[0].halaqaId = 'h2'; h.run('saveGeneralAbsence()'); assert.equal(h.state.batches.length, 0);
});

test('alert counts only school days this week through today, active halaqas and days since first history; empty history counts today only', () => {
    const h = harness([
        student(1, 'قديم', { history: { '2026-10-29': { attended: true } } }),
        student(2, 'جديد', { history: { '2026-11-03': { hijri: 'وهمي' } } }),
        student(3, 'بلا سجل'), student(4, 'بلا حلقة', { halaqaId: '', history: { '2026-10-29': {} } }),
        student(5, 'معطل', { halaqaId: 'off', history: { '2026-10-29': {} } }),
        student(6, 'حاضر', { history: Object.fromEntries(['2026-11-01', '2026-11-03', '2026-11-04'].map(d => [d, { attended: true }])) }),
        student(7, 'غائب', { history: Object.fromEntries(['2026-11-01', '2026-11-03', '2026-11-04'].map(d => [d, { attended: false, absence: 'excused', note: '' }])) })
    ]);
    h.holiday();
    assert.deepEqual(copy(h.run('getGeneralUnrecordedDays()')), [
        { dateStr: '2026-11-01', count: 1 }, { dateStr: '2026-11-03', count: 2 }, { dateStr: '2026-11-04', count: 3 }]);
    h.run('updateGeneralAttendanceUI()');
    assert.match(h.element('generalUnrecordedAlert').innerHTML, /openGeneralAbsenceModal\('2026-11-03'\)/);
    assert.doesNotMatch(h.element('generalUnrecordedAlert').innerHTML, /2026-11-02|2026-11-05|2026-10-29/);
    for (const s of h.list) for (const date of ['2026-11-01', '2026-11-03', '2026-11-04']) s.history[date] = { attended: true };
    h.run('updateGeneralAttendanceUI()'); assert.equal(h.element('generalUnrecordedAlert').classList.contains('hidden'), true);
    h.state.season.calendar = undefined; assert.deepEqual(copy(h.run('getGeneralUnrecordedDays()')), []);
});

test('updateAllUIs refreshes the alert, refreshToday updates it after midnight and a new Sunday drops the old week', () => {
    const h = harness([student(1, 'طالب', { history: { '2026-10-29': {} } })]); h.install('updateAllUIs');
    h.run('updateAllUIs()'); assert.match(h.element('generalUnrecordedAlert').innerHTML, /2026-11-04/);
    h.state.now = '2026-11-05T00:30:00Z'; h.run('refreshToday()');
    assert.match(h.element('generalUnrecordedAlert').innerHTML, /2026-11-05/);
    h.state.now = '2026-11-08T00:30:00Z'; h.run('refreshToday()');
    assert.deepEqual(copy(h.run('getGeneralUnrecordedDays()')), [{ dateStr: '2026-11-08', count: 1 }]);
});

test('alert computes the attendance start once per eligible student across school days', () => {
    const h = harness([
        student(1, 'قديم', { history: { '2026-10-29': {} } }),
        student(2, 'جديد', { history: { '2026-11-03': {} } }),
        student(3, 'معطل', { halaqaId: 'off', history: { '2026-10-29': {} } })
    ]);
    h.holiday(); h.ctx.attendanceStartCalls = [];
    h.run(`const originalAttendanceStart = generalAttendanceStart;
        generalAttendanceStart = student => { attendanceStartCalls.push(student.id); return originalAttendanceStart(student); };`);
    assert.deepEqual(copy(h.run('getGeneralUnrecordedDays()')), [
        { dateStr: '2026-11-01', count: 1 }, { dateStr: '2026-11-03', count: 2 }, { dateStr: '2026-11-04', count: 2 }]);
    assert.deepEqual(h.ctx.attendanceStartCalls, [1, 2]);
});

test('old-date approval survives halaqa changes and saving, but expires when the date changes', () => {
    const h = harness([student(1, 'طالب أول'), student(2, 'طالب آخر', { halaqaId: 'h2' })]);
    h.open('2026-10-29'); assert.equal(h.state.prompts.length, 1);
    for (const halaqa of ['h2', 'h1', 'h2']) {
        h.element('generalAbsenceHalaqa').value = halaqa; h.run('loadGeneralAbsenceList()');
        assert.equal(h.state.prompts.length, 1);
        assert.equal(h.run('generalAbsenceDraft.halaqaId'), halaqa);
    }
    h.mark(0); h.run('saveGeneralAbsence()');
    assert.equal(h.state.batches.length, 1); assert.equal(h.state.prompts.length, 1);
    h.element('generalAbsenceDate').value = '2026-10-28'; h.run('loadGeneralAbsenceList()');
    assert.equal(h.state.prompts.length, 2);
    h.state.confirm = false;
    h.element('generalAbsenceDate').value = '2026-10-29'; h.run('loadGeneralAbsenceList()');
    assert.equal(h.state.prompts.length, 3); assert.equal(h.run('generalAbsenceDraft'), null);
    h.element('generalAbsenceHalaqa').value = 'h1'; h.run('loadGeneralAbsenceList()');
    assert.equal(h.state.prompts.length, 4); assert.equal(h.run('generalAbsenceDraft'), null);
});

test('save message reports saved absences, removals, and mixed changes accurately', () => {
    for (const [saved, removed, expected] of [
        [2, 0, 'حُفظ: ٢ غائب'], [0, 1, 'أُزيل غياب ١'], [2, 1, 'حُفظ: ٢ غائب، وأُزيل غياب ١']
    ]) {
        const h = harness([
            student(1, 'أحمد'), student(2, 'بدر'),
            student(3, 'زيد', { history: { '2026-11-04': { attended: false, absence: 'excused', note: '' } } })
        ]);
        h.open();
        for (let i = 0; i < saved; i++) h.mark(i);
        if (removed) h.element('generalAbsent2').checked = false;
        h.run('saveGeneralAbsence()');
        assert.equal(h.state.batches[0].length, saved + removed);
        assert.equal(h.state.messages.at(-1).message, expected);
    }
});

test('reopening attendance edit without a previous school day clears the previous student UI', () => {
    const h = harness([
        student(1, 'طالب أول', { history: { '2026-11-03': { attended: false, absence: 'excused', note: 'ملاحظة سابقة' } } }),
        student(2, 'طالب آخر')
    ]);
    h.install('updateAttendanceEditButtons'); h.holiday('2026-11-04');
    h.run('openAttendanceEditModal(1)');
    assert.equal(h.run('attEditChoice'), false);
    assert.equal(h.element('attEditAbsence').value, 'excused');
    assert.equal(h.element('attEditNote').value, 'ملاحظة سابقة');
    assert.match(h.element('attEditAbsentBtn').className, /bg-red-500/);
    assert.equal(h.element('attEditStatusDisplay').classList.contains('hidden'), false);
    h.state.season.termStart = '2026-11-04';
    h.run('openAttendanceEditModal(2)');
    assert.equal(h.element('attEditDateInput').value, '');
    assert.equal(h.run('attEditChoice'), null);
    assert.equal(h.element('attEditStatusDisplay').classList.contains('hidden'), true);
    assert.equal(h.element('attEditAbsence').value, ''); assert.equal(h.element('attEditNote').value, '');
    assert.equal(h.element('generalAbsenceFields').classList.contains('hidden'), true);
    for (const id of ['attEditPresentBtn', 'attEditAbsentBtn']) {
        assert.match(h.element(id).className, /bg-white/);
        assert.doesNotMatch(h.element(id).className, /bg-(red|emerald)-500/);
    }
});

test('attendance edit on holiday opens on last school day, skips long holidays, or stays empty with no status', () => {
    const h = harness(); h.holiday('2026-11-04');
    h.run('openAttendanceEditModal(1)'); assert.equal(h.element('attEditDateInput').value, '2026-11-03');
    assert.equal(h.element('attendanceEditModal').classList.contains('flex'), true);
    assert.equal(h.state.messages.length, 0);
    h.state.season.calendar = [{ from: '2026-10-30', to: '2026-11-04', name: 'إجازة طويلة' }];
    h.run('openAttendanceEditModal(1)'); assert.equal(h.element('attEditDateInput').value, '2026-10-29');
    h.state.season.termStart = '2026-11-01';
    h.run('openAttendanceEditModal(1)'); assert.equal(h.element('attEditDateInput').value, '');
    assert.equal(h.element('attEditStatusDisplay').classList.contains('hidden'), true); assert.equal(h.run('attEditChoice'), null);
    delete h.state.season.calendar; h.element('attendanceEditModal').classList.remove('flex');
    h.run('openAttendanceEditModal(1)'); assert.equal(h.element('attendanceEditModal').classList.contains('flex'), false);
});

test('summer and review-day have no absence button or bar and preserve attendance-edit default', () => {
    const h = harness();
    assert.match(html, /id="generalAttendanceTools" class="hidden/);
    assert.match(html, /id="generalUnrecordedAlert" class="hidden/);
    for (const program of ['summer', 'review-day']) {
        h.state.program = program; h.state.season.calendar = undefined;
        h.run('updateGeneralAttendanceUI()');
        assert.equal(h.element('generalAttendanceTools').classList.contains('hidden'), true);
        assert.equal(h.element('generalUnrecordedAlert').classList.contains('hidden'), true);
        h.open(); assert.equal(h.element('generalAbsenceModal').classList.contains('flex'), false);
        h.run('openAttendanceEditModal(1)'); assert.equal(h.element('attEditDateInput').value, '2026-11-04');
    }
});

test('scope: report, recitation and commit functions remain exactly as the step6 base', () => {
    const cp = require('node:child_process');
    const baseline = cp.execFileSync('git', ['show', '2c20668:index.html'], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
    for (const name of ['getWorkingDaysList', 'calculateStudentAttendance', 'getConsecutiveAbsenceStreak', 'renderHomeDashboard',
        'commitStudentPatch', 'commitPatches', 'buildEntryPatch', 'saveSmartProgress', 'getProgramSettings']) {
        assert.equal(source(name).replaceAll('\r\n', '\n'), source(name, baseline).replaceAll('\r\n', '\n'), name);
    }
});
