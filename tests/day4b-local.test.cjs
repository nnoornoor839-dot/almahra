// Offline only: extract the production functions and inject fake UI/transactions.
// Run: node --test tests/day4b-local.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const store = fs.readFileSync(path.join(root, 'data-store.js'), 'utf8');
const between = (text, start, end) => {
    const a = text.indexOf(start), b = text.indexOf(end, a + start.length);
    assert.ok(a >= 0 && b > a, `source boundaries: ${start}`);
    return text.slice(a, b);
};
const cleanSource = between(html, '        function cleanCellText(', '        // عمود السؤال');
const importSource = between(html, '        // مفتاح مقارنة فقط', '        // خريطة المصحف');
const totalsSource = between(html, '        function generalRecitationTotals(', '        function getCumulativeStats(');
const createSource = between(store, 'async function createGeneralStudentIfAbsent(', '// ================================================================');
const hasUndefinedSource = between(store, 'function hasUndefined(', 'function toFirestoreFields(');
const settings = { teachers: [{ id: 't1', name: 'أمين' }], stages: [{ id: 'g1', name: 'المرحلة الأولى' }],
    halaqas: [{ id: 'halaqa-one', name: 'حلقة وهمية', teacherId: 't1', stageId: 'g1', active: true }] };
const row = (name = 'طالب وهمي 1', line = 2, fields = {}) => ({ name, line, teacher: 'أمين', stage: 'المرحلة الأولى', phone: '', ...fields });
const headers = ['اسم الطالب', 'المعلم', 'المرحله', 'جوال ولى الامر'];
const sheet = (...rows) => ({ SheetNames: ['بيانات'], Sheets: { بيانات: [headers, ...rows.map(r => [r.name, r.teacher, r.stage, r.phone])] } });
const copy = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function harness() {
    const elements = new Map(), listeners = new Map(), readers = [];
    const state = { program: 'general', season: 'season-one', ready: true, readOnly: false, messages: [], calls: [], legacy: 0, uuids: 0, settings: copy(settings) };
    const document = { getElementById(id) {
        if (!elements.has(id)) elements.set(id, { disabled: false, innerHTML: '', textContent: '', value: '', style: {},
            classList: { replace() {}, add() {}, remove() {}, toggle() {} }, click() {} });
        return elements.get(id);
    } };
    const data = { getActiveProgramId: () => state.program, getActiveSeasonId: () => state.season,
        isReady: () => state.ready, isReadOnly: () => state.readOnly,
        async createGeneralStudentIfAbsent(student, seasonId) { state.calls.push(copy(student)); return state.save ? state.save(student, seasonId) : { success: true }; },
        upsertStudent() { throw Error('legacy upsert must not be used'); } };
    const ctx = vm.createContext({ console, TextEncoder, structuredClone, document,
        window: { almahraData: data, almahraPrograms: { getCurrentProgramId: () => state.program, getCurrentSeasonId: () => state.season },
            addEventListener: (type, fn) => listeners.set(type, fn) },
        crypto: { randomUUID: () => `fake-sid-${++state.uuids}` },
        FileReader: class { constructor() { readers.push(this); } readAsArrayBuffer() { this.workbook = state.workbook; } },
        XLSX: { read: () => state.workbook, utils: { sheet_to_json: data => data } },
        showToast: (message, type) => state.messages.push({ message, type }),
        updateAllUIs() {}, canWriteCloud: () => state.ready && !state.readOnly,
        getProgramSettings: () => state.settings, isGeneralProgram: () => state.program === 'general',
        saveData: () => state.legacy++, tiersFeatureOn: () => false,
        escapeHTML: value => String(value ?? ''),
        measureEntry: entry => entry.measure });
    vm.runInContext('let students = [];\n' + cleanSource + importSource + totalsSource, ctx);
    const run = code => vm.runInContext(code, ctx);
    return { state, ctx, run, readers, data, elements,
        setStudents(list) { ctx.testStudents = list; run('students = testStudents'); },
        getStudents() { return run('students'); },
        preview(rows) {
            ctx.workbook = sheet(...rows);
            run("buildGeneralImportPreview(workbook, 'synthetic.xlsx', { general: true, programId: 'general', seasonId: window.almahraPrograms.getCurrentSeasonId(), epoch: generalImportEpoch })");
            return run('pendingImport');
        },
        switch(program, season = state.season) {
            state.program = program; state.season = season;
            listeners.get('almahra-program-changed')({ detail: { programId: program, seasonId: season } });
        },
        confirm() { return run('confirmExcelImport()'); },
        read(workbook = sheet(row())) {
            state.workbook = workbook;
            run("handleExcelImport({ target: { files: [{ name: 'synthetic.xlsx' }] } })");
            return readers.at(-1);
        },
        finishRead(reader) { state.workbook = reader.workbook; reader.onload({ target: { result: new ArrayBuffer(0) } }); },
        button() { return document.getElementById('importPreviewConfirmBtn'); } };
}

