// بلا شبكة: اختبارات وظائف الإنتاج بطلاب وهميين.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const { harness: rawHarness, student: rawStudent, entry, today, savedEntries, copy, source, html, baseline, root, QuranMeasure, generalEntryPoints } = require('./helpers/quick-entry-harness.cjs');
// بقية اختبارات السحابة تبدأ بطالب معروف لم يحفظ شيئاً؛ المجهول له حالات مستقلة.
const student = (entries = {}, extra = {}) => rawStudent(entries, { frontierFix: { surah: null, ayah: null, at: 0, by: 'fake-admin', prev: null }, ...extra });
const harness = (s = student()) => rawHarness(s);


test('imported last verse locks next from first opening; repeat keeps it locked', async () => {
    const h = harness(rawStudent({}, { lastSurah: 78, lastAyah: 11 }));
    assert.equal(h.ctx.document.getElementById('quick_new_fromSurah'), null);
    assert.equal(h.element('quick_new_start').textContent, 'النبأ ١٢');
    assert.equal(h.run('Object.hasOwn(getProgramSettings(), "features")'), false);
    h.range('new', null, [78, 20]); h.grade('new', 'repeat'); h.preview(); await h.save(); h.reopen();
    assert.equal(h.run('generalQuickEntry.locked'), true);
    assert.deepEqual(copy(h.run('generalQuickEntry.newStart')), { surah: 78, ayah: 12 });
    h.range('new', null, [78, 20]); h.grade('new'); h.preview(); await h.save(); h.reopen();
    assert.deepEqual(copy(h.run('generalQuickEntry.newStart')), { surah: 78, ayah: 21 });
});

test('repeat never moves an accepted frontier; general legacy base ignores lastDaily review pointer; summer/review-day match e93084d', () => {
    const s = student({ a: entry('new', [78, 1], [78, 10]), b: entry('new', [78, 11], [78, 20], 'repeat', 2) });
    const h = harness(s);
    assert.deepEqual(copy(h.run('computeFrontier(students[0])')), { surah: 78, ayah: 10 });
    assert.deepEqual(copy(h.run('generalQuickEntry.newStart')), { surah: 78, ayah: 11 });
    const legacy = rawStudent({}, { lastSurah: 78, lastAyah: 10, lastDailySurah: 67, lastDailyAyah: 20 }); delete legacy.frontierBase;
    h.ctx.legacy = legacy;
    assert.deepEqual(copy(h.run('computeFrontier(legacy)')), { surah: 78, ayah: 10 });
    for (const program of ['summer', 'review-day']) {
        h.state.program = program;
        const inputs = [s, legacy, student({}, { direction: 'down', frontierBase: { surah: 2, ayah: 5 } })];
        for (const value of inputs) {
            h.ctx.comparison = value; const current = copy(h.run('computeFrontier(comparison)'));
            h.run(source('computeFrontier', baseline));
            assert.deepEqual(current, copy(h.run('computeFrontier(comparison)')));
            h.run(source('computeFrontier'));
        }
    }
});

test('known no memorization starts locked at first route verse; repeat leaves frontier empty', async () => {
    const h = harness(); h.range('new', null, [114, 6]); h.grade('new', 'repeat'); h.preview(); await h.save(); h.reopen();
    assert.equal(h.run('generalQuickEntry.locked'), true);
    assert.equal(h.run('computeFrontier(students[0])'), null);
    assert.deepEqual(copy(h.run('generalQuickEntry.newStart')), { surah: 114, ayah: 1 });
});

test('review suggestion uses most recent at, endPointOf, next verse and cycles at/beyond frontier', () => {
    const fresh = entry('new', [114, 1], [78, 20]);
    for (const [reviews, expected] of [
        [{}, { surah: 114, ayah: 1 }],
        [{ r: entry('review', [114, 1], [78, 10], 'good', 10) }, { surah: 78, ayah: 11 }],
        [{ r: entry('review', [114, 1], [78, 20]) }, { surah: 114, ayah: 1 }],
        [{ r: entry('review', [114, 1], [77, 10]) }, { surah: 114, ayah: 1 }],
        [{ r: entry('review', [114, 1], [78, 10], 'good', 100), old: entry('review', [114, 1], [78, 20], 'good', 2) }, { surah: 78, ayah: 11 }]
    ]) {
        const h = harness(student({ fresh, ...reviews }));
        assert.deepEqual(copy(h.run('generalQuickSuggestions(students[0]).reviewStart')), expected);
    }
    const h = harness(student({ a: entry('new', [1, 1], [2, 20]), r: entry('review', [1, 1], [1, 7]) }, { direction: 'down' }));
    assert.deepEqual(copy(h.run('generalQuickSuggestions(students[0]).reviewStart')), { surah: 2, ayah: 1 });
});

