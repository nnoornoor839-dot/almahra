// اختبارات قبول الجزء ٤ من «الفرسان في مكان واحد» (البند 15: نافذة «!» بنص الدليل وأرقامه من الإعدادات). حمراء قبل البناء.
const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { harness: quick, copy } = require('./helpers/quick-entry-harness.cjs');
const { newPage } = require('./helpers/t25-browser.cjs');
const { key } = require('./helpers/knights-r2b-harness.cjs');
const hp = require('./rules/homeprep-answer-key.json');
let browser;
before(async () => {
    const playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); });
const strip = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const num = n => String(Math.round(n * 100) / 100);
function settingsWith(mutate) { const s = copy(hp.settings); mutate?.(s); return s; }
function guide(settings) {
    const h = quick(); h.state.settings = settings;
    h.install('renderGeneralKnightsGuide');
    return strip(h.run('renderGeneralKnightsGuide(getProgramSettings())'));
}
function expected(s) {
    const pct = id => (s.grades.find(g => g.id === id)?.percent ?? 0) / 100;
    const mult = { new: s.kindMult?.newMemorization ?? 3, review: s.kindMult?.review ?? 1 };
    const face = (kind, grade) => 15 * mult[kind] * pct(grade);
    const crit = id => { const c = (s.criteria || []).find(x => x.id === id); return c && c.enabled !== false ? c.points : 0; };
    const discipline = crit('early') + crit('manners') + crit('uniform');
    const prep = crit('homeprep');
    const minId = s.homePrepMinGrade || 'good';
    const minPct = pct(minId);
    const keeps = (...grades) => grades.every(g => pct(g) >= minPct); // يستحق التحضير إن بلغ كل تسميعه الحد
    const salem = face('new', 'excellent') + 4 * face('review', 'very-good') + discipline + (keeps('excellent', 'very-good') ? prep : 0);
    const alt = face('new', 'good') + 4 * face('review', 'very-good') + discipline + (keeps('good', 'very-good') ? prep : 0);
    const altLoses = keeps('excellent', 'very-good') && !keeps('good', 'very-good'); // «يخسر» فقط إن كان قد استحقه في المثال
    const days = s.workingDays?.length || 4, att = Math.ceil(days * ((s.titleRules?.weeklyAttendancePct ?? 75) / 100));
    return { face, salem, alt, altLoses, prep, minName: s.grades.find(g => g.id === minId).name, days, att };
}

test('ف10: the guide has the five approved sections and every number comes from settings (default: min grade «جيد»)', () => {
    const s0 = settingsWith(s => { delete s.homePrepMinGrade; });
    const base = guide(s0), e0 = expected(s0);
    for (const head of ['فارس الحلقة', 'كيف تُحسب نقاطك', 'فارس الأسبوع', 'متى يُعلن', 'النجم الصاعد']) assert.ok(base.includes(head), 'قسم ' + head);
    for (const [kind, grade] of [['new', 'excellent'], ['new', 'very-good'], ['new', 'good'], ['review', 'excellent'], ['review', 'very-good'], ['review', 'good']])
        assert.ok(base.includes(num(e0.face(kind, grade))), 'رقم ' + kind + '/' + grade + ' = ' + num(e0.face(kind, grade)));
    assert.ok(new RegExp('التحضير المنزلي[^.]*\\+?' + e0.prep).test(base), 'نقاط التحضير ' + e0.prep);
    assert.ok(base.includes('«' + e0.minName + '» فأعلى'), 'أقل تقدير: ' + e0.minName);
    assert.ok(!base.includes('«جيد جداً» فأعلى'), 'ليس جيد جداً بالافتراضي');
    assert.ok(base.includes(num(e0.salem)), 'مجموع سالم ' + num(e0.salem));
    assert.ok(base.includes(num(e0.alt)), 'المجموع البديل ' + num(e0.alt));
    assert.ok(/«جيد»: يأخذ 22.5 بدل 45/.test(base), 'الفقرة البديلة بتقدير «جيد» كما في النص المعتمد');
    assert.equal(/ويخسر التحضير/.test(base), e0.altLoses, 'خسارة التحضير في البديل حسب الإعداد (الحد جيد ← يُبقيه)');
    assert.ok(new RegExp('(3 أيام|' + e0.att + ' أيام) من ' + e0.days).test(base), 'الحضور ' + e0.att + ' من ' + e0.days);
    assert.ok(!/يتقدّم على نفسه/.test(base), 'لا عبارة النجم القديمة');
    assert.ok(!/[٠-٩]/.test(base), 'أرقام 0–9 فقط');
    // تغيير الإعدادات يغيّر الدليل وحده
    const s1 = settingsWith(s => { s.criteria.find(c => c.id === 'homeprep').points = 15; s.homePrepMinGrade = 'very-good'; s.titleRules = { ...(s.titleRules || {}), weeklyAttendancePct: 50 }; s.kindMult = { newMemorization: 2, review: 1 }; });
    const changed = guide(s1), e1 = expected(s1);
    assert.ok(new RegExp('التحضير المنزلي[^.]*\\+?15').test(changed), 'التحضير 15');
    assert.ok(changed.includes('«جيد جداً» فأعلى'), 'أقل تقدير جيد جداً');
    assert.ok(/(يومين|2 أيام) من 4/.test(changed), 'الحضور يومين من 4 عند 50%');
    assert.ok(changed.includes(num(e1.face('new', 'excellent'))), 'الوجه الجديد ' + num(e1.face('new', 'excellent')) + ' عند معامل 2');
    // خلايا جدول سالم أرقام بلا إشارة + (كما في النص المعتمد)؛ سطر الانضباط وحده يكتب «+5» لكل معيار
    for (const [text, e] of [[base, e0], [changed, e1]]) {
        assert.ok(!text.includes('+' + num(e.face('new', 'excellent'))), 'خلية الجديد بلا +');
        assert.ok(!text.includes('+' + num(4 * e.face('review', 'very-good'))), 'خلية المراجعة بلا +');
        assert.ok(!text.includes('+' + num(e.salem)), 'المجموع بلا +');
    }
    assert.ok(changed.includes(num(e1.salem)) && changed.includes(num(e1.alt)), 'مجموعا المثال ' + num(e1.salem) + '/' + num(e1.alt));
    assert.equal(/ويخسر التحضير/.test(changed), e1.altLoses, 'الحد جيد جداً ← البديل «جيد» يخسر التحضير');
    // النص المعتمد حرفياً عند الحد «جيد جداً» بالإعدادات الافتراضية: 113 و80.5
    // إعدادات المثال المعتمد: الانضباط = الحضور المبكر 5 + الأدب 5 + الزي 3 (كإعدادات general الافتراضية)
    const approvedCriteria = s => { for (const [id, name, points] of [['manners', 'حسن الخلق والأدب', 5], ['uniform', 'الالتزام بالزي الرسمي', 3]]) if (!s.criteria.some(c => c.id === id)) s.criteria.push({ id, name, points, enabled: true }); };
    const s2 = settingsWith(s => { approvedCriteria(s); s.homePrepMinGrade = 'very-good'; }), e2 = expected(s2), approved = guide(s2);
    assert.ok(approved.includes('113') && approved.includes('80.5') && /ويخسر التحضير/.test(approved), 'النص المعتمد: 113 ثم 80.5 عند جيد جداً');
    assert.equal(num(e2.salem), '113'); assert.equal(num(e2.alt), '80.5');
    // حد «ممتاز»: مراجعة سالم «جيد جداً» لا تبلغه فيسقط التحضير من المثال نفسه
    const s3 = settingsWith(s => { approvedCriteria(s); s.homePrepMinGrade = 'excellent'; }), e3 = expected(s3), strict = guide(s3);
    assert.ok(strict.includes(num(e3.salem)) && !strict.includes('113'), 'حد ممتاز: المثال بلا تحضير (' + num(e3.salem) + ')');
    assert.ok(!/ويخسر التحضير/.test(strict), 'حد ممتاز: لا «يخسر» لأنه لم يستحقه أصلاً');
});

