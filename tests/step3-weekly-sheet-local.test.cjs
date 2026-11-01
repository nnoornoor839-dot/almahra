// Offline only: extracted production functions, synthetic students, no network or storage.
// Run: node --test tests/step3-weekly-sheet-local.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
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
function settings() {
    return {
        workingDays: [0, 1, 2, 3], features: {}, points: {}, kindMult: {},
        teachers: [{ id: 't1', name: 'معلم وهمي من الحلقة' }],
        stages: [{ id: 'g2', name: 'مرحلة وهمية ثانية', order: 2 }, { id: 'g1', name: 'مرحلة وهمية أولى', order: 1 }],
        halaqas: [
            { id: 'h1', name: 'ألف وهمية', teacherId: 't1', stageId: 'g1', active: true },
            { id: 'h2', name: 'باء وهمية', teacherId: 't1', stageId: 'g1', active: true },
            { id: 'off', name: 'موقوفة وهمية', teacherId: 't1', stageId: 'g1', active: false }
        ],
        grades: [{ id: 'excellent', name: 'ممتاز وهمي' }, { id: 'good', name: 'جيد وهمي' }, { id: 'repeat', name: 'إعادة وهمية' }],
        criteria: [
            { id: 'positive', name: 'التزام وهمي', points: 5, enabled: true },
            { id: 'negative', name: 'تشويش وهمي', points: -2, enabled: true },
            { id: 'disabled', name: 'معيار معطّل وهمي', points: 10, enabled: false },
            { id: 'zero', name: 'معيار صفري وهمي', points: 0, enabled: true }
        ],
        absence: [{ id: 'excused', name: 'بعذر' }, { id: 'unexcused', name: 'بغير عذر' }]
    };
}
const student = (id = 17, name = 'طالب وهمي', halaqaId = 'h1') => ({ id, sid: 'secret-sid-never-print', name, halaqaId,
    teacherId: 'stale-teacher', stage: 'stale-stage', history: {} });
function harness() {
    const state = { settings: settings(), students: [student()], program: 'general', date: '2026-11-02',
        seasonName: 'موسم وهمي', prints: 0, messages: [], timers: new Map(), listeners: new Map(), styles: [] };
    let timerId = 0;
    const elements = new Map();
    const classes = (...initial) => {
        const values = new Set(initial);
        return { add: v => values.add(v), remove: v => values.delete(v), contains: v => values.has(v),
            replace: (old, next) => { if (values.delete(old)) values.add(next); } };
    };
    const element = id => {
        if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', value: '', style: {},
            classList: classes(...(id === 'generalWeeklySheetModal' ? ['hidden'] : [])) });
        return elements.get(id);
    };
    const noWrite = () => { throw Error('Unexpected write'); };
    const document = { getElementById: element, body: { classList: classes() },
        head: { appendChild: node => state.styles.push(node) },
        createElement: () => { const node = { textContent: '', remove() { state.styles = state.styles.filter(s => s !== node); } }; return node; } };
    class Clock extends Date { constructor(...args) { super(...(args.length ? args : [state.date + 'T12:00:00'])); } }
    const ctx = vm.createContext({
        // Calendar guards are covered in step5; isolate the earlier step here.
        getSchoolDayInfo: () => ({ isSchoolDay: true }), Date: Clock, document, localStorage: { setItem: noWrite, removeItem: noWrite, clear: noWrite },
        setTimeout: (fn, ms) => { state.timers.set(++timerId, { fn, ms }); return timerId; },
        clearTimeout: id => state.timers.delete(id),
        showToast: (message, type) => state.messages.push({ message, type }),
        window: { almahraPrograms: { getCurrentProgramId: () => state.program, getSettings: () => state.settings,
            getCurrentSeason: () => ({ name: state.seasonName }), updateSettings: noWrite },
            almahraData: { patchStudent: noWrite },
            print: () => { state.prints++; if (state.printError) throw Error('Synthetic print failure'); },
            addEventListener: (name, callback) => state.listeners.set(name, callback),
            removeEventListener: name => state.listeners.delete(name) } });
    const run = code => vm.runInContext(code, ctx);
    run('let students = []; let isPrintingExamCards = false; let isPrintingGeneralWeeklySheets = false;');
    run(html.match(/const ALL_DAY_NAMES = .*?;/)[0]);
    const names = ['countLabel', 'isGeneralProgram', 'getProgramSettings', 'getTiers', 'getStudentHalaqa', 'escapeHTML', 'formatDateLocal',
        'getWeekStartDate', 'generalWeeklySheetDays', 'generalWeeklySheetDefaultWeek', 'generalWeeklySheetStudents',
        'buildGeneralWeeklySheetHtml', 'generalWeeklySheetSettings', 'openGeneralWeeklySheetModal', 'closeGeneralWeeklySheetModal',
        'normalizeGeneralWeeklySheetWeek', 'renderGeneralWeeklySheetOptions', 'printGeneralWeeklyStage',
        'printGeneralStudentWeeklySheet', 'printGeneralWeeklySheets'];
    names.forEach(name => run(source(name)));
    run(html.match(/const studentsCountLabel = .*?;/)[0]);
    const setStudents = list => { state.students = list; ctx.list = list; run('students = list'); };
    setStudents(state.students);
    return { state, ctx, run, element, setStudents, sheet(s = student(), config = state.settings) {
        Object.assign(ctx, { input: s, config, meta: { seasonName: state.seasonName } });
        return run("buildGeneralWeeklySheetHtml(input, { days: generalWeeklySheetDays('2026-11-01', config) }, config, meta)");
    } };
}

