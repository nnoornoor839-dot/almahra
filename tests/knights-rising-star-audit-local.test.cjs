const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const { beforeKnightsRisingStar, beforeKnightsTvPoints, beforeKnightsLinesX3, beforeKnightsLastWeek, beforeKnightsOnePlaceP4, beforeKnightsOnePlaceP3,
    beforeKnightsOnePlaceP2, beforeKnightsOnePlace } = require('./helpers/knights-oneplace-audit.cjs');
const { source } = require('./helpers/quick-entry-harness.cjs');

const root = path.resolve(__dirname, '..');
const BASE = 'bf6a5e7';
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
// Line range [first, last] (1-based) of a named function in a text.
function range(name, text) {
    const body = source(name, text), start = text.indexOf(body);
    const first = text.slice(0, start).split('\n').length;
    return [first, first + body.split('\n').length - 1];
}
const lineOf = (text, line) => { const i = text.split('\n').indexOf(line); assert.ok(i >= 0, line); return [i + 1, i + 1]; };
const inside = (ranges, first, count) => count === 0 || ranges.some(([a, b]) => first >= a && first + count - 1 <= b);

const CATEGORY = 'النجم الصاعد كل أسبوعين بالحلقة (2026-11-13)';
const NEW_FUNCTIONS = ['risingStarsStored', 'risingStarCycles', 'risingStarCycleAt', 'getApprovedRisingStars', 'rankHalaqaRisingStars',
    'buildRisingStarSheetHtml', 'printRisingStarSheets'];
const EDITED_FUNCTIONS = ['getGeneralTvSnapshot', 'renderHonorBoard', 'renderGeneralKnightsRising', 'renderGeneralKnightsGuide'];

test('category 19 audit: every changed line since bf6a5e7 is registered and reverses exactly', () => {
    const audit = require('./rules/design-expectation-audit.json');
    assert.equal(audit.categories['19'], CATEGORY);
    assert.equal(audit.knightsRisingStarBaseline, BASE);
    const added = new Set(audit.knightsRisingStarAddedFiles.map(row => row.file));
    const changed = git('diff', '--name-only', BASE).trim().split(/\r?\n/)
        .filter(file => file && file !== 'tests/rules/design-expectation-audit.json' && !added.has(file)).sort();
    assert.deepEqual(audit.knightsRisingStarChanges.map(row => row.file).sort(), changed);
    for (const file of ['index.html', 'tv.js', 'programs-store.js']) assert.ok(changed.includes(file), file);
    for (const row of audit.knightsRisingStarChanges) {
        assert.equal(row.category, 19); assert.equal(row.reason, audit.categories['19']);
        assert.deepEqual(row.hunks, changesFrom(row.file), row.file);
        assert.equal(row.beforeSha256, sha(original(row.file)), row.file);
        assert.equal(row.sha256, sha(current(row.file)), row.file);
        assert.equal(beforeKnightsRisingStar(current(row.file), row.file), original(row.file), row.file);
    }
    const untracked = git('ls-files', '--others', '--exclude-standard').trim().split(/\r?\n/).filter(Boolean).sort();
    for (const file of untracked) assert.ok(added.has(file), 'Unregistered file: ' + file);
    assert.deepEqual([...added].sort(), ['tests/knights-rising-star-audit-local.test.cjs', 'tests/knights-rising-star-local.test.cjs']);
    for (const row of audit.knightsRisingStarAddedFiles) {
        assert.equal(git('ls-tree', '-r', '--name-only', BASE, '--', row.file).trim(), '', row.file);
        const text = current(row.file);
        assert.equal(row.category, 19); assert.equal(row.reason, audit.categories['19']);
        assert.equal(row.sha256, sha(text), row.file);
        assert.deepEqual(row.hunks, [{ oldLine: 1, newLine: 1, before: [], after: text.split('\n') }], row.file);
    }
    // طفرة داخل المسجَّل وخارجه تبقى مكشوفة.
    const mutated = current('index.html').replace("record.choice !== 'none'", "record.choice !== 'nope'");
    assert.notEqual(mutated, current('index.html'));
    assert.notEqual(beforeKnightsRisingStar(mutated), original('index.html'));
    const outside = current('index.html').replace('const currentWeekStart = getWeekStartDate(todayStr);', 'const currentWeekStart = todayStr;');
    assert.notEqual(outside, current('index.html'));
    assert.notEqual(beforeKnightsRisingStar(outside), original('index.html'));
    const tvMutated = current('tv.js').replace("if (item.stage) card.append(node('p', 'stage', item.stage));", '');
    assert.notEqual(tvMutated, current('tv.js'));
    assert.notEqual(beforeKnightsRisingStar(tvMutated, 'tv.js'), original('tv.js'));
    const storeMutated = current('programs-store.js').replace("['candidate', 'other', 'none']", "['candidate', 'other']");
    assert.notEqual(storeMutated, current('programs-store.js'));
    assert.notEqual(beforeKnightsRisingStar(storeMutated, 'programs-store.js'), original('programs-store.js'));
    for (const key of Object.keys(audit).filter(key => !key.startsWith('knightsRisingStar') && key !== 'categories'))
        assert.deepEqual(audit[key], JSON.parse(original('tests/rules/design-expectation-audit.json'))[key], key);
    const categories = { ...audit.categories }; delete categories['19'];
    assert.deepEqual(categories, JSON.parse(original('tests/rules/design-expectation-audit.json')).categories);
});

