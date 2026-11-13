const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const { beforeKnightsTvPoints, beforeKnightsLinesX3, beforeKnightsLastWeek, beforeKnightsOnePlaceP4, beforeKnightsOnePlaceP3,
    beforeKnightsOnePlaceP2, beforeKnightsOnePlace } = require('./helpers/knights-oneplace-audit.cjs');
const { source, harness: quick, copy } = require('./helpers/quick-entry-harness.cjs');

const root = path.resolve(__dirname, '..');
const BASE = 'be3b92f';
const sha = text => createHash('sha256').update(text).digest('hex');
const git = (...args) => cp.execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const original = file => git('show', BASE + ':' + file).replaceAll('\r\n', '\n');
const current = file => beforeKnightsTvPoints(fs.readFileSync(path.join(root, file), 'utf8'), file);

const { changesFrom } = require('./helpers/design-expectation-audit.cjs');

test('category 17 audit: every changed line since be3b92f is registered and reverses exactly', () => {
    const audit = require('./rules/design-expectation-audit.json');
    assert.equal(audit.categories['17'], '"!" بالأسطر: السطر بـ3 للجديد والمراجعة (٢٠٢٦-١١-١٢)');
    assert.equal(audit.knightsLinesX3Baseline, BASE);
    const added = new Set([...audit.knightsLinesX3AddedFiles, ...(audit.knightsTvPointsAddedFiles || []), ...(audit.knightsRisingStarAddedFiles || [])].map(row => row.file));
    const changed = git('diff', '--name-only', BASE).trim().split(/\r?\n/)
        .filter(file => file && file !== 'tests/rules/design-expectation-audit.json' && !added.has(file) && changesFrom(file, BASE).hunks.length).sort();
    assert.deepEqual(audit.knightsLinesX3Changes.map(row => row.file).sort(), changed);
    for (const row of audit.knightsLinesX3Changes) {
        assert.equal(row.category, 17); assert.equal(row.reason, audit.categories['17']);
        assert.deepEqual(row.hunks, changesFrom(row.file, BASE).hunks, row.file);
        assert.equal(row.beforeSha256, sha(original(row.file)), row.file);
        assert.equal(row.sha256, sha(current(row.file)), row.file);
        assert.equal(beforeKnightsLinesX3(current(row.file), row.file), original(row.file), row.file);
    }
    const untracked = git('ls-files', '--others', '--exclude-standard').trim().split(/\r?\n/).filter(Boolean).sort();
    for (const file of untracked) assert.ok(added.has(file), 'Unregistered file: ' + file);
    assert.deepEqual(audit.knightsLinesX3AddedFiles.map(row => row.file).sort(), ['tests/knights-lines-x3-audit-local.test.cjs']);
    for (const row of audit.knightsLinesX3AddedFiles) {
        assert.equal(git('ls-tree', '-r', '--name-only', BASE, '--', row.file).trim(), '', row.file);
        const text = current(row.file);
        assert.equal(row.category, 17); assert.equal(row.reason, audit.categories['17']);
        assert.equal(row.sha256, sha(text), row.file);
        assert.deepEqual(row.hunks, [{ oldLine: 1, newLine: 1, before: [], after: text.split('\n') }], row.file);
    }
    const mutated = current('index.html').replace('const tenth = n => Math.round(n * 10) / 10;', 'const tenth = n => n;');
    assert.notEqual(mutated, current('index.html'));
    assert.notEqual(beforeKnightsLinesX3(mutated), original('index.html'));
    const outside = current('index.html').replace('const currentWeekStart = getWeekStartDate(todayStr);', 'const currentWeekStart = todayStr;');
    assert.notEqual(outside, current('index.html'));
    assert.notEqual(beforeKnightsLinesX3(outside), original('index.html'));
    for (const key of Object.keys(audit).filter(key => !key.startsWith('knightsLinesX3') && !key.startsWith('knightsTvPoints') && !key.startsWith('knightsRisingStar') && key !== 'categories'))
        assert.deepEqual(audit[key], JSON.parse(original('tests/rules/design-expectation-audit.json'))[key], key);
    const categories = { ...audit.categories }; delete categories['17']; delete categories['18']; delete categories['19'];
    assert.deepEqual(categories, JSON.parse(original('tests/rules/design-expectation-audit.json')).categories);
});

