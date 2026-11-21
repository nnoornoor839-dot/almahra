// بطاقة 4-4 «حسابات المعلمين» — اختبار القبول الأحمر لواجهة صفحة المعلم (§4-2 و1–و15، وبنود §3-8)، 2026-11-16.
// المرجع: D:\المهره\notes\features\accounts\teacher-accounts-card.md (§3-1، §3-3، §3-3ب، §3-6، §3-7، §3-8، §4-2).
// و16 = المجموعة كاملة، ليس هنا. لا فايربيس حقيقي: tests/helpers/teacher-ui-harness.cjs يحمّل auth.js وdata-store.js
// وprograms-store.js وindex.html كما هي فوق فايربيس وهمي في الذاكرة يحاكي firestore.rules (d10b432) محاكاة مبسّطة.
// طريقتان: (أ) vm للدوال والمخازن، (ب) Playwright على 390×844 و1280 لصفحة المعلم الكاملة.
// الصور ص1–ص4 وص6 وص7 (§5) تُكتب في مجلد الأدلة فقط عند TEACHER_UI_SHOTS=1.
//
// افتراضات الاختبار فيما لم تسمّه البطاقة (تُذكر في التقرير ليقرّها Fable):
//   • العناصر الممنوعة (و4) تُفحص بهذه المحدّدات: nav، .nav-btn، #page-home، #page-settings، #page-records، #generalTvButton،
//     #generalSettingsTv، #settingsGeneralKnightsCard، #setPanelGeneralKnights، #setPanelKnights، #generalMissedDayBtn،
//     #quick_position_fix، #quick_review_fix، .qe-fix.
//   • شكل الدخول (أ19: الشكل ب ألغاه تاج 2، ق88 v7) يُعرف بلا أسماء أصناف: #loginOverlay أو عنصر فيه بخلفية #125c2f يغطي الشاشة كلها، وأب أبيض للزرّين،
//     ونقش واحد شفافيته 7% (svg، لا يلتقط اللمس) يلامس أعلى #loginOverlay وأسفله، والشعار الملوّن assets/brand/afdalkom-logo-vertical-color.
//   • زر الحفظ في نموذج الطالب: زر داخل #teacherStudentSheet نصّه يحوي «حفظ». زر الحذف في #teacherMoreSheet نصّه «حذف الطالب».
//   • التأكيد الأول للحذف: إما confirm() أصلي وإما عنصر ظاهر يحوي النص فيه زر «حذف»/«متابعة»/«نعم».
//   • الغياب: زرّان ظاهران نصّهما «بعذر» و«بغير عذر» (البطاقة §3-8)، و«إلغاء الغياب» زر داخل بطاقة الطالب.
//   • التراجع في الرسالة: زر داخل #teacherToast نصّه «تراجع». «بلا مراجعة اليوم»: زر ظاهر بهذا النص في النافذة.
//   • التبويب المختار: aria-selected="true" أو aria-pressed="true" أو صنف active.
//   • نص التأكيد العكسي من النموذج v5: «لم يُسجَّل جديد لهذا الطالب اليوم. حفظ المراجعة فقط؟» (البطاقة تقول «وعكسه» فقط).
//   • «ترتيب المشرف» داخل كل مجموعة = ترتيب الأرقام (الأسماء الوهمية مرتّبة أبجدياً بالترتيب نفسه).
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('./helpers/teacher-ui-harness.cjs');
const { harness, student } = require('./helpers/quick-entry-harness.cjs');

const html = H.read('index.html');
const authSrc = H.read('auth.js');
const TODAY = H.TODAY;
const SHOTS = process.env.TEACHER_UI_SHOTS === '1';
const SHOT_DIR = 'D:/المهره/notes/design-v1/verify/teacher-ui-2026-11-16/';
const STUDENT_KEYS = ['sid', 'name', 'history', 'memorizedJuz', 'parentPhone', 'frontierBase', 'lastDailyBase', 'joinedOn', 'halaqaId', 'teacherId', 'stage'];
const FORBIDDEN = ['nav', '.nav-btn', '#page-home', '#page-settings', '#page-records', '#generalTvButton', '#generalSettingsTv',
    '#settingsGeneralKnightsCard', '#setPanelGeneralKnights', '#setPanelKnights', '#generalMissedDayBtn', '#quick_position_fix', '#quick_review_fix', '.qe-fix'];
let browser;
before(async () => {
    const playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); });

// ===== أدوات =====
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function shot(page, name) { if (SHOTS) { fs.mkdirSync(SHOT_DIR, { recursive: true }); await page.screenshot({ path: SHOT_DIR + name + '.png' }); } }
async function diagnose(h) {
    const st = await h.page.evaluate(() => ({ body: document.body.className, spy: window.__spy, toast: document.getElementById('toastText')?.innerText || '',
        loginError: document.getElementById('loginError')?.innerText || '', role: window.almahraAuth?.currentRole || null })).catch(e => ({ evalError: e.message }));
    const log = await h.fbLog().catch(() => []);
    return `الحال=${JSON.stringify(st)} أخطاء الصفحة=${JSON.stringify(h.errors.slice(0, 3))} آخر عمليات السحابة=${log.slice(-6).map(l => l.op + ':' + (l.path || (l.writes || []).map(w => w.type + ' ' + w.path).join(',')) + (l.result ? '=' + l.result : '')).join(' | ')}`;
}
async function waitFor(h, selector, what, timeout = 6000) {
    try { await h.page.locator(selector).first().waitFor({ state: 'attached', timeout }); }
    catch { assert.fail(`${what}: العنصر ${selector} غير موجود. ${await diagnose(h)}`); }
}
// صفحة المعلم بجلسة محفوظة (هوية مجهولة لها users صحيح).
async function teacherPage(options = {}) {
    const h = await H.openPage(browser, { user: H.TEACHER_USER, ...options, seed: { teacherUser: true, ...(options.seed || {}) } });
    await waitFor(h, '#teacherHome', 'صفحة المعلم لم تُفتح (openTeacherHome)', 7000);
    return h;
}
async function adminPage(options = {}) {
    const h = await H.openPage(browser, { user: H.ADMIN_USER, ...options });
    await h.page.waitForFunction(() => window.almahraPrograms?.getCurrentProgramId?.() === 'general' && window.almahraData?.isReady?.(), null, { timeout: 7000 });
    await h.page.locator('#loadingOverlay').waitFor({ state: 'hidden' }).catch(() => {});
    return h;
}
const cardIds = page => page.$$eval('#teacherStudentList .teacher-card[data-id]', els => els.filter(e => e.getClientRects().length).map(e => Number(e.dataset.id)));
const card = (page, id) => page.locator(`.teacher-card[data-id="${id}"]`);
async function visibleText(page, selector) { return norm(await page.locator(selector).first().innerText()); }
async function isSelected(locator) {
    return locator.evaluate(e => e.getAttribute('aria-selected') === 'true' || e.getAttribute('aria-pressed') === 'true' || e.classList.contains('active'));
}
async function clickText(page, scope, re, what) {
    const el = page.locator(scope).locator('button, [role=button], a').filter({ hasText: re }).filter({ visible: true }).first();
    if (!await el.count()) assert.fail(`${what}: لا زر ظاهر نصّه ${re} داخل ${scope}`);
    await el.click();
}
// أ14 (ق101 س2): الفتح والتنقل والتأكيد بأداة الهاركنس الواحدة (أقسام v7 للمعلم، والهيكل القديم للمشرف) بدل التبويبين الملغيين.
async function openAch(h, id) { await H.openAch(h, id).catch(async e => assert.fail(`${e.message}. ${await diagnose(h)}`)); }
async function setField(page, id, value, events = ['input', 'change']) {
    const ok = await page.evaluate(([id, value, events]) => {
        const el = document.getElementById(id); if (!el) return false;
        el.value = String(value); events.forEach(t => el.dispatchEvent(new Event(t, { bubbles: true }))); return true;
    }, [id, value, events]);
    assert.ok(ok, `الحقل #${id} غير موجود`);
}
async function grade(page, kind, name) {
    const b = page.locator(`#quick_${kind}_grades button`).filter({ hasText: name }).first();
    assert.ok(await b.count(), `زر التقدير «${name}» غير موجود في #quick_${kind}_grades`);
    await b.click();
}
// الجديد: إلى البقرة toAyah؛ المراجعة: الفاتحة 1 ← 7.
// أ14: عند المعلم «الإدخال» = فتح القسم + الحقول + «تأكيد» (ق98-1: ما لم يُؤكَّد لا يُحفظ)؛ عند المشرف كما كان حرفياً.
async function fillNew(page, toAyah = 10, g = 'ممتاز') {
    const acc = await H.quickAccordion(page);
    if (acc) await H.openSec(page, 'new');
    await setField(page, 'quick_new_toAyah', toAyah); await grade(page, 'new', g);
    if (acc) await H.confirmSec(page, 'new');
}
async function fillReview(page, g = 'جيد') {
    await H.openSec(page, 'review');
    for (const [id, v] of [['quick_review_fromSurah', 1], ['quick_review_fromAyah', 1], ['quick_review_toSurah', 1], ['quick_review_toAyah', 7]]) await setField(page, id, v);
    await grade(page, 'review', g);
    await H.confirmSec(page, 'review');
}
async function pressSave(page) {
    await H.confirmBehavior(page);   // أ14: ما لُمس في السلوك يُحفظ مؤكَّداً كما كان يُحفظ قبل الأقسام (المعلم وحده)
    await page.evaluate(() => typeof updateGeneralQuickPreview === 'function' && updateGeneralQuickPreview());
    await page.locator('#generalQuickSaveBtn').click();
}
const studentWrites = async (h, id) => (await h.fbLog()).filter(l => (l.writes || []).some(w => w.path.endsWith('/students/' + id)) && l.result === 'ok');
async function forbiddenPresent(page) { return page.evaluate(list => list.filter(sel => document.querySelector(sel) !== null), FORBIDDEN); }
async function layoutMetrics(page, width, scopes) {
    return page.evaluate(([width, scopes]) => {
        const vis = e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
        const txt = document.body.innerText;
        const ph = scopes.flatMap(s => [...document.querySelectorAll(s + ' [placeholder]')]).filter(vis).map(e => e.placeholder).join(' ');
        const small = scopes.flatMap(s => [...document.querySelectorAll(s + ' button')]).filter(vis)
            .filter(b => b.getBoundingClientRect().height < 44).map(b => (b.id ? '#' + b.id + ' ' : '') + b.innerText.trim().slice(0, 20));
        const roots = scopes.map(s => document.querySelector(s)).filter(Boolean);
        return { sw: document.documentElement.scrollWidth, width, latin: (txt + ' ' + ph).match(/[A-Za-z]+/g) || [], indic: (txt.match(/[\u0660-\u0669\u06F0-\u06F9]/g) || []).length,
            small: [...new Set(small)], fonts: roots.map(r => getComputedStyle(r).fontFamily) };
    }, [width, scopes]);
}

// =====================================================================================
// (أ) ساكنة / vm
// =====================================================================================
test('و3 (ساكن، §3-8أ) شاشة الدخول: #loginRoleAdmin «مشرف» و#loginRoleTeacher «معلم» و#teacherCodeForm/#teacherCodeInput/#teacherCodeBtn «دخول»، ومعرّفات auth.js القائمة باقية', () => {
    const tag = id => new RegExp(`<[a-z]+\\b[^>]*\\bid="${id}"[^>]*>([^<]*)`).exec(html);
    for (const [id, label] of [['loginRoleAdmin', 'مشرف'], ['loginRoleTeacher', 'معلم'], ['teacherCodeBtn', 'دخول']]) {
        const m = tag(id);
        assert.ok(m, `#${id} غير موجود في index.html`);
        assert.equal(norm(m[1]), label, `نص #${id}`);
    }
    for (const id of ['teacherCodeForm', 'teacherCodeInput']) assert.ok(tag(id), `#${id} غير موجود في index.html`);
    for (const id of ['loginOverlay', 'loginForm', 'loginEmail', 'loginPassword', 'loginError', 'loginBtn', 'forgotBtn']) assert.ok(tag(id), `#${id} القائم اختفى`);
    assert.ok((html + authSrc).includes('الرمز غير صحيح أو أُبطل؛ اطلب الرابط من المشرف'), 'نص خطأ الرمز غير موجود في index.html ولا auth.js');
});

test('و15 (ساكن، §3-8ب) CSS صفحة المعلم بأصناف tch- ولا transform: scale عند الضغط', () => {
    assert.match(html, /\.tch-[a-z]/, 'لا صنف CSS يبدأ بـtch- في index.html');
    const pressed = [...html.matchAll(/([^{}]*\.tch-[^{}]*:active[^{}]*)\{([^}]*)\}/g)].filter(m => /scale/.test(m[2])).map(m => m[1].trim());
    assert.deepEqual(pressed, [], 'قاعدة :active لأصناف tch- فيها scale');
});

function teacherAuthModule(seedExtra = {}, user = null) {
    const docs = { 'programs/general/teacherKeys/t1': { code: H.TEACHER_CODE, halaqaIds: ['m1', 'a1'], active: true }, ...seedExtra };
    return H.loadModule(['auth.js'], { seed: { docs, user } });
}
async function signIn(m, code) {
    const fn = m.ctx.almahraAuth?.signInTeacherWithCode;
    assert.equal(typeof fn, 'function', 'window.almahraAuth.signInTeacherWithCode غير معرّفة في auth.js');
    const result = await fn(code);
    await m.tick(20);
    return result;
}

test('و1 (vm، §3-8أ، ق23) signInTeacherWithCode يطبّع الرمز (فراغات، كبيرة بعد النقطة فقط)، يدخل مجهولاً، ويكتب users بالمفاتيح الأربعة بالضبط', async () => {
    const m = teacherAuthModule();
    const result = await signIn(m, '  t1.abcd efgh jk23 ');
    assert.deepEqual(JSON.parse(JSON.stringify(result)), { success: true });
    assert.equal(m.fb.authLog.filter(l => l.op === 'signInAnonymously').length, 1, 'signInAnonymously مرة واحدة');
    assert.deepEqual(m.fb.get('users/anon-1'), { role: 'teacher', programId: 'general', teacherId: 't1', code: H.TEACHER_CODE });
});

test('و1 (vm، ق4) مستند users موجود برمز قديم ← updateDoc لـcode وحده لا setDoc', async () => {
    const m = teacherAuthModule({ 'users/anon-1': { role: 'teacher', programId: 'general', teacherId: 't1', code: 't1.OLDOLDOLD234' } });
    const result = await signIn(m, H.TEACHER_CODE);
    assert.equal(result?.success, true, JSON.stringify(result));
    const writes = m.fb.log.flatMap(l => (l.writes || []).map(w => ({ ...w, op: l.op, result: l.result }))).filter(w => w.path === 'users/anon-1');
    assert.deepEqual(writes.map(w => [w.op, w.type, w.data, w.result]), [['updateDoc', 'update', { code: H.TEACHER_CODE }, 'ok']]);
    assert.equal(m.fb.get('users/anon-1').code, H.TEACHER_CODE);
});

test('و2 (vm، §3-8أ، ق41ب) رمز مشوَّه ← TEACHER_CODE_INVALID بلا دخول مجهول ولا users؛ رمز صحيح الشكل خطأ القيمة أو مُبطَل ← دخول مجهول ← رفض ← signOut ولا users', async () => {
    // (1) مشوَّه: بلا نقطة، أو الجزء العشوائي ≠ 12 ← يُرفض قبل أي استدعاء للمصادقة.
    for (const [label, code] of [['بلا نقطة', 't1-WRONGWRONG23'], ['الجزء العشوائي 7', 't1.WRONG23'], ['الجزء العشوائي 13', 't1.WRONGWRONG234']]) {
        const m = teacherAuthModule();
        const result = await signIn(m, code);
        assert.deepEqual(JSON.parse(JSON.stringify(result)), { success: false, code: 'TEACHER_CODE_INVALID' }, label);
        assert.equal(m.fb.authLog.filter(l => l.op === 'signInAnonymously').length, 0, label + ': دخول مجهول لرمز مشوَّه');
        assert.equal(m.fb.currentUser, null, label);
        assert.deepEqual(m.fb.log.filter(l => (l.writes || []).some(w => w.path.startsWith('users/'))).map(l => l.op), [], label + ': كتابة users');
    }
    // (2) صحيح الشكل لكن القيمة خطأ أو المفتاح مُبطَل ← الخادم يرفض users ← signOut.
    for (const [label, extra, code] of [['خطأ', {}, 't1.WRONGWRONG23'], ['مُبطَل', { 'programs/general/teacherKeys/t1': { code: H.TEACHER_CODE, halaqaIds: ['a1'], active: false } }, H.TEACHER_CODE]]) {
        const m = teacherAuthModule(extra);
        const result = await signIn(m, code);
        assert.deepEqual(JSON.parse(JSON.stringify(result)), { success: false, code: 'TEACHER_CODE_INVALID' }, label);
        assert.equal(m.fb.authLog.filter(l => l.op === 'signInAnonymously').length, 1, label + ': لم يدخل مجهولاً');
        assert.ok(m.fb.log.some(l => (l.writes || []).some(w => w.path === 'users/anon-1') && l.result === 'permission-denied'), label + ': لا محاولة users رفضها الخادم');
        assert.equal(m.fb.currentUser, null, label + ': الهوية المجهولة لم يُخرج منها');
        assert.ok(m.fb.authLog.some(l => l.op === 'signOut'), label + ': لا signOut');
        assert.equal(m.fb.get('users/anon-1'), undefined, label);
    }
});

test('و1 (vm، §3-8أ) بعد دخول المعلم: almahraAuth.currentTeacherId من users وisTeacher() صحيح', async () => {
    const m = teacherAuthModule({ 'users/teacher-uid': { role: 'teacher', programId: 'general', teacherId: 't1', code: H.TEACHER_CODE } }, H.TEACHER_USER);
    let ready = false;
    m.ctx.addEventListener('almahra-auth-ready', () => { ready = true; });
    await m.tick(30);
    assert.equal(ready, true, 'almahra-auth-ready لم يُطلق');
    assert.equal(m.ctx.almahraAuth.isTeacher(), true);
    assert.equal(m.ctx.almahraAuth.currentTeacherId, 't1', 'almahraAuth.currentTeacherId');
});

// ===== data-store.js =====
const TEACHER_AUTH = { currentUser: { uid: 'teacher-uid' }, currentRole: 'teacher', isTeacher: () => true, isAdmin: () => false, currentTeacherId: 't1' };
const ADMIN_AUTH = { currentUser: { uid: 'admin-uid' }, currentRole: 'admin', isTeacher: () => false, isAdmin: () => true };
function dataStore(role = 'teacher', seed = {}) {
    const docs = H.seedDocs({ teacherUser: true, ...seed });
    return H.loadModule(['data-store.js'], { seed: { docs, user: role === 'teacher' ? H.TEACHER_USER : H.ADMIN_USER }, auth: role === 'teacher' ? TEACHER_AUTH : ADMIN_AUTH });
}
const studentListeners = m => m.fb.log.filter(l => l.op === 'onSnapshot' && l.path === 'programs/general/seasons/s1/students');

test('§3-8ج-1 (vm) setStudentsFilter({halaqaIds}) ← المستمع query(where("halaqaId","in",…)) ويصل طلاب الحلقتين وحدهم؛ والمشرف بلا مرشِّح كما اليوم', async () => {
    const m = dataStore('teacher');
    const D = m.ctx.almahraData;
    assert.equal(typeof D.setStudentsFilter, 'function', 'almahraData.setStudentsFilter غير معرّفة');
    D.setActiveContext('general', 's1');          // openTeacherHome يفتح general أولاً ثم يضع المرشِّح (§3-8ب)
    D.setStudentsFilter({ halaqaIds: ['a1', 'm1'] });
    await m.tick(30);
    const last = studentListeners(m).at(-1);
    assert.deepEqual(last.constraints, [{ kind: 'where', field: 'halaqaId', op: 'in', value: ['a1', 'm1'] }]);
    assert.equal(D.isReady(), true, 'المستمع المرشَّح لم يُكمل');
    assert.deepEqual(JSON.parse(JSON.stringify(D.getStudents().map(s => s.id).sort((a, b) => a - b))), [1, 2, 3, 4, 5, 6, 7]);   // ق41د: المصفوفة من سياق vm آخر
    const a = dataStore('admin');
    a.ctx.almahraData.setActiveContext('general', 's1');
    await a.tick(30);
    assert.deepEqual(studentListeners(a).at(-1).constraints, [], 'المشرف: مستمع بلا قيد');
    assert.equal(a.ctx.almahraData.getStudents().length, 8);
});

