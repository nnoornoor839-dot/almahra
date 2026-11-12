// اختبارات قبول بطاقة «الأسبوع الماضي = آخر أسبوع دراسي محسوم» (general) — 2026-11-12. تُرى حمراء قبل البناء.
// المصدر: notes/features/knights/last-school-week-card.md (البند 7 والأمثلة ف1–ف7).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cloud, runtime } = require('./helpers/knights-r2b-harness.cjs');
const { copy } = require('./helpers/quick-entry-harness.cjs');
const SEASON_PATH = 'programs/general/seasons/s1';
// التقويم الحي: بداية 2026-11-15، نهاية 2026-12-23، إجازة الخريف 20–28؛ أيام العمل الأحد–الأربعاء (key.settings.workingDays=[0,1,2,3]).
const AUTUMN = { from: '2026-11-20', to: '2026-11-28', name: 'إجازة الخريف', kind: 'official' };
const addDays = (ds, n) => { const d = new Date(ds + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// صف بالشكل الذي يكتبه knightsFreezeRow ثم saveWeekKnightsRows (الحقول الدنيا التي تقرؤها دوال العرض).
function row(weekStart, { halaqaId = 'a', knight = 'فهد', locked = false } = {}) {
    const halaqas = { a: ['عمر بن الخطاب', 1, 'primary', 'asr', 'معلم أ'], c: ['المقداد بن عمرو', 1, 'middle', 'maghrib', 'معلم ج'] };
    const [halaqaName, halaqaOrder, stageId, period, teacherName] = halaqas[halaqaId];
    const r = { key: 's1|' + weekStart + '|' + halaqaId, v: 1, weekStart, weekEnd: addDays(weekStart, 3), halaqaId, halaqaName, halaqaOrder,
        stageId, period, teacherName, n: 1, knights: knight ? [{ id: 1, name: knight, rank: 1 }] : [], nominees: [], rejectedApprovals: [], steps: [],
        frozenAt: { seconds: 1, nanoseconds: 0 }, frozenAtDevice: 1000, frozenBy: 'fake-admin' };
    if (locked) { r.lockedAt = { seconds: 2, nanoseconds: 0 }; r.lockedBy = 'fake-admin'; r.lockedSteps = []; }
    return r;
}
// frozen: أسابيع محسومة (بصفوف أو بلا صفوف)، rows: صفوف weekKnightsLog.
function setup(today, { frozen = [], rows = [], calendar = [AUTUMN], termStart = '2026-11-15' } = {}) {
    const server = cloud();
    const season = server.docs.get(SEASON_PATH);
    season.termStart = termStart; season.termEnd = '2026-12-23'; season.calendar = copy(calendar);
    season.frozenWeeks = Object.fromEntries(frozen.map(ws => [ws, { seconds: 1, nanoseconds: 0 }]));
    season.weekKnightsLog = Object.fromEntries(rows.map(r => [r.key, r]));
    // runtime يضبط todayStr وDate (ومعها knightsToday بتوقيت الرياض) على اللحظة المعطاة.
    const h = runtime(server, today + 'T09:00:00Z');
    h.install('renderGeneralKnightsCopyPreview', 'buildWeeklyKnightsAnnouncement', 'knightsIdentityOrder');
    return { server, h };
}
const display = h => h.call('knightsDisplayWeekStart');
// تجهيز لقطة التلفاز في الذاكرة: sent تجمع كل ما يُرسل عبر postGeneralTv.
function tvStubs(h) {
    h.install('sendGeneralTvSnapshot');
    const sent = []; h.run('generalTv.enabled=true'); h.ctx.generalTvReady = () => true; h.ctx.generalTvContext = () => 'general:s1';
    h.ctx.postGeneralTv = snapshot => sent.push(copy(snapshot));
    h.run('let honorKnightsLog=[]'); h.ctx.getBoardDate = () => '2026-11-18'; h.ctx.getBoardWeekRange = () => ({ startStr: '2026-11-15', endStr: '2026-11-18' });
    h.ctx.getWorkingDatesInRange = () => []; h.ctx.getGeneralTvBoard = () => []; h.ctx.getHomePrepWeek = () => []; h.ctx.getMostImproved = () => [];
    return sent;
}
const lastWeekKnights = sent => (sent.at(-1)?.stages || []).flatMap(s => s.weekKnights || []);
const settle = async done => { for (let i = 0; i < 200 && !done(); i++) await new Promise(r => setImmediate(r)); };

test('lw ف1: أسبوع عادي 2026-12-06 — أسبوع العرض = الحرفي 11-29', async () => {
    const { h } = setup('2026-12-06', { frozen: ['2026-11-15', '2026-11-22', '2026-11-29'],
        rows: [row('2026-11-15', { knight: 'سعد', locked: true }), row('2026-11-29', { knight: 'فهد', locked: true })] });
    assert.equal(await h.call('knightsPreviousWeekStart'), '2026-11-29', 'الحرفي كما هو');
    assert.equal(await display(h), '2026-11-29');
    assert.deepEqual(copy(await h.call('getLockedWeekKnights', 'asr')).map(r => r.names), [[{ name: 'فهد', rank: 1 }]], 'لا تغيير في التلفاز');
});

test('lw ف2: يوم العودة 2026-11-29 — أسبوع العرض = 11-15 في التلفاز والمعاينة والجدول', async () => {
    const { server, h } = setup('2026-11-29', { frozen: ['2026-11-08', '2026-11-15', '2026-11-22'],
        rows: [row('2026-11-08', { knight: 'سعد' }), row('2026-11-15', { knight: 'فهد', locked: true }), row('2026-11-15', { halaqaId: 'c', knight: 'هاني' })] });
    assert.equal(await display(h), '2026-11-15');
    const tv = copy(await h.call('getLockedWeekKnights', 'asr'));
    assert.equal(tv.length, 1, 'صف حلقة أ في التلفاز');
    assert.equal(tv[0].stage, 'عمر بن الخطاب'); assert.deepEqual(tv[0].names, [{ name: 'فهد', rank: 1 }]);
    await h.call('renderGeneralKnightsCopyPreview');
    assert.ok(h.element('gkCopyPreview').textContent.includes('فهد'), 'المعاينة فيها اسم الفارس: ' + h.element('gkCopyPreview').textContent);
    assert.equal(h.element('gkCopyBtn').disabled, false, 'زر النسخ مفعّل');
    await h.call('renderWeekKnightsReview');
    assert.ok(h.element('weekKnightsReview').innerHTML.includes('15–18'), 'عنوان الجدول أسبوع 15–18: ' + h.element('weekKnightsReview').innerHTML.slice(0, 120));
    await h.call('copyWeeklyKnightsAnnouncement');
    const log = Object.values(server.season().weekKnightsLog);
    assert.ok(log.filter(r => r.weekStart === '2026-11-15').every(r => r.lockedAt), 'النسخ يقفل صفوف 11-15 كلها');
    assert.ok(log.filter(r => r.weekStart !== '2026-11-15').every(r => !r.lockedAt), 'لا قفل لغير 11-15');
    assert.ok((h.state.copies[0] || '').includes('فهد'), 'المنسوخ فيه اسم الفارس');
});

test('lw ف3: أول أسبوع 2026-11-15 بلا حسم — null والرسائل الفارغة', async () => {
    const { h } = setup('2026-11-15');
    assert.equal(await display(h), null);
    await h.call('renderGeneralKnightsCopyPreview');
    assert.equal(h.element('gkCopyPreview').textContent, 'لا سجل فرسان لهذا الأسبوع');
    assert.equal(h.element('gkCopyBtn').disabled, true, 'زر النسخ معطّل');
    await h.call('renderWeekKnightsReview');
    assert.ok(h.element('weekKnightsReview').innerHTML.includes('لم يُحسم أسبوع بعد'));
    assert.deepEqual(copy(await h.call('getLockedWeekKnights', 'asr')), []);
});

// تجسيد ف4 (البطاقة لا تحدد تواريخ): أسبوع 11-29 فيه يوم دراسي واحد (إجازة طارئة 11-30 ← 12-02) محسوم بصفوفه،
// ثم أسبوع 12-06 إجازة كاملة محسوم بلا صفوف؛ اليوم 2026-12-13.
test('lw ف4: أسبوع بيوم دراسي واحد محسوم بصفوفه ثم أسبوع إجازة كامل — يُعدّ أسبوع عرض', async () => {
    const calendar = [AUTUMN, { from: '2026-11-30', to: '2026-12-02', name: 'إجازة طارئة', kind: 'emergency' },
        { from: '2026-12-06', to: '2026-12-09', name: 'إجازة', kind: 'official' }];
    const { h } = setup('2026-12-13', { calendar, frozen: ['2026-11-15', '2026-11-22', '2026-11-29', '2026-12-06'],
        rows: [row('2026-11-15', { knight: 'سعد' }), row('2026-11-29', { knight: 'فهد' })] });
    assert.equal(await display(h), '2026-11-29');
});

test('lw ف5: صفوف محسومة لأسبوع يسبق بداية الفصل (11-08) وحدها — null', async () => {
    const { h } = setup('2026-11-22', { frozen: ['2026-11-08'], rows: [row('2026-11-08', { knight: 'فهد', locked: true })] });
    assert.equal(await display(h), null);
});

test('lw ف6: أحد أسبوع الإجازة 2026-11-22 والأسبوع 11-15 لم يُحسم — لقطة التلفاز تشغّل الحسم على الحرفي ثم أسبوع العرض = 11-15', async () => {
    const { server, h } = setup('2026-11-22');
    const sent = tvStubs(h);
    assert.equal(await h.call('knightsPreviousWeekStart'), '2026-11-15', 'الحرفي يوم 22 = 11-15');
    assert.equal(server.season().frozenWeeks['2026-11-15'], undefined, 'قبل: غير محسوم');
    await h.call('sendGeneralTvSnapshot');
    for (let i = 0; i < 50 && !server.season().frozenWeeks['2026-11-15']; i++) await new Promise(r => setImmediate(r));
    assert.ok(server.season().frozenWeeks['2026-11-15'], 'الحسم جرى على 2026-11-15');
    assert.ok(Object.values(server.season().weekKnightsLog).some(r => r.weekStart === '2026-11-15'), 'صفوف 11-15 محفوظة');
    assert.equal(await display(h), '2026-11-15');
    await settle(() => lastWeekKnights(sent).length);
    assert.ok(lastWeekKnights(sent).length, 'آخر لقطة بعد الحسم والقفل فيها شريحة فرسان الأسبوع: ' + JSON.stringify(sent.at(-1)).slice(0, 200));
});

test('lw ف9: يوم العودة 2026-11-29 بلا أي فتح في الإجازة — لقطة التلفاز تحسم 22 (بلا صفوف) ثم تقفل صفوف 15 وترسل فرسانها', async () => {
    const { server, h } = setup('2026-11-29', { frozen: ['2026-11-15'], rows: [row('2026-11-15', { knight: 'فهد' })] });
    const sent = tvStubs(h);
    assert.equal(server.season().frozenWeeks['2026-11-22'], undefined, 'قبل: 22 غير محسوم');
    assert.ok(Object.values(server.season().weekKnightsLog).every(r => !r.lockedAt), 'قبل: صفوف 15 غير مقفلة');
    await h.call('sendGeneralTvSnapshot');
    const rows15 = () => Object.values(server.season().weekKnightsLog).filter(r => r.weekStart === '2026-11-15');
    await settle(() => server.season().frozenWeeks['2026-11-22'] && rows15().every(r => r.lockedAt) && lastWeekKnights(sent).length);
    assert.ok(server.season().frozenWeeks['2026-11-22'], 'الحسم جرى على الحرفي 2026-11-22');
    assert.equal(Object.values(server.season().weekKnightsLog).filter(r => r.weekStart === '2026-11-22').length, 0, '22 بلا صفوف (إجازة كاملة)');
    assert.ok(rows15().length && rows15().every(r => r.lockedAt), 'صفوف 11-15 كلها مقفلة');
    const wk = lastWeekKnights(sent);
    assert.equal(wk.length, 1, 'شريحة حلقة أ وحدها: ' + JSON.stringify(wk));
    assert.equal(wk[0].stage, 'عمر بن الخطاب'); assert.deepEqual(wk[0].names, [{ name: 'فهد', rank: 1 }]);
});

for (const [label, frozen, rows] of [['محسوم', ['2026-11-15'], [row('2026-11-15', { knight: 'فهد', locked: true })]], ['غير محسوم', [], []]])
    test('lw ف6ب: الخميس 2026-11-19 (أسبوع 11-15 ' + label + ') — أسبوع العرض = null والحرفي 11-08', async () => {
        const { h } = setup('2026-11-19', { frozen, rows });
        assert.equal(await h.call('knightsPreviousWeekStart'), '2026-11-08', 'الحرفي كما هو');
        assert.equal(await display(h), null);
    });

test('lw ف7: اليوم 2026-12-06 و11-29 انتهى ولم يُحسم — أسبوع العرض = آخر محسوم 11-15', async () => {
    const { h } = setup('2026-12-06', { frozen: ['2026-11-15', '2026-11-22'], rows: [row('2026-11-15', { knight: 'فهد', locked: true })] });
    assert.equal(await display(h), '2026-11-15');
});
