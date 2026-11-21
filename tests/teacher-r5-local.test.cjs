// الجولة 5 «الشريط الباقي» (ق189–ق190) — اختبار القبول الأحمر م1–م11، 2026-11-20، كاتب اختبار أ29.
// المرجع الوحيد: D:\المهره\notes\features\accounts\teacher-r5-card.md (القسم 2 والقسم 3)، المبني عليه index.html c1a3af94….
// الهاركنس: tests/helpers/teacher-ui-harness.cjs (فايربيس وهمي + index.html كما هو، Playwright بلا واجهة، 390×844).
//
// طريقة الوقت (م1، م2، م7): ساعة الهاركنس ثابتة لـDate وحده (Date.now لا يتقدّم)، أما setTimeout فحقيقي؛ ومؤقت الشريط الحالي
// setTimeout(…, 6000). لذلك الانتظار هنا انتظار حقيقي: 10 ث في م1/م2 (≤ 11 ث)، و4.5 ث ثم 6.8 ث في م7. لا page.clock (يتعارض مع Date المستبدَل في الهاركنس).
//
// افتراضات الاختبار فيما لم تسمّه البطاقة بالحرف (تُلزم الباني، ومذكورة في التقرير):
//   • «×» = زر داخل #teacherToast له aria-label="إغلاق الرسالة" (البطاقة 2-ب). تسمية الزر في المقارنات = aria-label إن وُجد وإلا نصّه.
//   • «أبيض» (2-ب) = لون النص المحسوب rgb(255, 255, 255)؛ 44×44 = عرض وارتفاع ≥ 44.
//   • ترتيب الأزرار (س2): «تراجع» ثم «×» في ترتيب DOM وترتيب Tab.
//   • «الشريط يُزال قبل ظهور النافذة» (م4) = في سجلّ MutationObserver: خروج #teacherToast من DOM يسبق أخذ #smartModal الصنف flex.
//   • م8: «آخر بطاقة كاملة فوق الشريط» = مستطيل آخر .teacher-card لا يتقاطع مع #teacherToast بعد التمرير إلى آخر الصفحة، والفجوة بينهما ≥ 16px
//     (البطاقة 2-د: الحشو = ارتفاع الشريط + 16px)، ومركز «الإنجاز» فيها يصيب الزر نفسه (elementFromPoint).
//     البذرة بلا الطالب الغائب (خالد) لأن «الإنجاز» في بطاقة الغائب معطّل بطبعه، فتكون آخر بطاقة بطاقةً زرّها يُضغط.
//   • م2 «البطاقة تعود»: الحفظ بقسم واحد (ورقة ق78 «احفظ الجديد فقط») حتى يكون تراجع واحد (ق43) = لا تسجيل، فتعود البطاقة «لم يُسجَّل» وإلى مكانها.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const H = require('./helpers/teacher-ui-harness.cjs');

const TODAY = H.TODAY;
const AHMAD = 1, SAAD = 4, FAHD = 5;
let browser;
before(async () => {
    const playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); });