test('review over known frontier is blocked without confirmation; accepted same-save new extends limit', async () => {
    for (const [end, confirm] of [[20, true], [21, false], [21, true]]) {
        const h = harness(student({ a: entry('new', [114, 1], [78, 20]) }));
        h.range('review', [114, 1], [78, end]); h.grade('review'); h.preview(); h.state.confirmed = confirm; await h.save();
        assert.equal(h.state.prompts.length, 0); assert.equal(h.state.writes.length, end === 20 ? 1 : 0);
        if (end > 20) assert.match(h.element('quick_review_message').textContent, /المراجعة تتعدّى محفوظه.*النبأ ٢٠/);
    }
    for (const grade of ['good','repeat']) {
        const h = harness(student({ a: entry('new', [114, 1], [78, 20]) }));
        h.range('new', null, [78, 25]); h.grade('new', grade); h.range('review', [114, 1], [78, 25]); h.grade('review'); h.preview(); await h.save();
        assert.equal(h.state.prompts.length, 0); assert.equal(h.state.writes.length, grade === 'good' ? 1 : 0);
        if (grade === 'good') assert.equal(savedEntries(h).length, 2);
    }
    const first = harness(); first.range('review', [114, 1], [67, 20]); first.grade('review'); first.preview(); await first.save();
    assert.equal(first.state.writes.length, 0); assert.match(first.element('quick_review_message').textContent, /لا محفوظ/);
});

test('both sections produce one request, frozen context and exact preview sum including changed criteria; lastDaily is derived', async () => {
    const h = harness(student({}, { history: { [today]: { entries: {}, criteria: { late: -2 }, criteriaPoints: -2, absence: 'excused', note: 'وهمي' } } }));
    h.range('new', [114, 1], [78, 20]); h.grade('new'); h.range('review', [114, 1], [114, 6]); h.grade('review');
    h.run('fulfillGeneralCriteria()'); const preview = h.preview(); await h.save();
    assert.equal(h.state.writes.length, 1); const entries = savedEntries(h); assert.equal(entries.length, 2);
    for (const e of entries) {
        assert.equal(e.grade, 'good'); assert.equal(e.mult, e.kind === 'new' ? 3 : 1); assert.equal(e.heardBy, 't1');
        assert.equal(e.halaqaId, 'h1'); assert.equal(e.stageId, 'stage1'); assert.equal(e.by, 'fake-admin');
        assert.equal(e.points, generalEntryPoints({ lines: QuranMeasure.measure({ spec: e.spec }).lines, kind: e.kind, gradeId: e.grade, settings: h.state.settings }).points);
        assert.equal(e.iv.every(Number.isInteger), true);
    }
    assert.equal(preview.total, Math.round((entries.reduce((sum, e) => sum + e.points, 0) + 10) * 10) / 10);
    assert.match(h.element('celebrationPoints').innerText, new RegExp(`\\+ ${preview.total} نقطة`));
    assert.equal(h.state.confetti, 1); assert.equal(h.element('celebrationRank').classList.contains('hidden'), false);
    assert.equal(h.element('smartModal').classList.contains('hidden'), true);
    const fields = h.state.writes[0].fields, last = copy(h.run('computeLastDaily(students[0])'));
    assert.deepEqual([fields.lastDailySurah, fields.lastDailyAyah, fields.lastDailySardRange], [last.surah, last.ayah, last.range]);
    assert.equal(h.s.history[today].attended, true); assert.equal('absence' in h.s.history[today], false);
    assert.equal('note' in h.s.history[today], false); assert.deepEqual(copy(h.s.history[today].criteria), { early: 5, uniform: 3 });
    assert.equal(Object.keys(fields).some(k => k === 'history' || k.endsWith('.entries')), false);
});