function transactionHarness() {
    const docs = new Map(), refs = [], state = { calls: 0, callbacks: 0, writes: 0 };
    const ctx = vm.createContext({ TextEncoder, structuredClone,
        doc: (...segments) => { const ref = segments.slice(1).join('/'); refs.push(ref); return ref; },
        async runTransaction(db, callback) {
            state.calls++;
            if (state.beforeCallback) await state.beforeCallback();
            let queued;
            const tx = { async get(ref) {
                if (state.onGet) await state.onGet(ref);
                return { exists: () => docs.has(ref) };
            }, set(ref, data) { queued = [ref, copy(data)]; } };
            // Model SDK callback retries without committing the discarded attempt.
            for (let i = 0; i < (state.callbackRuns || 1); i++) {
                queued = null; state.callbacks++; await callback(tx);
                if (i < (state.callbackRuns || 1) - 1 && state.onRetry) await state.onRetry(i);
            }
            if (state.beforeCommit) await state.beforeCommit();
            if (queued) { docs.set(...queued); state.writes++; }
        } });
    vm.runInContext("const db = {}; const PROGRAMS = 'programs', SEASONS = 'seasons', STUDENTS = 'students'; let activeProgramId = 'general', activeSeasonId = 'season-one', isReady = true, isReadOnly = false;\n" + hasUndefinedSource + createSource, ctx);
    return { ctx, docs, refs, state, run: code => vm.runInContext(code, ctx),
        create(student = validStudent(), season = 'season-one') { ctx.inputStudent = student; ctx.expectedSeason = season; return vm.runInContext('createGeneralStudentIfAbsent(inputStudent, expectedSeason)', ctx); } };
}
function validStudent(id = 1, name = 'طالب وهمي') {
    return { id, sid: `sid-${id}`, name, teacherId: 't1', stage: 'g1', halaqaId: 'halaqa-one', parentPhone: null,
        history: {}, memorizedJuz: null, frontierBase: null, lastDailyBase: null };
}

function installReports(h, source = html) {
    h.state.settings.points = { attendance: 0 };
    Object.assign(h.ctx, { todayStr: 'day', CHRONIC_MIN_STREAK: 3, FOLLOWUP_MIN_STREAK: 2,
        getWorkingDaysList: () => ['day'],
        calculateStudentAttendance: () => ({ expectedDays: 1, actualDays: 1, absences: 0 }),
        getConsecutiveAbsenceStreak: () => 0, roundPointTotal: n => n, snapQuarters: n => n,
        getLastActiveHijri: () => 'تاريخ وهمي', densityFor: () => ({}), dayPoints: () => 0,
        dayStats: () => ({ ayahs: 1, pages: 0.125, quarters: 1, golden: { ayahs: 0, pages: 0, quarters: 0 } }),
        initHadithTilt() {}, renderHomeCare() {}, renderHomeLeaders() {}, programBrandName: () => 'البرنامج العام' });
    h.ctx.window.almahraPrograms.getCurrentProgram = () => ({ name: 'برنامج وهمي' });
    h.ctx.window.almahraPrograms.getCurrentSeason = () => ({ name: 'موسم وهمي' });
    for (const name of ['getCumulativeStats', 'computeComplexStats', 'renderHomeDashboard', 'renderReportsTable']) {
        vm.runInContext(between(source, `        function ${name}(`, '        function '), h.ctx);
    }
}

test('syntax: every inline JavaScript block and data-store as a module, without execution', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'almahra-day4b-check-'));
    let count = 0;
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (/\bsrc\s*=/.test(match[1]) || !match[2].trim() || (/\btype\s*=/.test(match[1]) && !/type\s*=\s*["'](?:module|text\/javascript)["']/.test(match[1]))) continue;
        const filename = path.join(tmp, `inline-${++count}.${/type\s*=\s*["']module/.test(match[1]) ? 'mjs' : 'cjs'}`);
        fs.writeFileSync(filename, match[2]);
        cp.execFileSync(process.execPath, ['--check', filename]);
    }
    const moduleFile = path.join(tmp, 'data-store.mjs');
    fs.writeFileSync(moduleFile, store);
    cp.execFileSync(process.execPath, ['--check', moduleFile]);
    assert.ok(count > 0);
    console.log(`Checked ${count} inline JS blocks and data-store.mjs in ${tmp}`);
});