test('working days are sorted, unique and dated from Sunday, including month boundaries', () => {
    const h = harness();
    assert.deepEqual(copy(h.run("generalWeeklySheetDays('2026-11-01', generalWeeklySheetSettings())")), [
        { dateStr: '2026-11-01', dayName: 'الأحد' }, { dateStr: '2026-11-02', dayName: 'الإثنين' },
        { dateStr: '2026-11-03', dayName: 'الثلاثاء' }, { dateStr: '2026-11-04', dayName: 'الأربعاء' }
    ]);
    h.state.settings.workingDays = [4, 2, 0, 3, 1, 4];
    const days = copy(h.run("generalWeeklySheetDays('2026-11-29', generalWeeklySheetSettings())"));
    assert.deepEqual(days.map(d => d.dateStr), ['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03']);
    assert.equal(days.at(-1).dayName, 'الخميس');
});

test('working days normalize a midweek date to Sunday and reject an invalid date', () => {
    const h = harness();
    assert.deepEqual(copy(h.run("generalWeeklySheetDays('2026-11-04', generalWeeklySheetSettings())")), [
        { dateStr: '2026-11-01', dayName: 'الأحد' }, { dateStr: '2026-11-02', dayName: 'الإثنين' },
        { dateStr: '2026-11-03', dayName: 'الثلاثاء' }, { dateStr: '2026-11-04', dayName: 'الأربعاء' }
    ]);
    assert.deepEqual(copy(h.run("generalWeeklySheetDays('invalid', generalWeeklySheetSettings())")), []);
});

test('default week stays current while a working day remains, otherwise advances across the weekend', () => {
    const h = harness();
    for (const [date, expected] of [['2026-11-01', '2026-11-01'], ['2026-11-02', '2026-11-01'],
        ['2026-11-04', '2026-11-01'], ['2026-11-05', '2026-11-08'], ['2026-11-06', '2026-11-08'], ['2026-11-07', '2026-11-08']]) {
        h.ctx.date = date;
        assert.equal(h.run('generalWeeklySheetDefaultWeek(date, generalWeeklySheetSettings())'), expected);
    }
    h.state.settings.workingDays = [0, 1, 2, 3, 4];
    assert.equal(h.run("generalWeeklySheetDefaultWeek('2026-11-05', generalWeeklySheetSettings())"), '2026-11-01');
});

