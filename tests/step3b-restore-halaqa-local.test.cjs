// Offline only: extracted production functions, synthetic backups and fake file/UI writes.
// Run: node --test tests/step3b-restore-halaqa-local.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
function source(name) {
    const start = html.search(new RegExp(`(?:async )?function ${name}\\(`));
    assert.ok(start >= 0, `production function ${name}`);
    for (let end = html.indexOf('}', start); end >= 0; end = html.indexOf('}', end + 1)) {
        const candidate = html.slice(start, end + 1);
        try { new vm.Script(`(${candidate})`); } catch { continue; }
        return candidate;
    }
    throw Error(`Unclosed function ${name}`);
}
function student(id = 1, fields = {}) {
    return { id, sid: `synthetic-sid-${id}`, name: `طالب وهمي ${id}`, history: {},
        halaqaId: 'h1', teacherId: 't1', stage: 'g1', ...fields };
}
function harness(program = 'general') {
    const state = { program, messages: [], saves: [], prompts: [], updates: 0, uuids: 0,
        settings: {
            teachers: [{ id: 't1' }, { id: 't2' }], stages: [{ id: 'g1' }, { id: 'g2' }],
            halaqas: [
                { id: 'h1', name: 'حلقة وهمية أولى', teacherId: 't1', stageId: 'g1', active: true },
                { id: 'h2', name: 'حلقة وهمية ثانية', teacherId: 't2', stageId: 'g2', active: true }
            ]
        } };
    const original = [student(), student(90)], input = { value: 'synthetic.json' };
    const ctx = vm.createContext({
        FileReader: class { readAsText(file) { state.reader = this; state.file = file; } },
        document: { getElementById(id) { assert.equal(id, 'importBackupFile'); return input; } },
        canWriteCloud: () => true, isGeneralProgram: () => state.program === 'general',
        getProgramSettings: () => { assert.equal(state.program, 'general'); return state.settings; },
        crypto: { randomUUID: () => `synthetic-uuid-${++state.uuids}` },
        confirm: message => { state.prompts.push(message); return true; },
        showToast: (message, type) => state.messages.push({ message, type }),
        tiersFeatureOn: () => true,
        saveData: () => state.saves.push(copy(run('students'))),
        updateAllUIs: () => state.updates++
    });
    const run = code => vm.runInContext(code, ctx);
    ctx.initialStudents = original;
    run("let students = initialStudents, _noLevelWarned = { key: 'synthetic', ids: [1] };");
    for (const name of ['countLabel', 'getStudentHalaqa', 'generalRecitationTeacher',
        'generalStudentMembership', 'isValidStudentBackup', 'importNuclearBackup']) run(source(name));
    run(html.match(/const studentsCountLabel = .*?;/)[0]);
    return { state, run, original, restore(data) {
        const file = { name: 'synthetic.json' };
        ctx.event = { target: { files: [file] } };
        run('importNuclearBackup(event)');
        assert.equal(state.file, file);
        state.reader.onload({ target: { result: JSON.stringify(data) } });
    } };
}
function assertRejected(h, before, message) {
    assert.equal(h.run('students'), h.original);
    assert.equal(JSON.stringify(h.original), before);
    assert.deepEqual(h.state.saves, []);
    assert.deepEqual(h.state.prompts, []);
    assert.equal(h.state.updates, 0);
    assert.equal(h.run('_noLevelWarned.key'), 'synthetic');
    assert.deepEqual(h.state.messages, [{ message, type: 'error' }]);
}

test('general restore accepts active halaqas and derives teacher/stage copies even when file copies disagree or are absent', () => {
    const h = harness(), first = student(1, { teacherId: 'missing-teacher', stage: 'missing-stage', tierId: 'old-tier' });
    const second = student(2, { halaqaId: 'h2', memorizedJuz: 4 });
    delete first.sid; delete second.teacherId; delete second.stage;
    const data = [first, second], before = JSON.stringify(data);
    h.restore(data);
    assert.equal(JSON.stringify(data), before);
    assert.equal(h.state.saves.length, 1);
    assert.equal(h.state.prompts.length, 1);
    assert.equal(h.state.updates, 1);
    const restored = copy(h.run('students'));
    assert.deepEqual(restored, [
        student(1, { memorizedJuz: null }),
        student(2, { halaqaId: 'h2', teacherId: 't2', stage: 'g2', memorizedJuz: 4 })
    ]);
    assert.deepEqual(h.state.saves[0], restored);
    assert.equal(h.state.uuids, 0);
    assert.equal(h.state.messages.at(-1).type, 'success');
});

