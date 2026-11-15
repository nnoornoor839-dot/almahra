// تدقيق الفئة 22: بحث السورة بالكتابة (2-10) والرجوع التلقائي لآخر آية (2-9) في التسجيل السريع — 2026-11-16.
// المصدر: notes/features/engine/surah-search-card.md (§3-1، §3-2، §3-3)، على نمط تدقيق page-field-audit-local في الفرع page-field.
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
const BASE = '24d0f17';
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
const inside = (ranges, first, count) => count === 0 || ranges.some(([a, b]) => first >= a && first + count - 1 <= b);
// Every line on its own inside one of the ranges (a hunk may span adjacent named places).
const eachInside = (ranges, first, count) => Array.from({ length: count }, (_, i) => first + i).every(line => inside(ranges, line, 1));
const lineOf = (text, line) => { const i = text.split('\n').indexOf(line); assert.ok(i >= 0, line); return [i + 1, i + 1]; };

const CATEGORY = 'بحث السورة بالكتابة والرجوع لآخر آية في التسجيل السريع (2026-11-16)';
const ADDED = ['tests/surah-search-audit-local.test.cjs', 'tests/surah-search-local.test.cjs'];
// آلية السلسلة وحدها (نمط الفئة 20 في 24d0f17)، بإذن المالك القائم 2026-11-15 بالنطاق نفسه.
const CHAIN_FILES = ['tests/helpers/design-expectation-audit.cjs', 'tests/helpers/knights-oneplace-audit.cjs', 'tests/journey-fixes-audit-local.test.cjs',
    'tests/knights-last-week-audit-local.test.cjs', 'tests/knights-lines-x3-audit-local.test.cjs', 'tests/knights-oneplace-audit-local.test.cjs',
    'tests/knights-oneplace-p2-audit-local.test.cjs', 'tests/knights-oneplace-p3-audit-local.test.cjs', 'tests/knights-oneplace-p4-audit-local.test.cjs',
    'tests/knights-owner-auto-local.test.cjs', 'tests/knights-rising-star-audit-local.test.cjs', 'tests/knights-tv-points-audit-local.test.cjs'];
const EDITED_FUNCTIONS = ['initGeneralQuickEntry', 'generalQuickPositionChanged', 'clearGeneralQuickSection', 'quickSurahChanged', 'renderGeneralFrontierFix', 'updateFrontierFixAyah'];
const NEW_FUNCTIONS = ['quickAyahInput', 'normalizeSurahQuery', 'surahAliases', 'surahMatches', 'mountSurahPicker', 'refreshSurahPicker',
    'surahPickerOpen', 'surahPickerMark', 'surahPickerKey', 'surahPickerChoose', 'surahPickerClose', 'surahPickerPlace'];
const CSS_HEAD = '    /* 2-10: بحث السورة بالكتابة؛ القائمة الأصلية تبقى مصدر القيمة ومخفية بصرياً، وفوقها الحقل وزر ▾ وقائمة النتائج (أزرار 44px، 8 نتائج ظاهرة ثم تمرير). */';
const CSS_ANCHOR = '        #generalCriteriaState { flex-basis: 100%; } .smart-general #criteriaList { grid-template-columns: minmax(0, 1fr); }';
const FIX_BEFORE = '                        <label>الآية<input id="frontierFixAyah" type="number" min="1" step="1" class="w-full p-3 border rounded-xl"></label>';
const ADDED_LINES = {
    initGeneralQuickEntry: ["            for (const id of ['quick_positionSurah', 'quick_new_toSurah', 'quick_review_fromSurah', 'quick_review_toSurah']) mountSurahPicker(document.getElementById(id));"],
    generalQuickPositionChanged: ["            else if (input.value.trim() !== '' && Number(input.value) > Number(input.max)) input.value = input.max;",
        "            refreshSurahPicker(document.getElementById('quick_positionSurah')); refreshSurahPicker(document.getElementById('quick_new_toSurah'));"],
    clearGeneralQuickSection: ['                refreshSurahPicker(document.getElementById(`quick_${kind}_${edge}Surah`));'],
    quickSurahChanged: ['            refreshSurahPicker(document.getElementById(`quick_${kind}_${edge}Surah`));'],
    renderGeneralFrontierFix: ["            mountSurahPicker(document.getElementById('frontierFixSurah'));"],
    updateFrontierFixAyah: ["            refreshSurahPicker(document.getElementById('frontierFixSurah'));"],
};