test('ل4 (vm، §3-8ج-1) beforeWrite يرجع null للمعلم بلا استدعاء حارس التجميد؛ والمشرف يمرّ بالحارس كما اليوم', async () => {
    const m = dataStore('teacher');
    let guardCalls = 0;
    m.ctx.almahraData.setWriteGuard(async () => { guardCalls++; return { ok: false }; });
    m.ctx.almahraData.setActiveContext('general', 's1');
    m.ctx.almahraData.setStudentsFilter?.({ halaqaIds: ['a1', 'm1'] });
    await m.tick(20);
    const r = await m.ctx.almahraData.patchStudent(1, { name: 'أحمد ب' });
    assert.equal(guardCalls, 0, 'الحارس استُدعي من جهاز المعلم');
    assert.equal(r?.success, true, JSON.stringify(r));
    assert.equal(m.fb.get('programs/general/seasons/s1/students/1').name, 'أحمد ب');
    const a = dataStore('admin');
    let adminCalls = 0;
    a.ctx.almahraData.setWriteGuard(async () => { adminCalls++; return { ok: true }; });
    a.ctx.almahraData.setActiveContext('general', 's1');
    await a.tick(20);
    assert.equal((await a.ctx.almahraData.patchStudent(1, { name: 'س' })).success, true);
    assert.equal(adminCalls, 1, 'المشرف: الحارس يُستدعى كما اليوم');
});

test('و13 (vm، §3-8ج-1، ق13/ق15/ق15ب) deleteStudentWithCopy: دفعة واحدة: set deletedStudents/{sid} بلا id مع studentId نصاً وdeletedBy وdeletedAt=serverTimestamp ثم delete الطالب', async () => {
    const m = dataStore('teacher');
    const D = m.ctx.almahraData;
    D.setActiveContext('general', 's1'); D.setStudentsFilter?.({ halaqaIds: ['a1', 'm1'] });
    await m.tick(20);
    assert.equal(typeof D.deleteStudentWithCopy, 'function', 'almahraData.deleteStudentWithCopy غير معرّفة');
    const s5 = { ...m.fb.get('programs/general/seasons/s1/students/5'), id: 5 };
    await D.deleteStudentWithCopy(s5);
    await m.tick(10);
    const batch = m.fb.log.filter(l => l.op === 'batch');
    assert.equal(batch.length, 1, 'دفعة واحدة');
    const { id, ...data } = s5;
    assert.deepEqual(batch[0].writes, [
        { type: 'set', path: 'programs/general/seasons/s1/deletedStudents/sid-5', data: { ...data, studentId: '5', deletedBy: 'teacher-uid', deletedAt: { __sentinel: 'serverTimestamp' } } },
        { type: 'delete', path: 'programs/general/seasons/s1/students/5', data: undefined }]);
    assert.equal(batch[0].result, 'ok', 'القواعد الوهمية رفضت الدفعة');
    assert.equal(m.fb.get('programs/general/seasons/s1/students/5'), undefined);
});

test('و13 (vm، §3-8ج-1، ق15) المشرف: listDeletedStudents ثم restoreDeletedStudent: set الطالب برقمه بلا deletedBy/deletedAt/studentId + delete النسخة في دفعة واحدة', async () => {
    const copyDoc = { ...H.makeStudent(9, 'زياد', 'a1'), studentId: '9', deletedBy: 'teacher-uid', deletedAt: { __serverTime: 5 } };
    const m = dataStore('admin', { extraDocs: { 'programs/general/seasons/s1/deletedStudents/sid-9': copyDoc } });
    const D = m.ctx.almahraData;
    D.setWriteGuard(async () => ({ ok: true }));
    D.setActiveContext('general', 's1');
    await m.tick(20);
    for (const n of ['listDeletedStudents', 'restoreDeletedStudent']) assert.equal(typeof D[n], 'function', `almahraData.${n} غير معرّفة`);
    const list = await D.listDeletedStudents();
    const found = (list?.items || list || []).find(x => x.sid === 'sid-9');
    assert.ok(found, 'النسخة لم تُرجع من listDeletedStudents');
    assert.equal(found.studentId, '9');
    await D.restoreDeletedStudent(found);
    await m.tick(10);
    const { studentId, deletedBy, deletedAt, ...expected } = copyDoc;
    assert.deepEqual(m.fb.get('programs/general/seasons/s1/students/9'), expected);
    assert.equal(m.fb.get('programs/general/seasons/s1/deletedStudents/sid-9'), undefined, 'الاستعادة لم تحذف النسخة (ق15)');
    assert.equal(m.fb.log.filter(l => l.op === 'batch' && l.result === 'ok').length, 1, 'دفعة واحدة');
});

// ===== programs-store.js =====
test('§3-8ج-3 (vm، ق8) updateSettings للمشرف يحدّث teacherKeys/{tid}.halaqaIds الموجودة من حلقات المعلم الجديدة ولا يمسّ code/active', async () => {
    const docs = H.seedDocs();
    const m = H.loadModule(['programs-store.js'], { seed: { docs, user: H.ADMIN_USER }, auth: ADMIN_AUTH });
    await m.tick(60);
    const P = m.ctx.almahraPrograms;
    P.setWriteGuard(async () => ({ ok: true }));
    const next = H.settings();
    next.halaqas = next.halaqas.map(h => h.id === 'm1' ? { ...h, teacherId: 't2' } : h);   // نقل حلقة ابن مسعود إلى إبراهيم
    const r = await P.updateSettings('general', next);
    await m.tick(20);
    assert.equal(r?.success, true, JSON.stringify(r));
    const k1 = m.fb.get('programs/general/teacherKeys/t1'), k2 = m.fb.get('programs/general/teacherKeys/t2');
    assert.deepEqual([...k1.halaqaIds].sort(), ['a1']);
    assert.deepEqual([...k2.halaqaIds].sort(), ['b1', 'm1']);
    assert.equal(k1.code, H.TEACHER_CODE); assert.equal(k1.active, true);
});

test('و1 (vm، فحص إضافي) programs-store بحساب معلم: البرامج تجهز وgeneral مقروء رغم رفض قراءة summer/review-day، بلا أي كتابة', async () => {
    const docs = H.seedDocs({ teacherUser: true });
    const m = H.loadModule(['programs-store.js'], { seed: { docs, user: H.TEACHER_USER }, auth: TEACHER_AUTH });
    await m.tick(80);
    const P = m.ctx.almahraPrograms;
    assert.equal(P.isReady(), true, 'almahraPrograms.isReady() بقي false لحساب المعلم (boot يتوقف عند رفض قراءة programs/summer)');
    assert.equal(P.getPrograms().general?.activeSeasonId, 's1');
    assert.deepEqual(m.fb.log.filter(l => l.writes).map(l => l.writes.map(w => w.path)), [], 'كتابة من جهاز المعلم');
});

// ===== index.html (هاركنس التسجيل السريع) =====
function withRemote() {
    const h = harness(student({}, { direction: 'down', lastSurah: 2, lastAyah: 5 }));
    try { h.install('detectRemoteEntries'); } catch { assert.fail('الدالة غير معرّفة في index.html: detectRemoteEntries'); }
    for (const name of ['localEntryKeys', 'celebratedEntryKeys']) {
        const decl = new RegExp(`(?:const|let|var) ${name} = [^;]+;`).exec(html);
        assert.ok(decl, `${name} غير معرّف في index.html`);
        h.run(decl[0].replace(/^(?:const|let)/, 'var'));
    }
    h.ctx.window.almahraAuth = { currentUser: { uid: 'fake-admin' }, isAdmin: () => true, isTeacher: () => false };
    h.ctx.__cel = [];
    h.run('sendGeneralTvCelebration = function (s, added) { __cel.push(s && s.id); }');
    return h;
}
const withEntries = (id, entries, date = '2026-11-01') => ({ id, sid: 'sid-' + id, name: 'ط' + id, halaqaId: 'h1', history: { [date]: { attended: true, entries } } });
const ent = (by, at = 1) => ({ kind: 'new', spec: { from: [2, 6], to: [2, 10] }, grade: 'good', at, rep: 1, points: 2, by });

test('ل2/ل3 (هاركنس، §3-8ج-4) detectRemoteEntries: احتفال مرة لكل مفتاح جديد لليوم من جهاز آخر؛ لا تكرار، لا للمفاتيح المحلية، لا لليوم السابق', () => {
    const h = withRemote();
    h.ctx.__prev = [withEntries(1, { e0: ent('x') }), withEntries(2, {})];
    h.ctx.__next = [withEntries(1, { e0: ent('x'), e1: ent('other', 2) }), withEntries(2, {})];
    h.run('detectRemoteEntries(__prev, __next)');
    assert.deepEqual([...h.ctx.__cel], [1], 'مفتاح جديد واحد ← احتفال واحد للطالب 1');
    h.run('detectRemoteEntries(__prev, __next)');
    assert.deepEqual([...h.ctx.__cel], [1], 'المفتاح نفسه مرة ثانية (لقطة دورية) ← لا احتفال');
    h.run("localEntryKeys.add('e2')");
    h.ctx.__next2 = [withEntries(1, { e0: ent('x'), e1: ent('other', 2) }), withEntries(2, { e2: ent('fake-admin', 3) })];
    // المفتاح المحلي قد يُسجَّل في localEntryKeys بصيغة أطول؛ يكفي أن يُعرف المفتاح نفسه.
    h.run(`if (![...localEntryKeys].some(k => String(k).includes('e2'))) localEntryKeys.add('e2')`);
    h.run('detectRemoteEntries(__next, __next2)');
    assert.deepEqual([...h.ctx.__cel], [1], 'مفتاح حفظه هذا الجهاز ← لا احتفال (ل3)');
    h.ctx.__old = [withEntries(3, { y1: ent('other') }, '2026-10-30')];
    h.run('detectRemoteEntries([], __old)');
    h.run('detectRemoteEntries([withEntries0], __old)'.replace('withEntries0', '{id:3,sid:"sid-3",name:"ط3",halaqaId:"h1",history:{}}'));
    assert.deepEqual([...h.ctx.__cel], [1], 'تسجيل يوم سابق ← لا احتفال');
});

test('ل3 (هاركنس، §3-8ج-4) saveGeneralQuickEntry يضع مفتاح التسجيل في localEntryKeys قبل الكتابة', async () => {
    const h = withRemote();
    let seen = null;
    const original = h.ctx.window.almahraData.patchStudent;
    h.ctx.window.almahraData.patchStudent = (id, fields) => { seen = h.run('[...localEntryKeys].map(String)'); return original(id, fields); };
    h.range('new', null, [2, 10]); h.grade('new');
    await h.save();
    assert.ok(h.state.writes.length, 'لم يُكتب شيء');
    const keys = Object.keys(h.state.writes[0].fields).filter(k => k.includes('.entries.')).map(k => k.split('.entries.')[1]);
    assert.equal(keys.length, 1);
    assert.ok(seen && seen.some(k => k.includes(keys[0])), `localEntryKeys لا يحوي ${keys[0]} لحظة الكتابة: ${JSON.stringify(seen)}`);
});

test('ل2 (ساكن، §3-8ج-4) مستمع subscribeStudents يستدعي detectRemoteEntries قبل students = newStudents', () => {
    const start = html.indexOf('window.almahraData.subscribeStudents((newStudents)');
    assert.ok(start > 0);
    const body = html.slice(start, html.indexOf('});', start));
    const d = body.indexOf('detectRemoteEntries('), s = body.indexOf('students = newStudents');
    assert.ok(d > 0, 'detectRemoteEntries لا يُستدعى في المستمع');
    assert.ok(d < s, 'detectRemoteEntries بعد students = newStudents');
});

// =====================================================================================
// (ب) Playwright: الصفحة الكاملة بالملفات الحقيقية فوق الفايربيس الوهمي
// =====================================================================================
test('و3 شاشة الدخول: زرّان «مشرف»/«معلم» بلا شرح؛ «مشرف» = نموذج البريد الحالي، «معلم» = حقل الرمز؛ لا نص إرشادي', async () => {
    const h = await H.openPage(browser, {});
    try {
        await h.page.locator('#loginOverlay').waitFor({ state: 'visible' });
        await waitFor(h, '#loginRoleAdmin', 'زر «مشرف»');
        await waitFor(h, '#loginRoleTeacher', 'زر «معلم»');
        const first = await visibleText(h.page, '#loginOverlay');
        const rest = norm(first.replace('برنامج الحوافز', '').replace('مشرف', '').replace('معلم', ''));
        assert.ok(first.includes('برنامج الحوافز'), `«برنامج الحوافز» غائب: "${first}"`);
        assert.equal(rest, '', `نص زائد على شاشة الدخول قبل الاختيار: "${rest}"`);
        assert.equal(await h.page.locator('#loginOverlay input').filter({ visible: true }).count(), 0, 'حقول ظاهرة قبل الاختيار');
        await h.page.locator('#loginRoleAdmin').click();
        assert.equal(await h.page.locator('#loginForm').isVisible(), true, '#loginForm لم يظهر بعد «مشرف»');
        assert.deepEqual(await h.page.$$eval('#loginOverlay input', i => i.filter(x => x.getClientRects().length).map(x => x.type)), ['email', 'password']);
        assert.equal(await h.page.locator('#teacherCodeForm').isVisible(), false);
        const adminText = await visibleText(h.page, '#loginOverlay');
        await h.page.locator('#loginRoleTeacher').click();
        assert.equal(await h.page.locator('#teacherCodeForm').isVisible(), true, '#teacherCodeForm لم يظهر بعد «معلم»');
        assert.equal(await h.page.locator('#teacherCodeInput').isVisible(), true);
        assert.equal(await visibleText(h.page, '#teacherCodeBtn'), 'دخول');
        assert.equal(await h.page.locator('#loginForm').isVisible(), false, 'نموذج البريد بقي ظاهراً مع «معلم»');
        const teacherText = await visibleText(h.page, '#loginOverlay');
        assert.doesNotMatch(adminText + ' ' + teacherText, /واتساب|الرابط|افتح|جمعية أفضلكم/, 'نص إرشادي أو سطر الجمعية');
        await shot(h.page, 'ص1-دخول-المعلم-390');
    } finally { await h.close(); }
});

// أ19 (ق88، ق116 س2): الشكل ب (كتلة خضراء + نقشان أعلى وأسفل + الشعار الأبيض) ألغاه تاج 2 في v7؛ المحروس باقٍ: صفحة ثابتة بلا حركة،
// الزرّان في بطاقة بيضاء، نقش ساكن لا يلتقط اللمس، الشعار محمَّل، النص «برنامج الحوافز» بلا سطر الجمعية، بلا تمرير أفقي.
for (const width of [390, 1280]) test(`و3 شكل الدخول v7 على ${width}: الصفحة كلها خضراء + البطاقة البيضاء + نقش واحد ثابت 7% يغطيها + شعار أفضلكم الملوّن، بلا حركة (لقطتان بفارق ثانية متطابقتان)`, async () => {
    const h = await H.openPage(browser, { width, height: width === 390 ? 844 : 900 });
    try {
        await h.page.locator('#loginOverlay').waitFor({ state: 'visible' });
        await h.page.waitForTimeout(300);
        const r = await h.page.evaluate(() => {
            const ov = document.getElementById('loginOverlay'), o = ov.getBoundingClientRect(), vh = innerHeight;
            const all = [...ov.querySelectorAll('*')], cs = e => getComputedStyle(e);
            const green = [ov, ...all].filter(e => { const r = e.getBoundingClientRect();
                return cs(e).backgroundColor === 'rgb(18, 92, 47)' && r.top <= 1 && r.bottom >= vh - 1 && r.left <= 1 && r.right >= innerWidth - 1; }).length;
            let c = document.getElementById('loginRoleAdmin')?.parentElement;
            while (c && c !== ov && cs(c).backgroundColor !== 'rgb(255, 255, 255)') c = c.parentElement;
            const pats = all.filter(e => Math.abs(Number(cs(e).opacity) - 0.07) < 0.006 && cs(e).backgroundImage.includes('svg') && cs(e).pointerEvents === 'none')
                .map(e => e.getBoundingClientRect());
            const logo = [...ov.querySelectorAll('img')].find(i => i.getClientRects().length);
            return { green, whiteCard: !!c && c !== ov, pats: pats.length, top: pats.some(p => Math.abs(p.top - o.top) <= 1), bottom: pats.some(p => Math.abs(p.bottom - o.bottom) <= 1),
                logo: logo ? logo.getAttribute('src') : null, logoLoaded: logo ? logo.naturalWidth : 0, text: ov.innerText,
                anims: document.getAnimations().length, animNames: all.map(e => cs(e).animationName).filter(n => n !== 'none') };
        });
        assert.ok(r.green >= 1, 'الصفحة ليست كلها خضراء #125c2f (#loginOverlay أو عنصر فيه يغطي الشاشة)');
        assert.ok(r.whiteCard, 'الزرّان ليسا داخل بطاقة بيضاء');
        assert.equal(r.pats, 1, 'نقش واحد شفافيته 7% (svg، بلا لمس)');
        assert.ok(r.top && r.bottom, 'النقش لا يغطي الشاشة من أعلاها إلى أسفلها');
        assert.match(r.logo || '', /assets\/brand\/afdalkom-logo-vertical-color\.png$/, 'شعار أفضلكم الملوّن');
        assert.ok(r.logoLoaded > 0, 'الشعار لم يُحمَّل');
        assert.ok(r.text.includes('برنامج الحوافز') && !r.text.includes('جمعية أفضلكم') && !r.text.includes('برنامج المهرة'), `النص: ${norm(r.text)}`);
        assert.equal(r.anims, 0, 'حركات جارية'); assert.deepEqual(r.animNames, []);
        const a = await h.page.screenshot(); await h.page.waitForTimeout(1000); const b = await h.page.screenshot();
        assert.equal(Buffer.compare(a, b), 0, 'اللقطتان بفارق ثانية مختلفتان');
        const sw = await h.page.evaluate(() => document.documentElement.scrollWidth);
        assert.ok(sw <= width, `تمرير أفقي ${sw}`);
    } finally { await h.close(); }
});

