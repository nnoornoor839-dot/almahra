// بيانات وهمية فقط؛ الميزان ودوال الإنتاج، بلا شبكة أو تخزين.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const vm = require('node:vm');
const cp = require('node:child_process');
const { root, html, source, QuranMeasure, copy } = require('./helpers/quick-entry-harness.cjs');
const { answerStudents } = require('./helpers/t25-browser.cjs');
const home = require('./rules/home-answer-key.json');
const key = require('./rules/reports-answer-key.json');
const baseline = cp.execFileSync('git', ['show', '82bf19f:index.html'], { cwd: root, encoding: 'utf8' });
const initial = cp.execFileSync('git', ['show', 'a597c11:index.html'], { cwd: root, encoding: 'utf8' });
const range = { ...key.period, today: key.today };
const early = { from: '2026-11-01', to: '2026-11-04', today: key.today };

test('حماية: بصمة مفتاح التقارير ثابتة', () => {
    // تغيير المفتاح يحتاج مراجعة مستقلة وتحديث البصمة هنا عمداً
    const digest = createHash('sha256').update(fs.readFileSync(root + '/tests/rules/reports-answer-key.json')).digest('hex');
    assert.equal(digest, '45afa34da69edc36ab6b7eacf8420763d8aec23357361f2ab40406ac8a6cf59b');
});

