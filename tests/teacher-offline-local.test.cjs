// بطاقة «ب» (رسالة «لا اتصال» أثناء حفظ المعلم) — اختبار القبول الأحمر ق1–ق8، 2026-11-22.
// المرجع الوحيد: D:\المهره\notes\features\accounts\teacher-offline-card.md (القسمان 3 و4)، المبني عليه index.html على 45afe15.
// ق9 (المجموعة الكاملة + فئة التدقيق) خارج هذا الملف.
// الهاركنس: tests/helpers/teacher-ui-harness.cjs (فايربيس وهمي في الذاكرة + index.html كما هو، Playwright بلا واجهة، 390×844).
//
// الانقطاع والبطء (افتراضات تُلزم الباني، ومذكورة في التقرير):
//   • الانقطاع = context.setOffline(true) فعلاً (يغيّر navigator.onLine ويطلق حدثَي online/offline في الصفحة).
//   • الفايربيس الوهمي لا يمرّ بالشبكة (page.route لا يصل إليه)، فلا يتعلّق الحفظ وحده عند الانقطاع. لذلك تُركّب هنا «محاكاة الاتصال»
//     داخل الصفحة بآلية الهاركنس نفسها (fb.setHold / fb.release): عند حدث offline يُعلَّق كل commit (كما يفعل updateDoc في فايربيس الحقيقي
//     حين لا يصله إقرار الخادم)، وعند حدث online يُفرَج عنه بعد 1200ms (زمن إعادة اتصال معقول، يتيح رؤية «عاد الاتصال؛ جارٍ الحفظ…»).
//     والبطء = fb.setHold ثم fb.release بعد 6 ث (يقابل «تأخير 6 ث للطلبات» في ق4) والمتصفح متصل.
//   • لا إعادة إرسال: الكتابة المعلّقة تُنفَّذ مرة واحدة عند الإفراج؛ فعدّ updateDoc للطالب في fb.log يجب أن يبقى 1 (لا إعادة محاولة ولا إلغاء).
//   • الوقت: setTimeout حقيقي؛ ساعة الهاركنس تثبّت Date وحده. لا page.clock.
//   • السطر الجديد لا اسم/معرّف له في البطاقة: يُعثر عليه بنصّه الحرفي (أصغر عنصر يطابق نصّه المطبَّع) داخل الصفحة كلها، ومرئيّاً.
//   • ق8: «لون الشريط الأصفر نفسه» = لونا الخلفية والنص المحسوبان للسطر يساويان لونَي #teacherOffline المحسوبَين ويساويان قيمتَي
//     --amber-50 و--amber-800؛ وكل تصريح color/background مطابق للسطر (قواعد CSS أو style مضمّن) يستعمل var(--…) لا قيمة حرفية.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const H = require('./helpers/teacher-ui-harness.cjs');

const TODAY = H.TODAY;
const AHMAD = 1;
let browser;
before(async () => {
    const playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); });

// ===== النصوص الحرفية من البطاقة (3-1 و3-3) =====
const P_OFF = 'لا اتصال بالإنترنت. أبقِ الصفحة مفتوحة؛ سيُحفظ التسجيل وحده عند عودة الاتصال';
const P_SLOW = 'الاتصال بطيء. أبقِ الصفحة مفتوحة حتى يكتمل الحفظ';
const P_BACK = 'عاد الاتصال؛ جارٍ الحفظ…';
const P_BAR = 'لا اتصال بالإنترنت؛ أبقِ الصفحة مفتوحة وسيُحفظ ما سجّلته عند عودته';
const ALL_LINES = [P_OFF, P_SLOW, P_BACK];

