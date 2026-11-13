// اختبار قبول البند 2-3 «نقاط الفارس على التلفاز» (general فقط) — 2026-11-13. يُرى أحمر قبل البناء.
// المصدر: notes/features/knights/tv-points-card.md §2د (الأمثلة ق1–ق7) و§4 (ت1–ت4).
// المدخلات تسجيلات حقيقية قابلة للقياس (QuranMeasure + generalEntryPoints) كما في design-v1/verify/tv-points-calc-3-2026-11-13.cjs.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const cp = require('node:child_process');
const path = require('node:path');
const { source, html, root, QuranMeasure, generalEntryPoints, copy } = require('./helpers/quick-entry-harness.cjs');
const { installTv } = require('./helpers/tv-harness.cjs');
const { functions: weekFunctions } = require('./helpers/knights-r2-harness.cjs');
const BASE = '6e50320';
const atBase = file => cp.execFileSync('git', ['show', BASE + ':' + file], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// ===== التسجيلات: الافتراضي العام مع معامل 3 للجديد والمراجعة، والحضور 10 صراحة =====
const grades = [{ id: 'excellent', name: 'ممتاز', percent: 100 }, { id: 'very-good', name: 'جيد جداً', percent: 75 },
    { id: 'good', name: 'جيد', percent: 50 }, { id: 'repeat', name: 'يُعاد', percent: 0, fullPointsOnSuccessfulRepeat: true }];
const kindMult = { newMemorization: 3, review: 3 };
const ATT = 10;
// البقرة 15-18 = 5 أسطر (جديد)، البقرة 38-51 = 20 سطراً (مراجعة).
const NEW = { from: [2, 15], to: [2, 18] }, REV = { from: [2, 38], to: [2, 51] };
const lines = spec => QuranMeasure.measure({ spec }).lines;
function rec(kind, spec, gradeId) {
    const s = generalEntryPoints({ lines: lines(spec), kind, gradeId, settings: { kindMult, grades } });
    return { kind, spec, grade: gradeId, rep: 1, mult: s.mult, points: s.points };
}
// الأيام النموذجية: أ = 15 و60 (980 عُشراً)، ب = 11.3 و45 (793)، ج = 7.5 و30 (605)، ص = حاضر بلا تسجيل (0).
const GRADE = { 'أ': 'excellent', 'ب': 'very-good', 'ج': 'good' };
function day(letter) {
    if (letter === 'ص') return { attended: true, criteriaPoints: 0 };
    const g = GRADE[letter];
    return { attended: true, entries: { e0: rec('new', NEW, g), e1: rec('review', REV, g) },
        criteria: { early: 5, manners: 5, uniform: 3, homeprep: 10 }, criteriaPoints: 23, groupDisciplinePoints: 0 };
}
const student = (id, name, halaqaId, joinedOn, days) => ({ id, name, halaqaId, joinedOn,
    history: Object.fromEntries(Object.entries(days).map(([d, l]) => [d, day(l)])) });

test('ت0: التسجيلات قابلة للقياس وتعطي النقاط المذكورة في البطاقة', () => {
    assert.equal(lines(NEW), 5); assert.equal(lines(REV), 20);
    assert.deepEqual([day('أ'), day('ب'), day('ج')].map(d => [d.entries.e0.points, d.entries.e1.points]), [[15, 60], [11.3, 45], [7.5, 30]]);
});

// ===== حاضنة اللقطة: الدوال الحقيقية بـ installTv (كما في tests/step8c-tv-local.test.cjs) =====
const tvSettings = () => ({ points: { attendance: ATT, newMemorization: 3, review: 3 }, workingDays: [0, 1, 2, 3], grades, kindMult, absence: [], criteria: [],
    stages: [{ id: 'a', name: 'مرحلة', period: 'asr' }], teachers: [], titleRules: { weeklyAttendancePct: 75 },
    halaqas: ['h1', 'h2', 'h3', 'h4', 'w1', 'w3', 'w4'].map((id, i) => ({ id, name: 'حلقة ' + id, stageId: 'a', active: true, order: i })), features: { tiers: false } });
function tvContext(list, today, season = {}) {
    const settings = tvSettings();
    const fullSeason = { termStart: '2026-11-15', termEnd: '2026-12-31', calendar: [], ...season };
    const programs = { getCurrentProgramId: () => 'general', getCurrentSeasonId: () => 's1', getCurrentSeason: () => fullSeason,
        getSettings: () => settings, getCurrentProgram: () => ({ name: 'وهمي' }), isCurrentSeasonArchived: () => false,
        isFeatureEnabled: name => settings.features?.[name] !== false, PROGRAM_DEFS: { general: { defaultSettings: settings } } };
    const ctx = vm.createContext({ console, Date, Intl, structuredClone, QuranMeasure,
        document: { getElementById: () => ({ style: {}, classList: { toggle() {} } }) },
        window: { almahraPrograms: programs, almahraAuth: { currentUser: { uid: 'fake-admin' } },
            almahraData: { isReady: () => true, getActiveProgramId: () => 'general', getActiveSeasonId: () => 's1' } },
        getCumulativeStats: () => ({ tripPoints: 0 }), summarizeRange: () => ({ points: 0, attended: 0 }), getMostImproved: () => [],
        getActiveCriteria: () => [], showToast() {}, setInterval() {}, clearInterval() {} });
    const run = code => vm.runInContext(code, ctx);
    const install = (...names) => names.forEach(name => run(source(name)));
    ctx.fixtures = list;
    run(`let students = fixtures, todayStr = '${today}', honorKnightsLog = []; const ALL_DAY_NAMES = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];`);
    for (const name of ['ivPairs', 'measureEntry']) run(html.match(new RegExp('const ' + name + ' = .*;'))[0]);
    install('isGeneralProgram', 'getProgramSettings', 'getTiers', 'tiersFeatureOn', 'isWorkingDay', 'schoolCivilDate', 'isSeasonCalendarComplete',
        'getSchoolDayInfo', 'getGeneralSchoolDates', 'formatDateLocal', 'getWeekStartDate', 'addDaysToDateStr',
        'getBoardDate', 'getBoardWeekRange', 'getWorkingDatesInRange', 'roundPointTotal');
    installTv(run, install);
    assert.equal(run('getProgramSettings().points.attendance'), ATT);
    return { run, ctx, snapshot: () => copy(run('getGeneralTvSnapshot()')) };
}
const dayCards = snap => Object.fromEntries(snap.stages.flatMap(s => s.dayKnights).map(c => [c.stage, c]));

test('ت1 (اللقطة، اليوم): ق1 وق2 وق4 وق6-يوم وق7 — points تحت كل اسم، و names كما هي', () => {
    // يوم 2026-11-16: ق1 خالد «أ» وحده في h1، ق2 سالم «ب» وحده في h2، ق4 يزيد ووليد «أ» متطابقان في h3.
    const day16 = [student(1, 'خالد', 'h1', '2026-11-01', { '2026-11-16': 'أ' }), student(2, 'سالم', 'h2', '2026-11-01', { '2026-11-16': 'ب' }),
        student(3, 'يزيد', 'h3', '2026-11-01', { '2026-11-16': 'أ' }), student(4, 'وليد', 'h3', '2026-11-01', { '2026-11-16': 'أ' })];
    const s16 = tvContext(day16, '2026-11-16').snapshot();
    assert.equal(s16.boardDate, '2026-11-16');
    const c16 = dayCards(s16);
    assert.deepEqual(c16['حلقة h1'].names, ['خالد']); assert.deepEqual(c16['حلقة h2'].names, ['سالم']); assert.deepEqual(c16['حلقة h3'].names, ['يزيد', 'وليد']);
    // ق6-يوم: هاني joinedOn 2026-11-17 حاضر 17 «أ» و18 «ج»؛ اللوحة يوم 17.
    const s17 = tvContext([student(5, 'هاني', 'h4', '2026-11-17', { '2026-11-17': 'أ', '2026-11-18': 'ج' })], '2026-11-17').snapshot();
    assert.equal(s17.boardDate, '2026-11-17');
    assert.deepEqual(dayCards(s17)['حلقة h4'].names, ['هاني']);
    // ق7: صباح 2026-11-17 قبل أي حضور؛ آخر يوم حضور 2026-11-16 وفيه خالد «أ» ← يوم اللوحة أمس.
    const s7 = tvContext([student(1, 'خالد', 'h1', '2026-11-01', { '2026-11-16': 'أ' })], '2026-11-17').snapshot();
    assert.equal(s7.boardDate, '2026-11-16');
    assert.deepEqual(dayCards(s7)['حلقة h1'].names, ['خالد']);
    // التوقعات (§2د): 980 + 100 = 1080 ← 108؛ 793 + 100 = 893 ← 89.3.
    assert.deepEqual(c16['حلقة h1'].points, [108], 'ق1');
    assert.deepEqual(c16['حلقة h2'].points, [89.3], 'ق2');
    assert.deepEqual(c16['حلقة h3'].points, [108, 108], 'ق4');
    assert.deepEqual(dayCards(s17)['حلقة h4'].points, [108], 'ق6-يوم');
    assert.deepEqual(dayCards(s7)['حلقة h1'].points, [108], 'ق7');
});

// ===== الأسبوع: السطر المجمَّد من buildWeekKnightsRow الحقيقية، ثم getLockedWeekKnights الحقيقية =====
function weekRows() {
    const settings = { ...tvSettings(), teachers: [{ id: 't', name: 'معلم' }], season: { termStart: '2026-11-15', termEnd: '2026-12-31', calendar: [] } };
    settings.halaqas.forEach(h => { h.teacherId = 't'; });
    class ExplicitDate extends Date { constructor(...args) { if (!args.length) throw Error('clock read'); super(...args); } static now() { throw Error('clock read'); } }
    const wctx = vm.createContext({ QuranMeasure, Date: ExplicitDate });
    for (const name of ['ivPairs', 'measureEntry']) vm.runInContext(html.match(new RegExp('const ' + name + ' = .*;'))[0], wctx);
    for (const name of weekFunctions) vm.runInContext(name === 'dayPoints' ? html.match(/const dayPoints = .*;/)[0] : source(name), wctx);
    const range = { startStr: '2026-11-15', endStr: '2026-11-18' };
    const week = { '2026-11-15': 'أ', '2026-11-16': 'ب', '2026-11-17': 'ج', '2026-11-18': 'ص' };
    // ق3: فهد وحده في w1. ق4ب: توأمان بالأيام نفسها في w3. ق5ب: w4 بلا طلاب.
    const list = [student(11, 'فهد', 'w1', '2026-11-01', week), student(13, 'ماجد', 'w3', '2026-11-01', week), student(14, 'نايف', 'w3', '2026-11-01', week)];
    const build = id => { wctx.args = [range, settings.halaqas.find(h => h.id === id), list, [], settings]; return copy(vm.runInContext('buildWeekKnightsRow(...args)', wctx)); };
    const lock = row => ({ ...row, key: 's1|' + row.key, frozenAt: { seconds: 1, nanoseconds: 0 }, frozenAtDevice: 1000, frozenBy: 'fake-admin',
        lockedAt: { seconds: 2, nanoseconds: 0 }, lockedBy: 'fake-admin', lockedSteps: [] });
    return { w1: lock(build('w1')), w3: lock(build('w3')), w4: lock(build('w4')) };
}

test('ت2 (اللقطة، الأسبوع): ق3 وق4ب وق5ب — points من السطر المجمَّد، و names = [{ name, rank }] كما هي', () => {
    const rows = weekRows();
    // السطر المجمَّد نفسه (قبل البناء وبعده): 2778 عُشراً لكل فارس.
    assert.deepEqual(rows.w1.knights.map(s => [s.name, s.rank, s.weekPointsTenths]), [['فهد', 1, 2778]]);
    assert.deepEqual(rows.w3.knights.map(s => [s.name, s.rank, s.weekPointsTenths]), [['ماجد', 1, 2778], ['نايف', 1, 2778]]);
    assert.deepEqual([rows.w4.knights, rows.w4.nominees], [[], []]);
    const season = { frozenWeeks: { '2026-11-15': { seconds: 1, nanoseconds: 0 } }, weekKnightsLog: Object.fromEntries(Object.values(rows).map(r => [r.key, r])) };
    // اليوم 2026-11-29 ← أسبوع العرض 2026-11-15 (آخر أسبوع محسوم قبل الأسبوع الجاري).
    const h = tvContext([], '2026-11-29', season);
    assert.equal(h.run('knightsDisplayWeekStart()'), '2026-11-15');
    const cards = copy(h.run("getLockedWeekKnights('asr')"));
    const by = Object.fromEntries(cards.map(c => [c.stage, c]));
    assert.deepEqual(Object.keys(by), ['حلقة w1', 'حلقة w3', 'حلقة w4']);
    assert.deepEqual(by['حلقة w1'].names, [{ name: 'فهد', rank: 1 }]);
    assert.deepEqual(by['حلقة w3'].names, [{ name: 'ماجد', rank: 1 }, { name: 'نايف', rank: 1 }]);
    assert.deepEqual(by['حلقة w4'].names, []); assert.equal(by['حلقة w4'].status, 'لا ترشيحات هذا الأسبوع');
    // التوقعات (§2د): 2778 ÷ 10 = 277.8؛ التعادل الرقم لكل اسم؛ بلا ترشيح = [].
    assert.deepEqual(by['حلقة w1'].points, [277.8], 'ق3');
    assert.deepEqual(by['حلقة w3'].points, [277.8, 277.8], 'ق4ب');
    assert.deepEqual(by['حلقة w4'].points, [], 'ق5ب');
});

// ===== ت3: الرسم في متصفح حقيقي (بنمط tests/tv-design-local.test.cjs:52-63) =====
let browser;
before(async () => {
    const playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); });