test('category 19 audit: index.html changes only inside the named functions and places; tv.js one line; store additions only', () => {
    const html = current('index.html'), old = original('index.html');
    // الكتلة الجديدة متصلة بعد getMostImproved وقبل تعليق getSeasonLeaders.
    const blockStart = range('getMostImproved', html)[1] + 1;
    const blockEnd = lineOf(html, '        // صدارة الموسم (بديل "الأكثر تقدّماً" حين لا توجد بيانات سابقة)')[0] - 1;
    const oldBlockStart = range('getMostImproved', old)[1] + 1;
    assert.equal(lineOf(old, '        // صدارة الموسم (بديل "الأكثر تقدّماً" حين لا توجد بيانات سابقة)')[0] - 1, oldBlockStart, 'one blank line before the block');
    for (const name of NEW_FUNCTIONS) assert.ok(!old.includes('function ' + name + '('), name);
    for (const name of NEW_FUNCTIONS.filter(name => name !== 'risingStarsStored')) {
        const [a, b] = range(name, html);
        assert.ok(a >= blockStart && b <= blockEnd, name + ' inside the new block');
    }
    const newRanges = [...EDITED_FUNCTIONS.map(name => range(name, html)), range('risingStarsStored', html), [blockStart, blockEnd],
        lineOf(html, '                        <h3 class="font-black text-lg mb-3">النجم الصاعد</h3>'),
        lineOf(html, '    <div id="risingStarPrintArea" dir="rtl"></div>')];
    const comment = lineOf(old, '        // النجم الصاعد لكل فترة بنسخة التلفاز نفسها، بالأسماء فقط.');
    const oldRanges = [...EDITED_FUNCTIONS.map(name => range(name, old)), [comment[0], range('renderGeneralKnightsRising', old)[1]],
        lineOf(old, '                        <h3 class="font-black text-lg mb-3">النجم الصاعد هذا الأسبوع</h3>')];
    assert.equal(html.split('\n')[lineOf(html, '    <div id="risingStarPrintArea" dir="rtl"></div>')[0] - 2], '    <div id="generalWeeklySheetPrintArea" dir="rtl"></div>');
    const hunks = changesFrom('index.html');
    assert.ok(hunks.length);
    for (const h of hunks) {
        assert.ok(inside(oldRanges, h.oldLine, h.before.length), 'old lines outside the named places at ' + h.oldLine);
        assert.ok(inside(newRanges, h.newLine, h.after.length), 'new lines outside the named places at ' + h.newLine);
    }
    assert.match(source('getGeneralTvSnapshot', html), /risingStars: getApprovedRisingStars\(period, nameOf\)/);
    assert.match(source('renderHonorBoard', html), /const improved = isGeneralProgram\(\) \? \[\] : getMostImproved\(5\);/);
    // دوال §1ب بنصها.
    for (const name of ['getMostImproved', 'knightsDayPointsTenths', 'knightsAttendanceState', 'knightsSchoolDates', 'knightsIdentityOrder',
        'dayHasBlockingViolation', 'summarizeRange', 'getCumulativeStats', 'dayStats', 'getDayHalaqaKnights', 'getWeekNominations',
        'rankHalaqaWeekKnights', 'buildWeekKnightsRow', 'buildRevealSteps', 'dayAcceptedWeightTenths', 'topTiedBy',
        'ensureWeekKnightsFrozen', 'knightsEndedWeeks', 'knightsFreezeRow', 'lockWeekRows', 'knightsStoredSeason', 'knightsDisplayWeekStart',
        'getLockedWeekKnights', 'lockKnightsForMessage', 'knightsPreviousWeekStart', 'sendGeneralTvSnapshot', 'renderWeekKnightsReview',
        'buildGeneralWeeklySheetHtml', 'printGeneralWeeklySheets', 'knightsToday'])
        assert.equal(source(name, html), source(name, old), name);
    assert.equal(html.match(/const dayPoints = .*;/)[0], old.match(/const dayPoints = .*;/)[0]);
    // tv.js: سطر risingStars في الرسم وحده، وما قبل قسم الصفحة مطابق.
    const tv = changesFrom('tv.js');
    assert.deepEqual(tv.map(h => [h.oldLine, h.before.length, h.after.length]), [[248, 1, 1]]);
    assert.equal(tv[0].before[0], "                    if (slide.kind === 'risingStars') cardBody.append(node('h3', 'kname', item.name));");
    assert.equal(tv[0].after[0], "                    if (slide.kind === 'risingStars') { if (item.stage) card.append(node('p', 'stage', item.stage)); cardBody.append(node('h3', 'kname', item.name)); }");
    const marker = "if (typeof document !== 'undefined') {";
    const tvNow = current('tv.js'), tvOld = original('tv.js');
    assert.ok(tvNow.includes(marker));
    assert.equal(tvNow.slice(0, tvNow.indexOf(marker)), tvOld.slice(0, tvOld.indexOf(marker)), 'tv.js before the DOM section');
    // programs-store.js: إضافة saveRisingStar وحدها.
    const store = changesFrom('programs-store.js');
    assert.equal(store.length, 1);
    assert.deepEqual(store[0].before, [], 'programs-store.js: additions only');
    assert.match(store[0].after[0], /^    saveRisingStar: async \(programId, seasonId, record\) => mutateWeekKnights\(programId, seasonId, season => \{$/);
    assert.equal(store[0].after.at(-1), '    }),');
    assert.equal(original('programs-store.js').split('\n')[store[0].oldLine - 2], '    },', 'saveRisingStar right after refreezeWeekKnightsRow');
    for (const name of ['mutateWeekKnights', 'checkKnightsSize'])
        assert.equal(source(name, current('programs-store.js')), source(name, original('programs-store.js')), name);
    const keys = fs.readdirSync(path.join(root, 'tests/rules')).filter(name => name.endsWith('-answer-key.json')).map(name => 'tests/rules/' + name);
    assert.ok(keys.length >= 5);
    for (const file of ['tv.html', 'firestore.rules', 'data-store.js', 'general-points.js', ...keys])
        assert.equal(current(file), original(file), file);
});

test('category 19 audit: the reverse chain restores every older index baseline exactly', () => {
    const html = current('index.html');
    const { beforeKnightsOwnerAuto } = require('./helpers/knights-owner-auto-audit.cjs');
    const { beforeGeneralKnightsCleanup } = require('./helpers/general-knights-cleanup-audit.cjs');
    const { beforeKnightsRelease } = require('./helpers/knights-release-audit.cjs');
    const { beforeKnightsRound2b, beforeKnightsRound2 } = require('./helpers/board-invariants.cjs');
    for (const [reverse, baseline] of [[beforeKnightsRisingStar, BASE], [beforeKnightsTvPoints, '6e50320'], [beforeKnightsLinesX3, 'be3b92f'],
        [beforeKnightsLastWeek, 'fe78763'], [beforeKnightsOnePlaceP4, '263c942'], [beforeKnightsOnePlaceP3, '5fbff4e'],
        [beforeKnightsOnePlaceP2, 'a002e0c'], [beforeKnightsOnePlace, 'd51bb42'],
        [beforeKnightsOwnerAuto, '186a18e'], [beforeGeneralKnightsCleanup, '55fd33e'],
        [beforeKnightsRelease, '2d78da2'], [beforeKnightsRound2b, '0c5ec91'], [beforeKnightsRound2, '8880f84']])
        assert.equal(reverse(html, 'index.html'), git('show', baseline + ':index.html').replaceAll('\r\n', '\n'), baseline);
    for (const file of ['tv.js', 'programs-store.js']) assert.equal(beforeKnightsRisingStar(current(file), file), original(file), file);
});
