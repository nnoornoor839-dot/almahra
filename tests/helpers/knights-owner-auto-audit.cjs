const { createHash } = require('node:crypto');
// Reverse only the owner's exact changed lines, leaving unrelated edits exposed.
function beforeKnightsOwnerAuto(text, file = 'index.html') {
    text = require('./knights-oneplace-audit.cjs').beforeKnightsOnePlace(text, file);
    text = text.replaceAll('\r\n', '\n');
    const row = require('../rules/design-expectation-audit.json').knightsOwnerAutoChanges?.find(r => r.file === file);
    if (!row || createHash('sha256').update(text).digest('hex') === row.beforeSha256) return text;
    const lines = text.split('\n');
    if (!row.hunks.every(h => JSON.stringify(lines.slice(h.newLine - 1, h.newLine - 1 + h.after.length)) === JSON.stringify(h.after))) return text;
    for (const h of [...row.hunks].reverse()) lines.splice(h.newLine - 1, h.after.length, ...h.before);
    return lines.join('\n');
}
module.exports = { beforeKnightsOwnerAuto };