test('category 22 audit: every changed line since 24d0f17 is registered and reverses exactly', () => {
    const audit = require('./rules/design-expectation-audit.json');
    assert.equal(audit.categories['22'], CATEGORY);
    assert.equal(audit.surahSearchBaseline, BASE);
    const added = new Set(audit.surahSearchAddedFiles.map(row => row.file));
    const changed = git('diff', '--name-only', BASE).trim().split(/\r?\n/)
        .filter(file => file && file !== 'tests/rules/design-expectation-audit.json' && !added.has(file)).sort();
    assert.deepEqual(audit.surahSearchChanges.map(row => row.file).sort(), changed);
    assert.deepEqual(changed, ['index.html', 'tests/helpers/quick-entry-harness.cjs', ...CHAIN_FILES].sort());
    // ملفات السلسلة: كل سطر مضاف يخص آلية الفئة 22 وحدها، ولا يُحذف إلا ما استُبدل.
    // تدقيق الفئة 20 وحده يأخذ نمط 24d0f17 في تدقيق الفئة 19 حرفياً: changesFrom المحلية (10 أسطر) ← require المساعد، وكل نداء لها يمرّ بـ BASE.
    const JOURNEY_PATTERN = [
        [git('show', BASE + ':tests/journey-fixes-audit-local.test.cjs').replaceAll('\r\n', '\n').split('\n').slice(19, 29), ["const { changesFrom } = require('./helpers/design-expectation-audit.cjs');"]],
        [["        .filter(file => file && file !== 'tests/rules/design-expectation-audit.json' && !added.has(file)).sort();"],
            ["        .filter(file => file && file !== 'tests/rules/design-expectation-audit.json' && !added.has(file) && changesFrom(file, BASE).hunks.length).sort();"]],
        [['        assert.deepEqual(row.hunks, changesFrom(row.file), row.file);'], ['        assert.deepEqual(row.hunks, changesFrom(row.file, BASE).hunks, row.file);']],
        [['    assert.deepEqual([...added].sort(), ADDED);'], ['    assert.deepEqual(audit.journeyFixesAddedFiles.map(row => row.file).sort(), ADDED);']],
        [["    const hunks = changesFrom('index.html');"], ["    const hunks = changesFrom('index.html', BASE).hunks;"]],
        [["    const points = changesFrom('general-points.js');"], ["    const points = changesFrom('general-points.js', BASE).hunks;"]],
    ];
    assert.equal(JOURNEY_PATTERN[0][0][0], 'function changesFrom(file) {');
    assert.equal(JOURNEY_PATTERN[0][0][9], '}');
    for (const file of CHAIN_FILES) for (const h of changesFrom(file)) {
        if (file === 'tests/journey-fixes-audit-local.test.cjs' && JOURNEY_PATTERN.some(([before, after]) => JSON.stringify([h.before, h.after]) === JSON.stringify([before, after]))) continue;
        assert.ok(h.after.length >= h.before.length, file + ' removes lines at ' + h.oldLine);
        // سطر نُقل كما هو إلى فرع لاحق في الشرط نفسه (تتمة الشرط الثلاثي بعد فرع 274bd05) يُقبل: نصه بعد المسافات البادئة و«const text =» أو «:» مطابق لسطر محذوف في الهَنك نفسه.
        const moved = line => line.trim().replace(/^(?:const text =|:)\s*/, '');
        const removed = new Set(h.before.map(moved));
        for (const line of h.after.filter(line => !h.before.includes(line) && !removed.has(moved(line))))
            assert.match(line, /surahSearch|beforeSurahSearch|SurahSearch|categories\['22'\]|'274bd05'|^\s*(?:\/\/ Category 22|text = text\.replaceAll\('\\r\\n', '\\n'\);$|\}$)/, file + ': ' + line);
    }
    for (const row of audit.surahSearchChanges) {
        assert.equal(row.category, 22); assert.equal(row.reason, audit.categories['22']);
        assert.deepEqual(row.hunks, changesFrom(row.file), row.file);
        assert.equal(row.beforeSha256, sha(original(row.file)), row.file);
        assert.equal(row.sha256, sha(current(row.file)), row.file);
        assert.equal(beforeSurahSearch(current(row.file), row.file), original(row.file), row.file);
    }
    const untracked = git('ls-files', '--others', '--exclude-standard').trim().split(/\r?\n/).filter(Boolean).sort();
    for (const file of untracked) assert.ok(added.has(file), 'Unregistered file: ' + file);
    assert.deepEqual([...added].sort(), ADDED);
    for (const row of audit.surahSearchAddedFiles) {
        assert.equal(git('ls-tree', '-r', '--name-only', BASE, '--', row.file).trim(), '', row.file);
        const text = current(row.file);
        assert.equal(row.category, 22); assert.equal(row.reason, audit.categories['22']);
        assert.equal(row.sha256, sha(text), row.file);
        assert.deepEqual(row.hunks, [{ oldLine: 1, newLine: 1, before: [], after: text.split('\n') }], row.file);
    }
    // طفرة داخل المسجَّل وخارجه تبقى مكشوفة.
    const mutated = current('index.html').replace('surahMatches(text).slice(0, 8)', 'surahMatches(text).slice(0, 9)');
    assert.notEqual(mutated, current('index.html'));
    assert.notEqual(beforeSurahSearch(mutated), original('index.html'));
    const outside = current('index.html').replace('const currentWeekStart = getWeekStartDate(todayStr);', 'const currentWeekStart = todayStr;');
    assert.notEqual(outside, current('index.html'));
    assert.notEqual(beforeSurahSearch(outside), original('index.html'));
    for (const key of Object.keys(audit).filter(key => !key.startsWith('surahSearch') && key !== 'categories'))
        assert.deepEqual(audit[key], JSON.parse(original('tests/rules/design-expectation-audit.json'))[key], key);
    const categories = { ...audit.categories }; delete categories['22'];
    assert.deepEqual(categories, JSON.parse(original('tests/rules/design-expectation-audit.json')).categories);
});

