const assert = require('node:assert/strict');
function beforeKnightsRound2(text, file = 'index.html') {
    text = text.replaceAll('\r\n', '\n');
    if (file !== 'index.html' || !text.includes('function getWeekNominations(')) return text;
    const approved = require('../rules/design-expectation-audit.json').knightsRound2ProductionChanges;
    const lines = text.split('\n');
    for (const hunk of [...(approved?.find(row => row.file === file)?.hunks || [])].reverse()) {
        assert.deepEqual(lines.slice(hunk.newLine - 1, hunk.newLine - 1 + hunk.after.length), hunk.after, file + ': exact round 2a change');
        lines.splice(hunk.newLine - 1, hunk.after.length, ...hunk.before);
    }
    return lines.join('\n');
}
// استثناءات حرفية باعتماد المالك ٢٠٢٦-١١-٠٦؛ لا تُسقط دالة أو ملفاً من القفل.
function beforeKnights(text, file = 'index.html') {
    text = beforeKnightsRound2(text, file);
    const marker = { 'index.html': 'function dayAcceptedWeightTenths(', 'data-store.js': 'data.joinedOn =',
        'programs-store.js': 'const mergeEntry =', 'tv.js': 'فارس اليوم (مؤقت حتى الحسم)', 'tv.html': '.card.day-knight .stage' }[file];
    if (!marker || !text.includes(marker)) return text;
    const approved = require('../rules/design-expectation-audit.json').knightsProductionChanges;
    for (const hunk of approved?.find(row => row.file === file)?.hunks || []) {
        const after = hunk.after.join('\n'), before = hunk.before.join('\n');
        if (text.includes(after)) {
            assert.equal(text.split(after).length, 2, file + ': approved knights change is unique');
            text = text.replace(after, before);
        } else assert.ok(text.includes(before), file + ': only exact approved knights changes may differ');
    }
    return text;
}
function beforeBoard(text, file = 'index.html') {
    text = text.replaceAll('\r\n', '\n');
    text = beforeKnights(text, file);
    const audit = require('../rules/design-expectation-audit.json');
    const prepMarker = { 'index.html': 'function getHomePrepWeek(', 'tv.js': 'stage.prepWeek',
        'tv.html': 'id="celePrep"', 'programs-store.js': "id: 'homeprep'" }[file];
    const prepHunks = prepMarker && text.includes(prepMarker) ? audit.homeprepProductionChanges?.find(row => row.file === file)?.hunks : [];
    for (const hunk of prepHunks || []) {
        const after = hunk.after.join('\n'), before = hunk.before.join('\n');
        if (text.includes(after)) {
            assert.equal(text.split(after).length, 2, file + ': approved homeprep change is unique');
            text = text.replace(after, before);
        } else assert.ok(text.includes(before), file + ': only the exact approved homeprep change may differ');
    }
    const marker = { 'index.html': 'function getGeneralTvBoard(', 'tv.js': 'function boardPeriod(', 'tv.html': '.board-column {' }[file];
    if (marker && !text.includes(marker)) return text;
    const approved = require('../rules/design-expectation-audit.json').boardProductionChanges;
    for (const hunk of approved.find(row => row.file === file)?.hunks || []) {
        const after = hunk.after.join('\n'), before = hunk.before.join('\n');
        if (text.includes(after)) {
            assert.equal(text.split(after).length, 2, file + ': approved board change is unique');
            text = text.replace(after, before);
        } else assert.ok(text.includes(before), file + ': only the exact approved board change may differ');
    }
    return text;
}
module.exports = { beforeBoard, beforeKnights, beforeKnightsRound2 };