test('pure analysis: valid, duplicates, all Arabic folds, original text and IDs, no mutations', () => {
    const h = harness();
    const input = [row('  أَحـمد   مصطفى مدرسة ١  '), row('احمد مصطفي مدرسه 1', 3), row('طالب موجود', 4)];
    h.ctx.input = input; h.ctx.current = [{ name: 'طالب موجود' }];
    const originals = JSON.stringify([input, h.state.settings, h.ctx.current]);
    const result = h.run('analyzeGeneralImportRows(input, getProgramSettings(), current)');
    assert.deepEqual(Array.from(result, r => r.status), ['new', 'duplicate', 'duplicate']);
    assert.equal(result[0].name, 'أَحـمد مصطفى مدرسة ١');
    assert.equal(result[0].teacherId, 't1'); assert.equal(result[0].stage, 'g1');
    assert.equal(JSON.stringify([input, h.state.settings, h.ctx.current]), originals);
    assert.equal(h.run("normalizeArabicKey(' أ إ آ ـ مُصطفى مدرسة ١٢ ۱۲  ' )"), 'ا ا ا مصطفي مدرسه 12 12');
    assert.equal(h.run("normalizeArabicKey('عبد الله') === normalizeArabicKey('عبدالله')"), false);
});

test('pure analysis: errors do not reserve a name; missing/ambiguous settings, phone and blanks', () => {
    const h = harness();
    h.ctx.input = [row('تصحيح', 2, { teacher: 'مجهول' }), row('تصحيح', 3), row('مرحلة مجهولة', 4, { stage: 'مجهولة' }),
        row('جوال خاطئ', 5, { phone: '123' }), row('جوال فارغ', 6), row('', 7), { line: 8, name: ' ', teacher: '', stage: '', phone: '' },
        row('جوال صالح', 9, { phone: '٠٥٠٠٠٠٠٠٠٠' })];
    const before = JSON.stringify(h.ctx.input);
    const output = h.run('analyzeGeneralImportRows(input, getProgramSettings(), [])');
    assert.deepEqual(Array.from(output, r => r.status), ['error', 'new', 'error', 'error', 'new', 'error', 'new']);
    assert.equal(output.at(-1).phone, '966500000000'); assert.equal(output[4].phone, null);
    assert.equal(JSON.stringify(h.ctx.input), before);
    for (const field of ['teachers', 'stages']) {
        const isolated = harness();
        const duplicate = { ...isolated.state.settings[field][0], id: 'another', name: field === 'teachers' ? 'امين' : 'المرحله الاولي' };
        isolated.state.settings[field].push(duplicate);
        isolated.ctx.input = [row()];
        const result = isolated.run('analyzeGeneralImportRows(input, getProgramSettings(), [])')[0];
        assert.equal(result.status, 'error'); assert.match(result.reason, /ملتبس/);
        assert.equal(field === 'teachers' ? result.teacherId : result.stage, null);
    }
});

test('headers: complete same row, exact aliases, original Excel line numbers, search limit and cover sheet', () => {
    const h = harness();
    for (const prefix of [[['عنوان وهمي']], [['اسم الطالب'], ['عنوان وهمي']]]) {
        h.ctx.table = [...prefix, headers, [], ['طالب', 'أمين', 'المرحلة الأولى', '']];
        const rows = h.run('generalImportTable(table)');
        assert.equal(rows.length, 1); assert.equal(rows[0].line, prefix.length + 3);
    }
    for (const bad of ['اسم الطالب القديم', 'اسم الطالب في الحلقات']) {
        h.ctx.table = [[bad, ...headers.slice(1)], ['طالب', 'أمين', 'المرحلة الأولى', '']];
        assert.equal(h.run('generalImportTable(table)'), null);
    }
    h.ctx.table = [...Array.from({ length: 10 }, () => []), headers];
    assert.equal(h.run('generalImportTable(table)'), null);
    h.ctx.book = { SheetNames: ['فارغة', 'غلاف', 'بيانات', 'ثانية'], Sheets: { فارغة: [], غلاف: [['اسم الطالب']], بيانات: [[], [], headers, ['طالب', 'أمين', 'المرحلة الأولى', '']], ثانية: [headers] } };
    const chosen = h.run('selectGeneralImportSheet(book)');
    assert.equal(chosen.sheetName, 'بيانات'); assert.equal(chosen.rawRows[0].line, 4);
    h.preview([row()]); h.state.workbook = h.ctx.book; const reader = h.read(h.ctx.book); h.finishRead(reader);
    assert.match(h.elements.get('importPreviewSummary').innerHTML, /الورقة: بيانات/);
    const bad = h.read({ SheetNames: ['غلاف'], Sheets: { غلاف: [['عنوان']] } }); h.finishRead(bad);
    assert.equal(h.run('pendingImport'), null); assert.equal(h.button().disabled, true);
});

