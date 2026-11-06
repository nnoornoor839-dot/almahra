// Production UI with synthetic stores; no network or real student data.
const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const { newPage, answerStudents, root } = require('./helpers/t25-browser.cjs');
const { html, source, harness, student } = require('./helpers/quick-entry-harness.cjs');
const { tvInvariant } = require('./helpers/tv-harness.cjs');
let browser;
before(async () => {
    const playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); });

test('design r1: general header, home, student counts and IDs use Latin digits; zero absence and action label', async () => {
    const list = answerStudents();
    // Today is synthetic: 3 recited, 5 pending, nobody absent.
    for (const [i, s] of list.entries()) {
        delete s.history['2026-11-22'];
        if ([0, 2, 7].includes(i)) s.history['2026-11-22'] = { attended: true, entries: { fake: { kind: 'new' } } };
    }
    const h = await newPage(browser, { width: 1280, list });
    try {
        assert.equal(await h.page.locator('#hijriDateDisplay').innerText(), 'الأحد، 13 جمادى الآخرة 1448 هـ');
        assert.equal(await h.page.locator('#headerGregorian').innerText(), '22 نوفمبر 2026 م');
        for (const id of ['appHeader', 'generalHome']) assert.doesNotMatch(await h.page.locator('#' + id).innerText(), /[٠-٩]/);
        const today = await h.page.locator('#generalTodayCard').innerText();
        assert.match(today, /لا غياب/); assert.doesNotMatch(today, /بعذر|بغير|أكملهم/);
        await h.page.getByRole('button', { name: /أكمل التسجيل ←/ }).click();
        assert.match(await h.page.locator('.gs-group-count').first().innerText(), /^سمّع 2 من 3$/);
        assert.deepEqual(await h.page.locator('.gs-number').allTextContents(), ['2', '1', '3', '4', '5', '6', '7', '8']);
        assert.equal(await h.page.locator('#generalStudentsSubtitle').innerText(), '8 طلاب · 3 حلقات');
        assert.equal(await h.page.locator('#authUserInfo').isVisible(), false);
        assert.equal(await h.page.locator('#currentEventBadge .fa-caret-down').count(), 1);
        assert.deepEqual(h.errors, []);
        assert.deepEqual(await h.page.evaluate(() => window.__fixture.writes), []);
    } finally { await h.close(); }
});

