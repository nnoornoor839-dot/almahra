const { createHash } = require('node:crypto');
// Reverse registered hunks of one category row exactly; any unregistered edit leaves the text unchanged (and so exposed).
function reverseRow(text, row) {
    if (!row || createHash('sha256').update(text).digest('hex') === row.beforeSha256) return text;
    const lines = text.split('\n');
    if (!row.hunks.every(h => JSON.stringify(lines.slice(h.newLine - 1, h.newLine - 1 + h.after.length)) === JSON.stringify(h.after))) return text;
    for (const h of [...row.hunks].reverse()) lines.splice(h.newLine - 1, h.after.length, ...h.before);
    return lines.join('\n');
}
// Category 16: reverse registered last-school-week lines, so category 15 sees fe78763.
function beforeKnightsLastWeek(text, file = 'index.html') {
    text = text.replaceAll('\r\n', '\n');
    return reverseRow(text, require('../rules/design-expectation-audit.json').knightsLastWeekChanges?.find(r => r.file === file));
}
// Category 15: reverse only the exact «الفرسان في مكان واحد — الجزء ٤» lines, so category 14 sees 263c942.
function beforeKnightsOnePlaceP4(text, file = 'index.html') {
    text = beforeKnightsLastWeek(text, file);
    return reverseRow(text, require('../rules/design-expectation-audit.json').knightsOnePlaceP4Changes?.find(r => r.file === file));
}
// Category 14: reverse only the exact «الفرسان في مكان واحد — الجزء ٣» lines, so category 13 sees 5fbff4e.
function beforeKnightsOnePlaceP3(text, file = 'index.html') {
    text = beforeKnightsOnePlaceP4(text, file);
    return reverseRow(text, require('../rules/design-expectation-audit.json').knightsOnePlaceP3Changes?.find(r => r.file === file));
}
// Category 13: reverse only the exact «الفرسان في مكان واحد — الجزء ٢» lines, so category 12 sees a002e0c.
function beforeKnightsOnePlaceP2(text, file = 'index.html') {
    text = beforeKnightsOnePlaceP3(text, file);
    return reverseRow(text, require('../rules/design-expectation-audit.json').knightsOnePlaceP2Changes?.find(r => r.file === file));
}
// Category 12: reverse only the exact «الفرسان في مكان واحد — الجزء ١» lines, so older audit layers see d51bb42.
function beforeKnightsOnePlace(text, file = 'index.html') {
    text = beforeKnightsOnePlaceP2(text, file);
    return reverseRow(text, require('../rules/design-expectation-audit.json').knightsOnePlaceChanges?.find(r => r.file === file));
}
module.exports = { beforeKnightsLastWeek, beforeKnightsOnePlace, beforeKnightsOnePlaceP2, beforeKnightsOnePlaceP3, beforeKnightsOnePlaceP4 };
