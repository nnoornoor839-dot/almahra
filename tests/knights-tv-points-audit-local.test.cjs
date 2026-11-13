const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const { beforeKnightsTvPoints, beforeKnightsLinesX3, beforeKnightsLastWeek, beforeKnightsOnePlaceP4, beforeKnightsOnePlaceP3,
    beforeKnightsOnePlaceP2, beforeKnightsOnePlace } = require('./helpers/knights-oneplace-audit.cjs');
const { source } = require('./helpers/quick-entry-harness.cjs');

const root = path.resolve(__dirname, '..');
const BASE = '6e50320';
const sha = text => createHash('sha256').update(text).digest('hex');
const git = (...args) => cp.execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const original = file => git('show', BASE + ':' + file).replaceAll('\r\n', '\n');
const current = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');

function changesFrom(file) {
    const hunks = []; let hunk;
    for (const line of git('diff', '--no-ext-diff', '--unified=0', BASE, '--', file).split(/\r?\n/)) {
        const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
        if (m) { hunk = { oldLine: +m[1] + (m[2] === '0' ? 1 : 0), newLine: +m[3] + (m[4] === '0' ? 1 : 0), before: [], after: [] }; hunks.push(hunk); }
        else if (hunk && line.startsWith('-')) hunk.before.push(line.slice(1));
        else if (hunk && line.startsWith('+')) hunk.after.push(line.slice(1));
    }
    return hunks;
}

test('category 18 audit: every changed line since 6e50320 is registered and reverses exactly', () => {
    const audit = require('./rules/design-expectation-audit.json');
    assert.equal(audit.categories['18'], 'نقاط الفارس على التلفاز (2026-11-13)');
    assert.equal(audit.knightsTvPointsBaseline, BASE);
    const added = new Set(audit.knightsTvPointsAddedFiles.map(row => row.file));
    const changed = git('diff', '--name-only', BASE).trim().split(/\r?\n/)
        .filter(file => file && file !== 'tests/rules/design-expectation-audit.json' && !added.has(file)).sort();
    assert.deepEqual(audit.knightsTvPointsChanges.map(row => row.file).sort(), changed);
    for (const file of ['index.html', 'tv.js', 'tv.html']) assert.ok(changed.includes(file), file);
    for (const row of audit.knightsTvPointsChanges) {
        assert.equal(row.category, 18); assert.equal(row.reason, audit.categories['18']);
        assert.deepEqual(row.hunks, changesFrom(row.file), row.file);
        assert.equal(row.beforeSha256, sha(original(row.file)), row.file);
        assert.equal(row.sha256, sha(current(row.file)), row.file);
        assert.equal(beforeKnightsTvPoints(current(row.file), row.file), original(row.file), row.file);
    }
    const untracked = git('ls-files', '--others', '--exclude-standard').trim().split(/\r?\n/).filter(Boolean).sort();
    for (const file of untracked) assert.ok(added.has(file), 'Unregistered file: ' + file);
    assert.deepEqual([...added].sort(), ['tests/knights-tv-points-audit-local.test.cjs', 'tests/knights-tv-points-local.test.cjs']);
    for (const row of audit.knightsTvPointsAddedFiles) {
        assert.equal(git('ls-tree', '-r', '--name-only', BASE, '--', row.file).trim(), '', row.file);
        const text = current(row.file);
        assert.equal(row.category, 18); assert.equal(row.reason, audit.categories['18']);
        assert.equal(row.sha256, sha(text), row.file);
        assert.deepEqual(row.hunks, [{ oldLine: 1, newLine: 1, before: [], after: text.split('\n') }], row.file);
    }
    const mutated = current('index.html').replace('points: row.knights.map(s => s.weekPointsTenths / 10),', 'points: row.knights.map(s => s.weekPointsTenths),');
    assert.notEqual(mutated, current('index.html'));
    assert.notEqual(beforeKnightsTvPoints(mutated), original('index.html'));
    const outside = current('index.html').replace('const currentWeekStart = getWeekStartDate(todayStr);', 'const currentWeekStart = todayStr;');
    assert.notEqual(outside, current('index.html'));
    assert.notEqual(beforeKnightsTvPoints(outside), original('index.html'));
    const tvMutated = current('tv.js').replace("ar(item.points[i]) + ' نقطة'", 'ar(item.points[i])');
    assert.notEqual(tvMutated, current('tv.js'));
    assert.notEqual(beforeKnightsTvPoints(tvMutated, 'tv.js'), original('tv.js'));
    for (const key of Object.keys(audit).filter(key => !key.startsWith('knightsTvPoints') && key !== 'categories'))
        assert.deepEqual(audit[key], JSON.parse(original('tests/rules/design-expectation-audit.json'))[key], key);
    const categories = { ...audit.categories }; delete categories['18'];
    assert.deepEqual(categories, JSON.parse(original('tests/rules/design-expectation-audit.json')).categories);
});

