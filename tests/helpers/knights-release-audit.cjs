const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
// Undo only the exact owner-approved release hunks before older invariant checks.
function beforeKnightsRelease(text, file = 'index.html') {
    text = require('./general-knights-cleanup-audit.cjs').beforeGeneralKnightsCleanup(text, file);
    text = text.replaceAll('\r\n', '\n');
    const audit = require('../rules/design-expectation-audit.json');
    const row = [...(audit.knightsReleaseProductionChanges || []), ...(audit.knightsReleaseExpectationChanges || [])].find(r => r.file === file);
    if (!row || createHash('sha256').update(text).digest('hex') === row.beforeSha256) return text;
    if (row.marker && !text.includes(row.marker)) return text;
    const lines = text.split('\n');
    for (const hunk of [...row.hunks].reverse()) {
        assert.deepEqual(lines.slice(hunk.newLine - 1, hunk.newLine - 1 + hunk.after.length), hunk.after, file + ': exact approved release change');
        lines.splice(hunk.newLine - 1, hunk.after.length, ...hunk.before);
    }
    return lines.join('\n');
}
module.exports = { beforeKnightsRelease };