async function openTv() {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
    const page = await context.newPage(), external = [], errors = [];
    page.on('pageerror', e => { errors[errors.length] = e.message; });
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== 'http://tv.test') { external[external.length] = url.href; return route.abort('internetdisconnected'); }
        const file = path.resolve(root, decodeURIComponent(url.pathname.slice(1)));
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
        await route.fulfill({ path: file });
    });
    await page.clock.install({ time: new Date('2026-11-01T12:00:00Z') });
    await page.goto('http://tv.test/tv.html');
    await page.evaluate(() => document.fonts.ready);
    await page.clock.pauseAt(new Date('2026-11-01T12:00:01Z'));
    const post = message => page.evaluate(message => {
        window.tvTestSender ||= new BroadcastChannel('almahra-tv'); window.tvTestSender.postMessage(message);
    }, message);
    return { page, external, errors,
        async snapshot(message) { await post(message); await page.waitForFunction(() => document.querySelector('.slide')); await page.clock.runFor(850); },
        close: () => context.close() };
}
async function safe(page, selectors) {
    const bounds = await page.locator(selectors).evaluateAll(nodes => nodes.filter(n => n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden').map(n => {
        const r = n.getBoundingClientRect(); return { text: n.textContent, x: r.x, y: r.y, right: r.right, bottom: r.bottom };
    }));
    assert.ok(bounds.length);
    for (const r of bounds) assert.ok(r.x >= 95.5 && r.y >= 53.5 && r.right <= 1824.5 && r.bottom <= 1026.5, JSON.stringify(r));
}
const DAY_TITLE = 'فارس اليوم', WEEK_TITLE = 'فرسان الحلقات للأسبوع الماضي';
const board = () => [{ name: 'سعد فهد ناصر', points: 196, week: 42, rank: 1 }];
const tvMessage = (dayKnights, weekKnights) => ({ type: 'snapshot', boardDate: '2026-11-01', stages: [{ period: 'asr', name: 'ابتدائي', board: board(), dayKnights, weekKnights }] });
const withPoints = () => tvMessage(
    [{ stage: 'حلقة 1', names: ['خالد'], points: [108] }, { stage: 'حلقة 2', names: ['سالم'], points: [89.3] }, { stage: 'حلقة 3', names: ['يزيد', 'وليد'], points: [108, 108] }],
    [{ stage: 'حلقة 4', names: [{ name: 'فهد', rank: 1 }], points: [277.8], status: '' }, { stage: 'حلقة 5', names: [], points: [], status: 'لا ترشيحات هذا الأسبوع' }]);
