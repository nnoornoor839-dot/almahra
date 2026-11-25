// اختبارات قبول بطاقة «ح» (نص رسائل أولياء الأمور) — 2026-11-25. تُرى حمراء قبل البناء.
// المصدر: notes/features/messages/message-text-card.md (ق1–ق4).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const { cloud, runtime } = require('./helpers/knights-r2b-harness.cjs');
const { copy, source, root } = require('./helpers/quick-entry-harness.cjs');
const SEASON_PATH = 'programs/general/seasons/s1';
const AUTUMN = { from: '2026-11-20', to: '2026-11-28', name: 'إجازة الخريف', kind: 'official' };
const addDays = (ds, n) => { const d = new Date(ds + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const MOTIVATION = 'حفظ ابنك يبدأ من البيت: اسمع له كل يوم وشجّعه، فكل حرف يحفظه في ميزان حسناتك.';
const SIGNATURE = 'برنامج الحوافز\nالشؤون التعليمية\nجمعية أفضلكم';
function row(weekStart) {
    return { key: 's1|' + weekStart + '|a', v: 1, weekStart, weekEnd: addDays(weekStart, 3), halaqaId: 'a', halaqaName: 'عمر بن الخطاب', halaqaOrder: 1,
        stageId: 'primary', period: 'asr', teacherName: 'معلم أ', n: 1,
        knights: [{ id: 1, name: 'فهد', rank: 1, weekPointsTenths: 1982 }],
        nominees: [{ id: 1, name: 'فهد', nominations: [0, 1, 2, 3].map(i => addDays(weekStart, i)), attendance: { schoolDays: 4, present: 4 }, eligible: true, reasons: [],
            weightTenths: { new: 1500, review: 300, total: 1800 }, weightMultipliers: { new: 3, review: 1 }, weekPointsTenths: 1982 }],
        rejectedApprovals: [], steps: [], frozenAt: { seconds: 1, nanoseconds: 0 }, frozenAtDevice: 1000, frozenBy: 'fake-admin' };
}
function setup({ rows = [row('2026-11-15')] } = {}) {
    const server = cloud();
    for (const [path, s] of server.docs) if (path.includes('/students/'))
        s.history = Object.fromEntries(Object.entries(s.history || {}).map(([ds, day]) => [addDays(ds, -7), { ...day, hijri: '1448-05-' + ds.slice(8) }]));
    const season = server.docs.get(SEASON_PATH);
    season.termStart = '2026-11-15'; season.termEnd = '2026-12-23'; season.calendar = [copy(AUTUMN)];
    season.frozenWeeks = Object.fromEntries(['2026-11-15', '2026-11-22'].map(ws => [ws, { seconds: 1, nanoseconds: 0 }]));
    season.weekKnightsLog = Object.fromEntries(rows.map(r => [r.key, r]));
    const h = runtime(server, '2026-11-29T09:00:00Z');
    h.install('getGeneralMessageWeek', 'renderGeneralWeeklyMessages', 'sendGeneralWeeklyMessage', 'buildWeeklyKnightsAnnouncement', 'knightsIdentityOrder',
        'getGeneralSchoolDates', 'getSchoolDayInfo', 'schoolCivilDate', 'isSeasonCalendarComplete', 'programBrandName');
    h.ctx.normalizeSaudiPhone = () => '966500000000'; h.ctx.measureReady = () => true;
    return h;
}
async function send(h, captured) {
    h.element('generalMessageWeek').value = 'previous';
    const student = h.run('students.find(s => s.id === 1)');
    // تسجيل وسائط البناء ليُبنى المرجع القديم من البيانات نفسها.
    const build = h.ctx.buildGeneralWeeklyMessage;
    h.ctx.buildGeneralWeeklyMessage = (...a) => { if (captured) captured.args = a; return build(...a); };
    h.ctx.args = [student];
    await h.run('sendGeneralWeeklyMessage(...args)');
    const href = h.ctx.window.location.href;
    assert.notEqual(href, 'unchanged', 'لم يُفتح واتساب: ' + JSON.stringify(h.state.messages));
    return decodeURIComponent(href.replace(/^[^?]*\?text=/, ''));
}
function oldMessage(h, args) {
    const old = cp.execFileSync('git', ['show', '0cde344:index.html'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }).replaceAll('\r\n', '\n');
    require('node:vm').runInContext(source('buildGeneralWeeklyMessage', old).replace('function buildGeneralWeeklyMessage(', 'function oldWeeklyMessage('), h.ctx);
    h.ctx.oldArgs = [args[0], args[1], { ...args[2], brandName: 'البرنامج العام' }];
    return h.run('oldWeeklyMessage(...oldArgs)');
}

test('ق1: رسالة أسبوع 15 لسالم تساوي المرجع القديم المعدّل حرفاً بحرف', async () => {
    const h = setup(), cap = {};
    const actual = await send(h, cap);
    const old = oldMessage(h, cap.args);
    assert.match(old, /الأسبوع: 2026-11-15 إلى 2026-11-21 \(هجري: [^)]*\)\n/, 'المرجع القديم فيه الهجري');
    assert.ok(old.includes('🏆 فارس حلقته للأسبوع') && old.endsWith('\n\nالبرنامج العام'), 'المرجع فيه الفرسان والتوقيع القديم');
    const expected = old.replace(/(الأسبوع: 2026-11-15 إلى 2026-11-21) \(هجري: [^)]*\)\n/, '$1\n')
        .replace(/البرنامج العام$/, MOTIVATION + '\n\n' + SIGNATURE);
    assert.equal(actual, expected);
});

