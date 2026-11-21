// تدقيق الفئة 23: واجهة المعلم وقواعد d10b432، فوق dd2b1f4.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const { beforeTeacherAccounts } = require('./helpers/knights-oneplace-audit.cjs');
const root = path.resolve(__dirname, '..');
const BASE = 'dd2b1f4';
const CATEGORY = 'حسابات المعلمين: القواعد والواجهة (2026-11-16)';
const ADDED = ['tests/rules/teacher.test.js', 'tests/teacher-ui-local.test.cjs',
    'tests/helpers/teacher-ui-harness.cjs', 'tests/teacher-ui-audit-local.test.cjs', 'tests/new-paused-local.test.cjs',
    // ب9 (ق94 س2): ملف الجولة 1 الجديد غير الملتزم؛ تدقيقات الفئات 15–20 تقبل غير الملتزم من teacherAccountsAddedFiles وحدها.
    'tests/teacher-r1-logic-local.test.cjs', 'tests/teacher-r2-accordion-local.test.cjs',
    // ب11: ملف الجولة 3 الجديد غير الملتزم.
    'tests/teacher-r3-home-local.test.cjs'];
const git = (...args) => cp.execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
const sha = text => createHash('sha256').update(text).digest('hex');
const rawCurrent = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
const current = file => require('./helpers/teacher-r4-audit.cjs').beforeTeacherR4(rawCurrent(file), file);
const added28 = () => require('./rules/design-expectation-audit.json').teacherAccountsR4.addedFiles.map(r => r.file);
// تجهيز نشر 8: 1435aef التزم الملفات المضافة؛ الجرد يجمع تغييرات الأساس والمتبقي غير المتتبَّع، والوجود يُحسم في الأساس نفسه.
const filesSince = base => [...new Set([...git('diff', '--name-only', base).split(/\r?\n/),
    ...git('ls-files', '--others', '--exclude-standard').split(/\r?\n/)])].filter(Boolean).sort();
const addedSince = base => filesSince(base).filter(file => !existsAt(base, file));
const original = file => cp.execFileSync('git', ['show', BASE + ':' + file], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).replaceAll('\r\n', '\n');

test('category 23: all changed and added files are registered', () => {
    const audit = require('./rules/design-expectation-audit.json');
    assert.equal(audit.categories['23'], CATEGORY);
    assert.equal(audit.teacherAccountsBaseline, BASE);
    // تجهيز نشر 8: 1435aef التزم الجولات 1–5؛ ملف الفئة 23 المتغيّر كان موجوداً في أساسها، والمضاف يُفحص مستقلاً.
    const changed = filesSince(BASE)
        .filter(file => file !== 'tests/rules/design-expectation-audit.json' && existsAt(BASE, file) && !ADDED.includes(file)
            && (!audit.teacherAccountsR4.changes.some(r => r.file === file) || audit.teacherAccountsChanges.some(r => r.file === file))).sort();
    assert.deepEqual(audit.teacherAccountsChanges.map(row => row.file).sort(), changed);
    // أ10 (ق75): الأربعة الأولى التُزمت في 9302f6e؛ المطلوب ألا يبقى ملف غير ملتزم خارج ADDED (الآن tests/new-paused-local.test.cjs وحده).
    // تجهيز نشر 8: 1435aef التزم المضاف؛ كل ما لم يوجد في dd2b1f4 يجب أن يُسجَّل في الفئة 23 أو 28.
    assert.deepEqual(addedSince(BASE), [...ADDED, ...added28()].sort(), 'ملف مضاف منذ الأساس غير مسجَّل');
    assert.deepEqual(audit.teacherAccountsAddedFiles.map(row => row.file).sort(), ADDED.sort());
});

