// تدقيق الفئة 13: «الفرسان في مكان واحد — الجزء ٢» مقابل a002e0c — كل سطر تغيّر مسجَّل، ولا شيء محميّ تغيّر،
// وسطر tv.js الوحيد (حذف «يتقدّم على نفسه هذا الأسبوع»، البند 14) مستثنى بنصه.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const { changesFrom } = require('./helpers/design-expectation-audit.cjs');
const { beforeKnightsOnePlaceP2, beforeKnightsOnePlaceP3 } = require('./helpers/knights-oneplace-audit.cjs');
const { source } = require('./helpers/quick-entry-harness.cjs');
const root = path.resolve(__dirname, '..');
const BASE = 'a002e0c';
const sha = text => createHash('sha256').update(text).digest('hex');
const git = (...args) => cp.execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const original = file => git('show', BASE + ':' + file).replaceAll('\r\n', '\n');
// الفئة 14 (الجزء ٣) تُعكس أولاً، فيرى هذا التدقيق نسخة 5fbff4e بالضبط.
const current = file => beforeKnightsOnePlaceP3(fs.readFileSync(path.join(root, file), 'utf8'), file);
const TV_OLD = "                    if (slide.kind === 'risingStars') cardBody.append(node('h3', 'kname', item.name), node('p', 'muted', 'يتقدّم على نفسه هذا الأسبوع'));";
const TV_NEW = "                    if (slide.kind === 'risingStars') cardBody.append(node('h3', 'kname', item.name));";

test('category 13 audit: every changed line since a002e0c is registered and reverses exactly to a002e0c', () => {
    const audit = require('./rules/design-expectation-audit.json');
    assert.equal(audit.knightsOnePlaceP2Baseline, BASE);
    // ملفات الفئة 13 المضافة صارت متتبَّعة بعد 5fbff4e، وملفات الفئة 14 المضافة لها تدقيقها.
    const added = new Set([...audit.knightsOnePlaceP2AddedFiles, ...(audit.knightsOnePlaceP3AddedFiles || []), ...(audit.knightsOnePlaceP4AddedFiles || [])].map(r => r.file));
    const changed = git('diff', '--name-only', BASE).trim().split(/\r?\n/)
        .filter(f => f && f !== 'tests/rules/design-expectation-audit.json' && !added.has(f) && changesFrom(f, BASE).hunks.length).sort();
    assert.deepEqual(audit.knightsOnePlaceP2Changes.map(r => r.file).sort(), changed);
    for (const row of audit.knightsOnePlaceP2Changes) {
        assert.equal(row.category, 13); assert.equal(row.reason, audit.categories['13']);
        assert.deepEqual({ file: row.file, hunks: row.hunks }, changesFrom(row.file, BASE), row.file);
        assert.equal(sha(original(row.file)), row.beforeSha256, row.file);
        assert.equal(beforeKnightsOnePlaceP2(current(row.file), row.file), original(row.file), row.file);
    }
    // المضافة في الجزء ٢ متتبَّعة منذ 5fbff4e: لا وجود لها في a002e0c، ونصها بعد عكس الفئة 14 مطابق لما سُجّل.
    for (const row of audit.knightsOnePlaceP2AddedFiles) {
        assert.throws(() => git('cat-file', '-e', BASE + ':' + row.file), undefined, row.file + ' ليس في ' + BASE);
        const text = current(row.file);
        assert.equal(row.category, 13); assert.equal(row.reason, audit.categories['13']);
        assert.equal(sha(text), row.sha256, row.file);
        assert.deepEqual(row.hunks, [{ oldLine: 1, newLine: 1, before: [], after: text.split('\n') }]);
    }
    const mutated = current('index.html').replace("if (!rows.length) { host.innerHTML = '<p>لم يُحسم أسبوع بعد.</p>'; return; }", "if (!rows.length) { host.innerHTML = ''; return; }");
    assert.notEqual(mutated, current('index.html')); assert.notEqual(beforeKnightsOnePlaceP2(mutated), original('index.html'));
});

test('category 13 audit: tv.js differs from a002e0c only by the rising-star subtitle line; any other TV change stays exposed', () => {
    const row = require('./rules/design-expectation-audit.json').knightsOnePlaceP2Changes.find(r => r.file === 'tv.js');
    assert.equal(row.hunks.length, 1);
    assert.deepEqual(row.hunks[0].before, [TV_OLD]); assert.deepEqual(row.hunks[0].after, [TV_NEW]);
    assert.equal(current('tv.js').replace(TV_NEW, TV_OLD), original('tv.js'));
    for (const [from, to] of [[', 15000);', ', 15001);'], ["node('h3', 'kname', item.name));", "node('h3', 'kname', item.name), node('p', 'muted', 'نص'));"]]) {
        const changed = current('tv.js').replace(from, to);
        assert.notEqual(changed, current('tv.js'), 'mutation must exercise production code');
        assert.notEqual(beforeKnightsOnePlaceP2(changed, 'tv.js'), original('tv.js'), 'unapproved TV change remains visible');
    }
});

test('category 13 audit: protected knights functions, store, rules and answer keys are unchanged since a002e0c', () => {
    const html = current('index.html'), old = original('index.html');
    for (const name of ['dayStats', 'getCumulativeStats', 'getDayHalaqaKnights', 'getWeekNominations', 'rankHalaqaWeekKnights', 'buildWeekKnightsRow',
        'ensureWeekKnightsFrozen', 'knightsFreezeRow', 'lockWeekRows', 'lockKnightsForMessage', 'unfreezeHalaqaWeek', 'copyWeeklyKnightsAnnouncement',
        'buildWeeklyKnightsAnnouncement', 'getLockedWeekKnights', 'getMostImproved', 'readKnightsPerHalaqa', 'fixGeneralJoinedOn', 'commitProgramSettings',
        'saveGeneralKnightsSettings', 'getGeneralTvSnapshot', 'goRace'])
        assert.equal(source(name, html), source(name, old), name);
    assert.equal(html.match(/const dayPoints = .*;/)[0], old.match(/const dayPoints = .*;/)[0]);
    for (const file of ['firestore.rules', 'programs-store.js', 'data-store.js', 'general-points.js', 'tv.html',
        ...['knights-answer-key', 'knights-r2-answer-key', 'board-answer-key', 'homeprep-answer-key', 'home-answer-key'].map(n => 'tests/rules/' + n + '.json')])
        assert.equal(current(file), original(file), file);
});
