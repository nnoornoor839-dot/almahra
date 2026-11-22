// بطاقة «و» (لون توست المعلم من العلامة) — اختبار القبول الأحمر ق1–ق4، 2026-11-22.
// المرجع: D:\المهره\notes\features\accounts\teacher-toast-color-card.md (القسمان 3 و4). ق5/ق6 خارج هذا الملف.
// الهاركنس: tests/helpers/teacher-ui-harness.cjs (390×844 للمعلم، 1280×900 للمشرف).
// القيم المثبَّتة للمقارنة «كما قبل» (مقيسة على 8f47e89 ولا تُعدَّل): bottom=16px، ارتفاع=56px، خلفية #toastMessage للمشرف = rgb(255, 255, 255) تقريباً حسب القياس أدناه.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const H = require('./helpers/teacher-ui-harness.cjs');

const AHMAD = 1;
let browser;
before(async () => {
    const playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); });

const ach = id => `.teacher-card[data-id="${id}"] [data-a=ach]`;
async function teacherPage() {
    let h;
    try { h = await H.openPage(browser, { user: H.TEACHER_USER, seed: { teacherUser: true } }); }
    catch (_) { h = await H.openPage(browser, { user: H.TEACHER_USER, seed: { teacherUser: true } }); }
    await h.page.locator('#teacherHome').waitFor({ state: 'attached', timeout: 8000 });
    await h.page.locator(ach(AHMAD)).waitFor({ state: 'visible', timeout: 8000 });
    await h.page.waitForTimeout(300);
    return h;
}
async function setField(page, id, value) {
    const ok = await page.evaluate(([id, value]) => {
        const el = document.getElementById(id); if (!el) return false;
        el.value = String(value); ['input', 'change'].forEach(t => el.dispatchEvent(new Event(t, { bubbles: true }))); return true;
    }, [id, value]);
    assert.ok(ok, `الحقل #${id} غير موجود`);
}
async function fillNew(page) {
    const acc = await H.quickAccordion(page);
    if (acc) await H.openSec(page, 'new');
    await setField(page, 'quick_new_toAyah', 10);
    const b = page.locator('#quick_new_grades button').filter({ hasText: 'ممتاز' }).first();
    assert.ok(await b.count(), 'زر «ممتاز» غير موجود');
    await b.click();
    if (acc) await H.confirmSec(page, 'new');
}
async function saveNewOnly(h) {
    await H.openAch(h, AHMAD); await fillNew(h.page);
    await H.confirmBehavior(h.page);
    await h.page.evaluate(() => typeof updateGeneralQuickPreview === 'function' && updateGeneralQuickPreview());
    await h.page.locator('#generalQuickSaveBtn').click();
    await h.page.waitForTimeout(300);
    await H.sheetButton(h.page, 'احفظ الجديد فقط');
    await h.page.locator('#teacherToast').filter({ hasText: 'حُفظ لأحمد' }).waitFor({ state: 'visible', timeout: 4000 });
}
async function absentToggle(h, text) {
    await h.page.locator(`.teacher-card[data-id="${AHMAD}"] [data-a=absent]`).click();
    await h.page.locator('button').filter({ hasText: /^\s*بغير عذر\s*$/ }).filter({ visible: true }).first().click();
    await h.page.locator('#teacherToast').filter({ hasText: 'سُجّل غياب أحمد' }).waitFor({ state: 'visible', timeout: 4000 });
    await h.page.waitForTimeout(7000);
    await h.page.locator(`.teacher-card[data-id="${AHMAD}"] [data-a=absent]`).click();
    await h.page.locator('#teacherToast').filter({ hasText: text }).waitFor({ state: 'visible', timeout: 4000 });
}
// يحوّل أي قيمة لون إلى rgb المحسوب.
const toastInfo = page => page.evaluate(() => {
    const toRgb = v => { const p = document.createElement('i'); p.style.color = v; document.body.appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c; };
    const t = document.getElementById('teacherToast'); if (!t) return null;
    const cs = getComputedStyle(t), root = getComputedStyle(document.documentElement);
    const btn = t.querySelector('button');
    return { خلفية: cs.backgroundColor, green900: toRgb(root.getPropertyValue('--green-900').trim()), gold600: toRgb(root.getPropertyValue('--gold-600').trim()),
        نص: cs.color, زر: btn ? getComputedStyle(btn).color : null, bottom: cs.bottom, ارتفاع: t.getBoundingClientRect().height };
});

test('ق1 لون خلفية #teacherToast المحسوب = --green-900 المحسوبة (حفظ عادي، وأُلغي غياب)', async () => {
    const h = await teacherPage();
    try {
        await saveNewOnly(h);
        const a = await toastInfo(h.page);
        await H.closeAch?.(h.page).catch(() => {});
        const h2 = await teacherPage();
        try {
            await absentToggle(h2, 'أُلغي غياب أحمد');
            const b = await toastInfo(h2.page);
            const got = { حفظ_عادي: a.خلفية === a.green900, إلغاء_غياب: b.خلفية === b.green900 };
            assert.deepEqual(got, { حفظ_عادي: true, إلغاء_غياب: true }, `ق1 الظاهر: حفظ=${JSON.stringify(a)} إلغاء=${JSON.stringify(b)}`);
        } finally { await h2.close(); }
    } finally { await h.close(); }
});

test('ق2 نص التوست أبيض وزر «تراجع» بلون --gold-600', async () => {
    const h = await teacherPage();
    try {
        // شريط «تراجع» لا يظهر من مسار الحفظ بعد ق205؛ فيُستدعى teacherShowToast بمعرّف طالب كما تفعل الدالة نفسها.
        await h.page.evaluate(() => teacherShowToast('اختبار', 1));
        const a = await toastInfo(h.page);
        assert.ok(a.زر !== null, 'لا زر داخل التوست');
        const got = { نص: a.نص, زر: a.زر === a.gold600 };
        assert.deepEqual(got, { نص: 'rgb(255, 255, 255)', زر: true }, `ق2 الظاهر: ${JSON.stringify(a)}`);
    } finally { await h.close(); }
});

test('ق3 موضع التوست (bottom=16px) وارتفاعه (56) كما قبل', async () => {
    const h = await teacherPage();
    try {
        await saveNewOnly(h);
        const a = await toastInfo(h.page);
        // نافذة الطالب مغلقة عند الحفظ الناجح فالموضع الأساسي. القيم مقيسة على 8f47e89.
        assert.deepEqual({ bottom: a.bottom, ارتفاع: a.ارتفاع }, { bottom: '16px', ارتفاع: 56 }, `ق3 الظاهر: ${JSON.stringify(a)}`);
    } finally { await h.close(); }
});

test('ق4 #toastMessage (المشرف) لون خلفيته لم يتغير', async () => {
    const h = await H.openPage(browser, { user: H.ADMIN_USER, seed: {}, width: 1280, height: 900 });
    try {
        await h.page.waitForFunction(() => window.almahraPrograms?.getCurrentProgramId?.() === 'general' && window.almahraData?.isReady?.(), null, { timeout: 15000 });
        await h.page.locator('#loadingOverlay').waitFor({ state: 'hidden' }).catch(() => {});
        await h.page.evaluate(() => showToast('اختبار لون'));
        await h.page.waitForTimeout(400);
        const bg = await h.page.evaluate(() => getComputedStyle(document.getElementById('toastMessage')).backgroundColor);
        assert.equal(bg, process.env.ADMIN_TOAST_BG || 'rgb(255, 255, 255)', `ق4 الظاهر: ${bg}`);
    } finally { await h.close(); }
});
