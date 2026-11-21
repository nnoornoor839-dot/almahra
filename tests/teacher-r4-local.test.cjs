// بطاقة الجولة 4 «دفعة ما بعد تجربة المالك» — اختبار القبول الأحمر م1–م32 (عدا م11/م16: سكربت الأرقام)، 2026-11-19، كاتب اختبار أ26.
// المرجع: D:\المهره\notes\features\accounts\teacher-r4-card.md (§1 ل0–ل18، §3 أمثلة القبول) والجرد fast-track-prompts/teacher-r4-inventory-out.md.
// الأرقام: tests/helpers/r4-numbers.cjs (مصدر مستقل لا يقرأ index.html) — كل رقم في م1/م2/م7/م12/م13 هنا يُقرأ منه لا يُكتب باليد.
// الطريقة: Playwright فوق tests/helpers/teacher-ui-harness.cjs (index.html + auth.js + data-store.js + programs-store.js الحقيقية + فايربيس وهمي)،
// على 390×844 للمعلم و1280×900 للمشرف، وtv.html كما في tv-design-local (ساعة Playwright).
//
// افتراضات الاختبار فيما لم تسمّه البطاقة (تُذكر في التقرير لتُلزم الباني):
//   • سطر «دون الحد» عنصر ظاهر داخل #generalQuickSection نصّه (بعد حذف محارف الاتجاه وضمّ الفراغات) يبدأ بـ«التحضير المنزلي: دون الحد اليومي»
//     ويليه «(ما ينقص)»؛ المرجع للموضع: #quickDisciplineHome عند المعلم و#generalHomePrepBtn عند المشرف (يقع تحته خلال 40px).
//     الصيغ: «(الجديد 8 أسطر)»، «(الجديد 15 سطراً)»، «(المراجعة وجه)»، «(المراجعة وجهان)» (لا حالة هنا ينقص فيها الاثنان).
//   • «لم يُسجَّل» عند المشرف = قرّاء اليوم كلهم (getAttendanceState، getCumulativeStats، getGeneralTvBoard، generalHalaqaTodayCounts،
//     calculateStudentAttendance، knightsAttendanceState، knightsDayPointsTenths) تعطي ما تعطيه لطالب بلا سجل اليوم.
//   • مؤشر التلفاز: نص «التلفاز موصول»/«غير موصول» ضمن textContent أبي #generalTvButton، وضمن #generalSettingsTv أو أخيه التالي.
//   • سطر انتظار التلفاز: عنصر نصّه «في انتظار صفحة المشرف في المتصفح نفسه» حجمه 28px.
//   • ل17: الإبطال يُحاكى بتغيير مستند teacherKeys مباشرة في ذاكرة الفايربيس الوهمي بلا إطلاق المستمعين (المستمعون الحقيقيون لا يُعاد تقييمهم، ق153)؛
//     وانقطاع الشبكة = getDocFromServer يرمي unavailable (الفايربيس الوهمي لا يطلب شبكة فـroute abort لا يصله).
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const H = require('./helpers/teacher-ui-harness.cjs');
const N = require('./helpers/r4-numbers.cjs').compute();
const A = N.teacher.after;   // أرقام ما بعد الإصلاح من المصدر المستقل

const TODAY = H.TODAY;
const S = id => 'programs/general/seasons/s1/students/' + id;
const C = { ink: 'rgb(19, 35, 26)', ink3: 'rgb(91, 107, 98)', green700: 'rgb(18, 92, 47)', white: 'rgb(255, 255, 255)', red700: 'rgb(180, 35, 24)',
    amber800: 'rgb(138, 83, 0)', amber50: 'rgb(255, 244, 220)', border: 'rgb(215, 224, 218)' };
const BELOW = 'التحضير المنزلي: دون الحد اليومي';
const PREP_REJECT = 'التحضير المنزلي يحتاج تسميعاً بتقدير جيد فأعلى في كل أقسام اليوم';
const REVOKED_MSG = 'الرمز غير صحيح أو أُبطل؛ اطلب الرابط من المشرف';
let browser;
before(async () => {
    const playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); });