// ===== أدوات =====
const norm = s => String(s || '').replace(/[\u2066-\u2069\u200e\u200f\u061c]/g, '').replace(/\s+/g, ' ').trim();
const ach = id => `.teacher-card[data-id="${id}"] [data-a=ach]`;
async function teacherPage() {
    let h;
    try { h = await H.openPage(browser, { user: H.TEACHER_USER, seed: { teacherUser: true } }); }
    catch (_) { h = await H.openPage(browser, { user: H.TEACHER_USER, seed: { teacherUser: true } }); }
    await h.page.locator('#teacherHome').waitFor({ state: 'attached', timeout: 8000 });
    await h.page.locator(ach(AHMAD)).waitFor({ state: 'visible', timeout: 8000 });
    await h.page.waitForTimeout(300);
    await simulateConnection(h.page);
    return h;
}
async function adminPage() {
    const h = await H.openPage(browser, { user: H.ADMIN_USER, seed: {}, width: 1280, height: 900 });
    await h.page.waitForFunction(() => window.almahraPrograms?.getCurrentProgramId?.() === 'general' && window.almahraData?.isReady?.(), null, { timeout: 15000 });
    await h.page.locator('#loadingOverlay').waitFor({ state: 'hidden' }).catch(() => {});
    await simulateConnection(h.page);
    return h;
}
// محاكاة اتصال الفايربيس الوهمي بحالة المتصفح: انقطاع ← تعليق الكتابة؛ عودة ← إفراج بعد 1200ms.
function simulateConnection(page) {
    return page.evaluate(() => {
        window.addEventListener('offline', () => { if (!window.__fb.hold) window.__fb.setHold(); });
        window.addEventListener('online', () => { setTimeout(() => { if (window.__fb.hold) window.__fb.release(); }, 1200); });
    });
}
// بطء مع اتصال: تعليق الكتابة ثم الإفراج بعد ms.
const slowWrites = (page, ms) => page.evaluate(ms => { window.__fb.setHold(); setTimeout(() => window.__fb.release(), ms); }, ms);

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
// المعلم: قسم «الجديد» وحده ← «حفظ» ← ورقة «احفظ الجديد فقط». يعيد لحظة بدء الحفظ (بعد ضغط الورقة) ← تسجيل واحد للطالب.
async function teacherSaveNewOnly(h, id = AHMAD) {
    await H.openAch(h, id); await fillNew(h.page); await pressSave(h.page);
    await h.page.waitForTimeout(300);
    await H.sheetButton(h.page, 'احفظ الجديد فقط');
    return Date.now();
}
const mineToday = async (h, id) => Object.values((await h.doc('programs/general/seasons/s1/students/' + id))?.history?.[TODAY]?.entries || {}).filter(e => e.by === 'teacher-uid');
const studentWrites = async (h, id) => (await h.fbLog()).filter(l => l.op === 'updateDoc' && l.writes.some(w => w.path === 'programs/general/seasons/s1/students/' + id)).length;
const modalOpen = page => page.evaluate(() => document.getElementById('smartModal').classList.contains('flex'));
const saveBtn = page => page.evaluate(() => { const b = document.getElementById('generalQuickSaveBtn'); return { نص: (b.textContent || '').replace(/\s+/g, ' ').trim(), معطّل: b.disabled }; });
async function waitToast(h, text, timeout = 4000) {
    await h.page.locator('#teacherToast').filter({ hasText: text }).waitFor({ state: 'visible', timeout })
        .catch(async () => assert.fail(`«${text}» لم تظهر في #teacherToast. أخطاء الصفحة: ${JSON.stringify(h.errors.slice(0, 3))}`));
}
// أصغر عنصر مرئي نصّه المطبَّع = العبارة حرفياً (أو null).
function lineInfo(page, phrase) {
    return page.evaluate(([phrase, strip]) => {
        const re = new RegExp(strip, 'g');
        const n = s => String(s || '').replace(re, '').replace(/\s+/g, ' ').trim();
        const visible = e => { for (let x = e; x && x !== document.documentElement; x = x.parentElement) { const cs = getComputedStyle(x); if (x.hidden || cs.display === 'none' || cs.visibility === 'hidden') return false; } return e.getClientRects().length > 0; };
        const hits = [...document.body.querySelectorAll('*')].filter(e => n(e.textContent) === phrase && ![...e.children].some(c => n(c.textContent) === phrase));
        const el = hits.find(visible);
        return el ? { وسم: el.tagName, معرّف: el.id, صنف: el.className } : null;
    }, [phrase, '[\\u2066-\\u2069\\u200e\\u200f\\u061c]']);
}
// أي من العبارات الثلاث الجديدة (ولو مخفية) موجود في DOM؟ — لفحص الغياب.
const anyLineInDom = page => page.evaluate(([lines, strip]) => {
    const re = new RegExp(strip, 'g'), walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const parts = []; let node;
    while ((node = walker.nextNode())) if (!node.parentElement?.closest('script, style')) parts.push(node.textContent);
    const t = parts.join(' ').replace(re, '').replace(/\s+/g, ' ');
    return lines.filter(l => t.includes(l));
}, [ALL_LINES, '[\\u2066-\\u2069\\u200e\\u200f\\u061c]']);
// ينتظر ظهور العبارة (ms) أو يفشل برسالة تذكر ما يظهر فعلاً.
async function expectLine(page, phrase, ms, label) {
    const end = Date.now() + ms; let info = null;
    do { info = await lineInfo(page, phrase); if (info) return info; await page.waitForTimeout(100); } while (Date.now() < end);
    const seen = {}; for (const l of ALL_LINES) seen[l] = !!await lineInfo(page, l);
    assert.fail(`${label}: السطر «${phrase}» لم يظهر خلال ${ms}ms. الظاهر من العبارات الثلاث: ${JSON.stringify(seen)}`);
}