for (const kind of ['absent', 'empty', 'null', 'missing', 'inactive', 'not-explicitly-active', 'missing-teacher', 'missing-stage']) {
    test(`general restore rejects the whole file for ${kind} halaqa membership without changing students or saving`, () => {
        const h = harness(), invalid = student(), before = JSON.stringify(h.original);
        if (kind === 'absent') delete invalid.halaqaId;
        if (kind === 'empty') invalid.halaqaId = '';
        if (kind === 'null') invalid.halaqaId = null;
        if (kind === 'missing') h.state.settings.halaqas.shift();
        if (kind === 'inactive') h.state.settings.halaqas[0].active = false;
        if (kind === 'not-explicitly-active') delete h.state.settings.halaqas[0].active;
        if (kind === 'missing-teacher') h.state.settings.teachers.shift();
        if (kind === 'missing-stage') h.state.settings.stages.shift();
        // الطالب الحالي يحمل الحلقة نفسها؛ لا يجوز تجاوز الفحص بسبب تطابق العضوية.
        h.restore([student(2, { halaqaId: 'h2' }), invalid]);
        assertRejected(h, before, 'استعادة مرفوضة: طالب واحد بلا حلقة فعّالة؛ اربطهم بحلقة أو أنشئها ثم أعد المحاولة');
    });
}

test('general restore counts all invalid memberships using studentsCountLabel', () => {
    const h = harness(), before = JSON.stringify(h.original);
    h.restore([student(2, { halaqaId: 'h2' }), student(1, { halaqaId: '' }), student(3, { halaqaId: 'missing' })]);
    assertRejected(h, before, 'استعادة مرفوضة: طالبان بلا حلقة فعّالة؛ اربطهم بحلقة أو أنشئها ثم أعد المحاولة');
});

test('general restore keeps the existing validation order around membership validation', () => {
    const cases = [
        { data: Array.from({ length: 451 }, (_, i) => student(i, { halaqaId: '' })), message: /تتجاوز حد ٤٥٠/ },
        { data: [student(1, { halaqaId: '' }), student(1)], message: /تكرر معرّف الطالب في الملف/ },
        { data: [student(1, { halaqaId: '', history: { synthetic: {} } })], message: /استعادة السجلات/ },
        { data: [student(1, { halaqaId: '', sid: 'different-sid' })], message: /بلا حلقة فعّالة/ },
        { data: [student(1, { sid: 'different-sid' })], message: /معرّف sid مختلف/ },
        { data: [student(2, { sid: 'same-sid' }), student(3, { sid: 'same-sid' })], message: /تكرر معرّف sid بعد/ }
    ];
    for (const { data, message } of cases) {
        const h = harness(), before = JSON.stringify(h.original);
        h.restore(data);
        assert.match(h.state.messages[0].message, message);
        assertRejected(h, before, h.state.messages[0].message);
    }
});

for (const program of ['summer', 'review-day']) {
    test(`${program} restore still accepts students without halaqas and preserves file teacher/stage and history`, () => {
        const h = harness(program), data = [student(7, {
            halaqaId: 'missing', teacherId: 'file-teacher', stage: 'file-stage', history: { synthetic: { points: 2 } }
        }), { id: 8, name: 'طالب وهمي بلا حلقة', history: {} }];
        h.state.settings.halaqas = [];
        h.restore(data);
        assert.deepEqual(h.state.saves, [data.map(s => ({ ...s, memorizedJuz: null }))]);
        assert.equal(h.state.prompts.length, 1);
        assert.match(h.state.prompts[0], /بلا مقدار حفظ/);
        assert.equal(h.state.updates, 1);
        assert.equal(h.state.messages.at(-1).type, 'success');
    });
}