const slideOf = (page, title) => page.locator('.slide').filter({ has: page.locator('h2', { hasText: title }) });
async function showSlide(page, title) {
    for (let i = 0; i < 6; i++) {
        if ((await page.locator('.slide.active h2').innerText()).includes(title)) return page.locator('.slide.active');
        await page.clock.runFor(15000);
    }
    throw Error('slide not shown: ' + title);
}

test('ت3 (الرسم): .kname الأسماء وحدها، .kpoints «N نقطة» تحت كل اسم، الحال بلا رقم، لقطة بلا points بلا رقم، داخل المنطقة الآمنة', async () => {
    const h = await openTv();
    try {
        await h.snapshot(withPoints());
        const day = slideOf(h.page, DAY_TITLE), week = slideOf(h.page, WEEK_TITLE);
        assert.deepEqual(await day.locator('.kname').allTextContents(), ['خالد', 'سالم', 'يزيد', 'وليد'], 'الاسم وحده بلا رقم');
        assert.deepEqual(await week.locator('.kname').allTextContents(), ['فهد']);
        const cardTexts = (slide, i) => slide.locator('.card').nth(i).locator('.kpoints').allTextContents();
        assert.deepEqual(await cardTexts(day, 0), ['108 نقطة'], 'ق1');
        assert.deepEqual(await cardTexts(day, 1), ['89.3 نقطة'], 'ق2');
        assert.deepEqual(await cardTexts(week, 0), ['277.8 نقطة'], 'ق3');
        assert.deepEqual(await cardTexts(week, 1), [], 'ق5ب: بطاقة الحال بلا رقم');
        // ق4: الترتيب في DOM اسم، رقم، اسم، رقم.
        const order = await day.locator('.card').nth(2).locator('.card-body > *').evaluateAll(ns => ns.map(n => n.className + ':' + n.textContent));
        assert.deepEqual(order, ['kname:يزيد', 'kpoints:108 نقطة', 'kname:وليد', 'kpoints:108 نقطة'], 'ق4');
        for (const title of [DAY_TITLE, WEEK_TITLE]) {
            const slide = await showSlide(h.page, title);
            await safe(h.page, '.slide.active .slide-title, .slide.active .card, .slide.active h3, .slide.active p');
            assert.ok(await slide.locator('.card').evaluateAll(cards => cards.every(card => card.scrollHeight <= card.clientHeight + 1)), 'لا قصّ: ' + title);
        }
        // لقطة قديمة بلا points: لا .kpoints ولا خطأ صفحة.
        const old = withPoints(); old.boardDate = '2026-11-02';
        old.stages[0].dayKnights.forEach(c => delete c.points); old.stages[0].weekKnights.forEach(c => delete c.points);
        await h.snapshot(old);
        await h.page.waitForFunction(() => document.querySelectorAll('.kpoints').length === 0);
        assert.equal(await h.page.locator('.kpoints').count(), 0);
        assert.deepEqual(await slideOf(h.page, DAY_TITLE).locator('.kname').allTextContents(), ['خالد', 'سالم', 'يزيد', 'وليد']);
        assert.deepEqual(h.errors, []); assert.deepEqual(h.external, []);
    } finally { await h.close(); }
});