for (const program of ['summer', 'review-day']) test(`design r1: ${program} retains Arabic header date, user badge and legacy header`, async () => {
    const h = await newPage(browser, { program, width: 1280 });
    try {
        assert.match(await h.page.locator('#hijriDateDisplay').innerText(), /١٣.*١٤٤٨/);
        assert.match(await h.page.locator('#headerGregorian').innerText(), /٢٢.*٢٠٢٦/);
        assert.equal(await h.page.locator('#authUserInfo').isVisible(), true);
        assert.equal(await h.page.locator('.ah-title').isVisible(), true);
        assert.equal(await h.page.locator('#appHeader').evaluate(el => el.classList.contains('general-header')), false);
        assert.match(await h.page.locator('.program-switcher-caret').innerText(), /⌄/);
        assert.equal(await h.page.locator('#authLogoutBtn').evaluate(el => getComputedStyle(el).color), 'rgb(185, 28, 28)');
        await h.page.evaluate(() => goHome('page-students'));
        assert.equal(await h.page.locator('.gs-pagehead').isVisible(), false);
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

test('design r1: search 3 and ٣ finds student 3 without changing order or writing', async () => {
    const h = await newPage(browser, { width: 1280 });
    try {
        await h.page.evaluate(() => goHome('page-students'));
        for (const query of ['3', '٣']) {
            await h.page.locator('#generalStudentSearchInput').fill(query);
            assert.deepEqual(await h.page.locator('.gs-number').allTextContents(), ['3']);
        }
        assert.deepEqual(await h.page.evaluate(() => window.__fixture.writes), []);
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

test('design r1: saved hijri stays Arabic, registration numbers are Latin and persistence statement is unchanged', async () => {
    const h = harness(student({}, { lastSurah: 114, lastAyah: 3, history: {} }));
    h.install('setupDatesAndTimezone');
    h.run("setupDatesAndTimezone(new Date('2026-11-01T09:00:00Z'))");
    const originalHijri = h.run('hijriDateStr');
    assert.match(originalHijri, /[٠-٩]/);
    assert.doesNotMatch(h.element('hijriDateDisplay').innerText, /[٠-٩]/);
    h.reopen(); h.range('new', null, [114, 6]); h.grade('new');
    assert.match(h.element('quick_new_start').textContent, /4/);
    assert.doesNotMatch(h.element('generalQuickPreview').textContent, /[٠-٩٫]/);
    assert.equal(h.element('generalQuickTotal').textContent, String(h.preview().total));
    await h.save();
    assert.equal(h.state.writes[0].fields['history.2026-11-01.hijri'], originalHijri);
    const baseline = cp.execFileSync('git', ['show', '82bf19f:index.html'], { cwd: root, encoding: 'utf8' });
    const savedLine = text => text.split(/\r?\n/).find(line => line.includes("fields[p + 'hijri'] = missed"));
    assert.equal(savedLine(html), savedLine(baseline));
    // Round two owns the registration's structure and style.
    const quick = text => text.match(/<div id="generalQuickSection"[\s\S]*?(?=<div id="smartUndoRow")/)?.[0];
    assert.ok(quick(html) && quick(baseline));
    assert.equal(quick(html).replace('>0</strong>', '>٠</strong>'), quick(baseline));
});

test('design r1: historical Arabic hijri is converted at display only; export and WhatsApp builders remain identical', async () => {
    const list = answerStudents();
    list[0].history['2026-11-18'].attended = true;
    list[0].history['2026-11-18'].hijri = 'الأربعاء، ٩ جمادى الآخرة ١٤٤٨ هـ';
    const h = await newPage(browser, { width: 1280, list });
    try {
        const value = await h.page.evaluate(() => {
            const s = window.__fixture.list[0];
            return { display: getLastActiveHijri(s, ['2026-11-18']), stored: s.history['2026-11-18'].hijri };
        });
        assert.equal(value.display, 'الأربعاء، 9 جمادى الآخرة 1448 هـ');
        assert.equal(value.stored, 'الأربعاء، ٩ جمادى الآخرة ١٤٤٨ هـ');
    } finally { await h.close(); }
    const baseline = cp.execFileSync('git', ['show', '82bf19f:index.html'], { cwd: root, encoding: 'utf8' });
    for (const name of ['exportToExcel', 'buildGeneralWeeklyMessage', 'copyStudentWhatsAppReport', 'generalHomeWhatsapp'])
        assert.equal(source(name), source(name, baseline), name);
});

test('design r2: every expectation edit has an exact reviewed diff and owner-approved category', () => {
    const { changes, digits, ownerText } = require('./helpers/design-expectation-audit.cjs');
    const audit = require('./rules/design-expectation-audit.json');
    const designFiles = ['tests/design-r1-local.test.cjs', 'tests/design-r2-local.test.cjs',
        'tests/helpers/design-expectation-audit.cjs', 'tests/rules/design-expectation-audit.json'];
    const baselineDesignFiles = cp.execFileSync('git', ['ls-tree', '-r', '--name-only', '82bf19f', '--', ...designFiles],
        { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
    const names = cp.execFileSync('git', ['diff', '--name-only', '82bf19f', '--', 'tests'], { cwd: root, encoding: 'utf8' })
        .trim().split(/\r?\n/).filter(Boolean).filter(file => !designFiles.includes(file) || baselineDesignFiles.includes(file));
    assert.deepEqual(names.sort(), audit.files.map(row => row.file).sort(), 'all edited tracked test files are audited');
    for (const file of audit.files) {
        assert.deepEqual(changes(file.file), file, file.file);
        for (const hunk of file.hunks) for (const before of hunk.before.filter(line => line.includes('assert.'))) {
            assert.ok(audit.expectations.some(row => row.file === file.file && row.before === before), `removed assertion remains accounted for: ${before}`);
        }
    }
    for (const row of audit.expectations) {
        assert.ok([1, 2, 3, 4].includes(row.category), `${row.file}:${row.newLine}`);
        if (row.category === 1 && !row.policy) {
            const normalized = digits(row.before).replaceAll('103.5/', '103\\.5/').replaceAll('22.5 نقطة/', '22\\.5 نقطة/');
            assert.equal(row.after, normalized, 'same values and precision, changed numeral representation only');
        } else if (row.category === 2) assert.equal(row.after, ownerText(row.before));
        else if (row.category === 3) assert.ok(row.valuesBefore.length && row.valuesAfter.length, 'structural changes document both sets of values');
        else if (row.category === 4) {
            assert.notEqual(row.after, row.before, 'round two owner text must change');
            assert.equal(row.after, ownerText(row.before, 2), 'only the approved round two success prefix, lock markup or inline error location changes');
        }
    }
    assert.ok(audit.expectations.length > 0);
});

test('design r2: attendance options convert only general labels and preserve stored names and IDs', async () => {
    const halaqa = { id: 'حلقة-١', name: 'حلقة ١', active: true };
    const h = await newPage(browser, { width: 1280, settings: { halaqas: [halaqa] } });
    try {
        await h.page.evaluate(id => openGeneralAbsenceModal(undefined, id), halaqa.id);
        const options = () => h.page.locator('#generalAbsenceHalaqa option').evaluateAll(rows => rows.map(row => ({ text: row.text, value: row.value })));
        assert.deepEqual(await options(), [{ text: 'حلقة 1', value: halaqa.id }]);
        assert.equal(await h.page.locator('#generalAbsenceHalaqa').inputValue(), halaqa.id);
        assert.deepEqual(await h.page.evaluate(() => getProgramSettings().halaqas), [halaqa]);
        // The modal is general-only; exercise its exact option renderer for the other programs.
        const renderer = source('openGeneralAbsenceModal').match(/select\.innerHTML = [\s\S]*?\.join\(''\);/)[0];
        for (const program of ['summer', 'review-day']) {
            await h.page.evaluate(({ renderer, program, halaqa }) => {
                new Function('select', 'getProgramSettings', 'isGeneralProgram', 'escapeHTML', renderer)(
                    document.getElementById('generalAbsenceHalaqa'), () => ({ halaqas: [halaqa] }), () => program === 'general', escapeHTML);
            }, { renderer, program, halaqa });
            assert.deepEqual(await options(), [{ text: 'حلقة ١', value: halaqa.id }]);
        }
        assert.deepEqual(await h.page.evaluate(() => window.__fixture.writes), []);
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

test('design r2: switching programs advances today only through refreshToday and refreshes attendance at midnight', async () => {
    const h = await newPage(browser, { width: 1280, today: '2026-11-22' });
    try {
        const result = await h.page.evaluate(() => {
            openAttendanceEditModal(window.__fixture.list[0].id);
            const FixedDate = Date;
            window.Date = class extends FixedDate {
                constructor(...args) { super(...(args.length ? args : ['2026-11-23T09:00:00Z'])); }
                static now() { return new FixedDate('2026-11-23T09:00:00Z').getTime(); }
            };
            const originalRefresh = refreshToday, originalSetup = setupDatesAndTimezone;
            const originalUpdate = updateAllUIs, originalBadge = updateCurrentEventBadge;
            let refreshDepth = 0, badgeDepth = 0, midnightUpdates = 0;
            const dateChanges = [];
            refreshToday = function () {
                refreshDepth++;
                try { return originalRefresh(); } finally { refreshDepth--; }
            };
            setupDatesAndTimezone = function (...args) {
                const before = todayStr;
                const value = originalSetup(...args);
                if (before !== todayStr) dateChanges.push({ before, after: todayStr, refreshDepth });
                return value;
            };
            updateAllUIs = function () {
                if (refreshDepth) midnightUpdates++;
                return originalUpdate();
            };
            updateCurrentEventBadge = function () {
                if (++badgeDepth > 1) throw new Error('recursive event badge refresh');
                try { return originalBadge(); } finally { badgeDepth--; }
            };
            try {
                openProgram('summer');
                openProgram('review-day');
                openProgram('general');
                const input = document.getElementById('attEditDateInput');
                return { today: todayStr, value: input.value, max: input.max, dateChanges, midnightUpdates,
                    hijri: document.getElementById('hijriDateDisplay').innerText,
                    gregorian: document.getElementById('headerGregorian').innerText };
            } finally {
                refreshToday = originalRefresh; setupDatesAndTimezone = originalSetup;
                updateAllUIs = originalUpdate; updateCurrentEventBadge = originalBadge;
            }
        });
        assert.equal(result.today, '2026-11-23');
        assert.equal(result.value, '2026-11-23');
        assert.equal(result.max, '2026-11-23');
        assert.deepEqual(result.dateChanges, [{ before: '2026-11-22', after: '2026-11-23', refreshDepth: 1 }]);
        assert.equal(result.midnightUpdates, 1);
        assert.doesNotMatch(result.hijri + result.gregorian, /[٠-٩]/);
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

test('design r1: calculation, search, attendance and forbidden files stay identical to 82bf19f', () => {
    const baseline = cp.execFileSync('git', ['show', '82bf19f:index.html'], { cwd: root, encoding: 'utf8' });
    for (const name of ['generalTodaySummary', 'generalStalledMemorization', 'generalRecitationSupport',
        'generalPerformanceTotals', 'generalPerformanceDelta', 'generalPerformanceFollowup', 'generalPerformanceModel',
        'generalHalaqaTodayCounts', 'generalStudentsQuery', 'generalStudentsMatching', 'generalCardTodayState',
        'migrateSettings', 'getAttendanceState']) {
        if (name === 'migrateSettings' && !html.includes('function migrateSettings(')) continue;
        assert.equal(source(name), source(name, baseline), name);
    }
    for (const file of ['firestore.rules', 'programs-store.js', 'general-points.js', 'tv.html', 'tv.js']) {
        const original = cp.execFileSync('git', ['show', '82bf19f:' + file], { cwd: root, encoding: 'utf8', maxBuffer: 8e6 });
        assert.equal(tvInvariant(file, fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n')), tvInvariant(file, original.replaceAll('\r\n', '\n')), file);
    }
});