test('second grade click retains selection; explicit clear resets section; unused sections save attendance', async () => {
    for (const kind of ['new', 'review']) {
        const h = harness(rawStudent({}, { lastSurah: 114, lastAyah: 3 }));
        h.range(kind, kind === 'new' ? null : [114, 1], [114, kind === 'new' ? 6 : 3]); h.grade(kind); h.preview(); await h.save();
        assert.equal(savedEntries(h).length, 1); assert.equal(savedEntries(h)[0].kind, kind);
    }
    const h = harness(); h.grade('new'); h.grade('new');
    assert.equal(h.run('generalQuickEntry.grades.new'), 'good');
    await h.save(); assert.equal(h.state.writes.length, 0);
    h.run("clearGeneralQuickSection('new')"); h.preview(); await h.save();
    assert.equal(savedEntries(h).length, 0); assert.equal(h.s.history[today].attended, true);
    assert.equal(('history.' + today + '.criteria') in h.state.writes[0].fields, false);
    assert.equal(h.state.confetti, 0); assert.equal(h.state.messages.at(-1).message, 'حُفظ الحضور فقط');
    const changed = harness(); changed.run('fulfillGeneralCriteria()'); const p = changed.preview(); await changed.save();
    assert.equal(savedEntries(changed).length, 0); assert.equal(changed.s.history[today].criteriaPoints, 8);
    assert.equal(p.total, 8); assert.equal(changed.state.confetti, 1);
});

test('criteria remain unevaluated on open; fulfill checks only enabled positives and removes negatives; unchanged snapshot is not written', async () => {
    const h = harness(); assert.deepEqual(copy(h.run('getCriteriaSelection()')), {});
    assert.equal(h.element('generalCriteriaAllBtn').textContent, '✓ استوفى المعايير');
    assert.equal(h.element('generalCriteriaHost').hidden, true);
    h.element('generalCriteriaAllBtn').onclick(); assert.deepEqual(copy(h.run('getCriteriaSelection()')), { early: 5, uniform: 3 });
    const saved = harness(student({}, { history: { [today]: { entries: {}, criteria: { early: 5 }, criteriaPoints: 5 } } }));
    saved.range('new', [114, 1], [114, 6]); saved.grade('new');
    // Cloud update after open must survive when the operator has not changed the snapshot.
    saved.s.history[today].criteria = { early: 5, uniform: 3 }; saved.s.history[today].criteriaPoints = 8;
    const preview = saved.preview(); assert.equal(preview.criteria.delta, 0); await saved.save();
    assert.equal(`history.${today}.criteria` in saved.state.writes[0].fields, false);
    assert.deepEqual(copy(saved.s.history[today].criteria), { early: 5, uniform: 3 });
});

test('pending save blocks double-click, undo and close; no local change or celebration until successful cloud confirmation', async () => {
    const h = harness(); h.range('new', [114, 1], [114, 6]); h.grade('new'); h.preview(); const before = copy(h.s);
    let release; h.state.pending = new Promise(resolve => { release = resolve; });
    const pending = h.save(); await h.save(); await h.run('undoLastGeneralEntry()'); h.run('closeSmartModal()');
    assert.equal(h.state.writes.length, 1); assert.equal(h.state.confetti, 0); assert.deepEqual(h.s, before);
    for (const id of ['generalQuickSaveBtn', 'smartUndoBtn', 'generalQuickFields']) assert.equal(h.element(id).disabled, true);
    assert.equal(h.element('generalQuickSaveBtn').textContent, 'جارٍ الحفظ…');
    assert.equal(h.element('smartModal').classList.contains('flex'), true);
    release({ success: true }); await pending;
    assert.equal(h.state.confetti, 1); assert.equal(h.element('generalQuickSaveBtn').disabled, false);
});

test('cloud rejection and throw preserve all local values and open modal; retry succeeds once, final rank is hidden', async () => {
    for (const throws of [false, true]) {
        const h = harness(); h.range('new', [114, 1], [114, 6]); h.grade('new'); h.preview(); const before = copy(h.s);
        h.state.pending = throws ? Promise.reject(Error('فشل وهمي')) : Promise.resolve({ success: false, error: 'فشل وهمي' });
        await h.save(); assert.deepEqual(h.s, before); assert.equal(h.state.confetti, 0);
        assert.equal(h.element('smartModal').classList.contains('flex'), true); assert.equal(h.run('generalQuickEntry.grades.new'), 'good');
        assert.equal(h.element('quick_new_toAyah').value, '6'); assert.equal(h.element('generalQuickSaveBtn').disabled, false);
        assert.match(h.state.messages.at(-1).message, /فشل الحفظ السحابي/);
        h.state.pending = null; h.ctx.getStudentRank = () => 2; h.run('students.push({ id: 2 })');
        await h.save(); assert.equal(h.state.confetti, 1); assert.equal(h.element('celebrationRank').classList.contains('hidden'), true);
    }
});

