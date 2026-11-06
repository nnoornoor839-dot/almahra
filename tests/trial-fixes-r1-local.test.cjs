// بيانات وهمية فقط، ودوال الإنتاج مع مقارنة الصيفي بالمرجع ومتصفح بلا شبكة.
const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { harness, student, source, html, root, copy } = require('./helpers/quick-entry-harness.cjs');
const { newPage, answerStudents } = require('./helpers/t25-browser.cjs');
const { beforeRound2 } = require('./helpers/trial-r2-invariants.cjs');
const baseline = cp.execFileSync('git', ['show', '82bf19f:index.html'], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n');
const head = cp.execFileSync('git', ['show', 'a597c11:index.html'], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n');
let browser;
before(async () => {
    const playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); });

test('trial r1: only local celebration orchestration changes; TV files, message, guards, persistence and calculations stay literal', () => {
    const oldCall = 'if (!missed && calculation.total > 0) celebrateGeneralQuickEntry(students.find(s => s.id === student.id) || student, calculation.total, savedSummary);';
    const disconnect = 'if (!missed && calculation.total > 0 && generalTv.enabled && (generalTv.window?.closed || Date.now() - generalTv.lastHello >= 90000)) clearGeneralTv(true);';
    assert.equal(source('saveGeneralQuickEntry', beforeRound2), source('saveGeneralQuickEntry', head).replace(oldCall, disconnect));
    assert.doesNotMatch(html, /celebrateGeneralQuickEntry|الاحتفال على التلفاز/);
    for (const name of ['sendGeneralTvCelebration', 'generalTvReady', 'postGeneralTv', 'enableGeneralTv', 'clearGeneralTv',
        'calculateGeneralQuickEntry', 'buildEntryPatch', 'commitGeneralStudentPatch', 'dayStats', 'getStudentRank',
        'generalStudentsMatching', 'generalStudentsQuery', 'exportToExcel', 'copyStudentWhatsAppReport', 'printExamCards']) {
        assert.equal(source(name, require('./helpers/board-invariants.cjs').beforeBoard(html)), source(name, head), name);
    }
    for (const file of ['tv.html', 'tv.js', 'general-points.js', 'firestore.rules', 'data-store.js', 'programs-store.js']) {
        const original = cp.execFileSync('git', ['show', `a597c11:${file}`], { cwd: root, encoding: 'utf8' });
        const restored = require('./helpers/board-invariants.cjs').beforeBoard(fs.readFileSync(path.join(root, file), 'utf8'), file);
        assert.equal(restored, original.replaceAll('\r\n', '\n'), file);
    }
});

for (const connected of [false, true]) test(`trial r1: general save keeps exactly one confirmation, no supervisor celebration; TV connected=${connected}`, async () => {
    const h = harness(student({}, { name: 'أحمد', lastSurah: 114, lastAyah: 3, history: {} }));
    h.ctx.window.almahraData.isReady = () => true;
    h.ctx.window.almahraData.getActiveProgramId = () => 'general';
    h.ctx.window.almahraData.getActiveSeasonId = () => 's1';
    h.ctx.window.crypto = { randomUUID: () => 'trial-event' };
    h.ctx.events = [];
    h.run(`generalTv.enabled = ${connected}; generalTv.lastHello = Date.now(); generalTv.dataContext = generalTvContext();
        generalTv.channel = { postMessage(message) { events.push(message); } };`);
    h.range('new', null, [114, 6]); h.grade('new');
    const total = h.preview().total;
    assert.ok(total > 0);
    await h.save();
    assert.deepEqual(h.state.messages, [{ message: 'حُفظ لأحمد: الجديد: الناس 4 ← الناس 6 (جيد)', type: 'success' }]);
    assert.equal(h.state.confetti, 0);
    for (const id of [...html.matchAll(/id="([^"]*[Cc]elebration[^\"]*Modal)"/g)].map(m => m[1])) {
        assert.equal(h.element(id).classList.contains('hidden'), true, id);
    }
    if (connected) assert.deepEqual(copy(h.ctx.events), [{ type: 'celebrate', id: 'trial-event', name: 'أحمد', added: total, total: 123, rank: 1, period: 'maghrib' }]);
    else assert.deepEqual(h.ctx.events, []);
});

function legacyCelebration(program, method, text) {
    const h = harness(student({}, { name: 'طالب وهمي', lastSurah: 114, lastAyah: 3, history: {} }));
    h.state.program = program; h.state.settings.points = { review: 2, newMemorization: 3 };
    h.reopen(); h.install('calculateRangeStats', 'closeKnightCelebration');
    h.run(source(method, text));
    h.ctx.commitStudentPatch = (student, fields) => { h.state.writes.push({ id: student.id, fields }); return true; };
    for (const [id, value] of Object.entries({ startSurah: 114, startAyah: 4, endSurah: 114, endAyah: 6,
        examStartSurah: 114, examStartAyah: 4, examEndSurah: 114, examEndAyah: 6, examRepetitions: 2 })) h.element(id).value = value;
    h.element('resWeightedPoints').innerText = '22';
    const timers = [];
    h.ctx.setTimeout = (fn, ms) => timers.push({ fn, ms });
    h.run(`${method}()`);
    const snapshot = {
        text: Object.fromEntries(['celebrationTitle', 'celebrationName', 'celebrationPoints', 'celebrationTotalPoints', 'celebrationRank']
            .map(id => [id, [h.element(id).innerText, h.element(id).innerHTML]])),
        classes: h.element('knightCelebrationModal').className,
        confetti: h.state.confetti, timers: timers.map(t => t.ms), writes: h.state.writes.length
    };
    assert.equal(h.element('knightCelebrationModal').classList.contains('hidden'), false);
    assert.equal(snapshot.confetti, 1); assert.equal(snapshot.writes, 1);
    assert.deepEqual(snapshot.timers, [7000]);
    timers[0].fn();
    assert.equal(h.element('knightCelebrationModal').classList.contains('hidden'), true);
    return snapshot;
}

test('trial r1: shared celebration HTML, content, both legacy save paths and close behavior remain identical to 82bf19f', () => {
    const modal = text => text.slice(text.indexOf('    <div id="knightCelebrationModal"'), text.indexOf('    <div id="knightCelebrationModal"') +
        text.slice(text.indexOf('    <div id="knightCelebrationModal"')).search(/\n    <(?:div|!--)/));
    assert.ok(modal(html).includes('celebrationCanvas'));
    assert.equal(modal(html), modal(baseline));
    for (const name of ['saveSmartProgress', 'saveExamPrepProgress', 'saveExamScore', 'closeKnightCelebration'])
        assert.equal(source(name), source(name, baseline), name);
    for (const program of ['summer', 'review-day']) for (const method of ['saveSmartProgress', 'saveExamPrepProgress'])
        assert.deepEqual(legacyCelebration(program, method, html), legacyCelebration(program, method, baseline), `${program}:${method}`);
});

for (const connected of [false, true]) test(`trial r1 browser: saving never activates a celebration overlay or replaces the confirmation; TV connected=${connected}`, async () => {
    const h = await newPage(browser, { width: 1280, list: [{ id: 2, sid: 'trial-2', name: 'أحمد', halaqaId: 'a', lastSurah: 114, lastAyah: 3, history: {} }] });
    try {
        await h.page.evaluate(connected => {
            window.__trial = { messages: [], sent: [], overlays: [], confetti: 0 };
            const toast = showToast;
            showToast = (message, type) => { window.__trial.messages.push({ message, type }); toast(message, type); };
            window.confetti.create = () => () => window.__trial.confetti++;
            const overlays = [...document.querySelectorAll('[id*="CelebrationModal"], [id*="KnightsModal"], #winningGroupModal')];
            new MutationObserver(() => {
                for (const el of overlays) if (getComputedStyle(el).display !== 'none') window.__trial.overlays.push(el.id);
            }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
            generalTv.enabled = connected; generalTv.lastHello = Date.now(); generalTv.dataContext = generalTvContext();
            generalTv.channel = { postMessage(message) { window.__trial.sent.push(message); } };
            openSmartModal(2);
        }, connected);
        await h.page.locator('#quick_new_toAyah').fill('6');
        await h.page.locator('#quick_new_grades').getByRole('button', { name: 'جيد', exact: true }).click();
        await h.page.locator('#generalQuickSaveBtn').click();
        assert.deepEqual(await h.page.evaluate(() => window.__fixture.writes), []);
        assert.equal(await h.page.locator('#generalQuickReviewReminder').isVisible(), true);
        await h.page.locator('#generalQuickSaveBtn').click();
        await h.page.locator('#smartModal').waitFor({ state: 'hidden' });
        const state = await h.page.evaluate(() => window.__trial);
        assert.deepEqual(state.messages, [{ message: 'حُفظ لأحمد: الجديد: الناس 4 ← الناس 6 (جيد)', type: 'success' }]);
        assert.deepEqual(state.overlays, []); assert.equal(state.confetti, 0);
        assert.equal(await h.page.locator('#toastText').innerText(), state.messages[0].message);
        assert.equal(await h.page.locator('#knightCelebrationModal').isVisible(), false);
        assert.equal(state.sent.filter(m => m.type === 'celebrate').length, connected ? 1 : 0);
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

test('trial r1 browser: row reads 2 - خالد, number is on the right and muted; name and numeric search retain order and Enter action', async () => {
    const h = await newPage(browser, { width: 1280, list: answerStudents() });
    try {
        await h.page.evaluate(() => goHome('page-students'));
        const order = await h.page.locator('.gs-number').allTextContents();
        const search = h.page.locator('#generalStudentSearchInput');
        for (const query of ['2', '٢', 'خالد']) {
            await search.fill(query);
            assert.deepEqual(await h.page.locator('.gs-number').allTextContents(), ['2']);
            assert.equal(await h.page.locator('.gs-card td').first().innerText(), '2 - خالد');
        }
        const style = await h.page.locator('.gs-card td').first().evaluate(cell => {
            const number = cell.querySelector('.gs-number'), name = cell.querySelector('.gs-name');
            return { numberRight: number.getBoundingClientRect().left > name.getBoundingClientRect().right,
                color: getComputedStyle(number).color, nameColor: getComputedStyle(name).color,
                muted: getComputedStyle(document.body).getPropertyValue('--general-muted').trim() };
        });
        assert.equal(style.numberRight, true);
        assert.notEqual(style.color, style.nameColor);
        assert.ok(style.muted);
        await search.fill('');
        assert.deepEqual(await h.page.locator('.gs-number').allTextContents(), order);
        await search.fill('2'); await search.press('Enter');
        assert.equal(await h.page.locator('#smartStudentName').innerText(), 'خالد');
        assert.deepEqual(await h.page.evaluate(() => window.__fixture.writes), []);
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

test('trial r1 browser: all shared number/name surfaces change only in general; summer/review-day render exactly as before', async () => {
    const functions = ['renderSettingsStudents', 'openPointsBreakdownModal', 'confirmDelete', 'openSimilarNamesModal',
        'renderExamEntryList', 'openBulkTierAssign', 'openNoLevelModal'];
    for (const program of ['general', 'summer', 'review-day']) {
        const h = await newPage(browser, { width: 1280, program, list: [
            { id: 2, sid: 'trial-2', name: 'خالد', halaqaId: 'a', memorizedJuz: 1, history: {} },
            { id: 3, sid: 'trial-3', name: 'خالد', halaqaId: 'a', memorizedJuz: 1, history: {} }
        ] });
        try {
            const actual = await h.page.evaluate(() => {
                renderSettingsStudents(); openPointsBreakdownModal(2); confirmDelete(2); openSimilarNamesModal();
                renderExamEntryList(); openBulkTierAssign(); openNoLevelModal(students);
                return Object.fromEntries(['settingsStudentsList', 'pbStudentName', 'deleteStudentName', 'similarNamesList',
                    'examEntryContainer', 'bulkTierList', 'noLevelList'].map(id => [id, document.getElementById(id).innerHTML]));
            });
            if (program === 'general') {
                for (const [id, markup] of Object.entries(actual)) {
                    assert.match(markup, /general-student-number[^>]*>2 -/, id);
                    assert.match(markup.replace(/<[^>]+>/g, '').replace(/\s+/g, ' '), /2 - خالد/, id);
                }
            } else {
                for (const name of functions) await h.page.evaluate(source(name, head));
                const old = await h.page.evaluate(() => {
                    renderSettingsStudents(); openPointsBreakdownModal(2); confirmDelete(2); openSimilarNamesModal();
                    renderExamEntryList(); openBulkTierAssign(); openNoLevelModal(students);
                    return Object.fromEntries(['settingsStudentsList', 'pbStudentName', 'deleteStudentName', 'similarNamesList',
                        'examEntryContainer', 'bulkTierList', 'noLevelList'].map(id => [id, document.getElementById(id).innerHTML]));
                });
                assert.deepEqual(actual, old, program);
            }
            assert.deepEqual(await h.page.evaluate(() => window.__fixture.writes), []);
            assert.deepEqual(h.errors, []);
        } finally { await h.close(); }
    }
});