test('transaction: path uses id, removes only id from data, preserves an existing document/history', async () => {
    const h = transactionHarness(), input = validStudent();
    assert.equal((await h.create(input)).success, true);
    assert.equal(h.refs[0], 'programs/general/seasons/season-one/students/1');
    const expected = copy(input); delete expected.id;
    assert.deepEqual(h.docs.get(h.refs[0]), expected);
    const previous = { name: 'طالب وهمي سابق', sid: 'old', history: { day: { attended: true, entries: { keep: { points: 77 } } } } };
    h.docs.set(h.refs[0], copy(previous));
    const result = await h.create();
    assert.equal(result.code, 'STUDENT_ID_CONFLICT'); assert.equal(result.success, false);
    assert.deepEqual(h.docs.get(h.refs[0]), previous); assert.equal(h.state.writes, 1);
});

test('transaction: invalid context, readiness, readonly, IDs and nested undefined never write', async () => {
    for (const code of ["activeProgramId = 'summer'", "activeProgramId = 'review-day'", "activeSeasonId = 'other'", 'isReady = false', 'isReadOnly = true']) {
        const h = transactionHarness(); h.run(code); assert.equal((await h.create()).success, false); assert.equal(h.state.calls, 0);
    }
    for (const input of [null, { ...validStudent(), id: -1 }, { ...validStudent(), id: '1/2' }, { ...validStudent(), id: Number.MAX_SAFE_INTEGER + 1 },
        { ...validStudent(), sid: '' }, { ...validStudent(), sid: '../bad' }, { ...validStudent(), stage: undefined },
        { ...validStudent(), history: { day: { entries: [undefined] } } }]) {
        const h = transactionHarness(); assert.equal((await h.create(input)).success, false); assert.equal(h.state.calls, 0);
    }
    const h = transactionHarness(); assert.equal((await h.create(validStudent(), 'bad/season')).success, false);
});

test('transaction: a document arriving on SDK retry remains intact despite an initially empty read', async () => {
    const h = transactionHarness(); h.state.callbackRuns = 2;
    const previous = { name: 'سابق وهمي', sid: 'old-sid', history: { keep: { points: 7 } } };
    h.state.onRetry = () => h.docs.set(h.refs[0], copy(previous));
    const result = await h.create();
    assert.equal(result.code, 'STUDENT_ID_CONFLICT'); assert.equal(h.state.writes, 0);
    assert.deepEqual(h.docs.get(h.refs[0]), previous);
});

test('transaction: guards callback start and after get; retries cause no UI/cache effects; committed context is reported', async () => {
    for (const hook of ['beforeCallback', 'onGet']) {
        for (const change of ['isReadOnly = true', "activeSeasonId = 'other'", "activeProgramId = 'review-day'", 'isReady = false']) {
            const h = transactionHarness(); h.state[hook] = () => h.run(change);
            assert.equal((await h.create()).code, 'IMPORT_CONTEXT_INVALID'); assert.equal(h.state.writes, 0);
        }
    }
    const h = transactionHarness(); h.state.callbackRuns = 3;
    h.state.beforeCommit = () => h.run("activeProgramId = 'summer'; activeSeasonId = 'other'");
    const result = await h.create();
    assert.equal(result.success, true); assert.equal(result.contextChanged, true); assert.equal(result.seasonId, 'season-one');
    assert.equal(h.state.callbacks, 3); assert.equal(h.state.writes, 1);
    assert.ok(h.docs.has('programs/general/seasons/season-one/students/1'));
});