// ===== أدوات (على نمط teacher-r1-logic-local وteacher-r3-home-local) =====
const norm = s => String(s || '').replace(/[\u2066-\u2069\u200e\u200f\u061c]/g, '').replace(/\s+/g, ' ').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function diagnose(h) {
    const st = await h.page.evaluate(() => ({ toast: document.getElementById('toastText')?.innerText || '', tt: document.getElementById('teacherToast')?.innerText || '',
        role: window.almahraAuth?.currentRole || null })).catch(e => ({ evalError: e.message }));
    const log = await h.fbLog().catch(() => []);
    return `الحال=${JSON.stringify(st)} أخطاء الصفحة=${JSON.stringify(h.errors.slice(0, 3))} آخر عمليات السحابة=${log.slice(-5).map(l => l.op + ':' + (l.path || (l.writes || []).map(w => w.type + ' ' + w.path).join(',')) + (l.result ? '=' + l.result : '')).join(' | ')}`;
}
function list(mods = {}, extra = {}) {
    const l = H.students();
    for (const [id, m] of Object.entries(mods)) Object.assign(l[id], m);
    return { ...l, ...extra };
}
async function teacherPage(seed = {}, opts = {}) {
    let h;
    try { h = await H.openPage(browser, { user: H.TEACHER_USER, seed: { teacherUser: true, ...seed }, ...opts }); }
    catch (_) { h = await H.openPage(browser, { user: H.TEACHER_USER, seed: { teacherUser: true, ...seed }, ...opts }); }
    await h.page.locator('#teacherHome').waitFor({ state: 'attached', timeout: 8000 }).catch(async () => assert.fail('صفحة المعلم لم تُفتح. ' + await diagnose(h)));
    await h.page.waitForTimeout(200);
    return h;
}
async function adminPage(seed = {}, size = { width: 1280, height: 900 }) {
    const h = await H.openPage(browser, { user: H.ADMIN_USER, seed, ...size });
    await h.page.waitForFunction(() => window.almahraPrograms?.getCurrentProgramId?.() === 'general' && window.almahraData?.isReady?.(), null, { timeout: 15000 });
    await h.page.locator('#loadingOverlay').waitFor({ state: 'hidden' }).catch(() => {});
    return h;
}
async function loginPage(opts = {}) {
    const h = await H.openPage(browser, opts);
    await h.page.locator('#loginOverlay').waitFor({ state: 'visible' });
    await h.page.waitForTimeout(150);
    return h;
}
const isTeacher = page => page.evaluate(() => document.body.classList.contains('teacher-mode'));
const modalOpen = page => page.evaluate(() => document.getElementById('smartModal').classList.contains('flex'));
async function closeQuick(h) {
    if (!await modalOpen(h.page)) return;
    await h.page.evaluate(() => closeSmartModal(true));
    await h.page.waitForFunction(() => !document.getElementById('smartModal')?.classList.contains('flex'), null, { timeout: 3000 });
}
async function selectHalaqa(h, id) {
    const tab = h.page.locator(`#teacherHalaqaTabs button[data-halaqa="${id}"]`);
    if (await tab.count() && await tab.getAttribute('aria-pressed') !== 'true') { await tab.click(); await h.page.waitForTimeout(150); }
}
async function openQuick(h, id) {
    await closeQuick(h);
    await H.openAch(h, id).catch(async e => assert.fail(`${e.message}. ${await diagnose(h)}`));
}
async function setField(page, id, value) {
    const ok = await page.evaluate(([id, value]) => {
        const el = document.getElementById(id); if (!el) return false;
        el.value = String(value); ['input', 'change'].forEach(t => el.dispatchEvent(new Event(t, { bubbles: true }))); return true;
    }, [id, value]);
    assert.ok(ok, `الحقل #${id} غير موجود`);
}
async function grade(page, kind, name) {
    const b = page.locator(`#quick_${kind}_grades button`).filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }).first();
    assert.ok(await b.count(), `زر التقدير «${name}» غير موجود في #quick_${kind}_grades`);
    await b.click();
}
async function newTo(page, toSurah, toAyah, g = 'ممتاز') {
    await H.openSec(page, 'new');
    await setField(page, 'quick_new_toSurah', toSurah); await setField(page, 'quick_new_toAyah', toAyah); await grade(page, 'new', g);
    await H.confirmSec(page, 'new');
}
async function review(page, from, to, g = 'جيد') {
    await H.openSec(page, 'review');
    for (const [id, v] of [['quick_review_fromSurah', from[0]], ['quick_review_fromAyah', from[1]], ['quick_review_toSurah', to[0]], ['quick_review_toAyah', to[1]]]) await setField(page, id, v);
    await grade(page, 'review', g);
    await H.confirmSec(page, 'review');
}
async function openExceptions(page) {
    await H.openSec(page, 'behavior');
    if (await page.evaluate(() => document.getElementById('generalCriteriaHost')?.hidden !== false)) await page.locator('#generalCriteriaExceptions').click();
}
async function boxState(page, cid) {
    return page.evaluate(cid => { const b = document.querySelector(`#generalCriteriaHost .crit-box[data-cid="${cid}"]`); return b ? { checked: b.checked, disabled: b.disabled } : null; }, cid);
}
async function setBox(page, cid, on) {
    await openExceptions(page);
    const s = await boxState(page, cid);
    assert.ok(s, `خانة المعيار ${cid} غير موجودة`);
    if (s.checked !== on) await page.locator(`#generalCriteriaHost .crit-box[data-cid="${cid}"]`).click();
}
// «التحضير المنزلي»: المعلم من الاختصار #quickDisciplineHome (داخل قسم السلوك)، والمشرف من زر 🏠 #generalHomePrepBtn.
async function setPrep(page, on = true) {
    const teacher = await isTeacher(page);
    if (teacher) await H.openSec(page, 'behavior');
    const sel = teacher ? '#quickDisciplineHome' : '#generalHomePrepBtn';
    const b = page.locator(sel);
    assert.ok(await b.count(), `زر «التحضير المنزلي» ${sel} غير موجود`);
    if ((await b.getAttribute('aria-pressed')) !== String(on)) await b.click();
    assert.equal(await b.getAttribute('aria-pressed'), String(on), `${sel} لم يصر aria-pressed=${on}`);
}
async function fulfill(page) {
    const teacher = await isTeacher(page);
    if (teacher) await H.openSec(page, 'behavior');
    await page.locator(teacher ? '#quickDisciplineAll' : '#generalCriteriaAllBtn').click();
}
// حال «التحضير المنزلي» في النافذة: الضغط، والسطر «دون الحد» (نصّه وشكله وموضعه)، وخطأ التقدير المانع.
function prepState(page) {
    return page.evaluate(B => {
        const strip = s => String(s || '').replace(/[\u2066-\u2069\u200e\u200f\u061c]/g, '').replace(/\s+/g, ' ').trim();
        if (typeof updateGeneralQuickPreview === 'function') updateGeneralQuickPreview();
        const teacher = document.body.classList.contains('teacher-mode');
        const btn = document.getElementById(teacher ? 'quickDisciplineHome' : 'generalHomePrepBtn');
        const lines = [...document.querySelectorAll('#generalQuickSection *')].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden'
            && strip(e.innerText).startsWith(B) && ![...e.children].some(c => strip(c.innerText).startsWith(B)));
        const l = lines[0];
        let line = null;
        if (l) {
            const cs = getComputedStyle(l), r = l.getBoundingClientRect(), b = btn?.getBoundingClientRect();
            line = { text: strip(l.innerText), size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight), color: cs.color,
                underButton: !!b && b.height > 0 && r.top >= b.bottom - 1 && r.top - b.bottom <= 40 };
        }
        const home = document.getElementById('generalHomePrepBtn');
        return { pressed: btn?.getAttribute('aria-pressed') ?? null, below: line ? line.text : null, line, count: lines.length,
            gradeError: home?.getAttribute('aria-invalid') === 'true' };
    }, BELOW);
}
const total = page => page.evaluate(() => { updateGeneralQuickPreview(); return document.getElementById('generalQuickTotal').innerText.trim(); });
const entriesPoints = day => Math.round(Object.values(day.entries || {}).reduce((s, e) => s + (Number(e.points) || 0), 0) * 10) / 10;
const dayOf = async (h, id) => (await h.doc(S(id)))?.history?.[TODAY];
// الحفظ: زر الحفظ، وتأكيد «احفظ … فقط» أو تذكير المشرف إن ظهر، حتى يتغيّر يوم اليوم.
async function save(h, id, { expectWrite = true } = {}) {
    const before = JSON.stringify(await dayOf(h, id) || {});
    await H.confirmBehavior(h.page);
    await h.page.evaluate(() => typeof updateGeneralQuickPreview === 'function' && updateGeneralQuickPreview());
    // عند المعلم يُعطَّل «حفظ» مع خطأ مانع (شرط التقدير مثلاً): لا كتابة.
    if (await h.page.locator('#generalQuickSaveBtn').isDisabled()) {
        if (!expectWrite) return null;
        assert.fail(`«حفظ» معطّل للطالب ${id} (خطأ مانع). ${await diagnose(h)}`);
    }
    await h.page.locator('#generalQuickSaveBtn').click();
    for (let i = 0; i < (expectWrite ? 30 : 8); i++) {
        await sleep(150);
        if (JSON.stringify(await dayOf(h, id) || {}) !== before) { await sleep(300); return dayOf(h, id); }
        const only = h.page.locator('.tch-sheet button').filter({ hasText: /^\s*احفظ (الجديد|المراجعة) فقط\s*$/ }).filter({ visible: true });
        if (await only.count()) { await only.first().click(); continue; }
        if (await h.page.evaluate(() => !document.getElementById('generalQuickReviewReminder')?.hidden)) {
            await h.page.evaluate(() => typeof updateGeneralQuickPreview === 'function' && updateGeneralQuickPreview());
            await h.page.locator('#generalQuickSaveBtn').click();
        }
    }
    if (!expectWrite) return null;
    assert.fail(`الحفظ للطالب ${id} لم يكتب. ${await diagnose(h)}`);
}
// الساعة ثابتة في الهاركنس؛ التسجيل التالي بعد دقيقة كما في الواقع، فيكون هو «الأخير» عند التراجع.
const laterClock = page => page.evaluate(() => { const t = Date.now() + 60000; Date.now = () => t; });
// ب14 (ق205): كان التراجع من #teacherToast إن ظهر؛ صار دائماً من #quickTodayBox بعد فتح النافذة.
async function teacherUndo(h, id) {
    const count = async () => Object.keys((await dayOf(h, id))?.entries || {}).length;
    const before = await count();
    await openQuick(h, id); await h.page.locator('#quickTodayBox button').filter({ hasText: 'تراجع' }).first().click();
    for (let i = 0; i < 30; i++) { await sleep(150); if (await count() < before) { await sleep(300); return (await dayOf(h, id)) ?? null; } }
    assert.fail(`التراجع للطالب ${id} لم يحذف تسجيلاً. ${await diagnose(h)}`);
}
// قرّاء اليوم عند المشرف لطالب واحد (كل ما يبني عليه «لم يُسجَّل»، النقاط، اللوحة، «سمّع n من m»، الحضور، الفرسان والنجم الصاعد).
function readers(page, id, halaqaId) {
    return page.evaluate(([id, halaqaId]) => {
        const s = students.find(x => x.id === id);
        const st = getAttendanceState(s, todayStr), att = calculateStudentAttendance(s, [todayStr]);
        const row = getGeneralTvBoard(getGeneralTvPeriod(s)).find(e => e.student.id === id);
        return { state: st.state, hasEntries: !!st.hasEntries, total: getCumulativeStats(s).tripPoints, board: row ? { points: row.points, rank: row.rank } : null,
            counts: generalHalaqaTodayCounts(students, halaqaId, todayStr, getProgramSettings()),
            attendance: { actualDays: att.actualDays, unrecorded: att.unrecorded, attendancePct: att.attendancePct },
            knights: { state: knightsAttendanceState(s, todayStr), tenths: knightsDayPointsTenths(s.history?.[todayStr]) } };
    }, [id, halaqaId]);
}
async function adminReaders(listOverride, id, halaqaId) {
    const a = await adminPage({ list: listOverride });
    try { return await readers(a.page, id, halaqaId); } finally { await a.close(); }
}
const withDoc = (id, doc) => { const l = H.students(); l[id] = doc; return l; };
function box(page, selector) {
    return page.evaluate(sel => {
        const e = document.querySelector(sel); if (!e) return null;
        const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, visible: e.getClientRects().length > 0 && cs.visibility !== 'hidden',
            color: cs.color, bg: cs.backgroundColor, size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight), borderColor: cs.borderTopColor,
            radius: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(parseFloat), text: (e.innerText || '').replace(/\s+/g, ' ').trim() };
    }, selector);
}

// =====================================================================================
// ل0 — الحد اليومي ينتقل من «الحضور المبكر» إلى «التحضير المنزلي» (طالب ابتدائي أحمد في a1، الحد 8 أسطر جديد + وجه مراجعة)
// المقادير (QuranMeasure، من r4-numbers): البقرة 25–27 = 10.83 سطراً، 26 = 4.375، 25 = 3.875، 25–29 = 15؛ المراجعة 17–24 = 15، 17–20 = 7.375؛
// المتوسط: 77–83 = 15 (14.999999999999998)، مراجعة 6–24 = 30.
// =====================================================================================
const AT = ayah => list({ 1: { lastSurah: 2, lastAyah: ayah } });

