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
    'tests/helpers/teacher-ui-harness.cjs', 'tests/teacher-ui-audit-local.test.cjs'];
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
    const untracked = git('ls-files', '--others', '--exclude-standard').split(/\r?\n/).filter(Boolean).sort();
    assert.deepEqual(untracked, ADDED.filter(file => file !== 'tests/rules/teacher.test.js').sort());
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