test('guards reject missing teacher, school/cloud/measure blocks; preview must match actual save after settings change', async () => {
    for (const guard of ['school', 'cloud', 'measure']) {
        const h = harness(); h.state[guard] = false; await h.save(); assert.equal(h.state.writes.length, 0);
    }
    const noTeacher = harness(); noTeacher.state.settings.halaqas[0].active = false; await noTeacher.save();
    assert.equal(noTeacher.state.writes.length, 0); assert.match(noTeacher.state.messages.at(-1).message, /حلقة فعّالة/);
    const h = harness(); h.range('new', [114, 1], [114, 6]); h.grade('new'); h.preview();
    h.state.settings.kindMult.newMemorization = 5; await h.save();
    assert.equal(h.state.writes.length, 0); assert.match(h.state.messages.at(-1).message, /راجع المعاينة/);
    await h.save(); assert.equal(h.state.writes.length, 1); assert.equal(savedEntries(h)[0].mult, 5);
});

test('used invalid segments fail with specific field messages, with or without grade', async () => {
    for (const kind of ['new', 'review']) for (const grade of [false,true]) for (const to of [[78,''],[78,999],[78,2.5],[78,10],[79,1]]) {
        const h = harness(rawStudent({}, { lastSurah: 78, lastAyah: 19 }));
        h.range(kind, kind === 'new' ? null : [78,20], to); if(grade) h.grade(kind);
        // آية فارغة وحدها بلا تغيير قسم غير مستعمل؛ تغيير السورة يجعله مستعملاً.
        if (!grade && to[1] === '') h.element('quick_' + kind + '_toSurah').value = '77';
        h.preview(); await h.save(); assert.equal(h.state.writes.length, 0);
        assert.ok(h.element('quick_' + kind + '_message').textContent.length > 0);
    }
});

test('undo and reopen refresh locked start; frontier movement since open refuses stale locked input', async () => {
    const h = harness(student({ a: entry('new', [114, 1], [78, 10]) }));
    h.range('new', null, [78, 15]); h.grade('new'); h.preview();
    h.s.history[today].entries.other = entry('new', [78, 11], [78, 12], 'good', 2);
    await h.save(); assert.equal(h.state.writes.length, 0); assert.match(h.state.messages.at(-1).message, /تغيّر آخر جديد/);
    await h.run('undoLastGeneralEntry()'); assert.deepEqual(copy(h.run('generalQuickEntry.newStart')), { surah: 78, ayah: 11 });
});

test('summer/review-day retain legacy DOM and save functions verbatim; criteria/undo return to original positions', () => {
    const guard = "            if (isGeneralProgram()) { showToast('استعمل نموذج التسجيل الجديد', 'error'); return; }\n";
    assert.ok(source('saveSmartProgress').startsWith('function saveSmartProgress() {\n' + guard));
    assert.equal(source('saveSmartProgress').replace(guard, ''), source('saveSmartProgress', baseline));
    for (const name of ['buildEntryPatch', 'commitGeneralStudentPatch', 'resetStudentToday', 'canWriteHistory'])
        assert.equal(source(name), source(name, baseline), name);
    const legacyMarkup = text => text.slice(text.indexOf('            <div id="smartDailySection"'), text.indexOf('            <div id="smartMasterySection"'));
    assert.equal(legacyMarkup(html), legacyMarkup(baseline));
    const h = harness(); assert.equal(h.element('criteriaSection').parentNode.id, 'generalCriteriaHost');
    assert.equal(h.element('smartUndoRow').parentNode.id, 'generalQuickFooter');
    assert.match(h.element('generalQuickPanels').innerHTML, /الجديد[\s\S]*المراجعة/);
    assert.match(html, /id="generalQuickPanels"/);
    for (const program of ['summer', 'review-day']) {
        h.state.program = program; h.reopen();
        assert.equal(h.element('smartDailySection').style.display, '');
        assert.equal(h.element('generalQuickSection').classList.contains('hidden'), true);
        assert.equal(h.element('criteriaSection').parentNode, h.legacy);
        assert.equal(h.element('criteriaSection').nextSibling.id, 'legacySummary');
        assert.equal(h.element('smartUndoRow').parentNode, h.modal);
        assert.equal(h.element('generalCriteriaAllBtn').hidden, true);
        assert.equal(h.element('smartResetRow').style.display, '');
    }
});