test('category 23: every registered hunk reverses to dd2b1f4', () => {
    const audit = require('./rules/design-expectation-audit.json');
    for (const row of audit.teacherAccountsChanges) {
        assert.equal(row.category, 23, row.file);
        assert.equal(row.reason, CATEGORY, row.file);
        assert.equal(row.beforeSha256, sha(original(row.file)), row.file);
        assert.equal(row.sha256, sha(current(row.file)), row.file);
        assert.equal(beforeTeacherAccounts(current(row.file), row.file), original(row.file), row.file);
    }
    for (const row of audit.teacherAccountsAddedFiles) {
        assert.equal(row.category, 23, row.file);
        assert.equal(row.reason, CATEGORY, row.file);
        assert.equal(row.sha256, sha(current(row.file)), row.file);
        assert.equal(git('ls-tree', '-r', '--name-only', BASE, '--', row.file), '', row.file);
    }
    const mutation = current('index.html').replace('teacher-mode', 'teacher-mode-changed');
    assert.notEqual(beforeTeacherAccounts(mutation), original('index.html'));
});

// ===== أ10 (ق75): تدقيق الفئة 24 «متوقف عن الجديد + ق70» فوق 9302f6e، من سطر teacherAccountsNewPaused =====
const BASE24 = '9302f6e';
const CATEGORY24 = 'متوقف عن الجديد + ق70 الرسالة فوق شريط الحفظ (2026-11-17)';
const at24 = file => cp.execFileSync('git', ['show', BASE24 + ':' + file], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).replaceAll('\r\n', '\n');
// يعكس الهنكات من الآخر إلى الأول: كل after يجب أن يكون في موضعه (newLine) حرفياً، ويُستبدل بـ before.
function reverse24(text, hunks) {
    const lines = text.split('\n');
    for (const h of [...hunks].sort((a, b) => b.newLine - a.newLine)) {
        assert.deepEqual(lines.slice(h.newLine - 1, h.newLine - 1 + h.after.length), h.after, 'هنك لا يطابق السطر ' + h.newLine);
        lines.splice(h.newLine - 1, h.after.length, ...h.before);
    }
    return lines.join('\n');
}
test('category 24: categories[24] والسطر teacherAccountsNewPaused والأساس 9302f6e', () => {
    const audit = require('./rules/design-expectation-audit.json'), row = audit.teacherAccountsNewPaused;
    assert.equal(audit.categories['24'], CATEGORY24);
    assert.deepEqual([row.category, row.reason, row.baseline], [24, CATEGORY24, BASE24]);
});
// ب9 (ق94 س1): الفئة 24 التُزمت في 82415c9 (فصار new-paused-local ملتزماً)، وفوقها الفئة 25؛ فتُعكس هنكات الفئة 25 أولاً (current24)،
// والملف «المضاف» = غير موجود في 9302f6e (ملتزماً بعده أو غير ملتزم)، والملف «المتغيّر» = يختلف بعد عكس الفئة 25 عن 9302f6e.
// ب10: نعكس الفئة 26 أولاً، ثم 25، كي تبقى أقفال الجولات السابقة على محتواها الأصلي.
// ب11: ونعكس الفئة 27 قبلها (current26 = نهاية الجولة 2).
const current26 = file => {
    const r = (require('./rules/design-expectation-audit.json').teacherAccountsR3?.changes || []).find(c => c.file === file);
    return r ? reverse24(current(file), r.hunks) : current(file);
};
const current25 = file => {
    const round2 = require('./rules/design-expectation-audit.json').teacherAccountsR2;
    const r = [...(round2?.changes || []), ...(round2?.updatedAddedFiles || [])].find(c => c.file === file);
    return r ? reverse24(current26(file), r.hunks) : current26(file);
};
const added27 = () => (require('./rules/design-expectation-audit.json').teacherAccountsR3?.addedFiles || []).map(r => r.file);
const current24 = file => { const r = require('./rules/design-expectation-audit.json').teacherAccountsR1?.changes.find(c => c.file === file); return r ? reverse24(current25(file), r.hunks) : current25(file); };
const existsAt = (base, file) => git('ls-tree', '-r', '--name-only', base, '--', file) !== '';
test('category 24: كل ملف تغيّر منذ 9302f6e مسجَّل، وكل هنك يعود بالعكس إلى 9302f6e حرفياً، والمعدَّل إضافة في الآخر فقط', () => {
    const row = require('./rules/design-expectation-audit.json').teacherAccountsNewPaused;
    const appended = row.editedTestFiles.map(r => r.file), added = row.addedFiles.map(r => r.file);
    const added25 = (require('./rules/design-expectation-audit.json').teacherAccountsR1?.addedFiles || []).map(r => r.file);
    const added26 = (require('./rules/design-expectation-audit.json').teacherAccountsR2?.addedFiles || []).map(r => r.file);
    // تجهيز نشر 8: 1435aef التزم الجولات 1–5؛ ملفات الفئة 24 المتغيّرة موجودة في 9302f6e، وتُعكس الفئات 28 ثم 27 ثم 26 ثم 25 قبل مقارنتها.
    const changed = filesSince(BASE24)
        .filter(file => file !== 'tests/rules/design-expectation-audit.json' && existsAt(BASE24, file) && !appended.includes(file) && !added.includes(file) && !added25.includes(file) && !added26.includes(file) && !added27().includes(file)
            && current24(file) !== at24(file)).sort();
    assert.deepEqual(row.changes.map(r => r.file).sort(), changed, 'ملفات الفئة 24');
    for (const r of row.changes) {
        assert.equal(r.beforeSha256, sha(at24(r.file)), r.file);
        assert.equal(r.sha256, sha(current24(r.file)), r.file);
        assert.equal(reverse24(current24(r.file), r.hunks), at24(r.file), r.file);
    }
    for (const r of row.editedTestFiles) {
        assert.equal(r.beforeSha256, sha(at24(r.file)), r.file);
        assert.equal(r.sha256, sha(current24(r.file)), r.file);
        assert.equal(r.appendOnly, true, r.file);
        assert.ok(current24(r.file).startsWith(at24(r.file)), r.file + ': ليس إضافة في الآخر فقط');
    }
    // تجهيز نشر 8: 1435aef التزم المضاف؛ غياب الملف عن 9302f6e هو معيار الإضافة عبر الفئات 24–28.
    assert.deepEqual(addedSince(BASE24), [...added, ...added25, ...added26, ...added27(), ...added28()].sort(), 'ملف مضاف منذ الأساس خارج الفئات 24–28');
    for (const r of row.addedFiles) {
        assert.equal(r.sha256, sha(current24(r.file)), r.file);
        assert.equal(existsAt(BASE24, r.file), false, r.file);
    }
    // طفرة: تغيير حرف في سطر مسجَّل من index.html لا يعود إلى 9302f6e.
    const idx = row.changes.find(r => r.file === 'index.html');
    const mutated = current24('index.html').replace('.tch-card-paused {', '.tch-card-paused  {');
    assert.notEqual(mutated, current24('index.html'));
    assert.throws(() => assert.equal(reverse24(mutated, idx.hunks), at24('index.html')));
});

