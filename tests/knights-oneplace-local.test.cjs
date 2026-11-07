// اختبارات قبول «الفرسان في مكان واحد» (البطاقة: D:/المهره/notes/features/knights/one-place-card.md) — الجزء ١: ف1، ف2، ف3، ف8، ف12.
// كُتبت قبل تعديل كود المنتج، وتُرى حمراء أولاً.
const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { newPage } = require('./helpers/t25-browser.cjs');
const { key } = require('./helpers/knights-r2b-harness.cjs');
let browser;
before(async () => {
    const playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); });
const open = (options = {}) => newPage(browser, { width: 1280, today: key.days[1], ...options });
const RACE_CARD = '[onclick="openSettingsSection(\'setPanelRace\')"]';
const KNIGHTS_CARD = '#settingsGeneralKnightsCard';
const PANEL = '#setPanelGeneralKnights';
const SECTIONS = ['#gkWeek', '#gkCopy', '#gkRising', '#gkSettings', '#gkHelpBtn'];

test('ف1: general settings show the «الفرسان» card and hide «لوحة السباق»; direct open of the race panel is blocked; the knights panel opens with its sections', async () => {
    const h = await open();
    try {
        await h.page.evaluate(() => goHome('page-settings'));
        assert.equal(await h.page.locator(KNIGHTS_CARD).isVisible(), true, 'بطاقة الفرسان ظاهرة');
        assert.equal(await h.page.locator(RACE_CARD).isVisible(), false, 'بطاقة لوحة السباق مخفية');
        await h.page.evaluate(() => openSettingsSection('setPanelRace'));
        assert.equal(await h.page.locator('#setPanelRace.active').count(), 0, 'لا تُفتح لوحة السباق بالاستدعاء المباشر');
        assert.equal(await h.page.locator('#setPanelRace').isVisible(), false);
        await h.page.evaluate(() => openSettingsSection('setPanelGeneralKnights'));
        assert.equal(await h.page.locator(PANEL).isVisible(), true, 'لوحة الفرسان تُفتح');
        for (const id of SECTIONS) assert.equal(await h.page.locator(PANEL + ' ' + id).count(), 1, id + ' موجود داخل اللوحة');
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

test('ف12: summer keeps «لوحة السباق» visible and openable, and has no general knights card', async () => {
    const h = await open({ program: 'summer' });
    try {
        await h.page.evaluate(() => goHome('page-settings'));
        assert.equal(await h.page.locator(RACE_CARD).isVisible(), true);
        await h.page.evaluate(() => openSettingsSection('setPanelRace'));
        assert.equal(await h.page.locator('#setPanelRace.active').count(), 1);
        assert.equal(await h.page.locator(KNIGHTS_CARD + ':visible').count(), 0);
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

test('ف2: general home leaders box renders without the «افتح لوحة السباق» link; summer keeps it', async () => {
    const g = await open();
    try {
        const r = await g.page.evaluate(() => { renderHomeLeaders(); return { rows: document.querySelectorAll('#homeLead .hs-row').length, all: document.querySelectorAll('#homeLead .hs-all').length }; });
        assert.ok(r.rows > 0, 'صندوق المتصدرين يعرض صفوفاً');
        assert.equal(r.all, 0, 'لا رابط لوحة السباق في general');
        assert.deepEqual(g.errors, []);
    } finally { await g.close(); }
    const s = await open({ program: 'summer' });
    try {
        const r = await s.page.evaluate(() => { renderHomeLeaders(); return { rows: document.querySelectorAll('#homeLead .hs-row').length, all: document.querySelectorAll('#homeLead .hs-all').length }; });
        if (r.rows > 0) assert.equal(r.all, 1, 'الرابط باقٍ في الصيفي');
        assert.deepEqual(s.errors, []);
    } finally { await s.close(); }
});

test('ف3: general «رسائل الأسبوع» has no knights buttons or review host; both live inside the knights panel; the week picker stays', async () => {
    const h = await open();
    try {
        await h.page.evaluate(() => { goHome('page-records'); openRecordsSection('recPanelAbsence'); });
        assert.equal(await h.page.locator('#recPanelAbsence .general-knights-actions').count(), 0);
        assert.equal(await h.page.locator('#recPanelAbsence #weekKnightsReview').count(), 0);
        assert.equal(await h.page.locator('#recPanelAbsence [onclick*="renderWeekKnightsReview"]').count(), 0);
        assert.equal(await h.page.locator('#recPanelAbsence [onclick*="copyWeeklyKnightsAnnouncement"]').count(), 0);
        assert.equal(await h.page.locator('#generalMessageWeek').count(), 1, 'منتقي الأسبوع باقٍ للرسائل');
        await h.page.evaluate(() => { goHome('page-settings'); openSettingsSection('setPanelGeneralKnights'); });
        assert.equal(await h.page.locator(PANEL + ' #gkWeek #weekKnightsReview').count(), 1, 'جدول المراجعة داخل قسم الأسبوع');
        assert.equal(await h.page.locator(PANEL + ' #gkCopy button').count(), 1, 'زر النسخ داخل قسم النسخ');
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

test('ف8: knights settings live in the knights panel only; saving them persists; saving the program form keeps them untouched', async () => {
    const h = await open();
    try {
        await h.page.evaluate(() => {
            window.almahraPrograms.updateSettings = async (id, settings) => {
                window.__fixture.programs[id].settings = settings;
                window.__fixture.writes.push({ settings: structuredClone(settings) });
                return { success: true };
            };
            window.almahraPrograms.getAllStudents = async () => window.__fixture.list;
            window.almahraData.getStudents = () => window.__fixture.list;
            goHome('page-settings'); openSettingsSection('setPanelProgram');
        });
        assert.equal(await h.page.locator('#setPanelProgram #psKnights_a, #setPanelPoints #psKnights_a').count(), 0, 'عدد الفرسان ليس في نموذج البرنامج ولا في النقاط والمعايير');
        assert.equal(await h.page.locator('#setPanelProgram #psTrWeeklyAtt, #setPanelPoints #psTrWeeklyAtt').count(), 0, 'نسبة الحضور ليست في نموذج البرنامج ولا في النقاط والمعايير');
        // حفظ نموذج البرنامج قبل أن تُرسم لوحة الفرسان: لا حقول في الصفحة، فيجب أن تبقى القيم المحفوظة كما هي (يكشف تصفير النسبة ورمي readKnightsPerHalaqa).
        const initial = await h.page.evaluate(() => structuredClone(window.almahraPrograms.getSettings().titleRules));
        await h.page.evaluate(async () => { await saveProgramSettings(); });
        await h.page.waitForFunction(() => window.__fixture.writes.some(w => w.settings));
        let first = await h.page.evaluate(() => window.__fixture.writes.filter(w => w.settings).at(-1).settings.titleRules);
        assert.deepEqual(first.knightsPerHalaqa || null, initial.knightsPerHalaqa || null, 'عدد الفرسان كما كان قبل أي رسم للوحة');
        assert.equal(first.weeklyAttendancePct, initial.weeklyAttendancePct ?? 75, 'نسبة الحضور لم تُصفَّر');
        await h.page.evaluate(() => openSettingsSection('setPanelGeneralKnights'));
        await h.page.click(PANEL + ' #gkSettings summary');
        assert.equal(await h.page.locator(PANEL + ' #gkSettings #psKnights_a').count(), 1);
        assert.equal(await h.page.locator(PANEL + ' #gkSettings #psTrWeeklyAtt').count(), 1);
        await h.page.fill(PANEL + ' #psKnights_a', '2');
        await h.page.fill(PANEL + ' #psTrWeeklyAtt', '50');
        const beforeKnights = await h.page.evaluate(() => window.__fixture.writes.length);
        await h.page.click(PANEL + ' #gkSaveBtn');
        await h.page.waitForFunction(n => window.__fixture.writes.length > n, beforeKnights);
        let saved = await h.page.evaluate(() => window.__fixture.writes.filter(w => w.settings).at(-1).settings.titleRules);
        assert.equal(saved.knightsPerHalaqa.a, 2);
        assert.equal(saved.weeklyAttendancePct, 50);
        const before = await h.page.evaluate(() => window.__fixture.writes.length);
        await h.page.evaluate(async () => { openSettingsSection('setPanelProgram'); await saveProgramSettings(); });
        await h.page.waitForFunction(n => window.__fixture.writes.length > n, before);
        saved = await h.page.evaluate(() => window.__fixture.writes.filter(w => w.settings).at(-1).settings.titleRules);
        assert.equal(saved.knightsPerHalaqa.a, 2, 'حفظ نموذج البرنامج لا يمس عدد الفرسان');
        assert.equal(saved.weeklyAttendancePct, 50, 'حفظ نموذج البرنامج لا يصفّر نسبة الحضور');
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

test('ف12ب: after visiting the general knights panel and switching to summer (read-only in production), only the summer attendance field remains, with the summer value; nothing from the knights panel leaks', async () => {
    const h = await open();
    try {
        await h.page.evaluate(() => { goHome('page-settings'); openSettingsSection('setPanelGeneralKnights'); });
        await h.page.click(PANEL + ' #gkSettings summary');
        assert.equal(await h.page.locator(PANEL + ' #psTrWeeklyAtt').count(), 1);
        await h.page.fill(PANEL + ' #psTrWeeklyAtt', '33'); // قيمة مميزة غير محفوظة: لو بقي الحقل بعد المغادرة لظهرت
        await h.page.evaluate(() => { window.almahraPrograms.openProgram('summer'); });
        await h.page.evaluate(() => { goHome('page-settings'); openSettingsSection('setPanelPoints'); });
        const state = await h.page.evaluate(() => ({
            all: document.querySelectorAll('#psTrWeeklyAtt').length,
            inPoints: document.querySelectorAll('#setPanelPoints #psTrWeeklyAtt').length,
            value: document.getElementById('psTrWeeklyAtt')?.value,
            expected: String(window.almahraPrograms.getSettings().titleRules?.weeklyAttendancePct ?? 75),
            leaked: document.querySelectorAll('[id^="psKnights_"], #gkSaveBtn, #gkSettingsBody *').length
        }));
        assert.equal(state.all, 1, 'معرّف واحد فقط في الصفحة بعد مغادرة general');
        assert.equal(state.inPoints, 1, 'الحقل الباقي هو حقل الصيفي في النقاط والمعايير');
        assert.equal(state.value, state.expected, 'قيمته قيمة الصيفي لا 33 التي كُتبت في لوحة الفرسان');
        assert.equal(state.leaked, 0, 'لا بقايا من لوحة الفرسان في الصفحة');
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});