test('و1 فتح /?k=<رمز ت1> ← دخول مجهول ← users ← صفحة «حلقتي» بتبويبي العصر ثم المغرب؛ الرمز مُزال من العنوان قبل الدخول', async () => {
    const h = await H.openPage(browser, { url: '/?k=' + H.TEACHER_CODE });
    try {
        await waitFor(h, '#teacherHome', 'صفحة المعلم بعد الرابط', 7000);
        assert.doesNotMatch(h.page.url(), /[?&]k=/, 'الرمز باقٍ في العنوان');
        const anon = await h.page.evaluate(() => window.__fb.authLog.filter(l => l.op === 'signInAnonymously'));
        assert.equal(anon.length, 1);
        assert.doesNotMatch(anon[0].search, /k=/, 'replaceState لم يسبق signInAnonymously');
        assert.deepEqual(await h.doc('users/anon-1'), { role: 'teacher', programId: 'general', teacherId: 't1', code: H.TEACHER_CODE });
        const tabs = await h.page.$$eval('#teacherHalaqaTabs button', b => b.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
        assert.equal(tabs.length, 2, JSON.stringify(tabs));
        assert.ok(tabs[0].includes('العصر') && tabs[0].includes('حلقة أُبيّ'), `التبويب الأول: ${tabs[0]}`);
        assert.ok(tabs[1].includes('المغرب') && tabs[1].includes('حلقة ابن مسعود'), `التبويب الثاني: ${tabs[1]}`);
        assert.equal(await h.page.evaluate(() => localStorage.getItem('almahra_teacher_code') || Object.values(localStorage).join('|').includes('ABCDEFGHJK23')), false, 'الرمز محفوظ في localStorage');
    } finally { await h.close(); }
});

test('و2 رمز خطأ أو مُبطَل (بالرابط وباليد) ← شاشة الدخول برسالة «الرمز غير صحيح أو أُبطل؛ اطلب الرابط من المشرف»', async () => {
    const MSG = 'الرمز غير صحيح أو أُبطل؛ اطلب الرابط من المشرف';
    for (const [label, opts] of [['رابط برمز خطأ', { url: '/?k=t1.WRONGWRONG23' }],
        ['رابط برمز مُبطَل', { url: '/?k=' + H.TEACHER_CODE, seed: { teacherKey: { code: H.TEACHER_CODE, halaqaIds: ['a1', 'm1'], active: false } } }]]) {
        const h = await H.openPage(browser, opts);
        try {
            await h.page.waitForFunction(msg => document.getElementById('loginError')?.innerText.trim() === msg && document.getElementById('loginError').getClientRects().length, MSG, { timeout: 6000 })
                .catch(async () => assert.fail(`${label}: الرسالة لم تظهر. ${await diagnose(h)}`));
            assert.equal(await h.page.locator('#loginOverlay').isVisible(), true, label);
            assert.equal(await h.page.locator('#teacherHome').count(), 0, label);
            assert.doesNotMatch(h.page.url(), /[?&]k=/, label + ': الرمز باقٍ في العنوان');
            assert.equal(await h.page.evaluate(() => window.__fb.currentUser), null, label + ': الهوية المجهولة باقية');
        } finally { await h.close(); }
    }
    const h = await H.openPage(browser, {});
    try {
        await waitFor(h, '#loginRoleTeacher', 'زر «معلم»');
        await h.page.locator('#loginRoleTeacher').click();
        await h.page.locator('#teacherCodeInput').fill('t1.NOPENOPE2345');
        await h.page.locator('#teacherCodeBtn').click();
        await h.page.waitForFunction(msg => document.getElementById('loginError')?.innerText.trim() === msg, MSG, { timeout: 6000 })
            .catch(async () => assert.fail(`الإدخال اليدوي: الرسالة لم تظهر. ${await diagnose(h)}`));
    } finally { await h.close(); }
});

test('و3 الإدخال اليدوي للرمز (بحروف صغيرة وفراغات) يفتح صفحة المعلم', async () => {
    const h = await H.openPage(browser, {});
    try {
        await waitFor(h, '#loginRoleTeacher', 'زر «معلم»');
        await h.page.locator('#loginRoleTeacher').click();
        await h.page.locator('#teacherCodeInput').fill(' t1.abcd efgh jk23 ');
        await h.page.locator('#teacherCodeBtn').click();
        await waitFor(h, '#teacherHome', 'صفحة المعلم بعد الإدخال اليدوي', 7000);
        assert.equal((await h.doc('users/anon-1'))?.code, H.TEACHER_CODE);
    } finally { await h.close(); }
});

// أ19 (ق89، ق116 س2): الوقت صار عنصراً مستقلاً أصغر بجانب الاسم في صفّه (مبدّل v7) بدل «فوق الاسم»؛ المحروس باقٍ: ترتيب periodOf، والاختيار الافتراضي، والقيد، والعزل.
test('و1/م5 التبويبات بترتيب periodOf (العصر أولاً) و«العصر/المغرب» عنصر أصغر بجانب الاسم في صفّه؛ المستمع بقيد where in [حلقتيه]؛ لا طالب من حلقة غيره', async () => {
    const h = await teacherPage();
    try {
        const tabs = h.page.locator('#teacherHalaqaTabs button');
        assert.equal(await tabs.count(), 2);
        const sizes = await tabs.first().evaluate(b => {
            const leaf = t => [...b.querySelectorAll('*')].find(e => e.children.length === 0 && e.textContent.trim() === t);
            const p = leaf('العصر'), n = leaf('حلقة أُبيّ');
            const pr = p?.getBoundingClientRect(), nr = n?.getBoundingClientRect();
            return p && n ? [parseFloat(getComputedStyle(p).fontSize), parseFloat(getComputedStyle(n).fontSize), Math.abs((pr.top + pr.bottom) / 2 - (nr.top + nr.bottom) / 2) <= 4] : null;
        });
        assert.ok(sizes && sizes[0] < sizes[1] && sizes[2], `«العصر» ليست عنصراً أصغر بجانب الاسم في صفّه: ${JSON.stringify(sizes)}`);
        assert.equal(await isSelected(tabs.first()), true, 'تبويب العصر غير مختار افتراضياً');
        assert.deepEqual(await cardIds(h.page), [1, 4, 5, 2, 3]);
        await tabs.nth(1).click();
        assert.deepEqual(await cardIds(h.page), [6, 7]);
        assert.equal(await h.page.locator('.teacher-card[data-id="8"]').count(), 0);
        const listens = (await h.fbLog()).filter(l => l.op === 'onSnapshot' && l.path.endsWith('/students'));
        const w = listens.at(-1)?.constraints?.find(c => c.kind === 'where');
        assert.ok(w && w.field === 'halaqaId' && w.op === 'in' && [...w.value].sort().join() === 'a1,m1', JSON.stringify(listens));
        await shot(h.page, 'ص2-صفحة-الحلقة-390');
    } finally { await h.close(); }
});

test('و4 الممنوعات غير موجودة في DOM (لا مخفية) للمعلم، قبل النافذة وبعدها وبعد إعادة الرسم؛ لا openProgram ولا openEventPicker؛ والمشرف كما اليوم', async () => {
    const h = await teacherPage();
    try {
        assert.equal(await h.page.evaluate(() => document.body.classList.contains('teacher-mode')), true, 'body.teacher-mode');
        assert.deepEqual(await forbiddenPresent(h.page), [], 'عناصر ممنوعة موجودة بعد openTeacherHome');
        const spy = await h.page.evaluate(() => window.__spy);
        assert.equal(spy.openProgram, 0, 'openProgram استُدعي للمعلم'); assert.equal(spy.openEventPicker, 0, 'openEventPicker استُدعي للمعلم');
        await h.page.evaluate(() => { try { updateAllUIs(); } catch (e) { window.__uiErr = e.message; } });
        await h.page.evaluate(() => window.__fb.set('programs/general/seasons/s1/students/6', { ...window.__fb.get('programs/general/seasons/s1/students/6'), name: 'عمر ب' }));
        await h.page.waitForTimeout(300);
        assert.deepEqual(await forbiddenPresent(h.page), [], 'عناصر ممنوعة عادت بعد إعادة الرسم');
        assert.equal(await h.page.evaluate(() => window.__uiErr || null), null, 'updateAllUIs رمى خطأ في وضع المعلم');
        await openAch(h, 1);
        assert.deepEqual(await forbiddenPresent(h.page), [], 'نافذة الإنجاز بنت «أيام فائتة»/«تصحيح الموضع»');
        // أ14: ق83 (مستوعَب في ق90) يخفي الجمل الشارحة عند المعلم ومنها «لتصحيح الموضع أبلغ المشرف» (البطاقة ق83، ق90، وج3 في teacher-r2-accordion-local).
        assert.ok(!(await visibleText(h.page, '#smartModal')).includes('لتصحيح الموضع أبلغ المشرف'), 'نص «لتصحيح الموضع أبلغ المشرف» ظاهر للمعلم (ق83)');
        await h.page.evaluate(() => { try { switchTab('page-settings', null); } catch (e) {} });
        await shot(h.page, 'ص6-محاولة-الإعدادات-390');
        assert.equal(await h.page.locator('#page-settings').count(), 0);
        assert.deepEqual(h.errors, [], 'أخطاء صفحة');
    } finally { await h.close(); }
    const a = await adminPage();
    try {
        const spy = await a.page.evaluate(() => window.__spy);
        assert.equal(spy.openProgram, 1, 'المشرف: openProgram مرة واحدة كما اليوم');
        assert.equal(spy.openTeacherHome, 0, 'المشرف: openTeacherHome استُدعي');
        for (const sel of ['nav', '#page-settings', '#page-records', '#page-home', '#generalTvButton']) assert.equal(await a.page.locator(sel).count() > 0, true, 'المشرف فقد ' + sel);
        assert.equal(await a.page.evaluate(() => document.body.classList.contains('teacher-mode')), false);
        assert.equal(await a.page.locator('#teacherHome').count(), 0, 'المشرف يرى #teacherHome');
    } finally { await a.close(); }
});

test('و5 بطاقة الطالب: الاسم، «آخر محفوظ: …»، الشارة، الأزرار الأربعة؛ الترتيب غير المسجَّلين ثم المسجَّلون ثم الغائبون', async () => {
    const h = await teacherPage();
    try {
        assert.deepEqual(await cardIds(h.page), [1, 4, 5, 2, 3], 'الترتيب');
        const c1 = norm(await card(h.page, 1).innerText());
        const last = await h.page.evaluate(() => generalPointLabel(computeFrontier(students.find(s => s.id === 1))));
        assert.ok(c1.includes('أحمد') && c1.includes('آخر محفوظ:') && c1.includes(last), `بطاقة 1: ${c1} (المتوقع آخر محفوظ ${last})`);
        assert.ok(c1.includes('لم يُسجَّل'), 'شارة «لم يُسجَّل»');
        for (const [a, label] of [['ach', 'الإنجاز'], ['absent', 'غائب']])
            assert.equal(norm(await card(h.page, 1).locator(`[data-a=${a}]`).innerText()), label, `[data-a=${a}]`);
        // أ5 (ق58): ✎ و⋯ أيقونتان ونص القارئ في aria-label، لا رمز نصي (يُحذف النص المخفي .tch-sr بعدها).
        // أ19 (ق118-1): الأيقونتان صارتا svg مرسومة (DESIGN.md «مرسومة SVG لا رموزاً») بدل fa-pen / fa-ellipsis؛ المحروس باقٍ: أيقونة واحدة مخفية عن القارئ، بلا نص ظاهر، وaria-label، وزر.
        for (const [a, aria] of [['edit', 'تعديل بيانات الطالب'], ['more', 'خيارات الطالب']]) {
            const b = card(h.page, 1).locator(`[data-a=${a}]`);
            assert.equal(await b.count(), 1, `[data-a=${a}] غائب`);
            const r = await b.evaluate(el => ({ icons: [...el.querySelectorAll('svg, i')].map(i => i.tagName.toLowerCase() + ':' + i.getAttribute('aria-hidden')),
                aria: el.getAttribute('aria-label'), tag: el.tagName,
                shown: [...el.childNodes].filter(n => !(n.classList && n.classList.contains('tch-sr'))).map(n => n.textContent).join('').trim() }));
            assert.equal(r.shown, '', `[data-a=${a}]: نص ظاهر بجانب الأيقونة`);
            assert.deepEqual(r.icons, ['svg:true'], `[data-a=${a}]: أيقونة svg واحدة مخفية عن القارئ (ولا أيقونة خط)`);
            assert.equal(r.aria, aria, `[data-a=${a}]: aria-label`);
            assert.equal(r.tag, 'BUTTON', `[data-a=${a}] ليس زراً`);
        }
        assert.match(norm(await card(h.page, 2).innerText()), /سُجّل · جيد/, 'شارة «سُجّل · التقدير»');
        assert.ok(norm(await card(h.page, 3).innerText()).includes('غائب'));
        assert.ok(norm(await card(h.page, 4).innerText()).includes('يُحدَّد في أول إنجاز'), 'طالب بلا موضع');
    } finally { await h.close(); }
});

// أ19 (ق89، ق116 س2 وس7): سطر «سُجّل n من m · غائب k» (#teacherDayRow) حلّ محله #teacherDate وبطاقات الأرقام الثلاث، ونافذة confirm() المتصفح
// حلّت محلها ورقة #teacherLogoutSheet («خروج» / «إلغاء»)؛ المحروس باقٍ: الاسم، «!»، الأرقام نفسها بـ0-9، التأكيد قبل الخروج، الإلغاء لا يُخرج، ثم signOut ← إعادة تحميل واحدة.
test('§3-8ب الشريط العلوي (اسم المعلم، «!» يفتح #teacherHelpSheet، «خروج» بورقة تأكيد) والتاريخ وبطاقات «الطلاب m · سُجّل n · متبقٍ (منهم غائب k)» بأرقام 0-9', async () => {
    const h = await teacherPage({ carry: 'all' });   // أ4: الخروج يعيد تحميل الصفحة (ق50)؛ الجلسة والسجلّات تُحمل عبره
    try {
        assert.ok((await visibleText(h.page, '#teacherTopBar')).includes('عبدالله'), 'اسم المعلم في الشريط');
        assert.equal(await visibleText(h.page, '#teacherHelpBtn'), '!');
        await h.page.locator('#teacherHelpBtn').click();
        assert.equal(await h.page.locator('#teacherHelpSheet').isVisible(), true, '#teacherHelpSheet لم يظهر');
        const stat = k => visibleText(h.page, `#teacherStats [data-stat="${k}"]`);
        const num = async k => Number(norm(await h.page.locator(`#teacherStats [data-stat="${k}"] .tch-stat-num`).innerText()));
        const [total, rec, left] = [await num('total'), await num('rec'), await num('left')];
        assert.ok([4, 5].includes(total) && rec === 1 && left === total - rec, `الأرقام: الطلاب ${total} · سُجّل ${rec} · متبقٍ ${left}`);
        assert.match(await stat('left'), /منهم غائب\s*1/, `بطاقة «متبقٍ»: ${await stat('left')}`);
        const day = [await visibleText(h.page, '#teacherDate'), await stat('total'), await stat('rec'), await stat('left')].join(' | ');
        assert.match(day, /[0-9]/); assert.doesNotMatch(day, /[\u0660-\u0669]/);
        await h.page.keyboard.press('Escape').catch(() => {});
        await h.page.evaluate(() => document.getElementById('teacherHelpSheet')?.querySelector('button')?.click());
        await h.page.locator('#teacherLogoutBtn').click();
        await h.page.locator('#teacherLogoutSheet').waitFor({ state: 'visible', timeout: 3000 }).catch(() => assert.fail('«خروج» بلا ورقة تأكيد #teacherLogoutSheet'));
        assert.match(await visibleText(h.page, '#teacherLogoutSheet'), /تسجيل الخروج؟/, 'نص ورقة الخروج');
        await clickText(h.page, '#teacherLogoutSheet', /^\s*إلغاء\s*$/, 'ورقة الخروج');
        await h.page.waitForTimeout(200);
        assert.equal(await h.page.locator('#teacherLogoutSheet').filter({ visible: true }).count(), 0, 'الورقة باقية بعد «إلغاء»');
        assert.equal(h.dialogs.length, 0, 'نافذة تأكيد المتصفح بدل الورقة');
        assert.equal(await h.page.evaluate(() => !!window.__fb.currentUser), true, 'خرج رغم الإلغاء');
        assert.equal(await h.page.evaluate(() => window.__fb.loads), 1, 'أُعيد التحميل رغم الإلغاء');
        // ق50: «خروج» ← تأكيد في الورقة ← signOut ← location.reload()
        await h.page.locator('#teacherLogoutBtn').click();
        await h.page.locator('#teacherLogoutSheet').waitFor({ state: 'visible', timeout: 3000 });
        await Promise.all([h.page.waitForEvent('load', { timeout: 5000 }).catch(() => assert.fail('«خروج» لم يُعد تحميل الصفحة (ق50)')),
            clickText(h.page, '#teacherLogoutSheet', /^\s*خروج\s*$/, 'ورقة الخروج')]);
        await h.page.locator('#loginOverlay').waitFor({ state: 'visible', timeout: 4000 }).catch(async () => assert.fail('شاشة الدخول لم تظهر بعد الخروج. ' + await diagnose(h)));
        const after = await h.page.evaluate(() => ({ loads: window.__fb.loads, user: window.__fb.currentUser, nav: performance.getEntriesByType('navigation')[0]?.type,
            seq: window.__fb.authLog.filter(l => l.op === 'signOut' || l.op === 'pageLoad').map(l => l.op + ':' + (l.n ?? l.uid)) }));
        assert.deepEqual([after.loads, after.nav], [2, 'reload'], 'لا إعادة تحميل واحدة بعد الخروج');
        assert.deepEqual(after.seq, ['pageLoad:1', 'signOut:teacher-uid', 'pageLoad:2'], 'الترتيب: signOut ثم إعادة التحميل');
        assert.equal(after.user, null, 'الجلسة باقية بعد الخروج');
        assert.equal(await h.page.locator('#teacherHome').count(), 0, 'صفحة المعلم بعد الخروج');
    } finally { await h.close(); }
});

// أ14 (ق90/ق101 س1): العنوان صار الاسم وحده (#generalQuickName، ج1)، والتبويبان صارا قسمين (الجديد مفتوح عند الفتح)، والانضباط داخل قسم السلوك (ق84 مستوعَب).
test('و6 نافذة الإنجاز: الاسم في #generalQuickName، قسم الجديد مفتوح افتراضياً ثم المراجعة، «آخر محفوظ: X ← يبدأ من: Y»، بحث السورة والقصّ، الانضباط بزرّيه و«استثناءات» في قسم السلوك', async () => {
    const h = await teacherPage();
    try {
        await openAch(h, 1);
        const text = await visibleText(h.page, '#smartModal');
        assert.equal(await visibleText(h.page, '#generalQuickName'), 'أحمد', 'العنوان: اسم الطالب');
        const open0 = await H.secState(h.page);
        assert.deepEqual([open0.new.expanded && open0.new.bodyVisible, open0.review.bodyVisible, open0.behavior.bodyVisible], [true, false, false], 'الجديد ليس المفتوح افتراضياً وحده');
        assert.match(text, /آخر محفوظ:\s*البقرة 5\s*يبدأ من:\s*البقرة 6/, 'سطرا «آخر محفوظ» و«يبدأ من»');   // أ18: ف6 حذف السهم
        { const fl = (await h.page.evaluate(() => {
            const box = document.getElementById('quick_new_start');
            const rows = [...(box?.children || [])].filter(e => e.getClientRects().length).map(e => ({ t: e.innerText.replace(/[\s\u00a0\u202f\u2060]+/g, ' ').trim(), r: e.getBoundingClientRect() }));
            return { all: (box?.innerText || '').replace(/\s+/g, ' ').trim(), rows: rows.map(x => x.t), separate: rows.length === 2 && rows[1].r.top >= rows[0].r.bottom - 1 };
        }));
            assert.deepEqual([fl.rows, fl.separate, fl.all.includes('←')], [['آخر محفوظ: البقرة 5', 'يبدأ من: البقرة 6'], true, false], `سطرا «آخر محفوظ» و«يبدأ من» (ف6: سطران منفصلان بلا سهم): ${JSON.stringify(fl)}`); }
        assert.equal(await h.page.locator('#quick_new_toSurah_search').count(), 1, 'بحث السورة (2-10) غائب');
        await setField(h.page, 'quick_new_toAyah', 999);
        await h.page.waitForTimeout(100);
        assert.equal(await h.page.inputValue('#quick_new_toAyah'), '286', 'القصّ لآخر آية (2-9)');
        await H.openSec(h.page, 'behavior');
        assert.equal(await visibleText(h.page, '#quickDisciplineAll'), 'استوفى المعايير');
        assert.equal(await visibleText(h.page, '#quickDisciplineHome'), 'التحضير المنزلي');
        assert.equal(await h.page.locator(H.QUICK_SEL.sec('behavior') + ' button').filter({ hasText: 'استثناءات' }).filter({ visible: true }).count() >= 1, true, 'زر «استثناءات»');
        await H.openSec(h.page, 'review');
        assert.equal((await H.secState(h.page)).review.expanded, true);
        assert.equal(await h.page.locator('#quick_review_row').isVisible(), true);
        assert.equal(await h.page.locator('#quick_new_row').isVisible(), false, 'صف الجديد ظاهر وقسم المراجعة مفتوح');
        await shot(h.page, 'ص3-نافذة-التسجيل-390');
    } finally { await h.close(); }
});

function normalizePatch(write) {
    // يُطابق التسجيل بين الحسابين: مفتاح التسجيل عشوائي، و«by» هو uid الكاتب (ف1: متطابق عدا by)
    const out = {};
    for (const [k, v] of Object.entries(write.data)) {
        const m = /^(history\.[^.]+\.entries\.)(.+)$/.exec(k);
        if (m && v && typeof v === 'object') { const { by, ...rest } = v; out[m[1] + rest.kind] = rest; }
        else out[k] = v;
    }
    return out;
}
test('و6/ف1 الحفظ من صفحة المعلم = saveGeneralQuickEntry القائم: الحقول المكتوبة مطابقة لحفظ المشرف للمدخلات نفسها عدا by', async () => {
    const run = async (h, open) => {
        await open();
        await fillNew(h.page); await fillReview(h.page);
        await pressSave(h.page);
        await h.page.waitForTimeout(400);
        const w = (await studentWrites(h, 1)).filter(l => l.op === 'updateDoc');
        assert.equal(w.length, 1, `عدد كتابات الطالب 1: ${w.length}. ${await diagnose(h)}`);
        return w[0];
    };
    const a = await adminPage();
    let admin;
    try { admin = await run(a, () => a.page.evaluate(() => openSmartModal(1))); } finally { await a.close(); }
    const h = await teacherPage();
    try {
        const teacher = await run(h, () => openAch(h, 1));
        assert.deepEqual(normalizePatch(teacher.writes[0]), normalizePatch(admin.writes[0]));
        const by = Object.entries(teacher.writes[0].data).filter(([k]) => k.includes('.entries.')).map(([, v]) => v.by);
        assert.deepEqual([...new Set(by)], ['teacher-uid'], 'by = uid المعلم');
        // ل4: لا قراءة كل الطلاب ولا كتابة الموسم من جهاز المعلم
        const log = await h.fbLog();
        assert.deepEqual(log.filter(l => /getDocs/.test(l.op) && l.path.endsWith('/students') && !(l.constraints || []).some(c => c.kind === 'where')).map(l => l.op), [], 'قراءة كل الطلاب');
        assert.deepEqual(log.filter(l => (l.writes || []).some(w => /^programs\/general(\/seasons\/[^/]+)?$/.test(w.path))).map(l => l.op), [], 'كتابة البرنامج/الموسم');
    } finally { await h.close(); }
});

// أ14 (ق78): التأكيد صار ورقة .tch-sheet بعنوان «لم تُدخل مراجعة لِ…»/«لم تُدخل جديداً لِ…»، وزرّها الثاني «احفظ … فقط» يحفظ كما كان «حفظ» في الشريط الأصفر.
async function confirmFlow(h, id, MSG, ONLY) {
    await pressSave(h.page);
    await h.page.waitForTimeout(300);
    const sheets = await H.quickSheets(h.page);
    assert.ok(sheets.some(s => s.text.includes(MSG)), `الورقة «${MSG}» لم تظهر. الأوراق: ${JSON.stringify(sheets)}`);
    assert.equal((await studentWrites(h, id)).length, 0, 'حُفظ قبل التأكيد');
    await H.sheetButton(h.page, ONLY).catch(e => assert.fail(e.message));
    await h.page.waitForTimeout(400);
    assert.equal((await studentWrites(h, id)).length, 1, 'لم يُحفظ بعد التأكيد');
}
// أ8 (ق65): بعد ق64 قد تبقى نافذة الطالب التالي مفتوحة بعد الحفظ؛ تُغلق قبل فتح بطاقة أخرى (لا شيء إن كانت مغلقة). أ14: «رجوع» عند المعلم (ق90) بدل ✕.
async function closeQuick(h) {
    await H.closeAch(h.page).catch(async () => assert.fail('زر الإغلاق لم يغلق النافذة. ' + await diagnose(h)));
}
// أ14 (ق78/ق79): الجزء الثالث («بلا مراجعة اليوم» الصريح يحفظ بلا تأكيد) حُذف لأن الزر حُذف بق79 ولم يبقَ له معنى؛ الزر الثاني في الورقة يؤدي غرضه.
test('و7 حفظ قسم واحد ← ورقة ق78 بنصّها (وعكسه)، ولا حفظ قبل زرّها الثاني «احفظ … فقط»', async () => {
    const h = await teacherPage();
    try {
        await openAch(h, 1); await fillNew(h.page);
        await confirmFlow(h, 1, 'لم تُدخل مراجعة لِأحمد', 'احفظ الجديد فقط');
        await closeQuick(h);
        await openAch(h, 5); await fillReview(h.page);
        await confirmFlow(h, 5, 'لم تُدخل جديداً لِفهد', 'احفظ المراجعة فقط');
    } finally { await h.close(); }
});

// أ29 (ق189–ق190، الجولة 5، 2026-11-20): كان «تختفي بعد 6 ث» (waitForTimeout(6300) ثم غير ظاهرة)؛ صار «باقية بعد 7 ث بزرّ «تراجع»» — الشريط ذو التراجع بلا مؤقت.
// ب14 (ق205): كان زر تراجع في الشريط وبقاء 7 ث؛ صار بلا أزرار ويختفي بعد 6 ث، والتراجع من صندوق النافذة.
test('و8/ت1–ت3 بعد الحفظ: رسالة بلا أزرار تختفي بعد 7 ث؛ التسجيل باقٍ والتراجع من صندوق النافذة تسجيل في كل ضغطة', async () => {
    const h = await teacherPage();
    try {
        await openAch(h, 2);
        const other = await visibleText(h.page, '#quickTodayBox');
        assert.ok(other.includes('سُجّل من جهاز آخر؛ لتعديله أبلغ المشرف'), `#quickTodayBox لطالب سجّله جهاز آخر: ${other}`);
        assert.equal(await h.page.locator('#quickTodayBox button').filter({ hasText: 'تراجع' }).count(), 0, 'تراجع عن تسجيل جهاز آخر');
        await h.page.evaluate(() => closeSmartModal(true));
        await openAch(h, 1); await fillNew(h.page); await fillReview(h.page); await pressSave(h.page);
        await h.page.locator('#teacherToast').waitFor({ state: 'visible', timeout: 4000 }).catch(async () => assert.fail('#teacherToast لم يظهر. ' + await diagnose(h)));
        const toast = await visibleText(h.page, '#teacherToast');
        assert.equal(norm(toast), 'حُفظ لأحمد', `الرسالة: ${toast}`);
        assert.equal(await h.page.locator('#teacherToast button').count(), 0, 'رسالة الحفظ فيها زر');
        assert.match(norm(await card(h.page, 1).innerText()), /سُجّل · ممتاز/);
        assert.deepEqual(await cardIds(h.page), [4, 5, 1, 2, 3], 'البطاقة لم تنزل');
        await shot(h.page, 'ص4-بعد-الحفظ-390');
        await h.page.waitForTimeout(7000);
        const after7 = await h.page.locator('#teacherToast').isVisible().catch(() => false) ? await visibleText(h.page, '#teacherToast') : '(غير ظاهرة)';
        assert.equal(after7, '(غير ظاهرة)', `الرسالة بعد 7 ث: ${after7}`);
        await closeQuick(h);
        await openAch(h, 1);
        const mine = await visibleText(h.page, '#quickTodayBox');
        assert.ok(mine.includes('سُجّل اليوم:'), `#quickTodayBox: ${mine}`);
        assert.equal(await h.page.locator('#quickTodayBox button').filter({ hasText: 'تراجع' }).count() >= 1, true, 'لا «تراجع» لتسجيل هذا الجهاز');
        await h.page.evaluate(() => closeSmartModal(true));
        await openAch(h, 5); await fillNew(h.page); await fillReview(h.page); await pressSave(h.page);
        await h.page.locator('#teacherToast').waitFor({ state: 'visible', timeout: 4000 });
        const mine5 = async () => Object.values((await h.doc('programs/general/seasons/s1/students/5')).history?.[TODAY]?.entries || {}).filter(e => e.by === 'teacher-uid');
        assert.equal((await mine5()).length, 2, 'الحفظ لم يكتب الجديد والمراجعة');
        // ب14 (ق205): كان التراجع الأول من الرسالة؛ صار من صندوق «سُجّل اليوم».
        assert.equal(await h.page.locator('#teacherToast button').count(), 0, 'رسالة فهد فيها زر');
        await openAch(h, 5);
        await clickText(h.page, '#quickTodayBox', /تراجع/, 'زر التراجع الأول في #quickTodayBox');
        await h.page.waitForTimeout(500);
        const left = await mine5();
        assert.equal(left.length, 1, `بعد التراجع الأول: المتوقع تسجيل واحد باقٍ لهذه الهوية، الموجود ${left.length}`);
        await h.page.evaluate(() => typeof closeSmartModal === 'function' && document.getElementById('smartModal')?.getClientRects().length && closeSmartModal(true));
        // الضغطة الثانية من #quickTodayBox للطالب نفسه ← لا تسجيل.
        await openAch(h, 5);
        await waitFor(h, '#quickTodayBox', 'صندوق «سُجّل اليوم» للطالب 5 بعد التراجع الأول');
        await clickText(h.page, '#quickTodayBox', /تراجع/, 'زر التراجع في #quickTodayBox');
        await h.page.waitForTimeout(500);
        assert.deepEqual(await mine5(), [], 'التراجع الثاني لم يحذف التسجيل الباقي');
        assert.deepEqual(Object.keys((await h.doc('programs/general/seasons/s1/students/5')).history?.[TODAY]?.entries || {}), [], 'بقي تسجيل للطالب 5');
    } finally { await h.close(); }
});

test('و9 أول إنجاز لطالب بلا موضع: صندوق «آخر آية حفظها» (needsPosition القائم) والحفظ يكتب frontierFix (ق1) باسم المعلم', async () => {
    const h = await teacherPage();
    try {
        await openAch(h, 4);
        assert.ok((await visibleText(h.page, '#smartModal')).includes('آخر آية حفظها'), 'صندوق الموضع غائب');
        assert.equal(await h.page.locator('#quick_positionAyah').isVisible(), true);
        await setField(h.page, 'quick_positionSurah', 2); await setField(h.page, 'quick_positionAyah', 5);
        await fillNew(h.page); await fillReview(h.page); await pressSave(h.page);
        await h.page.waitForTimeout(400);
        const s4 = await h.doc('programs/general/seasons/s1/students/4');
        assert.deepEqual([s4.frontierFix?.surah, s4.frontierFix?.ayah, s4.frontierFix?.by], [2, 5, 'teacher-uid'], JSON.stringify(s4.frontierFix));
    } finally { await h.close(); }
});

test('و10 «غائب» ← خيارا «بعذر»/«بغير عذر» ← شارة حمراء والبطاقة في الآخر ← «إلغاء الغياب» في اليوم نفسه', async () => {
    const h = await teacherPage();
    try {
        await card(h.page, 1).locator('[data-a=absent]').click();
        for (const t of ['بعذر', 'بغير عذر']) assert.ok(await h.page.locator('button').filter({ hasText: new RegExp(`^\\s*${t}\\s*$`) }).filter({ visible: true }).count(), `خيار «${t}» غائب`);
        await h.page.locator('button').filter({ hasText: /^\s*بغير عذر\s*$/ }).filter({ visible: true }).first().click();
        await h.page.waitForTimeout(400);
        const s1 = await h.doc('programs/general/seasons/s1/students/1');
        assert.deepEqual([s1.history?.[TODAY]?.attended, s1.history?.[TODAY]?.absence], [false, 'unexcused']);
        assert.ok(norm(await card(h.page, 1).innerText()).includes('غائب'));
        assert.deepEqual((await cardIds(h.page)).slice(-2).sort(), [1, 3], 'الغائب ليس في الآخر');
        await clickText(h.page, '.teacher-card[data-id="1"]', /إلغاء الغياب/, '«إلغاء الغياب»');
        await h.page.waitForTimeout(400);
        assert.notEqual((await h.doc('programs/general/seasons/s1/students/1')).history?.[TODAY]?.attended, false, 'الغياب لم يُلغَ');
        assert.ok(norm(await card(h.page, 1).innerText()).includes('لم يُسجَّل'));
    } finally { await h.close(); }
});

async function openSheet(h, trigger) {
    await trigger();
    await h.page.locator('#teacherStudentSheet').waitFor({ state: 'visible', timeout: 3000 }).catch(async () => assert.fail('#teacherStudentSheet لم يظهر. ' + await diagnose(h)));
    for (const id of ['tsName', 'tsJuz', 'tsPhone']) await waitFor(h, '#' + id, 'حقل النموذج');
}
async function fillJuz(page, v) {
    const tag = await page.$eval('#tsJuz', e => e.tagName);
    if (tag === 'SELECT') { if (v !== '') await page.selectOption('#tsJuz', String(v)); } else await page.fill('#tsJuz', String(v));
}
test('و11 «+ طالب جديد»: الاسم، الأجزاء اختياري، الجوال إلزامي 05xxxxxxxx؛ المستند بالمفاتيح الـ11 بالضبط في الحلقة المختارة، joinedOn اليوم؛ أول رقم للمعلم 1001 (ق26)، وتعارضه مع حلقة أخرى (ق3) ← 1002', async () => {
    const h = await teacherPage();
    try {
        assert.equal(await visibleText(h.page, '#teacherAddStudentBtn'), '+ طالب جديد');
        await openSheet(h, () => h.page.locator('#teacherAddStudentBtn').click());
        await h.page.fill('#tsName', 'زيد');
        await clickText(h.page, '#teacherStudentSheet', /حفظ/, 'زر الحفظ');
        await h.page.waitForTimeout(300);
        assert.equal((await h.fbLog()).filter(l => (l.writes || []).some(w => /\/students\/\d+$/.test(w.path) && w.type === 'set')).length, 0, 'أُنشئ بلا جوال ولي الأمر');
        await h.page.fill('#tsPhone', '0551234567');
        await clickText(h.page, '#teacherStudentSheet', /حفظ/, 'زر الحفظ');
        await h.page.waitForTimeout(500);
        const created = (await h.fbLog()).filter(l => l.result === 'ok' && (l.writes || []).some(w => /\/students\/\d+$/.test(w.path) && w.type === 'set'))
            .flatMap(l => l.writes.map(w => w.path.split('/').pop()));
        assert.deepEqual(created, ['1001'], `أول رقم للمعلم 1001 (ق26)؛ أُنشئ: ${JSON.stringify(created)}. ${await diagnose(h)}`);
        const s = await h.doc('programs/general/seasons/s1/students/1001');
        assert.deepEqual(Object.keys(s).sort(), [...STUDENT_KEYS].sort());
        assert.deepEqual([s.name, s.history, s.frontierBase, s.lastDailyBase, s.joinedOn, s.halaqaId, s.teacherId, s.stage, s.parentPhone, s.memorizedJuz],
            ['زيد', {}, null, null, TODAY, 'a1', 't1', 'primary', '966551234567', null]);
        assert.match(s.sid, /^[0-9a-f-]{36}$/);
        await h.page.waitForTimeout(200);
        assert.ok((await cardIds(h.page)).includes(1001), 'لم يظهر في القائمة فوراً');
    } finally { await h.close(); }
    // التعارض: الرقم 1001 لطالب في حلقة معلم آخر (لا يراه المعلم؛ قراءته مرفوضة داخل المعاملة) ← يُعاد بـ1002 ولا يُمسّ 1001.
    const other = H.makeStudent(1001, 'نايف', 'b1');
    const c = await teacherPage({ seed: { extraDocs: { 'programs/general/seasons/s1/students/1001': other } } });
    try {
        await openSheet(c, () => c.page.locator('#teacherAddStudentBtn').click());
        await c.page.fill('#tsName', 'زيد'); await c.page.fill('#tsPhone', '0551234567');
        await clickText(c.page, '#teacherStudentSheet', /حفظ/, 'زر الحفظ');
        await c.page.waitForTimeout(500);
        const log = await c.fbLog();
        assert.ok(log.some(l => l.op === 'tx.get' && l.path.endsWith('/students/1001')), 'لم يحاول الرقم 1001 أولاً');
        const created = log.filter(l => l.result === 'ok' && (l.writes || []).some(w => /\/students\/\d+$/.test(w.path) && w.type === 'set'))
            .flatMap(l => l.writes.map(w => w.path.split('/').pop()));
        assert.deepEqual(created, ['1002'], `التعارض مع 1001 ← 1002؛ أُنشئ: ${JSON.stringify(created)}. ${await diagnose(c)}`);
        assert.equal((await c.doc('programs/general/seasons/s1/students/1002'))?.name, 'زيد');
        assert.deepEqual(await c.doc('programs/general/seasons/s1/students/1001'), other, 'مُسّ طالب الحلقة الأخرى');
    } finally { await c.close(); }
});

test('و12 ✎ تعديل: النموذج نفسه بالقيم الحالية؛ التحديث name/memorizedJuz/parentPhone فقط (+ حذف tierId/tierManual)', async () => {
    const h = await teacherPage();
    try {
        await openSheet(h, () => card(h.page, 1).locator('[data-a=edit]').click());
        assert.equal(await h.page.inputValue('#tsName'), 'أحمد');
        assert.match(await h.page.inputValue('#tsPhone'), /500000001$/);
        await h.page.fill('#tsName', 'أحمد علي');
        await clickText(h.page, '#teacherStudentSheet', /حفظ/, 'زر الحفظ');
        await h.page.waitForTimeout(400);
        const w = (await studentWrites(h, 1)).flatMap(l => l.writes);
        assert.equal(w.length, 1, JSON.stringify(w));
        assert.equal(w[0].type, 'update');
        const extra = Object.keys(w[0].data).filter(k => !['name', 'memorizedJuz', 'parentPhone', 'tierId', 'tierManual'].includes(k));
        assert.deepEqual(extra, [], 'حقول زائدة في التعديل');
        for (const k of ['tierId', 'tierManual']) if (k in w[0].data) assert.deepEqual(w[0].data[k], { __sentinel: 'deleteField' });
        assert.equal((await h.doc('programs/general/seasons/s1/students/1')).name, 'أحمد علي');
        assert.ok(norm(await card(h.page, 1).innerText()).includes('أحمد علي'));
    } finally { await h.close(); }
});

test('و13 ⋯ حذف: «حذف الطالب» ← تأكيد أول بنصّه ← #tsDeleteName يساوي الاسم حرفياً ← «حذف نهائي» ← يختفي، ونسخة في المحذوفات', async () => {
    const h = await teacherPage();
    try {
        await card(h.page, 5).locator('[data-a=more]').click();
        await h.page.locator('#teacherMoreSheet').waitFor({ state: 'visible', timeout: 3000 }).catch(() => assert.fail('#teacherMoreSheet لم يظهر'));
        const n0 = h.dialogs.length;
        await clickText(h.page, '#teacherMoreSheet', /حذف الطالب/, '«حذف الطالب»');
        await h.page.waitForTimeout(200);
        const FIRST = 'حذف فهد من حلقة أُبيّ؟';
        const native = h.dialogs.slice(n0).find(d => d.message.includes(FIRST));
        if (native) assert.ok(native.message.includes('سيُمحى سجله ونقاطه'));
        else {
            const box = h.page.locator('body *').filter({ hasText: FIRST }).filter({ hasText: 'سيُمحى سجله ونقاطه' }).filter({ visible: true }).last();   // أ24: العنوان قد يصير سطرين (ص7)
            assert.ok(await box.count(), `التأكيد الأول «${FIRST} سيُمحى سجله ونقاطه.» لم يظهر`);
            assert.ok((await box.innerText()).includes('سيُمحى سجله ونقاطه'));
            const go = h.page.locator('button').filter({ hasText: /حذف|متابعة|نعم/ }).filter({ hasNotText: /إلغاء|نهائي|الطالب/ }).filter({ visible: true }).last();
            assert.ok(await go.count(), 'لا زر متابعة في التأكيد الأول');
            await go.click();
        }
        await h.page.locator('#tsDeleteName').waitFor({ state: 'visible', timeout: 3000 });
        await h.page.fill('#tsDeleteName', 'فهد ');
        const fin = h.page.locator('button').filter({ hasText: /^\s*حذف نهائي\s*$/ }).filter({ visible: true }).first();
        assert.ok(await fin.count(), 'زر «حذف نهائي» غائب');
        if (await fin.isEnabled()) await fin.click();
        await h.page.waitForTimeout(300);
        assert.ok(await h.doc('programs/general/seasons/s1/students/5'), 'حُذف باسم غير مطابق حرفياً');
        await h.page.fill('#tsDeleteName', 'فهد');
        await fin.click();
        await h.page.waitForTimeout(500);
        assert.equal(await h.doc('programs/general/seasons/s1/students/5'), undefined, 'لم يُحذف');
        const copy = await h.doc('programs/general/seasons/s1/deletedStudents/sid-5');
        assert.ok(copy && copy.studentId === '5' && copy.deletedBy === 'teacher-uid' && copy.deletedAt?.__serverTime, JSON.stringify(copy));
        assert.equal(await card(h.page, 5).count(), 0, 'البطاقة باقية');
    } finally { await h.close(); }
});

test('و13 المشرف: صفحة الطلاب فيها «المحذوفات (n)» ← القائمة بالاسم و«استعادة» ← يعود الطالب وتُحذف النسخة', async () => {
    const copyDoc = { ...H.makeStudent(9, 'زياد', 'a1'), studentId: '9', deletedBy: 'teacher-uid', deletedAt: { __serverTime: 5 } };
    const a = await adminPage({ seed: { extraDocs: { 'programs/general/seasons/s1/deletedStudents/sid-9': copyDoc } } });
    try {
        await a.page.evaluate(() => switchTab('page-students', document.querySelector('nav [onclick*="page-students"]')));
        await a.page.waitForTimeout(300);
        const btn = a.page.locator('#page-students button').filter({ hasText: /المحذوفات\s*\(1\)/ }).first();
        assert.ok(await btn.count(), 'زر «المحذوفات (1)» غائب من صفحة الطلاب');
        await btn.click();
        await a.page.waitForTimeout(300);
        assert.ok(await a.page.locator('body *').filter({ hasText: 'زياد' }).filter({ visible: true }).count(), 'الاسم غائب من قائمة المحذوفات');
        await a.page.locator('button').filter({ hasText: /^\s*استعادة\s*$/ }).filter({ visible: true }).first().click();
        await a.page.waitForTimeout(600);
        const { studentId, deletedBy, deletedAt, ...expected } = copyDoc;
        assert.deepEqual(await a.doc('programs/general/seasons/s1/students/9'), expected);
        assert.equal(await a.doc('programs/general/seasons/s1/deletedStudents/sid-9'), undefined);
    } finally { await a.close(); }
});

test('و14 يوم عطلة / خارج الموسم ← لا بطاقات ورسالة وسطية «اليوم عطلة؛ لا تسجيل»', async () => {
    for (const [label, seed] of [['عطلة', { holiday: true }], ['خارج الموسم', { outOfSeason: true }]]) {
        const h = await teacherPage({ seed });
        try {
            await h.page.waitForTimeout(300);
            assert.ok((await visibleText(h.page, '#teacherHome')).includes('اليوم عطلة؛ لا تسجيل'), label);
            assert.equal(await h.page.locator('.teacher-card').count(), 0, label + ': بطاقات ظاهرة');
        } finally { await h.close(); }
    }
});

test('و14/خ7 لا اتصال: شريط #teacherOffline بنصّه ويختفي عند العودة؛ «حُفظ» لا تظهر إلا بعد رد الخادم', async () => {
    const h = await teacherPage();
    try {
        await h.context.setOffline(true);
        await h.page.evaluate(() => window.dispatchEvent(new Event('offline')));
        await h.page.locator('#teacherOffline').waitFor({ state: 'visible', timeout: 3000 }).catch(() => assert.fail('#teacherOffline لم يظهر'));
        assert.equal(await visibleText(h.page, '#teacherOffline'), 'لا اتصال بالإنترنت؛ لن يُحفظ شيء حتى يعود');
        await h.context.setOffline(false);
        await h.page.evaluate(() => window.dispatchEvent(new Event('online')));
        await h.page.waitForTimeout(200);
        assert.equal(await h.page.locator('#teacherOffline').isVisible().catch(() => false), false, 'الشريط باقٍ بعد العودة');
        await h.page.evaluate(() => window.__fb.setHold());
        await openAch(h, 1); await fillNew(h.page); await fillReview(h.page); await pressSave(h.page);
        await h.page.waitForTimeout(600);
        const early = await h.page.locator('#teacherToast').isVisible().catch(() => false) ? await visibleText(h.page, '#teacherToast') : '';
        assert.ok(!early.includes('حُفظ'), '«حُفظ» ظهرت قبل رد الخادم');
        await h.page.evaluate(() => window.__fb.release());
        await h.page.locator('#teacherToast').filter({ hasText: 'حُفظ لأحمد' }).waitFor({ state: 'visible', timeout: 4000 });
    } finally { await h.close(); }
});

for (const width of [390, 1280]) test(`و15 التصميم على ${width}: لا تمرير أفقي، أزرار ≥ 44، أرقام 0-9، لا لاتيني ظاهر، خط Cairo — الصفحة والنافذة ونموذج الإضافة`, async () => {
    const h = await teacherPage({ width, height: width === 390 ? 844 : 900 });
    try {
        const check = async (label, scopes) => {
            const r = await layoutMetrics(h.page, width, scopes);
            assert.ok(r.sw <= width, `${label}: تمرير أفقي ${r.sw}`);
            assert.deepEqual(r.small, [], `${label}: أزرار < 44`);
            assert.equal(r.indic, 0, `${label}: أرقام هندية`);
            assert.deepEqual(r.latin, [], `${label}: لاتيني ظاهر`);
            assert.ok(r.fonts.length && r.fonts.every(f => /^["']?Cairo/.test(f)), `${label}: الخط ${JSON.stringify(r.fonts)}`);
        };
        await check('الصفحة', ['#teacherHome']);
        await openAch(h, 1);
        await check('نافذة الإنجاز', ['#smartModal']);
        await h.page.evaluate(() => closeSmartModal(true));
        await openSheet(h, () => h.page.locator('#teacherAddStudentBtn').click());
        await check('نموذج الإضافة', ['#teacherStudentSheet']);
    } finally { await h.close(); }
});

test('ل2 (§3-8ج-4) جهاز المشرف: لا احتفال عند أول تحميل؛ تسجيل جديد من جهاز آخر ← احتفال واحد؛ لقطة لاحقة لا تكرّره', async () => {
    const a = await adminPage();
    try {
        await a.page.waitForTimeout(300);
        assert.deepEqual(await a.page.evaluate(() => window.__spy.celebrations), [], 'احتفال عند أول تحميل');
        await a.page.evaluate(today => {
            const p = 'programs/general/seasons/s1/students/1', s = window.__fb.get(p);
            s.history[today] = { attended: true, entries: { e_remote_1: { kind: 'new', grade: 'excellent', spec: { from: [2, 6], to: [2, 10] }, rep: 1, points: 4, at: 5, by: 'teacher-uid', heardBy: 't1' } } };
            window.__fb.set(p, s);
        }, TODAY);
        await a.page.waitForTimeout(400);
        assert.deepEqual(await a.page.evaluate(() => window.__spy.celebrations), [1], 'احتفال واحد للطالب 1');
        await a.page.evaluate(() => { const p = 'programs/general/seasons/s1/students/6', s = window.__fb.get(p); s.name = 'عمر ب'; window.__fb.set(p, s); });
        await a.page.waitForTimeout(400);
        assert.deepEqual(await a.page.evaluate(() => window.__spy.celebrations), [1], 'تكرر الاحتفال');
    } finally { await a.close(); }
});

test('§3-8ج-3 المشرف: ensureTeacherKey يولّد الرمز ويكتب teacherKeys، teacherLoginLink = <origin>/?k=<code>، rotateTeacherKey يغيّره', async () => {
    const a = await adminPage();
    try {
        const fns = await a.page.evaluate(() => ['ensureTeacherKey', 'rotateTeacherKey', 'teacherLoginLink'].filter(n => typeof window[n] !== 'function'));
        assert.deepEqual(fns, [], 'دوال غير معرّفة في index.html');
        assert.equal(await a.page.evaluate(() => teacherLoginLink('t1.ABCDEFGHJK23')), 'http://almahra.test/?k=t1.ABCDEFGHJK23');
        await a.page.evaluate(() => window.__fb.del('programs/general/teacherKeys/t2'));
        await a.page.evaluate(() => ensureTeacherKey('t2'));
        await a.page.waitForTimeout(300);
        const k = await a.doc('programs/general/teacherKeys/t2');
        assert.ok(k, 'لم يُكتب teacherKeys/t2');
        const m = /^(.+)\.([A-Z0-9]{12})$/.exec(k.code || '');   // ق23
        assert.ok(m, `صيغة الرمز: ${k.code}`);
        assert.doesNotMatch(m[2], /[0O1I]/, 'حروف ملتبسة');
        assert.equal(m[1], 't2', `الجزء قبل آخر نقطة يجب أن يعيد teacherId نفسه (signInTeacherWithCode يشتقه منه): ${m[1]}`);
        assert.deepEqual([k.halaqaIds, k.active, !!k.createdAt?.__serverTime], [['b1'], true, true]);
        await a.page.evaluate(() => ensureTeacherKey('t2'));
        await a.page.waitForTimeout(200);
        assert.equal((await a.doc('programs/general/teacherKeys/t2')).code, k.code, 'ensureTeacherKey غيّر رمزاً موجوداً');
        await a.page.evaluate(() => rotateTeacherKey('t2'));
        await a.page.waitForTimeout(300);
        const k2 = await a.doc('programs/general/teacherKeys/t2');
        assert.notEqual(k2.code, k.code, 'rotateTeacherKey لم يغيّر الرمز');
        assert.match(k2.code, /^t2\.[A-HJ-NP-Z2-9]{12}$/);
    } finally { await a.close(); }
});

test('ص7 (يبقى) حساب بلا دور ← شاشة الدخول برسالة «حسابك ليس له صلاحيات في البرنامج. اتصل بالمشرف.»', async () => {
    const h = await H.openPage(browser, { user: { uid: 'norole-uid', isAnonymous: false, email: 'x@test', providerId: 'password' } });
    try {
        await h.page.waitForFunction(() => document.getElementById('loginError')?.innerText.includes('حسابك ليس له صلاحيات'), null, { timeout: 5000 });
        assert.equal(await visibleText(h.page, '#loginError'), 'حسابك ليس له صلاحيات في البرنامج. اتصل بالمشرف.');
        await shot(h.page, 'ص7-حساب-بلا-دور-390');
    } finally { await h.close(); }
});

// =====================================================================================
// (ج) أ3 — اختبارات حارسة (البطاقة §3-13 ق51/ق52؛ تقرير المراجع ف3 والطفرات الناجية M16/M19/M21/M28/M30/M31/M37)، 2026-11-16.
// كل اختبار يتحقق من الأثر (DOM/الكتابات/الرسائل) لا من عدم الرمي. ح7 أحمر حتى يبني الباني ق51.
// =====================================================================================
const REVOKED_MSG = 'الرمز غير صحيح أو أُبطل؛ اطلب الرابط من المشرف';
const mineToday = async (h, id) => Object.values((await h.doc('programs/general/seasons/s1/students/' + id))?.history?.[TODAY]?.entries || {}).filter(e => e.by === 'teacher-uid');
async function saveBoth(h, id, name) {
    await openAch(h, id); await fillNew(h.page); await fillReview(h.page); await pressSave(h.page);
    await h.page.locator('#teacherToast').filter({ hasText: 'حُفظ ل' + name }).waitFor({ state: 'visible', timeout: 4000 })
        .catch(async () => assert.fail(`حفظ ${name}: «حُفظ ل${name}» لم تظهر. ${await diagnose(h)}`));
}

test('ح1 (ن11/ق31، ق50/ق53) جلسة معلم محفوظة ورمزه أُبطل (teacherKeys.code تغيّر) ← عند التحميل: خروج + إعادة تحميل واحدة + شاشة الدخول برسالة الإبطال (علامة sessionStorage)، لا «تعذّر التحميل» ولا حلقة', async () => {
    // users/teacher-uid يحمل الرمز القديم t1.ABCDEFGHJK23، والمفتاح الحي صار رمزاً آخر ← أول قراءة لـprograms/general تُرفض.
    // carry 'all': الخروج يثبت عبر إعادة التحميل (كفايربيس الحقيقي) ← الرسالة من العلامة وحدها.
    // carry 'logs': الجلسة المزروعة تعود بعد إعادة التحميل (خروج لم يثبت) ← حارس الحلقة: رفض ثانٍ بلا إعادة تحميل أخرى.
    for (const [carry, seq] of [['all', ['pageLoad:1', 'signOut:teacher-uid', 'pageLoad:2']],
        ['logs', ['pageLoad:1', 'signOut:teacher-uid', 'pageLoad:2', 'signOut:teacher-uid']]]) {
        const h = await H.openPage(browser, { user: H.TEACHER_USER, carry, seed: { teacherUser: true, teacherKey: { code: 't1.NEWKEYXYZW23', halaqaIds: ['m1', 'a1'], active: true } } });
        try {
            await h.page.waitForFunction(msg => document.getElementById('loginError')?.innerText.trim() === msg && document.getElementById('loginError').getClientRects().length > 0,
                REVOKED_MSG, { timeout: 6000 }).catch(async () => assert.fail(`${carry}: رسالة الإبطال لم تظهر في #loginError خلال 6 ث. ${await diagnose(h)}`));
            await h.page.waitForTimeout(1000);   // لا حلقة: لا تحميل ثالث خلال ثانية
            assert.equal(await h.page.locator('#loginOverlay').isVisible(), true, carry + ': شاشة الدخول غير ظاهرة');
            assert.equal(await h.page.evaluate(() => document.getElementById('loginError')?.innerText.trim()), REVOKED_MSG, carry + ': الرسالة اختفت');
            const st = await h.page.evaluate(() => ({ user: window.__fb.currentUser, loads: window.__fb.loads, nav: performance.getEntriesByType('navigation')[0]?.type,
                flag: sessionStorage.getItem('almahra-teacher-denied'),
                seq: window.__fb.authLog.filter(l => l.op === 'signOut' || l.op === 'pageLoad').map(l => l.op + ':' + (l.n ?? l.uid)) }));
            assert.equal(st.user, null, carry + ': الجلسة المحفوظة باقية (لم يخرج)');
            assert.deepEqual([st.loads, st.nav], [2, 'reload'], carry + ': المتوقع إعادة تحميل واحدة بالضبط');
            assert.deepEqual(st.seq, seq, carry + ': ترتيب الخروج وإعادة التحميل');
            assert.equal(st.flag, null, carry + ': علامة الإبطال لم تُمسح من sessionStorage');
            const log = await h.fbLog();
            assert.ok(log.some(l => /^getDoc/.test(l.op) && l.path === 'programs/general' && l.uid === 'teacher-uid'), carry + ': لم تُقرأ programs/general بهوية المعلم (المسار المختبَر لم يحدث)');
            assert.equal(await h.page.locator('#teacherHome').filter({ visible: true }).count(), 0, carry + ': صفحة المعلم ظاهرة بعد الإبطال');
            assert.ok(!(await h.page.evaluate(() => document.body.innerText)).includes('تعذّر التحميل'), carry + ': «تعذّر التحميل» ظاهرة بدل رسالة الإبطال');
        } finally { await h.close(); }
    }
});

test('ح2 قائمة بحث السورة مفتوحة + Enter ← تُختار السورة، ولا يُحفظ شيء، ولا يظهر تأكيد', async () => {
    const h = await teacherPage();
    try {
        await openAch(h, 1); await fillNew(h.page); await fillReview(h.page);   // المدخلات صالحة للحفظ (القسمان مؤكَّدان): لو مرّ Enter إلى الحفظ لكُتب الطالب
        await H.openSec(h.page, 'new');   // أ14: قسم الجديد بدل تبويبه
        const n0 = h.dialogs.length;
        await h.page.locator('#quick_new_toSurah_search').fill('آل عمران');
        assert.equal(await h.page.locator('#quick_new_toSurah_list').isVisible(), true, 'قائمة بحث السورة لم تُفتح');
        await h.page.locator('#quick_new_toSurah_search').press('Enter');
        await h.page.waitForTimeout(500);
        assert.equal(await h.page.inputValue('#quick_new_toSurah'), '3', 'Enter لم يختر «آل عمران»');
        assert.equal(await h.page.locator('#quick_new_toSurah_list').isVisible(), false, 'القائمة بقيت مفتوحة');
        assert.deepEqual((await studentWrites(h, 1)).map(l => l.op), [], 'Enter مع القائمة المفتوحة حفظ الطالب');
        assert.equal(await h.page.locator('#smartModal').isVisible(), true, 'النافذة أُغلقت (حفظ)');
        const text = await visibleText(h.page, '#smartModal');
        for (const msg of ['حفظ الجديد فقط؟', 'حفظ المراجعة فقط؟']) assert.ok(!text.includes(msg), `ظهر التأكيد «${msg}»`);
        assert.deepEqual(await H.quickSheets(h.page), [], 'ظهرت ورقة تأكيد (ق78)');   // أ14: التأكيد صار ورقة
        assert.deepEqual(h.dialogs.slice(n0), [], 'ظهر حوار أصلي');
        assert.equal(await h.page.locator('#teacherToast').count(), 0, 'ظهرت رسالة حفظ');
    } finally { await h.close(); }
});

test('ح3 (ق2) ✎ التعديل يرسل name/memorizedJuz/parentPhone + حذف tierId وtierManual (DEL_FIELD)، ولا شيء غيرها', async () => {
    const s1 = H.makeStudent(1, 'أحمد', 'a1', { tierId: 'tier-gold', tierManual: true });
    const h = await teacherPage({ seed: { extraDocs: { 'programs/general/seasons/s1/students/1': s1 } } });
    try {
        await openSheet(h, () => card(h.page, 1).locator('[data-a=edit]').click());
        await h.page.fill('#tsName', 'أحمد علي');
        await clickText(h.page, '#teacherStudentSheet', /حفظ/, 'زر الحفظ');
        await h.page.waitForTimeout(400);
        const w = (await studentWrites(h, 1)).flatMap(l => l.writes);
        assert.equal(w.length, 1, JSON.stringify(w));
        assert.equal(w[0].type, 'update');
        assert.deepEqual(Object.keys(w[0].data).sort(), ['memorizedJuz', 'name', 'parentPhone', 'tierId', 'tierManual'], 'مفاتيح التعديل');
        assert.deepEqual([w[0].data.tierId, w[0].data.tierManual], [{ __sentinel: 'deleteField' }, { __sentinel: 'deleteField' }], 'tierId/tierManual ليسا DEL_FIELD');
        assert.deepEqual([w[0].data.name, w[0].data.memorizedJuz, w[0].data.parentPhone], ['أحمد علي', 2, '966500000001']);
        const after = await h.doc('programs/general/seasons/s1/students/1');
        assert.deepEqual([after.name, 'tierId' in after, 'tierManual' in after], ['أحمد علي', false, false], 'الشريحة باقية في المستند');
    } finally { await h.close(); }
});

test('ح4 (ق30) يوم عطلة: «الإنجاز» (openSmartModal معالج الزر) لا يفتح النافذة وتظهر «اليوم عطلة؛ لا تسجيل»', async () => {
    const h = await teacherPage({ seed: { holiday: true } });
    try {
        await h.page.waitForFunction(() => typeof students !== 'undefined' && students.some(s => s.id === 1), null, { timeout: 5000 })
            .catch(async () => assert.fail('طلاب الحلقة لم يُحمَّلوا يوم العطلة. ' + await diagnose(h)));
        assert.equal(await h.page.locator('.teacher-card').count(), 0, 'بطاقات ظاهرة يوم العطلة (و14)');
        // البطاقات لا تُرسم يوم العطلة؛ فيُستدعى معالج زر «الإنجاز» نفسه (openSmartModal(id)) كما لو بقيت بطاقة من قبل منتصف الليل.
        await h.page.evaluate(() => openSmartModal(1));
        await h.page.waitForTimeout(200);
        assert.equal(await h.page.locator('#smartModal').isVisible(), false, 'النافذة فُتحت يوم العطلة');
        assert.equal(await h.page.evaluate(() => document.getElementById('toastText')?.innerText.trim()), 'اليوم عطلة؛ لا تسجيل', 'رسالة العطلة');
        assert.equal(await h.page.locator('#toastMessage').isVisible(), true, 'الرسالة غير ظاهرة');
        assert.deepEqual((await h.fbLog()).filter(l => l.writes).map(l => l.op), [], 'كتابة يوم العطلة');
    } finally { await h.close(); }
});

// مراقب BroadcastChannel يُحقن قبل سكربتات الصفحة: يسجّل كل قناة تُنشأ وإغلاقها وكل رسالة ترسلها الصفحة.
const BC_MONITOR = () => {
    const Native = window.BroadcastChannel;
    window.__bc = { made: [], posts: [], tvGot: [] };
    window.__NativeBC = Native;
    if (!Native) return;
    window.BroadcastChannel = class extends Native {
        constructor(name) { super(name); this.__rec = { name: String(name), closed: false }; window.__bc.made.push(this.__rec); }
        postMessage(message) { window.__bc.posts.push({ name: this.__rec.name, type: message?.type ?? null }); return super.postMessage(message); }
        close() { this.__rec.closed = true; return super.close(); }
    };
};
test('ح5 (ق44 ب) وضع المعلم: قناة التلفاز مغلقة، وتلفاز يقول «hello» لا يستقبل شيئاً، ولا رسالة احتفال عند الحفظ', async () => {
    const h = await teacherPage({ initScripts: [BC_MONITOR] });
    try {
        const pre = await h.page.evaluate(() => ({ made: window.__bc.made.filter(c => c.name === 'almahra-tv'), channel: generalTv.channel === null, enabled: generalTv.enabled }));
        assert.ok(pre.made.length >= 1, 'لم تُنشأ قناة almahra-tv أصلاً (المراقب لم يعمل)');
        assert.deepEqual(pre.made.filter(c => !c.closed), [], 'قناة التلفاز مفتوحة على جهاز المعلم');
        assert.deepEqual([pre.channel, pre.enabled], [true, false], 'generalTv.channel ليست null أو التلفاز مفعَّل');
        // تلفاز في الجهاز نفسه يطلب البث كما يفعل tv.js
        await h.page.evaluate(() => { const tv = new window.__NativeBC('almahra-tv'); tv.onmessage = e => window.__bc.tvGot.push(e.data?.type ?? null); window.__tv = tv; tv.postMessage({ type: 'hello' }); });
        await h.page.waitForTimeout(300);
        await saveBoth(h, 1, 'أحمد');
        await h.page.waitForTimeout(400);
        assert.equal((await mineToday(h, 1)).length, 2, 'الحفظ لم يكتب (الشرط المسبق)');
        const r = await h.page.evaluate(() => ({ posts: window.__bc.posts, tvGot: window.__bc.tvGot, open: window.__bc.made.filter(c => c.name === 'almahra-tv' && !c.closed).length, enabled: generalTv.enabled }));
        assert.deepEqual(r.posts, [], 'جهاز المعلم أرسل على قناة');
        assert.deepEqual(r.tvGot, [], 'التلفاز استقبل رسائل من جهاز المعلم');
        assert.deepEqual([r.open, r.enabled], [0, false], 'قناة التلفاز فُتحت أو فُعِّل البث بعد «hello»');
    } finally { await h.close(); }
});

// أ29 (ق189–ق190، الجولة 5، 2026-11-20): كان «تراجع» من الرسالة ونافذة ب مفتوحة يمسّ أ لا ب (ق66/ق93-6)، وكان ينتظر اختفاء رسالة ب بالوقت (detached 7 ث).
// هذا السيناريو لم يعد ممكناً: فتح أي نافذة يزيل الرسالة، والرسالة لا تختفي بالوقت. صار: فتح ب يزيل الرسالة، والتراجع عن أ من «سُجّل اليوم» في نافذة أ يمسّ أ لا ب.
test('ح6 (ق43، ق190) بعد حفظ الطالب أ، فتح الطالب ب يزيل #teacherToast؛ والتراجع عن أ من «سُجّل اليوم … تراجع» داخل نافذة أ يمسّ تسجيل أ لا ب', async () => {
    const h = await teacherPage();
    try {
        await saveBoth(h, 5, 'فهد');      // ب: له تسجيلان من هذا الجهاز
        await saveBoth(h, 1, 'أحمد');     // أ: آخر حفظ، والرسالة له (فتح نافذة أ أزال رسالة ب)
        await closeQuick(h);
        assert.deepEqual([(await mineToday(h, 1)).length, (await mineToday(h, 5)).length], [2, 2], 'الشرط المسبق');
        await openAch(h, 5);              // فتح ب والرسالة ظاهرة
        const left = await h.page.locator('#teacherToast').count() ? await visibleText(h.page, '#teacherToast') : '';
        assert.equal(left, '', `فتح نافذة ب لم يُزل الرسالة (ق190): «${left}»`);
        await closeQuick(h);
        await openAch(h, 1);              // التراجع عن أ من صندوقه
        await clickText(h.page, '#quickTodayBox', /تراجع/, 'زر التراجع في #quickTodayBox لأحمد');
        await h.page.waitForTimeout(600);
        assert.deepEqual([(await mineToday(h, 1)).length, (await mineToday(h, 5)).length], [1, 2], 'التراجع لم يمسّ أ وحده (أ، ب)');
    } finally { await h.close(); }
});

async function sheetSmallButtons(h, id) {
    await h.page.locator('#' + id).waitFor({ state: 'visible', timeout: 3000 }).catch(async () => assert.fail(`#${id} لم يظهر. ${await diagnose(h)}`));
    return h.page.$$eval('#' + id + ' button', bs => {
        const vis = bs.filter(b => b.getClientRects().length && getComputedStyle(b).visibility !== 'hidden');
        return { count: vis.length, small: vis.map(b => ({ t: b.innerText.trim(), h: Math.round(b.getBoundingClientRect().height * 10) / 10 })).filter(x => x.h < 44) };
    });
}
test('ح7 (ق51) أزرار أوراق المعلم كلها ≥ 44 على 360 و390: الغياب، المساعدة، تأكيد الحذف، الطالب، ⋯', async () => {
    const all = {};
    for (const width of [360, 390]) all[width] = await sheetButtonsAt(width);
    const small = Object.fromEntries(Object.entries(all).filter(([, s]) => Object.keys(s).length));
    assert.deepEqual(small, {}, 'أزرار أقل من 44 (العرض ← الورقة ← [النص، الارتفاع])');
});
async function sheetButtonsAt(width) {
    const h = await teacherPage({ width, height: 800 });
    try {
        const out = {};
        await h.page.locator('#teacherHelpBtn').click();
        out.teacherHelpSheet = await sheetSmallButtons(h, 'teacherHelpSheet');
        await h.page.locator('#teacherHelpSheet button').first().click();
        await card(h.page, 1).locator('[data-a=absent]').click();
        out.teacherAbsenceSheet = await sheetSmallButtons(h, 'teacherAbsenceSheet');
        await h.page.locator('#teacherAbsenceSheet [data-cancel]').click();
        await h.page.locator('#teacherAddStudentBtn').click();
        out.teacherStudentSheet = await sheetSmallButtons(h, 'teacherStudentSheet');
        await h.page.locator('#teacherStudentSheet [data-cancel]').click();
        await card(h.page, 5).locator('[data-a=more]').click();
        out.teacherMoreSheet = await sheetSmallButtons(h, 'teacherMoreSheet');
        await clickText(h.page, '#teacherMoreSheet', /حذف الطالب/, '«حذف الطالب»');
        // ب11-ف2: التأكيد الأول ورقة #teacherDeleteAskSheet (من أوراق المعلم، داخل ق51) ثم «متابعة» ← ورقة الاسم.
        out.teacherDeleteAskSheet = await sheetSmallButtons(h, 'teacherDeleteAskSheet');
        await h.page.locator('#teacherDeleteAskSheet [data-go]').click();
        out.teacherDeleteSheet = await sheetSmallButtons(h, 'teacherDeleteSheet');
        await h.page.locator('#teacherDeleteSheet [data-cancel]').click();
        assert.ok(await h.doc('programs/general/seasons/s1/students/5'), 'الطالب 5 حُذف أثناء الفحص');
        for (const [id, r] of Object.entries(out)) assert.ok(r.count >= 1, `#${id}: لا أزرار ظاهرة`);
        return Object.fromEntries(Object.entries(out).filter(([, r]) => r.small.length).map(([id, r]) => [id, r.small]));
    } finally { await h.close(); }
}

// أ5 (ق58، ق54): ح8 الرسالة لا تلتقط اللمس؛ ح9 زرّا الانضباط مرة واحدة في كل فتحة للنافذة.
// أ29 (ق190، الجولة 5، 2026-11-20): كان النصف الثاني «النافذة مفتوحة والرسالة ظاهرة: نصّها لا يلتقط، والنقر في وسط «حفظ» خلال الثواني الست يحفظ».
// هذا لم يعد ممكناً: فتح نافذة الطالب التالي يزيل الرسالة. صار: النافذة مغلقة كما كان (pointer-events)، وفتح التالي يزيل الرسالة فلا شيء فوق «حفظ»، والنقر في وسطه يحفظ.
test('ح8 (ق54، ق190) #teacherToast لا تلتقط اللمس: نقطة نصّها تصيب ما تحتها والنافذة مغلقة؛ وفتح الطالب التالي يزيل الرسالة، والنقر في وسط «حفظ» يحفظ', async () => {
    const h = await teacherPage();
    try {
        await saveBoth(h, 1, 'أحمد');
        await closeQuick(h);
        const hit = () => h.page.evaluate(() => {
            const t = document.getElementById('teacherToast'), span = t?.querySelector('span');
            if (!span) return null;
            const r = span.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, el = document.elementFromPoint(x, y);
            return { inToast: !!el && t.contains(el), at: el ? (el.id ? '#' + el.id : el.tagName + '.' + el.className) : null };
        });
        const closedHit = await hit();
        assert.ok(closedHit, '#teacherToast غائبة بعد الحفظ');
        assert.equal(closedHit.inToast, false, `النافذة مغلقة: نص الرسالة يلتقط اللمس (${closedHit.at})`);
        await openAch(h, 5); await fillNew(h.page); await fillReview(h.page);
        await h.page.evaluate(() => typeof updateGeneralQuickPreview === 'function' && updateGeneralQuickPreview());
        const openLeft = await h.page.locator('#teacherToast').count() ? await visibleText(h.page, '#teacherToast') : '';
        assert.equal(openLeft, '', `فتح نافذة الطالب التالي لم يُزل الرسالة (ق190): «${openLeft}»`);
        const box = await h.page.locator('#generalQuickSaveBtn').boundingBox();
        const atSave = await h.page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return !!el?.closest('#generalQuickSaveBtn'); }, [box.x + box.width / 2, box.y + box.height / 2]);
        assert.equal(atSave, true, 'شيء فوق وسط زر «حفظ»');
        await h.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);   // نقرة حقيقية بالإحداثيات
        await h.page.locator('#teacherToast').filter({ hasText: 'حُفظ لفهد' }).waitFor({ state: 'visible', timeout: 4000 })
            .catch(async () => assert.fail('النقر في وسط «حفظ» لم يحفظ. ' + await diagnose(h)));
        assert.equal((await mineToday(h, 5)).length, 2, 'لم يُكتب الطالب التالي');
    } finally { await h.close(); }
});

test('ح9 (ق58) فتح نافذة الإنجاز لثلاثة طلاب متتاليين ← «استوفى المعايير» و«التحضير المنزلي» زر واحد من كلٍّ في كل فتحة', async () => {
    const h = await teacherPage();
    try {
        const seen = [];
        for (const id of [1, 5, 4]) {
            await openAch(h, id);
            await H.openSec(h.page, 'behavior');   // أ14: الزرّان داخل قسم السلوك (ق84 مستوعَب في ق90)
            seen.push(await h.page.evaluate(() => {
                const vis = sel => [...document.querySelectorAll(sel)].filter(e => e.getClientRects().length);
                const by = text => vis('#smartModal button').filter(b => b.innerText.trim() === text).length;
                return [document.querySelectorAll('#quickDisciplineAll').length, document.querySelectorAll('#quickDisciplineHome').length,
                    document.querySelectorAll('.tch-quick-actions').length, by('استوفى المعايير'), by('التحضير المنزلي')];
            }));
            await h.page.evaluate(() => closeSmartModal(true));
        }
        assert.deepEqual(seen, [[1, 1, 1, 1, 1], [1, 1, 1, 1, 1], [1, 1, 1, 1, 1]],
            'لكل فتحة: [#quickDisciplineAll، #quickDisciplineHome، الشريط، «استوفى المعايير» ظاهراً، «التحضير المنزلي» ظاهراً]');
    } finally { await h.close(); }
});

// أ6 (ق59–ق61، تقرير المحاكي teacher-ui-emu-out.md ع1/ع2 وملاحظة الجوال): ح10 الرابط الجديد مع جلسة قديمة؛ ح11 كل مسارات الكتابة بعد الإبطال؛ ح12 الجوال في ✎.
const NEW_CODE = 't1.NEWKEYXYZW23';
test('ح10 (ق60، ع2) جلسة معلم بالرمز المبطَل + فتح /?k=<الرمز الجديد> ← يدخل من أول تحميل بالهوية نفسها؛ وجلسة مشرف + رابط معلم ← خروج ثم دخول مجهول ثم الصفحة', async () => {
    // (1) الجوال يحمل جلسة t1 القديمة (users/teacher-uid.code = الرمز القديم)، والمشرف ضغط «رمز جديد».
    // كل جزء يُفحص ويُسجَّل حاله، ثم يُحكم على الاثنين معاً (ليظهر الحال الحرفي لكل جزء).
    const fails = [];
    try {
        // كتابة users أبطأ من القراءة (كالشبكة الحقيقية في المحاكي): تُمسك الكتابات 400 م.ث من أول التحميل الأول، فيُرفض boot بالجلسة القديمة قبل اكتمال تحديث الرمز (ع2 حرفياً).
        const SLOW_FIRST_WRITE = () => { if (window.__fb.loads === 1) { window.__fb.setHold(); setTimeout(() => window.__fb.release(), 400); } };
        const h = await H.openPage(browser, { user: H.TEACHER_USER, carry: 'all', url: '/?k=' + NEW_CODE, initScripts: [SLOW_FIRST_WRITE],
            seed: { teacherUser: true, teacherKey: { code: NEW_CODE, halaqaIds: ['m1', 'a1'], active: true } } });
        try {
            await h.page.locator('#teacherHome').waitFor({ state: 'attached', timeout: 7000 })
                .catch(async () => assert.fail(`(1) الرابط الجديد لم يُدخل من أول تحميل. ${await diagnose(h)}`));
            await h.page.waitForTimeout(800);   // لا خروج ولا إعادة تحميل لاحقة
            const st = await h.page.evaluate(code => ({ loads: window.__fb.loads, user: window.__fb.currentUser?.uid || null,
                anon: window.__fb.authLog.filter(l => l.op === 'signInAnonymously').length, outs: window.__fb.authLog.filter(l => l.op === 'signOut').length,
                login: !!document.getElementById('loginOverlay')?.getClientRects().length && getComputedStyle(document.getElementById('loginOverlay')).display !== 'none',
                err: document.getElementById('loginError')?.innerText.trim() || '', home: !!document.getElementById('teacherHome'),
                pending: Object.keys(sessionStorage).filter(k => String(sessionStorage.getItem(k)).includes(code.split('.')[1])) }), NEW_CODE);
            // «لا دخول جديد» = الهوية نفسها: signInAnonymously على هوية مجهولة قائمة يعيدها كما في فايربيس الحقيقي، فالمعيار الهوية لا عدد الاستدعاءات.
            assert.deepEqual([st.loads, st.outs, st.user], [1, 0, 'teacher-uid'], '(1) [التحميلات، الخروج، الهوية]: المتوقع تحميل واحد بلا خروج بالهوية نفسها');
            assert.deepEqual([st.login, st.err, st.home], [false, '', true], '(1) [شاشة الدخول، الرسالة، صفحة المعلم]');
            assert.deepEqual(st.pending, [], '(1) الرمز المعلّق باقٍ في sessionStorage');
            assert.equal((await h.doc('users/teacher-uid'))?.code, NEW_CODE, '(1) users/teacher-uid.code لم يُحدَّث إلى الرمز الجديد');
            assert.equal(await h.doc('users/anon-1'), undefined, '(1) أُنشئت هوية جديدة');
            assert.doesNotMatch(h.page.url(), /[?&]k=/, '(1) الرمز باقٍ في العنوان');
            assert.equal(await h.page.locator('#teacherHalaqaTabs button').count(), 2, '(1) التبويبان');
        } finally { await h.close(); }
    } catch (e) { fails.push('(1) ' + e.message.split('\n')[0]); }
    try {
        // (2) جلسة مشرف بالبريد على الجهاز + رابط معلم صالح.
        const a = await H.openPage(browser, { user: H.ADMIN_USER, carry: 'all', url: '/?k=' + H.TEACHER_CODE, seed: {} });
        try {
            await a.page.locator('#teacherHome').waitFor({ state: 'attached', timeout: 7000 })
                .catch(async () => assert.fail(`(2) رابط المعلم مع جلسة مشرف لم يفتح صفحة المعلم. ${await diagnose(a)}`));
            await a.page.waitForTimeout(500);
            const seq = await a.page.evaluate(() => window.__fb.authLog.filter(l => ['signOut', 'signInAnonymously'].includes(l.op)).map(l => l.op + (l.uid ? ':' + l.uid : '')));
            assert.deepEqual(seq.slice(0, 2), ['signOut:admin-uid', 'signInAnonymously'], `(2) الترتيب: خروج المشرف ثم دخول مجهول؛ الظاهر ${JSON.stringify(seq)}`);
            assert.deepEqual(await a.doc('users/anon-1'), { role: 'teacher', programId: 'general', teacherId: 't1', code: H.TEACHER_CODE }, '(2) users للهوية المجهولة');
            assert.deepEqual(await a.page.evaluate(() => [window.__fb.currentUser?.isAnonymous, window.almahraAuth?.currentRole, document.body.classList.contains('teacher-mode')]),
                [true, 'teacher', true], '(2) [مجهول، الدور، وضع المعلم]');
            assert.equal(await a.page.locator('#teacherHalaqaTabs button').count(), 2, '(2) التبويبان');
        } finally { await a.close(); }
    } catch (e) { fails.push('(2) ' + e.message.split('\n')[0]); }
    assert.deepEqual(fails, [], 'أجزاء ح10 الحمراء');
});

test('ح11 (ق59، ع1) بعد إبطال الرمز أثناء الجلسة (بلا قطع المستمع): كل مسار كتابة (غياب، إنجاز، ✎، حذف) ← رفض ← خروج + إعادة تحميل + رسالة و2، ولا كتابة', async () => {
    const actions = {
        'غياب (commitBatch)': async h => { await card(h.page, 1).locator('[data-a=absent]').click(); await h.page.locator('#teacherAbsenceSheet button').filter({ hasText: /^\s*بغير عذر\s*$/ }).click(); },
        // أ26-ج (ق161، ل17): الضغط على «الإنجاز» نفسه يفحص الرمز من الخادم (getDocFromServer) فيُخرج قبل فتح النافذة؛ لا حفظ يُجرَّب.
        // مراقب في sessionStorage (يعبر إعادة التحميل) يسجّل إن أخذت #smartModal الصنف flex.
        'إنجاز (فحص الرمز عند الفتح)': async h => {
            await h.page.evaluate(() => { const m = document.getElementById('smartModal');
                new MutationObserver(() => { if (m.classList.contains('flex')) sessionStorage.setItem('__a26cModal', '1'); }).observe(m, { attributes: true, attributeFilter: ['class'] }); });
            await card(h.page, 1).locator('[data-a=ach]').click();
        },
        '✎ تعديل': async h => { await openSheet(h, () => card(h.page, 1).locator('[data-a=edit]').click()); await h.page.fill('#tsName', 'أحمد علي'); await clickText(h.page, '#teacherStudentSheet', /حفظ/, 'زر الحفظ'); },
        'حذف (deleteStudentWithCopy)': async h => {
            await card(h.page, 1).locator('[data-a=more]').click();
            await clickText(h.page, '#teacherMoreSheet', /حذف الطالب/, '«حذف الطالب»');
            await h.page.locator('#teacherDeleteAskSheet [data-go]').click();   // ب11-ف2: ورقة «متابعة» قبل ورقة الاسم
            await h.page.locator('#tsDeleteName').fill('أحمد');                 // مطابق حرفياً ← يتفعّل «حذف نهائي»
            await h.page.locator('#teacherDeleteSheet button').filter({ hasText: /^\s*حذف نهائي\s*$/ }).click();
        }
    };
    const results = {};
    for (const [label, act] of Object.entries(actions)) {
        const h = await teacherPage({ carry: 'all' });
        try {
            const before = await h.doc('programs/general/seasons/s1/students/1');
            // المشرف ضغط «رمز جديد»: يتغيّر المفتاح بلا إطلاق المستمعين (كما في المحاكي الحقيقي: المستمع القائم لا يُقطع).
            await h.page.evaluate(code => window.__fb.docs.set('programs/general/teacherKeys/t1', { code, halaqaIds: ['m1', 'a1'], active: true }), NEW_CODE);
            let actErr = null;
            await act(h).catch(e => { actErr = e.message.split('\n')[0]; });
            const out = await h.page.waitForFunction(msg => document.getElementById('loginError')?.innerText.trim() === msg && document.getElementById('loginError').getClientRects().length > 0,
                REVOKED_MSG, { timeout: 5000 }).then(() => true, () => false);
            const st = await h.page.evaluate(() => ({ user: window.__fb.currentUser?.uid || null, loads: window.__fb.loads,
                denied: window.__fb.log.filter(l => l.result === 'permission-denied').map(l => l.op),
                // أ26-ج: قراءة الفحص من الخادم بهوية المعلم (رُفضت: انتهت بالخروج)، وظهور النافذة.
                probe: window.__fb.log.some(l => l.op === 'getDocFromServer' && l.path === 'programs/general/seasons/s1/students/1' && l.uid === 'teacher-uid'),
                modal: sessionStorage.getItem('__a26cModal') === '1' || document.getElementById('smartModal')?.classList.contains('flex') === true })).catch(e => ({ evalError: e.message }));
            const after = await h.doc('programs/general/seasons/s1/students/1').catch(() => 'تعذّرت القراءة');
            const ach = label === 'إنجاز (فحص الرمز عند الفتح)';
            results[label] = { خرج_بالرسالة: out, الهوية: st.user ?? null, التحميلات: st.loads, رفض_الخادم: ach ? !!st.probe : (st.denied || []).length > 0,
                لا_كتابة: JSON.stringify(after) === JSON.stringify(before), ...(ach ? { النافذة_ظهرت: !!st.modal } : {}), ...(actErr ? { خطأ_الإجراء: actErr } : {}) };
        } finally { await h.close(); }
    }
    const expected = Object.fromEntries(Object.keys(actions).map(k => [k, { خرج_بالرسالة: true, الهوية: null, التحميلات: 2, رفض_الخادم: true, لا_كتابة: true,
        ...(k === 'إنجاز (فحص الرمز عند الفتح)' ? { النافذة_ظهرت: false } : {}) }]));
    assert.deepEqual(results, expected, 'لكل مسار: [خروج برسالة و2 بعد إعادة تحميل واحدة، بلا هوية، رفض من الخادم، لا كتابة]');
});

test('ح12 (ق61) ✎ لطالب جواله فارغ: حفظ الاسم بلا جوال ينجح ويظهر التلميح؛ جوال غير صالح يُرفض؛ و«+ طالب جديد» بلا جوال يبقى مرفوضاً', async () => {
    const HINT = 'أضف جوال ولي الأمر لرسائل الأسبوع';
    const s1 = H.makeStudent(1, 'أحمد', 'a1', { parentPhone: '' });
    const h = await teacherPage({ seed: { extraDocs: { 'programs/general/seasons/s1/students/1': s1 } } });
    try {
        const r = {};
        // (أ) الاسم وحده، والجوال المخزون فارغ.
        await openSheet(h, () => card(h.page, 1).locator('[data-a=edit]').click());
        r.تلميح_عند_الفتح = (await visibleText(h.page, '#teacherStudentSheet')).includes(HINT);
        await h.page.fill('#tsName', 'أحمد علي');
        await clickText(h.page, '#teacherStudentSheet', /حفظ/, 'زر الحفظ');
        await h.page.waitForTimeout(500);
        const doc1 = await h.doc('programs/general/seasons/s1/students/1');
        r.حُفظ_الاسم_بلا_جوال = doc1?.name === 'أحمد علي' && (doc1.parentPhone ?? '') === '';
        r.أُغلق_النموذج = await h.page.locator('#teacherStudentSheet').count() === 0;
        if (!r.أُغلق_النموذج) await h.page.locator('#teacherStudentSheet [data-cancel]').click();
        // (ب) جوال غير صالح في التعديل ← رفض بلا كتابة ورسالة تحت الحقل.
        const writes0 = (await studentWrites(h, 1)).length;
        await openSheet(h, () => card(h.page, 1).locator('[data-a=edit]').click());
        await h.page.fill('#tsName', 'أحمد سعيد'); await h.page.fill('#tsPhone', '12345');
        await clickText(h.page, '#teacherStudentSheet', /حفظ/, 'زر الحفظ');
        await h.page.waitForTimeout(400);
        r.رُفض_الجوال_غير_الصالح = (await studentWrites(h, 1)).length === writes0 && (await h.doc('programs/general/seasons/s1/students/1'))?.name !== 'أحمد سعيد';
        r.رسالة_تحت_الحقل = norm(await h.page.locator('#tsPhoneError').innerText().catch(() => '')) !== '';
        await h.page.locator('#teacherStudentSheet [data-cancel]').click();
        // (ج) «+ طالب جديد» بلا جوال ← مرفوض كما و11 (م9).
        await openSheet(h, () => h.page.locator('#teacherAddStudentBtn').click());
        await h.page.fill('#tsName', 'زيد');
        await clickText(h.page, '#teacherStudentSheet', /حفظ/, 'زر الحفظ');
        await h.page.waitForTimeout(400);
        r.الإضافة_بلا_جوال_مرفوضة = (await h.fbLog()).filter(l => (l.writes || []).some(w => /\/students\/\d+$/.test(w.path) && w.type === 'set')).length === 0;
        assert.deepEqual(r, { تلميح_عند_الفتح: true, حُفظ_الاسم_بلا_جوال: true, أُغلق_النموذج: true, رُفض_الجوال_غير_الصالح: true, رسالة_تحت_الحقل: true, الإضافة_بلا_جوال_مرفوضة: true });
    } finally { await h.close(); }
});

// أ7 (المسار 1، 2026-11-17): ح13 ف-F7 (حالة الضغط لزرّي الانضباط)، ح14 ف-F9 (لا كسر داخل «السورة + الرقم»)، ح15–ح17 ق64 «حفظ والتالي».
// البطاقة §3-8 والسطور ف-F7/ف-F9/ق64. لا توسيع للهاركنس: الطالب المخصّص يُزرع بـseed.list القائم.
const quickWho = async page => norm(await page.locator('#generalQuickName').innerText());
const saveLabel = async page => norm(await page.locator('#generalQuickSaveBtn').innerText());
const modalOpen = page => page.evaluate(() => document.getElementById('smartModal').classList.contains('flex'));
async function waitWho(h, name, what) {
    await h.page.waitForFunction(n => document.getElementById('smartModal')?.classList.contains('flex')
        && document.getElementById('generalQuickName')?.innerText.replace(/\s+/g, ' ').trim() === 'الإنجاز · ' + n, name, { timeout: 4000 })
        .catch(async () => assert.fail(`${what}: لم تُفتح نافذة «الإنجاز · ${name}» (المفتوح: ${await modalOpen(h.page) ? await quickWho(h.page) : 'لا نافذة'}). ${await diagnose(h)}`));
}
async function waitToast(h, name) {
    await h.page.locator('#teacherToast').filter({ hasText: 'حُفظ ل' + name }).waitFor({ state: 'visible', timeout: 4000 })
        .catch(async () => assert.fail(`«حُفظ ل${name}» لم تظهر. ${await diagnose(h)}`));
}
// لقطة النمط المرئي لزر، بلا أثر للمؤشر أو التركيز (يُبعد المؤشر ويُزال التركيز قبل القراءة).
async function pressedLook(h, id) {
    await h.page.mouse.move(1, 1);
    return h.page.evaluate(id => {
        document.activeElement?.blur?.();
        const b = document.getElementById(id), s = b && getComputedStyle(b);
        return b && { pressed: b.getAttribute('aria-pressed'), look: ['backgroundColor', 'backgroundImage', 'color', 'borderTopColor', 'boxShadow', 'fontWeight', 'outlineStyle'].map(k => k + '=' + s[k]).join('; ') };
    }, id);
}

test('ح13 (ف-F7) «التحضير المنزلي» و«استوفى المعايير» بحالة مضغوطة ظاهرة تعكس aria-pressed؛ «استوفى المعايير» مضغوط ما دامت المعايير الإيجابية كلها معلَّمة ويعود عند إلغاء أي منها', async () => {
    const h = await teacherPage();
    try {
        await openAch(h, 1);
        await H.openSec(h.page, 'behavior');   // أ14: الزرّان و«استثناءات» داخل قسم السلوك
        const home0 = await pressedLook(h, 'quickDisciplineHome'), all0 = await pressedLook(h, 'quickDisciplineAll');
        assert.ok(home0 && all0, 'زرّا الانضباط غائبان');
        assert.notEqual(home0.pressed, 'true', '«التحضير المنزلي» مضغوط عند الفتح');
        assert.notEqual(all0.pressed, 'true', '«استوفى المعايير» مضغوط عند الفتح');
        // (1) التحضير المنزلي: ضغطة ← مضغوط (aria-pressed + نمط مختلف) ومطابق للاختيار الحقيقي؛ ضغطة ثانية ← يعود كما كان بالضبط.
        await h.page.locator('#quickDisciplineHome').click();
        const home1 = await pressedLook(h, 'quickDisciplineHome');
        assert.equal(await h.page.evaluate(() => document.getElementById('generalHomePrepBtn')?.getAttribute('aria-pressed')), 'true', 'الشرط المسبق: التحضير لم يُختر');
        assert.equal(home1.pressed, 'true', '«التحضير المنزلي» بعد الضغط: aria-pressed ليس true');
        assert.notEqual(home1.look, home0.look, '«التحضير المنزلي» المضغوط بلا فرق ظاهر في النمط');
        await h.page.locator('#quickDisciplineHome').click();
        const home2 = await pressedLook(h, 'quickDisciplineHome');
        assert.notEqual(home2.pressed, 'true', '«التحضير المنزلي» بعد الإلغاء ما زال aria-pressed=true');
        assert.equal(home2.look, home0.look, '«التحضير المنزلي» بعد الإلغاء لم يعد إلى نمطه');
        // (2) استوفى المعايير: ضغطة ← كل الإيجابية معلَّمة ← مضغوط.
        await h.page.locator('#quickDisciplineAll').click();
        const allChecked = () => h.page.evaluate(() => [...document.querySelectorAll('#generalCriteriaHost .crit-box')].filter(c => Number(c.dataset.pts) >= 0).every(c => c.checked));
        assert.equal(await allChecked(), true, 'الشرط المسبق: لم تُعلَّم المعايير كلها');
        const all1 = await pressedLook(h, 'quickDisciplineAll');
        assert.equal(all1.pressed, 'true', '«استوفى المعايير» بعد الضغط: aria-pressed ليس true');
        assert.notEqual(all1.look, all0.look, '«استوفى المعايير» المضغوط بلا فرق ظاهر في النمط');
        // (3) إلغاء معيار واحد من «استثناءات» ← يعود؛ إعادة تعليمه ← مضغوط من جديد (حالة مشتقة من المعايير لا من آخر ضغطة).
        await clickText(h.page, '#smartModal', /استثناءات/, '«استثناءات»');
        await h.page.locator('#generalCriteriaHost .crit-box[data-cid="manners"]').click();
        const all2 = await pressedLook(h, 'quickDisciplineAll');
        assert.notEqual(all2.pressed, 'true', 'بعد إلغاء معيار «manners»: «استوفى المعايير» ما زال aria-pressed=true');
        assert.equal(all2.look, all0.look, 'بعد إلغاء معيار: «استوفى المعايير» لم يعد إلى نمطه');
        await h.page.locator('#generalCriteriaHost .crit-box[data-cid="manners"]').click();
        const all3 = await pressedLook(h, 'quickDisciplineAll');
        assert.equal(all3.pressed, 'true', 'بعد إعادة تعليم المعيار: «استوفى المعايير» لم يعد مضغوطاً');
        assert.equal(all3.look, all1.look, 'بعد إعادة تعليم المعيار: النمط ليس نمط الضغط');
        // (4) ضغطة ثانية على «استوفى المعايير» تلغي الكل ← يعود.
        await h.page.locator('#quickDisciplineAll').click();
        const all4 = await pressedLook(h, 'quickDisciplineAll');
        assert.notEqual(all4.pressed, 'true', 'بعد إلغاء الكل: ما زال aria-pressed=true');
        assert.equal(all4.look, all0.look, 'بعد إلغاء الكل: لم يعد إلى نمطه');
    } finally { await h.close(); }
});

test('ح14 (ف-F9) سطر «آخر محفوظ: الأعلى 19 ← يبدأ من: الطارق 1»: كل موضع (السورة + الرقم) في عنصر لا ينكسر، ولا ينقسم على سطرين ولو ضاق السطر', async () => {
    // حالة المالك حرفياً (shots/phone-390-v2.png): الطالب عند الأعلى 19 باتجاه up ← يبدأ من الطارق 1.
    const list = H.students();
    list[1] = H.makeStudent(1, 'أحمد', 'a1', { lastSurah: 87, lastAyah: 19, direction: 'up' });
    const h = await teacherPage({ seed: { list } });
    try {
        await openAch(h, 1);
        const line = await visibleText(h.page, '#quick_new_start');
        assert.match(line, /آخر محفوظ:\s*الأعلى\s19\s*يبدأ من:\s*الطارق\s1/, `الشرط المسبق: السطر ${line}`);   // أ18: ف6 حذف السهم
        { const fl = (await h.page.evaluate(() => {
            const box = document.getElementById('quick_new_start');
            const rows = [...(box?.children || [])].filter(e => e.getClientRects().length).map(e => ({ t: e.innerText.replace(/[\s\u00a0\u202f\u2060]+/g, ' ').trim(), r: e.getBoundingClientRect() }));
            return { all: (box?.innerText || '').replace(/\s+/g, ' ').trim(), rows: rows.map(x => x.t), separate: rows.length === 2 && rows[1].r.top >= rows[0].r.bottom - 1 };
        }));
            assert.deepEqual([fl.rows, fl.separate, fl.all.includes('←')], [['آخر محفوظ: الأعلى 19', 'يبدأ من: الطارق 1'], true, false], `الشرط المسبق: سطرا «آخر محفوظ» و«يبدأ من» (ف6: سطران منفصلان بلا سهم): ${JSON.stringify(fl)}`); }
        const res = await h.page.evaluate(labels => {
            const box = document.getElementById('quick_new_start');
            const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT), nodes = [];
            let all = '';
            for (let n = walker.nextNode(); n; n = walker.nextNode()) { nodes.push([n, all.length]); all += n.data; }
            const at = i => { const [n, s] = nodes.filter(([, s]) => s <= i).pop(); return [n, i - s]; };
            const savedWidth = box.style.width;
            const out = [];
            for (const label of labels) {
                const re = new RegExp(label.split(' ').join('[\\s\\u00a0\\u202f\\u2060]+')), m = re.exec(all);
                if (!m) { out.push({ label, found: false }); continue; }
                const range = document.createRange();
                const [sn, so] = at(m.index), [en, eo] = at(m.index + m[0].length - 1);
                range.setStart(sn, so); range.setEnd(en, eo + 1);
                // بنيوي: أقرب عنصر يحوي الموضع كاملاً، داخل السطر لا السطر نفسه، بـwhite-space لا يكسر؛ أو كل فراغات الموضع غير قابلة للكسر.
                let el = range.commonAncestorContainer; if (el.nodeType !== 1) el = el.parentElement;
                let wrapped = false;
                for (let e = el; e && e !== box; e = e.parentElement) if (['nowrap', 'pre'].includes(getComputedStyle(e).whiteSpace)) { wrapped = true; break; }
                const nbsp = !/[ \t\n​]/.test(m[0]);
                // سلوكي: يُضيَّق السطر إلى 90px (أضيق من أي شاشة) فيُجبر على الالتفاف، ثم يُعدّ عدد أسطر الموضع.
                box.style.width = '90px';
                const tops = [...new Set([...range.getClientRects()].filter(r => r.width > 0).map(r => Math.round(r.top / 4)))];
                box.style.width = savedWidth;
                out.push({ label, found: true, text: m[0], wrapped, nbsp, lines: tops.length, holder: el === box ? '#quick_new_start نفسه' : el.tagName + '.' + el.className });
            }
            return out;
        }, ['الأعلى 19', 'الطارق 1']);
        for (const r of res) {
            assert.ok(r.found, `الموضع «${r.label}» غير موجود في السطر`);
            assert.ok(r.wrapped || r.nbsp, `«${r.label}» ليس داخل عنصر لا ينكسر (الحاوي ${r.holder}، white-space عادي، وفراغه قابل للكسر)`);
            assert.equal(r.lines, 1, `«${r.label}» انقسم على ${r.lines} سطر حين ضاق السطر`);
        }
    } finally { await h.close(); }
});