test('ق2: طالب بلا فرسان: السطر التحفيزي بعد سطر النقاط بسطر فارغ ثم التوقيع', async () => {
    const h = setup({ rows: [] });
    const msg = await send(h);
    assert.ok(!msg.includes('🏆') && !msg.includes('🏅'), 'لا فرسان:\n' + msg);
    assert.match(msg, /نقاط هذا الأسبوع: [^\n]*\n\n/, 'سطر النقاط');
    const afterPoints = msg.slice(msg.indexOf('نقاط هذا الأسبوع'));
    assert.equal(afterPoints.slice(afterPoints.indexOf('\n') + 1), '\n' + MOTIVATION + '\n\n' + SIGNATURE);
    assert.ok(!msg.includes('(هجري:'));
});

function absenceHarness() {
    const h = setup();
    h.install('copyAbsenteesList', 'copyFollowupList', 'programBrandName');
    h.run("globalThis.hijriDateStr = 'تاريخ'");
    h.ctx.isGeneralProgram = () => true;
    h.ctx.getTodayAbsentees = () => [{ name: 'فهد' }];
    h.ctx.getFollowupAbsentees = () => [{ student: { name: 'فهد' }, streak: 2 }];
    h.ctx.getSchoolDayInfo = () => ({ isSchoolDay: true });
    h.ctx.showToast = () => {};
    h.ctx.document = { createElement: () => ({ style: {}, focus() {}, select() {} }), body: { appendChild() {}, removeChild() {} } };
    h.ctx.window.isSecureContext = true;
    return h;
}
const sentText = h => decodeURIComponent(h.ctx.window.location.href.replace(/^[^?]*\?text=/, ''));
test('ق3: عنوانا إشعار الغياب وتنبيه الانقطاع باسم برنامج الحوافز', () => {
    const h = absenceHarness();
    h.run('copyAbsenteesList()');
    assert.ok(h.ctx.window.location.href.startsWith('whatsapp://send?text='), 'فُتح واتساب');
    assert.ok(sentText(h).startsWith('📋 *إشعار غياب - برنامج الحوافز*\n'), sentText(h).split('\n')[0]);
    h.ctx.window.location.href = 'unchanged';
    h.run('copyFollowupList()');
    assert.ok(sentText(h).startsWith('📋 *تنبيه انقطاع متكرر - برنامج الحوافز*\n'), sentText(h).split('\n')[0]);
});

test('ق4: programBrandName() ما زالت تعيد «البرنامج العام» في البرنامج العام', () => {
    const h = setup();
    assert.equal(h.run('programBrandName()'), 'البرنامج العام');
});
