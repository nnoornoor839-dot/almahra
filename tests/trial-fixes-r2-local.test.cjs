// بيانات وهمية، بلا شبكة؛ كل ضغطة مستقلة والمحفوظ مقارن حرفياً بالرأس قبل الجولة ٢.
const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const path = require('node:path');
const { harness, student, source, html, root, copy } = require('./helpers/quick-entry-harness.cjs');
const { newPage } = require('./helpers/t25-browser.cjs');
const { beforeRound2 } = require('./helpers/trial-r2-invariants.cjs');
const original = cp.execFileSync('git', ['show', '3ac67eb:index.html'], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n');
const reminder = name => `لم تُدخل مراجعة ل${name}. اضغط Enter مرة أخرى للحفظ بلا مراجعة.`;
const fixture = () => student({}, { name: 'أحمد', lastSurah: 114, lastAyah: 3, history: {} });
function setup({ old = false, missed = false, kind = 'new' } = {}) {
    const h = harness(fixture());
    if (old) h.run(source('saveGeneralQuickEntry', original));
    if (missed) h.run("todayStr = '2026-11-04'; initGeneralQuickEntry(students[0], '2026-11-03')");
    // نثبّت الساعة والعشوائية فقط؛ لا نحذف أو نطبع أي حقل قبل المقارنة الحرفية.
    h.run('Date.now = () => 1793520000000; Math.random = () => 0.25');
    h.ctx.window.almahraData.isReady = () => true;
    h.ctx.window.almahraData.getActiveProgramId = () => 'general';
    h.ctx.window.almahraData.getActiveSeasonId = () => 's1';
    h.ctx.window.crypto = { randomUUID: () => 'trial-r2-event' };
    h.ctx.sent = [];
    h.run(`generalTv.enabled = true; generalTv.lastHello = Date.now(); generalTv.dataContext = generalTvContext();
        generalTv.channel = { postMessage(message) { sent.push(message); } };`);
    if (['new', 'both'].includes(kind)) { h.range('new', null, [114, 6]); h.grade('new'); }
    if (['review', 'both'].includes(kind)) { h.range('review', [114, 1], [114, 3]); h.grade('review'); }
    if (kind === 'criteria') h.run('fulfillGeneralCriteria()');
    h.preview();
    return h;
}
const press = (h, method) => method === 'Enter'
    ? h.run("generalQuickKeydown({ key: 'Enter', target: document.getElementById('quick_new_toAyah'), preventDefault() {} })")
    : h.pressSave();
const shown = h => !h.element('generalQuickReviewReminder').hidden;
let browser;
before(async () => {
    const playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); });

test('r2 audit: exact approved UI changes only; calculations, persistence, TV and legacy programs stay literal', () => {
    assert.equal(beforeRound2, original);
    for (const name of ['calculateGeneralQuickEntry', 'buildEntryPatch', 'commitGeneralStudentPatch', 'makeEntry',
        'dayStats', 'saveSmartProgress', 'saveExamPrepProgress', 'sendGeneralTvCelebration'])
        assert.equal(source(name, require('./helpers/board-invariants.cjs').beforeBoard(html)), source(name, original), name);
    const audit = require('./rules/design-expectation-audit.json');
    const { changesFrom } = require('./helpers/design-expectation-audit.cjs');
    assert.equal(audit.categories[5], 'طلب المالك في تجربته ٢٠٢٦-١١-٠٦');
    for (const row of audit.trialRound2Fixes) assert.deepEqual(changesFrom(row.file, '3ac67eb'), row, row.file);
    assert.match(html, /id="generalQuickPanels"><\/div>\s*<p id="generalQuickReviewReminder"/);
});

