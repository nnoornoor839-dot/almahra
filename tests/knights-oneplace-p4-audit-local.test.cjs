// تدقيق الفئة 15: «الفرسان في مكان واحد — الجزء ٤» (البند 15: نافذة «!») مقابل 263c942 — كل سطر تغيّر مسجَّل، ولا شيء محميّ تغيّر.
// المسموح في الكود: الدليل ونافذته وزر «!»، وسطر titleRules في getProgramSettings (general)، وإخفاء النافذة عند مغادرة general.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const { changesFrom } = require('./helpers/design-expectation-audit.cjs');
const { beforeKnightsOnePlaceP4 } = require('./helpers/knights-oneplace-audit.cjs');
const { source } = require('./helpers/quick-entry-harness.cjs');
const root = path.resolve(__dirname, '..');
const BASE = '263c942';
const sha = text => createHash('sha256').update(text).digest('hex');
const git = (...args) => cp.execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const original = file => git('show', BASE + ':' + file).replaceAll('\r\n', '\n');
const current = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
const SETTINGS_LINE = '                    ...(s?.titleRules ? { titleRules: s.titleRules } : {})';
const HIDE_LINES = ["                const gkHelp = document.getElementById('gkHelpModal');",
    "                if (gkHelp) { gkHelp.classList.remove('flex'); gkHelp.classList.add('hidden'); }",
    "                const gkHelpBody = document.getElementById('gkHelpBody');",
    "                if (gkHelpBody) gkHelpBody.innerHTML = '';"];

test('category 15 audit: every changed line since 263c942 is registered and reverses exactly to 263c942', () => {
    const audit = require('./rules/design-expectation-audit.json');
    assert.equal(audit.knightsOnePlaceP4Baseline, BASE);
    const added = new Set((audit.knightsOnePlaceP4AddedFiles || []).map(r => r.file));
    const changed = git('diff', '--name-only', BASE).trim().split(/\r?\n/)
        .filter(f => f && f !== 'tests/rules/design-expectation-audit.json' && !added.has(f)).sort();
    assert.deepEqual(audit.knightsOnePlaceP4Changes.map(r => r.file).sort(), changed);
    for (const row of audit.knightsOnePlaceP4Changes) {
        assert.equal(row.category, 15); assert.equal(row.reason, audit.categories['15']);
        assert.deepEqual({ file: row.file, hunks: row.hunks }, changesFrom(row.file, BASE), row.file);
        assert.equal(sha(original(row.file)), row.beforeSha256, row.file);
        assert.equal(beforeKnightsOnePlaceP4(current(row.file), row.file), original(row.file), row.file);
    }
    // قبل الالتزام: المضافة غير متتبَّعة؛ بعده: متتبَّعة وليست في 263c942. في الحالين نصها مطابق لما سُجّل.
    const untracked = git('ls-files', '--others', '--exclude-standard').trim().split(/\r?\n/).filter(Boolean);
    for (const file of untracked) assert.ok(added.has(file), 'ملف غير مسجَّل: ' + file);
    for (const row of audit.knightsOnePlaceP4AddedFiles) {
        assert.throws(() => git('cat-file', '-e', BASE + ':' + row.file), undefined, row.file + ' ليس في ' + BASE);
        const text = fs.readFileSync(path.join(root, row.file), 'utf8');
        assert.equal(row.category, 15); assert.equal(row.reason, audit.categories['15']);
        assert.equal(sha(text), row.sha256, row.file);
        assert.deepEqual(row.hunks, [{ oldLine: 1, newLine: 1, before: [], after: text.split('\n') }]);
    }
    const mutated = current('index.html').replace("const days = n => n === 1 ? 'يوماً واحداً'", "const days = n => n === 1 ? 'يوم'");
    assert.notEqual(mutated, current('index.html')); assert.notEqual(beforeKnightsOnePlaceP4(mutated), original('index.html'));
});

test('category 15 audit: getProgramSettings gains only the general titleRules line; applyProgramFeatures only hides and empties the guide outside general', () => {
    const html = current('index.html'), old = original('index.html');
    const settings = source('getProgramSettings', html);
    assert.equal(settings.replace(',\n' + SETTINGS_LINE, ''), source('getProgramSettings', old));
    assert.equal(source('applyProgramFeatures', html).replace(HIDE_LINES.join('\n') + '\n', ''), source('applyProgramFeatures', old));
    // البرامج الأخرى: getProgramSettings لا يُرجع titleRules خارج general (السطر داخل فرع isGeneralProgram).
    assert.ok(settings.indexOf(SETTINGS_LINE) > settings.indexOf('...(isGeneralProgram() ? {'));
    assert.ok(settings.indexOf(SETTINGS_LINE) < settings.indexOf('} : {})\n            };'));
});

test('category 15 audit: protected knights functions, store, TV, rules, answer keys and parts 1–3 acceptance tests are unchanged since 263c942', () => {
    const html = current('index.html'), old = original('index.html');
    for (const name of ['dayStats', 'getCumulativeStats', 'getDayHalaqaKnights', 'getWeekNominations', 'rankHalaqaWeekKnights', 'buildWeekKnightsRow',
        'ensureWeekKnightsFrozen', 'knightsFreezeRow', 'knightsEndedWeeks', 'lockWeekRows', 'lockKnightsForMessage', 'unfreezeHalaqaWeek', 'copyWeeklyKnightsAnnouncement',
        'buildWeeklyKnightsAnnouncement', 'getLockedWeekKnights', 'getMostImproved', 'renderWeekKnightsReview', 'readKnightsPerHalaqa', 'fixGeneralJoinedOn',
        'commitProgramSettings', 'saveGeneralKnightsSettings', 'renderGeneralKnightsOnePlace', 'renderGeneralKnightsCopyPreview', 'renderGeneralKnightsRising',
        'openSettingsSection', 'getGeneralTvSnapshot', 'goRace', 'dayAcceptedWeightTenths', 'knightsDayPointsTenths', 'generalCriteriaChange', 'undoLastGeneralEntry',
        'homePrepQualifies', 'homePrepRejectionMessage', 'saveGeneralQuickEntry', 'renderProgramSettings', 'saveProgramSettings'])
        assert.equal(source(name, html), source(name, old), name);
    assert.equal(html.match(/const dayPoints = .*;/)[0], old.match(/const dayPoints = .*;/)[0]);
    assert.equal(html.match(/const HOMEPREP_SCOPE = .*;/)[0], old.match(/const HOMEPREP_SCOPE = .*;/)[0]);
    for (const file of ['firestore.rules', 'programs-store.js', 'data-store.js', 'general-points.js', 'tv.js', 'tv.html',
        'tests/knights-oneplace-local.test.cjs', 'tests/knights-oneplace-p2-local.test.cjs', 'tests/knights-oneplace-p3-local.test.cjs',
        ...['knights-answer-key', 'knights-r2-answer-key', 'board-answer-key', 'homeprep-answer-key', 'home-answer-key'].map(n => 'tests/rules/' + n + '.json')])
        assert.equal(current(file), original(file), file);
});
