// بطاقة «ج»: إيقاف شاشة التلفاز في العشاء من الإقامة لا من الأذان (أمثلة القبول ق1–ق8).
// اختبار أحمر قبل البناء: بيانات وهمية، متصفح حقيقي بساعة مزيّفة (page.clock)، بلا شبكة خارجية، ولا منفذ محلي.
// ق4 (المغرب كما هو) وق5 (السلوك القديم) تنجحان قبل البناء وتبقيان بعده؛ الباقي يفشل حتى تُبنى الميزة.
// ق9 (بوابة القارئ الغريب) وق10 (المجموعة الكاملة) خارج هذا الملف.
const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { source, html, copy, root } = require('./helpers/quick-entry-harness.cjs');
const { installTv } = require('./helpers/tv-harness.cjs');
const adhan = require('../vendor/adhan-4.4.3.umd.js');

const DATE = '2026-11-01', MIN = 60000;
// أذان المغرب والعشاء من المكتبة مباشرة ليوم ثابت (كما يفعل step8c)، لا من tv.js.
const direct = new adhan.PrayerTimes(new adhan.Coordinates(20.14804, 40.27224), new Date(2026, 10, 1, 12), adhan.CalculationMethod.UmmAlQura());
const M = +direct.maghrib, S = +direct.isha;
const ISHA_START = S + 20 * MIN, ISHA_END = S + 30 * MIN; // مع الإعدادات الابتدائية 20/10

let browser;
before(async () => {
    const playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); });

const NEW_PRAYER = { maghribMinutes: 20, ishaMinutes: 30, ishaIqamaMinutes: 20, ishaPrayerMinutes: 10 };
const snapshot = prayer => ({ type: 'snapshot', boardDate: DATE, prayer, stages: [
    { period: 'asr', name: 'ابتدائي', board: [{ name: 'طالب العصر', points: 10, week: 5, rank: 1 }] },
    { period: 'maghrib', name: 'متوسط وثانوي', board: [{ name: 'طالب المغرب', points: 42, week: 22.5, rank: 1 }] }] });
const celebrate = (id, name = 'طالب مغرب') => ({ type: 'celebrate', id, period: 'maghrib', name, added: 5, total: 47, rank: 2 });

// تُفتح الصفحة والساعة متوقفة عند اللحظة loadAt؛ فيبدأ فحص الـ20 ثانية من تلك اللحظة تماماً (طور معروف).
async function openTv(loadAt, prayer, earlyTimers = false) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
    const page = await context.newPage(), external = [], errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== 'http://tv.test') { external.push(url.href); return route.abort('internetdisconnected'); }
        const file = path.resolve(root, decodeURIComponent(url.pathname.slice(1)));
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
        if (earlyTimers && url.pathname === '/tv.js') return route.fulfill({ contentType: 'application/javascript', body:
            'const nativeTimer = window.setTimeout.bind(window); window.setTimeout = (fn, delay, ...args) => nativeTimer(fn, delay > 300000 && delay < 2000000 ? delay - 450 : delay, ...args);\n'
            + fs.readFileSync(file, 'utf8') });
        await route.fulfill({ path: file });
    });
    await page.clock.install({ time: new Date(loadAt - 1000) });
    await page.clock.pauseAt(new Date(loadAt));
    await page.goto('http://tv.test/tv.html');
    await page.waitForFunction(() => document.getElementById('clock')?.textContent);
    const h = { page, context, external, errors, prayer,
        // نسيج رسائل المشرف: البث غير متزامن، فننتظر وصوله قبل أي فحص سلبي.
        async post(message) {
            await page.evaluate(m => { window.tvTestSender ||= new BroadcastChannel('almahra-tv'); window.tvTestSender.postMessage(m); }, message);
            await new Promise(resolve => setTimeout(resolve, 60));
        },
        now: () => page.evaluate(() => Date.now()),
        // يتقدّم بالساعة المزيّفة ويرسل لقطة نبض كل 30 ثانية كالمشرف الحقيقي (وإلا تمحو الشاشة بياناتها بعد 90 ثانية).
        async advanceTo(target) {
            for (let now = await h.now(); now < target; now = await h.now()) {
                await page.clock.runFor(Math.min(30000, target - now));
                if (await h.now() < target) await h.post(snapshot(h.prayer));
            }
        },
        async view() {
            return page.evaluate(() => ({
                blocked: !document.getElementById('prayer').hidden, prayerText: document.getElementById('prayerText').textContent,
                content: !document.getElementById('content').hidden, celebration: !document.getElementById('celebration').hidden,
                celeName: document.getElementById('celeName').textContent,
                slide: document.querySelector('.slide.active .name')?.textContent ?? null,
            }));
        },
        close: () => context.close() };
    await h.post(snapshot(prayer));
    await page.waitForFunction(() => document.querySelector('.leader'));
    return h;
}
async function expectBlocked(h, name, label) {
    const v = await h.view();
    assert.equal(v.blocked, true, label + ': الشاشة يجب أن تكون محجوبة');
    assert.equal(v.prayerText, 'حان وقت صلاة ' + name, label); assert.equal(v.content, false, label); assert.equal(v.celebration, false, label);
}
async function expectShowing(h, label, slide = 'طالب المغرب') {
    const v = await h.view();
    assert.equal(v.blocked, false, label + ': الشاشة يجب أن تعرض لا أن تحجب'); assert.equal(v.content, true, label);
    assert.equal(v.slide, slide, label);
}