for (const missed of [false, true]) for (const method of ['button', 'Enter'])
test(`أ، و: new only, ${method}, missed=${missed}: first does nothing; second saves exactly the old bytes`, async () => {
    const h = setup({ missed }), old = setup({ old: true, missed });
    const beforeStudent = copy(h.s);
    h.element('quick_new_toAyah').focus();
    await press(h, method);
    assert.deepEqual(h.state.writes, []); assert.deepEqual(copy(h.ctx.sent), []);
    assert.deepEqual(h.s, beforeStudent); assert.deepEqual(h.state.messages, []);
    assert.deepEqual(h.state.prompts, []);
    assert.equal(shown(h), true);
    assert.equal(h.element('generalQuickReviewReminder').textContent, reminder('أحمد'));
    assert.equal(h.state.focus, 'quick_new_toAyah');
    await press(h, method); await old.pressSave();
    assert.equal(h.state.writes.length, 1);
    assert.equal(JSON.stringify(h.state.writes), JSON.stringify(old.state.writes));
    assert.deepEqual(h.state.messages, old.state.messages);
    assert.deepEqual(h.state.prompts, old.state.prompts);
    assert.deepEqual(copy(h.ctx.sent), copy(old.ctx.sent));
    assert.equal(h.state.messages[0].message.startsWith('حُفظ لأحمد: '), true);
    assert.equal(copy(h.ctx.sent).length, missed ? 0 : 1);
    assert.equal(shown(h), false);
});

for (const kind of ['review', 'both', 'attendance', 'criteria'])
test(`ج: ${kind} saves on first press with identical payload and success text`, async () => {
    const h = setup({ kind }), old = setup({ kind, old: true });
    await h.pressSave(); await old.pressSave();
    assert.equal(h.state.writes.length, 1);
    assert.equal(JSON.stringify(h.state.writes), JSON.stringify(old.state.writes));
    assert.deepEqual(h.state.messages, old.state.messages);
    assert.equal(shown(h), false);
});

test('د: invalid new keeps only the existing inline error, including after a previous warning', async () => {
    for (const armed of [false, true]) {
        const h = setup();
        if (armed) await h.pressSave();
        h.element('quick_new_toAyah').value = '7'; h.preview();
        await h.pressSave();
        assert.deepEqual(h.state.writes, []); assert.deepEqual(copy(h.ctx.sent), []);
        assert.equal(shown(h), false); assert.equal(h.element('generalQuickReviewReminder').textContent, '');
        assert.match(h.element('quick_new_message').textContent, /6/);
        assert.equal(h.state.focus, 'quick_new_toAyah');
        const old = setup({ old: true }); old.element('quick_new_toAyah').value = '7'; old.preview(); await old.pressSave();
        assert.equal(h.element('quick_new_message').textContent, old.element('quick_new_message').textContent);
        assert.deepEqual(h.state.messages, old.state.messages);
    }
});

test('هـ: closing, reopening and opening another student clear the warning and require a new confirmation', async () => {
    const h = setup(); await h.pressSave(); assert.equal(shown(h), true);
    h.run('closeSmartModal()');
    assert.equal(shown(h), false); assert.equal(h.run('generalQuickEntry.noReviewConfirmation'), null);
    h.reopen(); h.range('new', null, [114, 6]); h.grade('new'); await h.pressSave();
    assert.equal(shown(h), true); assert.deepEqual(h.state.writes, []);
    h.run("students.push({ ...structuredClone(students[0]), id: 2, sid: 'other', name: 'خالد' }); openSmartModal(2)");
    assert.equal(shown(h), false); assert.equal(h.run('generalQuickEntry.noReviewConfirmation'), null);
    h.range('new', null, [114, 6]); h.grade('new'); await h.pressSave();
    assert.equal(h.element('generalQuickReviewReminder').textContent, reminder('خالد'));
    assert.deepEqual(h.state.writes, []);
    h.state.program = 'summer'; h.changed();
    assert.equal(shown(h), false); assert.equal(h.run('generalQuickEntry.noReviewConfirmation'), null);
});

async function browserSetup() {
    const h = await newPage(browser, { width: 1280, list: [{ ...fixture(), id: 2, sid: 'trial-r2', halaqaId: 'a' }] });
    await h.page.evaluate(() => {
        window.__r2 = { sent: [], messages: [] };
        const toast = showToast;
        showToast = (message, type) => { window.__r2.messages.push({ message, type }); toast(message, type); };
        generalTv.enabled = true; generalTv.lastHello = Date.now(); generalTv.dataContext = generalTvContext();
        generalTv.channel = { postMessage(message) { window.__r2.sent.push(message); } };
        openSmartModal(2);
    });
    await h.page.locator('#quick_new_toAyah').fill('6');
    await h.page.locator('#quick_new_grades').getByRole('button', { name: 'جيد', exact: true }).click();
    return h;
}

