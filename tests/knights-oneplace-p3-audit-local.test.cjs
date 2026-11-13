// تدقيق الفئة 14: «الفرسان في مكان واحد — الجزء ٣» مقابل 5fbff4e — كل سطر تغيّر مسجَّل، ولا شيء محميّ تغيّر،
// وسطر المخزن الوحيد (رفض إعادة الحسم في general، البند 9) مستثنى بنصه.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const { changesFrom } = require('./helpers/design-expectation-audit.cjs');
const { beforeKnightsOnePlaceP3, beforeKnightsOnePlaceP4 } = require('./helpers/knights-oneplace-audit.cjs');
const { source } = require('./helpers/quick-entry-harness.cjs');
const root = path.resolve(__dirname, '..');
const BASE = '5fbff4e';
const sha = text => createHash('sha256').update(text).digest('hex');
const git = (...args) => cp.execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const original = file => git('show', BASE + ':' + file).replaceAll('\r\n', '\n');
// الفئة 15 (الجزء ٤) تُعكس أولاً، فيرى هذا التدقيق نسخة 263c942 بالضبط.
const current = file => beforeKnightsOnePlaceP4(fs.readFileSync(path.join(root, file), 'utf8'), file);
const STORE_LINE = "        if (programId === 'general') return { success: false, error: 'الحسم نهائي؛ لا تُعاد الحسبة' };";
const PAGE_LINE = "            if (isGeneralProgram()) return { success: false, error: 'الحسم نهائي؛ لا تُعاد الحسبة' };";

test('category 14 audit: every changed line since 5fbff4e is registered and reverses exactly to 5fbff4e', () => {
    const audit = require('./rules/design-expectation-audit.json');
    assert.equal(audit.knightsOnePlaceP3Baseline, BASE);
    // ملفات الفئة 14 المضافة صارت متتبَّعة في 263c942، وملفات الفئة 15 المضافة لها تدقيقها.
    const added = new Set([...audit.knightsOnePlaceP3AddedFiles, ...(audit.knightsOnePlaceP4AddedFiles || []), ...(audit.knightsLastWeekAddedFiles || []), ...(audit.knightsLinesX3AddedFiles || []), ...(audit.knightsTvPointsAddedFiles || []), ...(audit.knightsRisingStarAddedFiles || [])].map(r => r.file));
    const changed = git('diff', '--name-only', BASE).trim().split(/\r?\n/)
        .filter(f => f && f !== 'tests/rules/design-expectation-audit.json' && !added.has(f) && changesFrom(f, BASE).hunks.length).sort();
    assert.deepEqual(audit.knightsOnePlaceP3Changes.map(r => r.file).sort(), changed);
    for (const row of audit.knightsOnePlaceP3Changes) {
        assert.equal(row.category, 14); assert.equal(row.reason, audit.categories['14']);
        assert.deepEqual({ file: row.file, hunks: row.hunks }, changesFrom(row.file, BASE), row.file);
        assert.equal(sha(original(row.file)), row.beforeSha256, row.file);
        assert.equal(beforeKnightsOnePlaceP3(current(row.file), row.file), original(row.file), row.file);
    }
    // المضافة في الجزء ٣ متتبَّعة منذ 263c942: لا وجود لها في 5fbff4e، ونصها بعد عكس الفئة 15 مطابق لما سُجّل.
    for (const row of audit.knightsOnePlaceP3AddedFiles) {
        assert.throws(() => git('cat-file', '-e', BASE + ':' + row.file), undefined, row.file + ' ليس في ' + BASE);
        const text = current(row.file);
        assert.equal(row.category, 14); assert.equal(row.reason, audit.categories['14']);
        assert.equal(sha(text), row.sha256, row.file);
        assert.deepEqual(row.hunks, [{ oldLine: 1, newLine: 1, before: [], after: text.split('\n') }]);
    }
    const mutated = current('index.html').replace(PAGE_LINE, PAGE_LINE.replace('success: false', 'success: true'));
    assert.notEqual(mutated, current('index.html')); assert.notEqual(beforeKnightsOnePlaceP3(mutated), original('index.html'));
});

test('category 14 audit: programs-store.js differs from 5fbff4e only by the general refreeze refusal line; any other store change stays exposed', () => {
    const row = require('./rules/design-expectation-audit.json').knightsOnePlaceP3Changes.find(r => r.file === 'programs-store.js');
    assert.equal(row.hunks.length, 1);
    assert.deepEqual(row.hunks[0].before, []); assert.deepEqual(row.hunks[0].after, [STORE_LINE]);
    assert.equal(current('programs-store.js').replace(STORE_LINE + '\n', ''), original('programs-store.js'));
    const changed = current('programs-store.js').replace("if (old.v !== expect) throw new Error('تغيّر السطر من جهاز آخر؛ أعد المراجعة');", "if (old.v !== expect) throw new Error('نص');");
    assert.notEqual(changed, current('programs-store.js'), 'mutation must exercise production code');
    assert.notEqual(beforeKnightsOnePlaceP3(changed, 'programs-store.js'), original('programs-store.js'), 'unapproved store change remains visible');
});

test('category 14 audit: unfreezeHalaqaWeek differs only by its first-line general refusal; protected knights functions, files and answer keys are unchanged since 5fbff4e', () => {
    const html = current('index.html'), old = original('index.html');
    assert.equal(source('unfreezeHalaqaWeek', html).replace(PAGE_LINE + '\n', ''), source('unfreezeHalaqaWeek', old));
    for (const name of ['dayStats', 'getCumulativeStats', 'getDayHalaqaKnights', 'getWeekNominations', 'rankHalaqaWeekKnights', 'buildWeekKnightsRow',
        'ensureWeekKnightsFrozen', 'knightsFreezeRow', 'lockWeekRows', 'lockKnightsForMessage', 'copyWeeklyKnightsAnnouncement',
        'buildWeeklyKnightsAnnouncement', 'getLockedWeekKnights', 'getMostImproved', 'renderWeekKnightsReview', 'readKnightsPerHalaqa', 'fixGeneralJoinedOn',
        'commitProgramSettings', 'saveGeneralKnightsSettings', 'getGeneralTvSnapshot', 'goRace', 'dayAcceptedWeightTenths', 'generalCriteriaChange', 'undoLastGeneralEntry'])
        assert.equal(source(name, html), source(name, old), name);
    assert.equal(html.match(/const dayPoints = .*;/)[0], old.match(/const dayPoints = .*;/)[0]);
    assert.equal(html.match(/const HOMEPREP_SCOPE = .*;/)[0], old.match(/const HOMEPREP_SCOPE = .*;/)[0]);
    for (const file of ['firestore.rules', 'data-store.js', 'general-points.js', 'tv.js', 'tv.html',
        'tests/knights-oneplace-local.test.cjs', 'tests/knights-oneplace-p2-local.test.cjs',
        ...['knights-answer-key', 'knights-r2-answer-key', 'board-answer-key', 'homeprep-answer-key', 'home-answer-key'].map(n => 'tests/rules/' + n + '.json')])
        assert.equal(current(file), original(file), file);
    // البرامج الأخرى: افتراضات summer وreview-day وgeneral كما هي (homePrepMinGrade غير مضاف: الغائب = good بلا ترحيل).
    const defs = text => require('node:vm').runInNewContext('(' + text.match(/export const PROGRAM_DEFS = ([\s\S]*?);\n/)[1] + ')');
    assert.deepEqual(JSON.parse(JSON.stringify(defs(current('programs-store.js')))), JSON.parse(JSON.stringify(defs(original('programs-store.js')))));
});