test('import: live name arrival while preceding row waits skips the new duplicate', async () => {
    const h = harness(), wait = deferred(); h.preview([row('أول'), row('ثاني', 3)]);
    h.state.save = async () => { await wait.promise; return { success: true }; };
    const saving = h.confirm();
    h.setStudents([{ id: 30, sid: 'arrived', name: 'ثَـاني' }]); wait.resolve(); await saving;
    assert.equal(h.state.calls.length, 1); assert.equal(h.state.calls[0].name, 'أول');
    assert.match(h.state.messages.at(-1).message, /حفظ 1/);
});

test('import: live ID arrival, delayed-list transaction conflict, stable sid and no prior-document overwrite', async () => {
    const h = harness(), tx = transactionHarness();
    tx.docs.set('programs/general/seasons/season-one/students/1', { name: 'سابق وهمي', history: { kept: { points: 9 } } });
    const before = copy([...tx.docs]);
    h.state.save = async student => {
        const result = await tx.create(student);
        if (result.success && student.name === 'أول') h.setStudents([{ id: 80, name: 'وصل', sid: 'arrived' }]);
        return result;
    };
    h.preview([row('أول'), row('ثان', 3)]); await h.confirm();
    assert.deepEqual(h.state.calls.map(s => s.id), [1, 2, 81]);
    assert.equal(h.state.calls[0].sid, h.state.calls[1].sid); assert.equal(h.state.uuids, 2);
    assert.deepEqual(tx.docs.get(before[0][0]), before[0][1]);
    assert.equal(tx.docs.size, 3);
});

test('import: recheck normalized name and context before conflict retry', async () => {
    const h = harness(); h.preview([row('موسى')]);
    h.state.save = async () => { h.setStudents([{ id: 9, name: 'مُـوسي', sid: 'late' }]); return { success: false, code: 'STUDENT_ID_CONFLICT' }; };
    await h.confirm(); assert.equal(h.state.calls.length, 1);
    const other = harness(); other.preview([row()]);
    other.state.save = async () => { other.switch('summer'); return { success: false, code: 'STUDENT_ID_CONFLICT' }; };
    await other.confirm(); assert.equal(other.state.calls.length, 1); assert.equal(other.state.legacy, 0);
});

test('import: ten-conflict bound and no retries on network or permissions failures', async () => {
    const h = harness(); h.preview([row()]); h.state.save = async () => ({ success: false, code: 'STUDENT_ID_CONFLICT' });
    await h.confirm(); assert.equal(h.state.calls.length, 10);
    assert.equal(new Set(h.state.calls.map(s => s.sid)).size, 1); assert.equal(h.getStudents().length, 0);
    assert.match(h.state.messages.at(-1).message, /١٠ مرات/);
    for (const code of ['unavailable', 'permission-denied']) {
        const h = harness(); h.preview([row()]); h.state.save = async () => ({ success: false, code, error: code });
        await h.confirm(); assert.equal(h.state.calls.length, 1); assert.equal(h.getStudents().length, 0);
    }
});

test('import: partial success stays excluded even when cloud replaces the local list; double confirm blocked', async () => {
    const h = harness(), wait = deferred(); h.preview([row('أول'), row('ثان', 3)]);
    h.state.save = async student => student.name === 'أول' ? (await wait.promise, { success: true }) : { success: false, code: 'unavailable', error: 'شبكة وهمية' };
    const active = h.confirm(); await h.confirm(); assert.equal(h.state.calls.length, 1); assert.equal(h.button().disabled, true);
    wait.resolve(); await active;
    assert.match(h.state.messages.at(-1).message, /حُفظ 1/);
    assert.deepEqual(Array.from(h.run('pendingImport.rows'), r => r.status), ['duplicate', 'new']);
    h.setStudents([]); h.state.save = async () => ({ success: true });
    await h.confirm();
    assert.deepEqual(h.state.calls.map(s => s.name), ['أول', 'ثان', 'ثان']);
});

test('import: sid local check prevents adding a second cloud-delivered copy', async () => {
    const h = harness(); h.preview([row()]);
    h.state.save = async student => { h.setStudents([copy(student)]); return { success: true }; };
    await h.confirm(); assert.equal(h.getStudents().length, 1);
});

