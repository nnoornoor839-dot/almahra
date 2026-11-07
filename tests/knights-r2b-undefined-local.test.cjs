const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cloud, runtime, key } = require('./helpers/knights-r2b-harness.cjs');
const { harness } = require('./helpers/knights-r2-harness.cjs');
const { copy, source } = require('./helpers/quick-entry-harness.cjs');
const { assertFirestoreData } = require('./helpers/firestore-strict.cjs');
const rows = server => Object.values(server.season().weekKnightsLog || {});

for (const operation of ['setDoc', 'updateDoc', 'batch.set', 'batch.update', 'transaction.set', 'transaction.update']) {
    test('Firestore rejects nested undefined before copying or queuing: ' + operation, async () => {
        const server = cloud(), sdk = server.sdk;
        const write = async data => {
            const path = 'programs/general/seasons/s1';
            if (operation.startsWith('batch.')) {
                const batch = sdk.writeBatch({});
                batch.set('untouched', { valid: true });
                batch[operation.split('.')[1]](path, data);
                await batch.commit();
            } else if (operation.startsWith('transaction.')) {
                await sdk.runTransaction({}, tx => tx[operation.split('.')[1]](path, data));
            } else await sdk[operation](path, data);
        };
        const before = copy([...server.docs]);
        const payloads = [undefined, { bad: undefined }, { nested: [{ previous: { bad: undefined } }] }, { nested: [undefined] }];
        for (const data of payloads) {
            await assert.rejects(write(data), error => error.code === 'invalid-argument'
                && /Function .*\(\) called with invalid data\. Unsupported field value: undefined/.test(error.message)
                && error.message.includes('programs/general/seasons/s1'));
            assert.deepEqual(copy([...server.docs]), before);
            assert.equal(server.state.writes.length, 0);
        }
        assert.ok(Object.hasOwn(payloads[1], 'bad'), 'the validator must not strip the field');
        assert.equal(payloads[2].nested[0].previous.bad, undefined);
        await write({ nested: [{ value: null }], valid: false, zero: 0, empty: '' });
        assert.ok(server.state.writes.length > 0);
    });
}

function settingsWithoutOrder(server) {
    const settings = server.docs.get('programs/general').settings;
    // Same five fields emitted by collectGeneralHalaqaRows; deliberately nonalphabetical.
    const byId = new Map(settings.halaqas.map(h => [h.id, h]));
    settings.halaqas = ['e', 'c', 'a', 'g', 'b', 'f', 'd'].map(id => {
        const { name, teacherId, stageId, active } = byId.get(id);
        return { id, name, teacherId, stageId, active };
    });
    settings.halaqas.splice(1, 0, { id: 'paused', name: 'موقوفة', teacherId: '', stageId: '', active: false });
    return settings;
}

test('settings-created halaqas freeze, review and closing slide follow full settings array, then general saves', async () => {
    const server = cloud(), settings = settingsWithoutOrder(server), h = runtime(server);
    assert.match(source('renderProgramSettings'), /s\.halaqas \|\| \[\]\)\.map\(generalHalaqaRow\)/);
    assert.doesNotMatch(source('collectGeneralHalaqaRows'), /\border:/);
    assert.equal((await h.frozen()).ok, true);
    for (const row of rows(server)) {
        assert.equal(row.halaqaOrder, settings.halaqas.findIndex(circle => circle.id === row.halaqaId));
        assert.ok(Number.isInteger(row.halaqaOrder));
        assertFirestoreData(row, 'Transaction.update', 'season');
    }
    await h.call('renderWeekKnightsReview');
    const review = h.element('weekKnightsReview').innerHTML;
    const active = settings.halaqas.filter(circle => circle.active);
    const positions = active.map(circle => review.indexOf('<h4 class="font-bold">' + circle.name + ' — '));
    assert.ok(positions.every((position, i) => position >= 0 && (!i || position > positions[i - 1])));
    for (const stageId of [...new Set(active.map(circle => circle.stageId))]) {
        assert.equal((await h.call('lockWeekRows', key.days[0], stageId)).success, true);
    }
    for (const period of ['asr', 'maghrib']) {
        const locked = copy(await h.call('getLockedWeekKnights', period));
        const expected = rows(server).filter(row => row.period === period).sort((a, b) => a.halaqaOrder - b.halaqaOrder);
        assert.deepEqual(locked.map(item => item.stage), expected.map(row => row.halaqaName));
        const slide = require('../tv.js').makeSlides({ stages: [{ period, name: period, weekKnights: locked }] }, period)
            .find(slide => slide.kind === 'weekKnights');
        assert.deepEqual(slide.items.map(item => item.stage), expected.map(row => row.halaqaName));
    }
    const writes = server.state.writes.length;
    assert.equal((await h.ctx.window.almahraData.patchStudent(1, { 'history.2026-11-29.attended': true })).success, true);
    assert.equal(server.state.writes.length, writes + 1);
    assert.equal(server.students().find(student => student.id === 1).history['2026-11-29'].attended, true);
});