test('ق1: إعدادات 20/10، عند س+5 الشاشة تعرض وتحتفل بتسجيل لطالب حلقة مغرب', async () => {
    const h = await openTv(S + 5 * MIN, NEW_PRAYER);
    try {
        await expectShowing(h, 'س+5');
        await h.post(celebrate('isha-e1', 'سعد فهد ناصر'));
        const v = await h.view();
        assert.equal(v.blocked, false); assert.equal(v.celebration, true, 'الاحتفال يجب أن يظهر قبل الإقامة');
        assert.equal(v.celeName, 'سعد فهد ناصر');
        assert.deepEqual(h.errors, []); assert.deepEqual(h.external, []);
    } finally { await h.close(); }
});

test('ق2: عند س+20 تماماً حجب «حان وقت صلاة العشاء»؛ الاحتفال الجاري يتوقف والطابور يُمسح', async () => {
    const h = await openTv(S + 5 * MIN + 7000, NEW_PRAYER); // طور الفحص الدوري: س+20 لا يقع قرب نبضة
    try {
        await expectShowing(h, 'س+5');
        await h.advanceTo(ISHA_START - 3000);
        for (const id of ['q1', 'q2', 'q3']) await h.post(celebrate(id));
        let v = await h.view();
        assert.equal(v.celebration, true); assert.equal(v.blocked, false);
        await h.page.clock.runFor(2000); // س+19:59: ما زال الاحتفال جارياً بلا حجب
        v = await h.view(); assert.equal(v.blocked, false, 'قبل الإقامة بثانية لا حجب'); assert.equal(v.celebration, true);
        await h.page.clock.runFor(2000); // س+20:01
        await expectBlocked(h, 'العشاء', 'س+20');
        await h.advanceTo(ISHA_END + 25000); // بعد الصلاة لا يعود احتفال قديم
        v = await h.view(); assert.equal(v.blocked, false); assert.equal(v.celebration, false, 'الجاري سقط عند الحجب ولا يعود بعد الصلاة');
        // الطابور مُسح عند الحجب: أول احتفال جديد بعد الصلاة يظهر هو لا q2 / q3 القديمين.
        await h.post(celebrate('after-prayer', 'طالب جديد'));
        v = await h.view(); assert.equal(v.celebration, true); assert.equal(v.celeName, 'طالب جديد', 'الطابور يُمسح عند الحجب');
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

test('ق3: عند س+30 تعود الشاشة خلال ≤ 2 ثانية بلا انتظار دورة الـ20 ث، وتحتفل بتسجيل جديد', async () => {
    // طور الفحص الدوري: ضرباته عند س+30-13 ث وس+30+7 ث، فلا ضربة في أول ثانيتين بعد س+30.
    const h = await openTv(S + 5 * MIN + 7000, NEW_PRAYER);
    try {
        await h.advanceTo(ISHA_END - 500);
        await expectBlocked(h, 'العشاء', 'قبل نهاية الصلاة بنصف ثانية');
        await h.page.clock.runFor(2000); // س+30 و1.5 ثانية
        await expectShowing(h, 'س+30 و1.5 ث');
        await h.post(celebrate('isha-after'));
        const v = await h.view(); assert.equal(v.celebration, true, 'الاحتفال بتسجيل جديد بعد العودة'); assert.equal(v.blocked, false);
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

// الحجب من منتصف البداية إلى النهاية؛ هوامش +21 ث تتسع لدورة الفحص القديمة (20 ث) فيصلح المقياس قبل البناء وبعده.
async function windowTimeline(h, name, from, to, extra = [], slideBefore = 'طالب المغرب') {
    await expectShowing(h, name + ' قبل البداية', slideBefore);
    await h.advanceTo(from + 21000); await expectBlocked(h, name, name + ' بعد البداية');
    for (const offset of extra) { await h.advanceTo(from + offset); await expectBlocked(h, name, name + ' +' + offset / MIN + 'د'); }
    await h.advanceTo(to - 1000); await expectBlocked(h, name, name + ' قبل النهاية بثانية');
    await h.advanceTo(to + 21000); await expectShowing(h, name + ' بعد النهاية');
}

test('ق4: المغرب كما هو: حجب من م إلى م+20 بلا تغيير (لقطة بالحقول الأربعة)', async () => {
    const h = await openTv(M - 60000, NEW_PRAYER);
    try {
        await windowTimeline(h, 'المغرب', M, M + 20 * MIN, [10 * MIN], 'طالب العصر');
        await h.advanceTo(M + 25 * MIN); await expectShowing(h, 'م+25');
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

test('ق5: لقطة بلا الحقلين الجديدين وishaMinutes 30: حجب من س إلى س+30 (السلوك القديم)', async () => {
    const h = await openTv(S - 60000, { maghribMinutes: 20, ishaMinutes: 30 });
    try {
        await windowTimeline(h, 'العشاء', S, S + 30 * MIN, [5 * MIN, 25 * MIN]);
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

test('ق6: إقامة 0 ودقائق صلاة 30 تطابق ق5 (الصفر لا يضيع) حتى مع ishaMinutes قديم مختلف', async () => {
    const h = await openTv(S - 60000, { maghribMinutes: 20, ishaMinutes: 45, ishaIqamaMinutes: 0, ishaPrayerMinutes: 30 });
    try {
        await windowTimeline(h, 'العشاء', S, S + 30 * MIN, [5 * MIN, 25 * MIN]);
        await h.advanceTo(S + 37 * MIN); await expectShowing(h, 'س+37: ishaMinutes القديم لا يُقرأ حين يوجد الجديدان');
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

// ----- ق7 وق8: واجهة index.html بحاضن الدوال الحقيقية (بلا شبكة) -----
function board() {
    const state = { program: 'general', seasonId: 's1', ready: true, sent: [], timers: [], settings: {
        points: { attendance: 0 }, stages: [{ id: 'a', name: 'مرحلة أولى', period: 'asr' }, { id: 'b', name: 'مرحلة ثانية', period: 'maghrib' }],
        halaqas: [{ id: 'ha', stageId: 'a', active: true }, { id: 'hb', stageId: 'b', active: true }],
        grades: [], kindMult: {}, absence: [], criteria: [], workingDays: [0, 1, 2, 3, 4], features: { tiers: false } },
        season: { termStart: '2026-10-01', termEnd: '2026-12-31', calendar: [] }, daily: {}, weekly: {}, approved: [], cards: {} };
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, { value: '', innerHTML: '', textContent: '', style: {}, classList: { toggle(name, on) { this[name] = on; } } });
        return elements.get(id);
    };
    const programs = { getCurrentProgramId: () => state.program, getCurrentSeasonId: () => state.seasonId,
        getCurrentSeason: () => state.season, getSettings: () => state.settings, getCurrentProgram: () => ({ name: 'وهمي' }),
        isFeatureEnabled: name => state.settings.features?.[name] !== false, PROGRAM_DEFS: { general: { defaultSettings: state.settings } } };
    const ctx = vm.createContext({ console, Date, Intl, structuredClone, document: { getElementById: element },
        window: { almahraPrograms: programs, almahraAuth: { currentUser: { uid: 'fake-admin' } },
            almahraData: { isReady: () => state.ready, getActiveProgramId: () => state.program, getActiveSeasonId: () => state.seasonId } },
        getCumulativeStats: s => ({ tripPoints: s.points || 0 }),
        summarizeRange: (s, dates) => dates.at(-1) >= '2026-11-01' ? s.now || { points: 0, attended: 0 } : s.past || { points: 0, attended: 0 },
        getDayTitleCandidates: (date, stage) => state.daily[stage ?? 'all'] || [], getWeekTitleCandidates: stage => state.weekly[stage ?? 'all'] || [],
        getActiveCriteria: () => [], getDisciplineStars: () => ({ stars: [], daysCount: 0 }), generalIncompleteAttendanceHtml: () => '',
        hbSetCard: (id, data) => { state.cards[id] = data; }, hbCount: n => String(n), hbN: n => String(n),
        hbWinnerRow: name => name, hbTier: name => name, hbDuo: () => '', buildAchievementText: () => '',
        setInterval: (fn, ms) => { state.timers.push({ fn, ms }); return state.timers.length; }, clearInterval() {}, showToast: msg => { state.toast = msg; } });
    const run = code => vm.runInContext(code, ctx);
    const install = (...names) => names.forEach(name => run(source(name, html)));
    ctx.fixtures = []; ctx.approved = state.approved;
    run("let students = fixtures, todayStr = '2026-11-05', honorKnightsLog = approved; const ALL_DAY_NAMES = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];");
    install('isGeneralProgram', 'getProgramSettings', 'getTiers', 'tiersFeatureOn', 'isWorkingDay', 'schoolCivilDate',
        'isSeasonCalendarComplete', 'getSchoolDayInfo', 'getGeneralSchoolDates', 'formatDateLocal', 'getWeekStartDate', 'addDaysToDateStr',
        'getBoardDate', 'getBoardWeekRange', 'getWorkingDatesInRange', 'topTied', 'getStudentRank', 'getMostImproved',
        'getSeasonLeaders', 'getApprovedKnightsForMode', 'getKnightWinCounts', 'getTitleRules', 'hbEmpty', 'renderHonorBoard', 'roundPointTotal');
    installTv(run, install);
    run('getApprovedRisingStars = () => [];');
    return { state, ctx, run, install, element, snapshot: () => copy(run('getGeneralTvSnapshot()')) };
}

// تُرسم صفحة الإعدادات الحقيقية (renderProgramSettings) بإعدادات تلفاز معطاة، ويُعاد HTML اللوحات.
function renderSettings(tvPrayer) {
    const settings = { teachers: [], stages: [{ id: 'g1', name: 'مرحلة وهمية' }], halaqas: [], points: { attendance: 0 },
        kindMult: { newMemorization: 1, review: 1 }, grades: [{ id: 'good', name: 'جيد', percent: 100 }], criteria: [], features: {} };
    if (tvPrayer) settings.tvPrayer = tvPrayer;
    const els = new Map();
    const element = id => { if (!els.has(id)) els.set(id, { value: '', innerHTML: '', textContent: '', style: {}, classList: { add() {}, remove() {}, toggle() {} } }); return els.get(id); };
    const programs = { getCurrentProgram: () => ({ id: 'general', name: 'عام', settings }), getCurrentSeasonId: () => 's1',
        getCurrentSeason: () => ({ id: 's1', name: 'موسم وهمي', startDate: '2026-10-01' }), getSeasons: () => [], getSettings: () => settings,
        getCurrentProgramId: () => 'general', PROGRAM_DEFS: { general: { defaultSettings: settings } } };
    const ctx = vm.createContext({ console, structuredClone, Intl, Date, document: { getElementById: element, querySelectorAll: () => [] },
        window: { almahraPrograms: programs }, DAY_NAMES: [], FEATURE_LABELS: {}, isWriteLockedView: () => false, getTitleRules: () => ({}),
        renderCriteriaRows() {}, renderTierRows() {}, fillFarsModeSelect() {}, renderGeneralKnightsPanel() {}, updateSettingsBadges() {},
        refreshGeneralHalaqaOptions() {}, renderSeasonCalendar: () => '', seasonCalendarDraft: null, escapeHTML: v => String(v ?? '') });
    const run = code => vm.runInContext(code, ctx);
    run('let students = [], generalSettingsHalaqaBaseline = null;');
    for (const name of ['isGeneralProgram', 'generalPerformanceSettings', 'renderProgramSettings', 'generalSettingRow', 'generalHalaqaRow', 'archivedBannerHtml', 'saveBarHtml']) run(source(name, html));
    run('renderProgramSettings()');
    return ['psPanelProgramBody', 'psPanelPointsBody', 'psPanelTiersBody'].map(id => element(id).innerHTML).join('\n');
}
// الخانة بنص ظاهر: أول input يلي النص (الخانات الحالية label يحيط بـinput)، وتُعاد وسوم القيمة والحدين.
function fieldAfter(markup, labelText) {
    const at = markup.indexOf(labelText);
    assert.ok(at >= 0, 'نص الخانة غير موجود في الإعدادات: ' + labelText);
    const tag = /<input\b[^>]*>/.exec(markup.slice(at, at + 700));
    assert.ok(tag, 'لا خانة إدخال بعد النص: ' + labelText);
    const attr = name => new RegExp(`\\b${name}="([^"]*)"`).exec(tag[0])?.[1];
    return { id: attr('id'), value: attr('value'), min: attr('min'), max: attr('max') };
}
const IQAMA_LABEL = 'الإقامة بعد أذان العشاء (دقيقة)', PRAYER_LABEL = 'توقف الشاشة من إقامة العشاء (دقيقة)';
const EXAMPLE = 'مثال: أذان العشاء 6:30 والإقامة بعد 20 دقيقة والتوقف 10 دقائق؛ الشاشة تعمل حتى 6:50 وتعود 7:00';

test('ق7: خانتا الإقامة والصلاة بالقيمتين الابتدائيتين 20 و10، والتحقق 0–60 و5–90، والحفظ يكتب الأربعة', () => {
    // 1) القيم الابتدائية لإعدادات لا تحملهما (لا tvPrayer، أو قديمة بلا الحقلين)، والصفر المحفوظ لا يضيع.
    for (const stored of [undefined, { maghribMinutes: 20, ishaMinutes: 30 }]) {
        const markup = renderSettings(stored);
        const iqama = fieldAfter(markup, IQAMA_LABEL), prayer = fieldAfter(markup, PRAYER_LABEL);
        assert.equal(iqama.value, '20'); assert.equal(prayer.value, '10');
        assert.deepEqual([iqama.min, iqama.max, prayer.min, prayer.max], ['0', '60', '5', '90']);
        assert.doesNotMatch(markup, /id="psTvIsha"/, 'خانة العشاء القديمة تُستبدل بالخانتين');
        assert.match(markup, /id="psTvMaghrib"/);
        assert.ok(markup.includes(EXAMPLE), 'سطر المثال حرفياً');
    }
    const saved = renderSettings({ maghribMinutes: 20, ishaMinutes: 30, ishaIqamaMinutes: 0, ishaPrayerMinutes: 15 });
    assert.equal(fieldAfter(saved, IQAMA_LABEL).value, '0'); assert.equal(fieldAfter(saved, PRAYER_LABEL).value, '15');
    const ids = fieldAfter(renderSettings(), IQAMA_LABEL).id, prayerId = fieldAfter(renderSettings(), PRAYER_LABEL).id;
    // 2) التحقق، بدالة القراءة الحقيقية: الإقامة 0–60 صحيحة، والصلاة 5–90 صحيحة، والمغرب 5–90 كما هو.
    const h = board();
    const set = (maghrib, iqama, prayer) => { h.element('psTvMaghrib').value = maghrib; h.element(ids).value = iqama; h.element(prayerId).value = prayer; };
    const read = () => copy(h.run('readGeneralTvPrayer()'));
    for (const bad of ['61', '-1', '', '20.5', 'abc']) { set('20', bad, '10'); assert.throws(read, /\S/, 'إقامة ' + bad); }
    const message = () => { try { read(); assert.fail('القيمة غير الصحيحة قُبلت'); } catch (error) { return error.message; } };
    for (const bad of ['4', '91', '', '10.5', 'abc']) { set('20', '20', bad); assert.equal(message(), 'توقف الشاشة من إقامة العشاء: عدد صحيح من 5 إلى 90 دقيقة', 'صلاة ' + bad); }
    set('4', '20', '10'); assert.equal(message(), 'مدة توقف شاشة العرض: عدد صحيح من 5 إلى 90 دقيقة', 'المغرب 4');
    assert.throws(() => { set('20', '61', '10'); read(); }, /\S/, 'الرفض برسالة');
    // 3) الأربعة تُكتب: الحقول الجديدة من الخانتين، والقديم ishaMinutes يبقى مخزوناً كما هو (30 إن لم يوجد).
    set('20', '0', '5'); assert.deepEqual(read(), { maghribMinutes: 20, ishaMinutes: 30, ishaIqamaMinutes: 0, ishaPrayerMinutes: 5 });
    set('15', '60', '90'); h.state.settings.tvPrayer = { maghribMinutes: 15, ishaMinutes: 40 };
    assert.deepEqual(read(), { maghribMinutes: 15, ishaMinutes: 40, ishaIqamaMinutes: 60, ishaPrayerMinutes: 90 });
    // 4) الحفظ يمرّر نتيجة القراءة كلها إلى الإعدادات.
    const save = source('saveProgramSettings', html);
    assert.match(save, /tvPrayer = readGeneralTvPrayer\(\)/); assert.match(save, /kindMult, grades, tvPrayer,/);
});

test('ق8: اللقطة من index.html تحمل المفاتيح الأربعة بالترتيب المتوقع، والصفر والقيم المخزنة تمر', () => {
    const keys = ['maghribMinutes', 'ishaMinutes', 'ishaIqamaMinutes', 'ishaPrayerMinutes'];
    const h = board();
    let s = h.snapshot();
    assert.deepEqual(Object.keys(s.prayer), keys); assert.deepEqual(s.prayer, NEW_PRAYER);
    h.state.settings.tvPrayer = { maghribMinutes: 15, ishaMinutes: 40, ishaIqamaMinutes: 25, ishaPrayerMinutes: 12 };
    s = h.snapshot(); assert.deepEqual(Object.keys(s.prayer), keys);
    assert.deepEqual(s.prayer, { maghribMinutes: 15, ishaMinutes: 40, ishaIqamaMinutes: 25, ishaPrayerMinutes: 12 });
    h.state.settings.tvPrayer = { maghribMinutes: 15, ishaMinutes: 40, ishaIqamaMinutes: 0, ishaPrayerMinutes: 30 };
    assert.deepEqual(h.snapshot().prayer, { maghribMinutes: 15, ishaMinutes: 40, ishaIqamaMinutes: 0, ishaPrayerMinutes: 30 }, 'الصفر لا يضيع (?? لا ||)');
    h.state.settings.tvPrayer = { maghribMinutes: 15, ishaMinutes: 40 }; // إعدادات قديمة بلا الحقلين
    assert.deepEqual(h.snapshot().prayer, { maghribMinutes: 15, ishaMinutes: 40, ishaIqamaMinutes: 20, ishaPrayerMinutes: 10 });
});

test('ق9: نصا العشاء وسطر المثال واضحون وحرفيون في صفحة الإعدادات', () => {
    const markup = renderSettings();
    assert.ok(markup.includes(IQAMA_LABEL));
    assert.ok(markup.includes(PRAYER_LABEL));
    assert.ok(markup.includes(EXAMPLE));
});

test('ق10: الفئة 30 تسجل ملفي المنتج والاختبار المضاف ببصماتها الحالية', () => {
    const crypto = require('node:crypto');
    const audit = require('./rules/design-expectation-audit.json').tvIshaIqama;
    const sha = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n')).digest('hex');
    for (const file of ['tv.js', 'index.html']) assert.equal(audit.changes.find(row => row.file === file)?.sha256, sha(file), file);
    assert.equal(audit.addedFiles.find(row => row.file === 'tests/tv-isha-iqama-local.test.cjs')?.sha256,
        sha('tests/tv-isha-iqama-local.test.cjs'));
});

test('ق11: حواف الخانات الثلاث متساوية والفراغ بينها 12 عند 1280', async () => {
    const markup = renderSettings();
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
        const rows = [...markup.matchAll(/<label class="([^"]*)"><span class="([^"]*)">([^<]*)<\/span>\s*(<input\b[^>]*>)\s*<\/label>/g)]
            .filter(m => ['psTvMaghrib', 'psTvIshaIqama', 'psTvIshaPrayer'].some(id => m[4].includes(`id="${id}"`)));
        assert.equal(rows.length, 3, 'الصفوف الثلاثة بالبنية نفسها');
        for (const row of rows) {
            assert.equal(row[1], 'flex items-center gap-3 mb-3 text-sm font-bold text-slate-600');
            assert.equal(row[2], 'w-60');
            assert.match(row[4], /class="shrink-0 w-20 /);
        }
        await page.setContent(`<style>body{direction:rtl}.flex{display:flex}.items-center{align-items:center}.gap-3{gap:12px}.w-60{width:240px}.w-20{width:80px}.shrink-0{flex-shrink:0}</style><div>${rows.map(r => r[0]).join('')}</div>`);
        const boxes = await page.locator('label').evaluateAll(labels => labels.map(label => {
            const span = label.querySelector('span').getBoundingClientRect(), input = label.querySelector('input').getBoundingClientRect();
            return { left: input.left, right: input.right, gap: span.left - input.right };
        }));
        assert.ok(Math.max(...boxes.map(b => b.left)) - Math.min(...boxes.map(b => b.left)) <= 1);
        assert.ok(Math.max(...boxes.map(b => b.right)) - Math.min(...boxes.map(b => b.right)) <= 1);
        for (const box of boxes) assert.equal(box.gap, 12);
    } finally { await page.close(); }
});

test('ق12: مؤقت يُطلَق مبكراً لا يؤخر الحجب أو العودة أكثر من ثانيتين', async () => {
    const h = await openTv(S + 5 * MIN + 7000, NEW_PRAYER, true);
    try {
        await h.advanceTo(ISHA_START + 1500);
        await expectBlocked(h, 'العشاء', 'بعد الإقامة بـ1.5 ثانية');
        await h.advanceTo(ISHA_END + 1500);
        await expectShowing(h, 'بعد الصلاة بـ1.5 ثانية');
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});
