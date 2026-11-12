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
    const tenth = n => Math.round(n * 10) / 10; // تقريب كل خانة إلى عُشر كما يفعل generalEntryPoints
    const line = (kind, grade) => mult[kind] * pct(grade); // قيمة السطر الواحد في جدول القسم 2
    const crit = id => { const c = (s.criteria || []).find(x => x.id === id); return c && c.enabled !== false ? c.points : 0; };
    const discipline = crit('early') + crit('manners') + crit('uniform');
    const prep = crit('homeprep');
    const minId = s.homePrepMinGrade || 'good';
    const minPct = pct(minId);
    // مثال خالد: 5 أسطر جديد و20 سطراً مراجعة، بالتقديرات الثلاثة الأولى من الإعداد؛ التحضير إن بلغ التقدير الحد؛ المجموع من الخانات المقرَّبة.
    const khalid = s.grades.slice(0, 3).map(g => {
        const nw = tenth(5 * line('new', g.id)), rv = tenth(20 * line('review', g.id));
        const pp = pct(g.id) >= minPct ? prep : 0;
        return { grade: g, nw, rv, discipline, prep: pp, total: tenth(nw + rv + discipline + pp) };
    });
    const days = s.workingDays?.length || 4, att = Math.ceil(days * ((s.titleRules?.weeklyAttendancePct ?? 75) / 100));
    return { mult, line, khalid, prep, minName: s.grades.find(g => g.id === minId).name, days, att };
}
const share = p => p === 100 ? 'كاملة' : p === 75 ? 'ثلاثة أرباعها' : p === 50 ? 'نصفها' : p === 0 ? 'لا شيء' : null;
// القسم 2 وحده: من عنوانه إلى عنوان القسم 3
function section2(text) {
    const a = text.indexOf('2. كيف تُحسب نقاطك'), b = text.indexOf('3. فارس الأسبوع');
    assert.ok(a >= 0 && b > a, 'القسم 2 موجود قبل القسم 3');
    return text.slice(a, b);
}
// يثبت جدول الأسطر ومثال خالد في القسم 2 لإعدادات معيّنة
function assertSection2(text, s, e, label) {
    const sec = section2(text);
    assert.ok(sec.includes('سطر الجديد') && sec.includes('سطر المراجعة'), label + ': عنوانا الجدول «سطر الجديد» و«سطر المراجعة»');
    // «لا على الأوجه» من نص البطاقة §2 نفسه؛ ما عداه لا «وجه» بأي صيغة
    assert.ok(!sec.includes('الوجه الجديد') && !sec.includes('وجه المراجعة') && !sec.replace('لا على الأوجه', '').includes('وجه'), label + ': لا «وجه» في القسم 2');
    assert.ok(!sec.includes('سالم'), label + ': لا «سالم» في القسم 2');
    // جملة الأسطر تتبع تساوي المعاملين أو اختلافهما
    const linesSentence = 'النقاط على الأسطر، لا على الأوجه: ' + (e.mult.new === e.mult.review
        ? 'الجديد والمراجعة بقيمة واحدة، السطر بـ' + num(e.mult.new) + ' نقاط.'
        : 'سطر الحفظ الجديد بـ' + num(e.mult.new) + ' نقاط، وسطر المراجعة بـ' + num(e.mult.review) + ' نقاط.');
    assert.ok(sec.includes(linesSentence), label + ': جملة الأسطر «' + linesSentence + '»');
    // سطرا التقريب والخلاصة في آخر القسم 2
    for (const line of ['النقاط تُقرَّب إلى رقم عشري واحد.', 'الخلاصة: كل سطر تحفظه أو تراجعه له قيمته، ولو سطراً واحداً. والإتقان يرفعها.'])
        assert.ok(sec.includes(line), label + ': السطر «' + line + '» في القسم 2');
    for (const g of s.grades) {
        const row = g.name + ' ' + share(Number(g.percent)) + ' ' + num(e.line('new', g.id)) + ' ' + num(e.line('review', g.id));
        assert.ok(sec.includes(row), label + ': صف الجدول «' + row + '»');
    }
    const a = sec.indexOf('تأخذ من النقاط'), b = sec.indexOf('الانضباط:');
    assert.ok(a >= 0 && b > a, label + ': الجدول قبل سطر الانضباط');
    assert.ok(!sec.slice(a, b).includes('+'), label + ': لا «+» في خلايا جدول التقديرات');
    const k = sec.indexOf('خالد');
    assert.ok(k >= 0, label + ': مثال خالد');
    const ex = sec.slice(k);
    assert.ok(/5 أسطر/.test(ex) && /20 سطراً/.test(ex), label + ': خالد 5 أسطر جديد و20 سطراً مراجعة');
    assert.ok(!ex.includes('+'), label + ': لا «+» في خلايا جدول خالد');
    for (const name of e.khalid.map(c => c.grade.name)) assert.ok(ex.includes(name), label + ': عمود ' + name);
    const seq = f => e.khalid.map(c => num(f(c))).join(' ');
    assert.ok(ex.includes(seq(c => c.nw)), label + ': خانات الجديد ' + seq(c => c.nw));
    assert.ok(ex.includes(seq(c => c.rv)), label + ': خانات المراجعة ' + seq(c => c.rv));
    assert.ok(ex.includes(seq(c => c.discipline)), label + ': خانات الانضباط ' + seq(c => c.discipline));
    assert.ok(ex.includes('المجموع ' + seq(c => c.total)), label + ': المجاميع ' + seq(c => c.total));
    return sec;
}