test('partial retry retains the next ID after many successes and a stale local snapshot', async () => {
    const h = harness(), tx = transactionHarness();
    h.preview(Array.from({ length: 13 }, (_, i) => row(`وهمي ${i}`, i + 2)));
    h.state.save = async student => h.state.calls.length === 13 ? { success: false, code: 'unavailable' } : tx.create(student);
    await h.confirm(); assert.equal(tx.docs.size, 12);
    h.setStudents([]); h.state.save = student => tx.create(student);
    await h.confirm(); assert.equal(tx.docs.size, 13);
    assert.equal(h.state.calls.length, 14); assert.equal(h.state.calls.at(-1).id, 13);
});

test('451 valid rows: both preview and confirmation/finally keep the button disabled', async () => {
    const h = harness(); h.preview(Array.from({ length: 451 }, (_, i) => row(`وهمي ${i}`, i + 2)));
    assert.equal(h.run("pendingImport.rows.filter(r => r.status === 'new').length"), 451);
    assert.equal(h.button().disabled, true); await h.confirm(); assert.equal(h.state.calls.length, 0); assert.equal(h.button().disabled, true);
    // While an older operation settles, a different 451-row preview must not be enabled by its finally.
    const other = harness(), wait = deferred(); other.preview([row()]);
    other.state.save = async () => { await wait.promise; return { success: false, code: 'unavailable' }; };
    const active = other.confirm(); other.switch('general', 'season-two');
    other.preview(Array.from({ length: 451 }, (_, i) => row(`وهمي ${i}`, i + 2)));
    wait.resolve(); await active; assert.equal(other.button().disabled, true);
});

test('450 valid rows can be confirmed; readonly or unready context disables confirmation', async () => {
    const h = harness(); h.preview(Array.from({ length: 450 }, (_, i) => row(`وهمي ${i}`, i + 2)));
    assert.equal(h.button().disabled, false); await h.confirm(); assert.equal(h.state.calls.length, 450);
    for (const flag of ['ready', 'readOnly']) {
        const h = harness(); h.preview([row()]); h.state[flag] = flag === 'readOnly';
        h.run('renderGeneralImportPreview()'); assert.equal(h.button().disabled, true);
        await h.confirm(); assert.equal(h.state.calls.length, 0);
    }
});

test('context: switching program/season during reading and switching back rejects the result', () => {
    for (const [program, season] of [['summer', 'season-one'], ['general', 'season-two']]) {
        const h = harness(), reader = h.read(); h.switch(program, season); h.switch('general', 'season-one'); h.finishRead(reader);
        assert.equal(h.run('pendingImport'), null); assert.equal(h.state.calls.length, 0);
    }
});

test('reading: the newer general file wins even if the older reader finishes last', () => {
    const h = harness(), first = h.read(sheet(row('أقدم'))), second = h.read(sheet(row('أحدث')));
    h.finishRead(second); h.finishRead(first);
    assert.equal(h.run('pendingImport.rows[0].name'), 'أحدث');
});

test('context: previews invalidate on switches; stale general never falls into legacy, nor reverse', async () => {
    for (const [program, season] of [['review-day', 'season-one'], ['general', 'season-two']]) {
        const h = harness(), stale = h.preview([row()]); h.switch(program, season);
        assert.equal(stale.invalidated, true); assert.equal(h.run('pendingImport'), null);
        h.ctx.stale = stale; h.run('pendingImport = stale'); await h.confirm();
        assert.equal(h.state.calls.length, 0); assert.equal(h.state.legacy, 0);
        h.switch('general', 'season-one'); h.ctx.stale = stale; h.run('pendingImport = stale'); await h.confirm();
        assert.equal(h.state.calls.length, 0);
    }
    const h = harness(); h.run("pendingImport = { rows: [{ name: 'قديم', status: 'new' }] }"); await h.confirm();
    assert.equal(h.state.calls.length, 0); assert.equal(h.state.legacy, 0);
    h.state.program = 'summer'; const reader = h.read(); h.switch('general'); h.finishRead(reader); assert.equal(h.state.calls.length, 0);
});

