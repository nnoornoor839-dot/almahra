const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { newPage, answerStudents } = require('./helpers/t25-browser.cjs');
const { harness, student, html } = require('./helpers/quick-entry-harness.cjs');
let browser;
before(async () => {
    const playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); });
const text = (page, selector) => page.locator(selector).innerText();
function missingStudents() {
    const list = answerStudents();
    // المفتاح نفسه؛ حذف هذه الأسطر وحدها يصنع سيناريو نقص يومين فائتين واليوم.
    for (const date of ['2026-11-16', '2026-11-17', '2026-11-18']) delete list[0].history[date];
    return list;
}

for (const program of ['summer', 'review-day']) test(`ت٢٥: فشل تحميل الطلاب في ${program} لا يحجب الرئيسية عند الفتح والتبديل`, async () => {
    const h = await newPage(browser, { program, hold: true, studentLoadError: true });
    const visibility = () => h.page.evaluate(() => ['homeVerse', 'homeDashboard', 'homeLead']
        .map(id => {
            // Locked programs select the records tab; check visibility within home,
            // including homeExtras, independently of which tab is active.
            for (let el = document.getElementById(id); el && el.id !== 'page-home'; el = el.parentElement) {
                if (getComputedStyle(el).display === 'none') return false;
            }
            return true;
        }));
    try {
        assert.deepEqual(await visibility(), [false, false, false]);
        await h.page.evaluate(() => window.__fixture.start());
        await h.page.waitForFunction(() => window.__fixture.current !== null && !document.body.classList.contains('event-not-selected'));
        assert.deepEqual(await visibility(), [true, true, true]);
        for (const [target, visible] of [['general', false], [program, true]]) {
            await h.page.locator('#currentEventBadge').click();
            await h.page.locator(`#programSwitcherMenu button[onclick="selectProgramFromSwitcher('${target}')"]`).click();
            assert.equal(await h.page.evaluate(() => window.__fixture.current), target);
            assert.deepEqual(await visibility(), [visible, visible, visible]);
        }
        assert.equal(await h.page.evaluate(() => window.almahraData.lastError()?.code), 'unavailable');
        assert.equal(await h.page.evaluate(() => window.__fixture.studentUpdates), 0);
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

test('ت٢٥-٢: قبل جاهزية البرنامج تبقى الآية واللوحة والمتصدرون مخفية، ثم general لا يظهرها', async () => {
    const h = await newPage(browser, { hold: true });
    try {
        for (const id of ['homeVerse', 'homeDashboard', 'homeLead']) assert.equal(await h.page.locator('#' + id).evaluate(el => getComputedStyle(el).display), 'none');
        await h.page.evaluate(() => window.__fixture.start());
        await h.page.locator('#generalTodayCard').waitFor({ state: 'visible' });
        assert.equal(await text(h.page, '#hijriDateDisplay'), 'الأحد، ١٣ جمادى الآخرة ١٤٤٨ هـ');
        for (const id of ['homeVerse', 'homeDashboard', 'homeLead']) assert.equal(await h.page.locator('#' + id).isVisible(), false);
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

test('ت٢٥-١: مفتاح الإجابة عبر الدخول الحقيقي، أسطر النقص من الأحدث وزر الثلاثاء يفتح يومه بلا onclick نصي', async () => {
    const h = await newPage(browser, { today: '2026-11-18', list: missingStudents() });
    try {
        assert.equal(await h.page.locator('#generalUnrecordedAlert').isVisible(), false);
        const days = await h.page.locator('.gh-past-day').allTextContents();
        assert.deepEqual(days, ['والثلاثاء ١ ←', 'والإثنين ١ ←']);
        const button = h.page.getByRole('button', { name: 'والثلاثاء ١ ←', exact: true });
        assert.equal(await button.getAttribute('onclick'), null);
        await button.click();
        assert.equal(await h.page.locator('#generalAbsenceModal').isVisible(), true);
        assert.equal(await h.page.locator('#generalAbsenceDate').inputValue(), '2026-11-17');
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

for (const holiday of [false, true]) test(`ت٢٥-١: ${holiday ? 'الإجازة' : 'اكتمال اليوم'} تبقي نقص الأيام الفائتة`, async () => {
    const list = missingStudents();
    if (!holiday) list.forEach(s => { s.history['2026-11-18'] = { attended: true }; });
    const h = await newPage(browser, { today: '2026-11-18', list, holiday });
    try {
        assert.match(await text(h.page, '#generalTodayCard'), holiday ? /اليوم إجازة/ : /✓\s*اكتمل التسجيل/);
        assert.ok((await h.page.locator('.gh-past-day').allTextContents()).includes('والثلاثاء ١ ←'));
        assert.equal(await h.page.locator('#generalUnrecordedAlert').isVisible(), false);
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

for (const width of [390, 1280]) test(`ت٢٥-١،٣،٥: عرض ${width} ثلاث خانات، تاريخ كامل، هامش زر وارتفاع ٤٤`, async () => {
    const h = await newPage(browser, { width, today: '2026-11-18', list: missingStudents() });
    try {
        const cells = await h.page.locator('.gh-today-grid > .gh-cell').evaluateAll(els => els.map(el => ({ top: el.getBoundingClientRect().top, width: el.getBoundingClientRect().width, scroll: el.scrollWidth })));
        assert.equal(cells.length, 3); assert.ok(cells.every(c => c.top === cells[0].top && c.scroll <= Math.ceil(c.width)));
        assert.equal(await h.page.locator('.ah-title').isVisible(), false);
        const date = await h.page.locator('#hijriDateDisplay').evaluate(el => ({ width: el.getBoundingClientRect().width, scroll: el.scrollWidth, right: el.getBoundingClientRect().right, left: el.getBoundingClientRect().left }));
        assert.ok(date.scroll <= Math.ceil(date.width) && date.left >= 0 && date.right <= width);
        if (width === 390) assert.equal(await h.page.locator('#headerGregorian').isVisible(), false);
        await h.page.getByRole('button', { name: 'أكملهم ←', exact: false }).click();
        const button = await h.page.locator('.gs-entry').first().evaluate(el => ({ height: el.getBoundingClientRect().height, pad: parseFloat(getComputedStyle(el).paddingInlineStart), scroll: el.scrollWidth, width: el.getBoundingClientRect().width }));
        assert.ok(Math.abs(button.height - 44) < 0.01); assert.ok(button.pad >= 12); assert.ok(button.scroll <= Math.ceil(button.width));
        assert.ok(await h.page.locator('#page-students').evaluate(el => el.scrollWidth <= el.clientWidth));
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

test('ت٢٥-٤: أرقام الطالب والموسم والمحاور والتلميحات عربية عبر الدخول والتنقل والمبدل، والبيانات ثابتة', async () => {
    const h = await newPage(browser, { width: 1280 });
    try {
        assert.match(await text(h.page, '#currentEventBadge'), /موسم ٢٠٢٦/);
        for (const id of ['generalAttendanceCard', 'generalAchievementCard', 'generalHomeFollowup']) assert.doesNotMatch(await text(h.page, '#' + id), /[0-9]/);
        assert.match(await text(h.page, '#generalAttendanceCard'), /آخر ٤ أيام دراسية[\s\S]*آخر ٤ أسابيع/);
        assert.match(await text(h.page, '#generalAchievementCard'), /آخر ٨ أسابيع/);
        for (const id of ['generalAttendanceChart', 'generalAchievementChart']) {
            assert.match(await text(h.page, '#' + id), /[٠-٩]+\/[٠-٩]+/);
            assert.doesNotMatch(await h.page.locator('#' + id + ' svg').getAttribute('aria-label'), /[0-9]/);
        }
        await h.page.locator('#currentEventBadge').click();
        assert.doesNotMatch(await text(h.page, '#programSwitcherMenu'), /[0-9]/);
        await h.page.keyboard.press('Escape');
        await h.page.getByRole('button', { name: 'أكملهم ←', exact: false }).click();
        assert.deepEqual((await h.page.locator('.gs-number').allTextContents()).sort(), ['١','٢','٣','٤','٥','٦','٧','٨']);
        assert.deepEqual(await h.page.evaluate(() => window.__fixture.list.map(s => s.id)), [1,2,3,4,5,6,7,8]);
        assert.equal(await h.page.evaluate(() => window.__fixture.seasons.general.name), 'موسم 2026');
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

test('ت٢٥-١: اليوم غير الدراسي يبقي أسطر النقص السابقة بلا خانة يوم دراسي', async () => {
    const h = await newPage(browser, { today: '2026-11-20', list: missingStudents() });
    try {
        assert.match(await text(h.page, '#generalTodayCard'), /اليوم إجازة/);
        assert.equal(await h.page.locator('.gh-today-grid').count(), 0);
        assert.deepEqual(await h.page.locator('.gh-past-day').allTextContents(), ['والأربعاء ١ ←', 'والثلاثاء ١ ←', 'والإثنين ١ ←']);
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

for (const program of ['summer', 'review-day']) test(`ت٢٥-٢،٣،٤: ${program} يظهر العنوان والحديث بعد الجاهزية ويبقي اسم الموسم الغربي`, async () => {
    const h = await newPage(browser, { program, width: 1280 });
    try {
        assert.equal(await h.page.locator('.ah-title').isVisible(), true);
        assert.equal(await h.page.locator('#homeVerse').evaluate(el => getComputedStyle(el).display === 'none'), false);
        assert.match(await text(h.page, '#currentEventBadge'), /موسم 2026/);
        await h.page.locator('#currentEventBadge').click();
        assert.match(await text(h.page, '#programSwitcherMenu'), /موسم 2026/);
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

test('ت٢٥-٤: حفظ حقيقي من نافذة التسجيل يعرّب الاحتفال فقط وتظل قيم الحفظ أرقاماً', async () => {
    const h = harness(student({}, { lastSurah: 114, lastAyah: 3, history: {} }));
    h.state.settings.criteria = [{ id: 'early', name: 'معيار وهمي', points: 14 }];
    h.ctx.getCumulativeStats = () => ({ tripPoints: 103.5 }); h.ctx.getStudentRank = () => 1;
    h.reopen(); h.run('fulfillGeneralCriteria()');
    h.range('new', null, [114, 6]); h.grade('new');
    const preview = h.preview(); await h.save();
    assert.equal(preview.total, 22.5);
    assert.match(h.element('celebrationPoints').innerText, new RegExp(`\\+ ${preview.total.toLocaleString('ar-SA')} نقطة`));
    assert.match(h.element('celebrationTotalPoints').innerText, /١٠٣٫٥/);
    assert.match(h.element('celebrationRank').innerHTML, /الترتيب: ١/);
    assert.equal(typeof Object.values(h.state.writes[0].fields).find(value => value && typeof value === 'object' && 'points' in value).points, 'number');
    assert.equal(h.element('quick_new_toAyah').value, '6');
});

test('ت٢٥-٤: احتفال summer عبر زر الحفظ القديم يبقى بالأرقام الغربية', () => {
    // السحابة وهمية كما في اختبارات المسار القديم؛ لا كتابة لبرنامج حقيقي.
    const h = harness(student({}, { lastSurah: 114, lastAyah: 3, history: {} }));
    h.state.program = 'summer'; h.reopen();
    h.install('calculateRangeStats', 'saveSmartProgress');
    h.ctx.getCumulativeStats = () => ({ tripPoints: 103.5 }); h.ctx.getStudentRank = () => 1;
    h.ctx.commitStudentPatch = (student, fields) => { h.state.writes.push({ id: student.id, fields }); return true; };
    for (const [id, value] of Object.entries({ startSurah: '114', startAyah: '4', endSurah: '114', endAyah: '6' })) h.element(id).value = value;
    h.element('resWeightedPoints').innerText = '22';
    h.run(html.match(/id="smartSaveBtn" onclick="([^"]+)"/)[1]);
    assert.equal(h.state.writes.length, 1);
    assert.equal(h.element('celebrationPoints').innerText, '+ 22 نقطة جديدة مضافة للسباق 🎁');
    assert.equal(h.element('celebrationTotalPoints').innerText, '🏆 إجمالي رصيدك: 103.5 نقطة');
    assert.match(h.element('celebrationRank').innerHTML, /الترتيب: 1$/);
});

test('ت٢٥-٤: نقر إدخال إنجاز ثم الحفظ يعرض ٢٢٫٥ و١٠٣٫٥ والترتيب ١؛ المعايير عربية والإدخال غربي', async () => {
    const list = [{ id: 1, sid: 'synthetic-t25', name: 'طالب وهمي', halaqaId: 'a', lastSurah: 114, lastAyah: 3,
        history: { '2026-11-18': { attended: true, criteriaPoints: 81 } } }];
    const h = await newPage(browser, { width: 1280, list, settings: {
        criteria: [{ id: 'early', name: 'معيار وهمي', points: 14 }], grades: [{ id: 'good', name: 'جيد', percent: 100 }],
        points: { attendance: 0, newMemorization: 3, review: 1 }
    } });
    try {
        await h.page.getByRole('button', { name: 'أكملهم ←', exact: false }).click();
        await h.page.locator('.gs-entry').click();
        await h.page.locator('#quick_new_toAyah').fill('6');
        await h.page.locator('#quick_new_grades').getByRole('button', { name: 'جيد', exact: true }).click();
        await h.page.locator('#generalCriteriaAllBtn').click();
        await h.page.locator('#generalCriteriaExceptions').click();
        assert.match(await text(h.page, '#criteriaList'), /\+١٤/);
        assert.doesNotMatch(await text(h.page, '#criteriaList'), /[0-9]/);
        assert.equal(await text(h.page, '#criteriaTotal'), '١٤');
        assert.equal(await h.page.locator('#quick_new_toAyah').inputValue(), '6');
        assert.equal(await text(h.page, '#generalQuickTotal'), '٢٢٫٥');
        await h.page.locator('#generalQuickSaveBtn').click();
        await h.page.locator('#knightCelebrationModal').waitFor({ state: 'visible' });
        assert.match(await text(h.page, '#celebrationPoints'), /\+ ٢٢٫٥ نقطة/);
        assert.equal(await text(h.page, '#celebrationTotalPoints'), '🏆 إجمالي رصيدك: ١٠٣٫٥ نقطة');
        assert.match(await text(h.page, '#celebrationRank'), /الترتيب: ١/);
        const writes = await h.page.evaluate(() => window.__fixture.writes);
        assert.equal(writes.length, 1);
        assert.equal(Object.values(writes[0].fields).find(value => value && typeof value === 'object' && 'points' in value).points, 8.5);
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});