test('حماية: قائمة دوال design r1 المقفلة لا تفقد أي اسم حالي', () => {
    const design = fs.readFileSync(root + '/tests/design-r1-local.test.cjs', 'utf8');
    const start = design.indexOf("test('design r1: calculation, search, attendance and forbidden files stay identical to 82bf19f'");
    assert.ok(start >= 0, 'اختبار قفل الدوال موجود');
    const list = design.slice(start).match(/for \(const name of \[([\s\S]*?)\]\)/);
    assert.ok(list, 'قائمة الدوال المقفلة موجودة');
    const names = [...list[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
    for (const name of ['generalTodaySummary', 'generalStalledMemorization', 'generalRecitationSupport',
        'generalPerformanceDelta', 'generalPerformanceFollowup', 'generalPerformanceModel',
        'generalHalaqaTodayCounts', 'generalStudentsQuery', 'generalStudentsMatching', 'generalCardTodayState',
        'migrateSettings', 'getAttendanceState']) assert.ok(names.includes(name), name);
});

function harness(text = html, list = answerStudents(), settings = copy(home.settings), season = copy(home.season), today = key.today) {
    const ctx = vm.createContext({ Date, QuranMeasure, todayStr: today, settings, season,
        isGeneralProgram: () => true, getProgramSettings: () => settings,
        window: { almahraPrograms: { getCurrentSeason: () => season, getSettings: () => settings } } });
    const run = code => vm.runInContext(code, ctx);
    for (const name of ['ivPairs', 'measureEntry']) run(text.match(new RegExp(`const ${name} = .*;`))[0]);
    for (const name of ['schoolCivilDate', 'formatDateLocal', 'getWeekStartDate', 'isSeasonCalendarComplete',
        'isWorkingDay', 'getSchoolDayInfo', 'getAttendanceState', 'generalAttendanceStart', 'getGeneralSchoolDates', 'endPointOf',
        ...[...text.matchAll(/function ((?:generalPerformance|generalPeriod|generalStudentReport|generalHalaqaReport|generalComplexNumbers)\w*)\(/g)]
            .map(match => match[1]).filter(name => !/^generalPerformance(?:Number|Percent|.*Html|Chart|DateLabel|Invalidate|Resize)$/.test(name))]) run(source(name, text));
    const readers = { stateOf: ctx.getAttendanceState, startOf: ctx.generalAttendanceStart, measure: run('measureEntry'),
        schoolDayInfo: ctx.getSchoolDayInfo, endPoint: ctx.endPointOf };
    const config = ctx.generalPerformanceSettings(settings);
    return { ctx, settings, season, readers, config, list,
        student: (id, period = range) => copy(ctx.generalStudentReport(list.find(s => s.id === id), period, config, readers)),
        halaqa: (id, period = range) => copy(ctx.generalHalaqaReport(list, id, period, config, readers)),
        complex: (period = { from: season.termStart, to: season.termEnd, today }) => copy(ctx.generalComplexNumbers(list, period, readers)),
        model: (period = 'all') => JSON.stringify(ctx.generalPerformanceModel(list, settings, config, period,
            { dates: ctx.getGeneralSchoolDates(), today }, season, readers)) };
}
// المفتاح منشور بست منازل؛ الكود يحتفظ بالدقة الكاملة ولا يقرّب الكميات.
function quantities(actual, expected) {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
    for (const unit of Object.keys(expected)) {
        if (['ayahs', 'pages'].includes(unit)) assert.equal(actual[unit], expected[unit], unit);
        else assert.ok(Math.abs(actual[unit] - expected[unit]) <= 0.000001, `${unit}: ${actual[unit]} / ${expected[unit]}`);
    }
}
function attendance(actual, expected) {
    assert.deepEqual(Object.fromEntries(Object.keys(expected).map(field => [field, actual[field]])), expected);
}

for (const expected of key.students) test(`أ: §7 تقرير ${home.students[expected.studentId - 1].name} بكل أرقامه`, () => {
    const h = harness(), before = JSON.stringify(h.list), actual = h.student(expected.studentId);
    attendance(actual.attendance, expected.attendance);
    quantities(actual.new, expected.new); quantities(actual.review, expected.review);
    for (const field of ['studentId', 'memorizedRange', 'achievement', 'noNewDates', 'reviewDates', 'reviewAttendance', 'repeatDates'])
        assert.deepEqual(actual[field], expected[field], field);
    assert.equal(JSON.stringify(h.list), before);
});
for (const expected of key.halaqas) test(`أ: §7 حلقة ${expected.halaqaId}: الحضور والقصّ والمراجعة والحالة وجدول الطلاب`, () => {
    const actual = harness().halaqa(expected.halaqaId);
    for (const field of ['halaqaId', 'studentCount', 'attendance', 'achievement', 'status']) assert.deepEqual(actual[field], expected[field], field);
    quantities(actual.new, expected.new); quantities(actual.review, expected.review);
    assert.deepEqual(actual.students.map(student => [student.studentId, student.repeatDates.length]),
        key.students.filter(student => home.students[student.studentId - 1].halaqaId === expected.halaqaId)
            .map(student => [student.studentId, student.repeatDates.length]));
});
for (const expected of key.withinLimits) test(`أ: §7 ضمن الحد ي1–ي4: حلقة ${expected.halaqaId}`, () => {
    const actual = harness().halaqa(expected.halaqaId, early);
    assert.deepEqual({ halaqaId: actual.halaqaId, present: actual.attendance.present, recorded: actual.attendance.recorded,
        attendancePct: actual.attendance.pct, counted: actual.achievement.counted, goal: actual.achievement.goal,
        newPct: actual.achievement.pct }, expected);
    assert.deepEqual(actual.status, { attendance: false, new: false });
});
test('أ: §7 عمر ي1–ي4: لم يسجل 1 خارج المقام، والهدف 1.5 والمنجز 2 والمراجعة 1 من 3', () => {
    const actual = harness().student(5, early);
    attendance(actual.attendance, key.omarEarly.attendance);
    assert.deepEqual(actual.achievement, key.omarEarly.achievement);
    assert.deepEqual(actual.reviewAttendance, key.omarEarly.reviewAttendance);
});
test('أ: §7 المانح: عدد الطلاب والجديد والمراجعة بالوحدات الخمس من بداية الفصل إلى أمس', () => {
    const h = harness(), before = JSON.stringify(h.list), actual = h.complex();
    assert.equal(actual.studentCount, key.complex.studentCount);
    quantities(actual.new, key.complex.new); quantities(actual.review, key.complex.review);
    assert.equal(JSON.stringify(h.list), before);
});
test('أ: §7 ثوابت المقاطع وأعداد صفحات جديد المانح تطابق الميزان والسجل', () => {
    const h = harness(), counts = {};
    for (const [page, expected] of Object.entries(key.pageMeasures)) {
        const measured = h.readers.measure({ spec: home.pages[page], rep: 1 });
        quantities({ ayahs: measured.ayahs, pages: measured.pages, quarters: measured.quarters,
            hizbs: measured.hizb, juzs: measured.juz }, expected);
    }
    const dates = h.ctx.generalPeriodDays({ from: home.season.termStart, to: home.season.termEnd, today: key.today }, h.readers.schoolDayInfo);
    for (const student of h.list) {
        const attendance = h.ctx.generalPerformanceStudentAttendance(student, { dates, today: key.today }, h.readers);
        const work = h.ctx.generalPerformanceStudentWork(student, attendance.presentDates, 'new', h.readers);
        for (const { entry } of work.entries) {
            const page = Object.keys(home.pages).find(page => JSON.stringify(home.pages[page]) === JSON.stringify(entry.spec));
            counts[page] = (counts[page] || 0) + 1;
        }
    }
    assert.deepEqual(counts, key.complex.newPageCounts);
});

test('ب: اليوم الجاري والمستقبل خارج تقريري الطالب والحلقة وأرقام المجمع صراحة', () => {
    const h = harness(), capped = { from: range.from, to: '2027-01-14', today: key.today };
    assert.deepEqual(h.student(3, capped), h.student(3));
    assert.deepEqual(h.halaqa('a', capped), h.halaqa('a'));
    const before = h.complex();
    h.list[0].history['2026-11-23'] = copy(h.list[0].history['2026-11-01']);
    assert.deepEqual(h.complex(), before);
    assert.ok(h.ctx.generalPeriodDays(capped, h.readers.schoolDayInfo).every(date => date < key.today));
});
test('ب: يعاد لا يدخل أي كمية؛ تسجيلان في يوم = يوم واحد؛ مراجعة يعاد خارج X', () => {
    const h = harness(), omar = h.student(5), saad = h.student(1);
    assert.deepEqual(omar.repeatDates, ['2026-11-17']);
    assert.equal(omar.new.pages, 1); assert.equal(omar.review.pages, 2);
    assert.equal(saad.review.pages, 0); assert.equal(saad.reviewAttendance.days, 0);
    const before = h.complex();
    h.list[0].history['2026-11-17'].entries = { r: { kind: 'new', grade: 'repeat', spec: home.pages[6] } };
    assert.deepEqual(h.complex().new, before.new);
});
test('ب: تكرار المراجعة يحسب كل مرة حتى داخل اليوم نفسه، وX عدد أيام الحضور فقط', () => {
    const h = harness(), omar = h.list[4], before = h.student(5);
    omar.history['2026-11-16'].entries.extra = copy(omar.history['2026-11-16'].entries.e0);
    const actual = h.student(5);
    assert.equal(actual.review.pages, before.review.pages + 1);
    assert.equal(actual.review.ayahs, before.review.ayahs + 11);
    assert.deepEqual(actual.reviewAttendance, before.reviewAttendance);
});
test('ب: المقام صفر = null للعرض «—»، ولا حكم للحد؛ لا حضور ولا بداية بعد', () => {
    const h = harness(html, [{ id: 1, halaqaId: 'a', history: {} }]);
    const actual = h.student(1), group = h.halaqa('a');
    assert.equal(actual.attendance.pct, null); assert.equal(actual.achievement.pct, null);
    assert.equal(actual.reviewAttendance, null); assert.equal(actual.memorizedRange, null);
    assert.deepEqual(group.status, { attendance: null, new: null });
    assert.equal(harness().student(2).attendance.pct, 0);
    assert.equal(harness().student(2).achievement.pct, null);
});
test('ب: التسجيل الفاسد يتخطى ولا يسقط التقرير أو يفسد المجاميع', () => {
    const h = harness(), before = h.student(4), donor = h.complex();
    h.list[3].history['2026-11-15'].entries.bad = { kind: 'new', grade: 'good', spec: { from: [999, 1], to: [999, 2] } };
    h.list[3].history['2026-11-15'].entries.badReview = { kind: 'review', grade: 'good', spec: null };
    assert.deepEqual(h.student(4), before); assert.deepEqual(h.complex(), donor);
    assert.equal(h.halaqa('b').new.pages, 4);
});
test('ب: حفظ من إلى يرتب التاريخ ثم at لا وقت حفظ اليوم الفائت؛ مدى iv أيضاً', () => {
    const h = harness();
    h.list[0].history = {
        '2026-11-16': { entries: { late: { kind: 'new', grade: 'good', spec: home.pages[6], at: 1 } } },
        '2026-11-15': { entries: { b: { kind: 'new', grade: 'good', spec: home.pages[5], at: 500 },
            a: { kind: 'new', grade: 'good', spec: home.pages[4], at: 400 } } }
    };
    assert.deepEqual(h.student(1).memorizedRange, { from: { surah: 2, ayah: 17 }, to: { surah: 2, ayah: 37 } });
    h.list[0].history['2026-11-15'].entries.a = { kind: 'new', grade: 'good', at: 400,
        iv: QuranMeasure.specToIntervals({ spec: home.pages[4] }) };
    assert.deepEqual(h.student(1).memorizedRange, { from: { surah: 2, ayah: 17 }, to: { surah: 2, ayah: 37 } });
});
for (const [direction, spec] of [
    ['up', { from: [114, 1], to: [113, 5] }],
    ['down', { from: [113, 1], to: [114, 6] }]
]) test(`ب: حفظ من إلى يأخذ بداية أول تسجيل يعبر سورتين من spec مع وجود iv باتجاه ${direction}`, () => {
    const h = harness();
    h.list[0].direction = direction;
    h.list[0].history = { '2026-11-15': { attended: true, entries: {
        first: { kind: 'new', grade: 'good', spec, iv: QuranMeasure.specToIntervals({ spec }), at: 1 }
    } } };
    assert.deepEqual(h.student(1).memorizedRange, {
        from: { surah: spec.from[0], ayah: spec.from[1] },
        to: { surah: spec.to[0], ayah: spec.to[1] }
    });
});

test('ب: الفترة من التقويم، آخر أسبوع دراسي مكتمل، الإجازة وبداية الفصل والأسابيع الكاملة', () => {
    const h = harness(), period = today => copy(h.ctx.generalPeriodRange(h.season, h.settings, today, h.readers.schoolDayInfo));
    assert.deepEqual(period(key.today), { from: '2026-11-15', to: '2026-11-18', today: key.today });
    assert.equal(period('2026-11-16').from, '2026-11-01');
    assert.equal(period('2026-11-19').from, '2026-11-15');
    assert.equal(period('2026-11-01').from, null);
    const custom = copy(h.ctx.generalPeriodRange(h.season, h.settings, key.today, h.readers.schoolDayInfo,
        { from: '2026-11-02', to: '2026-11-16' }));
    assert.deepEqual(custom, { from: '2026-11-01', to: '2026-11-21', today: key.today });
    assert.deepEqual(copy(h.ctx.generalPeriodDays(custom, h.readers.schoolDayInfo)), home.dates.slice(0, -1));
    assert.equal(h.ctx.generalPeriodRange(h.season, h.settings, key.today, h.readers.schoolDayInfo, { mode: 'term' }).to, '2026-11-21');
    assert.deepEqual(copy(h.ctx.generalPeriodDays({ ...range, from: 'bad' }, h.readers.schoolDayInfo)), []);
});
test('ب: حدّا الحلقة من الإعدادات، والمساواة ضمن الحد، والتجميع على الحلقة الحالية', () => {
    const settings = copy(home.settings);
    settings.followupLimits = { attendancePct: 33, newPct: 100 };
    const h = harness(html, answerStudents(), settings);
    assert.deepEqual(h.halaqa('a').status, { attendance: false, new: false });
    settings.followupLimits.attendancePct = 34;
    const next = harness(html, h.list, settings);
    assert.deepEqual(next.halaqa('a').status, { attendance: true, new: false });
    next.list[0].halaqaId = 'b';
    assert.equal(next.halaqa('a').studentCount, 2); assert.equal(next.halaqa('b').studentCount, 4);
});

test('ج: generalPerformanceModel يطابق 82bf19f حرفياً على المفتاح، بكل الفترات والرسمين والمتابعة', () => {
    const current = harness(), old = harness(baseline);
    for (const period of ['all', 'asr', 'maghrib']) assert.equal(current.model(period), old.model(period));
    const totals = JSON.parse(current.model()).current;
    assert.equal(totals.present, key.halaqas.reduce((sum, row) => sum + row.attendance.present, 0));
    assert.equal(totals.raw, key.halaqas.reduce((sum, row) => sum + row.achievement.raw, 0));
    assert.equal(totals.goal, key.halaqas.reduce((sum, row) => sum + row.achievement.goal, 0));
});
test('ج: مقارنة حرفية مع 82bf19f على 80 عينة مولدة ببذرة ثابتة تشمل الغياب والعذر وعدم التسجيل والإجازة والحلقات غير النشطة', () => {
    let seed = 0x82719f;
    const random = max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
    const covered = new Set();
    for (let sample = 0; sample < 80; sample++) {
        const settings = copy(home.settings), season = copy(home.season);
        settings.halaqas.push({ id: 'off', stageId: 'middle', active: false });
        settings.newGoalPerDay = [.25, .5, 1, 1.5][random(4)];
        settings.followupLimits = { attendancePct: 40 + random(61), newPct: 40 + random(61) };
        const list = Array.from({ length: 4 + random(15) }, (_, index) => {
            const s = { id: index + 1, halaqaId: ['a', 'b', 'c', 'off', ''][random(5)], history: {} };
            if (s.halaqaId === 'off') covered.add('inactive');
            for (const date of [...home.dates, '2026-11-09', '2026-11-23']) {
                const code = random(8); covered.add(code);
                if (date === '2026-11-09') covered.add('holiday');
                if (code === 0) continue;
                if (code <= 2) { s.history[date] = { attended: false, absence: code === 1 ? 'excused' : 'unexcused' }; continue; }
                const day = s.history[date] = { attended: true, entries: {} };
                if (code === 3) continue;
                for (let i = 0; i < 1 + random(3); i++) day.entries[i] = {
                    kind: code === 4 ? 'review' : 'new', grade: code === 5 ? 'repeat' : code === 6 ? undefined : 'good',
                    spec: copy(home.pages[3 + random(4)]), rep: 1 + random(2), at: random(100) };
            }
            return s;
        });
        const today = ['2026-11-16', '2026-11-19', key.today, '2026-11-24'][random(4)];
        const current = harness(html, list, settings, season, today), old = harness(baseline, list, settings, season, today);
        for (const period of ['all', 'asr', 'maghrib']) assert.equal(current.model(period), old.model(period), `sample ${sample}, ${period}`);
    }
    for (const state of [0, 1, 2, 3, 4, 5, 6, 7, 'inactive', 'holiday']) assert.ok(covered.has(state), String(state));
});

test('د: summer وreview-day بلا تغيير؛ الواجهة والحفظ والمحرك والدوال الممنوعة مطابقة للرأس الأول', () => {
    // استثناء حرفي لعرض تجربة المالك؛ أي فرق آخر في الملف يبقى ممنوعاً.
    const approvedTrial = require('./rules/design-expectation-audit.json').trialProductionChanges;
    const beforeTrial = approvedTrial.hunks.reduce((text, hunk) => {
        const after = hunk.after.join('\n'), before = hunk.before.join('\n');
        assert.ok(after && before && initial.replaceAll('\r\n', '\n').includes(before));
        assert.equal(text.split(after).length, 2, 'each approved UI change occurs exactly once');
        return text.replace(after, before);
    }, require('./helpers/board-invariants.cjs').beforeBoard(html));
    assert.equal(beforeTrial, initial.replaceAll('\r\n', '\n'));
    for (const name of ['renderReportsTable', 'computeComplexStats', 'generalRecitationTotals', 'getAttendanceState',
        'saveGeneralQuickEntry', 'buildGeneralWeeklyMessage']) assert.equal(source(name, beforeTrial), source(name, initial));
    const store = fs.readFileSync(root + '/programs-store.js', 'utf8');
    assert.equal(require('./helpers/board-invariants.cjs').beforeBoard(store, 'programs-store.js'), cp.execFileSync('git', ['show', '1e4152b:programs-store.js'], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n'));
    const ctx = vm.createContext({});
    const defs = store.slice(store.indexOf('export const PROGRAM_DEFS'), store.indexOf('// الحالة الداخلية')).replace('export ', '');
    vm.runInContext(defs + '\n' + source('fillTierMinJuz', store) + '\n' + source('migrateSettings', store) + '\nconst SETTINGS_VERSION = 4;', ctx);
    for (const program of ['summer', 'review-day']) {
        const result = vm.runInContext(`(() => { const settings = { ...PROGRAM_DEFS['${program}'].defaultSettings, settingsVersion: 4 };
            const before = JSON.stringify(settings), result = migrateSettings('${program}', settings);
            return { before, after: JSON.stringify(result.settings), changed: result.changed }; })()`, ctx);
        assert.equal(result.after, result.before); assert.equal(result.changed, false);
    }
});
