'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
function beforeTeacherR4(text, file = 'index.html') {
    text = require('./teacher-offline-audit.cjs').beforeTeacherOffline(text, file);
    text = text.replaceAll('\r\n', '\n');
    const row = require('../rules/design-expectation-audit.json').teacherAccountsR4?.changes.find(x => x.file === file);
    if (!row || sha(text) !== row.sha256) return text;
    const lines = text.split('\n');
    if (!row.hunks.every(hunk => JSON.stringify(lines.slice(hunk.newLine - 1, hunk.newLine - 1 + hunk.after.length)) === JSON.stringify(hunk.after))) return text;
    for (const hunk of [...row.hunks].reverse()) {
        assert.deepEqual(lines.slice(hunk.newLine - 1, hunk.newLine - 1 + hunk.after.length), hunk.after,
            file + ': category 28 exact hunk');
        lines.splice(hunk.newLine - 1, hunk.after.length, ...hunk.before);
    }
    const reversed = lines.join('\n');
    assert.equal(sha(reversed), row.beforeSha256, file + ': category 28 reverse hash');
    return reversed;
}
module.exports = { beforeTeacherR4 };
