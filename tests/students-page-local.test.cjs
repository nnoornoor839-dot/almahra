// بلا شبكة أو بيانات حقيقية: دوال الإنتاج مع DOM وسحابة وهميين، وحاضنة الإدخال السريع الحقيقية.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const cp = require('node:child_process');
const { source, html, root, copy, harness: quickHarness, student: quickStudent, today: quickToday } = require('./helpers/quick-entry-harness.cjs');
const today = '2026-11-04';
const fake = (id, name, day, extra = {}) => ({ id, sid: `synthetic-${id}`, name, halaqaId: 'h1',
    history: day ? { [today]: day } : {}, ...extra });
// مفتاح الإجابة، محسوب باليد: ٢ سمّع + ١ حاضر + ١ لم يُسجَّل = ٤ في المقام؛ غائب ١ خارجه.
// السادس في حلقة أخرى، والسابع في حلقة غير نشطة؛ كلاهما خارج عدّ h1.
const answerKey = () => [
    fake(28, 'أحمد وهمي', { attended: false, entries: { e1: { kind: 'new', grade: 'repeat' } } }),
    fake(29, 'بدر وهمي', { attended: true, entries: { e2: { kind: 'review' } } }),
    fake(30, 'تامر وهمي', { attended: true }), fake(31, 'ثابت وهمي'),
    fake(32, 'جابر وهمي', { attended: false, absence: 'excused', note: 'عذر وهمي' }),
    fake(33, 'خالد وهمي', { attended: true }, { halaqaId: 'h2' }),
    fake(34, 'زيد وهمي', { attended: true }, { halaqaId: 'off' })
];
const pageFunctions = ['generalStudentsQuery', 'generalStudentsMatching', 'generalCardTodayState', 'generalHalaqaTodayCounts',
    'generalHalaqaTodayText', 'selectGeneralStudentsHalaqa', 'generalStudentsSearchKeydown', 'openGeneralStudentsAttendance',
    'generalStudentsCardHtml', 'renderGeneralStudentsGrid', 'renderStudentsGrid', 'generalStudentAttendanceLabel', 'generalAttendanceStart'];

