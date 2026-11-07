const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
// Reverse only the exact changed lines approved for removing the legacy general UI.
function beforeGeneralKnightsCleanup(text, file = 'index.html') {
    text = require('./knights-owner-auto-audit.cjs').beforeKnightsOwnerAuto(text, file);
    text = text.replaceAll('\r\n', '\n');
    const row = require('../rules/design-expectation-audit.json').generalKnightsCleanupChanges?.find(r => r.file === file);
    if (!row || createHash('sha256').update(text).digest('hex') === row.beforeSha256) return text;
    const lines = text.split('\n');
    // Earlier historical versions are inputs to the older audit layers too.
    if (!row.hunks.every(h => JSON.stringify(lines.slice(h.newLine - 1, h.newLine - 1 + h.after.length)) === JSON.stringify(h.after))) return text;
    for (const h of [...row.hunks].reverse()) {
        assert.deepEqual(lines.slice(h.newLine - 1, h.newLine - 1 + h.after.length), h.after);
        lines.splice(h.newLine - 1, h.after.length, ...h.before);
    }
    return lines.join('\n');
}
module.exports = { beforeGeneralKnightsCleanup };