// ===== ت4: الثبات — دوال §1ب بنصها في 6e50320 (أخضر قبل البناء وبعده) =====
test('ت4 (ثبات): المحرك والتجميد والمخزن كما هي في 6e50320', () => {
    const lf = text => text.replaceAll('\r\n', '\n');
    const baseHtml = lf(atBase('index.html')), nowHtml = lf(html);
    for (const name of ['knightsDayPointsTenths', 'getDayHalaqaKnights', 'getWeekNominations', 'rankHalaqaWeekKnights', 'buildWeekKnightsRow',
        'dayAcceptedWeightTenths', 'topTiedBy', 'buildRevealSteps', 'dayStats', 'getCumulativeStats', 'getMostImproved',
        'ensureWeekKnightsFrozen', 'knightsEndedWeeks', 'knightsFreezeRow', 'lockWeekRows', 'lockKnightsForMessage',
        'knightsPreviousWeekStart', 'knightsDisplayWeekStart', 'sendGeneralTvSnapshot'])
        assert.equal(source(name, nowHtml), source(name, baseHtml), name);
    const dayPoints = text => text.match(/const dayPoints = .*;/)[0];
    assert.equal(dayPoints(nowHtml), dayPoints(baseHtml), 'dayPoints');
    for (const file of ['general-points.js', 'programs-store.js', 'data-store.js', 'firestore.rules'])
        assert.equal(lf(fs.readFileSync(path.join(root, file), 'utf8')), lf(atBase(file)), file);
});
