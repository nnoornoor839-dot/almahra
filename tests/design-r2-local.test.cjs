// بيانات وهمية فقط؛ مقارنة فعلية بوظائف commit الجولة الأولى، بلا شبكة.
const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { harness, student, copy, source, html, root, today, savedEntries } = require('./helpers/quick-entry-harness.cjs');
const { newPage } = require('./helpers/t25-browser.cjs');
const { tvInvariant } = require('./helpers/tv-harness.cjs');
const original = cp.execFileSync('git', ['show', '50a97dc:index.html'], { cwd: root, encoding: 'utf8', maxBuffer: 8e6 });
const fixture = () => student({}, { name: 'سعد', direction: 'down', lastSurah: 2, lastAyah: 29,
    history: { [today]: { entries: {}, criteria: { late: -2 }, criteriaPoints: -2, absence: 'excused', note: 'وهمي' } } });
let browser;
before(async () => {
    const playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); });

test('r2: save, calculation and validation keep the baseline source except the approved success prefix and inline-only field errors', () => {
    const oldCelebration = '                if (!missed && calculation.total > 0) celebrateGeneralQuickEntry(students.find(s => s.id === student.id) || student, calculation.total, savedSummary);';
    const tvDisconnect = '                if (!missed && calculation.total > 0 && generalTv.enabled && (generalTv.window?.closed || Date.now() - generalTv.lastHello >= 90000)) clearGeneralTv(true);';
    const oldToast = "showToast(savedSummary + (missed ? ` — على يوم ${dayName}` : ''), 'success');";
    const newToast = "showToast(`حُفظ ل${student.name}: ${savedSummary.replace(/^حُفظ:?\\s*/, '')}` + (missed ? ` — على يوم ${dayName}` : ''), 'success');";
    assert.ok(source('saveGeneralQuickEntry', original).includes(oldToast));
    const oldErrorToast = "                showToast(calculation.errors.map(e => e.message).join(' · '), 'error'); return;";
    const newErrorToast = [
        '                const unplacedErrors = calculation.errors.filter(e => !e.field);',
        "                if (unplacedErrors.length) showToast(unplacedErrors.map(e => e.message).join(' · '), 'error');",
        '                return;'
    ].join('\n');
    assert.ok(source('saveGeneralQuickEntry', original).includes(oldErrorToast));
    assert.equal(source('saveGeneralQuickEntry'), source('saveGeneralQuickEntry', original).replace(oldToast, newToast).replace(oldErrorToast, newErrorToast).replace(oldCelebration, tvDisconnect));
    assert.equal(source('updateGeneralUndoButton'), source('updateGeneralUndoButton', original).replace(
        "                quickSave.textContent = generalUndoInProgress === 'save' ? 'جارٍ الحفظ…' : 'حفظ (Enter ↵)';",
        "                if (generalUndoInProgress === 'save') quickSave.textContent = 'جارٍ الحفظ…';\n                else quickSave.innerHTML = 'حفظ <small>Enter ↵</small>';"));
    for (const name of ['renderGeneralQuickGrades', 'updateGeneralQuickPreview', 'calculateGeneralQuickEntry',
        'buildEntryPatch', 'commitGeneralStudentPatch', 'readGeneralQuickPosition',
        'sendGeneralTvCelebration', 'undoLastGeneralEntry']) {
        assert.equal(source(name), source(name, original), name);
    }
    for (const file of ['general-points.js', 'tv.js', 'tv.html']) {
        assert.equal(tvInvariant(file, fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n')),
            tvInvariant(file, cp.execFileSync('git', ['show', `50a97dc:${file}`], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n')), file);
    }
    assert.equal(fs.readFileSync(path.join(root, 'index.html'), 'utf8').includes('\r'), false);
});

test('r2: field errors stay under their row, focus the first invalid field and prevent writes without a toast', async () => {
    for (const kind of ['new', 'review']) {
        const h = harness(fixture()), before = copy(h.s);
        h.range(kind, kind === 'new' ? null : [2, 17], [2, 300]); h.grade(kind);
        const errors = h.preview().errors;
        assert.ok(errors.length > 0 && errors.every(e => e.field));
        await h.save();
        assert.deepEqual(h.state.messages, []);
        assert.equal(h.element(`quick_${kind}_message`).textContent, errors.map(e => e.message).join(' · '));
        assert.match(h.element(`quick_${kind}_message`).textContent, /286/);
        assert.equal(h.element(errors[0].field).classList.contains('qe-error'), true);
        assert.equal(h.state.focus, errors[0].field);
        assert.equal(h.run('generalQuickEntry.attempted'), true);
        assert.equal(h.element('generalQuickPreview').textContent, 'لا يمكن الحفظ: أكمل ما تحته خط أحمر');
        assert.equal(h.element('generalQuickPreview').classList.contains('qe-error'), true);
        assert.equal(h.state.writes.length, 0);
        assert.deepEqual(h.s, before);
    }
});

test('r2: errors without a field retain their own toast, including alongside inline field errors', async () => {
    // Production currently assigns a field to every calculation error; inject only this future fallback.
    for (const mixed of [false, true]) {
        const h = harness(fixture()), before = copy(h.s);
        if (mixed) { h.range('review', [2, 17], [2, 300]); h.grade('review'); }
        h.run(`const realCalculation = calculateGeneralQuickEntry;
            calculateGeneralQuickEntry = (...args) => {
                const result = realCalculation(...args);
                result.errors.push({ message: 'خطأ عام وهمي' }, { message: 'خطأ عام ثانٍ' });
                return result;
            };`);
        await h.save();
        assert.deepEqual(h.state.messages, [{ message: 'خطأ عام وهمي · خطأ عام ثانٍ', type: 'error' }]);
        if (mixed) {
            assert.match(h.element('quick_review_message').textContent, /286/);
            assert.equal(h.state.focus, 'quick_review_toAyah');
        }
        assert.equal(h.state.writes.length, 0);
        assert.deepEqual(h.s, before);
    }
});

async function saveFixture(baseline = false) {
    const h = harness(fixture());
    if (baseline) {
        for (const name of ['initGeneralQuickEntry', 'celebrateGeneralQuickEntry', 'saveGeneralQuickEntry']) h.run(source(name, original));
        h.reopen();
    }
    h.range('new', null, [2, 37]); h.grade('new');
    h.range('review', [2, 17], [2, 20]); h.grade('review');
    h.run('fulfillGeneralCriteria()');
    const preview = h.preview();
    await h.save();
    assert.equal(h.state.writes.length, 1);
    return { h, preview };
}
// Only generated entry keys and timestamps are excluded; every stored field/value stays compared.
function stableWrite(write) {
    let index = 0;
    const fields = Object.fromEntries(Object.entries(copy(write.fields)).map(([key, value]) => {
        if (key.includes('.entries.')) {
            key = key.replace(/\.entries\.[^.]+$/, '.entries.generated-' + index++);
            delete value.at;
        }
        return [key, value];
    }));
    return { id: write.id, fields };
}
test('r2: new + review + discipline write exactly the baseline payload and identical points', async () => {
    const before = await saveFixture(true), after = await saveFixture();
    assert.deepEqual(stableWrite(after.h.state.writes[0]), stableWrite(before.h.state.writes[0]));
    assert.equal(JSON.stringify(stableWrite(after.h.state.writes[0])), JSON.stringify(stableWrite(before.h.state.writes[0])));
    assert.equal(after.preview.total, before.preview.total);
    assert.deepEqual(savedEntries(after.h).map(e => e.points), savedEntries(before.h).map(e => e.points));
    assert.deepEqual(savedEntries(after.h).map(e => e.kind), ['new', 'review']);
    assert.deepEqual(after.h.state.writes[0].fields[`history.${today}.criteria`], { early: 5, uniform: 3 });
    assert.equal(after.h.state.writes[0].fields[`history.${today}.criteriaPoints`], before.h.state.writes[0].fields[`history.${today}.criteriaPoints`]);
});
test('r2: confirmation names Saad and the trial fix removes the supervisor celebration', async () => {
    const before = await saveFixture(true), after = await saveFixture();
    assert.match(after.h.state.messages.at(-1).message, /^حُفظ لسعد: /);
    assert.equal(after.h.state.messages.at(-1).message, before.h.state.messages.at(-1).message.replace(/^حُفظ: /, 'حُفظ لسعد: '));
    for (const id of ['celebrationTitle', 'celebrationName', 'celebrationPoints', 'celebrationTotalPoints', 'celebrationRank']) {
        assert.equal(after.h.element(id).innerText, '', id);
        assert.equal(after.h.element(id).innerHTML, '', id);
    }
    assert.equal(after.h.element('knightCelebrationModal').classList.contains('hidden'), true);
    assert.equal(before.h.state.confetti, 1);
    assert.equal(after.h.state.confetti, 0);
});
for (const [kind, summary] of [
    ['attendance', 'الحضور فقط'],
    ['discipline', 'الحضور، والانضباط 8'],
    ['position', 'موضع الطالب'],
    ['new', 'الجديد: البقرة 30 ← البقرة 37 (جيد)']
]) test(`r2: success confirmation always names Ahmad for ${kind}`, async () => {
    const h = harness(student({}, { name: 'أحمد', ...(kind === 'position' ? {} : { lastSurah: 2, lastAyah: 29 }) }));
    if (kind === 'discipline') h.run('fulfillGeneralCriteria()');
    if (kind === 'position') {
        h.element('quick_positionSurah').value = 2;
        h.element('quick_positionAyah').value = 29;
        h.run('generalQuickPositionChanged()');
    }
    if (kind === 'new') { h.range('new', null, [2, 37]); h.grade('new'); }
    const calculation = h.preview();
    await h.save();
    assert.equal(h.state.writes.length, 1);
    assert.deepEqual(h.state.messages, [{ message: `حُفظ لأحمد: ${summary}`, type: 'success' }]);
    assert.equal((h.state.messages[0].message.match(/حُفظ/g) || []).length, 1);
    assert.doesNotMatch(h.state.messages[0].message, /:\s*:/);
    assert.equal(h.element('knightCelebrationModal').classList.contains('hidden'), true);
});

test('r2: save button keeps template markup after saving and undo, including pending and locked states', async () => {
    const h = await newPage(browser, { width: 1280, today, list: [{ ...fixture(), halaqaId: 'a' }] });
    try {
        h.page.on('dialog', dialog => dialog.accept());
        const button = h.page.locator('#generalQuickSaveBtn');
        const checkMarkup = async () => {
            assert.equal(await button.innerHTML(), 'حفظ <small>Enter ↵</small>');
            assert.equal(await button.locator('small').textContent(), 'Enter ↵');
            assert.equal(await button.locator('small').evaluate(el => getComputedStyle(el).fontSize), '12px');
        };
        await h.page.evaluate(() => openSmartModal(1));
        await checkMarkup();
        await h.page.evaluate(() => {
            document.getElementById('quick_new_toAyah').value = 37;
            document.getElementById('quick_new_grades').querySelector('button').click();
            const patch = window.almahraData.patchStudent;
            window.almahraData.patchStudent = (...args) => new Promise(resolve => {
                window.__finishPatch = () => resolve(patch(...args));
            });
            window.__saving = saveGeneralQuickEntry();
        });
        assert.equal(await button.textContent(), 'جارٍ الحفظ…');
        assert.equal(await button.locator('small').count(), 0);
        assert.equal(await button.isDisabled(), true);
        assert.equal(await h.page.locator('#generalQuickFields').evaluate(el => el.disabled), true);
        await h.page.evaluate(async () => { window.__finishPatch(); await window.__saving; });
        await checkMarkup();
        assert.equal(await button.isDisabled(), false);
        await h.page.evaluate(() => { closeKnightCelebration(); openSmartModal(1); window.__undoing = undoLastGeneralEntry(); });
        await checkMarkup();
        assert.equal(await button.isDisabled(), true);
        assert.equal(await h.page.locator('#smartUndoBtn').isDisabled(), true);
        await h.page.evaluate(async () => { window.__finishPatch(); await window.__undoing; });
        await checkMarkup();
        assert.equal(await button.isDisabled(), false);
        assert.equal(await h.page.locator('#generalQuickFields').evaluate(el => el.disabled), false);
        assert.equal(await h.page.locator('#smartUndoBtn').isDisabled(), true);
        assert.equal(await h.page.evaluate(() => window.__fixture.writes.length), 2);
        await h.page.evaluate(() => { isWriteLockedView = () => true; updateGeneralUndoButton(); });
        await checkMarkup();
        assert.equal(await button.isDisabled(), true);
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

test('r2: unused grade buttons remain clickable; existing invalid-position disabling stays intact', () => {
    const h = harness(fixture());
    for (const kind of ['new', 'review']) {
        assert.equal(h.element(`quick_${kind}_row`).classList.contains('qe-used'), false);
        assert.ok(h.element(`quick_${kind}_grades`).children.every(b => !b.disabled));
    }
    h.grade('new');
    assert.equal(h.run('generalQuickEntry.grades.new'), 'good');
    const invalid = harness(student({}, { lastSurah: 2, lastAyah: 300 }));
    for (const kind of ['new', 'review']) assert.ok(invalid.element(`quick_${kind}_grades`).children.every(b => b.disabled));
});
test('r2: general presentation uses one surface, stable controls, inline errors and a success card', async () => {
    const h = await newPage(browser, { width: 1280, list: [fixture()] });
    try {
        await h.page.setViewportSize({ width:1280, height:800 });
        await h.page.evaluate(() => openSmartModal(1));
        await h.page.evaluate(() => Promise.all(document.getElementById('smartModal').getAnimations({ subtree:true }).map(a => a.finished)));
        const read = () => h.page.evaluate(() => {
            const el = id => document.getElementById(id), css = id => getComputedStyle(el(id));
            const box = id => { const r = el(id).getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; };
            return { newBg:css('quick_new_row').backgroundColor, criteriaBg:getComputedStyle(el('generalCriteriaAllBtn').parentElement.parentElement).backgroundColor,
                lock:el('quick_new_row').querySelector('label').innerHTML, start:css('quick_new_start').color,
                ayah:box('quick_new_toAyah'), ayahFont:css('quick_new_toAyah').fontSize,
                surah:box('quick_new_toSurah'), grades:box('quick_new_grades'), reviewGrades:box('quick_review_grades'),
                footer:box('generalQuickFooter'), modal:box('generalQuickSection'),
                scroll:el('generalQuickFields').parentElement.scrollHeight - el('generalQuickFields').parentElement.clientHeight,
                unused:[...el('quick_review_grades').children].map(b => ({ disabled:b.disabled, opacity:getComputedStyle(b).opacity })),
                summary:css('generalQuickPreview').color, error:el('quick_review_message').textContent,
                errorBorder:css('quick_review_toAyah').borderTopColor };
        });
        const open = await read();
        assert.equal(open.newBg, 'rgba(0, 0, 0, 0)'); assert.equal(open.criteriaBg, 'rgba(0, 0, 0, 0)');
        assert.doesNotMatch(open.lock, /🔒/); assert.match(open.lock, /fa-lock/);
        assert.equal(open.start, 'rgb(95, 109, 102)');
        assert.ok(open.ayah.width >= 64); assert.equal(open.ayahFont, '18px'); assert.ok(open.surah.width > open.ayah.width);
        assert.ok(open.unused.every(b => !b.disabled && Number(b.opacity) < 1));
        assert.equal(open.scroll, 0); assert.ok(open.modal.y >= 0 && open.modal.y + open.modal.height <= 800);
        await h.page.evaluate(() => {
            document.getElementById('quick_new_toAyah').value = 37;
            document.getElementById('quick_new_grades').querySelector('button').click();
        });
        const used = await read();
        assert.notEqual(used.newBg, open.newBg);
        assert.deepEqual(used.grades, open.grades); assert.deepEqual(used.reviewGrades, open.reviewGrades); assert.deepEqual(used.footer, open.footer);
        await h.page.evaluate(() => {
            document.getElementById('quick_review_fromSurah').value = 2;
            document.getElementById('quick_review_toSurah').value = 2;
            document.getElementById('quick_review_fromAyah').value = 17;
            document.getElementById('quick_review_toAyah').value = 300;
            document.getElementById('quick_review_grades').querySelector('button').click();
        });
        const error = await read();
        assert.match(error.error, /286/); assert.equal(error.errorBorder, 'rgb(160, 61, 56)');
        assert.equal(error.summary, 'rgb(160, 61, 56)'); assert.equal(error.scroll, 0);
        assert.deepEqual(error.reviewGrades, open.reviewGrades); assert.deepEqual(error.footer, open.footer);
        await h.page.evaluate(() => showToast('حُفظ لسعد: تسجيل وهمي', 'success'));
        const card = await h.page.locator('#toastMessage').evaluate(el => {
            const s = getComputedStyle(el); return { bg:s.backgroundColor, border:s.borderTopColor, color:s.color,
                icon:getComputedStyle(el.querySelector('i'), '::before').content };
        });
        assert.equal(card.bg, 'rgb(255, 255, 255)'); assert.equal(card.border, 'rgb(18, 92, 47)');
        assert.equal(card.color, card.border); assert.equal(card.icon, '"\uf058"');
        const rules = await h.page.evaluate(() => {
            const collect = rules => [...rules].flatMap(r => r.cssRules ? collect(r.cssRules) : [r.selectorText]);
            return collect(document.getElementById('general-quick-design').sheet.cssRules);
        });
        assert.ok(rules.every(rule => rule.split(',').every(s => s.trim().startsWith('body.program-general '))));
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});
test('r2: summer and review-day keep their modal markup, functions and styles', async () => {
    const legacy = text => text.slice(text.indexOf('            <div id="smartDailySection"'), text.indexOf('            <div id="smartMasterySection"'));
    assert.equal(legacy(html), legacy(original));
    for (const name of ['saveSmartProgress', 'openSmartModal', 'closeSmartModal', 'switchSmartTab', 'updateSmartSimplification']) assert.equal(source(name), source(name, original), name);
    for (const program of ['summer', 'review-day']) {
        const h = await newPage(browser, { width:1280, program });
        try {
            // Old intensive programs are write-locked; inspect their synthetic view without saving.
            await h.page.evaluate(() => { prepareSchoolDay = () => true; canWriteView = () => true; openSmartModal(1); });
            const styles = () => h.page.locator('#smartModal, #smartModal *').evaluateAll(els => els.map(el => {
                const s = getComputedStyle(el);
                return [el.id, s.display, s.color, s.backgroundColor, s.border, s.padding, s.fontSize, s.width, s.height];
            }));
            const before = await styles();
            await h.page.evaluate(() => document.getElementById('general-quick-design').remove());
            assert.deepEqual(await styles(), before, program);
            assert.equal(await h.page.locator('#smartDailySection').isVisible(), true);
            assert.deepEqual(h.errors, []);
        } finally { await h.close(); }
    }
});
