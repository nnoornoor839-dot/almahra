// مسودة اختبارات قبول الجزء ٢ (ف4، ف6، ف7، ف11) — تُنقل إلى tests/ بعد اعتماد الجزء ١. تُرى حمراء قبل البناء.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cloud, runtime, key } = require('./helpers/knights-r2b-harness.cjs');
const { root } = require('./helpers/quick-entry-harness.cjs');
const DAY = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const dayName = ds => DAY[new Date(ds + 'T12:00:00Z').getUTCDay()];
const faces = (tenths, mult) => (tenths / (150 * mult)).toFixed(1);
const strip = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('ف4/ف11: review table reads the frozen row only: day names, faces (not tenths), points, one-sentence status, no ISO dates, no teacher name', async () => {
    const server = cloud(); const h = runtime(server); await h.frozen();
    await h.call('renderWeekKnightsReview');
    const html = h.element('weekKnightsReview').innerHTML, text = strip(html);
    for (const head of ['الطالب', 'فارس اليوم', 'الحفظ المقبول', 'النقاط', 'الحال']) assert.ok(html.includes('<th>' + head + '</th>'), 'رأس ' + head);
    assert.ok(!/أعشار|الوزن|الأهلية|الرتبة|سبب إعادة الحسم|أُعلن الأسبوع/.test(text), 'لا مصطلحات قديمة');
    assert.ok(!/<t[dh][^>]*>[^<]*\d{4}-\d{2}-\d{2}/.test(html), 'لا تاريخ 2026-11-15 داخل الجدول');
    assert.ok(!/٪ <|\d{2}-\d{2}|joinedOn|حاجبة|يومين/.test(text), 'لا صيغة خام في الحال: ' + text.slice(0, 200));
    const rows = h.rows();
    // كل قيم الأوجه الصحيحة في الصفحة، حتى لا يُحسب رقم صحيح لطالب آخر رقماً خاماً
    const correctFaces = new Set(rows.flatMap(r => r.nominees.flatMap(s => [s.weightMultipliers.new && faces(s.weightTenths.new, s.weightMultipliers.new), s.weightMultipliers.review && faces(s.weightTenths.review, s.weightMultipliers.review)]).filter(Boolean)));
    for (const row of rows) {
        assert.ok(html.includes('data-halaqa="' + row.halaqaId + '"'), 'قسم الحلقة ' + row.halaqaId);
        assert.ok(!text.includes(row.teacherName), 'لا اسم معلم: ' + row.teacherName);
        for (const s of row.nominees) {
            const days = (s.nominations.length === 1 ? 'يوم' : s.nominations.length === 2 ? 'يومان' : s.nominations.length + ' أيام') + ' (' + s.nominations.map(dayName).join('، ') + ')';
            assert.ok(text.includes(days), s.name + ': ' + days);
            const mNew = s.weightMultipliers.new, mRev = s.weightMultipliers.review;
            if (s.weightTenths.new > 0 && mNew) { assert.ok(text.includes('جديد ' + faces(s.weightTenths.new, mNew)), s.name + ' جديد بالأوجه'); const raw = (s.weightTenths.new / 150).toFixed(1); if (mNew !== 1 && !correctFaces.has(raw)) assert.ok(!text.includes('جديد ' + raw + ' '), s.name + ': لا رقم الوزن الخام ' + raw); }
            if (s.weightTenths.review > 0 && mRev) assert.ok(text.includes('مراجعة ' + faces(s.weightTenths.review, mRev)), s.name + ' مراجعة بالأوجه');
            assert.ok(!new RegExp('<td>' + s.weightTenths.total + '</td>').test(html), s.name + ': لا رقم أعشار ' + s.weightTenths.total);
            assert.ok(text.includes(String(s.weekPointsTenths / 10)), s.name + ' النقاط');
            if (row.knights.some(k => k.id === s.id)) assert.ok(text.includes('🏆'), s.name + ' فارس');
            else if (!s.eligible) { assert.ok(text.includes('خارج:'), s.name + ' خارج بسبب'); if (s.reasons.some(r => r.startsWith('حضور '))) assert.ok(text.includes('حضر ' + s.attendance.present + ' من ' + s.attendance.schoolDays), s.name + ': «حضر N من M» بالأرقام'); }
            else assert.ok(text.includes('مرشح'), s.name + ' مرشح');
        }
    }
    // لا إعادة حساب: تعديل سجل طالب بعد التجميد لا يغيّر الجدول المعروض
    const first = rows.find(r => r.nominees.length).nominees[0];
    const student = h.run('students').find(s => String(s.id) === String(first.id));
    for (const ds of Object.keys(student.history)) student.history[ds] = { attended: false, absence: 'unexcused' };
    await h.call('renderWeekKnightsReview');
    assert.equal(h.element('weekKnightsReview').innerHTML, html, 'الجدول من السطر المجمَّد وحده');
});