function harness(list = answerKey()) {
    const state = { program: 'general', seasonId: 's1', cloud: true, batches: [], patches: [], messages: [], focus: null,
        calendar: { termStart: '2026-10-01', termEnd: '2026-12-31', calendar: [] },
        settings: { teachers: [{ id: 't1', name: 'معلم وهمي' }], stages: [{ id: 'g1', name: 'مرحلة وهمية' }],
            workingDays: [0, 1, 2, 3, 4], absence: [{ id: 'excused', name: 'بعذر' }, { id: 'unexcused', name: 'بغير عذر' }],
            halaqas: [{ id: 'h1', name: 'ألف', teacherId: 't1', stageId: 'g1', active: true },
                { id: 'h2', name: 'باء', teacherId: 't1', stageId: 'g1', active: true },
                { id: 'off', name: 'موقوفة', teacherId: 't1', stageId: 'g1', active: false }] } };
    const elements = new Map(), listeners = new Map(); let serial = 0, run;
    const element = id => {
        if (elements.has(id)) return elements.get(id);
        const classes = new Set(); let markup = '', checked = false;
        const el = { id, value: '', name: '', tagName: '', children: [], disabled: false, style: {}, dataset: {}, attrs: {},
            classList: { add: (...ns) => ns.forEach(n => classes.add(n)), remove: (...ns) => ns.forEach(n => classes.delete(n)),
                contains: n => classes.has(n), toggle(n, on = !classes.has(n)) { if (on) classes.add(n); else classes.delete(n); } },
            setAttribute(n, v) { this.attrs[n] = v; }, focus() { state.focus = id; },
            querySelectorAll(selector) { return selector === 'button' ? this.children.filter(e => e.tagName === 'BUTTON') : []; },
            get className() { return [...classes].join(' '); }, set className(v) { classes.clear(); v.split(/\s+/).forEach(n => classes.add(n)); },
            get checked() { return checked; }, set checked(v) {
                if (v && el.type === 'radio' && el.name) for (const peer of elements.values())
                    if (peer !== el && peer.name === el.name) peer.checked = false;
                checked = !!v;
            },
            click() { if (!el.disabled) { if (el.type === 'radio') el.checked = true; el.onclick?.(); el.onchange?.(); } },
            get innerHTML() { return markup; }, set innerHTML(v) {
                markup = v; el.children = [];
                for (const m of v.matchAll(/<(input|select|textarea|div|button|section|p)\b([^>]*)>/g)) {
                    const a = m[2], child = element(/\bid="([^"]+)"/.exec(a)?.[1] || `generated-${++serial}`);
                    child.tagName = m[1].toUpperCase(); child.type = /\btype="([^"]+)"/.exec(a)?.[1] || '';
                    child.name = /\bname="([^"]+)"/.exec(a)?.[1] || '';
                    child.className = /\bclass="([^"]+)"/.exec(a)?.[1] || '';
                    const bare = a.replace(/"[^"]*"/g, ''); child.disabled = /\bdisabled\b/.test(bare); child.checked = /\bchecked\b/.test(bare);
                    child.value = child.tagName === 'TEXTAREA' ? v.slice(m.index + m[0].length).split('</textarea>')[0]
                        : /\bvalue="([^"]*)"/.exec(a)?.[1] || '';
                    for (const n of ['onclick', 'onchange']) { const code = new RegExp(`\\b${n}="([^"]*)"`).exec(a)?.[1]; child[n] = code ? () => run(code) : null; }
                    el.children.push(child);
                }
                if (el.tagName === 'SELECT') el.value = /<option value="([^"]*)"/.exec(v)?.[1] || '';
            } };
        elements.set(id, el); return el;
    };
    for (const m of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
        const el = element(m[3]); el.tagName = m[1].toUpperCase(); el.className = /\bclass="([^"]*)"/.exec(m[2])?.[1] || '';
    }
    // زر × مأخوذ من HTML الفعلي، ويُنفَّذ معالج الحدث نفسه عند النقر.
    const closeButton = /<button\b[^>]*onclick="(closeGeneralAbsenceModal\(\))"[^>]*>×<\/button>/.exec(html);
    assert.ok(closeButton);
    element('attendanceCloseButton').onclick = () => run(closeButton[1]);
    const ctx = vm.createContext({ console, Date, Intl, structuredClone, document: { getElementById: id => elements.get(id) || null },
        window: { addEventListener: (name, fn) => listeners.set(name, fn),
        almahraPrograms: { getCurrentProgramId: () => state.program, getCurrentSeasonId: () => state.seasonId,
            getCurrentSeason: () => state.calendar, isCurrentSeasonArchived: () => !state.cloud },
        almahraData: { commitBatch: rows => { state.batches.push(copy(rows)); return state.pending || Promise.resolve({ success: true }); } } },
        getProgramSettings: () => state.settings, refreshToday() {}, canWriteCloud: () => state.cloud, confirm: () => true,
        showToast: (message, type) => state.messages.push({ message, type }), updateAllUIs: () => ctx.renderStudentsGrid(),
        openSmartModal: id => { state.entry = id; }, getWorkingDaysList: () => [], getCumulativeStats: () => ({ totalAyahs: 0 }),
        getConsecutiveAbsenceStreak: () => 0, genericStudentIcon: '<svg class="old-person"></svg>', FOLLOWUP_MIN_STREAK: 2,
        commitStudentPatch(student, fields) { if (!ctx.canWriteHistory(fields)) return false;
            state.patches.push({ id: student.id, fields: copy(fields) }); ctx.applyFieldsLocally(student, fields); return true; } });
    run = code => vm.runInContext(code, ctx);
    ctx.fixtures = list;
    run(`let students = fixtures, todayStr = '${today}', generalStudentsHalaqa = '', generalAbsenceDraft = null;
        let attEditStudentId = null, attEditChoice = null, attendanceDateFollowsToday = true;
        const DEL_FIELD = Object.freeze({ __almahraDelete: true });`);
    const install = (...names) => names.forEach(name => run(source(name)));
    install('isGeneralProgram', 'escapeHTML', 'getStudentHalaqa', 'generalHalaqaLabel', 'generalStudentHalaqaHtml', 'schoolCivilDate',
        'formatDateLocal', 'getWeekStartDate', 'isWorkingDay', 'isSeasonCalendarComplete', 'requireSchoolCalendar', 'getSchoolDayInfo',
        'requireSchoolDay', 'getAttendanceState', ...pageFunctions, 'hijriForDateStr', 'canWriteHistory', 'commitPatches',
        'applyFieldsLocally', 'restoreStudent', 'openGeneralAbsenceModal', 'closeGeneralAbsenceModal', 'validateGeneralAbsenceDate',
        'loadGeneralAbsenceList', 'toggleGeneralAbsenceRow', 'saveGeneralAbsence', 'openAttendanceEditModal', 'closeAttendanceEditModal',
        'lastSchoolDateBeforeToday', 'loadAttendanceForDate', 'setAttendanceEditChoice', 'updateAttendanceEditButtons', 'saveAttendanceEdit');
    const contextListener = /window\.addEventListener\('almahra-program-changed', closeGeneralAbsenceModal\);/.exec(html);
    assert.ok(contextListener); run(contextListener[0]);
    run('renderStudentsGrid()');
    return { state, ctx, run, element, list, install,
        changeContext(program, seasonId = state.seasonId) {
            state.program = program; state.seasonId = seasonId; listeners.get('almahra-program-changed')();
        },
        open(date = today, halaqa = 'h1') { ctx.date = date; ctx.halaqa = halaqa; run('openGeneralAbsenceModal(date, halaqa)'); },
        choose(id, choice, reason = 'excused', note = '') {
            const i = run(`generalAbsenceDraft.rows.findIndex(r => r.id === ${id})`); assert.ok(i >= 0);
            element(`general${choice === 'present' ? 'Present' : 'Absent'}${i}`).click();
            element(`generalReason${i}`).value = reason; element(`generalNote${i}`).value = note;
        },
        save() { return run('saveGeneralAbsence()'); },
        checkPatches() { for (const batch of state.batches) for (const patch of batch) {
            // DEL_FIELD هو كائن ثابت بالإشارة في الإنتاج؛ نعيد رمزه من النسخة المسجلة قبل استدعاء الحارس الحقيقي.
            ctx.checkedFields = patch.fields;
            assert.equal(run('canWriteHistory(Object.fromEntries(Object.entries(checkedFields).map(([k,v]) => [k, v?.__almahraDelete ? DEL_FIELD : v])))'), true);
            assert.ok(Object.keys(patch.fields).every(k => /^history\.\d{4}-\d{2}-\d{2}\.(attended|absence|note|hijri)$/.test(k)));
        } }
    };
}

