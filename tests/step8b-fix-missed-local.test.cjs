// بلا شبكة: طلاب وهميون، تقويم الموسم الحقيقي، وميزان المصحف المحلي.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { harness: rawHarness, student: rawStudent, entry, today, savedEntries, copy, source, html, root, QuranMeasure, generalEntryPoints } = require('./helpers/quick-entry-harness.cjs');
const student = (entries = {}, extra = {}) => rawStudent(entries, { frontierFix: { surah: null, ayah: null, at: 0, by: 'fake-admin', prev: null }, ...extra });
const harness = (s = student()) => rawHarness(s);
const base = cp.execFileSync('git', ['show', '83da984:index.html'], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n');
function fix(h, surah, ayah) {
    h.run('renderGeneralFrontierFix(1)');
    h.element('frontierFixNone').checked = false;
    h.element('frontierFixSurah').value = String(surah); h.element('frontierFixAyah').value = String(ayah);
    return h.run('saveGeneralFrontierFix()');
}
function dated(s = student(), date = '2026-11-05') {
    const h = harness(s); h.ctx.date = date; h.run('todayStr = date'); h.reopen(); return h;
}
function select(h, date = '2026-11-01') { h.ctx.selectedDate = date; h.run('selectGeneralQuickDate(selectedDate)'); }

test('fix is the base in either direction; old, equal-at and missing-at new entries cannot move it; repeat cannot advance', () => {
    for (const direction of ['up', 'down']) for (const ayah of [5, 25]) {
        const h = harness(student({ old: entry('new', [78, 1], [78, 20]), equal: entry('new', [78, 1], [78, 30], 'good', 100),
            missing: { ...entry('new', [78, 1], [78, 40]), at: undefined }, repeat: entry('new', [78, 1], [78, 40], 'repeat', 101) },
            { direction, frontierFix: { surah: 78, ayah, at: 100, by: 'fake-admin', prev: null } }));
        assert.deepEqual(copy(h.run('computeFrontier(students[0])')), { surah: 78, ayah });
        h.ctx.accepted = entry('new', [78, ayah + 1], [78, 35], 'good', 102);
        h.run(`students[0].history['${today}'].entries.accepted = accepted`);
        assert.deepEqual(copy(h.run('computeFrontier(students[0])')), { surah: 78, ayah: 35 });
    }
});

test('fix without any new locks the next verse; review pointer stays unchanged and cycles if beyond corrected frontier', () => {
    const h = harness(student({ review: entry('review', [114, 1], [78, 30]) }, { frontierFix: { surah: 78, ayah: 10, at: 100 } }));
    assert.equal(h.run('generalQuickEntry.locked'), true);
    assert.deepEqual(copy(h.run('generalQuickEntry.newStart')), { surah: 78, ayah: 11 });
    assert.deepEqual(copy(h.run('computeLastReview(students[0])')), { surah: 78, ayah: 30 });
    assert.deepEqual(copy(h.run('generalQuickSuggestions(students[0]).reviewStart')), { surah: 114, ayah: 1 });
    const fresh = harness(student({}, { frontierFix: { surah: 67, ayah: 10, at: 100 } }));
    assert.equal(fresh.run('hasGeneralAcceptedNew(students[0])'), true);
    assert.deepEqual(copy(fresh.run('generalQuickEntry.newStart')), { surah: 67, ayah: 11 });
});

test('saving correction waits for cloud, stamps prev/by/at, replaces one field again, and preserves frozen history and lastDaily', async () => {
    const s = rawStudent({ old: entry('new', [78, 1], [78, 20]) }, { lastDailySurah: 78, lastDailyAyah: 20, lastDailySardRange: 'وهمي' });
    delete s.frontierBase; delete s.lastDailyBase;
    const h = harness(s), history = copy(s.history); h.run('Date.now = () => 100');
    let release; h.state.pending = new Promise(resolve => { release = resolve; });
    const pending = fix(h, 78, 10);
    assert.equal(h.state.writes.length, 1); assert.equal('frontierFix' in s, false);
    assert.equal(h.element('frontierFixFields').disabled, true);
    await h.run('saveGeneralFrontierFix()'); assert.equal(h.state.writes.length, 1);
    release({ success: true }); await pending; h.state.pending = null;
    assert.deepEqual(copy(s.frontierFix), { surah: 78, ayah: 10, at: 100, by: 'fake-admin', prev: { surah: 78, ayah: 20 } });
    assert.equal(s.frontierBase, null); assert.ok(s.lastDailyBase);
    assert.equal(s.lastDailyAyah, 20); assert.equal(s.lastDailySurah, 78); assert.equal(s.lastDailySardRange, 'وهمي');
    assert.deepEqual(s.history, history); assert.equal(h.state.confetti, 0);
    assert.equal(h.state.messages.at(-1).message, '✅ صُحّح الموضع');
    assert.match(h.element('frontierFixPrevious').textContent, /آخر تصحيح:/);
    h.run('Date.now = () => 200'); await fix(h, 78, 25);
    assert.deepEqual(copy(s.frontierFix), { surah: 78, ayah: 25, at: 200, by: 'fake-admin', prev: { surah: 78, ayah: 10 } });
    assert.deepEqual(Object.keys(h.state.writes[1].fields), ['frontierFix']); assert.deepEqual(s.history, history);
});

test('invalid, identical, cancelled, archived, missing-user and cloud-blocked corrections never write; failure preserves data', async () => {
    for (const [surah, ayah] of [[0, 1], [115, 1], [67, 0], [67, 31], [67, 2.5], [67.5, 1], [67, 10], ['', '']]) {
        const h = harness(student({ old: entry('new', [67, 1], [67, 10]) })); await fix(h, surah, ayah);
        assert.equal(h.state.writes.length, 0);
    }
    for (const mode of ['cancel', 'archive', 'cloud', 'user']) {
        const h = harness(); h.run('renderGeneralFrontierFix(1)');
        h.element('frontierFixSurah').value = '67'; h.element('frontierFixAyah').value = '10';
        if (mode === 'cancel') h.state.confirmed = false;
        if (mode === 'archive') h.state.archived = true;
        if (mode === 'cloud') h.state.cloud = false;
        if (mode === 'user') h.ctx.window.almahraAuth.currentUser = null;
        await h.run('saveGeneralFrontierFix()'); assert.equal(h.state.writes.length, 0);
    }
    const h = harness(), before = copy(h.s); h.state.pending = Promise.resolve({ success: false, error: 'فشل وهمي' });
    await fix(h, 67, 10); assert.deepEqual(h.s, before); assert.equal(h.element('frontierFixFields').disabled, false);
    assert.match(h.state.messages.at(-1).message, /فشل الحفظ السحابي/);
});

test('correction rejects changed program, season, selected student or frontier during confirmation', async () => {
    for (const change of [h => { h.state.program = 'summer'; }, h => { h.state.season = 's2'; },
        h => { h.s.sid = 'different'; }, h => { h.s.frontierFix = { surah: 67, ayah: 2, at: 3 }; },
        h => { h.run('renderFrontierFixPosition()'); }]) {
        const h = harness(); h.state.onConfirm = () => change(h); await fix(h, 67, 10);
        assert.equal(h.state.writes.length, 0);
    }
});

test('settings correction card and panel are available only for active general; no student-profile addition', () => {
    const h = harness();
    for (const program of ['general', 'summer', 'review-day']) for (const archived of [false, true]) {
        h.state.program = program; h.state.archived = archived; h.run('updateFrontierFixVisibility()');
        assert.equal(h.element('settingsFrontierFixCard').classList.contains('hidden'), program !== 'general' || archived);
        assert.equal(h.element('settingsFrontierFixCard').style.display, program === 'general' && !archived ? '' : 'none');
        h.element('setPanelFrontierFix').classList.remove('active'); h.run("openSettingsSection('setPanelFrontierFix')");
        assert.equal(h.element('setPanelFrontierFix').classList.contains('active'), program === 'general' && !archived);
    }
    assert.match(html, /id="setPanelFrontierFix" class="set-panel/);
    assert.match(html.slice(html.indexOf('id="settingsHome"'), html.indexOf('id="setPanelFrontierFix"')), /تصحيح موضع الحفظ/);
    assert.equal(source('openStudentModal'), source('openStudentModal', base));
});

test('locked-only quiet link keeps cancelled dirty input; opens settings with same halaqa/student and never unlocks', () => {
    assert.match(harness().element('generalQuickPanels').innerHTML, /تصحيح الموضع/);
    for (const dirty of ['none', 'grade', 'end', 'touched', 'criteria']) {
        const h = harness(student({ old: entry('new', [67, 1], [67, 10]) }));
        assert.match(h.element('generalQuickPanels').innerHTML, /موضعه غير صحيح؟ تصحيح الموضع/);
        if (dirty === 'grade') h.grade('review');
        if (dirty === 'end') h.element('quick_review_toAyah').value = '4';
        if (dirty === 'touched') h.element('quick_review_fromAyah').value = '2';
        if (dirty === 'criteria') h.run('fulfillGeneralCriteria()');
        h.state.confirmed = false; h.run('openGeneralFrontierFixFromQuick()');
        if (dirty !== 'none') {
            assert.equal(h.state.prompts[0], 'سيُترك ما أدخلته دون حفظ. متابعة؟');
            assert.equal(h.element('smartModal').classList.contains('flex'), true); assert.equal(h.state.tab, undefined);
            h.state.confirmed = true; h.run('openGeneralFrontierFixFromQuick()');
        } else assert.equal(h.state.prompts.length, 0);
        assert.equal(h.state.tab, 'page-settings'); assert.equal(h.element('smartModal').classList.contains('hidden'), true);
        assert.equal(h.element('setPanelFrontierFix').classList.contains('active'), true);
        assert.equal(h.element('frontierFixHalaqa').value, 'h1'); assert.equal(h.element('frontierFixStudent').value, '1');
        assert.equal(h.run('generalQuickEntry.locked'), true); assert.equal(h.state.writes.length, 0);
    }
});

test('missed list contains past school days of this week only; calendar is read from season and settings has no features', () => {
    const h = dated(); h.state.calendar.calendar = [{ from: '2026-11-02', to: '2026-11-02', name: 'إجازة وهمية' }];
    h.state.settings.workingDays = [0, 1, 2, 4];
    assert.equal(h.run('Object.hasOwn(getProgramSettings(), "features")'), false);
    assert.deepEqual(copy(h.run('getGeneralMissedDays()')), ['2026-11-01', '2026-11-03']);
    h.run('showGeneralMissedDays()'); assert.equal(h.element('generalMissedDays').children.length, 3);
    assert.deepEqual(h.element('generalMissedDays').children.map(button => button.textContent), ['الخميس ٠٥-١١', 'الأحد ٠١-١١', 'الثلاثاء ٠٣-١١']);
    for (const date of ['2026-10-29', '2026-11-02', '2026-11-04', '2026-11-06']) {
        select(h, date); assert.equal(h.run('generalQuickEntry.dateStr'), '2026-11-05');
    }
    const sunday = harness(); assert.equal(sunday.element('generalMissedDayBtn').disabled, false);
    assert.match(sunday.element('generalMissedDayBtn').textContent, /الأحد.*▾/);
});

test('date selection reads that day criteria, attendance and snapshot; current frontier/review suggestions are retained', () => {
    const h = dated(student({}, { history: {
        '2026-11-01': { attended: false, absence: 'excused', criteria: { late: -2 }, criteriaPoints: -2, entries: {} },
        '2026-11-05': { attended: true, criteria: { early: 5 }, criteriaPoints: 5, entries: {} }
    } }));
    const suggestions = copy(h.run('generalQuickSuggestions(students[0])')); select(h);
    assert.deepEqual(copy(h.run('getCriteriaSelection()')), { late: -2 });
    assert.deepEqual(copy(h.run('criteriaAtOpen.sel')), { late: -2 }); assert.equal(h.preview().criteria.delta, 0);
    assert.deepEqual(copy(h.run('generalQuickSuggestions(students[0])')), suggestions);
    assert.equal(h.run("getAttendanceState(students[0], generalQuickEntry.dateStr).state"), 'absent');
    assert.equal(h.element('generalMissedLabel').textContent, 'تسجيل على يوم الأحد ٠١-١١');
    assert.equal(h.element('generalMissedBanner').classList.contains('hidden'), false);
    select(h, '2026-11-05'); assert.deepEqual(copy(h.run('getCriteriaSelection()')), { early: 5 });
    assert.equal(h.element('generalMissedBanner').classList.contains('hidden'), true);
});

test('holiday or weekend today still opens the modal for eligible missed days; saving today stays blocked', async () => {
    for (const mode of ['holiday', 'weekend']) {
        const h = dated(student(), mode === 'holiday' ? '2026-11-04' : '2026-11-06');
        h.install('requireSchoolDay', 'requireSchoolCalendar', 'prepareSchoolDay');
        if (mode === 'holiday') h.state.calendar.calendar = [{ from: '2026-11-04', to: '2026-11-04', name: 'إجازة وهمية' }];
        h.run('closeSmartModal()'); h.reopen(); assert.equal(h.element('smartModal').classList.contains('flex'), true);
        await h.save(); assert.equal(h.state.writes.length, 0);
        select(h); await h.save(); assert.equal(h.state.writes.length, 1); assert.equal(h.s.history['2026-11-01'].attended, true);
        assert.equal(h.state.confetti, 0);
    }
});

test('missed save writes only selected date with frozen context, exact preview and hijri; keeps daily awards and chronological lastDaily; no celebration', async () => {
    const h = dated(student({}, { history: {
        '2026-11-01': { entries: {}, criteria: { late: -2 }, criteriaPoints: -2 },
        '2026-11-05': { entries: {}, criteria: { early: 5 }, criteriaPoints: 5 }
    } }));
    h.state.calendar.knightsLog = [{ dateStr: '2026-11-01', mode: 'stage1', first: { id: 1, name: 'طالب وهمي', points: 12 } }]; const season = copy(h.state.calendar);
    select(h); h.range('new', [114, 1], [78, 10]); h.grade('new');
    h.range('review', [114, 1], [114, 6]); h.grade('review'); h.run('fulfillGeneralCriteria()');
    const preview = h.preview(), current = copy(h.s.history['2026-11-05']); await h.save();
    assert.equal(h.state.writes.length, 1); const fields = h.state.writes[0].fields, entries = savedEntries(h);
    assert.equal(entries.length, 2);
    for (const e of entries) {
        assert.equal(e.grade, 'good'); assert.equal(e.mult, e.kind === 'new' ? 3 : 1);
        assert.equal(e.heardBy, 't1'); assert.equal(e.halaqaId, 'h1'); assert.equal(e.stageId, 'stage1'); assert.equal(e.by, 'fake-admin');
        assert.equal(e.points, generalEntryPoints({ lines: QuranMeasure.measure({ spec: e.spec }).lines, kind: e.kind, gradeId: e.grade, settings: h.state.settings }).points);
    }
    assert.equal(preview.total, Math.round((entries.reduce((sum, e) => sum + e.points, 0) + 10) * 10) / 10);
    assert.ok(Object.keys(fields).filter(k => k.startsWith('history.')).every(k => k.startsWith('history.2026-11-01.')));
    assert.equal(h.s.history['2026-11-01'].attended, true); assert.deepEqual(h.s.history['2026-11-05'], current);
    assert.deepEqual(h.state.calendar, season); assert.equal(h.state.knightWrites, 0); assert.equal(h.s.lastDailySurah, 114); assert.equal(h.s.lastDailyAyah, 6);
    const hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic', { timeZone: 'Asia/Riyadh', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date('2026-11-01T12:00:00'));
    assert.equal(fields['history.2026-11-01.hijri'], hijri);
    assert.equal(h.state.confetti, 0); assert.match(h.state.messages.at(-1).message, /حُفظ: الجديد.*المراجعة.*على يوم الأحد/);
    assert.deepEqual(h.state.prompts, ['سيُحفظ على يوم الأحد ٠١-١١. متابعة؟']);
});

test('absent missed day asks twice, cancellation of either writes nothing; successful save removes absence/note', async () => {
    for (const cancelAt of [1, 2, 0]) {
        const h = dated(student({}, { history: { '2026-11-01': { attended: false, absence: 'excused', note: 'وهمي', entries: {} } } })); select(h);
        h.state.onConfirm = () => { h.state.confirmed = h.state.prompts.length !== cancelAt; };
        await h.save(); assert.equal(h.state.writes.length, cancelAt ? 0 : 1);
        assert.equal(h.state.prompts[0], 'سيُحفظ على يوم الأحد ٠١-١١. متابعة؟');
        if (cancelAt !== 1) assert.equal(h.state.prompts[1], 'سُجّل طالب وهمي غائباً يوم الأحد ٠١-١١؛ التسجيل يجعله حاضراً. متابعة؟');
        if (!cancelAt) {
            assert.equal(h.s.history['2026-11-01'].attended, true);
            assert.equal('absence' in h.s.history['2026-11-01'], false); assert.equal('note' in h.s.history['2026-11-01'], false);
        }
        assert.equal(h.state.confetti, 0);
    }
});

test('missed mode blocks undo even with a current-day target; returning today restores undo and never deletes missed entries', async () => {
    const h = dated(student({}, { history: { '2026-11-01': { entries: { missed: entry('new', [78, 1], [78, 5]) } },
        '2026-11-05': { entries: { current: entry('review', [114, 1], [114, 4]) } } } }));
    select(h); assert.equal(h.run('generalQuickEntry.dateStr'), '2026-11-05');
    assert.match(h.state.messages.at(-1).message, /سُجّل له بعد هذا اليوم/);
    select(h, '2026-11-05'); assert.equal(h.element('smartUndoRow').classList.contains('hidden'), false);
    await h.run('undoLastGeneralEntry()'); assert.equal(h.state.writes.length, 1);
    assert.ok(h.s.history['2026-11-01'].entries.missed); assert.deepEqual(h.s.history['2026-11-05'].entries, {});
});

test('missed date is rechecked on save and after confirms: new week, holiday, working-day or season change refuses writing', async () => {
    for (const timing of ['before', 'confirm']) for (const mode of ['week', 'holiday', 'working', 'season', 'archive']) {
        const h = dated(); select(h);
        const change = () => {
            if (mode === 'week') h.run("todayStr = '2026-11-08'");
            if (mode === 'holiday') h.state.calendar.calendar = [{ from: '2026-11-01', to: '2026-11-01', name: 'طارئ وهمي' }];
            if (mode === 'working') h.state.settings.workingDays = [1, 2, 3, 4];
            if (mode === 'season') h.state.season = 's2';
            if (mode === 'archive') h.state.cloud = false;
        };
        if (timing === 'before') h.state.onRefresh = change; else h.state.onConfirm = change;
        await h.save(); assert.equal(h.state.writes.length, 0, timing + '/' + mode); assert.equal(h.state.confetti, 0);
    }
});

test('missed save waits, prevents double-click and date changes; rejection leaves input open and retry succeeds without celebration', async () => {
    const h = dated(); select(h); h.range('new', [114, 1], [114, 6]); h.grade('new'); h.preview();
    const before = copy(h.s); let release; h.state.pending = new Promise(resolve => { release = resolve; });
    const pending = h.save(); await h.save(); select(h, '2026-11-03');
    assert.equal(h.run('generalQuickEntry.dateStr'), '2026-11-01'); assert.equal(h.state.writes.length, 1); assert.deepEqual(h.s, before);
    release({ success: false, error: 'فشل وهمي' }); await pending;
    assert.equal(h.element('smartModal').classList.contains('flex'), true); assert.deepEqual(h.s, before);
    assert.equal(h.run('generalQuickEntry.grades.new'), 'good'); assert.equal(h.state.confetti, 0);
    h.state.pending = null; await h.save(); assert.equal(h.state.writes.length, 2); assert.equal(h.state.confetti, 0);
});

test('same-save accepted new participates in review blocking after correction, including missed mode', async () => {
    for (const grade of ['good', 'repeat']) {
        const h = dated(student({}, { frontierFix: { surah: 78, ayah: 10, at: 100 } })); select(h);
        h.range('new', null, [78, 20]); h.grade('new', grade); h.range('review', [78, 1], [78, 20]); h.grade('review'); h.preview();
        await h.save(); assert.equal(h.state.prompts.some(p => p.startsWith('المراجعة تتعدّى')), false); assert.equal(h.state.writes.length, grade === 'repeat' ? 0 : 1);
    }
});

test('summer/review-day frontier ignores frontierFix and matches 83da984; protected functions, legacy markup and files are unchanged', () => {
    const h = harness(); h.run(source('computeFrontier', base).replace('function computeFrontier(', 'function baselineFrontier('));
    for (const program of ['summer', 'review-day']) {
        h.state.program = program;
        for (const direction of ['up', 'down']) for (const ayah of [5, 25]) {
            h.ctx.fixture = student({ old: entry('new', [78, 1], [78, 20]), repeat: entry('new', [78, 1], [78, 30], 'repeat', 101) },
                { direction, frontierBase: { surah: 78, ayah: 1 }, frontierFix: { surah: 78, ayah, at: 100 } });
            assert.deepEqual(copy(h.run('computeFrontier(fixture)')), copy(h.run('baselineFrontier(fixture)')));
        }
    }
    for (const name of ['saveSmartProgress', 'buildEntryPatch', 'commitGeneralStudentPatch', 'canWriteHistory', 'resetStudentToday'])
        assert.equal(source(name), source(name, base), name);
    const legacy = text => text.slice(text.indexOf('            <div id="smartDailySection"'), text.indexOf('            <div id="smartMasterySection"'));
    assert.equal(legacy(html), legacy(base));
    for (const file of ['firestore.rules', 'programs-store.js', 'data-store.js', 'general-points.js'])
        assert.equal(fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n'), cp.execFileSync('git', ['show', `83da984:${file}`], { encoding: 'utf8' }).replaceAll('\r\n', '\n'));
});
