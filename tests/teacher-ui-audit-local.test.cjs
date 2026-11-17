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
    'tests/helpers/teacher-ui-harness.cjs', 'tests/teacher-ui-audit-local.test.cjs', 'tests/new-paused-local.test.cjs'];
const git = (...args) => cp.execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
const sha = text => createHash('sha256').update(text).digest('hex');
const current = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
const original = file => cp.execFileSync('git', ['show', BASE + ':' + file], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).replaceAll('\r\n', '\n');

test('category 23: all changed and added files are registered', () => {
    const audit = require('./rules/design-expectation-audit.json');
    assert.equal(audit.categories['23'], CATEGORY);
    assert.equal(audit.teacherAccountsBaseline, BASE);
    const changed = git('diff', '--name-only', BASE).split(/\r?\n/)
        .filter(file => file && file !== 'tests/rules/design-expectation-audit.json' && !ADDED.includes(file)).sort();
    assert.deepEqual(audit.teacherAccountsChanges.map(row => row.file).sort(), changed);
    // أ10 (ق75): الأربعة الأولى التُزمت في 9302f6e؛ المطلوب ألا يبقى ملف غير ملتزم خارج ADDED (الآن tests/new-paused-local.test.cjs وحده).
    const untracked = git('ls-files', '--others', '--exclude-standard').split(/\r?\n/).filter(Boolean).sort();
    assert.deepEqual(untracked.filter(file => !ADDED.includes(file)), [], 'ملف غير ملتزم غير مسجَّل');
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
test('category 24: كل ملف تغيّر منذ 9302f6e مسجَّل، وكل هنك يعود بالعكس إلى 9302f6e حرفياً، والمعدَّل إضافة في الآخر فقط', () => {
    const row = require('./rules/design-expectation-audit.json').teacherAccountsNewPaused;
    const appended = row.editedTestFiles.map(r => r.file), added = row.addedFiles.map(r => r.file);
    const changed = git('diff', '--name-only', BASE24).split(/\r?\n/)
        .filter(file => file && file !== 'tests/rules/design-expectation-audit.json' && !appended.includes(file)).sort();
    assert.deepEqual(row.changes.map(r => r.file).sort(), changed, 'ملفات الفئة 24');
    for (const r of row.changes) {
        assert.equal(r.beforeSha256, sha(at24(r.file)), r.file);
        assert.equal(r.sha256, sha(current(r.file)), r.file);
        assert.equal(reverse24(current(r.file), r.hunks), at24(r.file), r.file);
    }
    for (const r of row.editedTestFiles) {
        assert.equal(r.beforeSha256, sha(at24(r.file)), r.file);
        assert.equal(r.sha256, sha(current(r.file)), r.file);
        assert.equal(r.appendOnly, true, r.file);
        assert.ok(current(r.file).startsWith(at24(r.file)), r.file + ': ليس إضافة في الآخر فقط');
    }
    const untracked = git('ls-files', '--others', '--exclude-standard').split(/\r?\n/).filter(Boolean).sort();
    assert.deepEqual(untracked, [...added].sort(), 'الملفات المضافة غير الملتزمة');
    for (const r of row.addedFiles) {
        assert.equal(r.sha256, sha(current(r.file)), r.file);
        assert.equal(git('ls-tree', '-r', '--name-only', BASE24, '--', r.file), '', r.file);
    }
    // طفرة: تغيير حرف في سطر مسجَّل من index.html لا يعود إلى 9302f6e.
    const idx = row.changes.find(r => r.file === 'index.html');
    const mutated = current('index.html').replace('.tch-card-paused {', '.tch-card-paused  {');
    assert.notEqual(mutated, current('index.html'));
    assert.throws(() => assert.equal(reverse24(mutated, idx.hunks), at24('index.html')));
});
