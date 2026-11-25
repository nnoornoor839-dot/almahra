'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const sha = text => crypto.createHash('sha256').update(text).digest('hex');

function beforeParentMessageText(text, file = 'index.html') {
    text = text.replaceAll('\r\n', '\n');
    const row = require('../rules/design-expectation-audit.json').parentMessageText?.changes.find(x => x.file === file);
    if (!row || sha(text) !== row.sha256) return text;
    const lines = text.split('\n');
    if (!row.hunks.every(h => JSON.stringify(lines.slice(h.newLine - 1, h.newLine - 1 + h.after.length)) === JSON.stringify(h.after))) return text;
    for (const h of [...row.hunks].reverse()) {
        assert.deepEqual(lines.slice(h.newLine - 1, h.newLine - 1 + h.after.length), h.after,
            file + ': category 33 exact hunk');
        lines.splice(h.newLine - 1, h.after.length, ...h.before);
    }
    const reversed = lines.join('\n');
    assert.equal(sha(reversed), row.beforeSha256, file + ': category 33 reverse hash');
    return reversed;
}

module.exports = { beforeParentMessageText };
