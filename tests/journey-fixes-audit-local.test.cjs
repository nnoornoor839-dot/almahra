// تدقيق الفئة 20: إصلاحا الرحلة (ح1 تقريب «جيد جداً»، ح2 «يُعاد» في المجاميع، وشارة الآيات §8-1) — 2026-11-13.
// المصدر: notes/features/engine/journey-fixes-card.md §5ج، على سابقة تدقيق الفئة 19 (tests/knights-rising-star-audit-local.test.cjs).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const { beforeSurahSearch, beforeJourneyFixes, beforeKnightsRisingStar, beforeKnightsTvPoints, beforeKnightsLinesX3, beforeKnightsLastWeek, beforeKnightsOnePlaceP4,
    beforeKnightsOnePlaceP3, beforeKnightsOnePlaceP2, beforeKnightsOnePlace } = require('./helpers/knights-oneplace-audit.cjs');
const { source } = require('./helpers/quick-entry-harness.cjs');

const root = path.resolve(__dirname, '..');
const BASE = '274bd05';
const sha = text => createHash('sha256').update(text).digest('hex');
const git = (...args) => cp.execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const original = file => git('show', BASE + ':' + file).replaceAll('\r\n', '\n');
const current = file => beforeSurahSearch(fs.readFileSync(path.join(root, file), 'utf8'), file);

const { changesFrom } = require('./helpers/design-expectation-audit.cjs');
// Line range [first, last] (1-based) of a named function in a text.
function range(name, text) {
    const body = source(name, text), start = text.indexOf(body);
    const first = text.slice(0, start).split('\n').length;
    return [first, first + body.split('\n').length - 1];
}
const inside = (ranges, first, count) => count === 0 || ranges.some(([a, b]) => first >= a && first + count - 1 <= b);

const CATEGORY = 'إصلاحا الرحلة: تقريب جيد جداً و«يُعاد» في المجاميع (2026-11-13)';
const ADDED = ['tests/engine-rounding-local.test.cjs', 'tests/journey-fixes-audit-local.test.cjs', 'tests/records-repeat-local.test.cjs'];
const EDITED_FUNCTIONS = ['generalRecitationTotals', 'updateRecordsBadges'];

test('category 20 audit: every changed line since 274bd05 is registered and reverses exactly', () => {
    const audit = require('./rules/design-expectation-audit.json');
    assert.equal(audit.categories['20'], CATEGORY);
    assert.equal(audit.journeyFixesBaseline, BASE);
    const added = new Set([...audit.journeyFixesAddedFiles, ...(audit.surahSearchAddedFiles || []), ...(audit.teacherAccountsAddedFiles || [])].map(row => row.file));
    const changed = git('diff', '--name-only', BASE).trim().split(/\r?\n/)
        .filter(file => file && file !== 'tests/rules/design-expectation-audit.json' && !added.has(file) && changesFrom(file, BASE).hunks.length).sort();
    assert.deepEqual(audit.journeyFixesChanges.map(row => row.file).sort(), changed);
    for (const file of ['index.html', 'general-points.js']) assert.ok(changed.includes(file), file);
    for (const row of audit.journeyFixesChanges) {
        assert.equal(row.category, 20); assert.equal(row.reason, audit.categories['20']);
        assert.deepEqual(row.hunks, changesFrom(row.file, BASE).hunks, row.file);
        assert.equal(row.beforeSha256, sha(original(row.file)), row.file);
        assert.equal(row.sha256, sha(current(row.file)), row.file);
        assert.equal(beforeJourneyFixes(current(row.file), row.file), original(row.file), row.file);
    }
    const untracked = git('ls-files', '--others', '--exclude-standard').trim().split(/\r?\n/).filter(Boolean).sort();
    for (const file of untracked) assert.ok(added.has(file), 'Unregistered file: ' + file);
    assert.deepEqual(audit.journeyFixesAddedFiles.map(row => row.file).sort(), ADDED);
    for (const row of audit.journeyFixesAddedFiles) {
        assert.equal(git('ls-tree', '-r', '--name-only', BASE, '--', row.file).trim(), '', row.file);
        const text = current(row.file);
        assert.equal(row.category, 20); assert.equal(row.reason, audit.categories['20']);
        assert.equal(row.sha256, sha(text), row.file);
        assert.deepEqual(row.hunks, [{ oldLine: 1, newLine: 1, before: [], after: text.split('\n') }], row.file);
    }
    // طفرة داخل المسجَّل وخارجه تبقى مكشوفة.
    const mutated = current('index.html').replace("|| entry.grade === 'repeat') continue;", "|| entry.grade === 'repeatX') continue;");
    assert.notEqual(mutated, current('index.html'));
    assert.notEqual(beforeJourneyFixes(mutated), original('index.html'));
    const outside = current('index.html').replace('const currentWeekStart = getWeekStartDate(todayStr);', 'const currentWeekStart = todayStr;');
    assert.notEqual(outside, current('index.html'));
    assert.notEqual(beforeJourneyFixes(outside), original('index.html'));
    const pointsMutated = current('general-points.js').replace('Math.round(raw * 1e6) / 1e6', 'Math.round(raw * 1e7) / 1e7');
    assert.notEqual(pointsMutated, current('general-points.js'));
    assert.notEqual(beforeJourneyFixes(pointsMutated, 'general-points.js'), original('general-points.js'));
    for (const key of Object.keys(audit).filter(key => !key.startsWith('journeyFixes') && !key.startsWith('surahSearch') && !key.startsWith('teacherAccounts') && key !== 'categories'))
        assert.deepEqual(audit[key], JSON.parse(original('tests/rules/design-expectation-audit.json'))[key], key);
    const categories = { ...audit.categories }; delete categories['20']; delete categories['22']; delete categories['23']; delete categories['24'];
    assert.deepEqual(categories, JSON.parse(original('tests/rules/design-expectation-audit.json')).categories);
});