test('only finite numeric halaqa order is preserved; fallback uses index including inactive halaqas', () => {
    const h = harness(), circle = h.settings.halaqas[2];
    for (const order of [undefined, null, '', '4', NaN, Infinity, -Infinity]) {
        const input = { ...circle, order };
        assert.equal(h.call('buildWeekKnightsRow', h.range, input, h.list, h.approvals, h.settings).halaqaOrder, 2);
    }
    for (const order of [0, 12, -1, 2.5]) {
        assert.equal(h.call('buildWeekKnightsRow', h.range, { ...circle, order }, h.list, h.approvals, h.settings).halaqaOrder, order);
    }
});

test('optional settings, nested row data, refreeze history, actors and round-one writes contain no undefined', async () => {
    const server = cloud(), settings = settingsWithoutOrder(server);
    for (const stage of settings.stages) delete stage.period;
    settings.halaqas.find(circle => circle.id === 'a').teacherId = '';
    settings.halaqas.find(circle => circle.id === 'b').stageId = '';
    const h = runtime(server);
    h.ctx.window.almahraAuth.currentUser = null;
    assert.equal((await h.frozen()).ok, true);
    assert.equal(rows(server).find(row => row.halaqaId === 'a').teacherName, '');
    assert.equal(rows(server).find(row => row.halaqaId === 'b').stageName, '');
    assert.equal(rows(server).find(row => row.halaqaId === 'b').period, '');
    for (const row of rows(server).filter(row => row.stageId)) {
        assert.equal(row.period, row.stageId === 'primary' ? 'asr' : 'maghrib');
    }
    const data = h.ctx.window.almahraData;
    assert.equal((await h.call('unfreezeHalaqaWeek', key.days[0], 'a', 'تصحيح موثق')).success, true);
    const corrected = rows(server).find(row => row.halaqaId === 'a');
    assert.equal(corrected.frozenBy, '');
    assert.equal(corrected.refreeze[0].by, '');
    assert.equal(corrected.refreeze[0].previous.frozenBy, '');
    assert.equal(typeof corrected.frozenAtDevice, 'number');
    assert.equal((await h.call('lockWeekRows', key.days[0], 'primary')).success, true);
    const locked = rows(server).find(row => row.halaqaId === 'a');
    assert.equal(locked.lockedBy, '');
    assert.deepEqual(locked.lockedSteps, locked.steps);
    assert.equal((await data.setMissingJoinedOn('general', 's1', [17], key.season.termStart)).success, true);
    h.ctx.window.almahraAuth.currentUser = { uid: 'fake-admin' };
    h.install('approveGeneralHalaqaKnights');
    h.run('let honorKnightsLog = [], currentThreeKnights = null');
    h.ctx.sendGeneralTvSnapshot = () => {};
    h.element('farsAutoMode').value = 'h:a';
    h.element('farsAutoDate').value = key.days[0];
    h.element('farsHalaqaReason').value = 'اعتماد موثق';
    h.element('fars1Select').value = '1';
    assert.equal(await h.call('approveGeneralHalaqaKnights'), true);
    assert.equal(server.season().knightsLog.find(entry => entry.mode === 'h:a').by, 'fake-admin');
    for (const write of server.state.writes) assertFirestoreData(write.patch, 'write', write.path);
    assertFirestoreData(server.season(), 'write', 'season');
});