// ===== أدوات (من teacher-ui-local بلا تغيير في معناها) =====
const norm = s => String(s || '').replace(/[\u2066-\u2069\u200e\u200f\u061c]/g, '').replace(/\s+/g, ' ').trim();
const ach = id => `.teacher-card[data-id="${id}"] [data-a=ach]`;
async function teacherPage(seed = {}) {
    let h;
    try { h = await H.openPage(browser, { user: H.TEACHER_USER, seed: { teacherUser: true, ...seed } }); }
    catch (_) { h = await H.openPage(browser, { user: H.TEACHER_USER, seed: { teacherUser: true, ...seed } }); }
    await h.page.locator('#teacherHome').waitFor({ state: 'attached', timeout: 8000 });
    await h.page.locator(ach(AHMAD)).waitFor({ state: 'visible', timeout: 8000 });
    await h.page.waitForTimeout(300);
    return h;
}
async function adminPage() {
    const h = await H.openPage(browser, { user: H.ADMIN_USER, seed: {}, width: 1280, height: 900 });
    await h.page.waitForFunction(() => window.almahraPrograms?.getCurrentProgramId?.() === 'general' && window.almahraData?.isReady?.(), null, { timeout: 15000 });
    await h.page.locator('#loadingOverlay').waitFor({ state: 'hidden' }).catch(() => {});
    return h;
}
async function setField(page, id, value) {
    const ok = await page.evaluate(([id, value]) => {
        const el = document.getElementById(id); if (!el) return false;
        el.value = String(value); ['input', 'change'].forEach(t => el.dispatchEvent(new Event(t, { bubbles: true }))); return true;
    }, [id, value]);
    assert.ok(ok, `الحقل #${id} غير موجود`);
}
async function grade(page, kind, name) {
    const b = page.locator(`#quick_${kind}_grades button`).filter({ hasText: name }).first();
    assert.ok(await b.count(), `زر التقدير «${name}» غير موجود في #quick_${kind}_grades`);
    await b.click();
}
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
    await H.confirmBehavior(page);
    await page.evaluate(() => typeof updateGeneralQuickPreview === 'function' && updateGeneralQuickPreview());
    await page.locator('#generalQuickSaveBtn').click();
}
const mineToday = async (h, id) => Object.values((await h.doc('programs/general/seasons/s1/students/' + id))?.history?.[TODAY]?.entries || {}).filter(e => e.by === 'teacher-uid');
const modalOpen = page => page.evaluate(() => document.getElementById('smartModal').classList.contains('flex'));
async function waitToast(h, text) {
    await h.page.locator('#teacherToast').filter({ hasText: text }).waitFor({ state: 'visible', timeout: 4000 })
        .catch(async () => assert.fail(`«${text}» لم تظهر في #teacherToast. أخطاء الصفحة: ${JSON.stringify(h.errors.slice(0, 3))}`));
}
// حفظ القسمين (جديد + مراجعة) ← تُغلق النافذة ويظهر «حُفظ لفلان».
async function saveBoth(h, id, name) {
    await H.openAch(h, id); await fillNew(h.page); await fillReview(h.page); await pressSave(h.page);
    await waitToast(h, 'حُفظ ل' + name);
    await h.page.waitForFunction(() => !document.getElementById('smartModal').classList.contains('flex'), null, { timeout: 4000 });
}
// حال الشريط كما يراه المعلم: ظاهر؟ نصّه (span)، وأزراره بالترتيب (aria-label وإلا النص).
function toastState(page) {
    return page.evaluate(() => {
        const t = document.getElementById('teacherToast');
        if (!t || !t.getClientRects().length) return { ظاهر: false };
        return { ظاهر: true, النص: (t.querySelector('span')?.innerText || '').replace(/\s+/g, ' ').trim(),
            الأزرار: [...t.querySelectorAll('button')].filter(b => b.getClientRects().length).map(b => b.getAttribute('aria-label') || b.innerText.trim()) };
    });
}
const cardIds = page => page.$$eval('#teacherStudentList .teacher-card[data-id]', els => els.filter(e => e.getClientRects().length).map(e => Number(e.dataset.id)));
const badge = (page, id) => page.locator(`.teacher-card[data-id="${id}"] .tch-badge`).innerText().then(norm);
// سجلّ ترتيب الأحداث: خروج #teacherToast من DOM، وأخذ #smartModal الصنف flex.
function startOrderLog(page) {
    return page.evaluate(() => {
        window.__order = [];
        const m = document.getElementById('smartModal');
        window.__orderObs?.forEach(o => o.disconnect());
        const o1 = new MutationObserver(recs => { for (const r of recs) for (const n of r.removedNodes) if (n.id === 'teacherToast') window.__order.push('أُزيل الشريط'); });
        o1.observe(document.body, { childList: true });
        let was = m.classList.contains('flex');
        const o2 = new MutationObserver(() => { const now = m.classList.contains('flex'); if (now && !was) window.__order.push('ظهرت النافذة'); was = now; });
        o2.observe(m, { attributes: true, attributeFilter: ['class'] });
        window.__orderObs = [o1, o2];
    });
}
const orderLog = page => page.evaluate(() => window.__order.slice());