test('م1 (ل0، المعلم؛ حارس أخضر الآن) جديد 10.83 سطراً «ممتاز» + مراجعة وجه «جيد» + «التحضير المنزلي» ← يُحتسب بنقاطه الكاملة (homeprep = 10)، بلا سطر «دون الحد»، والحفظ يمرّ', async () => {
    const h = await teacherPage({ list: AT(24) });
    try {
        await openQuick(h, 1);
        await newTo(h.page, 2, 27); await review(h.page, [2, 17], [2, 24]); await setPrep(h.page, true);
        const st = await prepState(h.page);
        const day = await save(h, 1, { expectWrite: false });
        const got = { السطر: st.below, خطأ_التقدير: st.gradeError, المحفوظ: day ? { criteria: day.criteria, criteriaPoints: day.criteriaPoints, entriesPoints: entriesPoints(day) } : 'لم يُحفظ' };
        assert.deepEqual(got, { السطر: null, خطأ_التقدير: false, المحفوظ: { criteria: A.m1.criteria, criteriaPoints: 10, entriesPoints: A.m1.entriesPoints } },
            `م1 [سطر «دون الحد»، خطأ التقدير، المحفوظ] — المتوقع من r4-numbers (اليوم ${A.m1.dayTotal}): ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

test('م2 (ل0، المعلم) جديد 4.375 سطراً «ممتاز» + مراجعة وجه «جيد» + «التحضير المنزلي» ← الحفظ يمرّ، homeprep = 0 في المحفوظ، السطر «التحضير المنزلي: دون الحد اليومي (الجديد 8 أسطر)»، ولا رسالة حمراء', async () => {
    const h = await teacherPage({ list: AT(25) });
    try {
        await openQuick(h, 1);
        await newTo(h.page, 2, 26); await review(h.page, [2, 17], [2, 24]); await setPrep(h.page, true);
        const st = await prepState(h.page);
        const shown = await total(h.page);
        const day = await save(h, 1, { expectWrite: false });
        const got = { الزر: st.pressed, السطر: st.below, خطأ_التقدير: st.gradeError, المجموع_المعروض: shown,
            المحفوظ: day ? { criteria: day.criteria, criteriaPoints: day.criteriaPoints, entriesPoints: entriesPoints(day) } : 'لم يُحفظ' };
        assert.deepEqual(got, { الزر: 'true', السطر: BELOW + ' (الجديد 8 أسطر)', خطأ_التقدير: false, المجموع_المعروض: String(A.m2.entriesPoints),
            المحفوظ: { criteria: A.m2.criteria, criteriaPoints: 0, entriesPoints: A.m2.entriesPoints } },
            `م2 [الزر معلَّم، السطر، خطأ التقدير، المجموع، المحفوظ]: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

test('م3 (ل0، المعلم) جديد 10.83 سطراً + مراجعة 7.375 سطراً (دون الوجه) + «التحضير المنزلي» ← homeprep = 0 والسطر «(المراجعة وجه)»', async () => {
    const h = await teacherPage({ list: AT(24) });
    try {
        await openQuick(h, 1);
        await newTo(h.page, 2, 27); await review(h.page, [2, 17], [2, 20]); await setPrep(h.page, true);
        const st = await prepState(h.page);
        const day = await save(h, 1, { expectWrite: false });
        const got = { السطر: st.below, المحفوظ: day ? { criteria: day.criteria, criteriaPoints: day.criteriaPoints } : 'لم يُحفظ' };
        assert.deepEqual(got, { السطر: BELOW + ' (المراجعة وجه)', المحفوظ: { criteria: A.m3.criteria, criteriaPoints: 0 } }, `م3: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

test('م3-ب (ل0 (ج)، ق158 س8، المعلم) ينقص الاثنان: جديد 3.875 سطراً + مراجعة 7.375 سطراً + «التحضير المنزلي» ← homeprep = 0 والسطر «(الجديد 8 أسطر · المراجعة وجه)»', async () => {
    const h = await teacherPage({ list: AT(24) });
    try {
        await openQuick(h, 1);
        await newTo(h.page, 2, 25); await review(h.page, [2, 17], [2, 20]); await setPrep(h.page, true);
        const st = await prepState(h.page);
        const day = await save(h, 1, { expectWrite: false });
        const got = { السطر: st.below, المحفوظ: day ? { criteria: day.criteria, criteriaPoints: day.criteriaPoints } : 'لم يُحفظ' };
        assert.deepEqual(got, { السطر: BELOW + ' (الجديد 8 أسطر · المراجعة وجه)', المحفوظ: { criteria: { homeprep: 0 }, criteriaPoints: 0 } }, `م3-ب: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

test('م4 (ل0، ق145 «الاثنان معاً»، المعلم) جديد 10.83 سطراً «يُعاد» + مراجعة وجه «جيد» + «التحضير المنزلي» ← «يُعاد» لا يُحسب: السطر «(الجديد 8 أسطر)»، وشرط التقدير يمنع الحفظ برسالته الحمراء القائمة', async () => {
    const h = await teacherPage({ list: AT(24) });
    try {
        await openQuick(h, 1);
        await newTo(h.page, 2, 27, 'يُعاد'); await review(h.page, [2, 17], [2, 24]); await setPrep(h.page, true);
        // عند المعلم يُعطَّل «حفظ» مع الخطأ المانع؛ عند غير المعطَّل يُضغط ولا يُكتب شيء.
        const line = (await prepState(h.page)).below;   // أ27-ب (ق173 (3)، ق174): السطر يُقرأ قبل «تأكيد» السلوك لأن التأكيد يطوي القسم فيخفى السطر (كما م2)؛ خطأ التقدير بعده
        await H.confirmBehavior(h.page); await h.page.evaluate(() => updateGeneralQuickPreview());
        const st = await prepState(h.page);
        const disabled = await h.page.locator('#generalQuickSaveBtn').isDisabled();
        const day = disabled ? null : await save(h, 1, { expectWrite: false });
        await sleep(300);
        const msg = await h.page.evaluate(m => [document.getElementById('smartModal')?.innerText || '', document.getElementById('toastText')?.innerText || ''].some(t => t.includes(m)), PREP_REJECT);
        const got = { السطر: line, المنع: day === null, الرسالة_الحمراء: msg, خطأ_التقدير: st.gradeError };
        assert.deepEqual(got, { السطر: BELOW + ' (الجديد 8 أسطر)', المنع: true, الرسالة_الحمراء: true, خطأ_التقدير: true },
            `م4 [السطر، الحفظ ممنوع، رسالة «${PREP_REJECT}» ظاهرة، aria-invalid على زر التحضير]: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

test('م5 (ل0، المعلم) «متوقف عن الجديد» + مراجعة وجه «جيد» + «التحضير المنزلي» ← يُحتسب (معفى من الجديد)؛ ومراجعة 7.375 سطراً ← السطر «(المراجعة وجه)» وhomeprep = 0', async () => {
    const paused = list({ 1: { lastSurah: 2, lastAyah: 24, newPaused: [{ reason: 'exam', from: '2026-11-18', to: null }] } });
    const got = {};
    for (const [label, to] of [['وجه', 24], ['نصف', 20]]) {
        const h = await teacherPage({ list: paused });
        try {
            await openQuick(h, 1);
            await review(h.page, [2, 17], [2, to]); await setPrep(h.page, true);
            const st = await prepState(h.page);
            const day = await save(h, 1, { expectWrite: false });
            got[label] = { السطر: st.below, homeprep: day ? day.criteria?.homeprep ?? 'غائب' : 'لم يُحفظ' };
        } finally { await h.close(); }
    }
    assert.deepEqual(got, { وجه: { السطر: null, homeprep: 10 }, نصف: { السطر: BELOW + ' (المراجعة وجه)', homeprep: 0 } }, `م5 [مراجعة وجه، نصف وجه]: ${JSON.stringify(got)}`);
});

test('م6 (ل0، المعلم) طالب متوسط (عمر، حلقة ابن مسعود): جديد 15 سطراً + مراجعة وجهان ← يُحتسب؛ ومراجعة وجه واحد ← السطر «(المراجعة وجهان)» وhomeprep = 0', async () => {
    const omar = list({ 6: { lastSurah: 2, lastAyah: 76 } });
    const got = {};
    for (const [label, from] of [['وجهان', 6], ['وجه', 17]]) {
        const h = await teacherPage({ list: omar });
        try {
            await selectHalaqa(h, 'm1');
            await openQuick(h, 6);
            await newTo(h.page, 2, 83); await review(h.page, [2, from], [2, 24]); await setPrep(h.page, true);
            const st = await prepState(h.page);
            const day = await save(h, 6, { expectWrite: false });
            got[label] = { السطر: st.below, homeprep: day ? day.criteria?.homeprep ?? 'غائب' : 'لم يُحفظ' };
        } finally { await h.close(); }
    }
    assert.deepEqual(got, { وجهان: { السطر: null, homeprep: 10 }, وجه: { السطر: BELOW + ' (المراجعة وجهان)', homeprep: 0 } }, `م6: ${JSON.stringify(got)}`);
});

test('م7 (ل0 (ب)/(و)، المعلم) تسجيلان: الأول 3.875 سطراً + مراجعة وجه (homeprep = 0)، الثاني 4.375 سطراً ← المجموع 8.25 فيصير homeprep محتسباً تلقائياً في المحفوظ؛ والتراجع عن الثاني يعيده 0 تلقائياً', async () => {
    const h = await teacherPage({ list: AT(24) });
    const got = {};
    try {
        await openQuick(h, 1);
        await newTo(h.page, 2, 25); await review(h.page, [2, 17], [2, 24]); await setPrep(h.page, true);
        const d1 = await save(h, 1);
        got.الأول = { criteria: d1.criteria, criteriaPoints: d1.criteriaPoints, entriesPoints: entriesPoints(d1) };
        await closeQuick(h); await laterClock(h.page);
        await openQuick(h, 1);
        await newTo(h.page, 2, 26);
        const d2 = await save(h, 1);
        got.الثاني = { criteria: d2.criteria, criteriaPoints: d2.criteriaPoints, entriesPoints: entriesPoints(d2) };
        await closeQuick(h);
        const d3 = await teacherUndo(h, 1);
        got.بعد_التراجع = { criteria: d3?.criteria, criteriaPoints: d3?.criteriaPoints };
    } finally { await h.close(); }
    assert.deepEqual(got, {
        الأول: { criteria: A.m7.save1.criteria, criteriaPoints: 0, entriesPoints: A.m7.save1.entriesPoints },
        الثاني: { criteria: A.m7.save2.criteria, criteriaPoints: 10, entriesPoints: A.m7.save2.entriesPoints },
        بعد_التراجع: { criteria: A.m7.undo2.criteria, criteriaPoints: 0 } }, `م7 (المتوقع من r4-numbers): ${JSON.stringify(got)}`);
});

async function earlyRow(page) {
    await openExceptions(page);
    return page.evaluate(() => {
        const b = document.querySelector('#generalCriteriaHost .crit-box[data-cid="early"]');
        if (!b) return null;
        const scope = b.closest('label') || b.parentElement;
        return { checked: b.checked, disabled: b.disabled, below: [scope, scope?.parentElement].filter(Boolean).some(el => (el.innerText || '').includes('دون الحد اليومي')) };
    });
}
test('م8-أ (ل0 (هـ)، المعلم) «الحضور المبكر» معلَّم مع جديد آية واحدة (3.875 سطراً) بلا مراجعة ← يُحتسب 5 كاملة، ولا «دون الحد اليومي» في صفه', async () => {
    const h = await teacherPage({ list: AT(24) });
    try {
        await openQuick(h, 1);
        await newTo(h.page, 2, 25); await setBox(h.page, 'early', true);
        const row = await earlyRow(h.page);
        const day = await save(h, 1);
        const got = { الصف: row, المحفوظ: { early: day.criteria?.early, criteriaPoints: day.criteriaPoints } };
        assert.deepEqual(got, { الصف: { checked: true, disabled: false, below: false }, المحفوظ: { early: 5, criteriaPoints: 5 } }, `م8-أ: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});
test('م8-ب (ق82، حارس أخضر الآن) «تأخر» يحجب «الحضور المبكر» ويبقى محجوباً بعد زوال الشرط: معلَّم ثم «تأخر» ← غير معلَّم معطّل، والمحفوظ بلا early', async () => {
    const h = await teacherPage({ list: AT(24) });
    try {
        await openQuick(h, 1);
        await newTo(h.page, 2, 25); await setBox(h.page, 'early', true); await setBox(h.page, 'late', true);
        const st = await boxState(h.page, 'early');
        const day = await save(h, 1);
        assert.deepEqual({ الصف: st, المحفوظ: day.criteria }, { الصف: { checked: false, disabled: true }, المحفوظ: { late: -5 } }, 'م8-ب [صف «الحضور المبكر»، المحفوظ]');
    } finally { await h.close(); }
});

// جدول الإعدادات (على نمط ر6-9): صندوق تحت عنوان نصّه المعطى، وصف كل مرحلة بخانتين رقميتين.
function limitsTable(page, title) {
    return page.evaluate(title => {
        const t = [...document.querySelectorAll('#page-settings *')].find(e => e.children.length === 0 && (e.textContent || '').includes(title));
        if (!t) return null;
        let box = t.parentElement;
        while (box && box.querySelectorAll('input[type=number]').length < 2) box = box.parentElement;
        const rowOf = name => { const label = [...box.querySelectorAll('*')].find(e => e.children.length === 0 && (e.textContent || '').trim() === name); let r = label?.parentElement; while (r && r.querySelectorAll('input[type=number]').length < 2) r = r.parentElement; return r ? [...r.querySelectorAll('input[type=number]')].slice(0, 2) : null; };
        window.__r4Rows = { ابتدائي: rowOf('ابتدائي'), متوسط: rowOf('متوسط'), ثانوي: rowOf('ثانوي') };
        return Object.fromEntries(Object.entries(window.__r4Rows).map(([k, v]) => [k, v ? v.map(i => i.value) : null]));
    }, title);
}
test('م9 (ل0 (ز)، المشرف) الإعدادات: جدول «الحد اليومي للتحضير المنزلي» بالافتراضي 8/1، 15/2، وفارغ للثانوي؛ تغيير الابتدائي إلى 4 أسطر وحفظه يُكتب في stage.homePrepMin (لا earlyMin) ويُطبَّق على م2 (4.375 سطراً ← يُحتسب)', async () => {
    const h = await adminPage({ list: AT(25) });
    try {
        await h.page.evaluate(() => { switchTab('page-settings', document.querySelector('.nav-btn')); });
        await sleep(300);
        const table = await limitsTable(h.page, 'الحد اليومي للتحضير المنزلي');
        const old = await limitsTable(h.page, 'الحد اليومي للحضور المبكر');
        assert.deepEqual({ الجدول: table, العنوان_القديم: old === null ? 'غائب' : 'باقٍ' }, { الجدول: { ابتدائي: ['8', '1'], متوسط: ['15', '2'], ثانوي: ['', ''] }, العنوان_القديم: 'غائب' },
            'جدول «الحد اليومي للتحضير المنزلي» بالافتراضي، والعنوان «الحد اليومي للحضور المبكر» زائل');
        await h.page.evaluate(() => { const i = window.__r4Rows.ابتدائي[0]; i.value = '4'; ['input', 'change'].forEach(t => i.dispatchEvent(new Event(t, { bubbles: true }))); });
        const before = JSON.stringify((await h.doc('programs/general')).settings.stages);
        await h.page.evaluate(() => saveProgramSettings());
        for (let i = 0; i < 30 && JSON.stringify((await h.doc('programs/general')).settings.stages) === before; i++) await sleep(150);
        const stages = (await h.doc('programs/general')).settings.stages;
        const primary = stages.find(s => s.id === 'primary');
        assert.deepEqual({ homePrepMin: primary.homePrepMin ?? 'غائب', earlyMin: stages.some(s => Object.hasOwn(s, 'earlyMin')) },
            { homePrepMin: { newLines: 4, reviewPages: 1 }, earlyMin: false }, `المحفوظ في المراحل: ${JSON.stringify(stages)}`);
        await h.page.evaluate(() => switchTab('page-home', document.querySelector('.nav-btn')));
        await openQuick(h, 1);
        await newTo(h.page, 2, 26); await review(h.page, [2, 17], [2, 24]); await setPrep(h.page, true);
        const day = await save(h, 1);
        assert.equal(day.criteria?.homeprep, A.m9.limit4Met ? 10 : 0, 'م2 بالحد الجديد 4 أسطر');
    } finally { await h.close(); }
});

test('م10 (ل0 (ج)/(ح)، الشكل) السطر 13/700 --amber-800 تحت زر «التحضير المنزلي» في الاختصار (المعلم) وتحت 🏠 في صفّه (المشرف)؛ وفاصل 1px --border بهامش 12 بين .tch-quick-actions وعنوان «نقاط إيجابية»', async () => {
    const got = {};
    for (const role of ['teacher', 'admin']) {
        const h = role === 'teacher' ? await teacherPage({ list: AT(25) }) : await adminPage({ list: AT(25) });
        try {
            await openQuick(h, 1);
            if (role === 'teacher') {
                await openExceptions(h.page);
                got.الفاصل = await h.page.evaluate(() => {
                    const qa = document.querySelector('#generalQuickSection .tch-quick-actions');
                    const title = [...document.querySelectorAll('#generalQuickSection *')].find(e => e.children.length === 0 && (e.textContent || '').includes('نقاط إيجابية') && e.getClientRects().length);
                    if (!qa || !title) return { qa: !!qa, title: !!title };
                    const top = qa.getBoundingClientRect().bottom, bottom = title.getBoundingClientRect().top, lastBtn = [...qa.querySelectorAll('button')].pop().getBoundingClientRect().bottom;
                    const edges = [];
                    for (const e of document.querySelectorAll('#generalQuickSection *')) {
                        if (!e.getClientRects().length) continue;
                        const cs = getComputedStyle(e), r = e.getBoundingClientRect();
                        for (const [side, y] of [['Top', r.top], ['Bottom', r.bottom]])
                            if (cs['border' + side + 'Style'] === 'solid' && parseFloat(cs['border' + side + 'Width']) === 1 && cs['border' + side + 'Color'] === 'rgb(215, 224, 218)'
                                && y >= lastBtn - 1 && y <= bottom + 1 && r.width >= qa.getBoundingClientRect().width * 0.5) edges.push({ y, above: Math.round(y - lastBtn), below: Math.round(bottom - y) });
                        if (e.tagName === 'HR' && r.top >= lastBtn - 1 && r.bottom <= bottom + 1) edges.push({ y: r.top, above: Math.round(r.top - lastBtn), below: Math.round(bottom - r.bottom), hr: cs.borderTopColor });
                    }
                    const ok = edges.find(e => e.above >= 11 && e.below >= 11 && (!e.hr || e.hr === 'rgb(215, 224, 218)'));
                    return ok ? 'فاصل --border بهامش 12' : { edges, gap: Math.round(bottom - lastBtn) };
                });
                await H.openSec(h.page, 'new');
            }
            await newTo(h.page, 2, 26); await review(h.page, [2, 17], [2, 24]); await setPrep(h.page, true);
            const st = await prepState(h.page);
            got[role] = st.line ? { size: st.line.size, weight: st.line.weight, color: st.line.color, تحت_الزر: st.line.underButton } : 'لا سطر';
        } finally { await h.close(); }
    }
    const line = { size: 13, weight: 700, color: C.amber800, تحت_الزر: true };
    assert.deepEqual(got, { الفاصل: 'فاصل --border بهامش 12', teacher: line, admin: line }, `م10 [الفاصل، السطر عند المعلم، السطر عند المشرف]: ${JSON.stringify(got)}`);
});

// =====================================================================================
// ل16 — التراجع عن آخر تسجيل يعيد اليوم «لم يُسجَّل»
// =====================================================================================
const NEW22 = async page => { await newTo(page, 2, 29, 'جيد'); };   // البقرة 25–29 = 15 سطراً «جيد» = 22.5
test('م12 (ل16 (أ)، المعلم) طالب بلا سجل اليوم: جديد 22.5 + «استوفى المعايير» ← تراجع ← اليوم بلا attended/criteria/criteriaPoints/absence، والإجمالي 0، ولا لوحة التلفاز، والمشرف يراه كما قبل الحفظ («لم يُسجَّل»، «سمّع n من m»، الحضور، الفرسان)', async () => {
    const seedList = AT(24);
    const baseline = await adminReaders(seedList, 1, 'a1');
    const h = await teacherPage({ list: seedList });
    let saved, undone, doc;
    try {
        await openQuick(h, 1);
        await NEW22(h.page); await fulfill(h.page);
        saved = await save(h, 1);
        await closeQuick(h);
        undone = await teacherUndo(h, 1);
        doc = await h.doc(S(1));
    } finally { await h.close(); }
    const after = await adminReaders(withDoc(1, doc), 1, 'a1');
    const keys = undone ? ['attended', 'absence', 'note', 'criteria', 'criteriaPoints'].filter(k => Object.hasOwn(undone, k)) : [];
    const got = { بعد_الحفظ: { criteriaPoints: saved.criteriaPoints, entriesPoints: entriesPoints(saved) }, حقول_باقية: keys, القرّاء: after };
    assert.deepEqual(got, { بعد_الحفظ: { criteriaPoints: A.m12.criteriaPoints, entriesPoints: A.m12.newPoints }, حقول_باقية: [], القرّاء: { ...baseline, total: A.m12.afterUndo.total, board: null } },
        `م12 (المتوقع بعد الحفظ ${A.m12.afterSave}، بعد التراجع ${A.m12.afterUndo.total}): ${JSON.stringify(got)}`);
});

test('م13 (ل16 (أ)، المعلم) تسجيلان (جديد + «استوفى» ثم مراجعة) ← تراجع واحد يحذف المراجعة ويبقي اليوم حاضراً بالجديد والمعايير؛ والتراجع الثاني يعيد «لم يُسجَّل» 0', async () => {
    const h = await teacherPage({ list: AT(24) });
    const got = {};
    let doc2;
    try {
        await openQuick(h, 1);
        await NEW22(h.page); await fulfill(h.page);
        await save(h, 1); await closeQuick(h); await laterClock(h.page);
        await openQuick(h, 1); await review(h.page, [2, 17], [2, 24]);
        await save(h, 1); await closeQuick(h);
        const u1 = await teacherUndo(h, 1);
        got.التراجع_الأول = { attended: u1?.attended, kinds: Object.values(u1?.entries || {}).map(e => e.kind), criteriaPoints: u1?.criteriaPoints };
        await closeQuick(h);
        const u2 = await teacherUndo(h, 1);
        got.التراجع_الثاني = { حقول_باقية: u2 ? ['attended', 'criteria', 'criteriaPoints'].filter(k => Object.hasOwn(u2, k)) : [] };
        doc2 = await h.doc(S(1));
    } finally { await h.close(); }
    const r = await adminReaders(withDoc(1, doc2), 1, 'a1');
    got.الإجمالي = r.total;
    assert.deepEqual(got, { التراجع_الأول: { attended: true, kinds: ['new'], criteriaPoints: A.m12.criteriaPoints }, التراجع_الثاني: { حقول_باقية: [] }, الإجمالي: A.m13.undo2 },
        `م13 (r4-numbers: الحفظان ${A.m13.save1}/${A.m13.save2}، التراجعان ${A.m13.undo1}/${A.m13.undo2}): ${JSON.stringify(got)}`);
});

test('م14-أ (ل16 (ب)، المعلم) «إلغاء الغياب» لخالد الغائب ← اليوم بلا absence وبلا attended ← «لم يُسجَّل» عند المعلم والمشرف، 0 نقاط', async () => {
    const baseline = await adminReaders(withDoc(3, H.makeStudent(3, 'خالد', 'a1')), 3, 'a1');
    const h = await teacherPage();
    let doc, badge;
    try {
        await h.page.locator('.teacher-card[data-id="3"] [data-a=absent]').click();
        for (let i = 0; i < 30 && (await dayOf(h, 3))?.attended === false; i++) await sleep(150);
        await sleep(300);
        doc = await h.doc(S(3));
        badge = norm(await h.page.locator('.teacher-card[data-id="3"] .tch-badge').innerText().catch(() => ''));
    } finally { await h.close(); }
    const day = doc.history?.[TODAY];
    const after = await adminReaders(withDoc(3, doc), 3, 'a1');
    const got = { حقول_اليوم: day ? ['attended', 'absence', 'note'].filter(k => Object.hasOwn(day, k)) : [], شارة_المعلم: badge, المشرف: after };
    assert.deepEqual(got, { حقول_اليوم: [], شارة_المعلم: 'لم يُسجَّل', المشرف: baseline }, `م14-أ: ${JSON.stringify(got)}`);
});
test('م14-ب (ل16 (ب)، حارس أخضر الآن) المشرف يلغي غياب خالد من قائمته ← «حاضر» كما كان (attended:true، +10)', async () => {
    const a = await adminPage();
    try {
        const ok = await a.page.evaluate(() => {
            openGeneralAbsenceModal(todayStr, 'a1');
            const i = generalAbsenceDraft.rows.findIndex(r => r.id === 3); if (i < 0) return false;
            document.getElementById(`generalAbsent${i}`).checked = false; document.getElementById(`generalPresent${i}`).checked = true;
            return true;
        });
        assert.ok(ok, 'صف خالد غير موجود في قائمة الغياب');
        await a.page.evaluate(() => saveGeneralAbsence());
        for (let i = 0; i < 30 && (await dayOf(a, 3))?.attended !== true; i++) await sleep(150);
        const r = await readers(a.page, 3, 'a1');
        assert.deepEqual({ attended: (await dayOf(a, 3))?.attended, state: r.state, total: r.total }, { attended: true, state: 'present', total: 10 }, 'م14-ب [attended، الحالة، الإجمالي]');
    } finally { await a.close(); }
});

test('م15 (ل16، ق155 س3: الحالة المقبولة موثَّقة) «حاضر» صريح من المشرف ثم حفظ المعلم ثم تراجع ← يعود «لم يُسجَّل» (لا attended)', async () => {
    const seedList = list({ 1: { lastSurah: 2, lastAyah: 24, history: { [TODAY]: { attended: true, hijri: 'وهمي' } } } });
    const h = await teacherPage({ list: seedList });
    let undone;
    try {
        await openQuick(h, 1); await NEW22(h.page);
        await save(h, 1); await closeQuick(h);
        undone = await teacherUndo(h, 1);
    } finally { await h.close(); }
    assert.deepEqual({ attended: undone?.attended ?? 'غائب' }, { attended: 'غائب' }, `م15: يوم اليوم بعد التراجع ${JSON.stringify(undone)}`);
});

test('م17 (ل16، المشرف) تراجع المشرف من #smartUndoBtn عن تسجيله الوحيد ← الأثر نفسه: اليوم بلا attended/criteria/criteriaPoints والإجمالي 0', async () => {
    const a = await adminPage({ list: AT(24) });
    try {
        await openQuick(a, 1);
        await NEW22(a.page); await fulfill(a.page);
        await save(a, 1);
        await a.page.evaluate(() => openSmartModal(1));
        await a.page.locator('#smartUndoBtn').waitFor({ state: 'visible', timeout: 3000 });
        await a.page.locator('#smartUndoBtn').click();
        for (let i = 0; i < 30 && Object.keys((await dayOf(a, 1))?.entries || {}).length; i++) await sleep(150);
        await sleep(300);
        const day = await dayOf(a, 1), r = await readers(a.page, 1, 'a1');
        const got = { حقول_باقية: day ? ['attended', 'criteria', 'criteriaPoints'].filter(k => Object.hasOwn(day, k)) : [], total: r.total, board: r.board };
        assert.deepEqual(got, { حقول_باقية: [], total: 0, board: null }, `م17: ${JSON.stringify(got)}`);
    } finally { await a.close(); }
});

// =====================================================================================
// ل17 — فحص الرمز عند فتح «الإنجاز» وعند عودة الصفحة
// =====================================================================================
// يسجّل في sessionStorage أول ظهور لنافذة الإنجاز (يعبر إعادة التحميل).
const MODAL_FLAG = () => { document.addEventListener('DOMContentLoaded', () => { const m = document.getElementById('smartModal'); if (!m) return;
    new MutationObserver(() => { if (m.classList.contains('flex')) try { sessionStorage.setItem('__r4ModalOpened', '1'); } catch (_) {} }).observe(m, { attributes: true, attributeFilter: ['class'] }); }); };
const revoke = page => page.evaluate(() => { window.__fb.docs.set('programs/general/teacherKeys/t1', { code: 't1.NEWKEYXYZW23', halaqaIds: ['m1', 'a1'], active: true }); });
async function revokedOutcome(h, ms = 6000) {
    const shown = await h.page.waitForFunction(msg => document.getElementById('loginError')?.innerText.trim() === msg && document.getElementById('loginError').getClientRects().length > 0,
        REVOKED_MSG, { timeout: ms }).then(() => true).catch(() => false);
    await h.page.waitForTimeout(400);
    return h.page.evaluate(shown => ({ رسالة_الإبطال: shown, loads: window.__fb.loads, خرج: window.__fb.currentUser === null,
        signOut: window.__fb.authLog.filter(l => l.op === 'signOut').length,
        كتابة_المعلم: window.__fb.log.filter(l => l.writes && l.uid === 'teacher-uid').length,
        النافذة_ظهرت: sessionStorage.getItem('__r4ModalOpened') === '1' }), shown).catch(e => ({ evalError: e.message }));
}
test('م18 (ل17، المعلم) المشرف «رمز جديد» ← المعلم (بلا أي كتابة) يضغط «الإنجاز» ← خروج + إعادة تحميل واحدة + رسالة الإبطال، قبل ظهور النافذة', async () => {
    const h = await H.openPage(browser, { user: H.TEACHER_USER, carry: 'all', seed: { teacherUser: true }, initScripts: [MODAL_FLAG] });
    try {
        await h.page.locator('.teacher-card[data-id="1"] [data-a=ach]').waitFor({ state: 'visible', timeout: 8000 });
        await revoke(h.page);
        await h.page.locator('.teacher-card[data-id="1"] [data-a=ach]').click();
        const got = await revokedOutcome(h);
        assert.deepEqual(got, { رسالة_الإبطال: true, loads: 2, خرج: true, signOut: 1, كتابة_المعلم: 0, النافذة_ظهرت: false }, `م18: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});
test('م19 (ل17، المعلم) الشبكة مقطوعة (getDocFromServer يرمي unavailable) ← فتح «الإنجاز» يعمل ولا خروج، وقد حاول الفحص قراءة مستند الطالب من الخادم', async () => {
    const h = await teacherPage();
    try {
        await h.page.evaluate(() => {
            window.__r4Probe = [];
            const fail = op => async r => { window.__r4Probe.push(op + ':' + r.path); throw Object.assign(new Error('Failed to get document because the client is offline.'), { code: 'unavailable' }); };
            window.__fb.getDocFromServer = fail('getDocFromServer'); window.__fb.getDocsFromServer = fail('getDocsFromServer');
        });
        await h.page.locator('.teacher-card[data-id="1"] [data-a=ach]').click();
        const opened = await h.page.locator(H.QUICK_SEL.sec('new')).waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false);
        await h.page.waitForTimeout(1000);
        const got = await h.page.evaluate(p => ({ النافذة: document.getElementById('smartModal').classList.contains('flex'), signOut: window.__fb.authLog.filter(l => l.op === 'signOut').length,
            المعلم: !!document.getElementById('teacherHome'), قراءة_الخادم: window.__r4Probe.includes('getDocFromServer:' + p) }), S(1));
        assert.deepEqual({ ...got, فُتحت: opened }, { النافذة: true, signOut: 0, المعلم: true, قراءة_الخادم: true, فُتحت: true }, `م19: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});
test('م20 (ل17، المعلم) عودة الصفحة (visibilitychange إلى visible) بعد الإبطال ← خروج خلال ≤ 3 ث', async () => {
    const h = await H.openPage(browser, { user: H.TEACHER_USER, carry: 'all', seed: { teacherUser: true } });
    try {
        await h.page.locator('#teacherHome').waitFor({ state: 'attached', timeout: 8000 });
        await h.page.waitForTimeout(300);
        await revoke(h.page);
        await h.page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
        const got = await revokedOutcome(h, 3000);
        assert.deepEqual({ رسالة_الإبطال: got.رسالة_الإبطال, loads: got.loads, خرج: got.خرج }, { رسالة_الإبطال: true, loads: 2, خرج: true }, `م20: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

// =====================================================================================
// الشكل والإتاحة م21–م32
// =====================================================================================
test('م21 (ل1) رمز ناقص الشكل «t1.ABC» يُكتب يدوياً ويُرسل بـEnter ← رسالة الخطأ وaria-invalid="true" على #teacherCodeInput', async () => {
    const h = await loginPage();
    try {
        await h.page.locator('#loginRoleTeacher').click();
        await h.page.locator('#teacherCodeInput').fill('t1.ABC');
        await h.page.locator('#teacherCodeInput').press('Enter');
        await h.page.waitForFunction(() => document.getElementById('loginError')?.innerText.trim() && document.getElementById('loginError').getClientRects().length, null, { timeout: 4000 }).catch(() => {});
        await h.page.waitForTimeout(150);
        const got = await h.page.evaluate(() => ({ الرسالة: document.getElementById('loginError')?.innerText.trim() || '', aria: document.getElementById('teacherCodeInput').getAttribute('aria-invalid') }));
        assert.deepEqual(got, { الرسالة: REVOKED_MSG, aria: 'true' }, `م21: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

// حلقة التركيز (نمط ر23): Tab يضع الصفحة في وضع لوحة المفاتيح ثم focus() لكل عنصر.
async function rings(page, selectors) {
    await page.keyboard.press('Tab');
    return page.evaluate(sels => Object.fromEntries(sels.map(sel => {
        const e = document.querySelector(sel);
        if (!e || !e.getClientRects().length) return [sel, 'غير ظاهر'];
        e.focus();
        const cs = getComputedStyle(e);
        return [sel, `${e.matches(':focus-visible')} ${cs.outlineStyle} ${parseFloat(cs.outlineWidth)} ${cs.outlineColor} +${parseFloat(cs.outlineOffset)}`];
    })), selectors);
}
// ب14 (ق205): كان فحص حلقة زر الشريط؛ صار شريط الحفظ بلا أزرار.
test('م22 (ل2، ق205) حلقة التركيز في زرّي الدور وأزرار نافذة الإنجاز أخضر 2px/2، وشريط الحفظ بلا أزرار', async () => {
    const G = `true solid 2 ${C.green700} +2`;
    const got = {};
    const h = await teacherPage({ list: AT(24) });
    try {
        await openQuick(h, 1);
        await H.openSec(h.page, 'new');
        Object.assign(got, await rings(h.page, ['#generalQuickSection button[aria-label="رجوع"]', '#generalQuickSection [data-sec="new"] .tch-acc-toggle', '#generalQuickSection [data-sec="new"] .tch-confirm',
            '#quick_new_grades button']));
        await H.openSec(h.page, 'behavior');
        Object.assign(got, await rings(h.page, ['#quickDisciplineAll', '#quickDisciplineHome', '#generalCriteriaExceptions']));
        await NEW22(h.page);
        Object.assign(got, await rings(h.page, ['#generalQuickSaveBtn']));   // «حفظ» مفعَّل بعد إدخال الجديد
        await save(h, 1);
        assert.equal(await h.page.locator('#teacherToast button').count(), 0, 'رسالة الحفظ فيها زر');
    } finally { await h.close(); }
    const l = await loginPage();
    try { Object.assign(got, await rings(l.page, ['#loginRoleAdmin', '#loginRoleTeacher'])); } finally { await l.close(); }
    const want = Object.fromEntries(Object.keys(got).map(sel => [sel, G]));
    assert.deepEqual(got, want, `حلقة التركيز لكل عنصر «:focus-visible نمط عرض لون +إزاحة»: ${JSON.stringify(got)}`);
});

test('م23 (ل3) الأوراق: h2 20/800 --ink، ونص الورقة --ink، وزوايا الحقول والأزرار 12 (ورقة الطالب وورقة ⋯)', async () => {
    const h = await teacherPage();
    const got = {};
    try {
        await h.page.locator('#teacherAddStudentBtn').click();
        await h.page.locator('#teacherStudentSheet').waitFor({ state: 'visible', timeout: 3000 });
        const t = await box(h.page, '#teacherStudentSheet h2'), p = await box(h.page, '#teacherStudentSheet .tch-sheet-panel');
        got.العنوان = { size: t.size, weight: t.weight, color: t.color };
        got.اللوحة = p.color;
        got.الحقل = (await box(h.page, '#tsName')).radius;
        got.حفظ = (await box(h.page, '#teacherStudentSheet button.primary')).radius;
        await h.page.locator('#teacherStudentSheet [data-cancel]').click();
        await h.page.locator('.teacher-card[data-id="5"] [data-a=more]').click();
        await h.page.locator('#teacherMoreSheet').waitFor({ state: 'visible', timeout: 3000 });
        got.حذف = (await box(h.page, '#teacherMoreSheet button.danger')).radius;
    } finally { await h.close(); }
    const r12 = [12, 12, 12, 12];
    assert.deepEqual(got, { العنوان: { size: 20, weight: 800, color: C.ink }, اللوحة: C.ink, الحقل: r12, حفظ: r12, حذف: r12 }, `م23: ${JSON.stringify(got)}`);
});

test('م24 (ل4) نص «الإنجاز» و«غائب» في البطاقة 17/700 بلا التفاف ولا فيضان مع ✎ ⋯ على 360 و390', async () => {
    const got = {};
    for (const width of [360, 390]) {
        const h = await teacherPage({}, { width, height: 800 });
        try {
            got[width] = await h.page.evaluate(() => {
                const c = document.querySelector('.teacher-card[data-id="1"]'), row = c.querySelector('.tch-actions');
                const one = sel => { const b = c.querySelector(sel), cs = getComputedStyle(b); return { size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight), fits: b.scrollWidth <= b.clientWidth + 1, h: Math.round(b.getBoundingClientRect().height) }; };
                const tops = [...row.querySelectorAll('button')].map(b => Math.round(b.getBoundingClientRect().top));
                return { الإنجاز: one('[data-a=ach]'), غائب: one('[data-a=absent]'), صف_واحد: new Set(tops).size === 1, الصف_يتسع: row.scrollWidth <= row.clientWidth + 1 };
            });
        } finally { await h.close(); }
    }
    const b = { size: 17, weight: 700, fits: true, h: 48 }, w = { الإنجاز: b, غائب: b, صف_واحد: true, الصف_يتسع: true };
    assert.deepEqual(got, { 360: w, 390: w }, `م24: ${JSON.stringify(got)}`);
});

async function phoneError(h, phone) {
    await h.page.locator('#teacherAddStudentBtn').click();
    await h.page.locator('#teacherStudentSheet').waitFor({ state: 'visible', timeout: 3000 });
    await h.page.locator('#tsName').fill('سالم');
    await h.page.locator('#tsPhone').fill(phone);
    await h.page.locator('#teacherStudentSheet button.primary').click();
    await h.page.waitForTimeout(200);
}
test('م25 (ل5) خطأ الجوال: #tsPhoneError 14/700 --red-700 تحت الحقل، وحدّ #tsPhone أحمر --red-700', async () => {
    const h = await teacherPage();
    try {
        await phoneError(h, '123');
        const e = await box(h.page, '#tsPhoneError'), f = await box(h.page, '#tsPhone');
        const got = { size: e.size, weight: e.weight, color: e.color, تحت_الحقل: e.top >= f.bottom - 1, حدّ_الحقل: f.borderColor };
        assert.deepEqual(got, { size: 14, weight: 700, color: C.red700, تحت_الحقل: true, حدّ_الحقل: C.red700 }, `م25: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

test('م26 (ل6) التلميح «أضف جوال ولي الأمر» بالتوكنين: نص --amber-800 وخلفية --amber-50', async () => {
    const h = await teacherPage({ list: list({ 5: { parentPhone: '' } }) });
    try {
        await h.page.locator('.teacher-card[data-id="5"] [data-a=edit]').click();
        await h.page.locator('#tsPhoneHint').waitFor({ state: 'visible', timeout: 3000 });
        const t = await box(h.page, '#tsPhoneHint');
        assert.deepEqual({ color: t.color, bg: t.bg }, { color: C.amber800, bg: C.amber50 }, `م26 [لون التلميح، خلفيته]: ${t.color} / ${t.bg}`);
    } finally { await h.close(); }
});

test('م27 (ل7) فتح ورقة بلوحة المفاتيح (Enter) ← التركيز على أول عنصر قابل للتركيز فيها (ورقة الغياب وورقة الطالب)؛ وبالنقر ← لا ينتقل إلى حقل', async () => {
    const got = {};
    const active = page => page.evaluate(() => { const a = document.activeElement, sheet = a?.closest('.tch-sheet');
        const first = sheet?.querySelector('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
        return { داخل_ورقة: sheet?.id || null, الأول: !!first && first === a, حقل: ['INPUT', 'SELECT', 'TEXTAREA'].includes(a?.tagName) }; });
    const h = await teacherPage();
    try {
        await h.page.locator('.teacher-card[data-id="1"] [data-a=absent]').focus();
        await h.page.keyboard.press('Enter');
        await h.page.locator('#teacherAbsenceSheet').waitFor({ state: 'visible', timeout: 3000 });
        got.الغياب_بالمفاتيح = await active(h.page);
        await h.page.locator('#teacherAbsenceSheet [data-cancel]').click();
        await h.page.locator('#teacherAddStudentBtn').focus();
        await h.page.keyboard.press('Enter');
        await h.page.locator('#teacherStudentSheet').waitFor({ state: 'visible', timeout: 3000 });
        got.الطالب_بالمفاتيح = await active(h.page);
        await h.page.locator('#teacherStudentSheet [data-cancel]').click();
        await h.page.locator('#teacherAddStudentBtn').click();
        await h.page.locator('#teacherStudentSheet').waitFor({ state: 'visible', timeout: 3000 });
        got.الطالب_بالنقر = (await active(h.page)).حقل;
    } finally { await h.close(); }
    assert.deepEqual(got, { الغياب_بالمفاتيح: { داخل_ورقة: 'teacherAbsenceSheet', الأول: true, حقل: false }, الطالب_بالمفاتيح: { داخل_ورقة: 'teacherStudentSheet', الأول: true, حقل: true }, الطالب_بالنقر: false },
        `م27: ${JSON.stringify(got)}`);
});

test('م28 (ل8) النص البديل لحقل الجوال في الورقة --ink-3 بشفافية 1', async () => {
    const h = await teacherPage();
    try {
        await h.page.locator('#teacherAddStudentBtn').click();
        await h.page.locator('#tsPhone').waitFor({ state: 'visible', timeout: 3000 });
        const p = await h.page.evaluate(() => { const cs = getComputedStyle(document.getElementById('tsPhone'), '::placeholder'); return { color: cs.color, opacity: cs.opacity }; });
        assert.deepEqual(p, { color: C.ink3, opacity: '1' }, `م28 [لون النص البديل، شفافيته]: ${JSON.stringify(p)}`);
    } finally { await h.close(); }
});

test('م29 (ل9) رسالة الحذف «حُذف فهد؛ يستعيده المشرف»', async () => {
    const h = await teacherPage();
    try {
        await h.page.locator('.teacher-card[data-id="5"] [data-a=more]').click();
        await h.page.locator('#teacherMoreSheet button').filter({ hasText: /^\s*حذف الطالب\s*$/ }).click();
        await h.page.locator('#teacherDeleteAskSheet [data-go]').click();
        await h.page.locator('#tsDeleteName').fill('فهد');
        await h.page.locator('#teacherDeleteSheet button.danger').click();
        await h.page.locator('#teacherToast').waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
        const t = norm(await h.page.locator('#teacherToast span').first().innerText().catch(() => ''));
        assert.equal(t, 'حُذف فهد؛ يستعيده المشرف', `م29 نص الرسالة الداكنة بعد الحذف: «${t}»`);
    } finally { await h.close(); }
});

test('م30 (ل12) سؤال الحذف: «حذف فهد من حلقة أُبيّ؟» واسم الحلقة في span.nowrap (white-space:nowrap)؛ وحلقة اسمها «أبي بن كعب» ← «حذف فهد من حلقة أبي بن كعب؟»', async () => {
    const got = {};
    const halaqas = H.settings().halaqas.map(x => x.id === 'a1' ? { ...x, name: 'أبي بن كعب' } : x);
    for (const [label, seed] of [['البذرة', {}], ['بلا كلمة حلقة', { settingsExtra: { halaqas } }]]) {
        const h = await teacherPage(seed);
        try {
            await h.page.locator('.teacher-card[data-id="5"] [data-a=more]').click();
            await h.page.locator('#teacherMoreSheet button').filter({ hasText: /^\s*حذف الطالب\s*$/ }).click();
            await h.page.locator('#teacherDeleteAskSheet').waitFor({ state: 'visible', timeout: 3000 });
            got[label] = await h.page.evaluate(() => { const h2 = document.querySelector('#teacherDeleteAskSheet h2'), s = h2.querySelector('span.nowrap');
                return { العنوان: h2.innerText.replace(/\s+/g, ' ').trim(), span: s ? { text: s.innerText.trim(), ws: getComputedStyle(s).whiteSpace } : null }; });
        } finally { await h.close(); }
    }
    assert.deepEqual(got, { البذرة: { العنوان: 'حذف فهد من حلقة أُبيّ؟', span: { text: 'حلقة أُبيّ', ws: 'nowrap' } },
        'بلا كلمة حلقة': { العنوان: 'حذف فهد من حلقة أبي بن كعب؟', span: { text: 'حلقة أبي بن كعب', ws: 'nowrap' } } }, `م30: ${JSON.stringify(got)}`);
});

// tv.html كما في tv-design-local: ساعة Playwright، والملفات من المستودع، ولا شبكة خارجية.
async function openTv() {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== 'http://tv.test') return route.abort('internetdisconnected');
        const file = path.resolve(H.root, decodeURIComponent(url.pathname.slice(1)));
        if (!file.startsWith(H.root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
        await route.fulfill({ path: file });
    });
    await page.clock.install({ time: new Date('2026-11-01T12:00:00Z') });
    await page.goto('http://tv.test/tv.html');
    return { page, context, close: () => context.close(),
        post: message => page.evaluate(message => { window.tvTestSender ||= new BroadcastChannel('almahra-tv'); window.tvTestSender.postMessage(message); }, message) };
}
const WAIT_LINE = 'في انتظار صفحة المشرف في المتصفح نفسه';
const waitLine = page => page.evaluate(t => { const e = [...document.querySelectorAll('body *')].find(x => x.children.length === 0 && (x.textContent || '').trim() === t);
    if (!e) return 'غائب'; const cs = getComputedStyle(e); return e.getClientRects().length && cs.visibility !== 'hidden' && !e.closest('[hidden]') ? `ظاهر ${parseFloat(cs.fontSize)}` : 'مخفي'; }, WAIT_LINE);
test('م31 (ل14) المشرف بلا تلفاز «غير موصول» ومع hello «التلفاز موصول» (بجانب «📺 شاشة العرض» و«شاشة التلفاز»)؛ والتلفاز بلا لقطة بعد 35 ث يُظهر سطر الانتظار 28px، ويخفيه أول snapshot', async () => {
    const got = {};
    const a = await adminPage();
    try {
        const status = () => a.page.evaluate(() => { const b = document.getElementById('generalTvButton'), s = document.getElementById('generalSettingsTv');
            const near = s ? s.textContent + (s.nextElementSibling && !s.nextElementSibling.classList.contains('panel-card') ? s.nextElementSibling.textContent : '') : '';
            const st = t => /غير موصول/.test(t) ? 'غير موصول' : /التلفاز موصول/.test(t) ? 'موصول' : 'لا مؤشر';
            return { الشرف: st(b?.parentElement?.textContent || ''), الإعدادات: st(near) }; });
        got.بلا_تلفاز = await status();
        await a.page.evaluate(() => { new BroadcastChannel('almahra-tv').postMessage({ type: 'hello' }); });
        for (let i = 0; i < 20; i++) { await sleep(100); if ((await status()).الشرف === 'موصول') break; }
        got.مع_hello = await status();
    } finally { await a.close(); }
    const tv = await openTv();
    try {
        await tv.page.clock.runFor(30000); got.tv_30ث = await waitLine(tv.page);
        await tv.page.clock.runFor(6000); got.tv_36ث = await waitLine(tv.page);
        await tv.post({ type: 'snapshot', boardDate: '2026-11-01', stages: [] }); await tv.page.clock.runFor(500);
        got.tv_بعد_اللقطة = await waitLine(tv.page);
    } finally { await tv.close(); }
    const seen = v => v === 'غائب' || v === 'مخفي' ? 'غير ظاهر' : v;
    for (const k of ['tv_30ث', 'tv_36ث', 'tv_بعد_اللقطة']) got[k] = seen(got[k]);
    assert.deepEqual(got, { بلا_تلفاز: { الشرف: 'غير موصول', الإعدادات: 'غير موصول' }, مع_hello: { الشرف: 'موصول', الإعدادات: 'موصول' },
        tv_30ث: 'غير ظاهر', tv_36ث: 'ظاهر 28', tv_بعد_اللقطة: 'غير ظاهر' }, `م31: ${JSON.stringify(got)}`);
});

test('م32 (ل18) رسالة الجوال بحالتين وبعزل «05» (U+2066…U+2069): فارغ «مطلوب»، ومكتوب غير صالح «غير صحيح»', async () => {
    const got = {};
    for (const [label, phone] of [['فارغ', ''], ['غير_صالح', '123']]) {
        const h = await teacherPage();
        try { await phoneError(h, phone); got[label] = await h.page.evaluate(() => document.getElementById('tsPhoneError').textContent); }
        finally { await h.close(); }
    }
    const cps = v => Array.from(v || '', c => c.codePointAt(0) > 0x2000 && c.codePointAt(0) < 0x2100 ? 'U+' + c.codePointAt(0).toString(16).toUpperCase() : c).join('');
    const want = { فارغ: 'جوال ولي الأمر مطلوب؛ اكتبه هكذا: \u206605\u2069 ثم 8 أرقام', غير_صالح: 'جوال ولي الأمر غير صحيح؛ اكتبه هكذا: \u206605\u2069 ثم 8 أرقام' };
    assert.deepEqual(got, want, `م32 الظاهر: ${JSON.stringify(Object.fromEntries(Object.entries(got).map(([k, v]) => [k, cps(v)])))}`);
});