// ===== ب9 (ق94 س2): تدقيق الفئة 25 «الجولة 1 منطق بلا شكل» فوق 82415c9، من سطر teacherAccountsR1 =====
// لا categories['25']: تدقيقات الفئات 15–22 تقارن categories بنسختها القديمة بعد حذف 22–24 فقط، فالسطر بمفتاح teacherAccounts* وحده.
const BASE25 = '82415c9';
const CATEGORY25 = 'الجولة 1 منطق بلا شكل: ق77 ق82 ق85 ق86 ق87 ق92 (2026-11-18)';
const at25 = file => cp.execFileSync('git', ['show', BASE25 + ':' + file], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).replaceAll('\r\n', '\n');
test('category 25: السطر teacherAccountsR1 بالفئة 25 والأساس 82415c9، وكل ملف تغيّر منذه مسجَّل ويعود بالعكس إليه حرفياً، والمضاف غير الملتزم وحده', () => {
    const row = require('./rules/design-expectation-audit.json').teacherAccountsR1;
    assert.deepEqual([row.category, row.reason, row.baseline], [25, CATEGORY25, BASE25]);
    const added = row.addedFiles.map(r => r.file);
    const added26 = (require('./rules/design-expectation-audit.json').teacherAccountsR2?.addedFiles || []).map(r => r.file);
    // تجهيز نشر 8: 1435aef التزم الجولات 1–5؛ ملف الفئة 25 المتغيّر كان موجوداً في 82415c9، بعد عكس 28 ثم 27 ثم 26.
    const changed = filesSince(BASE25)
        .filter(file => file !== 'tests/rules/design-expectation-audit.json' && existsAt(BASE25, file) && !added.includes(file) && !added26.includes(file) && !added27().includes(file) && current25(file) !== at25(file)).sort();
    assert.deepEqual(row.changes.map(r => r.file).sort(), changed, 'ملفات الفئة 25');
    for (const r of row.changes) {
        assert.equal(r.beforeSha256, sha(at25(r.file)), r.file);
        assert.equal(r.sha256, sha(current25(r.file)), r.file);
        assert.equal(reverse24(current25(r.file), r.hunks), at25(r.file), r.file);
    }
    // تجهيز نشر 8: 1435aef التزم المضاف؛ الفئات 25–28 تضم كل ملف غائب عن 82415c9.
    assert.deepEqual(addedSince(BASE25), [...added, ...added26, ...added27(), ...added28()].sort(), 'الملفات المضافة منذ 82415c9');
    for (const r of row.addedFiles) {
        assert.equal(r.sha256, sha(current25(r.file)), r.file);
        assert.equal(existsAt(BASE25, r.file), false, r.file);
    }
    // طفرة: حرف في سطر مسجَّل من index.html لا يعود إلى 82415c9.
    const idx = row.changes.find(r => r.file === 'index.html');
    const mutated = current25('index.html').replace("const defaults = { late: ['early']", "const defaults = { late: ['earlyX']");
    assert.notEqual(mutated, current25('index.html'));
    assert.throws(() => assert.equal(reverse24(mutated, idx.hunks), at25('index.html')));
});

