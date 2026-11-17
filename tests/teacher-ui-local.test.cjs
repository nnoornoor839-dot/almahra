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
//   • الشكل ب يُعرف بلا أسماء أصناف: عنصر بخلفية #125c2f ارتفاعه ≥ 40% من الشاشة، وأب أبيض للزرّين، ونقشان شفافيتهما 7% (svg، لا يلتقطان اللمس)
//     أحدهما يلامس أعلى #loginOverlay والآخر أسفله، وشعار afdalkom-logo-vertical-white.
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
async function openAch(h, id) {
    await waitFor(h, `.teacher-card[data-id="${id}"] [data-a=ach]`, `زر «الإنجاز» لبطاقة ${id}`);
    await card(h.page, id).locator('[data-a=ach]').click();
    await h.page.locator('#smartModal').waitFor({ state: 'visible' });
    await waitFor(h, '#quickTabNew', 'تبويب الجديد #quickTabNew');
}
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
async function fillNew(page, toAyah = 10, g = 'ممتاز') { await setField(page, 'quick_new_toAyah', toAyah); await grade(page, 'new', g); }
async function fillReview(page, g = 'جيد') {
    const tab = page.locator('#quickTabReview');
    if (await tab.count()) await tab.click();
    for (const [id, v] of [['quick_review_fromSurah', 1], ['quick_review_fromAyah', 1], ['quick_review_toSurah', 1], ['quick_review_toAyah', 7]]) await setField(page, id, v);
    await grade(page, 'review', g);
}
async function pressSave(page) {
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

for (const width of [390, 1280]) test(`و3 الشكل ب على ${width}: الكتلة الخضراء + البطاقة البيضاء + نقشان ثابتان 7% أعلى وأسفل + شعار أفضلكم الأبيض، بلا حركة (لقطتان بفارق ثانية متطابقتان)`, async () => {
    const h = await H.openPage(browser, { width, height: width === 390 ? 844 : 900 });
    try {
        await h.page.locator('#loginOverlay').waitFor({ state: 'visible' });
        await h.page.waitForTimeout(300);
        const r = await h.page.evaluate(() => {
            const ov = document.getElementById('loginOverlay'), o = ov.getBoundingClientRect(), vh = innerHeight;
            const all = [...ov.querySelectorAll('*')], cs = e => getComputedStyle(e);
            const green = all.filter(e => cs(e).backgroundColor === 'rgb(18, 92, 47)' && e.getBoundingClientRect().height >= vh * 0.4).length;
            let c = document.getElementById('loginRoleAdmin')?.parentElement;
            while (c && c !== ov && cs(c).backgroundColor !== 'rgb(255, 255, 255)') c = c.parentElement;
            const pats = all.filter(e => Math.abs(Number(cs(e).opacity) - 0.07) < 0.006 && cs(e).backgroundImage.includes('svg') && cs(e).pointerEvents === 'none')
                .map(e => e.getBoundingClientRect());
            const logo = [...ov.querySelectorAll('img')].find(i => i.getClientRects().length);
            return { green, whiteCard: !!c && c !== ov, pats: pats.length, top: pats.some(p => Math.abs(p.top - o.top) <= 1), bottom: pats.some(p => Math.abs(p.bottom - o.bottom) <= 1),
                logo: logo ? logo.getAttribute('src') : null, logoLoaded: logo ? logo.naturalWidth : 0, text: ov.innerText,
                anims: document.getAnimations().length, animNames: all.map(e => cs(e).animationName).filter(n => n !== 'none') };
        });
        assert.ok(r.green >= 1, 'لا كتلة خضراء #125c2f بارتفاع ≥ 40% من الشاشة');
        assert.ok(r.whiteCard, 'الزرّان ليسا داخل بطاقة بيضاء');
        assert.equal(r.pats, 2, 'نقشان شفافيتهما 7% (svg، بلا لمس)');
        assert.ok(r.top && r.bottom, 'النقشان ليسا أعلى الشاشة وأسفلها');
        assert.match(r.logo || '', /afdalkom-logo-vertical-white\.png$/, 'شعار أفضلكم الأبيض');
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

test('و1/م5 التبويبات بترتيب periodOf (العصر أولاً) و«العصر/المغرب» أصغر فوق الاسم؛ المستمع بقيد where in [حلقتيه]؛ لا طالب من حلقة غيره', async () => {
    const h = await teacherPage();
    try {
        const tabs = h.page.locator('#teacherHalaqaTabs button');
        assert.equal(await tabs.count(), 2);
        const sizes = await tabs.first().evaluate(b => {
            const leaf = t => [...b.querySelectorAll('*')].find(e => e.children.length === 0 && e.textContent.trim() === t);
            const p = leaf('العصر'), n = leaf('حلقة أُبيّ');
            return p && n ? [parseFloat(getComputedStyle(p).fontSize), parseFloat(getComputedStyle(n).fontSize), p.getBoundingClientRect().top < n.getBoundingClientRect().top] : null;
        });
        assert.ok(sizes && sizes[0] < sizes[1] && sizes[2], `«العصر» ليست أصغر فوق الاسم: ${JSON.stringify(sizes)}`);
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
        assert.ok((await visibleText(h.page, '#smartModal')).includes('لتصحيح الموضع أبلغ المشرف'), 'نص «لتصحيح الموضع أبلغ المشرف» غائب');
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
        // أ5 (ق58): ✎ و⋯ أيقونتان (fa-pen / fa-ellipsis) ونص القارئ في aria-label، لا رمز نصي (يُحذف النص المخفي .tch-sr بعدها).
        for (const [a, icon, aria] of [['edit', 'fa-pen', 'تعديل بيانات الطالب'], ['more', 'fa-ellipsis', 'خيارات الطالب']]) {
            const b = card(h.page, 1).locator(`[data-a=${a}]`);
            assert.equal(await b.count(), 1, `[data-a=${a}] غائب`);
            const r = await b.evaluate((el, icon) => ({ icons: [...el.querySelectorAll('i')].filter(i => i.classList.contains(icon)).map(i => i.getAttribute('aria-hidden')),
                aria: el.getAttribute('aria-label'), tag: el.tagName,
                shown: [...el.childNodes].filter(n => !(n.classList && n.classList.contains('tch-sr'))).map(n => n.textContent).join('').trim() }), icon);
            assert.equal(r.shown, '', `[data-a=${a}]: نص ظاهر بجانب الأيقونة`);
            assert.deepEqual(r.icons, ['true'], `[data-a=${a}]: أيقونة ${icon} واحدة مخفية عن القارئ`);
            assert.equal(r.aria, aria, `[data-a=${a}]: aria-label`);
            assert.equal(r.tag, 'BUTTON', `[data-a=${a}] ليس زراً`);
        }
        assert.match(norm(await card(h.page, 2).innerText()), /سُجّل · جيد/, 'شارة «سُجّل · التقدير»');
        assert.ok(norm(await card(h.page, 3).innerText()).includes('غائب'));
        assert.ok(norm(await card(h.page, 4).innerText()).includes('يُحدَّد في أول إنجاز'), 'طالب بلا موضع');
    } finally { await h.close(); }
});

test('§3-8ب الشريط العلوي (اسم المعلم، «!» يفتح #teacherHelpSheet، «خروج» بتأكيد) وسطر اليوم «سُجّل n من m · غائب k» بأرقام 0-9', async () => {
    const h = await teacherPage({ carry: 'all' });   // أ4: الخروج يعيد تحميل الصفحة (ق50)؛ الجلسة والسجلّات تُحمل عبره
    try {
        assert.ok((await visibleText(h.page, '#teacherTopBar')).includes('عبدالله'), 'اسم المعلم في الشريط');
        assert.equal(await visibleText(h.page, '#teacherHelpBtn'), '!');
        await h.page.locator('#teacherHelpBtn').click();
        assert.equal(await h.page.locator('#teacherHelpSheet').isVisible(), true, '#teacherHelpSheet لم يظهر');
        const day = await visibleText(h.page, '#teacherDayRow');
        assert.match(day, /سُجّل\s*1\s*من\s*[45]\s*·\s*غائب\s*1/, `سطر اليوم: ${day}`);
        assert.match(day, /[0-9]/); assert.doesNotMatch(day, /[\u0660-\u0669]/);
        await h.page.keyboard.press('Escape').catch(() => {});
        await h.page.evaluate(() => document.getElementById('teacherHelpSheet')?.querySelector('button')?.click());
        h.page.__dialogAnswer = false;
        await h.page.locator('#teacherLogoutBtn').click();
        await h.page.waitForTimeout(200);
        assert.ok(h.dialogs.length >= 1, '«خروج» بلا تأكيد');
        assert.equal(await h.page.evaluate(() => !!window.__fb.currentUser), true, 'خرج رغم الإلغاء');
        assert.equal(await h.page.evaluate(() => window.__fb.loads), 1, 'أُعيد التحميل رغم الإلغاء');
        h.page.__dialogAnswer = true;
        // ق50: «خروج» ← تأكيد ← signOut ← location.reload()
        await Promise.all([h.page.waitForEvent('load', { timeout: 5000 }).catch(() => assert.fail('«خروج» لم يُعد تحميل الصفحة (ق50)')),
            h.page.locator('#teacherLogoutBtn').click()]);
        await h.page.locator('#loginOverlay').waitFor({ state: 'visible', timeout: 4000 }).catch(async () => assert.fail('شاشة الدخول لم تظهر بعد الخروج. ' + await diagnose(h)));
        const after = await h.page.evaluate(() => ({ loads: window.__fb.loads, user: window.__fb.currentUser, nav: performance.getEntriesByType('navigation')[0]?.type,
            seq: window.__fb.authLog.filter(l => l.op === 'signOut' || l.op === 'pageLoad').map(l => l.op + ':' + (l.n ?? l.uid)) }));
        assert.deepEqual([after.loads, after.nav], [2, 'reload'], 'لا إعادة تحميل واحدة بعد الخروج');
        assert.deepEqual(after.seq, ['pageLoad:1', 'signOut:teacher-uid', 'pageLoad:2'], 'الترتيب: signOut ثم إعادة التحميل');
        assert.equal(after.user, null, 'الجلسة باقية بعد الخروج');
        assert.equal(await h.page.locator('#teacherHome').count(), 0, 'صفحة المعلم بعد الخروج');
    } finally { await h.close(); }
});

test('و6 نافذة الإنجاز: «الإنجاز · الاسم»، تبويبا #quickTabNew (افتراضي)/#quickTabReview، «آخر محفوظ: X ← يبدأ من: Y»، بحث السورة والقصّ، الانضباط بزرّيه و«استثناءات»', async () => {
    const h = await teacherPage();
    try {
        await openAch(h, 1);
        const text = await visibleText(h.page, '#smartModal');
        assert.ok(text.includes('الإنجاز · أحمد'), 'عنوان «الإنجاز · أحمد»');
        assert.equal(await isSelected(h.page.locator('#quickTabNew')), true, 'الجديد ليس الافتراضي');
        assert.match(text, /آخر محفوظ:\s*البقرة 5\s*←\s*يبدأ من:\s*البقرة 6/, 'سطر «آخر محفوظ ← يبدأ من»');
        assert.equal(await h.page.locator('#quick_new_toSurah_search').count(), 1, 'بحث السورة (2-10) غائب');
        await setField(h.page, 'quick_new_toAyah', 999);
        await h.page.waitForTimeout(100);
        assert.equal(await h.page.inputValue('#quick_new_toAyah'), '286', 'القصّ لآخر آية (2-9)');
        assert.equal(await visibleText(h.page, '#quickDisciplineAll'), 'استوفى المعايير');
        assert.equal(await visibleText(h.page, '#quickDisciplineHome'), 'التحضير المنزلي');
        assert.equal(await h.page.locator('#smartModal button').filter({ hasText: 'استثناءات' }).filter({ visible: true }).count() >= 1, true, 'زر «استثناءات»');
        await h.page.locator('#quickTabReview').click();
        assert.equal(await isSelected(h.page.locator('#quickTabReview')), true);
        assert.equal(await h.page.locator('#quick_review_row').isVisible(), true);
        assert.equal(await h.page.locator('#quick_new_row').isVisible(), false, 'صف الجديد ظاهر في تبويب المراجعة');
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

async function confirmFlow(h, id, MSG) {
    // التأكيد: سطر ظاهر في النافذة (الآلية القائمة) أو confirm() أصلي بالنص نفسه
    await pressSave(h.page);
    await h.page.waitForTimeout(300);
    const inline = (await visibleText(h.page, '#smartModal')).includes(MSG);
    const native = h.dialogs.some(d => d.message.includes(MSG));
    assert.ok(inline || native, `التأكيد «${MSG}» لم يظهر`);
    if (inline) {
        assert.equal((await studentWrites(h, id)).length, 0, 'حُفظ قبل التأكيد');
        await pressSave(h.page);
        await h.page.waitForTimeout(400);
    }
    assert.equal((await studentWrites(h, id)).length, 1, 'لم يُحفظ بعد التأكيد');
}
// أ8 (ق65): بعد ق64 قد تبقى نافذة الطالب التالي مفتوحة بعد الحفظ؛ تُغلق بـ✕ قبل فتح بطاقة أخرى (لا شيء إن كانت مغلقة).
async function closeQuick(h) {
    if (!await h.page.evaluate(() => document.getElementById('smartModal')?.classList.contains('flex'))) return;
    await h.page.locator('#generalQuickSection .qe-close').click();
    await h.page.waitForFunction(() => !document.getElementById('smartModal')?.classList.contains('flex'), null, { timeout: 3000 })
        .catch(async () => assert.fail('✕ لم يغلق النافذة. ' + await diagnose(h)));
}
test('و7 حفظ تبويب واحد ← التأكيد بنصّه (وعكسه)؛ «بلا مراجعة اليوم» الصريح يحفظ بلا تأكيد', async () => {
    const h = await teacherPage();
    try {
        await openAch(h, 1); await fillNew(h.page);
        await confirmFlow(h, 1, 'لم تُسجَّل مراجعة لهذا الطالب اليوم. حفظ الجديد فقط؟');
        await closeQuick(h);
        await openAch(h, 5); await fillReview(h.page);
        await confirmFlow(h, 5, 'لم يُسجَّل جديد لهذا الطالب اليوم. حفظ المراجعة فقط؟');
        await closeQuick(h);
        await h.page.locator('#teacherHalaqaTabs button').nth(1).click();
        await openAch(h, 6); await fillNew(h.page);
        await h.page.locator('#quickTabReview').click();
        await clickText(h.page, '#smartModal', /^\s*بلا مراجعة اليوم\s*$/, '«بلا مراجعة اليوم»');
        const before = h.dialogs.length;
        await pressSave(h.page);
        await h.page.waitForTimeout(400);
        assert.equal((await studentWrites(h, 6)).length, 1, 'الضغط الصريح لم يحفظ من أول مرة');
        assert.equal(h.dialogs.length, before, 'تأكيد ظهر مع الضغط الصريح');
    } finally { await h.close(); }
});

test('و8 بعد الحفظ: #teacherToast «حُفظ لفلان · تراجع» 6 ث، البطاقة «سُجّل» وتنزل؛ التراجع (ق43 = undoLastGeneralEntry) تسجيل واحد في كل ضغطة من الرسالة ثم من #quickTodayBox', async () => {
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
        assert.ok(toast.includes('حُفظ لأحمد') && toast.includes('تراجع'), `الرسالة: ${toast}`);
        assert.match(norm(await card(h.page, 1).innerText()), /سُجّل · ممتاز/);
        assert.deepEqual(await cardIds(h.page), [4, 5, 1, 2, 3], 'البطاقة لم تنزل');
        await shot(h.page, 'ص4-بعد-الحفظ-390');
        await h.page.waitForTimeout(6300);
        assert.equal(await h.page.locator('#teacherToast').isVisible().catch(() => false), false, 'الرسالة باقية بعد 6 ث');
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
        // ق43: الضغطة الأولى من الرسالة ← يبقى تسجيل واحد لهذه الهوية (لا حذف الحفظة كلها، ولا لا شيء).
        await clickText(h.page, '#teacherToast', /تراجع/, 'زر التراجع في الرسالة');
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
            const box = h.page.locator('body *').filter({ hasText: FIRST }).filter({ visible: true }).last();
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
        await openAch(h, 1); await fillNew(h.page); await fillReview(h.page);   // المدخلات صالحة للحفظ: لو مرّ Enter إلى الحفظ لكُتب الطالب
        await h.page.locator('#quickTabNew').click();
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

test('ح6 (ق43) «تراجع» في #teacherToast بعد حفظ الطالب أ ثم فتح الطالب ب ← التراجع يمسّ تسجيل أ لا ب', async () => {
    const h = await teacherPage();
    try {
        await saveBoth(h, 5, 'فهد');      // ب: له تسجيلان من هذا الجهاز
        // رسالة ب تغطي زر الحفظ في النافذة التالية حتى تختفي (6 ث)؛ ننتظرها كما ينتظرها المعلم.
        await h.page.locator('#teacherToast').waitFor({ state: 'detached', timeout: 7000 });
        await closeQuick(h);
        await saveBoth(h, 1, 'أحمد');     // أ: آخر حفظ، والرسالة له
        await closeQuick(h);
        assert.deepEqual([(await mineToday(h, 1)).length, (await mineToday(h, 5)).length], [2, 2], 'الشرط المسبق');
        await openAch(h, 5);              // فتح ب بعد الحفظ والرسالة ظاهرة
        assert.ok((await visibleText(h.page, '#teacherToast')).includes('حُفظ لأحمد'), 'الرسالة ليست لأحمد');
        await clickText(h.page, '#teacherToast', /تراجع/, 'زر التراجع في الرسالة');
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
        await clickText(h.page, '#teacherMoreSheet', /حذف الطالب/, '«حذف الطالب»');   // التأكيد الأول confirm() يقبله الهاركنس
        out.teacherDeleteSheet = await sheetSmallButtons(h, 'teacherDeleteSheet');
        await h.page.locator('#teacherDeleteSheet [data-cancel]').click();
        assert.ok(await h.doc('programs/general/seasons/s1/students/5'), 'الطالب 5 حُذف أثناء الفحص');
        for (const [id, r] of Object.entries(out)) assert.ok(r.count >= 1, `#${id}: لا أزرار ظاهرة`);
        return Object.fromEntries(Object.entries(out).filter(([, r]) => r.small.length).map(([id, r]) => [id, r.small]));
    } finally { await h.close(); }
}

// أ5 (ق58، ق54): ح8 الرسالة لا تلتقط اللمس؛ ح9 زرّا الانضباط مرة واحدة في كل فتحة للنافذة.
test('ح8 (ق54) #teacherToast لا تلتقط اللمس: نقطة نصّها تصيب ما تحتها (والنافذة مغلقة ومفتوحة)، والنقر في وسط «حفظ» للطالب التالي خلال الثواني الست يحفظ', async () => {
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
        assert.equal(await h.page.locator('#teacherToast').isVisible(), true, 'الرسالة اختفت قبل النقر (الشرط المسبق: خلال الثواني الست)');
        const openHit = await hit();
        assert.equal(openHit.inToast, false, `النافذة مفتوحة: نص الرسالة يلتقط اللمس (${openHit.at})`);
        const box = await h.page.locator('#generalQuickSaveBtn').boundingBox();
        const atSave = await h.page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return !!el?.closest('#generalQuickSaveBtn'); }, [box.x + box.width / 2, box.y + box.height / 2]);
        assert.equal(atSave, true, 'شيء فوق وسط زر «حفظ»');
        await h.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);   // نقرة حقيقية بالإحداثيات، بلا انتظار اختفاء الرسالة
        await h.page.locator('#teacherToast').filter({ hasText: 'حُفظ لفهد' }).waitFor({ state: 'visible', timeout: 4000 })
            .catch(async () => assert.fail('النقر في وسط «حفظ» والرسالة ظاهرة لم يحفظ. ' + await diagnose(h)));
        assert.equal((await mineToday(h, 5)).length, 2, 'لم يُكتب الطالب التالي');
    } finally { await h.close(); }
});

test('ح9 (ق58) فتح نافذة الإنجاز لثلاثة طلاب متتاليين ← «استوفى المعايير» و«التحضير المنزلي» زر واحد من كلٍّ في كل فتحة', async () => {
    const h = await teacherPage();
    try {
        const seen = [];
        for (const id of [1, 5, 4]) {
            await openAch(h, id);
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
        'إنجاز (patchStudent)': async h => { await openAch(h, 1); await fillNew(h.page); await fillReview(h.page); await pressSave(h.page); },
        '✎ تعديل': async h => { await openSheet(h, () => card(h.page, 1).locator('[data-a=edit]').click()); await h.page.fill('#tsName', 'أحمد علي'); await clickText(h.page, '#teacherStudentSheet', /حفظ/, 'زر الحفظ'); },
        'حذف (deleteStudentWithCopy)': async h => {
            await card(h.page, 1).locator('[data-a=more]').click();
            await clickText(h.page, '#teacherMoreSheet', /حذف الطالب/, '«حذف الطالب»');
            await h.page.locator('#tsDeleteName').fill('أحمد');
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
                denied: window.__fb.log.filter(l => l.result === 'permission-denied').map(l => l.op) })).catch(e => ({ evalError: e.message }));
            const after = await h.doc('programs/general/seasons/s1/students/1').catch(() => 'تعذّرت القراءة');
            results[label] = { خرج_بالرسالة: out, الهوية: st.user ?? null, التحميلات: st.loads, رفض_الخادم: (st.denied || []).length > 0,
                لا_كتابة: JSON.stringify(after) === JSON.stringify(before), ...(actErr ? { خطأ_الإجراء: actErr } : {}) };
        } finally { await h.close(); }
    }
    const expected = Object.fromEntries(Object.keys(actions).map(k => [k, { خرج_بالرسالة: true, الهوية: null, التحميلات: 2, رفض_الخادم: true, لا_كتابة: true }]));
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
        assert.match(line, /آخر محفوظ:\s*الأعلى\s19\s*←\s*يبدأ من:\s*الطارق\s1/, `الشرط المسبق: السطر ${line}`);
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

test('ح15 (ق64) وضع المعلم: مع تالٍ غير مسجَّل وغير غائب نص الزر «حفظ والتالي»؛ بعد حفظ ناجح تُفتح النافذة للتالي بترتيب البطاقات (أحمد ← سعد) والرسالة باقية؛ الحفظ الفاشل لا ينتقل', async () => {
    const h = await teacherPage();
    try {
        assert.deepEqual(await cardIds(h.page), [1, 4, 5, 2, 3], 'الشرط المسبق: ترتيب البطاقات');
        await openAch(h, 1);
        assert.equal(await saveLabel(h.page), 'حفظ والتالي', 'نص زر الحفظ لأحمد (التالي سعد)');
        await fillNew(h.page); await fillReview(h.page);
        const logBefore = (await h.fbLog()).length;
        await pressSave(h.page);
        await waitToast(h, 'أحمد');
        await waitWho(h, 'سعد', 'بعد حفظ أحمد');
        assert.equal(await h.page.evaluate(() => currentEditingStudentId), 4, 'النافذة المفتوحة ليست للطالب 4');
        assert.equal(await h.page.locator('#quick_positionAyah').isVisible(), true, 'نافذة سعد لم تُبنَ له (صندوق الموضع لطالب بلا موضع غائب)');
        assert.equal(await h.page.inputValue('#quick_new_toAyah'), '', 'نافذة سعد تحمل مدخلات أحمد');
        assert.equal((await mineToday(h, 1)).length, 2, 'تسجيلا أحمد لم يُحفظا');
        const writes = (await h.fbLog()).slice(logBefore).filter(l => (l.writes || []).length);
        assert.deepEqual(writes.map(l => l.writes.map(w => w.path).join(',')), ['programs/general/seasons/s1/students/1'], 'كتابات غير حفظ أحمد وحده');
        assert.ok((await visibleText(h.page, '#teacherToast')).includes('حُفظ لأحمد'), 'رسالة «حُفظ لأحمد · تراجع» ليست ظاهرة والنافذة التالية مفتوحة');
        assert.equal(await saveLabel(h.page), 'حفظ والتالي', 'نص زر الحفظ لسعد (التالي فهد)');
    } finally { await h.close(); }
    // الحفظ الفاشل (الخادم يرفض الكتابة) ← لا انتقال: النافذة لأحمد كما هي.
    const f = await teacherPage();
    try {
        await openAch(f, 1); await fillNew(f.page); await fillReview(f.page);
        await f.page.evaluate(() => { window.__fb.failWrites = { code: 'unavailable' }; });
        await pressSave(f.page);
        await f.page.waitForTimeout(800);
        assert.ok((await f.fbLog()).some(l => l.result === 'failed'), 'الشرط المسبق: لم تُحاول الكتابة');
        assert.deepEqual([await modalOpen(f.page), await quickWho(f.page), await f.page.evaluate(() => currentEditingStudentId)], [true, 'الإنجاز · أحمد', 1], 'الحفظ الفاشل انتقل أو أغلق');
        assert.equal(await saveLabel(f.page), 'حفظ والتالي', 'نص الزر تغيّر بعد الفشل');
    } finally { await f.close(); }
});

test('ح16 (ق64) بلا تالٍ: النص «حفظ» والحفظ يغلق النافذة؛ المسجَّل والغائب يُتخطَّيان؛ لا انتقال إلى تبويب آخر؛ ✕ يغلق بلا انتقال', async () => {
    const h = await teacherPage();
    try {
        // (أ) العصر: أحمد ← سعد ← فهد؛ بعد فهد لا يبقى إلا بدر (مسجَّل من جهاز آخر) وخالد (غائب) ← «حفظ» ويُغلق.
        await openAch(h, 1); await fillNew(h.page); await fillReview(h.page); await pressSave(h.page);
        await waitWho(h, 'سعد', 'بعد حفظ أحمد');
        await setField(h.page, 'quick_positionSurah', 2); await setField(h.page, 'quick_positionAyah', 5);
        await fillNew(h.page); await fillReview(h.page); await pressSave(h.page);
        await waitToast(h, 'سعد');
        await waitWho(h, 'فهد', 'بعد حفظ سعد');
        assert.equal(await saveLabel(h.page), 'حفظ', 'نص زر الحفظ لفهد (لا تالٍ: بدر مسجَّل وخالد غائب)');
        await fillNew(h.page); await fillReview(h.page); await pressSave(h.page);
        await waitToast(h, 'فهد');
        await h.page.waitForTimeout(800);
        assert.equal(await modalOpen(h.page), false, `النافذة لم تُغلق بعد آخر طالب (المفتوح: ${await quickWho(h.page)})`);
        const s2 = await h.doc('programs/general/seasons/s1/students/2'), s3 = await h.doc('programs/general/seasons/s1/students/3');
        assert.deepEqual([(await mineToday(h, 2)).length, s3.history?.[TODAY]?.attended, s3.history?.[TODAY]?.entries], [0, false, undefined], 'المسجَّل أو الغائب لم يُتخطَّ');
        assert.deepEqual(Object.keys(s2.history?.[TODAY]?.entries || {}), ['e_other_1'], 'تسجيل بدر تغيّر');
        // (ب) المغرب: عمر وماجد. ✕ على عمر يغلق بلا انتقال؛ حفظ عمر ← ماجد بـ«حفظ» ← يُغلق ولا يقفز إلى العصر.
        await h.page.waitForTimeout(6200);   // تنتهي رسالة فهد
        await h.page.locator('#teacherHalaqaTabs button').nth(1).click();
        await openAch(h, 6);
        assert.equal(await saveLabel(h.page), 'حفظ والتالي', 'نص زر الحفظ لعمر (التالي ماجد)');
        await h.page.locator('#generalQuickSection .qe-close').click();
        await h.page.waitForTimeout(600);
        assert.equal(await modalOpen(h.page), false, `✕ لم يغلق أو انتقل (المفتوح: ${await quickWho(h.page)})`);
        await openAch(h, 6); await fillNew(h.page); await fillReview(h.page); await pressSave(h.page);
        await waitWho(h, 'ماجد', 'بعد حفظ عمر');
        assert.equal(await saveLabel(h.page), 'حفظ', 'نص زر الحفظ لماجد (آخر المغرب؛ طلاب العصر لا يُحسبون)');
        await fillNew(h.page); await fillReview(h.page); await pressSave(h.page);
        await waitToast(h, 'ماجد');
        await h.page.waitForTimeout(800);
        assert.equal(await modalOpen(h.page), false, `النافذة لم تُغلق بعد ماجد (المفتوح: ${await quickWho(h.page)})`);
    } finally { await h.close(); }
});

// التسجيل المحفوظ قبل الميزة (التُقط 2026-11-17 على الشجرة نفسها قبل البناء، index.html cdcb4ab6…): حفظ أحمد بـ«إلى البقرة 10 ممتاز» + «الفاتحة 1–7 جيد»،
// بعد normalizePatch (مفتاح التسجيل ← نوعه، وحذف by). المشرف والمعلم متطابقان فيه حرفاً (ف1).
const PRE_FEATURE_PATCH = {"history.2026-11-22.attended":true,"history.2026-11-22.absence":{"__sentinel":"deleteField"},"history.2026-11-22.note":{"__sentinel":"deleteField"},"history.2026-11-22.hijri":"الأحد، ١٣ جمادى الآخرة ١٤٤٨ هـ","history.2026-11-22.entries.new":{"kind":"new","grade":"excellent","mult":3,"points":20,"spec":{"from":[2,6],"to":[2,10]},"iv":[12,16],"rep":1,"heardBy":"t1","halaqaId":"a1","stageId":"primary","at":1795338000000},"history.2026-11-22.entries.review":{"kind":"review","grade":"very-good","mult":1,"points":5.3,"spec":{"from":[1,1],"to":[1,7]},"iv":[0,6],"rep":1,"heardBy":"t1","halaqaId":"a1","stageId":"primary","at":1795338000001},"lastDailySurah":1,"lastDailyAyah":7,"lastDailySardRange":"من ٱلْفَاتِحَةِ (1) إلى ٱلْفَاتِحَةِ (7)"};
test('ح17 (ق64) المشرف بلا أي تغيير (النص «حفظ Enter ↵»، الحفظ يغلق ولا يفتح تالياً)، والتسجيل المحفوظ بـ«حفظ والتالي» مطابق بايتاً للتسجيل قبل الميزة', async () => {
    const one = async h => {
        const w = (await studentWrites(h, 1)).filter(l => l.op === 'updateDoc');
        assert.equal(w.length, 1, `عدد كتابات الطالب 1: ${w.length}. ${await diagnose(h)}`);
        assert.deepEqual(w[0].writes.map(x => [x.type, x.path]), [['update', 'programs/general/seasons/s1/students/1']]);
        return w[0].writes[0];
    };
    // (أ) المشرف: كما قبل الميزة.
    const a = await adminPage();
    try {
        await a.page.evaluate(() => openSmartModal(1));
        assert.equal(await saveLabel(a.page), 'حفظ Enter ↵', 'نص زر الحفظ للمشرف تغيّر');
        await fillNew(a.page); await fillReview(a.page); await pressSave(a.page);
        await a.page.waitForTimeout(1000);
        assert.equal(await modalOpen(a.page), false, `نافذة المشرف لم تُغلق أو فُتح تالٍ (${await quickWho(a.page)})`);
        assert.equal(JSON.stringify(normalizePatch(await one(a))), JSON.stringify(PRE_FEATURE_PATCH), 'تسجيل المشرف ليس بايتاً كما قبل الميزة');
    } finally { await a.close(); }
    // (ب) المعلم: الحفظ عبر «حفظ والتالي» يكتب التسجيل نفسه بايتاً، وby = uid المعلم.
    const h = await teacherPage();
    try {
        await openAch(h, 1);
        assert.equal(await saveLabel(h.page), 'حفظ والتالي', 'الشرط المسبق: زر «حفظ والتالي» غير موجود');
        await fillNew(h.page); await fillReview(h.page); await pressSave(h.page);
        await waitWho(h, 'سعد', 'بعد حفظ أحمد');
        const w = await one(h);
        assert.equal(JSON.stringify(normalizePatch(w)), JSON.stringify(PRE_FEATURE_PATCH), 'تسجيل المعلم بـ«حفظ والتالي» ليس بايتاً كما قبل الميزة');
        assert.deepEqual([...new Set(Object.entries(w.data).filter(([k]) => k.includes('.entries.')).map(([, v]) => v.by))], ['teacher-uid'], 'by');
    } finally { await h.close(); }
});

// أ8 (قرارات Fable ق66–ق68 على أسئلة أ7 س2–س4): ح18 التراجع والنافذة التالية مفتوحة، ح19 زر التأكيد وEnter، ح20 «التالي» يدور إلى أول القائمة.
test('ح18 (ق66) «تراجع» في الرسالة والنافذة التالية مفتوحة: يحذف تسجيل الطالب السابق وحده، والنافذة تبقى على التالي بما كُتب فيها، وحفظها بعده يُكتب للتالي', async () => {
    const h = await teacherPage();
    try {
        await openAch(h, 1); await fillNew(h.page); await fillReview(h.page); await pressSave(h.page);
        await waitToast(h, 'أحمد');
        await waitWho(h, 'سعد', 'بعد حفظ أحمد');
        // ما يكتبه المعلم في نافذة سعد قبل التراجع.
        await setField(h.page, 'quick_positionSurah', 2); await setField(h.page, 'quick_positionAyah', 5);
        await fillNew(h.page, 12);
        assert.deepEqual([(await mineToday(h, 1)).length, (await mineToday(h, 4)).length], [2, 0], 'الشرط المسبق');
        await clickText(h.page, '#teacherToast', /تراجع/, 'زر التراجع في الرسالة');
        await h.page.waitForTimeout(700);
        assert.deepEqual([(await mineToday(h, 1)).length, (await mineToday(h, 4)).length], [1, 0], 'التراجع لم يحذف تسجيلاً واحداً لأحمد وحده (أحمد، سعد)');
        const st = await h.page.evaluate(() => ({ open: document.getElementById('smartModal').classList.contains('flex'), who: document.getElementById('generalQuickName')?.innerText.replace(/\s+/g, ' ').trim(),
            id: currentEditingStudentId, posS: document.getElementById('quick_positionSurah')?.value, posA: document.getElementById('quick_positionAyah')?.value,
            toAyah: document.getElementById('quick_new_toAyah')?.value, grade: [...document.querySelectorAll('#quick_new_grades button[aria-pressed=true]')].map(b => b.innerText.trim()) }));
        assert.deepEqual([st.open, st.who, st.id], [true, 'الإنجاز · سعد', 4], 'النافذة لم تبقَ على سعد بعد التراجع');
        assert.deepEqual([st.posS, st.posA, st.toAyah, st.grade.length], ['2', '5', '12', 1], `ما كُتب في نافذة سعد ضاع: ${JSON.stringify(st)}`);
        assert.ok(st.grade[0].includes('ممتاز'), `تقدير الجديد لسعد تغيّر: ${st.grade}`);
        // الحفظ بعد التراجع يُكتب لسعد لا لأحمد.
        await fillReview(h.page); await pressSave(h.page);
        await waitToast(h, 'سعد');
        assert.deepEqual([(await mineToday(h, 1)).length, (await mineToday(h, 4)).length], [1, 2], 'الحفظ بعد التراجع لم يُكتب لسعد وحده (أحمد، سعد)');
    } finally { await h.close(); }
});

test('ح19 (ق67) زر «حفظ» في تأكيد التبويب الواحد وEnter يفتحان التالي كزر الحفظ الرئيسي؛ نص زر التأكيد يبقى «حفظ»', async () => {
    const h = await teacherPage();
    try {
        // (أ) تأكيد التبويب الواحد: جديد فقط لأحمد ← سطر التأكيد ← زرّه «حفظ» ← سعد.
        await openAch(h, 1); await fillNew(h.page); await pressSave(h.page);
        await h.page.locator('#quickOneSideConfirm').waitFor({ state: 'visible', timeout: 3000 }).catch(async () => assert.fail('سطر التأكيد لم يظهر. ' + await diagnose(h)));
        const btns = await h.page.$$eval('#quickOneSideConfirm button', bs => bs.filter(b => b.getClientRects().length).map(b => b.innerText.trim()));
        assert.ok(btns.includes('حفظ') && !btns.some(t => t.includes('التالي')), `أزرار التأكيد: ${JSON.stringify(btns)} (المطلوب «حفظ» كما هو)`);
        await h.page.locator('#quickOneSideConfirm button').filter({ hasText: /^\s*حفظ\s*$/ }).click();
        await waitToast(h, 'أحمد');
        assert.equal((await mineToday(h, 1)).length, 1, 'زر التأكيد لم يحفظ الجديد لأحمد');
        await waitWho(h, 'سعد', 'بعد زر «حفظ» في التأكيد');
        // (ب) Enter في حقل نافذة سعد ← يحفظ ← فهد.
        await setField(h.page, 'quick_positionSurah', 2); await setField(h.page, 'quick_positionAyah', 5);
        await fillNew(h.page); await fillReview(h.page);
        await h.page.evaluate(() => typeof updateGeneralQuickPreview === 'function' && updateGeneralQuickPreview());
        await h.page.locator('#quick_review_toAyah').focus();
        await h.page.keyboard.press('Enter');
        await waitToast(h, 'سعد');
        assert.equal((await mineToday(h, 4)).length, 2, 'Enter لم يحفظ لسعد');
        await waitWho(h, 'فهد', 'بعد Enter');
    } finally { await h.close(); }
});

test('ح20 (ق68) «التالي» = أول غير مسجَّل وغير غائب غير الحالي بترتيب البطاقات الظاهر، ويدور إلى أول القائمة: فهد ← أحمد ← سعد ← لا تالٍ', async () => {
    const h = await teacherPage();
    try {
        assert.deepEqual(await cardIds(h.page), [1, 4, 5, 2, 3], 'الشرط المسبق: ترتيب البطاقات');
        // فهد آخر غير المسجَّلين؛ بعده بدر (مسجَّل) وخالد (غائب) ← يدور إلى أحمد.
        await openAch(h, 5);
        assert.equal(await saveLabel(h.page), 'حفظ والتالي', 'نص زر فهد (يدور إلى أحمد)');
        await fillNew(h.page); await fillReview(h.page); await pressSave(h.page);
        await waitToast(h, 'فهد');
        await waitWho(h, 'أحمد', 'بعد حفظ فهد (الدوران إلى أول القائمة)');
        assert.equal(await saveLabel(h.page), 'حفظ والتالي', 'نص زر أحمد (التالي سعد)');
        await fillNew(h.page); await fillReview(h.page); await pressSave(h.page);
        await waitWho(h, 'سعد', 'بعد حفظ أحمد');
        assert.equal(await saveLabel(h.page), 'حفظ', 'نص زر سعد (لم يبقَ غيره)');
        await setField(h.page, 'quick_positionSurah', 2); await setField(h.page, 'quick_positionAyah', 5);
        await fillNew(h.page); await fillReview(h.page); await pressSave(h.page);
        await waitToast(h, 'سعد');
        await h.page.waitForTimeout(800);
        assert.equal(await modalOpen(h.page), false, `النافذة لم تُغلق بعد آخر طالب (المفتوح: ${await quickWho(h.page)})`);
        assert.deepEqual([1, 4, 5].map(() => 2), await Promise.all([1, 4, 5].map(async id => (await mineToday(h, id)).length)), 'لم يُحفظ الثلاثة');
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
            tabs: [r(document.getElementById('quickTabNew')), r(document.getElementById('quickTabReview'))] };
    });
}
const overlap = (a, b) => !!a && !!b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
test('ح21 (ق70) وضع المعلم والنافذة التالية مفتوحة: #teacherToast ثابتة فوق شريط الحفظ #generalQuickFooter ولا تغطي التبويبين؛ وبعد إغلاق النافذة تعود إلى مكانها القديم أسفل الصفحة (bottom 16px)', async () => {
    const h = await teacherPage();
    try {
        await openAch(h, 1); await fillNew(h.page); await fillReview(h.page); await pressSave(h.page);
        await waitToast(h, 'أحمد');
        await waitWho(h, 'سعد', 'بعد حفظ أحمد');
        await h.page.waitForTimeout(150);
        const g = await toastGeometry(h.page);
        assert.ok(g.toast && g.footer && g.tabs.every(Boolean), `الشرط المسبق: الرسالة أو الشريط أو التبويبان غير ظاهرة ${JSON.stringify(g)}`);
        assert.equal(g.position, 'fixed', 'الرسالة ليست ثابتة');
        // «فوق شريط الحفظ» = ملاصقة لأعلاه (فجوة 0–24px)، لا أي موضع أعلى الشاشة.
        assert.ok(g.toast.bottom <= g.footer.top + 0.5 && g.footer.top - g.toast.bottom <= 24,
            `الرسالة ليست فوق شريط الحفظ مباشرة: أسفلها ${g.toast.bottom} وأعلى الشريط ${g.footer.top}`);
        assert.ok(g.toast.top >= 0 && g.toast.bottom <= g.vh, `الرسالة خارج الشاشة ${JSON.stringify(g.toast)}`);
        assert.deepEqual(g.tabs.map(t => overlap(g.toast, t)), [false, false], `الرسالة تغطي تبويب [الجديد، المراجعة] ${JSON.stringify(g)}`);
        assert.equal(overlap(g.toast, g.save), false, 'الرسالة تغطي زر «حفظ»');
        // ✕ والرسالة ما زالت ظاهرة ← المكان القديم أسفل الصفحة (ق54).
        await closeQuick(h);
        const c = await toastGeometry(h.page);
        assert.ok(c.toast, 'الرسالة اختفت بإغلاق النافذة (الشرط المسبق: خلال الثواني الست)');
        assert.deepEqual([c.position, c.bottom], ['fixed', '16px'], 'بلا نافذة: الرسالة ليست في مكانها القديم (fixed، bottom 16px)');
        assert.ok(Math.abs(c.vh - c.toast.bottom - 16) <= 1, `بلا نافذة: أسفل الرسالة ${c.toast.bottom} لا يبعد 16 عن أسفل الشاشة ${c.vh}`);
    } finally { await h.close(); }
});

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