test('ف10: the guide has the five approved sections and every number comes from settings (default: min grade «جيد»)', () => {
    const s0 = settingsWith(s => { delete s.homePrepMinGrade; });
    const base = guide(s0), e0 = expected(s0);
    for (const head of ['فارس الحلقة', 'كيف تُحسب نقاطك', 'فارس الأسبوع', 'متى يُعلن', 'النجم الصاعد']) assert.ok(base.includes(head), 'قسم ' + head);
    assert.ok(new RegExp('التحضير المنزلي[^.]*\\+?' + e0.prep).test(base), 'نقاط التحضير ' + e0.prep);
    assert.ok(base.includes('«' + e0.minName + '» فأعلى'), 'أقل تقدير: ' + e0.minName);
    assert.ok(!base.includes('«جيد جداً» فأعلى'), 'ليس جيد جداً بالافتراضي');
    assert.ok(new RegExp('(3 أيام|' + e0.att + ' أيام) من ' + e0.days).test(base), 'الحضور ' + e0.att + ' من ' + e0.days);
    assert.ok(!/يتقدّم على نفسه/.test(base), 'لا عبارة النجم القديمة');
    assert.ok(!/[٠-٩]/.test(base), 'أرقام 0–9 فقط');
    assertSection2(base, s0, e0, 'الافتراضي');
    // تغيير الإعدادات يغيّر الدليل وحده
    const s1 = settingsWith(s => { s.criteria.find(c => c.id === 'homeprep').points = 15; s.homePrepMinGrade = 'very-good'; s.titleRules = { ...(s.titleRules || {}), weeklyAttendancePct: 50 }; s.kindMult = { newMemorization: 2, review: 1 }; });
    const changed = guide(s1), e1 = expected(s1);
    assert.ok(new RegExp('التحضير المنزلي[^.]*\\+?15').test(changed), 'التحضير 15');
    assert.ok(changed.includes('«جيد جداً» فأعلى'), 'أقل تقدير جيد جداً');
    assert.ok(/(يومين|2 أيام) من 4/.test(changed), 'الحضور يومين من 4 عند 50%');
    assert.ok(!/[٠-٩]/.test(changed), 'أرقام 0–9 فقط بعد التغيير');
    assertSection2(changed, s1, e1, 'معامل 2');
    // المثال المعتمد: المعاملان 3 و3، الانضباط = الحضور المبكر 5 + الأدب 5 + الزي 3، التحضير 10
    const approvedCriteria = s => { for (const [id, name, points] of [['manners', 'حسن الخلق والأدب', 5], ['uniform', 'الالتزام بالزي الرسمي', 3]]) if (!s.criteria.some(c => c.id === id)) s.criteria.push({ id, name, points, enabled: true }); s.kindMult = { newMemorization: 3, review: 3 }; };
    const s2 = settingsWith(s => { approvedCriteria(s); delete s.homePrepMinGrade; }), e2 = expected(s2), approved = guide(s2);
    assert.deepEqual(e2.khalid.map(c => num(c.total)), ['98', '79.3', '60.5'], 'الحساب المستقل: 98 / 79.3 / 60.5 عند الحد «جيد»');
    assert.deepEqual(e2.khalid.map(c => num(c.nw)), ['15', '11.3', '7.5'], '11.25 ← 11.3');
    const sec2 = assertSection2(approved, s2, e2, 'المعتمد (الحد جيد)');
    assert.ok(sec2.includes('المجموع 98 79.3 60.5'), 'النص المعتمد: 98 / 79.3 / 60.5');
    assert.ok(sec2.includes('15 11.3 7.5') && sec2.includes('60 45 30') && sec2.includes('13 13 13'), 'خانات خالد المعتمدة');
    // الحد «جيد جداً»: عمود «جيد» يخسر التحضير
    const s3 = settingsWith(s => { approvedCriteria(s); s.homePrepMinGrade = 'very-good'; }), e3 = expected(s3), strict = guide(s3);
    assert.deepEqual(e3.khalid.map(c => num(c.total)), ['98', '79.3', '50.5'], 'الحساب المستقل: 98 / 79.3 / 50.5 عند الحد «جيد جداً»');
    const sec3 = assertSection2(strict, s3, e3, 'المعتمد (الحد جيد جداً)');
    assert.ok(sec3.includes('المجموع 98 79.3 50.5'), 'عند الحد «جيد جداً»: 98 / 79.3 / 50.5');
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
