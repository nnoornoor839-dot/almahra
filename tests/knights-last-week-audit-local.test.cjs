const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const { beforeKnightsLastWeek, beforeKnightsOnePlaceP4, beforeKnightsOnePlaceP3,
    beforeKnightsOnePlaceP2, beforeKnightsOnePlace } = require('./helpers/knights-oneplace-audit.cjs');
const { source } = require('./helpers/quick-entry-harness.cjs');

const root = path.resolve(__dirname, '..');
const BASE = 'fe78763';
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

test('category 16 audit: every changed line since fe78763 is registered and reverses exactly', () => {
    const audit = require('./rules/design-expectation-audit.json');
    assert.equal(audit.knightsLastWeekBaseline, BASE);
    const added = new Set(audit.knightsLastWeekAddedFiles.map(row => row.file));
    const changed = git('diff', '--name-only', BASE).trim().split(/\r?\n/)
        .filter(file => file && file !== 'tests/rules/design-expectation-audit.json' && !added.has(file)).sort();
    assert.deepEqual(audit.knightsLastWeekChanges.map(row => row.file).sort(), changed);
    for (const row of audit.knightsLastWeekChanges) {
        assert.equal(row.category, 16); assert.equal(row.reason, audit.categories['16']);
        assert.deepEqual(row.hunks, changesFrom(row.file), row.file);
        assert.equal(row.beforeSha256, sha(original(row.file)), row.file);
        assert.equal(row.sha256, sha(current(row.file)), row.file);
        assert.equal(beforeKnightsLastWeek(current(row.file), row.file), original(row.file), row.file);
    }
    const untracked = git('ls-files', '--others', '--exclude-standard').trim().split(/\r?\n/).filter(Boolean).sort();
    assert.deepEqual([...added].sort(), untracked);
    assert.deepEqual([...added].sort(), ['tests/knights-last-week-audit-local.test.cjs', 'tests/knights-last-week-local.test.cjs']);
    for (const row of audit.knightsLastWeekAddedFiles) {
        assert.equal(git('ls-tree', '-r', '--name-only', BASE, '--', row.file).trim(), '', row.file);
        const text = current(row.file);
        assert.equal(row.category, 16); assert.equal(row.reason, audit.categories['16']);
        assert.equal(row.sha256, sha(text), row.file);
        assert.deepEqual(row.hunks, [{ oldLine: 1, newLine: 1, before: [], after: text.split('\n') }], row.file);
    }
    const mutated = current('index.html').replace('const currentWeekStart = getWeekStartDate(todayStr);', 'const currentWeekStart = todayStr;');
    assert.notEqual(mutated, current('index.html'));
    assert.notEqual(beforeKnightsLastWeek(mutated), original('index.html'));
});

test('category 16 audit: protected calculations, freezing, stores, TV, keys, and acceptance tests are unchanged', () => {
    const html = current('index.html'), old = original('index.html');
    for (const name of ['ensureWeekKnightsFrozen', 'knightsEndedWeeks', 'knightsFreezeRow', 'knightsPreviousWeekStart',
        'lockWeekRows', 'lockKnightsForMessage', 'buildWeeklyKnightsAnnouncement', 'getWeekNominations',
        'rankHalaqaWeekKnights', 'buildWeekKnightsRow', 'getDayHalaqaKnights', 'dayStats', 'getCumulativeStats',
        'getMostImproved', 'dayAcceptedWeightTenths', 'knightsDayPointsTenths'])
        assert.equal(source(name, html), source(name, old), name);
    for (const file of ['firestore.rules', 'programs-store.js', 'data-store.js', 'tv.js', 'tv.html', 'general-points.js',
        'tests/knights-oneplace-local.test.cjs', 'tests/knights-oneplace-p2-local.test.cjs',
        'tests/knights-oneplace-p3-local.test.cjs', 'tests/knights-oneplace-p4-local.test.cjs',
        ...['knights-answer-key', 'knights-r2-answer-key', 'board-answer-key', 'homeprep-answer-key', 'home-answer-key'].map(name => 'tests/rules/' + name + '.json')])
        assert.equal(current(file), original(file), file);
});

test('category 16 audit: display consumers contain only the approved week selection changes', () => {
    const html = current('index.html'), old = original('index.html');
    for (const name of ['getLockedWeekKnights', 'copyWeeklyKnightsAnnouncement', 'renderWeekKnightsReview', 'renderGeneralKnightsCopyPreview']) {
        const before = source(name, old);
        assert.ok(before.includes('knightsPreviousWeekStart()'), name);
        assert.equal(source(name, html), before.replace('knightsPreviousWeekStart()', 'knightsDisplayWeekStart()'), name);
    }
    const tvBefore = source('sendGeneralTvSnapshot', old);
    const tvExpected = tvBefore
        .replace('const season = knightsStoredSeason(), weekStart = knightsPreviousWeekStart(), context = generalTvContext();\n            const rows = season.weekKnightsLog.filter(r => r.weekStart === weekStart);',
            'const season = knightsStoredSeason(), previousWeekStart = knightsPreviousWeekStart(), context = generalTvContext();')
        .replace('if (!season.frozenWeeks?.[weekStart]) {', 'if (!season.frozenWeeks?.[previousWeekStart]) {')
        .replace('            for (const stageId of [...new Set(rows.filter',
            '            const weekStart = knightsDisplayWeekStart();\n            if (!weekStart) return;\n            const rows = season.weekKnightsLog.filter(r => r.weekStart === weekStart);\n            for (const stageId of [...new Set(rows.filter');
    assert.notEqual(tvExpected, tvBefore);
    assert.equal(source('sendGeneralTvSnapshot', html), tvExpected);
    assert.ok(!old.includes('function knightsDisplayWeekStart()'));
    assert.ok(source('knightsDisplayWeekStart', html));
    assert.equal(beforeKnightsLastWeek(html, 'index.html'), old);
});

test('category 16 audit: the reverse chain restores every older index baseline exactly', () => {
    const html = current('index.html');
    for (const [reverse, baseline] of [[beforeKnightsOnePlaceP4, '263c942'], [beforeKnightsOnePlaceP3, '5fbff4e'],
        [beforeKnightsOnePlaceP2, 'a002e0c'], [beforeKnightsOnePlace, 'd51bb42']])
        assert.equal(reverse(html, 'index.html'), git('show', baseline + ':index.html').replaceAll('\r\n', '\n'), baseline);
});