test('legacy general save refuses hidden or forged inputs before any guard, write or celebration', () => {
    const h = harness(student({ a: entry('new', [114, 1], [78, 10]) }));
    h.install('saveSmartProgress');
    for (const busy of [false, true]) {
        h.run(`generalUndoInProgress = ${busy}`);
        h.ctx.prepareSchoolDay = () => assert.fail('legacy general must return immediately');
        h.element('startSurah').value = '67'; h.element('endAyah').value = '10';
        h.run('saveSmartProgress()');
        assert.equal(h.state.messages.at(-1).message, 'استعمل نموذج التسجيل الجديد');
        assert.equal(h.state.writes.length, 0); assert.equal(h.state.confetti, 0);
    }
});

test('merged cross-surah review is blocked in both directions and stays blocked after agreeing to other prompts', async () => {
    for (const [direction, from, to, base] of [['up',[114,1],[78,40],[78,20]],['down',[1,1],[2,40],[2,20]]]) {
        const h = harness(rawStudent({}, { direction, lastSurah:base[0], lastAyah:base[1] }));
        h.range('review',from,to); h.grade('review'); h.preview(); await h.save();
        assert.equal(h.state.prompts.length, 0); assert.equal(h.state.writes.length, 0);
        assert.match(h.element('quick_review_message').textContent,/المراجعة تتعدّى محفوظه/);
        assert.equal(h.element('smartModal').classList.contains('flex'), true);
        h.state.confirmed = true; await h.save(); assert.equal(h.state.writes.length, 0);
    }
});

test('pending save checks program, season, student ID, sid and date before closing or celebrating', async () => {
    for (const change of [h => { h.state.program = 'summer'; }, h => { h.state.season = 's2'; },
        h => { h.run('students.push({ ...students[0], id: 2 }); currentEditingStudentId = 2'); },
        h => { h.run("students = [{ ...students[0], sid: 'different-student' }]"); },
        h => { h.run("todayStr = '2026-11-02'"); }]) {
        const h = harness(); h.range('new', [114, 1], [114, 6]); h.grade('new'); h.preview();
        let release; h.state.pending = new Promise(resolve => { release = resolve; });
        const pending = h.save(); change(h); release({ success: true }); await pending;
        assert.equal(h.state.writes.length, 1); assert.equal(h.state.confetti, 0); assert.equal(h.state.updates, 0);
        assert.equal(h.element('smartModal').classList.contains('flex'), true);
        assert.equal(h.run('generalUndoInProgress'), false);
    }
});

test('program/season event forces the pending form closed, invalidates retry and cannot close a later legacy form', async () => {
    assert.match(html, /window\.addEventListener\('almahra-program-changed', invalidateGeneralQuickEntry\)/);
    for (const kind of ['program', 'season']) for (const busy of [false, true]) {
        const h = harness(); h.range('new', [114, 1], [114, 6]); h.grade('new'); h.preview();
        let release, pending;
        if (busy) { h.state.pending = new Promise(resolve => { release = resolve; }); pending = h.save(); }
        if (kind === 'program') h.state.program = 'summer'; else h.state.season = 's2';
        h.changed();
        assert.equal(h.element('smartModal').classList.contains('hidden'), true);
        assert.equal(h.run('generalQuickEntry.context'), null);
        assert.equal(h.element('generalQuickSection').dataset.ready, 'false');
        if (busy) {
            // برنامج آخر يفتح نافذته أثناء انتظار الطلب القديم.
            h.state.program = 'summer'; h.reopen();
            release({ success: true }); await pending;
            assert.equal(h.element('smartModal').classList.contains('flex'), true);
        }
        h.state.program = 'general'; await h.save();
        assert.equal(h.state.writes.length, busy ? 1 : 0); assert.equal(h.state.confetti, 0);
    }
});