for (const method of ['button', 'Enter']) test(`أ browser: ${method} warning position, pending color, focus and second press`, async () => {
    const h = await browserSetup();
    try {
        const save = h.page.locator('#generalQuickSaveBtn'), input = h.page.locator('#quick_new_toAyah');
        const action = async () => method === 'button' ? save.click() : input.press('Enter');
        await input.focus(); await action();
        assert.equal(await h.page.locator('#generalQuickReviewReminder').innerText(), reminder('أحمد'));
        assert.deepEqual(await h.page.evaluate(() => window.__fixture.writes), []);
        assert.deepEqual(await h.page.evaluate(() => window.__r2), { sent: [], messages: [] });
        const ui = await h.page.evaluate(() => {
            const el = document.getElementById('generalQuickReviewReminder'), css = getComputedStyle(el);
            const color = token => {
                const probe = document.createElement('span'); probe.style.color = `var(${token})`;
                document.body.appendChild(probe); const value = getComputedStyle(probe).color; probe.remove(); return value;
            };
            return { focus: document.activeElement.id, color: css.color, pending: color('--general-pending'),
                error: color('--general-below-limit'), live: el.getAttribute('aria-live'),
                below: el.getBoundingClientRect().top >= document.getElementById('quick_review_row').getBoundingClientRect().bottom };
        });
        assert.equal(ui.focus, method === 'button' ? 'generalQuickSaveBtn' : 'quick_new_toAyah');
        assert.equal(ui.color, ui.pending); assert.notEqual(ui.color, ui.error);
        assert.equal(ui.below, true); assert.equal(ui.live, 'polite');
        // Enter الفوري يعمل من الحقل أو من زر الحفظ نفسه بعد الضغطة الأولى.
        await h.page.keyboard.press('Enter');
        await h.page.locator('#smartModal').waitFor({ state: 'hidden' });
        assert.equal(await h.page.evaluate(() => window.__fixture.writes.length), 1);
        const state = await h.page.evaluate(() => window.__r2);
        assert.equal(state.sent.filter(message => message.type === 'celebrate').length, 1);
        assert.deepEqual(state.messages, [{ message: 'حُفظ لأحمد: الجديد: الناس 4 ← الناس 6 (جيد)', type: 'success' }]);
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

test('ب browser: every input/select/grade/criteria edit resets confirmation, even editing then reverting; review typing hides immediately', async () => {
    const h = await browserSetup();
    try {
        const save = h.page.locator('#generalQuickSaveBtn'), line = h.page.locator('#generalQuickReviewReminder');
        const edits = [
            async () => { const input = h.page.locator('#quick_new_toAyah'); await input.fill('5'); await input.fill('6'); },
            async () => { const input = h.page.locator('#quick_review_fromAyah'); await input.fill('2'); await input.fill('1'); },
            async () => { const select = h.page.locator('#quick_new_toSurah'); await select.selectOption('113'); await select.selectOption('114'); await h.page.locator('#quick_new_toAyah').fill('6'); },
            async () => { const grades = h.page.locator('#quick_new_grades'); await grades.getByRole('button', { name: 'يُعاد', exact: true }).click(); },
            async () => { await h.page.locator('#generalCriteriaAllBtn').click(); },
            async () => { await h.page.locator('#generalCriteriaExceptions').click(); await h.page.locator('#generalCriteriaHost .crit-box').first().click(); }
        ];
        for (const edit of edits) {
            await save.click(); assert.equal(await line.isVisible(), true);
            await edit(); assert.equal(await line.isVisible(), false);
            await save.click(); assert.equal(await line.isVisible(), true);
            assert.deepEqual(await h.page.evaluate(() => window.__fixture.writes), []);
            // نفصل دورات الاختبار بتعديل حقيقي؛ كل دورة تبدأ دون تأكيد سابق.
            await h.page.locator('#quick_new_toAyah').fill('5'); await h.page.locator('#quick_new_toAyah').fill('6');
        }
        await save.click(); assert.equal(await line.isVisible(), true);
        await h.page.locator('#quick_review_toAyah').fill('3');
        assert.equal(await line.isVisible(), false);
        await h.page.locator('#quick_review_grades').getByRole('button', { name: 'جيد', exact: true }).click();
        await save.click(); await h.page.locator('#smartModal').waitFor({ state: 'hidden' });
        assert.equal(await h.page.evaluate(() => window.__fixture.writes.length), 1);
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});