// =====================================================================================
// م1–م3: البقاء بلا مؤقت، «تراجع» بعد 10 ث، «×»
// =====================================================================================
// ب14 (ق205): كان الشريط بزرين ويبقى 10 ث؛ صار بلا أزرار ويختفي بعد 6 ث.
test('م1/ت1 حفظ أحمد ← رسالة بلا أزرار وتختفي بعد 6.3 ث', async () => {
    const h = await teacherPage();
    try {
        await saveBoth(h, AHMAD, 'أحمد');
        const got = { فوراً: await toastState(h.page) };
        await h.page.waitForTimeout(6300);
        got.بعد_6_3ث = await toastState(h.page);
        assert.deepEqual(got, { فوراً: { ظاهر: true, النص: 'حُفظ لأحمد', الأزرار: [] }, بعد_6_3ث: { ظاهر: false } }, `م1 الظاهر: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

// ب14 (ق205): كان التراجع من الشريط بعد 10 ث؛ صار من صندوق «سُجّل اليوم» في النافذة.
test('م2/ت3 حفظ أحمد بقسم واحد ثم تراجع الصندوق ← لا تسجيل والبطاقة تعود', async () => {
    const h = await teacherPage();
    try {
        const order0 = await cardIds(h.page);
        await H.openAch(h, AHMAD); await fillNew(h.page); await pressSave(h.page);
        await h.page.waitForTimeout(300);
        await H.sheetButton(h.page, 'احفظ الجديد فقط').catch(e => assert.fail(e.message));
        await waitToast(h, 'حُفظ لأحمد');
        assert.equal((await mineToday(h, AHMAD)).length, 1, 'الشرط المسبق: تسجيل واحد لأحمد');
        assert.equal(await badge(h.page, AHMAD), 'سُجّل · ممتاز', 'الشرط المسبق: البطاقة «سُجّل»');
        const got = { أزرار_الشريط: (await toastState(h.page)).الأزرار };
        await H.openAch(h, AHMAD);
        await h.page.locator('#quickTodayBox button').filter({ hasText: 'تراجع' }).first().click();
        await h.page.waitForTimeout(700);
        Object.assign(got, { تسجيلات_أحمد: (await mineToday(h, AHMAD)).length, الشريط: await h.page.locator('#teacherToast').count(),
            البطاقة: await badge(h.page, AHMAD), الترتيب: await cardIds(h.page), النافذة: await modalOpen(h.page) });
        assert.deepEqual(got, { أزرار_الشريط: [], تسجيلات_أحمد: 0, الشريط: 0, البطاقة: 'لم يُسجَّل', الترتيب: order0, النافذة: true }, `م2 الظاهر: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

// ب14 (ق205): كان إغلاق «×»؛ صار اختفاء الرسالة تلقائياً والتسجيل باقٍ.
test('م3/ت2 شريط الحفظ بلا «×» ويختفي تلقائياً مع بقاء التسجيلين', async () => {
    const h = await teacherPage();
    try {
        await saveBoth(h, AHMAD, 'أحمد');
        const got = { الأزرار: (await toastState(h.page)).الأزرار };
        await h.page.waitForTimeout(6300);
        got.الشريط = await h.page.locator('#teacherToast').count();
        await h.page.waitForTimeout(1000);
        got.تسجيلات_أحمد = (await mineToday(h, AHMAD)).length;
        assert.deepEqual(got, { الأزرار: [], الشريط: 0, تسجيلات_أحمد: 2 }, `م3 الظاهر: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

// =====================================================================================
// م4–م6: ما يزيل الشريط وما يستبدله
// =====================================================================================
test('م4 فتح «الإنجاز» لأحمد نفسه ثم لطالب آخر (سعد) والشريط ظاهر ← الشريط يُزال قبل ظهور النافذة؛ و«سُجّل اليوم … تراجع» في نافذة أحمد يحذف تسجيلاً واحداً', async () => {
    const h = await teacherPage();
    try {
        const got = {};
        // (أ) الطالب نفسه
        await saveBoth(h, AHMAD, 'أحمد');
        await startOrderLog(h.page);
        await H.openAch(h, AHMAD);
        await h.page.waitForTimeout(200);
        got.نفسه = { الترتيب: await orderLog(h.page), الشريط: await toastState(h.page) };
        const box = h.page.locator('#quickTodayBox button').filter({ hasText: /تراجع/ }).filter({ visible: true }).first();
        got.نفسه.تراجع_الصندوق = await box.count() ? 'موجود' : 'غائب';
        if (await box.count()) { await box.click(); await h.page.waitForTimeout(700); }
        got.نفسه.تسجيلات_أحمد = (await mineToday(h, AHMAD)).length;
        await H.closeAch(h.page);
        // (ب) طالب آخر
        await saveBoth(h, FAHD, 'فهد');
        await startOrderLog(h.page);
        await H.openAch(h, SAAD);
        await h.page.waitForTimeout(200);
        got.آخر = { الترتيب: await orderLog(h.page), الشريط: await toastState(h.page), النافذة: norm(await h.page.locator('#smartStudentName').innerText()) };
        assert.deepEqual(got, {
            نفسه: { الترتيب: ['أُزيل الشريط', 'ظهرت النافذة'], الشريط: { ظاهر: false }, تراجع_الصندوق: 'موجود', تسجيلات_أحمد: 1 },
            آخر: { الترتيب: ['أُزيل الشريط', 'ظهرت النافذة'], الشريط: { ظاهر: false }, النافذة: 'سعد' } }, `م4 الظاهر: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

// ب14 (ق205): كان تراجع فهد من الشريط؛ صار من صندوق نافذته.
test('م5/ت3 حفظ أحمد ثم فهد ← شريط فهد يحل محله وتراجع الصندوق يمسّ فهد وحده', async () => {
    const h = await teacherPage();
    try {
        await saveBoth(h, AHMAD, 'أحمد');
        await saveBoth(h, FAHD, 'فهد');
        const got = { عدد_الشرائط: await h.page.locator('#teacherToast').count(), النص: (await toastState(h.page)).النص };
        got.الأزرار = (await toastState(h.page)).الأزرار;
        await H.openAch(h, FAHD);
        await h.page.locator('#quickTodayBox button').filter({ hasText: 'تراجع' }).first().click();
        await h.page.waitForTimeout(700);
        got.بعد_التراجع = { أحمد: (await mineToday(h, AHMAD)).length, فهد: (await mineToday(h, FAHD)).length };
        assert.deepEqual(got, { عدد_الشرائط: 1, النص: 'حُفظ لفهد', الأزرار: [], بعد_التراجع: { أحمد: 2, فهد: 1 } }, `م5 الظاهر: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

test('م6 تبديل الحلقة من الرأس والشريط ظاهر ← الشريط يُزال', async () => {
    const h = await teacherPage();
    try {
        await saveBoth(h, AHMAD, 'أحمد');
        await h.page.locator('#teacherHalaqaTabs [data-halaqa="m1"]').click();
        await h.page.waitForTimeout(300);
        const got = { الحلقة_المختارة: await h.page.locator('#teacherHalaqaTabs [data-halaqa="m1"]').getAttribute('aria-pressed'), الشريط: await toastState(h.page) };
        assert.deepEqual(got, { الحلقة_المختارة: 'true', الشريط: { ظاهر: false } }, `م6 الظاهر: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

// =====================================================================================
// م7: الشرائط بلا تراجع كما كانت
// =====================================================================================
test('م7 (حارس) «سُجّل غياب» / «أُلغي غياب» / «حُفظت بيانات الطالب» / «حُذف فلان؛ يستعيده المشرف» ← بلا «×» ولا «تراجع»، ظاهرة عند 4.5 ث وتختفي عند 6.8 ث', async () => {
    const h = await teacherPage();
    const got = {}, want = {};
    async function watch(name, text) {
        await waitToast(h, text);
        const s0 = await toastState(h.page);
        await h.page.waitForTimeout(4500);
        const at45 = (await toastState(h.page)).ظاهر;
        await h.page.waitForTimeout(2300);
        got[name] = { النص: s0.النص, الأزرار: s0.الأزرار, عند_4_5: at45, عند_6_8: (await toastState(h.page)).ظاهر };
        want[name] = { النص: text, الأزرار: [], عند_4_5: true, عند_6_8: false };
    }
    try {
        await h.page.locator(`.teacher-card[data-id="${AHMAD}"] [data-a=absent]`).click();
        await h.page.locator('button').filter({ hasText: /^\s*بغير عذر\s*$/ }).filter({ visible: true }).first().click();
        await watch('غياب', 'سُجّل غياب أحمد');
        await h.page.locator(`.teacher-card[data-id="${AHMAD}"] [data-a=absent]`).click();
        await watch('إلغاء_الغياب', 'أُلغي غياب أحمد');
        await h.page.locator(`.teacher-card[data-id="${AHMAD}"] [data-a=edit]`).click();
        await h.page.locator('#teacherStudentSheet').waitFor({ state: 'visible', timeout: 3000 });
        await h.page.fill('#tsName', 'أحمد علي');
        await h.page.locator('#teacherStudentSheet button').filter({ hasText: /حفظ/ }).filter({ visible: true }).first().click();
        await watch('بيانات', 'حُفظت بيانات الطالب');
        await h.page.locator(`.teacher-card[data-id="${FAHD}"] [data-a=more]`).click();
        await h.page.locator('#teacherMoreSheet button').filter({ hasText: /حذف الطالب/ }).first().click();
        await h.page.locator('#teacherDeleteAskSheet [data-go]').click();
        await h.page.fill('#tsDeleteName', 'فهد');
        await h.page.locator('button').filter({ hasText: /^\s*حذف نهائي\s*$/ }).filter({ visible: true }).first().click();
        await watch('حذف', 'حُذف فهد؛ يستعيده المشرف');
        assert.deepEqual(got, want, `م7 الظاهر: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

// =====================================================================================
// م8–م10: الهندسة واللمس ولوحة المفاتيح
// =====================================================================================
test('م8 الشريط ظاهر والتمرير إلى آخر القائمة ← آخر بطاقة كاملة فوقه بفجوة ≥ 16px (لا تقاطع)، ومركز «الإنجاز» فيها يصيب الزر', async () => {
    const list = H.students(); delete list[3];   // بلا الغائب: آخر بطاقة «الإنجاز» فيها غير معطّل
    const h = await teacherPage({ list });
    try {
        await saveBoth(h, AHMAD, 'أحمد');
        await h.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await h.page.waitForTimeout(200);
        const g = await h.page.evaluate(() => {
            const cards = [...document.querySelectorAll('#teacherStudentList .teacher-card')].filter(e => e.getClientRects().length);
            const last = cards[cards.length - 1], t = document.getElementById('teacherToast');
            if (!last || !t) return { خطأ: 'لا بطاقة أو لا شريط', شريط: !!t };
            const c = last.getBoundingClientRect(), r = t.getBoundingClientRect(), b = last.querySelector('[data-a=ach]').getBoundingClientRect();
            const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
            return { آخر_بطاقة: last.dataset.id, أسفل_البطاقة: Math.round(c.bottom), أعلى_الشريط: Math.round(r.top), قابل_للتمرير: document.documentElement.scrollHeight > innerHeight,
                تقاطع: c.left < r.right && r.left < c.right && c.top < r.bottom && r.top < c.bottom, الفجوة: Math.round(r.top - c.bottom),
                الإنجاز_يُصاب: !!hit?.closest('[data-a=ach]') && last.contains(hit) };
        });
        const got = { قابل_للتمرير: g.قابل_للتمرير, تقاطع: g.تقاطع, فجوة_16: g.الفجوة >= 16, الإنجاز_يُصاب: g.الإنجاز_يُصاب };
        assert.deepEqual(got, { قابل_للتمرير: true, تقاطع: false, فجوة_16: true, الإنجاز_يُصاب: true }, `م8 الظاهر: ${JSON.stringify(g)}`);
    } finally { await h.close(); }
});

// م12 (قرار Fable على س1، 2026-11-20): زر «+ طالب جديد» لا يُغطّى أيضاً. افتراض: «قابل للنقر» = مركزه يصيب الزر (elementFromPoint)،
// والنقر الحقيقي بالإحداثيات في مركزه يُظهر #teacherStudentSheet.
test('م12 الشريط ظاهر والتمرير إلى أسفل الصفحة ← «+ طالب جديد» كامل فوق الشريط بفجوة ≥ 16px (لا تقاطع)، والنقر في مركزه يفتح ورقة «طالب جديد»', async () => {
    const h = await teacherPage();
    try {
        await saveBoth(h, AHMAD, 'أحمد');
        await h.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await h.page.waitForTimeout(200);
        const g = await h.page.evaluate(() => {
            const b = document.getElementById('teacherAddStudentBtn'), t = document.getElementById('teacherToast');
            if (!b || !t) return { خطأ: 'لا زر أو لا شريط', شريط: !!t };
            const c = b.getBoundingClientRect(), r = t.getBoundingClientRect();
            const hit = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
            return { الزر: [Math.round(c.top), Math.round(c.bottom)], الشريط: [Math.round(r.top), Math.round(r.bottom)], x: c.left + c.width / 2, y: c.top + c.height / 2,
                تقاطع: c.left < r.right && r.left < c.right && c.top < r.bottom && r.top < c.bottom, الفجوة: Math.round(r.top - c.bottom),
                المركز_يصيب: !!hit?.closest('#teacherAddStudentBtn') };
        });
        let opened = false;
        if (g.x != null) {
            await h.page.mouse.click(g.x, g.y);
            opened = await h.page.locator('#teacherStudentSheet').waitFor({ state: 'visible', timeout: 2000 }).then(() => true, () => false);
        }
        const got = { تقاطع: g.تقاطع, فجوة_16: g.الفجوة >= 16, المركز_يصيب: g.المركز_يصيب, الورقة_فُتحت: opened };
        assert.deepEqual(got, { تقاطع: false, فجوة_16: true, المركز_يصيب: true, الورقة_فُتحت: true }, `م12 الظاهر: ${JSON.stringify({ ...g, الورقة_فُتحت: opened })}`);
    } finally { await h.close(); }
});

// م13 (بلاغ المالك، 2026-11-20): أيقونتا القلم و«⋯» في بطاقة الطالب غير متمركزتين. على 390، أول بطاقة ظاهرة:
// مركز مستطيل svg داخل [data-a=edit] و[data-a=more] يطابق مركز مستطيل الزر في المحورين بفارق ≤ 0.5px. لا يقيس شكل مسار القلم.
test('م13 أيقونتا ✎ و⋯ في أول بطاقة متمركزتان في زرّيهما: فرق المركزين أفقياً وعمودياً ≤ 0.5px', async () => {
    const h = await teacherPage();
    try {
        const got = await h.page.evaluate(() => {
            const card = [...document.querySelectorAll('#teacherStudentList .teacher-card')].find(e => e.getClientRects().length);
            return Object.fromEntries(['edit', 'more'].map(a => {
                const b = card.querySelector(`[data-a=${a}]`), s = b?.querySelector('svg');
                if (!b || !s) return [a, 'لا زر أو لا svg'];
                const rb = b.getBoundingClientRect(), rs = s.getBoundingClientRect();
                const r2 = v => Math.round(v * 100) / 100;
                return [a, { أفقي: r2((rs.left + rs.width / 2) - (rb.left + rb.width / 2)), عمودي: r2((rs.top + rs.height / 2) - (rb.top + rb.height / 2)) }];
            }));
        });
        const ok = v => typeof v === 'object' && Math.abs(v.أفقي) <= 0.5 && Math.abs(v.عمودي) <= 0.5;
        assert.deepEqual({ edit: ok(got.edit), more: ok(got.more) }, { edit: true, more: true }, `م13 الظاهر (svg − الزر، px): ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

// ب14 (ق205): كان حارس التقاط الزرين؛ صار حارس نص الرسالة وبلا أزرار.
test('م9 (حارس ح8) نص الشريط لا يلتقط اللمس ولا أزرار في رسالة الحفظ', async () => {
    const h = await teacherPage();
    try {
        await saveBoth(h, AHMAD, 'أحمد');
        const got = await h.page.evaluate(() => {
            const t = document.getElementById('teacherToast'), span = t.querySelector('span');
            const center = e => { const r = e.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); };
            const s = center(span);
            return { النص_يلتقط: !!s && t.contains(s), الأزرار: [...t.querySelectorAll('button')].map(b => ({ [b.getAttribute('aria-label') || b.innerText.trim()]: center(b)?.closest('button') === b })) };
        });
        assert.equal(got.النص_يلتقط, false, `نص الشريط يلتقط اللمس: ${JSON.stringify(got)}`);
        assert.deepEqual(got.الأزرار, [], `رسالة الحفظ فيها أزرار: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

// ب14 (ق205): حُذف م10؛ كان Tab بين «تراجع» و«×»، وصار شريط الحفظ بلا أزرار.

// =====================================================================================
// م11: المشرف كما هو
// =====================================================================================
test('م11 (حارس) المشرف: حفظ إنجاز من نافذته ← teacherShowToast لا تُستدعى، ولا #teacherToast ولا زر «إغلاق الرسالة» في DOM', async () => {
    const a = await adminPage();
    try {
        await a.page.evaluate(() => { window.__tst = 0; const o = window.teacherShowToast; window.teacherShowToast = function (...x) { window.__tst++; return o.apply(this, x); }; });
        await H.openAch(a, AHMAD); await fillNew(a.page); await fillReview(a.page); await pressSave(a.page);
        await a.page.waitForFunction(() => !document.getElementById('smartModal').classList.contains('flex'), null, { timeout: 4000 });
        await a.page.waitForTimeout(500);
        const got = await a.page.evaluate(() => ({ teacherMode: document.body.classList.contains('teacher-mode'), استدعاءات: window.__tst,
            الشريط: document.querySelectorAll('#teacherToast').length, زر_الإغلاق: document.querySelectorAll('[aria-label="إغلاق الرسالة"]').length }));
        got.حُفظ = Object.keys((await a.doc('programs/general/seasons/s1/students/1')).history?.[TODAY]?.entries || {}).length > 0;
        assert.deepEqual(got, { teacherMode: false, استدعاءات: 0, الشريط: 0, زر_الإغلاق: 0, حُفظ: true }, `م11 الظاهر: ${JSON.stringify(got)}`);
    } finally { await a.close(); }
});

// =====================================================================================
// م14–م16: إصلاح ج12 (ف1، ق196) — «ما دام زر «تراجع» ظاهراً فضغطه يتراجع دائماً» (البطاقة teacher-r5-card.md القسم 0)، أ30، 2026-11-20.
// افتراضات (تُلزم الباني):
//   • م14 «تغيّر اليوم» = استبدال Date في الصفحة إلى 2026-11-23 (يوم التالي ليوم الهاركنس الدراسي) ثم refreshToday() مباشرة،
//     كما في مسبار المراجع review/probe-day2.cjs (المؤقت setInterval(refreshToday, 60000) هو من يستدعيها في الواقع).
//   • م15 «الشريط يُزال» = لا #teacherToast فيه زر «تراجع» ولا نص «حُفظ لأحمد». «الرسالة ظاهرة» = النص «لا يوجد ما يُتراجع عنه»
//     ظاهر في #teacherToast (شريط المعلم) وحده عبر teacherShowToast — ق197 (2026-11-20) ضيّق القبول؛ ظهوره في #toastMessage وحده لا يكفي.
//     «لا كتابة» = لا عملية جديدة في سجلّ القاعدة الوهمية (__fb.log) فيها writes بعد الضغط.
//   • م16 الخروج: signOut مستبدَلة بوعد لا ينتهي (كمسبار المراجع) حتى لا تمحو إعادة التحميل الدليل؛ فالقياس حال الصفحة بعد «خروج».
// =====================================================================================

test('م14 (ف1، ب14 ق205) رسالة «حُفظ لأحمد» بلا أزرار ← اليوم يتغيّر إلى التالي وrefreshToday() ← لا شريط', async () => {
    const h = await teacherPage();
    try {
        await saveBoth(h, AHMAD, 'أحمد');
        const pre = await toastState(h.page);
        // ب14 (ق205): كان الشرط زرين؛ صار بلا أزرار.
        assert.deepEqual(pre, { ظاهر: true, النص: 'حُفظ لأحمد', الأزرار: [] }, `الشرط المسبق: ${JSON.stringify(pre)}`);
        await h.page.evaluate(() => {
            const N = Object.getPrototypeOf(window.Date), t = new N('2026-11-23T09:00:00Z').getTime();
            window.Date = class extends N { constructor(...a) { super(...(a.length ? a : [t])); } static now() { return t; } };
        });
        await h.page.waitForTimeout(200);
        await h.page.evaluate(() => refreshToday());
        await h.page.waitForTimeout(400);
        const got = { todayStr: await h.page.evaluate(() => todayStr), بطاقة_أحمد: await badge(h.page, AHMAD), الشريط: await toastState(h.page) };
        assert.deepEqual(got, { todayStr: '2026-11-23', بطاقة_أحمد: 'لم يُسجَّل', الشريط: { ظاهر: false } }, `م14 الظاهر: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

// ب14 (ق205): حُذف م15؛ كان يضغط تراجع الشريط بعد حذف بعيد، وصار بلا زر تراجع.

test('م16 (حارس الخروج) حفظ أحمد والشريط ظاهر ← «خروج» ← «خروج» ← لا #teacherToast في الصفحة (قبل signOut وبعدها)', async () => {
    const h = await teacherPage();
    try {
        await saveBoth(h, AHMAD, 'أحمد');
        await h.page.evaluate(() => { window.__signOut = []; window.almahraAuth.signOut = () => { window.__signOut.push(!!document.getElementById('teacherToast')); return new Promise(() => {}); }; });
        await h.page.locator('#teacherLogoutBtn').click();
        await h.page.locator('#teacherLogoutSheet .primary').click();
        await h.page.waitForTimeout(300);
        const got = { signOut_استُدعيت: await h.page.evaluate(() => window.__signOut.length), الشريط_عند_signOut: await h.page.evaluate(() => window.__signOut[0] ?? null),
            الشريط_بعد: await h.page.locator('#teacherToast').count() };
        assert.deepEqual(got, { signOut_استُدعيت: 1, الشريط_عند_signOut: false, الشريط_بعد: 0 }, `م16 الظاهر: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

// =====================================================================================
// م17–م20: ق201 (ف1) — فتح أي ورقة للمعلم ينهي شريط الحفظ قبل ظهور الورقة.
// القياس هنا وجود #teacherToast في DOM، لا مجرد اختفائه خلف ظل الورقة.
// =====================================================================================
async function savedAhmadToast(h) {
    await saveBoth(h, AHMAD, 'أحمد');
    const pre = await toastState(h.page);
    // ب14 (ق205): كان شرط الزرين؛ صار بلا أزرار.
    assert.deepEqual(pre, { ظاهر: true, النص: 'حُفظ لأحمد', الأزرار: [] },
        `الشرط المسبق: ${JSON.stringify(pre)}`);
}
const sheetOpen = (page, id) => page.locator('#' + id).isVisible();

test('م17 حفظ أحمد والشريط ظاهر ← «⋯» لسعد ← ورقة سعد مفتوحة ولا #teacherToast في الصفحة', async () => {
    const h = await teacherPage();
    try {
        await savedAhmadToast(h);
        await h.page.locator(`.teacher-card[data-id="${SAAD}"] [data-a=more]`).click();
        await h.page.locator('#teacherMoreSheet').waitFor({ state: 'visible' });
        const got = { الورقة: await sheetOpen(h.page, 'teacherMoreSheet'), الطالب: norm(await h.page.locator('#teacherMoreSheet h2').innerText()),
            الشريط: await h.page.locator('#teacherToast').count(), النص_الظاهر: await toastState(h.page) };
        assert.deepEqual(got, { الورقة: true, الطالب: 'سعد', الشريط: 0, النص_الظاهر: { ظاهر: false } }, `م17 الظاهر: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

test('م18 حفظ أحمد والشريط ظاهر ← «+ طالب جديد» ← الورقة مفتوحة ولا #teacherToast في الصفحة', async () => {
    const h = await teacherPage();
    try {
        await savedAhmadToast(h);
        await h.page.locator('#teacherAddStudentBtn').click();
        await h.page.locator('#teacherStudentSheet').waitFor({ state: 'visible' });
        const got = { الورقة: await sheetOpen(h.page, 'teacherStudentSheet'), العنوان: norm(await h.page.locator('#teacherStudentSheet h2').innerText()),
            الشريط: await h.page.locator('#teacherToast').count(), النص_الظاهر: await toastState(h.page) };
        assert.deepEqual(got, { الورقة: true, العنوان: 'طالب جديد', الشريط: 0, النص_الظاهر: { ظاهر: false } }, `م18 الظاهر: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

test('م19 حفظ أحمد والشريط ظاهر ← «غائب» لفهد: يزول شريط أحمد والورقة مفتوحة؛ إتمام الغياب يُظهر شريطاً قصيراً بلا أزرار', async () => {
    const h = await teacherPage();
    try {
        await savedAhmadToast(h);
        await h.page.locator(`.teacher-card[data-id="${FAHD}"] [data-a=absent]`).click();
        await h.page.locator('#teacherAbsenceSheet').waitFor({ state: 'visible' });
        const got = { قبل_الإتمام: { الورقة: await sheetOpen(h.page, 'teacherAbsenceSheet'), العنوان: norm(await h.page.locator('#teacherAbsenceSheet h2').innerText()),
            الشريط: await h.page.locator('#teacherToast').count(), النص_الظاهر: await toastState(h.page) } };
        await h.page.locator('#teacherAbsenceSheet [data-reason="unexcused"]').click();
        await waitToast(h, 'سُجّل غياب فهد');
        got.بعد_الإتمام = { الورقة: await sheetOpen(h.page, 'teacherAbsenceSheet'), الشريط: await toastState(h.page),
            شريط_أحمد: await h.page.locator('#teacherToast').filter({ hasText: 'حُفظ لأحمد' }).count() };
        assert.deepEqual(got, {
            قبل_الإتمام: { الورقة: true, العنوان: 'تسجيل غياب فهد اليوم؟', الشريط: 0, النص_الظاهر: { ظاهر: false } },
            بعد_الإتمام: { الورقة: false, الشريط: { ظاهر: true, النص: 'سُجّل غياب فهد', الأزرار: [] }, شريط_أحمد: 0 }
        }, `م19 الظاهر: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

test('م20 (حارس) بعد حفظ أحمد وفتح «⋯» لسعد ثم «إلغاء» ← لا شريط وتسجيل أحمد باقٍ في القاعدة', async () => {
    const h = await teacherPage();
    try {
        await savedAhmadToast(h);
        const saved = (await mineToday(h, AHMAD)).length;
        assert.equal(saved, 2, 'الشرط المسبق: تسجيلا أحمد حُفظا في القاعدة');
        await h.page.locator(`.teacher-card[data-id="${SAAD}"] [data-a=more]`).click();
        await h.page.locator('#teacherMoreSheet').waitFor({ state: 'visible' });
        await h.page.locator('#teacherMoreSheet [data-cancel]').click();
        const got = { الورقة: await h.page.locator('#teacherMoreSheet').count(), الشريط: await h.page.locator('#teacherToast').count(),
            تسجيلات_أحمد: (await mineToday(h, AHMAD)).length };
        assert.deepEqual(got, { الورقة: 0, الشريط: 0, تسجيلات_أحمد: saved }, `م20 الظاهر: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});