test('search by name, English and Arabic number; only one result plus Enter opens existing entry', () => {
    const h = harness();
    for (const query of ['أحمد', '28', '٢٨']) {
        h.element('generalStudentSearchInput').value = query; h.run('renderStudentsGrid()');
        assert.match(h.element('studentsGrid').innerHTML, /أحمد وهمي/);
        assert.doesNotMatch(h.element('studentsGrid').innerHTML, /بدر وهمي/);
        let prevented = false; h.ctx.event = { key: 'Enter', preventDefault() { prevented = true; } };
        h.run('generalStudentsSearchKeydown(event)'); assert.equal(h.state.entry, 28); assert.equal(prevented, true);
    }
    delete h.state.entry; h.element('generalStudentSearchInput').value = 'وهمي';
    h.run('generalStudentsSearchKeydown(event)'); assert.equal(h.state.entry, undefined);
    h.element('generalStudentSearchInput').value = '٩٩٩'; h.run('generalStudentsSearchKeydown(event)'); assert.equal(h.state.entry, undefined);
    h.run("selectGeneralStudentsHalaqa('h2')"); h.element('generalStudentSearchInput').value = '٢٨';
    h.run('generalStudentsSearchKeydown(event)'); assert.equal(h.state.entry, undefined); assert.equal(h.state.batches.length, 0);
});

test('answer key: one pure count uses attendance/hasEntries; 2 of 4, absent 1; disabled and other halaqas excluded', () => {
    const h = harness(), before = JSON.stringify(h.list);
    assert.deepEqual(copy(h.run("generalHalaqaTodayCounts(students, 'h1', todayStr, getProgramSettings())")), { recited: 2, total: 4, absent: 1 });
    assert.equal(h.run("generalHalaqaTodayText(generalHalaqaTodayCounts(students, 'h1', todayStr, getProgramSettings()))"), 'سمّع 2 من 4 · غائب 1');
    assert.deepEqual(copy(h.run("generalHalaqaTodayCounts(students, 'off', todayStr, getProgramSettings())")), { recited: 0, total: 0, absent: 0 });
    h.element('generalStudentSearchInput').value = '٢٨'; h.run('renderStudentsGrid()');
    assert.match(h.element('studentsGrid').innerHTML, /سمّع 2 من 4 · غائب 1/); // البحث لا يبدّل مقام الحلقة.
    assert.equal(JSON.stringify(h.list), before); assert.equal(h.state.batches.length, 0);
    assert.match(source('generalCardTodayState'), /getAttendanceState/); assert.match(source('generalHalaqaTodayCounts'), /generalCardTodayState/);
});

test('four card states distinguish recitation from attendance; cards have only entry and attendance actions', () => {
    const h = harness();
    for (const [id, label, style] of [[28, 'سمّع', 'done'], [30, 'حاضر', 'present'], [31, 'لم يُسجَّل', 'none'], [32, 'غائب', 'absent']]) {
        const card = h.run(`generalStudentsCardHtml(students.find(s => s.id === ${id}))`);
        assert.match(card, new RegExp(`gs-${style}">${label}<`));
        assert.equal((card.match(/<button\b/g) || []).length, 2);
        assert.match(card, /إدخال إنجاز/); assert.match(card, /الحضور/);
        assert.doesNotMatch(card, /genericStudentIcon|fa-check|fa-calendar|حفظ:|مراجعة:|opacity|truncate/);
    }
    assert.equal(h.run("generalStudentAttendanceLabel(students[0], todayStr)"), 'حاضر');
});

test('groups and names sort, teacher prefix does not duplicate, chips retain selection and their full counts', () => {
    const h = harness(answerKey().reverse());
    const markup = h.element('studentsGrid').innerHTML;
    assert.ok(markup.indexOf('حلقة ألف') < markup.indexOf('حلقة باء'));
    assert.ok(markup.indexOf('أحمد وهمي') < markup.indexOf('بدر وهمي'));
    assert.match(markup, /الأستاذ معلم وهمي/);
    const chips = h.element('generalStudentsHalaqas');
    assert.match(chips.innerHTML, /^<button[^>]*>كل الحلقات <small>7/);
    assert.match(chips.innerHTML, /ألف <small>5/);
    chips.children.find(e => e.tagName === 'BUTTON' && e.attrs).onclick(); // كل الحلقات.
    h.run("selectGeneralStudentsHalaqa('h1'); renderStudentsGrid()"); assert.equal(h.run('generalStudentsHalaqa'), 'h1');
    h.state.settings.teachers[0].name = 'الأستاذ معلم وهمي'; h.run('renderStudentsGrid()');
    assert.doesNotMatch(h.element('studentsGrid').innerHTML, /الأستاذ الأستاذ/);
    assert.match(h.run('generalStudentHalaqaHtml(students[0])'), /الأستاذ معلم وهمي/);
});

