const assert = require('node:assert/strict');
const { html } = require('./quick-entry-harness.cjs');
const approved = require('../rules/design-expectation-audit.json').trialRound2ProductionChanges;
// استثناءات حرفية مسجلة بطلب المالك؛ يبقى أي فرق إضافي ظاهراً لاختبارات القفل القديمة.
const beforeRound2 = approved.hunks.reduce((text, hunk) => {
    const after = hunk.after.join('\n'), before = hunk.before.join('\n');
    assert.ok(after && before);
    assert.equal(text.split(after).length, 2, 'each round two change occurs exactly once');
    return text.replace(after, before);
}, html);
module.exports = { beforeRound2 };
