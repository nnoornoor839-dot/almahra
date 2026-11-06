// Compare the saved pre-round key with the owner-approved draft 3 key.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const [beforePath, afterPath] = process.argv.slice(2);
assert.ok(beforePath && afterPath, 'usage: node homeprep-key-diff.cjs BEFORE AFTER');
const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'));
const expected = structuredClone(before), name = id => before.students.find(s => s.id === id).name;
const row = (id, points) => ({ name: name(id), points });
expected.prepWeek = { asr: [row(1,20),row(4,20),row(2,10),row(3,10),row(5,10),row(6,10)], maghrib: [row(7,10)] };
expected.afterFaris = [row(1,20),row(4,20),row(6,20),row(2,10),row(3,10),row(5,10)];
for (const s of expected.students) s.prep = true;
expected.newScope.sultan.prep = true;
expected.newScope.maghrib = [row(7,20)];
expected.undo.after.badrRank = 3;
const oldRank = name(4) + ' (130): **' + name(4) + ' 1، ' + name(1) + ' 2**';
const newRank = name(4) + ' (130): **' + name(4) + ' 1، ' + name(1) + ' 3**';
assert.ok(expected.verbatimAnswerKey.includes(oldRank));
expected.verbatimAnswerKey = expected.verbatimAnswerKey.replace(oldRank, newRank);
assert.deepEqual(after, expected, 'only exact authorized slide changes and the Badr rank correction');
function diff(a, b, path = '') {
    if (JSON.stringify(a) === JSON.stringify(b)) return [];
    if ((Array.isArray(a) || Array.isArray(b)) && (a.length !== b.length || !path.startsWith('students'))) return [path];
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return [path];
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(k => diff(a[k], b[k], path ? path + '.' + k : k));
}
const paths = diff(before, after);
console.log('PASS: ' + paths.length + ' changed paths; prepWeek or equivalent only, plus authorized Badr rank correction.');
console.log(paths.join('\n'));
console.log('Unexpected changes: 0; numeric changes outside slide: undo.after.badrRank 2 -> 3 only.');