test('ف10ب: the «!» button opens the guide modal inside the knights panel; it closes; no inline explanation in the panel; no page errors', async () => {
    const h = await newPage(browser, { width: 1280, today: key.days[1] });
    try {
        await h.page.evaluate(() => { goHome('page-settings'); openSettingsSection('setPanelGeneralKnights'); });
        assert.equal(await h.page.locator('#gkHelpModal:visible').count(), 0, 'مغلقة في البداية');
        const panelText = await h.page.locator('#setPanelGeneralKnights').innerText();
        assert.ok(!panelText.includes('كيف تُحسب نقاطك'), 'لا شرح داخل اللوحة');
        await h.page.click('#gkHelpBtn');
        assert.equal(await h.page.locator('#gkHelpModal').isVisible(), true, 'النافذة تفتح');
        const text = await h.page.locator('#gkHelpModal').innerText();
        for (const head of ['فارس الحلقة', 'كيف تُحسب نقاطك', 'فارس الأسبوع', 'متى يُعلن', 'النجم الصاعد']) assert.ok(text.includes(head), head);
        await h.page.click('#gkHelpClose');
        assert.equal(await h.page.locator('#gkHelpModal').isVisible(), false, 'النافذة تغلق');
        await h.page.click('#gkHelpBtn'); await h.page.keyboard.press('Escape');
        assert.equal(await h.page.locator('#gkHelpModal').isVisible(), false, 'Esc يغلق');
        await h.page.click('#gkHelpBtn'); await h.page.locator('#gkHelpModal').click({ position: { x: 5, y: 5 } });
        assert.equal(await h.page.locator('#gkHelpModal').isVisible(), false, 'النقر على الخلفية يغلق');
        await h.page.click('#gkHelpBtn'); await h.page.locator('#gkHelpModal button:has-text("إغلاق")').last().click();
        assert.equal(await h.page.locator('#gkHelpModal').isVisible(), false, 'الزر السفلي يغلق');
        assert.equal(await h.page.locator('#gkHelpModal.no-print').count(), 1, 'لا يُطبع');
        await h.page.click('#gkHelpBtn');
        await h.page.evaluate(() => openProgram('summer'));
        assert.equal(await h.page.locator('#gkHelpModal').isVisible(), false, 'تُخفى عند مغادرة general');
        assert.equal(await h.page.locator('#gkHelpBtn').isVisible(), false, 'زر ! لا يظهر في الصيفي');
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});
