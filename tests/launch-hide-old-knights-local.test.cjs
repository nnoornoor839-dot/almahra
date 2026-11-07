const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const { newPage, root } = require('./helpers/t25-browser.cjs');
const { source, html } = require('./helpers/quick-entry-harness.cjs');
const { changesFrom } = require('./helpers/design-expectation-audit.cjs');
const tv = require('../tv.js');
const baseline = cp.execFileSync('git', ['show', 'c1bc38f:index.html'], { cwd: root, encoding: 'utf8' });
let browser;
before(async () => {
    const playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); });

test('launch: general snapshot removes only knights; every other field and TV slide is byte-identical', async () => {
    const h = await newPage(browser, { width: 1280 });
    try {
        const result = await h.page.evaluate(oldSource => {
            const oldSnapshot = (0, eval)('(' + oldSource + ')');
            getMostImproved = () => [{ student: students[0] }];
            getHomePrepWeek = () => [{ name: 'تحضير وهمي', points: 10 }];
            getDayTitleCandidates = () => [{ student: students[0], points: 10 }];
            getWeekTitleCandidates = () => [{ student: students[0], points: 10 }];
            honorKnightsLog = [{ dateStr: getBoardDate(), mode: getTiers()[0].id,
                fars: [{ name: 'فارس قديم معتمد' }] }];
            return { old: oldSnapshot(), current: getGeneralTvSnapshot() };
        }, source('getGeneralTvSnapshot', baseline));
        assert.ok(result.old.stages.some(s => s.dayKnights.length && s.weekKnights.length));
        assert.ok(result.old.stages.some(s => s.dayKnights.some(k => k.names.includes('فارس قديم معتمد'))));
        for (const stage of result.current.stages) {
            assert.deepEqual(stage.dayKnights, []); assert.deepEqual(stage.weekKnights, []);
            const previous = result.old.stages.find(s => s.period === stage.period);
            for (const field of ['board', 'prepWeek', 'risingStars']) assert.equal(JSON.stringify(stage[field]), JSON.stringify(previous[field]));
            const oldSlides = tv.makeSlides(result.old, stage.period).filter(s => !['dayKnights', 'weekKnights'].includes(s.kind));
            const slides = tv.makeSlides(result.current, stage.period);
            assert.equal(JSON.stringify(slides), JSON.stringify(oldSlides));
            assert.deepEqual([...new Set(slides.map(s => s.kind))], ['board', 'prepWeek', 'risingStars']);
        }
        const expected = structuredClone(result.old);
        expected.stages.forEach(s => { s.dayKnights = []; s.weekKnights = []; });
        assert.equal(JSON.stringify(result.current), JSON.stringify(expected));
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

test('launch: general hides knight settings and celebrations, keeps honor board open, including archived seasons and program switches', async () => {
    const h = await newPage(browser, { width: 1280 });
    try {
        for (const program of ['general', 'summer', 'review-day', 'general']) {
            const state = await h.page.evaluate(program => {
                openProgram(program);
                document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
                document.getElementById('page-settings').classList.add('active');
                backToSettingsHome();
                const card = document.querySelector('[onclick="openSettingsSection(\'setPanelKnights\')"]');
                const cardDisplay = getComputedStyle(card).display;
                openSettingsSection('setPanelKnights');
                const panel = document.getElementById('setPanelKnights');
                const panelActive = panel.classList.contains('active');
                const panelDisplay = getComputedStyle(panel).display;
                const writesBefore = JSON.stringify(window.__fixture.writes);
                const saves = []; const save = saveCurrentThreeKnights;
                saveCurrentThreeKnights = value => saves.push(value);
                try { launchThreeKnights(); } finally { saveCurrentThreeKnights = save; }
                openHonorBoard();
                const honor = document.getElementById('honorBoardModal');
                const honorOpened = !honor.classList.contains('hidden');
                const honorDisplay = getComputedStyle(honor).display;
                const buttons = [...document.querySelectorAll('[onclick="openHonorBoard()"]')].map(el => getComputedStyle(el).display);
                // CSS must still hide the surfaces if an old active class remains after switching programs.
                panel.classList.add('active');
                const forced = ['setPanelKnights', 'supervisorPanel', 'threeKnightsModal'].map(id => {
                    const el = document.getElementById(id); el.classList.remove('hidden'); el.classList.add('flex');
                    return getComputedStyle(el).display;
                });
                closeHonorBoard(); closeThreeKnights(); backToSettingsHome();
                return { cardDisplay, panelActive, panelDisplay, honorOpened, honorDisplay, buttons, forced, saves,
                    writesUnchanged: writesBefore === JSON.stringify(window.__fixture.writes), locked: isWriteLockedView() };
            }, program);
            if (program === 'general') {
                assert.equal(state.cardDisplay, 'none'); assert.equal(state.panelActive, false);
                assert.equal(state.panelDisplay, 'none'); assert.equal(state.honorOpened, true);
                assert.notEqual(state.honorDisplay, 'none'); assert.equal(state.buttons.length, 2); assert.ok(state.buttons.some(s => s !== 'none'));
                assert.ok(state.forced.every(s => s === 'none')); assert.deepEqual(state.saves, []);
            } else {
                assert.notEqual(state.cardDisplay, 'none'); assert.equal(state.panelActive, true);
                assert.notEqual(state.panelDisplay, 'none'); assert.equal(state.honorOpened, true);
                assert.notEqual(state.honorDisplay, 'none'); assert.ok(state.buttons.some(s => s !== 'none'));
                assert.equal(state.locked, true);
            }
            assert.equal(state.writesUnchanged, true);
        }
        await h.page.evaluate(() => {
            window.almahraPrograms.isCurrentSeasonArchived = () => true;
            updateCurrentEventBadge(); applyArchivedMode(); openSettingsSection('setPanelKnights'); launchThreeKnights();
        });
        assert.equal(await h.page.locator('#generalArchivedHonorButton').isVisible(), true);
        await h.page.locator('#generalArchivedHonorButton').click();
        assert.equal(await h.page.locator('#honorBoardModal').isVisible(), true);
        assert.equal(await h.page.locator('#threeKnightsModal').isVisible(), false);
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

test('launch: honor board keeps exact discipline and progress content; only visible cards reveal with no layout gaps across programs', async () => {
    for (const width of [1280, 390]) {
        const h = await newPage(browser, { width });
        try {
            for (const program of ['general', 'summer', 'review-day', 'general']) {
                const result = await h.page.evaluate(({ program, oldSource }) => {
                    closeHonorBoard(); openProgram(program);
                    getMostImproved = () => [{ student: { name: 'نجم صاعد وهمي' }, growth: 50, pastAvg: 4, nowAvg: 6 }];
                    getDisciplineStars = () => ({ stars: [{ student: { name: 'منضبط وهمي' }, criteriaPoints: 8 }], daysCount: 3 });
                    getDayDisciplineStars = () => [{ student: { name: 'منضبط وهمي' }, criteriaPoints: 8 }];
                    getDayTitleCandidates = () => [{ student: { id: 901, name: 'فارس آلي وهمي' }, points: 10 }];
                    getWeekTitleCandidates = () => [{ student: { id: 902, name: 'فارس أسبوع وهمي' }, points: 20, attended: 4, expected: 4 }];
                    honorKnightsLog = Array.from({ length: 2 }, () => ({ dateStr: getBoardDate(), mode: 'all',
                        fars: [{ id: 900, name: 'فارس قديم معتمد', achievement: 'إنجاز فارس وهمي' }] }));
                    const cards = () => [...document.querySelectorAll('#hbBoard .hb-card')];
                    (0, eval)('(' + oldSource + ')')();
                    const previous = cards().map(c => c.innerHTML);
                    // Capture reveal order/delays without waiting for the 15-second loop.
                    const scheduled = [], nativeTimeout = window.setTimeout;
                    window.setTimeout = (fn, delay) => { scheduled.push({ fn, delay }); return 0; };
                    try { openHonorBoard(); } finally { window.setTimeout = nativeTimeout; }
                    const current = cards().map(c => c.innerHTML);
                    const reveals = scheduled.map(({ fn, delay }) => {
                        const before = new Set(cards().filter(c => c.classList.contains('open')).map(c => c.id));
                        fn();
                        return { delay, ids: cards().filter(c => c.classList.contains('open') && !before.has(c.id)).map(c => c.id) };
                    });
                    const visible = cards().filter(c => getComputedStyle(c).display !== 'none');
                    const board = document.getElementById('hbBoard');
                    const rect = el => { const r = el.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width }; };
                    const result = { previous, current, reveals, visible: visible.map(c => c.id),
                        text: board.innerText, wins: [...board.querySelectorAll('.hb-wins')].filter(c => c.getClientRects().length).length,
                        gap: parseFloat(getComputedStyle(board).gap), direction: getComputedStyle(board).flexDirection,
                        board: rect(board), rects: visible.map(rect) };
                    closeHonorBoard(); return result;
                }, { program, oldSource: source('renderHonorBoard', baseline) });
                assert.deepEqual(result.current, result.previous, program + ': card content unchanged');
                const visible = program === 'general' ? ['hbCardDiscipline', 'hbCardProgress']
                    : program === 'review-day' ? ['hbCardDaily', 'hbCardDiscipline', 'hbCardWeekly']
                    : ['hbCardDaily', 'hbCardDiscipline', 'hbCardWeekly', 'hbCardProgress'];
                assert.deepEqual(result.visible, visible);
                assert.deepEqual(result.reveals, visible.map((id, i) => ({ delay: 600 + i * 1200, ids: [id] })));
                assert.match(result.text, /منضبط وهمي/);
                if (program === 'general') {
                    assert.match(result.text, /نجوم الانضباط/); assert.match(result.text, /النجم الصاعد/);
                    assert.match(result.text, /نجم صاعد وهمي/);
                    assert.doesNotMatch(result.text, /فارس|فرسان|فاز|عدد مرات الفوز/); assert.equal(result.wins, 0);
                } else assert.match(result.text, /فارس قديم معتمد/);
                if (result.direction === 'row') {
                    const rows = result.rects.toSorted((a,b) => a.left - b.left);
                    assert.ok(Math.abs(rows[0].left - result.board.left) < 1);
                    assert.ok(Math.abs(rows.at(-1).right - result.board.right) < 1);
                    for (let i=1; i<rows.length; i++) assert.ok(Math.abs(rows[i].left - rows[i-1].right - result.gap) < 1);
                } else {
                    assert.ok(Math.abs(result.rects[0].top - result.board.top) < 1);
                    assert.ok(Math.abs(result.rects.at(-1).bottom - result.board.bottom) < 1);
                    for (let i=1; i<result.rects.length; i++) assert.ok(Math.abs(result.rects[i].top - result.rects[i-1].bottom - result.gap) < 1);
                }
            }
            assert.deepEqual(h.errors, []);
        } finally { await h.close(); }
    }
});

test('launch: exact audited diff preserves all calculations, persistence, answer keys and other-program function bodies', () => {
    const audit = require('./rules/design-expectation-audit.json');
    assert.equal(audit.categories[8], 'إخفاء الفرسان القديمة قبل الانطلاق باعتماد المالك ٢٠٢٦-١١-٠٧');
    assert.deepEqual(changesFrom('index.html', 'c1bc38f'), { file: 'index.html', hunks: audit.launchHideProductionChanges[0].hunks.map(({ anchor, ...hunk }) => hunk) });
    assert.equal(source('openHonorBoard'), source('openHonorBoard', baseline));
    assert.equal(source('renderHonorBoard'), source('renderHonorBoard', baseline));
    assert.equal(source('launchThreeKnights').replace('            if (isGeneralProgram()) return;\n', ''), source('launchThreeKnights', baseline));
    assert.equal(source('openSettingsSection').replace("            if (panelId === 'setPanelKnights' && isGeneralProgram()) return;\n", ''), source('openSettingsSection', baseline));
    for (const name of ['dayStats', 'summarizeRange', 'topTied', 'getWeekTitleCandidates', 'getDisciplineStars', 'getGeneralTvBoard', 'getHomePrepWeek', 'getMostImproved'])
        assert.equal(source(name), source(name, baseline), name);
    assert.equal(html.match(/const dayPoints = .*;/)[0], baseline.match(/const dayPoints = .*;/)[0]);
    const files = ['data-store.js', 'programs-store.js', 'firestore.rules', 'general-points.js', 'tv.js', 'tv.html',
        ...fs.readdirSync(path.join(root, 'tests/rules')).filter(f => f.endsWith('answer-key.json')).map(f => 'tests/rules/' + f)];
    for (const file of files) assert.deepEqual(fs.readFileSync(path.join(root, file)), cp.execFileSync('git', ['show', 'c1bc38f:' + file], { cwd: root }), file);
    const changedTests = ['tests/board-local.test.cjs', 'tests/homeprep-local.test.cjs', 'tests/step8c-tv-local.test.cjs', 'tests/design-r1-local.test.cjs', 'tests/helpers/board-invariants.cjs', 'tests/step6b-attendance-math-local.test.cjs'];
    assert.deepEqual(audit.launchHideTestChanges, changedTests.map(file => changesFrom(file, 'c1bc38f')));
    for (const row of audit.launchHonorCorrectionTestChanges) {
        assert.equal(row.category, 8); assert.equal(row.reason, audit.categories[8]);
        for (const hunk of row.hunks) assert.ok(fs.readFileSync(path.join(root, row.file), 'utf8').includes(hunk.after.join('\n')));
    }
    for (const row of audit.launchHideExpectationChanges) {
        assert.equal(row.category, 8); assert.equal(row.reason, audit.categories[8]); assert.equal(row.reviewBaseline, 'c1bc38f');
        assert.ok(audit.launchHideTestChanges.some(file => file.file === row.file && file.hunks.some(h => h.before.includes(row.before))));
    }
});