test('away and back while saving cannot close a newly opened general student form', async () => {
    const h = harness(); h.range('new', [114, 1], [114, 6]); h.grade('new'); h.preview();
    let release; h.state.pending = new Promise(resolve => { release = resolve; }); const pending = h.save();
    h.state.program = 'summer'; h.changed(); h.state.program = 'general'; h.changed();
    h.run('generalUndoInProgress = false'); h.reopen(); // إظهار نموذج لاحق حتى لو أعادت الواجهة تهيئة الحالة.
    release({ success: true }); await pending;
    assert.equal(h.state.confetti, 0); assert.equal(h.element('smartModal').classList.contains('flex'), true);
});

test('undo reinitializes the current snapshot student, and ignores changed student/day contexts', async () => {
    for (const contextChange of ['none', 'studentId', 'sid', 'day', 'season', 'program']) {
        const h = harness(student({ a: entry('new', [114, 1], [78, 10]) }));
        let release; h.state.pending = new Promise(resolve => { release = resolve; });
        const pending = h.run('undoLastGeneralEntry()');
        h.run('students = structuredClone(students)');
        if (contextChange === 'studentId') h.run('students.push({ ...students[0], id: 2 }); currentEditingStudentId = 2');
        if (contextChange === 'sid') h.run("students[0].sid = 'different-student'");
        if (contextChange === 'day') h.run("todayStr = '2026-11-02'");
        if (contextChange === 'season') h.state.season = 's2';
        if (contextChange === 'program') h.state.program = 'summer';
        release({ success: true }); await pending;
        if (contextChange === 'none') {
            assert.equal(h.run(`Object.keys(students[0].history['${today}'].entries).length`), 0);
            assert.equal(h.run('generalQuickEntry.locked'), true);
            assert.deepEqual(copy(h.run('generalQuickEntry.newStart')), { surah: 114, ayah: 1 });
            assert.equal(h.state.updates, 1);
            assert.equal(h.s.history[today].entries.a.kind, 'new'); // النسخة القديمة بقيت كما هي.
        } else {
            assert.equal(h.run('generalQuickEntry.locked'), true); assert.equal(h.state.updates, 0);
            assert.equal(h.state.messages.some(m => m.type === 'success'), false);
        }
        assert.equal(h.state.confetti, 0);
    }
});

test('fixed clock gives review new.at+1; key order cannot alter lastDaily or two consecutive undo targets', async () => {
    for (const reverse of [false, true]) {
        const h = harness(); h.run('Date.now = () => 1234567890000');
        h.range('new', [114, 1], [114, 6]); h.grade('new');
        h.range('review', [114, 1], [114, 3]); h.grade('review'); h.preview(); await h.save();
        const [fresh, review] = savedEntries(h);
        assert.equal(fresh.kind, 'new'); assert.equal(review.kind, 'review');
        assert.equal(fresh.at, 1234567890000); assert.equal(review.at, fresh.at + 1);
        if (reverse) h.run(`students[0].history['${today}'].entries = Object.fromEntries(Object.entries(students[0].history['${today}'].entries).reverse())`);
        assert.equal(h.run('computeLastDaily(students[0]).ayah'), 3);
        assert.equal(h.s.lastDailyAyah, 3);
        h.reopen(); assert.equal(h.run('getGeneralUndoTarget(students[0]).entry.kind'), 'review');
        await h.run('undoLastGeneralEntry()');
        assert.equal(h.s.lastDailyAyah, 6); assert.equal(h.run('computeLastDaily(students[0]).ayah'), 6);
        assert.equal(h.run('getGeneralUndoTarget(students[0]).entry.kind'), 'new');
        await h.run('undoLastGeneralEntry()');
        assert.equal(h.run('getGeneralUndoTarget(students[0])'), null);
        assert.equal(h.run('computeLastDaily(students[0])'), null);
        assert.equal('lastDailyAyah' in h.s, false);
        assert.equal(h.state.writes.length, 3); assert.equal(h.state.confetti, 1);
    }
});

test('inline production script parses and prohibited files are byte-for-byte at e93084d', () => {
    for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
        if (!/type="module"|src=/.test(script[1])) new vm.Script(script[2]);
    }
    for (const file of ['firestore.rules', 'programs-store.js', 'data-store.js', 'general-points.js']) {
        const old = cp.execFileSync('git', ['show', `e93084d:${file}`], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n');
        assert.equal(fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n'), old, file);
    }
});