// ب10 (ق101 س11): سجل الفئة 26 من نهاية ب9، بلا categories['26'].
function after25(file) {
    const r = require('./rules/design-expectation-audit.json').teacherAccountsR1.changes.find(c => c.file === file);
    if (!r) return at25(file);
    const lines = at25(file).split('\n');
    for (const h of [...r.hunks].sort((a,b) => b.oldLine - a.oldLine)) {
        assert.deepEqual(lines.slice(h.oldLine - 1, h.oldLine - 1 + h.before.length), h.before, 'هنك الفئة 25: ' + file);
        lines.splice(h.oldLine - 1, h.before.length, ...h.after);
    }
    return lines.join('\n');
}
test('category 26: نافذة الإنجاز v7، هنكات المنتج والاختبار وتدقيق الفئة وبصمات كاتب أ13', () => {
    const row = require('./rules/design-expectation-audit.json').teacherAccountsR2;
    assert.deepEqual([row.category, row.reason, row.baseline], [26, 'الجولة 2 نافذة الإنجاز v7: ق90 ق78 ق79 ق80 ق81 ق83 ق84 ق93 ق98 ق101 (2026-11-18)', BASE25]);
    const expected = ['index.html', 'tests/teacher-ui-local.test.cjs', 'tests/teacher-ui-audit-local.test.cjs',
        'tests/new-paused-local.test.cjs', 'tests/surah-search-local.test.cjs', 'tests/helpers/teacher-ui-harness.cjs'];
    assert.deepEqual(row.changes.map(r => r.file).sort(), expected.sort());
    for (const r of row.changes) {
        const baseline = after25(r.file);
        assert.equal(r.sha256, sha(current26(r.file)), r.file);
        assert.equal(reverse24(current26(r.file), r.hunks), baseline, r.file);
        assert.equal(r.beforeSha256, sha(baseline), r.file);
    }
    assert.deepEqual(row.addedFiles.map(r => r.file), ['tests/teacher-r2-accordion-local.test.cjs']);
    for (const r of row.addedFiles) assert.equal(r.sha256, sha(current26(r.file)), r.file);
    assert.deepEqual(row.updatedAddedFiles.map(r => r.file), ['tests/teacher-r1-logic-local.test.cjs']);
    for (const r of row.updatedAddedFiles) {
        assert.equal(r.sha256, sha(current26(r.file)), r.file);
        assert.equal(sha(current25(r.file)), r.beforeSha256, r.file);
    }
    assert.deepEqual(row.testFiles.map(r => r.file).sort(), ['tests/teacher-r2-accordion-local.test.cjs',
        'tests/teacher-ui-local.test.cjs', 'tests/new-paused-local.test.cjs',
        'tests/surah-search-local.test.cjs', 'tests/teacher-r1-logic-local.test.cjs',
        'tests/helpers/teacher-ui-harness.cjs'].sort());
    for (const r of row.testFiles) assert.equal(r.sha256, sha(current26(r.file)), r.file);
});

