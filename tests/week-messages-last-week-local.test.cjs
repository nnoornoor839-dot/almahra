// اختبارات قبول بطاقة «رسائل الأسبوع تقرأ آخر أسبوع دراسي محسوم» (general) — 2026-11-23. تُرى حمراء قبل البناء.
// المصدر: notes/features/messages/week-messages-last-school-week-card.md (البند 3 والأمثلة ق1–ق7؛ ق8–ق9 خارج هذا الملف).
// ملاحظة: بيانات k6-reference-week15 (سالم وسامي وهاني) من بذرة المحاكي ولا يعيدها هذا الحزام؛
// فالاختبارات هنا تثبت التواريخ وسطر الفرسان وهدف القفل وترتيب الحسم، وتُزاح بيانات الحزام إلى أسبوع 11-15.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cloud, runtime } = require('./helpers/knights-r2b-harness.cjs');
const { copy } = require('./helpers/quick-entry-harness.cjs');
const SEASON_PATH = 'programs/general/seasons/s1';
// التقويم الحي: بداية 2026-11-15، نهاية 2026-12-23، إجازة الخريف 20–28؛ أيام العمل الأحد–الأربعاء.
const AUTUMN = { from: '2026-11-20', to: '2026-11-28', name: 'إجازة الخريف', kind: 'official' };
const addDays = (ds, n) => { const d = new Date(ds + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const KNIGHT_LINE = '🏆 فارس حلقته للأسبوع';
// صف محسوم لحلقة أ: الطالب 1 (فهد) فارسها ومرشّح بأيامه الأربعة (knightsMessageRow يشترط وجوده في nominees).
function row(weekStart, { knight = 'فهد', locked = false } = {}) {
    const r = { key: 's1|' + weekStart + '|a', v: 1, weekStart, weekEnd: addDays(weekStart, 3), halaqaId: 'a', halaqaName: 'عمر بن الخطاب', halaqaOrder: 1,
        stageId: 'primary', period: 'asr', teacherName: 'معلم أ', n: 1,
        knights: [{ id: 1, name: knight, rank: 1, weekPointsTenths: 1982 }],
        nominees: [{ id: 1, name: knight, nominations: [0, 1, 2, 3].map(i => addDays(weekStart, i)), attendance: { schoolDays: 4, present: 4 }, eligible: true, reasons: [],
            weightTenths: { new: 1500, review: 300, total: 1800 }, weightMultipliers: { new: 3, review: 1 }, weekPointsTenths: 1982 }],
        rejectedApprovals: [], steps: [], frozenAt: { seconds: 1, nanoseconds: 0 }, frozenAtDevice: 1000, frozenBy: 'fake-admin' };
    if (locked) { r.lockedAt = { seconds: 2, nanoseconds: 0 }; r.lockedBy = 'fake-admin'; r.lockedSteps = []; }
    return r;
}
// تُزاح تواريخ سجلّ الحزام (أسبوع 11-22) بمقدار shift أيام، ليكون للأسبوع المطلوب إنجاز حقيقي.
function shiftHistories(server, shift) {
    for (const [path, s] of server.docs) if (path.includes('/students/'))
        s.history = Object.fromEntries(Object.entries(s.history || {}).map(([ds, day]) => [addDays(ds, shift), day]));
}
function setup(today, { frozen = [], rows = [], shift = -7, installGuard = true } = {}) {
    const server = cloud();
    shiftHistories(server, shift);
    const season = server.docs.get(SEASON_PATH);
    season.termStart = '2026-11-15'; season.termEnd = '2026-12-23'; season.calendar = [copy(AUTUMN)];
    season.frozenWeeks = Object.fromEntries(frozen.map(ws => [ws, { seconds: 1, nanoseconds: 0 }]));
    season.weekKnightsLog = Object.fromEntries(rows.map(r => [r.key, r]));
    const h = runtime(server, today + 'T09:00:00Z', installGuard);
    h.install('getGeneralMessageWeek', 'renderGeneralWeeklyMessages', 'sendGeneralWeeklyMessage', 'renderGeneralKnightsCopyPreview',
        'buildWeeklyKnightsAnnouncement', 'knightsIdentityOrder', 'getGeneralSchoolDates', 'getSchoolDayInfo', 'schoolCivilDate', 'isSeasonCalendarComplete');
    h.ctx.programBrandName = () => 'البرنامج العام';
    h.ctx.normalizeSaudiPhone = () => '966500000000'; h.ctx.measureReady = () => true;
    // سجل الاستدعاءات بالترتيب: حساب الأسبوع، واكتمال الحسم، والقفل.
    const calls = [];
    const week = h.ctx.getGeneralMessageWeek;
    h.ctx.getGeneralMessageWeek = current => { const w = week(current); calls.push('week:' + w.startStr); return w; };
    const lock = h.ctx.lockKnightsForMessage;
    h.ctx.lockKnightsForMessage = (ws, s) => { calls.push('lock:' + ws); return lock(ws, s); };
    return { server, h, calls };
}
const pick = (h, value) => { h.element('generalMessageWeek').value = value; };
const datesText = h => h.element('generalMessageWeekDates').textContent;
const fahd = h => h.run('students.find(s => s.id === 1)');
async function send(h, student = fahd(h)) {
    await h.call('sendGeneralWeeklyMessage', student);
    const href = h.ctx.window.location.href;
    return href === 'unchanged' ? null : decodeURIComponent(href.replace(/^[^?]*\?text=/, ''));
}
const errors = h => h.state.messages.filter(m => m.type === 'error').map(m => m.message);
// ق1/ق3/ق4/ق7: يوم العودة 2026-11-29، أسبوع 11-15 محسوم بصفّ فارسه فهد، وأسبوع 11-22 محسوم بلا صفوف.
const returnDay = (opts = {}) => setup('2026-11-29', { frozen: ['2026-11-15', '2026-11-22'], rows: [row('2026-11-15')], ...opts });
// ق2/ق3: أسبوع عادي 2026-12-06؛ 11-15 و11-29 بصفوف، و11-22 بلا صفوف. بيانات الحزام تُزاح إلى أسبوع 11-29.
const normalWeek = () => setup('2026-12-06', { frozen: ['2026-11-15', '2026-11-22', '2026-11-29'],
    rows: [row('2026-11-15', { knight: 'فهد', locked: true }), row('2026-11-29')], shift: 7 });

test('ق1 (يوم العودة 2026-11-29): «الماضي المكتمل» = 2026-11-15 — 2026-11-21، والرسالة بسطر الفرسان', async () => {
    const { h } = returnDay();
    pick(h, 'previous');
    await h.call('renderGeneralWeeklyMessages');
    assert.equal(datesText(h), '2026-11-15 — 2026-11-21', 'تواريخ اللوحة');
    const msg = await send(h);
    assert.ok(msg, 'فُتح واتساب: ' + JSON.stringify(h.state.messages));
    assert.ok(msg.includes('الأسبوع: 2026-11-15 إلى 2026-11-21'), 'سطر الأسبوع: ' + msg.split('\n')[2]);
    assert.ok(msg.includes(KNIGHT_LINE), 'سطر الفارس في الرسالة:\n' + msg);
    assert.ok(msg.includes('🏅 فارس حلقته: '), 'سطر الترشيح في الرسالة');
    assert.doesNotMatch(msg, /نقاط هذا الأسبوع: ٠؛/, 'أرقام أسبوع 15 لا أصفار أسبوع الإجازة');
});

test('ق2 (أسبوع عادي 2026-12-06): «الماضي المكتمل» = الحرفي 2026-11-29 — 2026-12-05، والرسالة مطابقة حرفاً بحرف', async () => {
    const a = normalWeek(); pick(a.h, 'previous');
    await a.h.call('renderGeneralWeeklyMessages');
    assert.equal(datesText(a.h), '2026-11-29 — 2026-12-05');
    const actual = await send(a.h);
    // المرجع: الحزام نفسه بأسبوع حرفي ثابت.
    const b = normalWeek(); pick(b.h, 'previous');
    b.h.ctx.getGeneralMessageWeek = current => current ? { startStr: '2026-12-06', endStr: '2026-12-06' } : { startStr: '2026-11-29', endStr: '2026-12-05' };
    const expected = await send(b.h);
    assert.ok(expected && expected.includes(KNIGHT_LINE), 'المرجع فيه سطر الفارس');
    assert.equal(actual, expected);
});

test('ق3 (أسبوع الرسائل = أسبوع الفرسان): في ق1 وق2 البداية = knightsDisplayWeekStart، والفارس نفسه في المعاينة والجدول', async () => {
    for (const [label, make, ws] of [['ق1', returnDay, '2026-11-15'], ['ق2', normalWeek, '2026-11-29']]) {
        const { h } = make();
        pick(h, 'previous');
        await h.call('renderGeneralWeeklyMessages');
        const display = await h.call('knightsDisplayWeekStart');
        assert.equal(display, ws, label + ': أسبوع العرض');
        assert.equal((await h.call('getGeneralMessageWeek', false)).startStr, display, label + ': أسبوع الرسائل = أسبوع العرض');
        const msg = await send(h);
        assert.ok(msg && msg.includes(KNIGHT_LINE), label + ': فهد فارس في الرسالة');
        await h.call('renderGeneralKnightsCopyPreview');
        assert.ok(h.element('gkCopyPreview').textContent.includes('فهد'), label + ': فهد في معاينة النسخ');
        await h.call('renderWeekKnightsReview');
        assert.ok(h.element('weekKnightsReview').innerHTML.includes('فهد'), label + ': فهد في جدول لوحة الفرسان');
    }
});

test('ق4 (القفل على الأسبوع الصحيح): الحسم يكتمل قبل حساب الأسبوع، والقفل على 2026-11-15، ولا كتابة على 11-22', async () => {
    const { server, h, calls } = returnDay();
    const ensure = h.ctx.ensureWeekKnightsFrozen;
    h.ctx.ensureWeekKnightsFrozen = async (...a) => { const r = await ensure(...a); calls.push('frozen'); return r; };
    pick(h, 'previous');
    const before = server.state.writes.length;
    await send(h);
    const locks = calls.filter(c => c.startsWith('lock:'));
    assert.deepEqual(locks, ['lock:2026-11-15'], 'هدف القفل: ' + calls.join(' ، '));
    const lockAt = calls.indexOf('lock:2026-11-15'), frozenAt = calls.lastIndexOf('frozen', lockAt);
    const weekAt = calls.slice(0, lockAt).findLastIndex(c => c.startsWith('week:'));
    assert.ok(frozenAt >= 0 && weekAt > frozenAt, 'حساب الأسبوع بعد اكتمال الحسم: ' + calls.join(' ، '));
    const rows = Object.values(server.season().weekKnightsLog);
    assert.ok(rows.find(r => r.weekStart === '2026-11-15' && r.halaqaId === 'a').lockedAt, 'صف فهد في 11-15 مقفل');
    assert.ok(!server.state.writes.slice(before).some(w => JSON.stringify(w.patch).includes('2026-11-22')), 'لا كتابة على 11-22');
});

test('ق5 (الحسم قبل القراءة): 11-15 و11-22 غير محسومين عند الفتح؛ الحسم المنتظَر يجعل التواريخ 11-15 والقفل عليه', async () => {
    const { server, h, calls } = setup('2026-11-29', { installGuard: false });
    // الحسم الوهمي لا يكتب إلا حين يُنتظر: قبله المخزن بلا أسابيع محسومة، فأي حساب مبكر يعطي أسبوعاً خاطئاً.
    h.ctx.ensureWeekKnightsFrozen = async () => {
        calls.push('freeze-start');
        await new Promise(r => setImmediate(r));
        const season = server.season();
        if (!season.frozenWeeks?.['2026-11-15']) {
            season.frozenWeeks = { '2026-11-15': { seconds: 1, nanoseconds: 0 }, '2026-11-22': { seconds: 1, nanoseconds: 0 } };
            season.weekKnightsLog = { [row('2026-11-15').key]: row('2026-11-15') };
            h.ctx.frozenSeason = copy(season);
            h.run("weekKnightsState.set('s1', frozenSeason)");
        }
        calls.push('frozen');
        return { ok: true };
    };
    assert.equal(server.season().frozenWeeks['2026-11-15'], undefined, 'قبل: غير محسوم');
    pick(h, 'previous');
    await h.call('renderGeneralWeeklyMessages');
    assert.ok(calls.includes('frozen'), 'الرسم ينتظر الحسم: ' + calls.join(' ، '));
    assert.equal(datesText(h), '2026-11-15 — 2026-11-21', 'تواريخ اللوحة بعد الحسم');
    const msg = await send(h);
    const locks = calls.filter(c => c.startsWith('lock:'));
    assert.deepEqual(locks, ['lock:2026-11-15'], 'لا لحظة يُقفل فيها أسبوع آخر: ' + calls.join(' ، '));
    const lockAt = calls.indexOf('lock:2026-11-15');
    const weekAt = calls.slice(0, lockAt).findLastIndex(c => c.startsWith('week:'));
    assert.ok(weekAt > calls.slice(0, lockAt).lastIndexOf('frozen'), 'أسبوع الإرسال محسوب بعد اكتمال الحسم: ' + calls.join(' ، '));
    assert.ok(msg && msg.includes('الأسبوع: 2026-11-15 إلى 2026-11-21') && msg.includes(KNIGHT_LINE), 'الرسالة بأسبوع 15 وسطر الفرسان:\n' + msg);
    assert.ok(Object.values(server.season().weekKnightsLog).every(r => r.weekStart !== '2026-11-15' || r.lockedAt), 'صف 11-15 مقفل');
});

test('ق6 (لا أسبوع محسوم، 2026-11-15): «الماضي المكتمل» = الحرفي 2026-11-08 — 2026-11-14 بلا خطأ', async () => {
    const { h, calls } = setup('2026-11-15', { shift: 0 });
    pick(h, 'previous');
    await h.call('renderGeneralWeeklyMessages');
    assert.equal(datesText(h), '2026-11-08 — 2026-11-14');
    const msg = await send(h);
    assert.ok(msg && msg.includes('الأسبوع: 2026-11-08 إلى 2026-11-14'), 'الرسالة: ' + msg);
    assert.deepEqual(calls.filter(c => c.startsWith('lock:')), ['lock:2026-11-08']);
    assert.deepEqual(errors(h), []);
});

test('ق7 (الحالي بلا تغيير، يوم العودة): «الحالي حتى اليوم» = 2026-11-29 — 2026-11-29 كما في k6 (current)', async () => {
    const { h, calls } = returnDay();
    pick(h, 'current');
    await h.call('renderGeneralWeeklyMessages');
    assert.equal(datesText(h), '2026-11-29 — 2026-11-29');
    const msg = await send(h);
    assert.ok(msg && msg.includes('الأسبوع: 2026-11-29 إلى 2026-11-29'), 'الرسالة: ' + msg);
    assert.ok(msg.includes('الفرسان يُحسمون الأربعاء'), 'سطر الحالي كما في k6');
    assert.ok(!msg.includes(KNIGHT_LINE));
    assert.deepEqual(calls.filter(c => c.startsWith('lock:')), ['lock:2026-11-29']);
    assert.deepEqual(errors(h), []);
});