// أ10 (ق77، 2026-11-18): «حفظ والتالي» أُلغي (خيار المالك أ). ح15–ح20 أُعيدت كتابتها على السلوك الجديد بنص الأمر، وما يحرسه كلٌّ منها باقٍ:
// الحفظ الناجح يغلق النافذة ويعود إلى قائمة الحلقة ولا يفتح أي طالب (لا استدعاء لـopenSmartModal بعده)، ونص الزر «حفظ» دائماً بـ<small>Enter ↵</small> كالمشرف.
// عدّاد openSmartModal: يُلفّ الاسم العام في الصفحة (teacherSaveQuickEntry وكل مستدعٍ يمرّ بالربط العام نفسه).
async function spyOpenSmart(page) {
    await page.evaluate(() => {
        if (window.__osmWrapped) return;
        const original = window.openSmartModal;
        window.__osm = [];
        window.openSmartModal = function (...args) { window.__osm.push(args[0]); return original.apply(this, args); };
        window.__osmWrapped = true;
    });
}
const osmCalls = page => page.evaluate(() => window.__osm.slice());
const saveHtml = page => page.evaluate(() => document.getElementById('generalQuickSaveBtn').innerHTML.replace(/\s+/g, ' ').trim());
// يُغلق ويبقى مغلقاً: لا نافذة بعد الحفظ بمهلة تكفي لأي فتح متأخر.
async function staysClosed(h, what) {
    await h.page.waitForFunction(() => !document.getElementById('smartModal')?.classList.contains('flex'), null, { timeout: 4000 })
        .catch(async () => assert.fail(`${what}: النافذة لم تُغلق (المفتوح: ${await quickWho(h.page)}). ${await diagnose(h)}`));
    await h.page.waitForTimeout(600);
    assert.equal(await modalOpen(h.page), false, `${what}: فُتحت نافذة بعد الإغلاق (المفتوح: ${await quickWho(h.page)})`);
}
test('ح15 (ق77، كان ق64) وضع المعلم: نص الزر «حفظ» ولو بقي غير مسجَّلين؛ بعد حفظ ناجح تُغلق النافذة وتعود القائمة (المحفوظ له ينزل) ولا يُفتح أي طالب، والرسالة ظاهرة؛ الحفظ الفاشل يُبقي النافذة كما هي', async () => {
    const h = await teacherPage();
    try {
        assert.deepEqual(await cardIds(h.page), [1, 4, 5, 2, 3], 'الشرط المسبق: ترتيب البطاقات');
        await spyOpenSmart(h.page);
        await openAch(h, 1);
        assert.equal(await saveLabel(h.page), 'حفظ', 'نص زر الحفظ لأحمد (سعد وفهد لم يُسجَّلا بعد)');
        assert.equal(await saveHtml(h.page), 'حفظ <small>Enter ↵</small>', 'زر الحفظ ليس «حفظ <small>Enter ↵</small>» كالمشرف');
        await fillNew(h.page); await fillReview(h.page);
        const logBefore = (await h.fbLog()).length, callsBefore = (await osmCalls(h.page)).length;
        await pressSave(h.page);
        await waitToast(h, 'أحمد');
        await staysClosed(h, 'بعد حفظ أحمد');
        assert.deepEqual((await osmCalls(h.page)).slice(callsBefore), [], 'استُدعيت openSmartModal بعد الحفظ');
        assert.equal((await mineToday(h, 1)).length, 2, 'تسجيلا أحمد لم يُحفظا');
        const writes = (await h.fbLog()).slice(logBefore).filter(l => (l.writes || []).length);
        assert.deepEqual(writes.map(l => l.writes.map(w => w.path).join(',')), ['programs/general/seasons/s1/students/1'], 'كتابات غير حفظ أحمد وحده');
        assert.ok((await visibleText(h.page, '#teacherToast')).includes('حُفظ لأحمد'), 'رسالة «حُفظ لأحمد · تراجع» ليست ظاهرة بعد الإغلاق');
        assert.deepEqual(await cardIds(h.page), [4, 5, 1, 2, 3], 'القائمة بعد الحفظ: المنتظرون في الأعلى والمحفوظ له ينزل إلى المسجَّلين');
    } finally { await h.close(); }
    // الحفظ الفاشل (الخادم يرفض الكتابة) ← النافذة لأحمد كما هي، والنص «حفظ».
    const f = await teacherPage();
    try {
        await openAch(f, 1); await fillNew(f.page); await fillReview(f.page);
        await f.page.evaluate(() => { window.__fb.failWrites = { code: 'unavailable' }; });
        await pressSave(f.page);
        await f.page.waitForTimeout(800);
        assert.ok((await f.fbLog()).some(l => l.result === 'failed'), 'الشرط المسبق: لم تُحاول الكتابة');
        assert.deepEqual([await modalOpen(f.page), await quickWho(f.page), await f.page.evaluate(() => currentEditingStudentId)], [true, 'أحمد', 1], 'الحفظ الفاشل أغلق النافذة أو انتقل');   // أ14: العنوان الاسم وحده (ق90، ج1)
        assert.equal(await saveLabel(f.page), 'حفظ', 'نص الزر بعد الفشل');
    } finally { await f.close(); }
});