// ب11 (ق116): سجل الفئة 27 «الجولة 3 الدخول والرئيسية v7» من نهاية ب10، بلا categories['27'].
const CATEGORY27 = 'الجولة 3 الدخول والرئيسية v7: ق88 ق89 ق90 ق109 ق116 (2026-11-19)';
// ب11-تسجيل أ20 ثم ف2: ملف الجولة 3 بعد ر14–ر17 (أ20) ثم ر18 (أ21) ور19–ر20 (أ22)؛ كان e7ed3fcc… عند أ16 وcf56cb34… عند أ20.
const WRITER27 = '157e3eddb3e6ed02d88ef688c15cca7ec4ec36784a3d4b49485bcd624e4b6d96';
test('category 27: الدخول والرئيسية v7، كل هنك يعود بالعكس إلى نهاية الجولة 2 حرفياً، والملف الجديد ببصمة كاتب أ16', () => {
    const audit = require('./rules/design-expectation-audit.json'), row = audit.teacherAccountsR3, round2 = audit.teacherAccountsR2;
    assert.equal(audit.categories['27'], undefined);
    assert.deepEqual([row.category, row.reason, row.baseline], [27, CATEGORY27, BASE25]);
    // ب11-تسجيل: ومعهما ملفّا أ19؛ نهاية الجولة 2 لملف خارج سطر 26 = بعد الفئة 25 (after25).
    assert.deepEqual(row.changes.map(r => r.file).sort(), ['index.html', 'tests/teacher-ui-audit-local.test.cjs', 'tests/teacher-ui-local.test.cjs', 'tests/home-local.test.cjs'].sort());
    const end2 = file => round2.changes.find(c => c.file === file)?.sha256 ?? sha(after25(file));
    for (const r of row.changes) {
        assert.equal(r.sha256, sha(current(r.file)), r.file);
        assert.equal(r.beforeSha256, end2(r.file), r.file + ': البداية ليست نهاية الجولة 2');
        assert.equal(sha(reverse24(current(r.file), r.hunks)), end2(r.file), r.file);
    }
    // ب11-تسجيل أ23: teacher-ui-local بعد ح7 وح11 (أ23)؛ كان 7f9b368e… عند أ19.
    const A19 = { 'tests/teacher-ui-local.test.cjs': 'cea7f8c8b5b3f04ab1a0b468c6d279d5790678b03eb4cff6099aa16325c976d1', 'tests/home-local.test.cjs': 'a7b1a7eea5d23ddff0615d070f787fe768664dc54390c7ed450e7bc0280c007a' };
    for (const [file, w] of Object.entries(A19)) assert.equal(sha(current(file)), w, file + ': ليس ببصمة كاتب أ19/أ23');
    // كل ملف متغيّر منذ نهاية الجولة 2 مسجَّل في الفئة 27 (الملفات الملتزمة بعد 82415c9 غير المضافة).
    // تجهيز نشر 8: 1435aef التزم المضاف؛ جرد الفئة 27 يقتصر على ملفات كانت موجودة في 82415c9.
    const changed = filesSince(BASE25).filter(file => file !== 'tests/rules/design-expectation-audit.json' && existsAt(BASE25, file)
        && sha(current(file)) !== end2(file)).sort();
    assert.deepEqual(changed, row.changes.map(r => r.file).sort(), 'ملفات الفئة 27');
    assert.deepEqual(row.addedFiles.map(r => r.file), ['tests/teacher-r3-home-local.test.cjs']);
    for (const r of row.addedFiles) {
        assert.equal(r.sha256, sha(current(r.file)), r.file);
        assert.equal(r.sha256, WRITER27, r.file + ': ليس ببصمة كاتب أ22');
        assert.equal(existsAt(BASE25, r.file), false, r.file);
    }
    for (const r of row.testFiles) assert.equal(r.sha256, r.writerSha256, r.file);
    // طفرة: حرف في سطر مسجَّل من الفئة 27 لا يعود إلى نهاية الجولة 2.
    const idx = row.changes.find(r => r.file === 'index.html');
    const mutated = current('index.html').replace("let teacherListFilter = 'all';", "let teacherListFilter = 'none';");
    assert.notEqual(mutated, current('index.html'));
    assert.throws(() => reverse24(mutated, idx.hunks));
});