test('category 18 audit: calculations, selection, freezing, stores and locked keys are unchanged', () => {
    const html = current('index.html'), old = original('index.html');
    const strip = text => ['getGeneralTvSnapshot', 'getLockedWeekKnights'].reduce((t, name) => t.replace(source(name, t), ''), text);
    assert.equal(strip(html), strip(old), 'Every line outside getGeneralTvSnapshot and getLockedWeekKnights');
    for (const name of ['knightsDayPointsTenths', 'getDayHalaqaKnights', 'getWeekNominations', 'rankHalaqaWeekKnights',
        'buildWeekKnightsRow', 'dayAcceptedWeightTenths', 'topTiedBy', 'buildRevealSteps', 'dayStats', 'getCumulativeStats',
        'getMostImproved', 'ensureWeekKnightsFrozen', 'knightsEndedWeeks', 'knightsFreezeRow', 'lockWeekRows',
        'lockKnightsForMessage', 'knightsPreviousWeekStart', 'knightsDisplayWeekStart', 'sendGeneralTvSnapshot'])
        assert.equal(source(name, html), source(name, old), name);
    assert.equal(html.match(/const dayPoints = .*;/)[0], old.match(/const dayPoints = .*;/)[0]);
    for (const file of ['firestore.rules', 'programs-store.js', 'data-store.js', 'general-points.js',
        ...['knights-answer-key', 'knights-r2-answer-key', 'board-answer-key', 'homeprep-answer-key', 'home-answer-key'].map(name => 'tests/rules/' + name + '.json')])
        assert.equal(current(file), original(file), file);
    const marker = "if (typeof document !== 'undefined') {";
    const tvNow = current('tv.js'), tvOld = original('tv.js');
    assert.ok(tvNow.includes(marker));
    assert.equal(tvNow.slice(0, tvNow.indexOf(marker)), tvOld.slice(0, tvOld.indexOf(marker)), 'tv.js before the DOM section');
    const css = changesFrom('tv.html');
    assert.ok(css.length);
    for (const hunk of css) {
        assert.deepEqual(hunk.before, [], 'tv.html: additions only (.kpoints, and the tie sizes by manager decision 2026-11-13)');
        for (const line of hunk.after) assert.match(line, /^\.card(\.day-knight|\.tie)? \.kpoints[ {]|^\.card\.tie \.kname \{/, line);
    }
});

test('category 18 audit: the reverse chain restores every older index baseline exactly', () => {
    const html = current('index.html');
    const { beforeKnightsOwnerAuto } = require('./helpers/knights-owner-auto-audit.cjs');
    const { beforeGeneralKnightsCleanup } = require('./helpers/general-knights-cleanup-audit.cjs');
    const { beforeKnightsRelease } = require('./helpers/knights-release-audit.cjs');
    const { beforeKnightsRound2b, beforeKnightsRound2 } = require('./helpers/board-invariants.cjs');
    for (const [reverse, baseline] of [[beforeKnightsTvPoints, BASE], [beforeKnightsLinesX3, 'be3b92f'], [beforeKnightsLastWeek, 'fe78763'],
        [beforeKnightsOnePlaceP4, '263c942'], [beforeKnightsOnePlaceP3, '5fbff4e'],
        [beforeKnightsOnePlaceP2, 'a002e0c'], [beforeKnightsOnePlace, 'd51bb42'],
        [beforeKnightsOwnerAuto, '186a18e'], [beforeGeneralKnightsCleanup, '55fd33e'],
        [beforeKnightsRelease, '2d78da2'], [beforeKnightsRound2b, '0c5ec91'], [beforeKnightsRound2, '8880f84']])
        assert.equal(reverse(html, 'index.html'), git('show', baseline + ':index.html').replaceAll('\r\n', '\n'), baseline);
    for (const file of ['tv.js', 'tv.html']) assert.equal(beforeKnightsTvPoints(current(file), file), original(file), file);
});
