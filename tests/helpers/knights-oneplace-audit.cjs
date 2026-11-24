const { createHash } = require('node:crypto');
// Reverse registered hunks of one category row exactly; any unregistered edit leaves the text unchanged (and so exposed).
function reverseRow(text, row) {
    if (!row || createHash('sha256').update(text).digest('hex') === row.beforeSha256) return text;
    const lines = text.split('\n');
    if (!row.hunks.every(h => JSON.stringify(lines.slice(h.newLine - 1, h.newLine - 1 + h.after.length)) === JSON.stringify(h.after))) return text;
    for (const h of [...row.hunks].reverse()) lines.splice(h.newLine - 1, h.after.length, ...h.before);
    const restored = lines.join('\n');
    return createHash('sha256').update(restored + '\n').digest('hex') === row.beforeSha256 ? restored + '\n' : restored;
}
// Category 22: reverse registered surah-search changes, so category 20 sees 24d0f17.
// Category 23: reverse teacher accounts and their rules before older audits inspect a file.
function beforeTeacherAccounts(text, file = 'index.html') {
    text = require('./teacher-offline-audit.cjs').beforeTeacherOffline(require('./tv-isha-audit.cjs').beforeTvIsha(require('./teacher-toast-audit.cjs').beforeTeacherToastColor(require('./week-messages-audit.cjs').beforeWeekMessagesLastSchoolWeek(text, file), file), file), file);
    text = require('./teacher-r4-audit.cjs').beforeTeacherR4(text, file);
    text = text.replaceAll('\r\n', '\n');
    return reverseRow(text, require('../rules/design-expectation-audit.json').teacherAccountsChanges?.find(r => r.file === file));
}
function beforeSurahSearch(text, file = 'index.html') {
    text = beforeTeacherAccounts(text, file);
    return reverseRow(text, require('../rules/design-expectation-audit.json').surahSearchChanges?.find(r => r.file === file));
}
// Category 20: reverse registered journey-fix changes, so category 19 sees 274bd05.
function beforeJourneyFixes(text, file = 'index.html') {
    text = beforeSurahSearch(text, file);
    return reverseRow(text, require('../rules/design-expectation-audit.json').journeyFixesChanges?.find(r => r.file === file));
}
// Category 19: reverse registered rising-star changes, so category 18 sees bf6a5e7.
function beforeKnightsRisingStar(text, file = 'index.html') {
    text = beforeJourneyFixes(text, file);
    return reverseRow(text, require('../rules/design-expectation-audit.json').knightsRisingStarChanges?.find(r => r.file === file));
}
// Category 18: reverse registered TV-points changes, so category 17 sees 6e50320.
function beforeKnightsTvPoints(text, file = 'index.html') {
    text = beforeKnightsRisingStar(text, file);
    return reverseRow(text, require('../rules/design-expectation-audit.json').knightsTvPointsChanges?.find(r => r.file === file));
}
// Category 17: reverse registered lines-x3 changes, so category 16 sees be3b92f.
function beforeKnightsLinesX3(text, file = 'index.html') {
    text = beforeKnightsTvPoints(text, file);
    return reverseRow(text, require('../rules/design-expectation-audit.json').knightsLinesX3Changes?.find(r => r.file === file));
}
// Category 16: reverse registered last-school-week lines, so category 15 sees fe78763.
function beforeKnightsLastWeek(text, file = 'index.html') {
    text = beforeKnightsLinesX3(text, file);
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
module.exports = { beforeTeacherAccounts, beforeSurahSearch, beforeJourneyFixes, beforeKnightsRisingStar, beforeKnightsTvPoints, beforeKnightsLinesX3, beforeKnightsLastWeek, beforeKnightsOnePlace, beforeKnightsOnePlaceP2, beforeKnightsOnePlaceP3, beforeKnightsOnePlaceP4 };