test('entry and attendance buttons call separate existing modals; opening and cancelling never writes', () => {
    const h = harness([fake(31, 'طالب وهمي')]);
    const buttons = h.element('studentsGrid').querySelectorAll('button');
    buttons[1].click(); assert.equal(h.run('attEditStudentId'), 31); assert.equal(h.state.entry, undefined);
    assert.equal(h.element('attendanceEditModal').classList.contains('hidden'), false);
    assert.equal(h.run('attEditChoice'), null); h.run('closeAttendanceEditModal()');
    buttons[0].click(); assert.equal(h.state.entry, 31); assert.equal(h.element('attendanceEditModal').classList.contains('hidden'), true);
    h.run('openGeneralStudentsAttendance()'); assert.match(h.state.messages.at(-1).message, /اختر حلقة/);
    assert.equal(h.run('generalAbsenceDraft'), null);
    h.run("selectGeneralStudentsHalaqa('h1'); openGeneralStudentsAttendance()");
    assert.equal(h.element('generalAbsenceHalaqa').value, 'h1'); assert.equal(h.element('generalAbsenceDate').value, today);
    assert.equal(h.state.batches.length, 0); assert.equal(h.state.patches.length, 0);
});

test('bulk present for unrecorded means attendance without recitation; shape equals individual present; each patch passes history guard', async () => {
    const h = harness([fake(1, 'طالب وهمي')]); h.open(); h.choose(1, 'present'); await h.save();
    const fields = h.state.batches[0][0].fields;
    assert.equal(fields[`history.${today}.attended`], true);
    assert.deepEqual(fields[`history.${today}.absence`], { __almahraDelete: true });
    assert.deepEqual(fields[`history.${today}.note`], { __almahraDelete: true });
    assert.equal(h.run('getAttendanceState(students[0], todayStr).hasEntries'), false);
    assert.equal(h.list[0].history[today].entries, undefined); h.checkPatches();
    const individual = harness([fake(1, 'طالب وهمي')]);
    individual.run('openAttendanceEditModal(1); setAttendanceEditChoice(true); saveAttendanceEdit()');
    const attendanceOnly = object => Object.fromEntries(Object.entries(object).filter(([k]) => !k.endsWith('.hijri')));
    assert.deepEqual(attendanceOnly(fields), attendanceOnly(individual.state.patches[0].fields));
    assert.match(h.state.messages.at(-1).message, /حُفظ: 1 حاضر/);
});

test('bulk absent keeps the 6a write shape and reason/note; no selection never writes', async () => {
    const h = harness([fake(1, 'أحمد وهمي'), fake(2, 'زيد وهمي')]); h.open(); await h.save();
    assert.equal(h.state.batches.length, 0);
    h.choose(1, 'absent', 'unexcused', '  ملاحظة وهمية  '); await h.save();
    assert.equal(h.state.batches[0].length, 1);
    const fields = h.state.batches[0][0].fields;
    assert.deepEqual(Object.fromEntries(Object.entries(fields).filter(([k]) => !k.endsWith('.hijri'))), {
        [`history.${today}.attended`]: false, [`history.${today}.absence`]: 'unexcused', [`history.${today}.note`]: 'ملاحظة وهمية' });
    assert.equal(h.run('getAttendanceState(students[0], todayStr).state'), 'absent');
    assert.deepEqual(h.list[1].history, {}); assert.equal(h.state.messages.at(-1).message, 'حُفظ: 1 غائب'); h.checkPatches();
});

test('previous absence becomes present, deletes only absence/note, keeps hijri/criteria/entries; same individual shape', async () => {
    const day = { attended: false, absence: 'excused', note: 'عذر سابق', hijri: 'يبقى', criteria: { c: 3 }, criteriaPoints: 3, entries: {} };
    const h = harness([fake(1, 'طالب وهمي', copy(day))]); h.open(); h.choose(1, 'present'); await h.save();
    assert.deepEqual(h.list[0].history[today], { attended: true, hijri: 'يبقى', criteria: { c: 3 }, criteriaPoints: 3, entries: {} });
    assert.equal(h.run('getAttendanceState(students[0], todayStr).state'), 'present'); h.checkPatches();
    const individual = harness([fake(1, 'طالب وهمي', copy(day))]);
    individual.run('openAttendanceEditModal(1); setAttendanceEditChoice(true); saveAttendanceEdit()');
    assert.deepEqual(h.state.batches[0][0].fields, individual.state.patches[0].fields);
    assert.equal(h.state.messages.at(-1).message, 'أُزيل غياب 1');
});

test('reciting students cannot become absent; new recitation since opening rejects the entire pending batch', async () => {
    const h = harness(answerKey()); h.open();
    const i = h.run('generalAbsenceDraft.rows.findIndex(r => r.id === 28)');
    assert.equal(h.element(`generalAbsent${i}`).disabled, true);
    h.choose(28, 'absent'); await h.save(); assert.equal(h.state.batches.length, 0);
    h.choose(31, 'absent'); h.list.find(s => s.id === 31).history[today] = { entries: { e: { kind: 'new' } } };
    await h.save(); assert.equal(h.state.batches.length, 0); assert.match(h.state.messages.at(-1).message, /سمّع/);
    assert.equal(h.list[0].history[today].attended, false); // السجل المتعارض لا يلمسه فتح النافذة أو الحفظ.
    assert.equal(h.run('getAttendanceState(students[0], todayStr).hasEntries'), true);
});