test('sheet prints display id and current halaqa identity, ordered grades, guidance and blank boxes', () => {
    const h = harness(), before = JSON.stringify([h.state.settings, h.state.students]);
    const sheet = h.sheet();
    assert.match(sheet, /رقم الطالب<\/small><strong>17<\/strong>/);
    assert.doesNotMatch(sheet, /secret-sid|stale-teacher|stale-stage/);
    for (const text of ['ألف وهمية', 'معلم وهمي من الحلقة', 'مرحلة وهمية أولى', 'موسم وهمي', 'لا تخرج الورقة من المسجد',
        'الأحد 1 / 11 ← الأربعاء 4 / 11', 'غائب بعذر', 'غائب بغير عذر', 'لم يسمّع؟', 'توقيع المعلم آخر الأسبوع', 'ملاحظة المعلم للأسبوع']) assert.ok(sheet.includes(text), text);
    assert.ok(sheet.indexOf('ممتاز وهمي') < sheet.indexOf('جيد وهمي'));
    assert.ok(sheet.indexOf('جيد وهمي') < sheet.indexOf('إعادة وهمية'));
    assert.match(sheet, /فاته:<\/b> <span>التزام وهمي<\/span>/);
    assert.match(sheet, /وقع منه:<\/b> <span>تشويش وهمي<\/span>/);
    assert.doesNotMatch(sheet, /معيار معطّل|معيار صفري/);
    assert.equal((sheet.match(/استوفى كل المعايير/g) || []).length, 4);
    assert.equal((sheet.match(/class="gws-box"/g) || []).length, 8);
    assert.equal((sheet.match(/<td><\/td>/g) || []).length, 8);
    assert.equal(JSON.stringify([h.state.settings, h.state.students]), before);
});