// =====================================================================================
test('ق1 حفظ عادي متصل ← لا يظهر أي سطر جديد، و«حُفظ لفلان» كما اليوم، تسجيل واحد', async () => {
    const h = await teacherPage();
    try {
        await teacherSaveNewOnly(h);
        await waitToast(h, 'حُفظ لأحمد');
        await h.page.waitForFunction(() => !document.getElementById('smartModal').classList.contains('flex'), null, { timeout: 4000 });
        await h.page.waitForTimeout(1200);
        const got = { الأسطر_في_DOM: await anyLineInDom(h.page), تسجيلات_أحمد: (await mineToday(h, AHMAD)).length, النافذة: await modalOpen(h.page) };
        assert.deepEqual(got, { الأسطر_في_DOM: [], تسجيلات_أحمد: 1, النافذة: false }, `ق1 الظاهر: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

test('ق2 setOffline(true) ثم حفظ ← خلال 4–5 ث يظهر نص «لا اتصال… سيُحفظ التسجيل وحده» حرفياً؛ الزر «جارٍ الحفظ…» معطّل؛ لا ورقة «لم يُحفظ»', async () => {
    const h = await teacherPage();
    try {
        await h.context.setOffline(true);
        const t0 = await teacherSaveNewOnly(h);
        await h.page.waitForTimeout(Math.max(0, 3000 - (Date.now() - t0)));
        const before4 = await lineInfo(h.page, P_OFF);
        assert.equal(before4, null, 'ق2: السطر ظهر قبل مرور 4 ثوانٍ');
        const info = await expectLine(h.page, P_OFF, Math.max(300, 5000 - (Date.now() - t0)), 'ق2');
        const got = { الزر: await saveBtn(h.page), ورقة_الفشل: await h.page.locator('#teacherSaveFailedSheet').count(), النافذة: await modalOpen(h.page),
            onLine: await h.page.evaluate(() => navigator.onLine), وسم_السطر: !!info };
        assert.deepEqual(got, { الزر: { نص: 'جارٍ الحفظ…', معطّل: true }, ورقة_الفشل: 0, النافذة: true, onLine: false, وسم_السطر: true }, `ق2 الظاهر: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

test('ق3 بعد الانقطاع setOffline(false) ← «عاد الاتصال؛ جارٍ الحفظ…» ثم خلال ثانيتين «حُفظ لفلان» وتُغلق النافذة؛ تسجيل واحد في القاعدة', async () => {
    const h = await teacherPage();
    try {
        await h.context.setOffline(true);
        const t0 = await teacherSaveNewOnly(h);
        await expectLine(h.page, P_OFF, Math.max(300, 5000 - (Date.now() - t0)), 'ق3 (شرط مسبق: سطر الانقطاع)');
        await h.context.setOffline(false);
        const tOn = Date.now();
        await expectLine(h.page, P_BACK, 1000, 'ق3');
        await waitToast(h, 'حُفظ لأحمد', Math.max(300, 2300 - (Date.now() - tOn)));
        await h.page.waitForFunction(() => !document.getElementById('smartModal').classList.contains('flex'), null, { timeout: 2000 });
        await h.page.waitForTimeout(500);
        const got = { تسجيلات_أحمد: (await mineToday(h, AHMAD)).length, كتابات_الطالب: await studentWrites(h, AHMAD), الأسطر_في_DOM: await anyLineInDom(h.page), النافذة: await modalOpen(h.page) };
        assert.deepEqual(got, { تسجيلات_أحمد: 1, كتابات_الطالب: 1, الأسطر_في_DOM: [], النافذة: false }, `ق3 الظاهر: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

test('ق4 اتصال بطيء (تأخير 6 ث) والمتصفح متصل ← بعد 4 ث «الاتصال بطيء. أبقِ الصفحة مفتوحة حتى يكتمل الحفظ» ثم «حُفظ لفلان»؛ تسجيل واحد', async () => {
    const h = await teacherPage();
    try {
        await H.openAch(h, AHMAD); await fillNew(h.page); await pressSave(h.page);
        await h.page.waitForTimeout(300);
        await slowWrites(h.page, 6000);
        await H.sheetButton(h.page, 'احفظ الجديد فقط');
        const t0 = Date.now();
        await h.page.waitForTimeout(2000);
        assert.equal(await lineInfo(h.page, P_SLOW), null, 'ق4: السطر ظهر قبل مرور 4 ثوانٍ');
        await expectLine(h.page, P_SLOW, Math.max(300, 5500 - (Date.now() - t0)), 'ق4');
        const mid = { الزر: await saveBtn(h.page), سطر_الانقطاع: await lineInfo(h.page, P_OFF) };
        assert.deepEqual(mid, { الزر: { نص: 'جارٍ الحفظ…', معطّل: true }, سطر_الانقطاع: null }, `ق4 (أثناء البطء) الظاهر: ${JSON.stringify(mid)}`);
        await waitToast(h, 'حُفظ لأحمد', 5000);
        await h.page.waitForFunction(() => !document.getElementById('smartModal').classList.contains('flex'), null, { timeout: 2000 });
        const got = { تسجيلات_أحمد: (await mineToday(h, AHMAD)).length, كتابات_الطالب: await studentWrites(h, AHMAD), الأسطر_في_DOM: await anyLineInDom(h.page) };
        assert.deepEqual(got, { تسجيلات_أحمد: 1, كتابات_الطالب: 1, الأسطر_في_DOM: [] }, `ق4 الظاهر: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

test('ق5 أثناء الانقطاع والحفظ معلّق، الضغط على سهم الرجوع ← النافذة لا تُغلق والسطر ظاهر فوراً', async () => {
    const h = await teacherPage();
    try {
        await h.context.setOffline(true);
        await teacherSaveNewOnly(h);
        await h.page.waitForTimeout(1000);   // قبل مرور 4 ث: السطر بعدُ لم يظهر بحكم 3-1؛ الرجوع يُظهره فوراً (3-2)
        await h.page.locator('#generalQuickSection button[aria-label="رجوع"]').click();
        await expectLine(h.page, P_OFF, 500, 'ق5');
        const got = { النافذة: await modalOpen(h.page), الزر: await saveBtn(h.page), ورقة_الفشل: await h.page.locator('#teacherSaveFailedSheet').count() };
        assert.deepEqual(got, { النافذة: true, الزر: { نص: 'جارٍ الحفظ…', معطّل: true }, ورقة_الفشل: 0 }, `ق5 الظاهر: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

test('ق6 شريط الرئيسية عند الانقطاع يحمل نص 3-3 الجديد، ويختفي عند العودة', async () => {
    const h = await teacherPage();
    try {
        const bar = () => h.page.evaluate(() => { const b = document.getElementById('teacherOffline'); return b ? { مخفي: b.hidden || !b.getClientRects().length, النص: (b.innerText || b.textContent || '').replace(/[\u2066-\u2069\u200e\u200f\u061c]/g, '').replace(/\s+/g, ' ').trim() } : null; });
        const got = { متصلاً: (await bar())?.مخفي };
        await h.context.setOffline(true);
        await h.page.waitForTimeout(300);
        const off = await bar();
        got.عند_الانقطاع = { مخفي: off?.مخفي, النص: off?.النص };
        await h.context.setOffline(false);
        await h.page.waitForTimeout(300);
        got.عند_العودة = (await bar())?.مخفي;
        assert.deepEqual(got, { متصلاً: true, عند_الانقطاع: { مخفي: false, النص: P_BAR }, عند_العودة: true }, `ق6 الظاهر: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

test('ق7 وضع المشرف: لا سطر جديد في أي حالة (انقطاع، عودة، بطء) — يُفحص غياب العنصر من DOM', async () => {
    const a = await adminPage();
    try {
        const states = {};
        await a.context.setOffline(true);
        await H.openAch(a, AHMAD); await fillNew(a.page); await fillReview(a.page); await pressSave(a.page);
        await a.page.waitForTimeout(5200);
        states.منقطع_5ث = await anyLineInDom(a.page);
        await a.context.setOffline(false);
        await a.page.waitForTimeout(400);
        states.عند_العودة = await anyLineInDom(a.page);
        await a.page.waitForFunction(() => !document.getElementById('smartModal').classList.contains('flex'), null, { timeout: 4000 });
        // بطء متصل
        await H.openAch(a, 5); await fillNew(a.page); await fillReview(a.page);
        await slowWrites(a.page, 6000);
        await pressSave(a.page);
        await a.page.waitForTimeout(5000);
        states.بطء_5ث = await anyLineInDom(a.page);
        assert.deepEqual(states, { منقطع_5ث: [], عند_العودة: [], بطء_5ث: [] }, `ق7 الظاهر: ${JSON.stringify(states)}`);
    } finally { await a.close(); }
});

test('ق8 لون سطر الانقطاع من متغيرات العلامة (amber) نفسها كلون شريط الرئيسية، لا أسود/أحمر ثابت (computed style)', async () => {
    const h = await teacherPage();
    try {
        await h.context.setOffline(true);
        const t0 = await teacherSaveNewOnly(h);
        await expectLine(h.page, P_OFF, Math.max(300, 5000 - (Date.now() - t0)), 'ق8');
        const got = await h.page.evaluate(([phrase, strip]) => {
            const re = new RegExp(strip, 'g'), n = s => String(s || '').replace(re, '').replace(/\s+/g, ' ').trim();
            const el = [...document.body.querySelectorAll('*')].filter(e => n(e.textContent) === phrase && ![...e.children].some(c => n(c.textContent) === phrase))
                .find(e => e.getClientRects().length);
            const toRgb = v => { const p = document.createElement('i'); p.style.color = v; document.body.appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c; };
            const root = getComputedStyle(document.documentElement);
            const want = { خلفية: toRgb(root.getPropertyValue('--amber-50').trim()), نص: toRgb(root.getPropertyValue('--amber-800').trim()) };
            const bar = document.getElementById('teacherOffline'), bs = getComputedStyle(bar);
            const barColors = { خلفية: bs.backgroundColor, نص: bs.color };
            const solidBg = e => { for (let x = e; x; x = x.parentElement) { const c = getComputedStyle(x).backgroundColor; if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c; } return null; };
            const cs = getComputedStyle(el), actual = { خلفية: solidBg(el), نص: cs.color };
            // تصريحات color/background المطابقة للعنصر: لا قيمة حرفية (#، rgb، hsl) بل var(--…)
            const literal = [];
            const check = (src, prop, val) => { if (val && /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(val) && !/var\(/.test(val)) literal.push(`${src} ${prop}: ${val}`); };
            for (const p of ['color', 'background-color', 'background']) check('inline', p, el.style.getPropertyValue(p));
            for (const sheet of document.styleSheets) { let rules; try { rules = sheet.cssRules; } catch (_) { continue; }
                const walk = rs => { for (const r of rs) { if (r.cssRules && !r.selectorText) walk(r.cssRules); else if (r.selectorText) { let m = false; try { m = el.matches(r.selectorText); } catch (_) {}
                    if (m) for (const p of ['color', 'background-color', 'background']) check(r.selectorText, p, r.style.getPropertyValue(p)); } } };
                walk(rules); }
            return { مرغوب_من_المتغيرات: want, شريط_الرئيسية: barColors, السطر: actual, قيم_حرفية: literal, وسم: el.tagName + (el.id ? '#' + el.id : '') };
        }, [P_OFF, '[\\u2066-\\u2069\\u200e\\u200f\\u061c]']);
        const ok = {
            مثل_الشريط: got.السطر.خلفية === got.شريط_الرئيسية.خلفية && got.السطر.نص === got.شريط_الرئيسية.نص,
            مثل_المتغيرات: got.السطر.خلفية === got.مرغوب_من_المتغيرات.خلفية && got.السطر.نص === got.مرغوب_من_المتغيرات.نص,
            بلا_قيم_حرفية: got.قيم_حرفية.length === 0 };
        assert.deepEqual(ok, { مثل_الشريط: true, مثل_المتغيرات: true, بلا_قيم_حرفية: true }, `ق8 الظاهر: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

test('ق10 حفظ سريع ناجح ثم انتظار 5 ثوانٍ ← لا يظهر سطر الانتظار بعد الحفظ ولا عند فتح طالب آخر', async () => {
    const h = await teacherPage();
    try {
        const pendingCount = () => h.page.locator('.tch-save-pending').count();
        const seen = {};
        const t0 = Date.now();
        await teacherSaveNewOnly(h);
        await waitToast(h, 'حُفظ لأحمد');
        await h.page.waitForFunction(() => !document.getElementById('smartModal').classList.contains('flex'), null, { timeout: 4000 });
        seen.اكتمل_خلال_4ث = Date.now() - t0 < 4000;
        seen.بعد_الحفظ_فوراً = await pendingCount();
        await h.page.waitForTimeout(5000);
        seen.بعد_الحفظ_5ث = await pendingCount();
        await H.openAch(h, 5);
        seen.عند_فتح_طالب_آخر = await pendingCount();
        await h.page.waitForTimeout(5000);
        seen.طالب_آخر_بعد_5ث = await pendingCount();
        assert.deepEqual(seen, { اكتمل_خلال_4ث: true, بعد_الحفظ_فوراً: 0, بعد_الحفظ_5ث: 0, عند_فتح_طالب_آخر: 0, طالب_آخر_بعد_5ث: 0 }, `ق10 الظاهر: ${JSON.stringify(seen)}`);
    } finally { await h.close(); }
});

test('ق11 موضع زر الحفظ لا يتغير بظهور السطر في الانقطاع والبطء', async () => {
    for (const state of ['مقطوع', 'بطيء']) {
        const h = await teacherPage();
        try {
            await H.openAch(h, AHMAD); await fillNew(h.page); await pressSave(h.page);
            await h.page.waitForTimeout(300);
            if (state === 'مقطوع') await h.context.setOffline(true);
            else await slowWrites(h.page, 6000);
            await H.sheetButton(h.page, 'احفظ الجديد فقط');
            const t0 = Date.now();
            const top = () => h.page.locator('#generalQuickSaveBtn').evaluate(b => b.getBoundingClientRect().top);
            const before = await top();
            const phrase = state === 'مقطوع' ? P_OFF : P_SLOW;
            await expectLine(h.page, phrase, Math.max(300, 5500 - (Date.now() - t0)), `ق11 (${state})`);
            const after = await top();
            assert.equal(after - before, 0, `ق11 (${state}): موضع الزر قبل السطر ${before} وبعده ${after}`);
        } finally { await h.close(); }
    }
});

test('ق12 بعد حفظ ناجح، سهم الرجوع يُغلق نافذة طالب آخر فوراً', async () => {
    const h = await teacherPage();
    try {
        await teacherSaveNewOnly(h);
        await waitToast(h, 'حُفظ لأحمد');
        await h.page.waitForFunction(() => !document.getElementById('smartModal').classList.contains('flex'), null, { timeout: 4000 });
        await H.openAch(h, 5); await h.page.waitForTimeout(300);
        await h.page.locator('#generalQuickSection button[aria-label="رجوع"]').click();
        await h.page.waitForTimeout(400);
        const got = { النافذة: await modalOpen(h.page), سطر: await h.page.locator('.tch-save-pending').count() };
        assert.deepEqual(got, { النافذة: false, سطر: 0 }, `ق12 الظاهر: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

test('ق13 بعد حفظ ناجح، انقطاع ثم عودة الاتصال في نافذة بلا حفظ لا يُظهر أي سطر', async () => {
    const h = await teacherPage();
    try {
        await teacherSaveNewOnly(h);
        await waitToast(h, 'حُفظ لأحمد');
        await h.page.waitForFunction(() => !document.getElementById('smartModal').classList.contains('flex'), null, { timeout: 4000 });
        await H.openAch(h, 5); await h.page.waitForTimeout(300);
        await h.context.setOffline(true); await h.page.waitForTimeout(400);
        const mid = { سطر: await h.page.locator('.tch-save-pending').count(), عبارات: await anyLineInDom(h.page) };
        await h.context.setOffline(false); await h.page.waitForTimeout(800);
        const got = { وسط: mid, بعد: { سطر: await h.page.locator('.tch-save-pending').count(), عبارات: await anyLineInDom(h.page) } };
        assert.deepEqual(got, { وسط: { سطر: 0, عبارات: [] }, بعد: { سطر: 0, عبارات: [] } }, `ق13 الظاهر: ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});