test('category 20 audit: index.html changes only inside generalRecitationTotals and updateRecordsBadges; general-points.js line 16 only; the rest as 274bd05', () => {
    const html = current('index.html'), old = original('index.html');
    const hunks = changesFrom('index.html', BASE).hunks;
    assert.equal(hunks.length, 2);
    const newRanges = EDITED_FUNCTIONS.map(name => range(name, html)), oldRanges = EDITED_FUNCTIONS.map(name => range(name, old));
    for (const h of hunks) {
        assert.equal(h.before.length, 1); assert.equal(h.after.length, 1);
        assert.ok(inside(oldRanges, h.oldLine, h.before.length), 'old lines outside the named functions at ' + h.oldLine);
        assert.ok(inside(newRanges, h.newLine, h.after.length), 'new lines outside the named functions at ' + h.newLine);
    }
    assert.equal(hunks[0].before[0], '                    if (!entry || !Object.hasOwn(totals, entry.kind)) continue;');
    assert.equal(hunks[0].after[0], "                    if (!entry || !Object.hasOwn(totals, entry.kind) || entry.grade === 'repeat') continue;");
    assert.equal(hunks[1].before[0], '            students.forEach(s => { totalAyahs += getCumulativeStats(s).totalAyahs; });');
    assert.equal(hunks[1].after[0], '            students.forEach(s => { if (isGeneralProgram()) { const t = generalRecitationTotals(s); totalAyahs += t.new.ayahs + t.review.ayahs; } else totalAyahs += getCumulativeStats(s).totalAyahs; });');
    // general-points.js: السطر 16 وحده، مع سطر تعليق فوقه.
    const points = changesFrom('general-points.js', BASE).hunks;
    assert.deepEqual(points.map(h => [h.oldLine, h.before.length, h.after.length]), [[16, 1, 2]]);
    assert.equal(points[0].before[0], '        return { points: Math.max(0, Math.round(raw * 10) / 10), mult, gradePercent };');
    assert.match(points[0].after[0], /^        \/\/ /);
    assert.equal(points[0].after[1], '        return { points: Math.max(0, Math.round(Math.round(raw * 1e6) / 1e6 * 10) / 10), mult, gradePercent };');
    // دوال §3 بنصها في 274bd05 (ومنها رسالة الأسبوع: §8-2 خارج هذه البطاقة).
    for (const name of ['dayStats', 'getCumulativeStats', 'roundPointTotal', 'computeFrontier', 'computeLastReview', 'dayAcceptedWeightTenths',
        'rankHalaqaRisingStars', 'getGeneralTvSnapshot', 'calculateRangeStats', 'calculateQuran', 'canWriteHistory', 'buildGeneralWeeklyMessage',
        'generalPerformanceStudentWork', 'computeComplexStats', 'exportToExcel', 'renderReportsTable', 'generalRecitationHtml'])
        assert.equal(source(name, html), source(name, old), name);
    for (const name of ['dayPoints', 'measureEntry'])
        assert.equal(html.match(new RegExp(`const ${name} = .*;`))[0], old.match(new RegExp(`const ${name} = .*;`))[0], name);
    const tracked = git('ls-tree', '-r', '--name-only', BASE).trim().split(/\r?\n/);
    const quran = tracked.filter(file => /^quran\/[^/]+\.js$/.test(file));
    const keys = tracked.filter(file => /^tests\/rules\/[^/]+-answer-key\.json$/.test(file));
    assert.ok(quran.length >= 5); assert.ok(keys.length >= 7);
    for (const file of ['tv.js', 'tv.html', 'firestore.rules', 'data-store.js', 'programs-store.js', ...quran, ...keys])
        assert.equal(current(file), original(file), file);
});

test('category 20 audit: the reverse chain restores every older index baseline exactly', () => {
    const html = current('index.html');
    const { beforeKnightsOwnerAuto } = require('./helpers/knights-owner-auto-audit.cjs');
    const { beforeGeneralKnightsCleanup } = require('./helpers/general-knights-cleanup-audit.cjs');
    const { beforeKnightsRelease } = require('./helpers/knights-release-audit.cjs');
    const { beforeKnightsRound2b, beforeKnightsRound2 } = require('./helpers/board-invariants.cjs');
    for (const [reverse, baseline] of [[beforeJourneyFixes, BASE], [beforeKnightsRisingStar, 'bf6a5e7'], [beforeKnightsTvPoints, '6e50320'],
        [beforeKnightsLinesX3, 'be3b92f'], [beforeKnightsLastWeek, 'fe78763'], [beforeKnightsOnePlaceP4, '263c942'], [beforeKnightsOnePlaceP3, '5fbff4e'],
        [beforeKnightsOnePlaceP2, 'a002e0c'], [beforeKnightsOnePlace, 'd51bb42'],
        [beforeKnightsOwnerAuto, '186a18e'], [beforeGeneralKnightsCleanup, '55fd33e'],
        [beforeKnightsRelease, '2d78da2'], [beforeKnightsRound2b, '0c5ec91'], [beforeKnightsRound2, '8880f84']])
        assert.equal(reverse(html, 'index.html'), git('show', baseline + ':index.html').replaceAll('\r\n', '\n'), baseline);
    assert.equal(beforeJourneyFixes(current('general-points.js'), 'general-points.js'), original('general-points.js'));
    assert.equal(beforeKnightsRisingStar(current('general-points.js'), 'general-points.js'), git('show', 'bf6a5e7:general-points.js').replaceAll('\r\n', '\n'));
});