test('category 28: هنكات البناء والاختبارات المحددة تعود إلى ما قبل الجولة 4 حرفياً', () => {
    const row = require('./rules/design-expectation-audit.json').teacherAccountsR4;
    assert.equal(row.category, 28);
    assert.deepEqual(row.changes.map(r => r.file).sort(), ['index.html', 'data-store.js', 'tv.js', 'tv.html',
        'tests/helpers/quick-entry-harness.cjs', 'tests/teacher-ui-local.test.cjs',
        'tests/teacher-ui-audit-local.test.cjs', 'tests/home-local.test.cjs', 'tests/teacher-r1-logic-local.test.cjs',
        'tests/teacher-r3-home-local.test.cjs', 'tests/homeprep-local.test.cjs',
        'tests/board-local.test.cjs', 'tests/rules/board-answer-key.json',
        'tests/rules/homeprep-answer-key.json', 'tests/teacher-r2-accordion-local.test.cjs',
        'tests/t25-owner-ui-local.test.cjs', 'tests/helpers/general-knights-cleanup-audit.cjs',
        'tests/helpers/knights-oneplace-audit.cjs', 'tests/helpers/tv-harness.cjs',
        'tests/knights-local.test.cjs', 'tests/knights-r2b-local.test.cjs', 'tests/knights-oneplace-p3-local.test.cjs',
        ...['journey-fixes', 'knights-last-week', 'knights-lines-x3', 'knights-oneplace',
            'knights-oneplace-p2', 'knights-oneplace-p3', 'knights-oneplace-p4',
            'knights-owner-auto', 'knights-rising-star', 'knights-tv-points']
            .map(name => 'tests/' + name + (name === 'knights-owner-auto' ? '-local.test.cjs' : '-audit-local.test.cjs'))].sort());
    const { beforeTeacherR4 } = require('./helpers/teacher-r4-audit.cjs');
    for (const r of row.changes) {
        assert.equal(sha(rawCurrent(r.file)), r.sha256, r.file);
        assert.equal(sha(beforeTeacherR4(rawCurrent(r.file), r.file)), r.beforeSha256, r.file);
    }
    for (const r of row.writerFiles) assert.equal(sha(rawCurrent(r.file)), r.sha256, r.file);
    for (const r of row.addedFiles) assert.equal(sha(rawCurrent(r.file)), r.sha256, r.file);
});