test('context: in-flight commit counts in original season, stops following writes, leaves new preview/list alone', async () => {
    for (const [program, season] of [['summer', 'season-one'], ['general', 'season-two']]) {
        const h = harness(), wait = deferred(); h.preview([row('أول'), row('ثان', 3)]);
        h.state.save = async () => { await wait.promise; return { success: true }; };
        const saving = h.confirm(), original = h.run('pendingImport');
        h.switch(program, season); h.setStudents([{ id: 999, sid: 'new-season', name: 'سياق آخر' }]);
        let replacement;
        if (program === 'general') replacement = h.preview([row('جديد')]);
        wait.resolve(); await saving;
        assert.equal(h.state.calls.length, 1); assert.equal(original.savedStudents.length, 1);
        assert.equal(h.getStudents().length, 1); assert.equal(h.getStudents()[0].sid, 'new-season');
        assert.equal(h.run('pendingImport'), replacement || null);
        assert.match(h.state.messages.at(-1).message, /حُفظ 1 طالب في الموسم الأصلي/);
    }
});

test('units: null day, direct five-unit totals, separate new/review, round only presentation', () => {
    const h = harness();
    const measures = [
        { ayahs: 7, pages: 0.7, quarters: 1, hizb: 0.25, juz: 0.125 },
        { ayahs: 13, pages: 1.3, quarters: 2, hizb: 0.5, juz: 0.25 },
        { ayahs: 4, pages: 1, quarters: 0.2, hizb: 0.05, juz: 0.025 },
        { ayahs: 2, pages: 0.5, quarters: 0.1, hizb: 0.025, juz: 0.0125 } ];
    h.ctx.student = { history: { nullDay: null, day: { entries: Object.fromEntries(measures.map((measure, i) => [`e${i}`, { kind: i < 2 ? 'new' : 'review', measure }])) } } };
    const before = JSON.stringify(h.ctx.student), totals = h.run('generalRecitationTotals(student)');
    assert.equal(totals.new.quarters, 3); assert.equal(totals.new.juz, 0.375); assert.equal(totals.review.pages, 1.5);
    assert.equal(h.run('formatGeneralUnit(0.125)'), '0.13'); assert.equal(h.run('formatGeneralUnit(0.05)'), '0.05');
    assert.equal(h.run('formatGeneralUnit(1.50)'), '1.5');
    assert.equal(JSON.stringify(h.ctx.student), before);
    assert.match(h.run('generalFiveUnits({ayahs: 1, pages: 1, quarters: 1, hizb: 0.25, juz: 0.125})'), /0.13 جزء/);
    h.ctx.two = { history: { day: { entries: { a: { kind: 'new', measure: measures[0] }, b: { kind: 'new', measure: measures[0] } } } } };
    assert.equal(h.run('generalRecitationTotals(two).new.juz'), 0.25); // not 0.13 + 0.13
});

test('Excel export uses raw numeric amounts: two 0.25 hizb values sum to 0.5', () => {
    const h = harness();
    h.ctx.getWorkingDaysList = () => [];
    h.ctx.getCumulativeStats = () => ({ tripPoints: 0 });
    h.ctx.calculateStudentAttendance = () => ({ actualDays: 0, absences: 0 });
    h.ctx.XLSX.utils.json_to_sheet = rows => { h.state.exported = rows; return {}; };
    h.ctx.XLSX.utils.book_new = () => ({}); h.ctx.XLSX.utils.book_append_sheet = () => {}; h.ctx.XLSX.writeFile = () => {};
    h.setStudents([1, 2].map(id => ({ id, name: `وهمي ${id}`, history: { day: { entries: {
        e: { kind: 'new', measure: { ayahs: 1, pages: 0.5, quarters: 1, hizb: 0.25, juz: 0.125 } },
        r: { kind: 'review', measure: { ayahs: 2, pages: 0.8, quarters: 0.4, hizb: 0.1, juz: 0.05 } }
    } } } })));
    const exportSource = between(html, '        function exportToExcel()', '        function ');
    vm.runInContext(exportSource, h.ctx); h.run('exportToExcel()');
    const rows = h.state.exported;
    assert.equal(rows.reduce((sum, r) => sum + r['الحفظ - الأحزاب'], 0), 0.5);
    assert.equal(rows[0]['الحفظ - الأجزاء'], 0.125); assert.equal(typeof rows[0]['الحفظ - الأجزاء'], 'number');
    assert.equal(rows[0]['المراجعة - الأجزاء'], 0.05);
});