test('bulk save waits for cloud before local state, success message and draft reload; double save sends once', async () => {
    const h = harness([fake(1, 'أحمد وهمي'), fake(2, 'بدر وهمي'), fake(3, 'تامر وهمي'),
        fake(4, 'ثابت وهمي', { attended: false, absence: 'excused', note: '' })]);
    h.open(); h.choose(1, 'absent'); h.choose(2, 'absent', 'unexcused'); h.choose(3, 'present'); h.choose(4, 'present');
    const before = copy(h.list), draft = h.run('generalAbsenceDraft'), rowsBefore = copy(draft.rows);
    let release; h.state.pending = new Promise(resolve => { release = resolve; });
    const pending = h.save();
    assert.deepEqual(h.list, before); assert.deepEqual(copy(draft.rows), rowsBefore);
    assert.equal(h.run('generalAbsenceDraft'), draft); assert.equal(h.state.messages.length, 0);
    for (const id of ['generalAbsenceSave', 'generalAbsenceRows', 'generalAbsenceDate', 'generalAbsenceHalaqa'])
        assert.equal(h.element(id).disabled, true);
    h.run("closeGeneralAbsenceModal(); openGeneralAbsenceModal(); loadGeneralAbsenceList()");
    assert.equal(h.run('generalAbsenceDraft'), draft);
    await h.save(); assert.equal(h.state.batches.length, 1); assert.equal(h.state.batches[0].length, 4); h.checkPatches();
    release({ success: true }); await pending;
    assert.equal(h.state.messages.at(-1).message, 'حُفظ: 2 غائب، وأُزيل غياب 1، وحُفظ: 1 حاضر');
    assert.notEqual(h.run('generalAbsenceDraft'), draft);
    assert.deepEqual(h.list.map(s => s.history[today].attended), [false, false, true, true]);
    for (const id of ['generalAbsenceSave', 'generalAbsenceRows', 'generalAbsenceDate', 'generalAbsenceHalaqa'])
        assert.equal(h.element(id).disabled, false);
    await h.save(); assert.equal(h.state.batches.length, 1);
});

test('bulk cloud rejection or throw preserves data, draft and choices; retry sends a new request and succeeds', async () => {
    for (const throws of [false, true]) {
        const h = harness([fake(1, 'أحمد وهمي'), fake(2, 'بدر وهمي', { attended: false, absence: 'excused', note: 'عذر سابق', hijri: 'يبقى' })]);
        h.open(); h.choose(1, 'absent', 'unexcused', 'ملاحظة جديدة'); h.choose(2, 'present');
        const before = copy(h.list), draft = h.run('generalAbsenceDraft'), rowsBefore = copy(draft.rows);
        const markup = h.element('generalAbsenceRows').innerHTML;
        let resolve, reject; h.state.pending = new Promise((yes, no) => { resolve = yes; reject = no; });
        const pending = h.save(); await h.save();
        assert.equal(h.state.batches.length, 1); assert.deepEqual(h.list, before); assert.equal(h.state.messages.length, 0);
        if (throws) reject(Error('رفض وهمي')); else resolve({ success: false, error: 'رفض وهمي' });
        await pending;
        assert.deepEqual(h.list, before); assert.equal(h.run('generalAbsenceDraft'), draft);
        assert.deepEqual(copy(draft.rows), rowsBefore); assert.equal(h.element('generalAbsenceRows').innerHTML, markup);
        assert.equal(h.element('generalAbsent0').checked, true); assert.equal(h.element('generalPresent1').checked, true);
        assert.equal(h.element('generalReason0').value, 'unexcused'); assert.equal(h.element('generalNote0').value, 'ملاحظة جديدة');
        assert.match(h.state.messages.at(-1).message, /فشل الحفظ السحابي: رفض وهمي/);
        assert.ok(h.state.messages.every(m => !m.message.includes('حُفظ') && !m.message.includes('أُزيل')));
        assert.equal(h.element('generalAbsenceSave').disabled, false); assert.equal(h.element('generalAbsenceRows').disabled, false);
        assert.equal(h.element('generalAbsenceSave').textContent, 'حفظ');
        h.state.pending = new Promise(yes => { resolve = yes; });
        const retry = h.save(); assert.equal(h.state.batches.length, 2); assert.deepEqual(h.list, before);
        await h.save(); assert.equal(h.state.batches.length, 2);
        resolve({ success: true }); await retry;
        assert.equal(h.list[0].history[today].attended, false); assert.equal(h.list[0].history[today].note, 'ملاحظة جديدة');
        assert.deepEqual(h.list[1].history[today], { attended: true, hijri: 'يبقى' });
        assert.equal(h.state.messages.at(-1).message, 'حُفظ: 1 غائب، وأُزيل غياب 1'); h.checkPatches();
    }
});

test('bulk result for a previous program or season never applies to the current students', async () => {
    for (const change of ['season', 'program']) {
        const h = harness([fake(1, 'طالب وهمي')]), before = copy(h.list);
        h.open(); h.choose(1, 'present'); let release;
        h.state.pending = new Promise(resolve => { release = resolve; }); const pending = h.save();
        if (change === 'season') h.state.seasonId = 's2'; else h.state.program = 'summer';
        release({ success: true }); await pending;
        assert.deepEqual(h.list, before); assert.equal(h.state.messages.length, 0);
        assert.equal(h.run('generalAbsenceDraft'), null); assert.equal(h.element('generalAbsenceRows').disabled, false);
    }
});

