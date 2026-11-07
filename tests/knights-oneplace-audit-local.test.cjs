// تدقيق الفئة 12: «الفرسان في مكان واحد — الجزء ١» مقابل d51bb42 — كل سطر تغيّر مسجَّل، ولا شيء محميّ تغيّر.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const { changesFrom } = require('./helpers/design-expectation-audit.cjs');
const { beforeKnightsOnePlace } = require('./helpers/knights-oneplace-audit.cjs');
const { source } = require('./helpers/quick-entry-harness.cjs');
const root = path.resolve(__dirname, '..');
const BASE = 'd51bb42';
const sha = text => createHash('sha256').update(text).digest('hex');
const git = (...args) => cp.execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
const original = file => git('show', BASE + ':' + file).replaceAll('\r\n', '\n');
const current = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');

test('category 12 audit: every changed line since d51bb42 is registered and reverses exactly to d51bb42', () => {
    const audit = require('./rules/design-expectation-audit.json');
    assert.equal(audit.knightsOnePlaceBaseline, BASE);
    const changed = git('diff', '--name-only', BASE).trim().split(/\r?\n/).filter(f => f && f !== 'tests/rules/design-expectation-audit.json').sort();
    assert.deepEqual(audit.knightsOnePlaceChanges.map(r => r.file).sort(), changed);
    for (const row of audit.knightsOnePlaceChanges) {
        assert.equal(row.category, 12); assert.equal(row.reason, audit.categories['12']);
        assert.deepEqual({ file: row.file, hunks: row.hunks }, changesFrom(row.file, BASE), row.file);
        assert.equal(sha(original(row.file)), row.beforeSha256, row.file);
        assert.equal(beforeKnightsOnePlace(current(row.file), row.file), original(row.file), row.file);
    }
    const untracked = git('ls-files', '--others', '--exclude-standard').trim().split(/\r?\n/).filter(Boolean).sort();
    assert.deepEqual(audit.knightsOnePlaceAddedFiles.map(r => r.file).sort(), untracked);
    for (const row of audit.knightsOnePlaceAddedFiles) {
        const text = fs.readFileSync(path.join(root, row.file), 'utf8');
        assert.equal(row.category, 12); assert.equal(row.reason, audit.categories['12']);
        assert.equal(sha(text), row.sha256, row.file);
        assert.deepEqual(row.hunks, [{ oldLine: 1, newLine: 1, before: [], after: text.split('\n') }]);
    }
    const mutated = current('index.html').replace("if (panelId === 'setPanelRace' && isGeneralProgram()) return;", "if (panelId === 'setPanelRace' && isGeneralProgram()) return false;");
    assert.notEqual(mutated, current('index.html')); assert.notEqual(beforeKnightsOnePlace(mutated), original('index.html'));
});

test('category 12 audit: protected knights functions, store, TV, rules and answer keys are unchanged since d51bb42', () => {
    const html = current('index.html'), old = original('index.html');
    for (const name of ['dayStats', 'getCumulativeStats', 'getDayHalaqaKnights', 'getWeekNominations', 'rankHalaqaWeekKnights', 'buildWeekKnightsRow', 'ensureWeekKnightsFrozen',
        'lockWeekRows', 'lockKnightsForMessage', 'unfreezeHalaqaWeek', 'renderWeekKnightsReview', 'copyWeeklyKnightsAnnouncement',
        'buildWeeklyKnightsAnnouncement', 'getMostImproved', 'readKnightsPerHalaqa', 'fixGeneralJoinedOn', 'commitProgramSettings', 'goRace'])
        assert.equal(source(name, html), source(name, old), name);
    assert.equal(html.match(/const dayPoints = .*;/)[0], old.match(/const dayPoints = .*;/)[0]);
    for (const file of ['firestore.rules', 'programs-store.js', 'data-store.js', 'general-points.js', 'tv.js', 'tv.html',
        ...['knights-answer-key', 'knights-r2-answer-key', 'board-answer-key', 'homeprep-answer-key', 'home-answer-key'].map(n => 'tests/rules/' + n + '.json')])
        assert.equal(current(file), original(file), file);
});