test('category 22 audit: index.html changes only in the named functions, the new picker functions, one CSS block and #frontierFixAyah; the rest as 24d0f17', () => {
    const html = current('index.html'), old = original('index.html'), lines = html.split('\n');
    const hunks = changesFrom('index.html');
    // كل دالة جديدة يسبقها سطر تعليق واحد يشرحها.
    const newFunctionRanges = NEW_FUNCTIONS.map(name => { const [a, b] = range(name, html); assert.match(lines[a - 2], /^        \/\/ 2-(?:9|10): /, name); return [a - 1, b]; });
    const newRanges = [...EDITED_FUNCTIONS.map(name => range(name, html)), ...newFunctionRanges], oldRanges = EDITED_FUNCTIONS.map(name => range(name, old));
    // كتلة CSS واحدة مضافة بعد قاعدة ≤600px القائمة وقبل </style> مباشرة؛ كل سطر فيها يخص صنفاً .sp-.
    const [cssFirst] = lineOf(html, CSS_HEAD), cssLast = lines.indexOf('    </style>', cssFirst - 1);
    assert.equal(lines[cssFirst - 3], CSS_ANCHOR); assert.equal(lines[cssFirst - 2], '    }');
    for (const line of lines.slice(cssFirst, cssLast)) assert.match(line, /\.sp-(?:wrap|search|toggle|list|opt|empty)\b/, line);
    const cssNew = [cssFirst, cssLast], fixOld = lineOf(old, FIX_BEFORE), fixNew = lineOf(html, FIX_BEFORE.replace('step="1" class=', 'step="1" oninput="updateFrontierFixAyah()" class='));
    for (const h of hunks) {
        assert.ok(inside([...oldRanges, fixOld], h.oldLine, h.before.length), 'old lines outside the named places at ' + h.oldLine);
        assert.ok(eachInside([...newRanges, cssNew, fixNew], h.newLine, h.after.length), 'new lines outside the named places at ' + h.newLine);
    }
    // سطران مستبدلان فقط: سطر rangeFields (oninput الآية ← quickAyahInput) و#frontierFixAyah (oninput مضاف)؛ والباقي إضافات.
    const replaced = hunks.filter(h => h.before.length);
    assert.equal(replaced.length, 2);
    const fixHunk = replaced.find(h => h.before[0] === FIX_BEFORE), rangeHunk = replaced.find(h => /const rangeFields = \(kind, edge\) =>/.test(h.before[0]));
    assert.ok(fixHunk && rangeHunk);
    assert.equal(rangeHunk.before.length, 1); assert.equal(rangeHunk.after.length, 1);
    assert.equal(rangeHunk.after[0], rangeHunk.before[0].replace(`oninput="updateGeneralQuickPreview()"`, `oninput="quickAyahInput('\${kind}', '\${edge}')"`));
    assert.deepEqual(fixHunk.before, [FIX_BEFORE]);
    assert.deepEqual(fixHunk.after, [FIX_BEFORE.replace('step="1" class=', 'step="1" oninput="updateFrontierFixAyah()" class=')]);
    // الدوال المعدَّلة = نصها القديم مع الأسطر المضافة فقط.
    const strip = (text, added) => added.reduce((t, line) => { assert.ok(t.includes('\n' + line), line); return t.replace('\n' + line, ''); }, text);
    for (const name of EDITED_FUNCTIONS) {
        let body = strip(source(name, html), ADDED_LINES[name]);
        if (name === 'initGeneralQuickEntry') body = body.replace(rangeHunk.after[0], rangeHunk.before[0]);
        assert.equal(body, source(name, old), name);
    }
    for (const name of NEW_FUNCTIONS) assert.throws(() => source(name, old), undefined, name);
    // «آخر آية حفظها» يبقى معالجه كما هو (القصّ داخل generalQuickPositionChanged)؛ لا حقل صفحة.
    assert.match(html, /id="quick_positionAyah" aria-label="آخر آية حفظها" type="number" min="1" step="1" oninput="generalQuickPositionChanged\(\)"/);
    assert.equal((html.match(/quickPageInput|syncQuickPage|qe-paged|Page"/g) || []).length, 0);
    // §2 «يبقى»: الحساب والتحقق والحفظ بنصها في 24d0f17.
    for (const name of ['calculateGeneralQuickEntry', 'updateGeneralQuickPreview', 'generalQuickSectionValues', 'generalQuickSectionUsed', 'generalQuickPositionValues',
        'readGeneralQuickPosition', 'saveGeneralQuickEntry', 'buildEntryPatch', 'makeEntry', 'commitGeneralStudentPatch', 'renderFrontierFixStudents', 'renderFrontierFixPosition',
        'saveGeneralFrontierFix', 'generalQuickSuggestions', 'generalNextPoint', 'updateAyahMax', 'calculateQuran', 'adjustAyah', 'dayStats', 'getCumulativeStats',
        'generalRecitationTotals', 'computeFrontier', 'computeLastReview', 'getGeneralTvSnapshot', 'buildGeneralWeeklyMessage', 'generalQuickKeydown', 'generalQuickHasUnsavedInput'])
        assert.equal(source(name, html), source(name, old), name);
    for (const name of ['dayPoints', 'measureEntry', 'generalQuickEntry'])
        assert.equal(html.match(new RegExp(`const ${name} = .*;`))[0], old.match(new RegExp(`const ${name} = .*;`))[0], name);
    // الهاركنس (§3-3 البند 4): dispatchEvent يستدعي on<type>، وربط onchange من innerHTML ومن الثابت، وEvent بسيط، وأسماء install؛ ولا شيء غيره.
    const harnessFile = 'tests/helpers/quick-entry-harness.cjs';
    const expected = [
        ["            setAttribute(n, v) { this.attrs[n] = v; },\n",
            "            setAttribute(n, v) { this.attrs[n] = v; },\n            dispatchEvent(event) { if (typeof this['on' + event.type] === 'function') this['on' + event.type](event); return true; },\n"],
        ["                    if (click) child.onclick = () => run(click);\n",
            "                    if (click) child.onclick = () => run(click);\n                    const change = /\\bonchange=\"([^\"]*)\"/.exec(attrs)?.[1];\n                    if (change) child.onchange = () => run(change);\n"],
        ["        el.className = /\\bclass=\"([^\"]*)\"/.exec(tag[2])?.[1] || '';\n",
            "        el.className = /\\bclass=\"([^\"]*)\"/.exec(tag[2])?.[1] || '';\n        const change = /\\bonchange=\"([^\"]*)\"/.exec(tag[2])?.[1];\n        if (change) el.onchange = () => run(change);\n"],
        ['    const ctx = vm.createContext({ console, structuredClone,',
            '    const ctx = vm.createContext({ Event: class { constructor(type, init = {}) { this.type = type; this.bubbles = !!init.bubbles; } preventDefault() {} stopPropagation() {} }, console, structuredClone,'],
        ["        'quickSurahChanged', 'fulfillGeneralCriteria',",
            "        'quickSurahChanged', 'quickAyahInput', 'normalizeSurahQuery', 'surahAliases', 'surahMatches', 'mountSurahPicker', 'refreshSurahPicker',\n" +
            "        'surahPickerOpen', 'surahPickerMark', 'surahPickerKey', 'surahPickerChoose', 'surahPickerClose', 'surahPickerPlace', 'fulfillGeneralCriteria',"],
    ].reduce((text, [a, b]) => { assert.equal(text.split(a).length, 2, a); return text.replace(a, b); }, original(harnessFile));
    assert.equal(current(harnessFile), expected);
    // المحرك والنقاط والتلفاز والمخازن ومفاتيح الإجابة بايتاً ببايت.
    const tracked = git('ls-tree', '-r', '--name-only', BASE).trim().split(/\r?\n/);
    const quran = tracked.filter(file => /^quran\/[^/]+\.js$/.test(file));
    const keys = tracked.filter(file => /^tests\/rules\/[^/]+-answer-key\.json$/.test(file));
    assert.ok(quran.length >= 5); assert.ok(keys.length >= 7);
    for (const file of ['general-points.js', 'tv.js', 'tv.html', 'firestore.rules', 'data-store.js', 'programs-store.js', ...quran, ...keys])
        assert.equal(current(file), original(file), file);
});

test('category 22 audit: the reverse chain restores 24d0f17 and then every older index baseline exactly', () => {
    const html = beforeSurahSearch(current('index.html'), 'index.html');
    assert.equal(html, original('index.html'));
    assert.equal(beforeSurahSearch(current('tests/helpers/quick-entry-harness.cjs'), 'tests/helpers/quick-entry-harness.cjs'), original('tests/helpers/quick-entry-harness.cjs'));
    const { beforeKnightsOwnerAuto } = require('./helpers/knights-owner-auto-audit.cjs');
    const { beforeGeneralKnightsCleanup } = require('./helpers/general-knights-cleanup-audit.cjs');
    const { beforeKnightsRelease } = require('./helpers/knights-release-audit.cjs');
    const { beforeKnightsRound2b, beforeKnightsRound2 } = require('./helpers/board-invariants.cjs');
    for (const [reverse, baseline] of [[beforeJourneyFixes, '274bd05'], [beforeKnightsRisingStar, 'bf6a5e7'], [beforeKnightsTvPoints, '6e50320'],
        [beforeKnightsLinesX3, 'be3b92f'], [beforeKnightsLastWeek, 'fe78763'], [beforeKnightsOnePlaceP4, '263c942'], [beforeKnightsOnePlaceP3, '5fbff4e'],
        [beforeKnightsOnePlaceP2, 'a002e0c'], [beforeKnightsOnePlace, 'd51bb42'],
        [beforeKnightsOwnerAuto, '186a18e'], [beforeGeneralKnightsCleanup, '55fd33e'],
        [beforeKnightsRelease, '2d78da2'], [beforeKnightsRound2b, '0c5ec91'], [beforeKnightsRound2, '8880f84']])
        assert.equal(reverse(html, 'index.html'), git('show', baseline + ':index.html').replaceAll('\r\n', '\n'), baseline);
});