test('pending attendance closes with ×; reopening reports pending attendance and never sends twice', async () => {
    const h = harness([fake(1, 'طالب وهمي')]); h.open(); h.choose(1, 'present');
    let release; h.state.pending = new Promise(resolve => { release = resolve; });
    const pending = h.save(), draft = h.run('generalAbsenceDraft');
    h.element('attendanceCloseButton').click();
    assert.equal(h.element('generalAbsenceModal').classList.contains('hidden'), true);
    assert.equal(draft.saving, true); assert.deepEqual(h.list[0].history, {});
    h.open(); await h.save(); h.run('loadGeneralAbsenceList()');
    assert.equal(h.state.messages.at(-1).message, 'جارٍ حفظ الحضور السابق');
    assert.equal(h.element('generalAbsenceModal').classList.contains('hidden'), true);
    assert.equal(h.run('generalAbsenceDraft'), draft); assert.equal(h.state.batches.length, 1);
    release({ success: true }); await pending;
    assert.equal(h.run('generalAbsenceDraft'), null);
    h.open(); assert.equal(h.element('generalAbsenceModal').classList.contains('hidden'), false);
    await h.save(); assert.equal(h.state.batches.length, 1);
});

// رصد النافذة كلها يكشف إعادة تحميلها أو تعديل أزرارها من نتيجة متأخرة.
function attendanceView(h) {
    return ['generalAbsenceModal', 'generalAbsenceRows', 'generalAbsenceDate', 'generalAbsenceHalaqa', 'generalAbsenceSave']
        .map(id => { const el = h.element(id); return [el.className, el.innerHTML, el.value, el.disabled, el.textContent]; });
}