test('empty discipline groups disappear and features remove each complete pair of columns', () => {
    const h = harness();
    h.state.settings.criteria = [];
    assert.doesNotMatch(h.sheet(), /فاته:|وقع منه:/);
    for (const newOn of [true, false]) for (const reviewOn of [true, false]) {
        h.state.settings.features = { newMemorization: newOn, review: reviewOn };
        const sheet = h.sheet();
        assert.equal(sheet.includes('الحفظ الجديد'), newOn);
        assert.equal(sheet.includes('تقدير الجديد'), newOn);
        assert.equal(sheet.includes('<th>المراجعة'), reviewOn);
        assert.equal(sheet.includes('تقدير المراجعة'), reviewOn);
        assert.equal((sheet.match(/<th>/g) || []).length, 3 + 2 * Number(newOn) + 2 * Number(reviewOn));
        assert.equal((sheet.match(/<td(?: class="[^"]*")?>/g) || []).length, 4 * (3 + 2 * Number(newOn) + 2 * Number(reviewOn)));
    }
});

test('student and every configurable text are HTML escaped; builder never reads ambient state', () => {
    const h = harness(), config = settings();
    config.halaqas[0].name = '<حلقة>'; config.teachers[0].name = '<معلم>'; config.stages[1].name = '<مرحلة>';
    config.grades[0].name = '<تقدير>'; config.criteria[0].name = '<معيار>'; config.absence[0].name = '<عذر>';
    Object.assign(h.ctx, { input: student(17, '<طالب>'), config, meta: { seasonName: '<موسم>' },
        week: { days: [{ dateStr: '2026-11-01', dayName: '<يوم>' }] } });
    h.ctx.getProgramSettings = () => { throw Error('Ambient settings read'); };
    h.ctx.document = new Proxy({}, { get() { throw Error('DOM read'); } });
    h.ctx.window = new Proxy({}, { get() { throw Error('Cloud read'); } });
    h.ctx.Date = class { constructor() { throw Error('Clock read'); } };
    const sheet = h.run('buildGeneralWeeklySheetHtml(input, week, config, meta)');
    for (const text of ['طالب', 'حلقة', 'معلم', 'مرحلة', 'تقدير', 'معيار', 'موسم', 'يوم']) assert.ok(sheet.includes(`&lt;${text}&gt;`), text);
    assert.ok(sheet.includes('غائب &lt;عذر&gt;'));
    assert.doesNotMatch(sheet, /<(?:طالب|حلقة|معلم|مرحلة|تقدير|معيار|عذر|موسم|يوم)>/);
});

test('stage selection excludes inactive, absent, missing and other-stage halaqas, sorts by halaqa then name', () => {
    const h = harness();
    const list = [student(1, 'باء', 'h2'), student(2, 'باء', 'h1'), student(3, 'ألف', 'h1'),
        student(4, 'موقوف', 'off'), student(5, 'بلا حلقة', ''), student(6, 'مفقودة', 'missing'), student(7, 'مرحلة أخرى', 'other')];
    h.state.settings.halaqas.push({ id: 'other', name: 'أخرى', teacherId: 't1', stageId: 'g2', active: true });
    const before = JSON.stringify(list); h.ctx.input = list;
    assert.deepEqual(copy(h.run("generalWeeklySheetStudents(input, 'g1', generalWeeklySheetSettings())")).map(s => s.id), [3, 2, 1]);
    assert.equal(JSON.stringify(list), before);
});

test('modal uses sorted tiers, live counts, disabled empty stage, unassigned note and Sunday normalization', () => {
    const h = harness(); h.state.date = '2026-11-06';
    h.setStudents([student(), student(18, 'طالب بلا حلقة', ''), student(19, 'طالب موقوف', 'off')]);
    h.run('openGeneralWeeklySheetModal()');
    assert.equal(h.element('generalWeeklySheetWeek').value, '2026-11-08');
    assert.equal(h.element('generalWeeklySheetModal').classList.contains('flex'), true);
    const buttons = h.element('generalWeeklySheetStages').innerHTML;
    assert.ok(buttons.indexOf('مرحلة وهمية أولى') < buttons.indexOf('مرحلة وهمية ثانية'));
    assert.match(buttons, /مرحلة وهمية أولى — طالب واحد/);
    assert.match(buttons, /printGeneralWeeklyStage\(1\)" disabled/);
    assert.match(h.element('generalWeeklySheetUnassigned').textContent, /طالبان بلا حلقة: لا تُطبع أوراقهم حتى يُربطوا بحلقة/);
    h.element('generalWeeklySheetWeek').value = '2026-11-11';
    assert.equal(h.run('normalizeGeneralWeeklySheetWeek()'), '2026-11-08');
    h.element('generalWeeklySheetWeek').value = ''; h.run('printGeneralWeeklyStage(0)');
    assert.equal(h.state.prints, 0); assert.match(h.state.messages.at(-1).message, /اختر تاريخ/);
});

test('individual sheet always uses current week; stage printing uses selected week and latest active membership', () => {
    const h = harness(); h.state.date = '2026-11-06';
    h.run('openGeneralWeeklySheetModal(); printGeneralStudentWeeklySheet(17)');
    assert.match(h.element('generalWeeklySheetPrintArea').innerHTML, /الأحد 1 \/ 11 ← الأربعاء 4 \/ 11/);
    h.state.listeners.get('afterprint')();
    h.element('generalWeeklySheetWeek').value = '2026-11-18';
    h.setStudents([student(18, 'باء', 'h2'), student(17, 'ألف', 'h1')]);
    const before = JSON.stringify([h.state.settings, h.state.students]);
    h.run('printGeneralWeeklyStage(0)');
    const sheet = h.element('generalWeeklySheetPrintArea').innerHTML;
    assert.match(sheet, /الأحد 15 \/ 11 ← الأربعاء 18 \/ 11/);
    assert.equal((sheet.match(/class="general-weekly-sheet"/g) || []).length, 2);
    assert.ok(sheet.indexOf('<strong>17</strong>') < sheet.indexOf('<strong>18</strong>'));
    assert.equal(JSON.stringify([h.state.settings, h.state.students]), before);
    h.state.listeners.get('afterprint')();
    h.state.settings.halaqas[0].active = false;
    h.run('printGeneralStudentWeeklySheet(17)');
    assert.equal(h.state.messages.at(-1).message, 'اربط الطالب بحلقة فعّالة أولاً');
    assert.equal(h.state.prints, 2);
});

test('empty working days print Sunday through Wednesday like the shared settings reader', () => {
    const h = harness(); h.state.settings.workingDays = [];
    const before = JSON.stringify(h.state.settings);
    assert.deepEqual(copy(h.run('generalWeeklySheetSettings().workingDays')), [0, 1, 2, 3]);
    h.run('openGeneralWeeklySheetModal(); printGeneralStudentWeeklySheet(17)');
    assert.equal(h.element('generalWeeklySheetModal').classList.contains('flex'), true);
    assert.equal(h.state.messages.length, 0);
    assert.equal(h.state.prints, 1);
    const sheet = h.element('generalWeeklySheetPrintArea').innerHTML;
    assert.match(sheet, /الأحد 1 \/ 11 ← الأربعاء 4 \/ 11/);
    assert.equal((sheet.match(/class="gws-day"/g) || []).length, 4);
    assert.equal(JSON.stringify(h.state.settings), before);
});

test('invalid working days produce an error without printing or changing settings', () => {
    const h = harness(); h.state.settings.workingDays = [9];
    const before = JSON.stringify(h.state.settings);
    h.run('openGeneralWeeklySheetModal(); printGeneralStudentWeeklySheet(17)');
    assert.match(h.state.messages.at(-1).message, /أيام الدراسة فارغة/);
    assert.equal(h.state.prints, 0); assert.equal(h.state.styles.length, 0);
    assert.equal(h.element('generalWeeklySheetModal').classList.contains('hidden'), true);
    assert.equal(JSON.stringify(h.state.settings), before);
});

test('print guard, scoped A4 styles and cleanup work on afterprint, fallback and print errors', () => {
    for (const mode of ['afterprint', 'timeout', 'throw']) {
        const h = harness(); h.state.printError = mode === 'throw';
        h.run('printGeneralStudentWeeklySheet(17)');
        if (mode !== 'throw') {
            assert.equal(h.run('isPrintingGeneralWeeklySheets'), true);
            assert.match(h.state.styles[0].textContent, /@page \{ size: A4 landscape; margin: 8mm; \}/);
            assert.match(h.state.styles[0].textContent, /break-after: page/);
            assert.doesNotMatch(h.state.styles[0].textContent, /exam-card/);
            h.run('printGeneralStudentWeeklySheet(17)'); assert.equal(h.state.prints, 1);
            if (mode === 'afterprint') h.state.listeners.get('afterprint')();
            else { const timer = [...h.state.timers.values()][0]; assert.equal(timer.ms, 60000); timer.fn(); }
        }
        assert.equal(h.run('isPrintingGeneralWeeklySheets'), false);
        assert.equal(h.element('generalWeeklySheetPrintArea').innerHTML, '');
        assert.equal(h.state.styles.length, 0); assert.equal(h.state.listeners.size, 0); assert.equal(h.state.timers.size, 0);
        h.state.printError = false; h.run('printGeneralStudentWeeklySheet(17)'); assert.equal(h.state.prints, 2);
    }
});

test('summer and review-day cannot open, normalize or print weekly sheets', () => {
    for (const program of ['summer', 'review-day']) {
        const h = harness(); h.state.program = program;
        h.run('openGeneralWeeklySheetModal(); renderGeneralWeeklySheetOptions(); normalizeGeneralWeeklySheetWeek(); printGeneralWeeklyStage(0); printGeneralStudentWeeklySheet(17); printGeneralWeeklySheets(students, "2026-11-01", generalWeeklySheetSettings());');
        assert.equal(h.state.prints, 0); assert.equal(h.state.styles.length, 0);
        assert.equal(h.element('generalWeeklySheetModal').classList.contains('hidden'), true);
        assert.equal(h.element('generalWeeklySheetStages').innerHTML, '');
    }
    assert.match(source('renderSettingsStudents'), /\$\{isGeneralProgram\(\) \? `<button[^\n]+printGeneralStudentWeeklySheet/);
    assert.match(source('applyProgramFeatures'), /generalWeeklySheetButton'\)\.style\.display = general \? '' : 'none'/);
});

test('legacy exam printing and shared settings reader remain byte-equivalent to task baseline', () => {
    const baseline = cp.execFileSync('git', ['show', '043a6f4:index.html'], { cwd: root, encoding: 'utf8' });
    for (const name of ['printExamCards', 'buildExamCardHtml', 'buildExamCardsPagesHtml', 'getProgramSettings', 'getStudentHalaqa']) {
        assert.equal(source(name).replaceAll('\r\n', '\n'), source(name, baseline).replaceAll('\r\n', '\n'), name);
    }
    const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
    for (const script of scripts) new vm.Script(script[1]);
});
