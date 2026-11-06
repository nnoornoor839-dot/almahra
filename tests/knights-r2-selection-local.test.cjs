const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/knights-r2-harness.cjs');
const input = require('./rules/knights-answer-key.json');

function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        Object.values(value).forEach(deepFreeze);
    }
    return value;
}

function checkBothOrders(h, student, a, b, expected) {
    const before = JSON.stringify([a, b]);
    deepFreeze(a); deepFreeze(b);
    for (const ordered of [[a, b], [b, a]]) {
        deepFreeze(ordered);
        for (const id of [Number(student.id), String(student.id)]) {
            assert.deepEqual(h.call('knightsMessageLines', { ...student, id }, ordered, true), expected);
        }
    }
    assert.equal(JSON.stringify([a, b]), before);
}

test('r2 selection: real A snapshot before moving Fahad beats rebuilt B in either array order', () => {
    const h = harness(), a = h.row('a'), fahad = h.list.find(s => s.id === 1);
    fahad.halaqaId = 'b';
    const b = h.row('b');
    assert.equal(a.knights.find(s => s.id === fahad.id).rank, 1);
    assert.equal(b.knights.find(s => s.id === fahad.id).rank, 2);
    assert.deepEqual(h.call('knightsMessageLines', fahad, [b], true),
        ['🏆 فارس حلقته للأسبوع: الثاني', '🏅 فارس حلقته: يوم من 4']);
    checkBothOrders(h, fahad, a, b, ['🏆 فارس حلقته للأسبوع', '🏅 فارس حلقته: يومان من 4']);
});

test('r2 selection: a nominee who is no knight in either row uses only the row with more nominations', () => {
    const h = harness(), a = h.row('a'), fahad = h.list.find(s => s.id === 1);
    fahad.halaqaId = 'b';
    const b = h.row('b');
    a.knights = a.knights.filter(s => s.id !== fahad.id);
    b.knights = b.knights.filter(s => s.id !== fahad.id);
    a.halaqaOrder = 99;
    b.homePrepPointsTenths[String(fahad.id)] = 9990;
    checkBothOrders(h, fahad, a, b, ['🏅 فارس حلقته: يومان من 4']);
});

function selectionRow({ halaqaId = 'a', halaqaOrder = 1, rank = null, nominations = 1, homePrep = 0 } = {}) {
    const nominee = { id: 1, nominations: input.days.slice(0, nominations), attendance: { schoolDays: 4 } };
    return { halaqaId, halaqaOrder, n: 2, nominees: [nominee],
        knights: rank === null ? [] : [{ id: '1', rank }], homePrepPointsTenths: { 1: homePrep } };
}

for (const [name, preferred, other] of [
    ['knight status precedes nomination count',
        { rank: 2, nominations: 1, halaqaOrder: 99 }, { nominations: 4 }],
    ['smaller knight rank precedes nomination count',
        { rank: 1, nominations: 1, halaqaOrder: 99 }, { rank: 2, nominations: 4 }],
    ['equal knight ranks use more nominations',
        { rank: 2, nominations: 2, halaqaOrder: 99 }, { rank: 2, nominations: 1 }],
    ['equal nominations use smaller halaqa order',
        { halaqaOrder: 1, halaqaId: 'z' }, { halaqaOrder: 2, halaqaId: 'a' }],
    ['equal halaqa orders use textual halaqa ID',
        { halaqaId: 'a' }, { halaqaId: 'b' }],
    ['numeric-looking halaqa IDs are compared textually',
        { halaqaId: 10 }, { halaqaId: '2' }]
]) test('r2 selection: ' + name, () => {
    const h = harness(), student = { id: 1 };
    const a = selectionRow({ ...preferred, homePrep: 100 });
    const b = selectionRow({ ...other, homePrep: 200 });
    const expected = h.call('knightsMessageLines', student, [a], true);
    assert.equal(expected.at(-1), '🏠 التحضير المنزلي: 10 نقطة');
    checkBothOrders(h, student, a, b, expected);
});

test('r2 selection: a row without the student as nominee cannot enter the ranking', () => {
    const h = harness(), a = selectionRow({ rank: 2 }), b = selectionRow({ rank: 1, nominations: 4, homePrep: 9990 });
    b.nominees = [];
    const student = { id: 1 }, expected = h.call('knightsMessageLines', student, [a], true);
    checkBothOrders(h, student, a, b, expected);
});