test('home, full report, statistics and daily table all format raw general totals to two decimals', () => {
    const h = harness(); installReports(h);
    h.setStudents([1, 2].map(id => ({ id, name: `وهمي ${id}`, history: { nullDay: null,
        day: { attended: true, entries: { e: { kind: 'new', measure: { ayahs: 1, pages: 0.125, quarters: 1, hizb: 0.25, juz: 0.125 } } } }
    } })));
    const originals = JSON.stringify(h.getStudents());
    const total = h.run('computeComplexStats()');
    assert.equal(total.pages, 0.25); assert.equal(total.hizbs, 0.5); assert.equal(total.juzs, 0.25);
    h.run('renderHomeDashboard(); renderReportsTable()');
    assert.match(h.elements.get('homeDashboard').innerHTML, /الأوجه/);
    assert.match(h.elements.get('homeDashboard').innerHTML, /dc-val">0.25</);
    assert.equal(h.elements.get('eqTotalPages').innerText, '0.25');
    assert.equal(h.elements.get('eqTotalHizbs').innerText, '0.5');
    assert.equal(h.elements.get('eqTotalJuzs').innerText, '0.25');
    assert.match(h.elements.get('reportsTableBody').innerHTML, /0.13 وجه/);
    assert.match(h.elements.get('reportsTableBody').innerHTML, /0.25 وجه/);
    assert.match(h.elements.get('dailyTimelineTableBody').innerHTML, /0.25 وجه/);
    assert.match(h.elements.get('dailyTimelineTableBody').innerHTML, /0.5 حزب/);
    assert.equal(JSON.stringify(h.getStudents()), originals);
});

test('summer and review-day retain their home, report, daily table and cumulative calculations', () => {
    const baseline = cp.execFileSync('git', ['show', 'HEAD:index.html'], { cwd: root, encoding: 'utf8' });
    for (const program of ['summer', 'review-day']) {
        const outputs = [baseline, html].map(source => {
            const h = harness(); h.state.program = program; installReports(h, source);
            h.setStudents([{ id: 1, name: 'وهمي', history: { day: { attended: true } } }]);
            const result = h.run('computeComplexStats()');
            h.run('renderHomeDashboard(); renderReportsTable()');
            return { result: copy(result), home: h.elements.get('homeDashboard').innerHTML,
                report: h.elements.get('reportsTableBody').innerHTML, daily: h.elements.get('dailyTimelineTableBody').innerHTML,
                equivalency: ['eqTotalPages', 'eqTotalHizbs', 'eqTotalJuzs'].map(id => h.elements.get(id).innerText) };
        });
        assert.deepEqual(outputs[0], outputs[1]);
    }
});

test('documented protection boundary: two devices can create the same normalized name at different IDs', async () => {
    const h = transactionHarness();
    assert.equal((await h.create(validStudent(1, 'أَحـمد'))).success, true);
    assert.equal((await h.create(validStudent(2, 'احمد'))).success, true);
    assert.equal(h.docs.size, 2); // Name uniqueness is NOT guaranteed by the document transaction.
    const ui = harness(); ui.ctx.a = 'أَحـمد'; ui.ctx.b = 'احمد';
    assert.equal(ui.run('normalizeArabicKey(a) === normalizeArabicKey(b)'), true);
});

test('data-store exception: only the step2 halaqaId guard changes from the approved baseline', () => {
    const baseline = cp.execFileSync('git', ['show', '9628c9c:data-store.js'], { cwd: root, encoding: 'utf8' }).replace(/\r\n/g, '\n');
    let restored = store.replace(/\r\n/g, '\n');
    restored = restored.replace(' || !validId(student.halaqaId)', '');
    assert.equal(restored, baseline);
});

test('legacy import preview/confirmation are unchanged for summer and review-day', async () => {
    const baseline = cp.execFileSync('git', ['show', 'HEAD:index.html'], { cwd: root, encoding: 'utf8' });
    for (const name of ['buildImportPreview', 'renderImportPreview']) {
        const marker = `        function ${name}(`;
        const before = between(baseline.replace(/\r\n/g, '\n'), marker, '\n        function ');
        const after = between(html.replace(/\r\n/g, '\n'), marker, '\n        function ');
        assert.equal(after, before);
    }
    const tail = text => between(text.replace(/\r\n/g, '\n'), '            // نعيد فحص المكرر لحظة التأكيد:', '\n        }');
    assert.equal(tail(html), tail(baseline));
    for (const program of ['summer', 'review-day']) {
        const h = harness(); h.state.program = program;
        h.run("pendingImport = { rows: [{ name: 'وهمي', status: 'new', mem: 1, phone: null }] }");
        await h.confirm(); assert.equal(h.state.legacy, 1); assert.equal(h.state.calls.length, 0);
        assert.equal(h.getStudents()[0].memorizedJuz, 1);
    }
});
