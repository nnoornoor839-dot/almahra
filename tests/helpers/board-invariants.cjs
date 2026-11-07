const assert = require('node:assert/strict');
// استثناءات حرفية باعتماد المالك ٢٠٢٦-١١-٠٦؛ لا تُسقط دالة أو ملفاً من القفل.
function beforeBoard(text, file = 'index.html') {
    text = text.replaceAll('\r\n', '\n');
    const audit = require('../rules/design-expectation-audit.json');
    for (const hunk of audit.launchHideProductionChanges?.find(row => row.file === file)?.hunks || []) {
        const after = [...(hunk.anchor || []), ...hunk.after].join('\n'), before = [...(hunk.anchor || []), ...hunk.before].join('\n');
        if (text.includes(after)) {
            assert.equal(text.split(after).length, 2, file + ': approved launch hide change is unique');
            text = text.replace(after, before);
        } else assert.ok(text.includes(before), file + ': only the exact approved launch hide change may differ');
    }
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
module.exports = { beforeBoard };