test('late attendance success after closing updates cards and toast without writing to the closed modal', async () => {
    const h = harness([fake(1, 'طالب وهمي')]); h.open(); h.choose(1, 'present');
    let release; h.state.pending = new Promise(resolve => { release = resolve; }); const pending = h.save();
    h.element('attendanceCloseButton').click(); const closedView = attendanceView(h);
    assert.match(h.element('studentsGrid').innerHTML, /gs-none">لم يُسجَّل/);
    release({ success: true }); await pending;
    assert.equal(h.list[0].history[today].attended, true);
    assert.match(h.element('studentsGrid').innerHTML, /gs-present">حاضر/);
    assert.equal(h.state.messages.at(-1).message, 'حُفظ: 1 حاضر');
    assert.deepEqual(attendanceView(h), closedView); assert.equal(h.run('generalAbsenceDraft'), null);
});

test('late attendance rejection after closing always reports cloud failure and preserves data, cards and modal', async () => {
    for (const throws of [true, false]) {
        const h = harness([fake(1, 'طالب وهمي')]); h.open(); h.choose(1, 'absent');
        const before = copy(h.list), cards = h.element('studentsGrid').innerHTML;
        let resolve, reject; h.state.pending = new Promise((yes, no) => { resolve = yes; reject = no; });
        const pending = h.save(); h.element('attendanceCloseButton').click(); const closedView = attendanceView(h);
        if (throws) reject(Error('انقطع الاتصال')); else resolve({ success: false, error: 'انقطع الاتصال' });
        await pending;
        assert.equal(h.state.messages.at(-1).message, 'فشل الحفظ السحابي: انقطع الاتصال');
        assert.deepEqual(h.list, before); assert.equal(h.element('studentsGrid').innerHTML, cards);
        assert.deepEqual(attendanceView(h), closedView); assert.equal(h.run('generalAbsenceDraft'), null);
        h.state.pending = Promise.resolve({ success: true }); h.open(); h.choose(1, 'present'); await h.save();
        assert.equal(h.state.batches.length, 2); assert.equal(h.list[0].history[today].attended, true);
    }
});

test('program or season change immediately closes pending attendance; late result cannot touch the new context', async () => {
    for (const change of ['program', 'season']) for (const fails of [false, true]) {
        const h = harness([fake(1, 'طالب وهمي')]), before = copy(h.list);
        h.open(); h.choose(1, 'present');
        let resolve, reject; h.state.pending = new Promise((yes, no) => { resolve = yes; reject = no; });
        const pending = h.save();
        h.changeContext(change === 'program' ? 'summer' : 'general', change === 'season' ? 's2' : 's1');
        assert.equal(h.element('generalAbsenceModal').classList.contains('hidden'), true);
        h.run('renderStudentsGrid()'); const cards = h.element('studentsGrid').innerHTML;
        h.open(); await h.save(); assert.equal(h.state.batches.length, 1);
        assert.equal(h.state.messages.at(-1).message, 'جارٍ حفظ الحضور السابق');
        const closedView = attendanceView(h);
        if (fails) reject(Error('رفض الطلب السابق')); else resolve({ success: true });
        await pending;
        assert.deepEqual(h.list, before); assert.equal(h.element('studentsGrid').innerHTML, cards);
        assert.deepEqual(attendanceView(h), closedView); assert.equal(h.run('generalAbsenceDraft'), null);
        assert.ok(h.state.messages.every(m => !m.message.includes('حُفظ')));
        if (fails) assert.equal(h.state.messages.at(-1).message, 'فشل الحفظ السحابي: رفض الطلب السابق');
        else assert.equal(h.state.messages.length, 1);
        h.changeContext('general', 's2'); h.open();
        assert.equal(h.element('generalAbsenceModal').classList.contains('hidden'), false);
        assert.equal(h.run('generalAbsenceDraft.seasonId'), 's2');
    }
});

test('previous school day works; holiday/future/outside term rejected on load and revalidated on save', async () => {
    const h = harness([fake(1, 'طالب وهمي')]); h.open('2026-11-03'); h.choose(1, 'present'); await h.save();
    assert.equal(h.list[0].history['2026-11-03'].attended, true); h.checkPatches();
    for (const date of ['2026-11-05', '2027-01-01', '2026-09-30']) { h.open(date); assert.equal(h.run('generalAbsenceDraft'), null); }
    h.state.calendar.calendar = [{ from: today, to: today, name: 'إجازة وهمية', kind: 'official' }];
    h.open(); assert.equal(h.run('generalAbsenceDraft'), null); assert.match(h.state.messages.at(-1).message, /إجازة/);
    assert.equal(h.state.batches.length, 1);
    h.state.calendar.calendar = []; h.open(); h.choose(1, 'absent');
    h.state.calendar.calendar = [{ from: today, to: today, name: 'إجازة وهمية', kind: 'official' }]; await h.save();
    assert.equal(h.state.batches.length, 1);
    h.state.calendar.calendar = []; h.open(); h.choose(1, 'present'); h.run("todayStr = '2026-11-03'"); await h.save();
    assert.equal(h.state.batches.length, 1); assert.match(h.state.messages.at(-1).message, /مستقبلي/);
});

test('bulk guards keep untouched students, reject stale season/halaqa, archived writes and invalid reasons; complete-delete guard remains', async () => {
    const h = harness([fake(1, 'طالب وهمي')]); h.open(); h.choose(1, 'absent', 'bad'); await h.save(); assert.equal(h.state.batches.length, 0);
    h.choose(1, 'present'); h.state.seasonId = 's2'; await h.save(); assert.equal(h.state.batches.length, 0);
    h.state.seasonId = 's1'; h.state.cloud = false; await h.save(); assert.equal(h.state.batches.length, 0);
    h.state.cloud = true; h.list[0].halaqaId = 'h2'; await h.save(); assert.equal(h.state.batches.length, 0);
    assert.equal(h.run(`canWriteHistory({ 'history.${today}.attended': DEL_FIELD })`), false);
    assert.equal(h.run(`canWriteHistory({ 'history.${today}.attended': DEL_FIELD, 'history.${today}.absence': DEL_FIELD, 'history.${today}.note': DEL_FIELD })`), true);
});

function quickPage() {
    const h = quickHarness(quickStudent({}, { lastSurah: 114, lastAyah: 3, history: {} }));
    h.run("let generalStudentsHalaqa = 'h1'"); h.install(...pageFunctions, 'escapeHTML');
    const oldUpdate = h.ctx.updateAllUIs; h.ctx.updateAllUIs = () => { oldUpdate(); h.run('renderStudentsGrid()'); };
    h.range('new', null, [114, 6]); h.grade('new'); h.preview();
    h.element('generalStudentSearchInput').value = 'طالب'; h.run('renderStudentsGrid()');
    return h;
}

test('real successful quick save clears and focuses search, keeps halaqa and refreshes card/count; rejection leaves query', async () => {
    const h = quickPage(); let release; h.state.pending = new Promise(resolve => { release = resolve; });
    const pending = h.save(); assert.equal(h.element('generalStudentSearchInput').value, 'طالب');
    release({ success: true }); await pending;
    assert.equal(h.element('generalStudentSearchInput').value, ''); assert.equal(h.state.focus, 'generalStudentSearchInput');
    assert.equal(h.run('generalStudentsHalaqa'), 'h1'); assert.match(h.element('studentsGrid').innerHTML, /gs-done">سمّع/);
    assert.match(h.element('studentsGrid').innerHTML, /سمّع 1 من 1/);
    const fail = quickPage(); fail.state.pending = Promise.resolve({ success: false, error: 'فشل وهمي' }); await fail.save();
    assert.equal(fail.element('generalStudentSearchInput').value, 'طالب'); assert.equal(fail.run('generalStudentsHalaqa'), 'h1');
    assert.doesNotMatch(fail.element('studentsGrid').innerHTML, /gs-done/);
});

test('TV connected or disconnected retains the save message without supervisor overlay', async () => {
    for (const enabled of [true, false]) {
        const h = quickPage(); h.ctx.window.almahraData.isReady = () => true;
        h.ctx.window.almahraData.getActiveProgramId = () => 'general'; h.ctx.window.almahraData.getActiveSeasonId = () => 's1';
        h.ctx.events = []; h.ctx.window.crypto = { randomUUID: () => 'synthetic-event' };
        h.run(`generalTv.enabled = ${enabled}; generalTv.lastHello = Date.now(); generalTv.dataContext = generalTvContext(); generalTv.channel = { postMessage(message) { events.push(message); } }`);
        await h.save();
        assert.equal(h.element('knightCelebrationModal').classList.contains('hidden'), true);
        assert.equal(h.state.confetti, 0);
        assert.match(h.state.messages.at(-1).message, /^حُفظ لطالب وهمي: /);
        if (enabled) {
            assert.equal(h.ctx.events.length, 1); assert.equal(h.ctx.events[0].type, 'celebrate'); }
    }
    const stale = quickPage(); stale.ctx.window.almahraData.isReady = () => true;
    stale.ctx.window.almahraData.getActiveProgramId = () => 'general'; stale.ctx.window.almahraData.getActiveSeasonId = () => 's1';
    stale.run("generalTv.enabled = true; generalTv.lastHello = Date.now(); generalTv.dataContext = 'general:other'");
    await stale.save(); assert.equal(stale.state.confetti, 0);
});

test('TV closed after opening or missing hello for 90 seconds disconnects without supervisor celebration', async () => {
    for (const disconnect of ['closed', 'timeout']) {
        const h = quickPage(); h.ctx.window.almahraData.isReady = () => true;
        h.ctx.window.almahraData.getActiveProgramId = () => 'general'; h.ctx.window.almahraData.getActiveSeasonId = () => 's1';
        h.ctx.events = [];
        h.run("generalTv.enabled = true; generalTv.lastHello = Date.now(); generalTv.dataContext = generalTvContext(); generalTv.window = { closed: false }; generalTv.channel = { postMessage(message) { events.push(message); } }");
        let release; h.state.pending = new Promise(resolve => { release = resolve; }); const pending = h.save();
        // الانقطاع يقع أثناء الحفظ، وقبل موعد النبضة التالية؛ القرار عند نجاح الحفظ نفسه.
        if (disconnect === 'closed') h.run('generalTv.window.closed = true');
        else h.run('generalTv.lastHello = Date.now() - 90000');
        release({ success: true }); await pending;
        assert.equal(h.state.confetti, 0); assert.equal(h.element('knightCelebrationModal').classList.contains('hidden'), true);
        assert.equal(h.run('generalTv.enabled'), false); assert.ok(h.ctx.events.every(e => e.type !== 'celebrate'));
        assert.ok(h.state.messages.every(m => !m.message.includes('الاحتفال على التلفاز')));
    }
});

test('criteria fulfill toggles positives on then off, clears negatives, without saving; holiday card/count do not invent presence', () => {
    const q = quickPage(); q.run('fulfillGeneralCriteria()'); assert.deepEqual(copy(q.run('getCriteriaSelection()')), { early: 5, uniform: 3 });
    q.run('fulfillGeneralCriteria()'); assert.deepEqual(copy(q.run('getCriteriaSelection()')), {}); assert.equal(q.state.writes.length, 0);
    const h = harness(); h.state.calendar.calendar = [{ from: today, to: today, name: 'إجازة وهمية', kind: 'official' }]; h.run('renderStudentsGrid()');
    assert.match(h.element('studentsGrid').innerHTML, /إجازة/); assert.doesNotMatch(h.element('studentsGrid').innerHTML, /gs-done/);
    assert.deepEqual(copy(h.run("generalHalaqaTodayCounts(students, 'h1', todayStr, getProgramSettings())")), { recited: 0, total: 0, absent: 0 });
});

test('summer and review-day retain the exact legacy rendered cards/buttons and search, without any new general actions', () => {
    const baseline = cp.execFileSync('git', ['show', 'HEAD:index.html'], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n');
    for (const program of ['summer', 'review-day']) {
        const current = harness(), old = harness(); current.state.program = old.state.program = program;
        old.run(source('renderStudentsGrid', baseline)); old.run('renderStudentsGrid()'); current.run('renderStudentsGrid()');
        assert.equal(current.element('studentsGrid').innerHTML, old.element('studentsGrid').innerHTML);
        assert.match(current.element('studentsGrid').innerHTML, /old-person|fa-check/); assert.match(current.element('studentsGrid').innerHTML, /fa-calendar-days/);
        assert.doesNotMatch(current.element('studentsGrid').innerHTML, /gs-card|gs-attendance/);
        assert.equal(current.element('generalStudentsTools').classList.contains('hidden'), true);
        assert.equal(current.element('page-students').classList.contains('general-students'), false);
        current.element('studentSearchInput').value = 'أحمد'; current.run('renderStudentsGrid()');
        assert.match(current.element('studentsGrid').innerHTML, /أحمد وهمي/); assert.doesNotMatch(current.element('studentsGrid').innerHTML, /بدر وهمي/);
    }
});

test('new CSS reserves unclipped names, neutral states, 44px actions, sticky search, four desktop columns and one mobile column', () => {
    assert.match(html, /\.gs-cards\s*\{[^}]*repeat\(4, minmax\(0, 1fr\)\)/);
    assert.match(html, /@media \(max-width: 600px\)[\s\S]*?\.gs-cards\s*\{ grid-template-columns: minmax\(0, 1fr\);/);
    assert.match(html, /\.gs-name\s*\{[^}]*font-size: 18px;[^}]*min-height: 2\.9em;/);
    assert.match(html, /\.gs-number\s*\{ font-size: 28px;/); assert.match(html, /\.gs-state\s*\{[^}]*font-size: 14px;/);
    assert.match(html, /\.gs-entry\s*\{[^}]*height: 44px;/); assert.match(html, /#generalStudentsTools\s*\{ position: sticky;/);
    assert.match(html, /\.gs-card\.is-done \.gs-entry\s*\{ background: white;/);
});