test('ح16 (ق77، كان ق64) حفظ متتالٍ لطلاب الحلقة: كل حفظ يُغلق ولا ينتقل (ولا إلى تبويب آخر)، والنص «حفظ» في كل فتحة؛ ✕ يغلق؛ ولا أثر في الكود لـteacherNextStudentId ولا «حفظ والتالي» ولا تغليف updateGeneralUndoButton', async () => {
    // (ج) ساكن: ما يُحذف من الكود بنص ق77 (في الشيفرة لا في التعليقات: كل سطر بعد حذف تعليق // في آخره).
    const code = html.split('\n').map(l => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
    assert.equal(/teacherNextStudentId/.test(code), false, 'teacherNextStudentId ما زال في index.html');
    assert.equal(code.includes('حفظ والتالي'), false, '«حفظ والتالي» ما زال في index.html');
    assert.equal(/updateGeneralUndoButton\s*=\s*function/.test(code), false, 'تغليف updateGeneralUndoButton الذي يبدّل نص الزر ما زال في index.html');
    const h = await teacherPage();
    try {
        await spyOpenSmart(h.page);
        // (أ) العصر: أحمد ثم سعد ثم فهد، كل واحد يُفتح من بطاقته، وكل حفظ يُغلق.
        for (const [id, name] of [[1, 'أحمد'], [4, 'سعد'], [5, 'فهد']]) {
            await openAch(h, id);
            assert.equal(await saveLabel(h.page), 'حفظ', `نص زر الحفظ لـ${name}`);
            if (id === 4) { await setField(h.page, 'quick_positionSurah', 2); await setField(h.page, 'quick_positionAyah', 5); }
            await fillNew(h.page); await fillReview(h.page);
            const before = (await osmCalls(h.page)).length;
            await pressSave(h.page);
            await waitToast(h, name);
            await staysClosed(h, `بعد حفظ ${name}`);
            assert.deepEqual((await osmCalls(h.page)).slice(before), [], `استُدعيت openSmartModal بعد حفظ ${name}`);
        }
        const s2 = await h.doc('programs/general/seasons/s1/students/2'), s3 = await h.doc('programs/general/seasons/s1/students/3');
        assert.deepEqual([(await mineToday(h, 2)).length, s3.history?.[TODAY]?.attended, s3.history?.[TODAY]?.entries], [0, false, undefined], 'المسجَّل أو الغائب تغيّر');
        assert.deepEqual(Object.keys(s2.history?.[TODAY]?.entries || {}), ['e_other_1'], 'تسجيل بدر تغيّر');
        // (ب) المغرب: ✕ على عمر يغلق؛ حفظ عمر يُغلق ولا يفتح ماجد ولا يقفز إلى العصر.
        await h.page.waitForTimeout(6200);   // تنتهي رسالة فهد
        await h.page.locator('#teacherHalaqaTabs button').nth(1).click();
        await openAch(h, 6);
        assert.equal(await saveLabel(h.page), 'حفظ', 'نص زر الحفظ لعمر (ماجد لم يُسجَّل)');
        await h.page.locator('#generalQuickSection button[aria-label="رجوع"]').click();   // أ14: «رجوع» بدل ✕ عند المعلم (ق90، ج1)
        await staysClosed(h, '«رجوع» على عمر');
        await openAch(h, 6); await fillNew(h.page); await fillReview(h.page); await pressSave(h.page);
        await waitToast(h, 'عمر');
        await staysClosed(h, 'بعد حفظ عمر');
        assert.deepEqual(await cardIds(h.page), [7, 6], 'قائمة المغرب بعد حفظ عمر (ماجد في الأعلى)');
    } finally { await h.close(); }
});

// التسجيل المحفوظ قبل الميزة (التُقط 2026-11-17 على الشجرة نفسها قبل البناء، index.html cdcb4ab6…): حفظ أحمد بـ«إلى البقرة 10 ممتاز» + «الفاتحة 1–7 جيد»،
// بعد normalizePatch (مفتاح التسجيل ← نوعه، وحذف by). المشرف والمعلم متطابقان فيه حرفاً (ف1).
const PRE_FEATURE_PATCH = {"history.2026-11-22.attended":true,"history.2026-11-22.absence":{"__sentinel":"deleteField"},"history.2026-11-22.note":{"__sentinel":"deleteField"},"history.2026-11-22.hijri":"الأحد، ١٣ جمادى الآخرة ١٤٤٨ هـ","history.2026-11-22.entries.new":{"kind":"new","grade":"excellent","mult":3,"points":20,"spec":{"from":[2,6],"to":[2,10]},"iv":[12,16],"rep":1,"heardBy":"t1","halaqaId":"a1","stageId":"primary","at":1795338000000},"history.2026-11-22.entries.review":{"kind":"review","grade":"very-good","mult":1,"points":5.3,"spec":{"from":[1,1],"to":[1,7]},"iv":[0,6],"rep":1,"heardBy":"t1","halaqaId":"a1","stageId":"primary","at":1795338000001},"lastDailySurah":1,"lastDailyAyah":7,"lastDailySardRange":"من ٱلْفَاتِحَةِ (1) إلى ٱلْفَاتِحَةِ (7)"};
test('ح17 (ق77، كان ق64؛ (أ) معمَّم على المعلم) المشرف والمعلم سواء: النص «حفظ» بـ<small>Enter ↵</small>، الحفظ يغلق ولا يفتح تالياً، والتسجيل المحفوظ مطابق بايتاً للتسجيل قبل الميزة', async () => {
    const one = async h => {
        const w = (await studentWrites(h, 1)).filter(l => l.op === 'updateDoc');
        assert.equal(w.length, 1, `عدد كتابات الطالب 1: ${w.length}. ${await diagnose(h)}`);
        assert.deepEqual(w[0].writes.map(x => [x.type, x.path]), [['update', 'programs/general/seasons/s1/students/1']]);
        return w[0].writes[0];
    };
    // (أ) المشرف: كما قبل الميزة.
    const a = await adminPage();
    let adminHtml;
    try {
        await spyOpenSmart(a.page);
        await a.page.evaluate(() => openSmartModal(1));
        assert.equal(await saveLabel(a.page), 'حفظ Enter ↵', 'نص زر الحفظ للمشرف تغيّر');
        adminHtml = await saveHtml(a.page);
        assert.equal(adminHtml, 'حفظ <small>Enter ↵</small>', 'زر المشرف تغيّر');
        await fillNew(a.page); await fillReview(a.page); await pressSave(a.page);
        await staysClosed(a, 'المشرف بعد الحفظ');
        assert.deepEqual(await osmCalls(a.page), [1], 'المشرف: openSmartModal استُدعيت بعد الحفظ');
        assert.equal(JSON.stringify(normalizePatch(await one(a))), JSON.stringify(PRE_FEATURE_PATCH), 'تسجيل المشرف ليس بايتاً كما قبل الميزة');
    } finally { await a.close(); }
    // (ب) المعلم: الزر نفسه بايتاً، والحفظ يغلق، والتسجيل نفسه بايتاً، وby = uid المعلم.
    const h = await teacherPage();
    try {
        await spyOpenSmart(h.page);
        await openAch(h, 1);
        assert.equal(await saveHtml(h.page), adminHtml, 'زر المعلم ليس زر المشرف نفسه (حفظ <small>Enter ↵</small>)');
        assert.equal(await saveLabel(h.page), 'حفظ', 'النص الظاهر لزر المعلم');
        const before = (await osmCalls(h.page)).length;
        await fillNew(h.page); await fillReview(h.page); await pressSave(h.page);
        await waitToast(h, 'أحمد');
        await staysClosed(h, 'المعلم بعد الحفظ');
        assert.deepEqual((await osmCalls(h.page)).slice(before), [], 'المعلم: openSmartModal استُدعيت بعد الحفظ');
        const w = await one(h);
        assert.equal(JSON.stringify(normalizePatch(w)), JSON.stringify(PRE_FEATURE_PATCH), 'تسجيل المعلم ليس بايتاً كما قبل الميزة');
        assert.deepEqual([...new Set(Object.entries(w.data).filter(([k]) => k.includes('.entries.')).map(([, v]) => v.by))], ['teacher-uid'], 'by');
    } finally { await h.close(); }
});

// ح18 (ق77 + ق43 + ق93-6): التراجع من الرسالة بعد الإغلاق، وحالة ق70 الباقية (نافذة طالب آخر فُتحت يدوياً والرسالة ظاهرة).
// أ29 (ق189–ق190، الجولة 5، 2026-11-20): (أ) كما كان. (ب) كان «فتح سعد يدوياً والرسالة لأحمد ظاهرة، كتابة في نافذته ثم «تراجع» من الرسالة ← يمسّ أحمد وتبقى نافذة سعد بما كُتب».
// هذا لم يعد ممكناً (فتح النافذة يزيل الرسالة). صار: فتح سعد يزيل الرسالة، حفظ سعد يُكتب له، والتراجع عن أحمد من «سُجّل اليوم» في نافذته يمسّ أحمد وحده.
// ب14 (ق205): كان تراجع الشريط والنافذة مغلقة؛ صار التراجع من صندوق نافذة المحفوظ له.
test('ح18 (ق77/ق43، ق205) الحفظ يغلق النافذة ورسالة بلا أزرار؛ تراجع صندوق فهد يحذف تسجيله، وفتح سعد يزيل الرسالة', async () => {
    const h = await teacherPage();
    try {
        await spyOpenSmart(h.page);
        // (أ) النافذة مغلقة.
        await openAch(h, 5); await fillNew(h.page); await fillReview(h.page); await pressSave(h.page);
        await waitToast(h, 'فهد');
        await staysClosed(h, 'بعد حفظ فهد');
        assert.equal((await mineToday(h, 5)).length, 2, 'الشرط المسبق: تسجيلا فهد');
        assert.equal(await h.page.locator('#teacherToast button').count(), 0, 'رسالة الحفظ فيها زر');
        await openAch(h, 5);
        await clickText(h.page, '#quickTodayBox', /تراجع/, 'زر التراجع في صندوق فهد');
        await h.page.waitForTimeout(700);
        assert.equal((await mineToday(h, 5)).length, 1, 'التراجع لم يحذف تسجيلاً واحداً لفهد');
        assert.equal(await modalOpen(h.page), true, 'صندوق التراجع داخل النافذة');
        await closeQuick(h);
        // (ب) حفظ أحمد ← يُغلق؛ فتح سعد يدوياً والرسالة ظاهرة ← تُزال؛ حفظ سعد؛ ثم التراجع عن أحمد من صندوق نافذته.
        await openAch(h, 1); await fillNew(h.page); await fillReview(h.page); await pressSave(h.page);
        await waitToast(h, 'أحمد');
        await staysClosed(h, 'بعد حفظ أحمد');
        await openAch(h, 4);
        const left = await h.page.locator('#teacherToast').count() ? await visibleText(h.page, '#teacherToast') : '';
        assert.equal(left, '', `فتح نافذة سعد لم يُزل رسالة أحمد (ق190): «${left}»`);
        await setField(h.page, 'quick_positionSurah', 2); await setField(h.page, 'quick_positionAyah', 5);
        await fillNew(h.page, 12); await fillReview(h.page); await pressSave(h.page);
        await waitToast(h, 'سعد');
        await staysClosed(h, 'بعد حفظ سعد');
        assert.deepEqual([(await mineToday(h, 1)).length, (await mineToday(h, 4)).length], [2, 2], 'حفظ سعد لم يُكتب لسعد وحده (أحمد، سعد)');
        await openAch(h, 1);
        await clickText(h.page, '#quickTodayBox', /تراجع/, 'زر التراجع في #quickTodayBox لأحمد');
        await h.page.waitForTimeout(700);
        assert.deepEqual([(await mineToday(h, 1)).length, (await mineToday(h, 4)).length], [1, 2], 'التراجع من صندوق أحمد لم يحذف تسجيلاً واحداً لأحمد وحده (أحمد، سعد)');
        assert.deepEqual(await osmCalls(h.page), [5, 5, 1, 4, 1], 'openSmartModal استُدعيت لغير فتح البطاقات يدوياً');
    } finally { await h.close(); }
});

// أ14 (ق101 س2، 2026-11-18): حُذف ح19(أ) «زر «حفظ» في تأكيد التبويب الواحد يحفظ ويغلق»: الشريط #quickOneSideConfirm أُلغي بق78،
// وحلّ محله ج10/ج11 في teacher-r2-accordion-local (ورقة ق78: «احفظ الجديد فقط» تسجيل واحد ويُغلق). ما يحرسه من ق77 باقٍ في ح19(ب) وح15–ح20.

// أ13 (ق93-1/ق98-3، 2026-11-18): ح19(ب) أُعيدت كتابتها بنص الأمر: Enter في خانة الآية عند المعلم = «تأكيد» القسم لا الحفظ؛ الحفظ من زر «حفظ» وحده.
// القسم بالمحدّدات المفترضة في teacher-r2-accordion-local.test.cjs: [data-sec="new"|"review"]، .tch-acc-toggle (aria-expanded)، .tch-confirm (aria-pressed).
// ما كان يحرسه (ق77) باقٍ: الحفظ بعد ذلك يُغلق ولا يفتح أحداً.
test('ح19(ب) (ق93-1، كان «Enter يحفظ») Enter في آية «إلى» للمراجعة ثم للجديد في نافذة سعد: يؤكّد كل قسم ولا يحفظ ولا يغلق؛ «حفظ» بعدها يحفظ القسمين ويُغلق ولا يفتح أحداً', async () => {
    const sec = k => `#generalQuickSection [data-sec="${k}"]`;
    const reach = async (page, k) => {   // يفتح القسم إن وُجد، وإلا التبويب القائم (الشكل الحالي)
        if (await page.locator(sec(k)).count()) { if (await page.locator(sec(k) + ' .tch-acc-toggle').getAttribute('aria-expanded') !== 'true') await page.locator(sec(k) + ' .tch-acc-toggle').click(); }
        else if (await page.locator(k === 'new' ? '#quickTabNew' : '#quickTabReview').count()) await page.locator(k === 'new' ? '#quickTabNew' : '#quickTabReview').click();
    };
    const confirmed = (page, k) => page.evaluate(sel => { const c = document.querySelector(sel + ' .tch-confirm'); return !!c && c.getAttribute('aria-pressed') === 'true'; }, sec(k));
    const writes4 = async h => (await studentWrites(h, 4)).length;
    const h = await teacherPage();
    try {
        await spyOpenSmart(h.page);
        await card(h.page, 4).locator('[data-a=ach]').click();
        await h.page.locator('#smartModal').waitFor({ state: 'visible' });
        await reach(h.page, 'new');
        await setField(h.page, 'quick_positionSurah', 2); await setField(h.page, 'quick_positionAyah', 5);
        await setField(h.page, 'quick_new_toAyah', 10); await grade(h.page, 'new', 'ممتاز');
        await reach(h.page, 'review');
        for (const [id, v] of [['quick_review_fromSurah', 1], ['quick_review_fromAyah', 1], ['quick_review_toSurah', 1], ['quick_review_toAyah', 7]]) await setField(h.page, id, v);
        await grade(h.page, 'review', 'جيد');
        const before = (await osmCalls(h.page)).length;
        // (1) Enter في آية المراجعة: تأكيد المراجعة، لا حفظ، النافذة باقية.
        await h.page.locator('#quick_review_toAyah').focus();
        await h.page.keyboard.press('Enter');
        await h.page.waitForTimeout(700);
        assert.equal(await writes4(h), 0, 'Enter في آية المراجعة حفظ (ق93-1: Enter = تأكيد القسم لا الحفظ)');
        assert.equal(await modalOpen(h.page), true, 'Enter أغلق النافذة');
        assert.equal(await confirmed(h.page, 'review'), true, 'Enter في آية المراجعة لم يؤكّد قسم المراجعة');
        // (2) Enter في آية الجديد: تأكيد الجديد، لا حفظ.
        await reach(h.page, 'new');
        await h.page.locator('#quick_new_toAyah').focus();
        await h.page.keyboard.press('Enter');
        await h.page.waitForTimeout(700);
        assert.equal(await writes4(h), 0, 'Enter في آية الجديد حفظ');
        assert.deepEqual([await modalOpen(h.page), await confirmed(h.page, 'new')], [true, true], 'Enter في آية الجديد: [النافذة مفتوحة، الجديد مؤكَّد]');
        // (3) «حفظ» وحده يحفظ ويُغلق ولا يفتح أحداً (ق77).
        await h.page.locator('#generalQuickSaveBtn').click();
        await waitToast(h, 'سعد');
        assert.equal((await mineToday(h, 4)).length, 2, '«حفظ» لم يحفظ القسمين المؤكَّدين لسعد');
        await staysClosed(h, 'بعد «حفظ»');
        assert.deepEqual((await osmCalls(h.page)).slice(before), [], '«حفظ» فتح طالباً');
    } finally { await h.close(); }
});

test('ح20 (ق77، كان ق68) لا «تالٍ» بأي ترتيب: حفظ آخر غير المسجَّلين (فهد) لا يدور إلى أول القائمة؛ والقائمة بعده: المنتظرون ثم المسجَّلون ثم الغائب', async () => {
    const h = await teacherPage();
    try {
        assert.deepEqual(await cardIds(h.page), [1, 4, 5, 2, 3], 'الشرط المسبق: ترتيب البطاقات');
        await spyOpenSmart(h.page);
        await openAch(h, 5);
        assert.equal(await saveLabel(h.page), 'حفظ', 'نص زر فهد');
        await fillNew(h.page); await fillReview(h.page); await pressSave(h.page);
        await waitToast(h, 'فهد');
        await staysClosed(h, 'بعد حفظ فهد (لا دوران إلى أحمد)');
        assert.deepEqual(await osmCalls(h.page), [5], 'openSmartModal استُدعيت بعد حفظ فهد');
        assert.deepEqual(await cardIds(h.page), [1, 4, 2, 5, 3], 'القائمة بعد حفظ فهد');
        assert.notEqual(await h.page.evaluate(() => currentEditingStudentId), 1, 'الطالب المحرَّر صار أحمد');
    } finally { await h.close(); }
});

// =====================================================================================
// أ9 (جولة «متوقف عن الجديد»، 2026-11-17): ح21 (ق70) موضع الرسالة والنافذة التالية مفتوحة؛ ح22 (ق63) حارس حذف استئناف الرمز المعلّق.
// =====================================================================================
async function toastGeometry(page) {
    return page.evaluate(() => {
        const r = e => { if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }; };
        const t = document.getElementById('teacherToast'), cs = t && getComputedStyle(t);
        return { toast: r(t), position: cs?.position || null, bottom: cs?.bottom || null, vh: innerHeight,
            footer: r(document.getElementById('generalQuickFooter')), save: r(document.getElementById('generalQuickSaveBtn')),
            // أ14 (ق90، افتراض ق101 §5-10): موضع التبويبين في ق70 صار رأس قسم الجديد (أول الأقسام).
            tabs: [r(document.querySelector('#generalQuickSection [data-sec="new"] .tch-acc-toggle'))] };
    });
}
const overlap = (a, b) => !!a && !!b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const PENDING_KEY = (/TEACHER_PENDING_CODE\s*=\s*'([^']+)'/.exec(authSrc) || [])[1] || 'almahra-teacher-pending-code';
test('ح22 (ق63) رمز معلّق محفوظ في sessionStorage بلا ?k= في العنوان ← لا دخول مجهول ولا users ولا صفحة المعلم؛ ومع ?k= يُحفظ الرمز معلّقاً قبل مسح العنوان ويُمسح بعد النجاح وبعد الفشل', async () => {
    // (1) رمز معلّق من تحميل سابق انقطع، والعنوان بلا ?k=، ولا جلسة.
    const seedPending = `(() => { try { sessionStorage.setItem(${JSON.stringify(PENDING_KEY)}, ${JSON.stringify(H.TEACHER_CODE)}); } catch (_) {} })()`;
    const p = await H.openPage(browser, { user: null, initScripts: [seedPending] });
    try {
        await p.page.locator('#loginOverlay').waitFor({ state: 'visible', timeout: 5000 }).catch(async () => assert.fail('شاشة الدخول لم تظهر. ' + await diagnose(p)));
        await p.page.waitForTimeout(800);
        const st = await p.page.evaluate(() => ({ anon: window.__fb.authLog.filter(l => l.op === 'signInAnonymously').length, user: window.__fb.currentUser?.uid || null,
            home: !!document.getElementById('teacherHome'), users: [...window.__fb.docs.keys()].filter(k => k.startsWith('users/') && k !== 'users/admin-uid') }));
        assert.deepEqual(st, { anon: 0, user: null, home: false, users: [] }, 'الرمز المعلّق بلا ?k= بدأ دخولاً (دخول مجهول، هوية، صفحة المعلم، users)');
    } finally { await p.close(); }
    // (2) الحفظ والمسح: ?k= صحيح ← setItem قبل replaceState، ثم يُمسح بعد النجاح؛ و?k= صحيح الشكل خطأ القيمة ← يُمسح بعد الفشل.
    const spy = `(() => { window.__pend = []; const set = Storage.prototype.setItem, rs = history.replaceState;
        Storage.prototype.setItem = function (k, v) { if (k === ${JSON.stringify(PENDING_KEY)}) window.__pend.push('set:' + v + ':' + location.search); return set.apply(this, arguments); };
        history.replaceState = function () { window.__pend.push('replace'); return rs.apply(this, arguments); }; })()`;
    for (const [code, ok] of [[H.TEACHER_CODE, true], ['t1.ZZZZZZZZZZ23', false]]) {
        const h = await H.openPage(browser, { user: null, url: '/?k=' + code, initScripts: [spy] });
        try {
            if (ok) await waitFor(h, '#teacherHome', 'الرابط الصحيح لم يفتح صفحة المعلم', 7000);
            else await h.page.waitForFunction(() => (document.getElementById('loginError')?.innerText || '').includes('الرمز غير صحيح'), null, { timeout: 5000 })
                .catch(async () => assert.fail('رسالة الرمز الخطأ لم تظهر. ' + await diagnose(h)));
            await h.page.waitForTimeout(300);
            const st = await h.page.evaluate(k => ({ seq: window.__pend.slice(0, 2), left: sessionStorage.getItem(k) }), PENDING_KEY);
            assert.deepEqual(st.seq, ['set:' + code + ':?k=' + code, 'replace'], `(${ok ? 'نجاح' : 'فشل'}) الرمز لم يُحفظ معلّقاً قبل مسح العنوان`);
            assert.equal(st.left, null, `(${ok ? 'نجاح' : 'فشل'}) الرمز المعلّق باقٍ في sessionStorage`);
        } finally { await h.close(); }
    }
});