test('category 17 audit: calculations, freezing, stores, TV and locked keys are unchanged', () => {
    const html = current('index.html'), old = original('index.html');
    const guide = 'renderGeneralKnightsGuide';
    assert.equal(html.replace(source(guide, html), ''), old.replace(source(guide, old), ''), 'Every line outside the guide');
    for (const name of ['ensureWeekKnightsFrozen', 'knightsEndedWeeks', 'knightsFreezeRow', 'knightsPreviousWeekStart',
        'knightsDisplayWeekStart', 'lockWeekRows', 'lockKnightsForMessage', 'buildWeeklyKnightsAnnouncement',
        'getWeekNominations', 'rankHalaqaWeekKnights', 'buildWeekKnightsRow', 'getDayHalaqaKnights',
        'dayStats', 'getCumulativeStats', 'getMostImproved', 'dayAcceptedWeightTenths', 'knightsDayPointsTenths',
        'getLockedWeekKnights', 'copyWeeklyKnightsAnnouncement', 'renderWeekKnightsReview', 'sendGeneralTvSnapshot'])
        assert.equal(source(name, html), source(name, old), name);
    for (const file of ['firestore.rules', 'programs-store.js', 'data-store.js', 'tv.js', 'tv.html', 'general-points.js',
        'tests/knights-oneplace-local.test.cjs', 'tests/knights-oneplace-p2-local.test.cjs', 'tests/knights-oneplace-p3-local.test.cjs',
        ...['knights-answer-key', 'knights-r2-answer-key', 'board-answer-key', 'homeprep-answer-key', 'home-answer-key'].map(name => 'tests/rules/' + name + '.json')])
        assert.equal(current(file), original(file), file);
});

test('category 17 audit: guide sections 1, 3, 4 and 5 remain literal at be3b92f', () => {
    const name = 'renderGeneralKnightsGuide', now = source(name, current('index.html')), old = source(name, original('index.html'));
    const sections = text => {
        const starts = [...text.matchAll(/\+ '<section>' \+ h3\('[1-5]\./g)].map(match => match.index);
        assert.equal(starts.length, 5);
        return starts.map((start, i) => text.slice(start, starts[i + 1] ?? text.length));
    };
    const before = sections(old), after = sections(now);
    for (const i of [0, 2, 3, 4]) assert.equal(after[i], before[i], 'Section ' + (i + 1));
    assert.notEqual(after[1], before[1]);
    const baseSettings = require('./rules/homeprep-answer-key.json').settings;
    for (const mutate of [() => {}, s => { s.titleRules = { weeklyAttendancePct: 50 }; s.homePrepMinGrade = 'very-good'; },
        s => { s.grades = [...s.grades].reverse(); s.criteria = []; s.workingDays = [0, 1]; }]) {
        const settings = copy(baseSettings); mutate(settings);
        const render = fn => { const h = quick(); h.state.settings = settings; h.run(fn); return h.run('renderGeneralKnightsGuide(getProgramSettings())'); };
        const renderedBefore = render(old).match(/<section>[\s\S]*?<\/section>/g);
        const renderedAfter = render(now).match(/<section>[\s\S]*?<\/section>/g);
        assert.equal(renderedBefore.length, 5); assert.equal(renderedAfter.length, 5);
        for (const i of [0, 2, 3, 4]) assert.equal(renderedAfter[i], renderedBefore[i], 'Rendered section ' + (i + 1));
    }
});

test('category 17 audit: the reverse chain restores every older index baseline exactly', () => {
    const html = current('index.html');
    const { beforeKnightsOwnerAuto } = require('./helpers/knights-owner-auto-audit.cjs');
    const { beforeGeneralKnightsCleanup } = require('./helpers/general-knights-cleanup-audit.cjs');
    const { beforeKnightsRelease } = require('./helpers/knights-release-audit.cjs');
    const { beforeKnightsRound2b, beforeKnightsRound2 } = require('./helpers/board-invariants.cjs');
    for (const [reverse, baseline] of [[beforeKnightsLinesX3, BASE], [beforeKnightsLastWeek, 'fe78763'],
        [beforeKnightsOnePlaceP4, '263c942'], [beforeKnightsOnePlaceP3, '5fbff4e'],
        [beforeKnightsOnePlaceP2, 'a002e0c'], [beforeKnightsOnePlace, 'd51bb42'],
        [beforeKnightsOwnerAuto, '186a18e'], [beforeGeneralKnightsCleanup, '55fd33e'],
        [beforeKnightsRelease, '2d78da2'], [beforeKnightsRound2b, '0c5ec91'], [beforeKnightsRound2, '8880f84']])
        assert.equal(reverse(html, 'index.html'), git('show', baseline + ':index.html').replaceAll('\r\n', '\n'), baseline);
});