test('ف6: copy preview equals the copied announcement text and does not lock; copy still locks', async () => {
    const server = cloud(); const h = runtime(server); await h.frozen();
    h.install('renderGeneralKnightsCopyPreview', 'buildWeeklyKnightsAnnouncement', 'knightsIdentityOrder');
    const writesBefore = server.state.writes.length;
    await h.call('renderGeneralKnightsCopyPreview');
    assert.equal(server.state.writes.length, writesBefore, 'المعاينة صفر كتابات');
    const preview = h.element('gkCopyPreview').textContent;
    assert.ok(preview.startsWith('فرسان الحلقات للأسبوع الماضي'), 'المعاينة نص الإعلان');
    assert.equal(h.rows().filter(r => r.lockedAt).length, 0, 'المعاينة لا تقفل');
    await h.call('copyWeeklyKnightsAnnouncement');
    assert.equal(h.state.copies[0], preview, 'المنسوخ = المعاينة حرفاً');
    assert.ok(h.rows().filter(r => r.lockedAt).length > 0, 'النسخ يقفل كما كان');
});

test('ف7: rising star section lists names only, per period, from the TV variant of getMostImproved; TV card has no subtitle', async () => {
    const server = cloud(); const h = runtime(server);
    const calls = [];
    h.ctx.getMostImproved = (limit, period) => { calls.push([limit, period]); return period === 'asr' ? [{ student: { name: 'سالم' }, growth: 40 }, { student: { name: 'ماجد' }, growth: 20 }] : [{ student: { name: 'زياد' }, growth: 15 }]; };
    h.install('renderGeneralKnightsRising');
    await h.call('renderGeneralKnightsRising');
    const text = strip(h.element('gkRising').innerHTML);
    assert.deepEqual(calls.sort(), [[3, 'asr'], [3, 'maghrib']]);
    assert.ok(/حلقات العصر:.*سالم.*ماجد/.test(text) && /حلقات المغرب:.*زياد/.test(text), text);
    assert.ok(!/40|20|15|%|٪|يتقدّم/.test(text), 'أسماء فقط');
    const tv = fs.readFileSync(path.join(root, 'tv.js'), 'utf8');
    assert.ok(!tv.includes('يتقدّم على نفسه'), 'بطاقة التلفاز بلا العبارة');
});

// ف14 (قرار المالك ٢٠٢٦-١١-٠٨ «أخفِهم»: إخفاء في general، والقيم المحفوظة تبقى): لا صندوق «السباق التحفيزي» ولا خانة «لوحة الشرف» في نموذج البرنامج في general؛ والحفظ لا يمسّهما.
const { before: beforeAll, after: afterAll } = require('node:test');
const { newPage } = require('./helpers/t25-browser.cjs');
let browser;
beforeAll(async () => {
    const playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
afterAll(async () => { await browser?.close(); });
const openPage = (options = {}) => newPage(browser, { width: 1280, today: key.days[1], ...options });

test('ف14: general program form has no race box and no honor-board feature checkbox; saving keeps raceName/raceSubtitle/features.honorBoard untouched; summer keeps all three', async () => {
    const g = await openPage();
    try {
        await g.page.evaluate(() => {
            window.almahraPrograms.updateSettings = async (id, settings) => {
                window.__fixture.programs[id].settings = settings;
                window.__fixture.writes.push({ id, settings: structuredClone(settings) });
                return { success: true };
            };
            window.almahraPrograms.getAllStudents = async () => window.__fixture.list;
            window.almahraData.getStudents = () => window.__fixture.list;
            const s = window.__fixture.programs.general.settings;
            s.raceName = 'اسم محفوظ'; s.raceSubtitle = 'وصف محفوظ'; s.features = { ...(s.features || {}), honorBoard: true };
            goHome('page-settings'); openSettingsSection('setPanelProgram');
        });
        assert.equal(await g.page.locator('#setPanelProgram #psRaceName, #setPanelProgram #psRaceSub').count(), 0, 'لا صندوق سباق في general');
        assert.equal(await g.page.locator('#setPanelProgram .ps-feat[data-feat="honorBoard"]').count(), 0, 'لا خانة لوحة الشرف في general');
        assert.equal(await g.page.locator('#setPanelProgram .ps-feat[data-feat="attendance"]').count(), 1, 'بقية الميزات باقية');
        const before = await g.page.evaluate(() => window.__fixture.writes.length);
        await g.page.evaluate(async () => { await saveProgramSettings(); });
        await g.page.waitForFunction(n => window.__fixture.writes.length > n, before);
        const saved = await g.page.evaluate(() => window.__fixture.writes.filter(w => w.settings).at(-1).settings);
        assert.equal(saved.raceName, 'اسم محفوظ'); assert.equal(saved.raceSubtitle, 'وصف محفوظ'); assert.equal(saved.features.honorBoard, true);
        const desc = await g.page.locator('[onclick="openSettingsSection(\'setPanelProgram\')"] .pc-desc').innerText();
        assert.ok(!desc.includes('السباق'), 'وصف البطاقة بلا «السباق»: ' + desc);
        assert.deepEqual(g.errors, []);
    } finally { await g.close(); }
    const s = await openPage({ program: 'summer' });
    try {
        await s.page.evaluate(() => { goHome('page-settings'); openSettingsSection('setPanelProgram'); });
        assert.equal(await s.page.locator('#setPanelProgram #psRaceName').count(), 1);
        assert.equal(await s.page.locator('#setPanelProgram #psRaceSub').count(), 1);
        assert.equal(await s.page.locator('#setPanelProgram .ps-feat[data-feat="honorBoard"]').count(), 1);
        assert.deepEqual(s.errors, []);
    } finally { await s.close(); }
});