// أ10 (ق77 + ق93-6، 2026-11-18): حالة ق70 الباقية بعد إلغاء «حفظ والتالي» — نافذة طالب آخر تُفتح يدوياً من بطاقته والرسالة ظاهرة.
// إضافة لا تعديل: ح21 القائم يفتح النافذة التالية تلقائياً (السلوك الملغى)، وانظر س في التقرير.
// أ29 (ق189–ق190، الجولة 5، 2026-11-20): كان «فتح سعد خلال الثواني الست: الرسالة ثابتة فوق شريط الحفظ ولا تغطي رأس الجديد ولا «حفظ»».
// هذا لم يعد ممكناً: فتح النافذة يزيل الرسالة. صار: فتح سعد يزيل الرسالة (فلا شيء فوق شريط الحفظ ولا رأس الجديد)، والتراجع عن أحمد من «سُجّل اليوم» في نافذته.
test('ح23 (ق70/ق190) بعد حفظ أحمد وإغلاق النافذة، فتح سعد من بطاقته يزيل #teacherToast فلا يغطي رأس الجديد ولا «حفظ»؛ والتراجع عن أحمد من «سُجّل اليوم … تراجع» داخل نافذته', async () => {
    const h = await teacherPage();
    try {
        await openAch(h, 1); await fillNew(h.page); await fillReview(h.page); await pressSave(h.page);
        await waitToast(h, 'أحمد');
        await closeQuick(h);
        await openAch(h, 4);
        await h.page.waitForTimeout(150);
        const g = await toastGeometry(h.page);
        assert.ok(g.footer && g.tabs.every(Boolean), `الشرط المسبق: الشريط أو رأس الجديد غير ظاهر ${JSON.stringify(g)}`);
        assert.equal(g.toast, null, `فتح نافذة سعد لم يُزل الرسالة (ق190): ${JSON.stringify(g)}`);
        await closeQuick(h);
        await openAch(h, 1);
        assert.equal((await mineToday(h, 1)).length, 2, 'الشرط المسبق: تسجيلا أحمد');
        await clickText(h.page, '#quickTodayBox', /تراجع/, 'زر التراجع في #quickTodayBox لأحمد');
        await h.page.waitForTimeout(600);
        assert.equal((await mineToday(h, 1)).length, 1, 'التراجع من صندوق أحمد لم يحذف تسجيلاً واحداً');
    } finally { await h.close(); }
});
