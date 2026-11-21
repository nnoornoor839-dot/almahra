// بطاقة 4-4 «حسابات المعلمين» — الجولة 2 «نافذة الإنجاز بشكل v7»: اختبار القبول الأحمر، 2026-11-18، كاتب اختبار أ13.
// المرجع: D:\المهره\notes\features\accounts\teacher-accounts-card.md (ق90 بما يستوعبه: ق78، ق79، ق80، ق81، ق83، ق84؛ ق93-1/-2/-4/-6؛ ق98)،
// والنموذج الملزم D:\المهره\notes\design-v1\teacher\teacher-mockup-v7.html وتقريره teacher-mockup-v7-out.md (الاختيارات 14–24).
// الطريقة: Playwright فوق tests/helpers/teacher-ui-harness.cjs (index.html + الملفات الثلاثة الحقيقية + فايربيس وهمي)، على 390×844 (و1280 في ج20).
//
// «المشرف بلا تغيير» (ق90/ق98-5) في كل اختبار: يُفتح جهاز المشرف بالبذرة نفسها، تُنفَّذ حالة النافذة (ADMIN_RUN)، ويُقارن
// sha256 لـ#smartModal.outerHTML بالمرجع ADMIN_REF المأخوذ من الكود الحالي (index.html 6b6a9641…؛ أُعيد على 8486855c… في أ26-د، ق165) بسكربت admin-capture.cjs في مجلد الأدلة.
//
// افتراضات الاختبار فيما لم تسمّه البطاقة (تُذكر في التقرير ليقرّها Fable؛ المحدّدات كلها هنا في SEL وحده):
//   • القسم: عنصر [data-sec="new"|"review"|"behavior"] داخل #generalQuickSection بهذا الترتيب في DOM.
//     رأسه زر .tch-acc-toggle بـaria-expanded (نصّه يبدأ بـ«الجديد»/«المراجعة»/«السلوك»)، وزر .tch-confirm بـaria-pressed
//     نصّه «تأكيد» أو «مؤكَّد» مع svg، وجسمه .tch-acc-body (ظاهر = مفتوح)، وملخصه المطوي .tch-acc-sum.
//   • المحتوى داخل الأقسام بمعرّفاته القائمة: #quick_new_toAyah، #quick_new_grades، #quick_review_*، #quick_positionSurah/Ayah،
//     #criteriaList، وأزرار «استوفى المعايير» و«التحضير المنزلي» و«استثناءات» بنصوصها.
//   • الرأس: #generalQuickName = الاسم وحده، #generalQuickWho = «نقاطه: N»؛ زر الرجوع button[aria-label="رجوع"] فيه svg.
//   • الذيل #generalQuickFooter وزر #generalQuickSaveBtn (معطّل = disabled أو aria-disabled="true")؛ النقاط رقم يليه «نقاط/نقطة/نقطتان».
//   • الأوراق: عنصر .tch-sheet ظاهر (كأوراق المعلم القائمة)؛ ورقة ق78 عنوانها «لم تُدخل مراجعة لِ<الاسم>» وعكسه «لم تُدخل جديداً لِ<الاسم>».
//   • رسائل التأكيد (اختيار v7 رقم 16): «اكتب آية النهاية»، «اختر تقديراً»، والنهاية قبل البداية رسالة فيها «قبل البداية»، حمراء (--red-700) داخل القسم.
//   • «الضغط على مؤكَّد» يلغي التأكيد ويفتح القسم (اختيار 17)؛ فتح قسم مؤكَّد من رأسه يُبقيه مؤكَّداً ما دام صحيحاً.
//   • ما لم يُؤكَّد لا يُحفظ (ق98-1): ولا السلوك (المعايير الملموسة بلا تأكيد لا تُكتب ولا تُحسب في الذيل، اختيار 18).
//   • المقارنات العربية بعد حذف الحركات (bare) حتى لا يتوقف الاختبار على ترتيب الشدة والفتحة.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const H = require('./helpers/teacher-ui-harness.cjs');

const TODAY = H.TODAY;
const S = id => 'programs/general/seasons/s1/students/' + id;
const SELD = { toggle: '.tch-acc-toggle', confirm: '.tch-confirm', body: '.tch-acc-body', sum: '.tch-acc-sum', sheet: '.tch-sheet' };   // يُمرَّر إلى الصفحة
const SEL = { ...SELD, sec: k => `#generalQuickSection [data-sec="${k}"]` };
const KINDS = ['new', 'review', 'behavior'];
const RED = 'rgb(180, 35, 24)';           // --red-700
const GREEN_800 = 'rgb(14, 74, 38)';      // --green-800
const GREEN_100 = 'rgb(227, 241, 232)';   // --green-100
const EXAM_NOW = () => [{ reason: 'exam', from: '2026-11-18', to: null }];
let browser;
before(async () => {
    const playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); });

// ===== البذرة: طلاب الهاركنس + يوم سابق لأحمد (نقاطه 30 = 20 جديد + 10 حضور) =====
const PAST = { '2026-11-19': { attended: true, hijri: 'وهمي', entries: { p1: { kind: 'new', grade: 'excellent', mult: 3, points: 20, spec: { from: [2, 1], to: [2, 5] }, rep: 1, at: 1, by: 'admin-uid', heardBy: 't1' } } } };
function LIST(mods = {}) {
    const l = H.students();
    l[1].history = JSON.parse(JSON.stringify(PAST));
    for (const [id, extra] of Object.entries(mods)) Object.assign(l[id], extra);
    return l;
}

// ===== أدوات =====
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
const bare = s => norm(s).replace(/[\u064B-\u0652\u0670]/g, '');
async function diagnose(h) {
    const st = await h.page.evaluate(() => ({ body: document.body.className, toast: document.getElementById('toastText')?.innerText || '',
        modal: document.getElementById('smartModal')?.classList.contains('flex') })).catch(e => ({ evalError: e.message }));
    const log = await h.fbLog().catch(() => []);
    return `الحال=${JSON.stringify(st)} أخطاء الصفحة=${JSON.stringify(h.errors.slice(0, 3))} آخر عمليات السحابة=${log.slice(-5).map(l => l.op + ':' + (l.path || (l.writes || []).map(w => w.type + ' ' + w.path).join(',')) + (l.result ? '=' + l.result : '')).join(' | ')}`;
}
async function waitFor(h, selector, what, timeout = 6000) {
    try { await h.page.locator(selector).first().waitFor({ state: 'attached', timeout }); }
    catch { assert.fail(`${what}: العنصر ${selector} غير موجود. ${await diagnose(h)}`); }
}
async function teacherPage({ mods = {}, width, height } = {}) {
    const size = width ? { width, height: height || 844 } : {};
    let h;
    // تحت حمل المجموعة قد يتأخر التحميل الأول؛ محاولة ثانية واحدة (كما س28).
    try { h = await H.openPage(browser, { user: H.TEACHER_USER, seed: { teacherUser: true, list: LIST(mods) }, ...size }); }
    catch (_) { h = await H.openPage(browser, { user: H.TEACHER_USER, seed: { teacherUser: true, list: LIST(mods) }, ...size }); }
    await waitFor(h, '#teacherHome', 'صفحة المعلم لم تُفتح', 8000);
    return h;
}
async function adminPage(mods = {}) {
    const h = await H.openPage(browser, { user: H.ADMIN_USER, seed: { list: LIST(mods) } });
    await h.page.waitForFunction(() => window.almahraPrograms?.getCurrentProgramId?.() === 'general' && window.almahraData?.isReady?.(), null, { timeout: 8000 });
    await h.page.locator('#loadingOverlay').waitFor({ state: 'hidden' }).catch(() => {});
    return h;
}
const card = (page, id) => page.locator(`.teacher-card[data-id="${id}"]`);
const cardIds = page => page.$$eval('#teacherStudentList .teacher-card[data-id]', els => els.filter(e => e.getClientRects().length).map(e => Number(e.dataset.id)));
// فتح «الإنجاز» من البطاقة؛ sections = انتظار الأقسام الثلاثة (الشكل الجديد).
async function openAch(h, id, sections = true) {
    await waitFor(h, `.teacher-card[data-id="${id}"] [data-a=ach]`, `زر «الإنجاز» لبطاقة ${id}`);
    await card(h.page, id).locator('[data-a=ach]').click();
    await h.page.locator('#smartModal').waitFor({ state: 'visible' });
    if (sections) await waitFor(h, SEL.sec('new'), 'أقسام النافذة الثلاثة (ق90): قسم الجديد [data-sec="new"]', 3000);
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
async function secState(page) {
    return page.evaluate(([KINDS, SEL]) => {
        const vis = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
        const n = e => (e?.innerText || '').replace(/\s+/g, ' ').trim();
        return Object.fromEntries(KINDS.map(k => {
            const s = document.querySelector(`#generalQuickSection [data-sec="${k}"]`);
            if (!s) return [k, null];
            const t = s.querySelector(SEL.toggle), c = s.querySelector(SEL.confirm), b = s.querySelector(SEL.body), sum = s.querySelector(SEL.sum);
            return [k, { expanded: t?.getAttribute('aria-expanded') === 'true', bodyVisible: vis(b), toggle: n(t),
                confirm: c && vis(c) ? { pressed: c.getAttribute('aria-pressed') === 'true', text: n(c), svg: !!c.querySelector('svg') } : null,
                sum: vis(sum) ? n(sum) : '', disabled: !!t && (t.disabled || t.getAttribute('aria-disabled') === 'true'), text: vis(s) ? n(s) : '' }];
        }));
    }, [KINDS, SELD]);
}
const openOf = st => KINDS.filter(k => st[k]?.expanded && st[k]?.bodyVisible);
const confirmedOf = st => KINDS.filter(k => st[k]?.confirm?.pressed === true && bare(st[k].confirm.text).startsWith('مؤكد'));
async function openSec(page, k) {
    const st = await secState(page);
    assert.ok(st[k], `القسم [data-sec="${k}"] غير موجود`);
    if (!st[k].expanded) await page.locator(SEL.sec(k) + ' ' + SEL.toggle).click();
}
async function confirmSec(page, k) { await page.locator(SEL.sec(k) + ' ' + SEL.confirm).click(); await page.waitForTimeout(60); }
// الجديد: البقرة 6 ← toAyah؛ المراجعة: الفاتحة 1 ← 7.
async function fillNew(page, toAyah = 10, g = 'ممتاز') { await openSec(page, 'new'); await setField(page, 'quick_new_toAyah', toAyah); if (g) await grade(page, 'new', g); }
async function fillReview(page, g = 'جيد') {
    await openSec(page, 'review');
    for (const [id, v] of [['quick_review_fromSurah', 1], ['quick_review_fromAyah', 1], ['quick_review_toSurah', 1], ['quick_review_toAyah', 7]]) await setField(page, id, v);
    if (g) await grade(page, 'review', g);
}
async function fulfill(page) {
    await openSec(page, 'behavior');
    const b = page.locator(SEL.sec('behavior') + ' button').filter({ hasText: /^\s*✓?\s*استوفى المعايير\s*$/ }).filter({ visible: true }).first();
    assert.ok(await b.count(), 'زر «استوفى المعايير» غير ظاهر داخل قسم السلوك');
    await b.click();
}
async function foot(page) {
    return page.evaluate(() => {
        const f = document.getElementById('generalQuickFooter'), b = document.getElementById('generalQuickSaveBtn');
        return { text: (f?.innerText || '').replace(/\s+/g, ' ').trim(), disabled: !!b && (b.disabled || b.getAttribute('aria-disabled') === 'true') };
    });
}
const footPoints = text => { const m = /(-?\d+(?:\.\d+)?)\s*(?:نقاط|نقطة|نقطتان)/.exec(String(text).replace(/−/g, '-')); return m ? Number(m[1]) : null; };
const okWrites = async (h, id) => (await h.fbLog()).filter(l => (l.writes || []).some(w => w.path === S(id)) && l.result === 'ok');
const mineToday = async (h, id) => Object.values((await h.doc(S(id)))?.history?.[TODAY]?.entries || {}).filter(e => e.by === 'teacher-uid');
const modalOpen = page => page.evaluate(() => document.getElementById('smartModal').classList.contains('flex'));
async function sheets(page) {
    return page.evaluate(sel => [...document.querySelectorAll(sel)].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden')
        .map(e => ({ id: e.id, text: e.innerText.replace(/\s+/g, ' ').trim(), buttons: [...e.querySelectorAll('button')].filter(b => b.getClientRects().length).map(b => b.innerText.replace(/\s+/g, ' ').trim()) })), SEL.sheet);
}
async function sheetButton(page, label) {
    const b = page.locator(SEL.sheet).locator('button').filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) }).filter({ visible: true }).first();
    assert.ok(await b.count(), `لا زر «${label}» في ورقة ظاهرة. الأوراق: ${JSON.stringify(await sheets(page))}`);
    await b.click();
}
async function pressSave(page) { await page.locator('#generalQuickSaveBtn').click(); await page.waitForTimeout(400); }
async function waitToast(h, name) {
    await h.page.locator('#teacherToast').filter({ hasText: 'حُفظ ل' + name }).waitFor({ state: 'visible', timeout: 4000 })
        .catch(async () => assert.fail(`«حُفظ ل${name}» لم تظهر. ${await diagnose(h)}`));
}
async function staysClosed(h, what) {
    await h.page.waitForFunction(() => !document.getElementById('smartModal')?.classList.contains('flex'), null, { timeout: 4000 })
        .catch(async () => assert.fail(`${what}: النافذة لم تُغلق. ${await diagnose(h)}`));
    await h.page.waitForTimeout(500);
    assert.equal(await modalOpen(h.page), false, `${what}: فُتحت نافذة بعد الإغلاق`);
}
// يبحث داخل القسم عن عنصر ظاهر نصّه يحوي msg ويعيد لونه (أعمق عنصر).
async function messageIn(page, k, msg) {
    return page.evaluate(([sel, msg]) => {
        const s = document.querySelector(sel); if (!s) return null;
        const strip = t => t.replace(/\s+/g, ' ').replace(/[\u064B-\u0652\u0670]/g, '').trim();
        const hits = [...s.querySelectorAll('*')].filter(e => e.getClientRects().length && strip(e.innerText || '').includes(strip(msg)));
        const leaf = hits.filter(e => !hits.some(x => x !== e && e.contains(x))).at(-1) || null;
        return leaf ? { color: getComputedStyle(leaf).color, text: leaf.innerText.trim() } : null;
    }, [SEL.sec(k), msg]);
}
function normalizePatch(write) {
    const out = {};
    for (const [k, v] of Object.entries(write.data)) {
        const m = /^(history\.[^.]+\.entries\.)(.+)$/.exec(k);
        if (m && v && typeof v === 'object') { const { by, ...rest } = v; out[m[1] + rest.kind] = rest; }
        else out[k] = v;
    }
    return out;
}
const round1 = n => Math.round(n * 10) / 10;
function savedPoints(write) {
    const d = write.data;
    const entries = Object.entries(d).filter(([k]) => /^history\.[^.]+\.entries\./.test(k)).reduce((a, [, v]) => a + (v?.points || 0), 0);
    const crit = Object.entries(d).find(([k]) => /^history\.[^.]+\.criteriaPoints$/.test(k));
    return round1(entries + (crit ? crit[1] : 0));
}

// ===== المشرف بلا تغيير: الحالات ومراجعها =====
// <admin-run> (يقرؤه admin-capture.cjs حرفياً)
const ADMIN_STATES = {
    'open-1': { id: 1 },
    'filled-1': { id: 1, newTo: 10, review: true, fulfill: true },
    'newonly-1': { id: 1, newTo: 10, save: true },
    'open-2': { id: 2 },
    'open-4': { id: 4 },
    'paused-1': { id: 1, mods: { 1: { newPaused: [{ reason: 'exam', from: '2026-11-18', to: null }] } } }
};
const ADMIN_RUN = async st => {
    openSmartModal(st.id);
    await new Promise(r => setTimeout(r, 80));
    const set = (id, v) => { const el = document.getElementById(id); el.value = String(v); ['input', 'change'].forEach(t => el.dispatchEvent(new Event(t, { bubbles: true }))); };
    const grade = (k, name) => [...document.querySelectorAll('#quick_' + k + '_grades button')].find(b => b.textContent.trim() === name).click();
    if (st.newTo) { set('quick_new_toAyah', st.newTo); grade('new', 'ممتاز'); }
    if (st.review) { [['quick_review_fromSurah', 1], ['quick_review_fromAyah', 1], ['quick_review_toSurah', 1], ['quick_review_toAyah', 7]].forEach(([i, v]) => set(i, v)); grade('review', 'جيد'); }
    if (st.fulfill) fulfillGeneralCriteria();
    updateGeneralQuickPreview();
    if (st.save) { document.getElementById('generalQuickSaveBtn').click(); await new Promise(r => setTimeout(r, 300)); }
};
// </admin-run>
// أ26-د (ق165: ل0 يسري على المشرف): أُعيد التوليد بالآلية على index.html 8486855cf934… بسكربت مكافئ لـadmin-capture.cjs
// (verify/teacher-r4-2026-11-19/red/a26d/admin-capture-r4.cjs)، التقاطان متطابقان new.json وnew2.json؛ والفرق عن المرجع السابق (6b6a96413a7e…، التقاطه
// على 27e8f1f5… = old.json يطابق القديم) محصور في: سطر «التحضير المنزلي» الفارغ المخفي تحت 🏠، وزوال سطر early وبهتانه، و+18 بدل +13 (diff-*.txt).
const ADMIN_REF = {
    "open-1": { sha: "09efbfb35fb3497170395b882ee66f517c5f2581be7c307fd1305240b7712ffb", len: 89530 },
    "filled-1": { sha: "877080ceacf334e0cb46f1391772762e9f33eae9aac39c3b1c7280d13f22b6ae", len: 89591 },
    "newonly-1": { sha: "7f9ebd30b144ef25bcf9cbe721b1dd2b07f03ebbcda662eeb830a0788ec6b119", len: 89606 },
    "open-2": { sha: "53a9c4f8e1c8dc3e4c4699212cb70488f5af9a83f681fd5878147371e663e0d3", len: 89530 },
    "open-4": { sha: "efa32398ed21df53088e5722886e3eefc0d2f639ff52f0b156ae6ada003d92b1", len: 95688 },
    "paused-1": { sha: "09efbfb35fb3497170395b882ee66f517c5f2581be7c307fd1305240b7712ffb", len: 89530 }
};
async function adminSame(name) {
    const st = ADMIN_STATES[name];
    const a = await adminPage(st.mods || {});
    try {
        await a.page.evaluate(ADMIN_RUN, st);
        await a.page.waitForTimeout(300);
        const html = await a.page.evaluate(() => document.getElementById('smartModal').outerHTML);
        const got = { sha: crypto.createHash('sha256').update(html).digest('hex'), len: html.length };
        assert.deepEqual(got, ADMIN_REF[name], `المشرف تغيّر: HTML نافذته في الحالة «${name}» ليس بايتاً كما في الكود الحالي`);
        assert.deepEqual(a.errors, [], 'أخطاء صفحة عند المشرف');
    } finally { await a.close(); }
}

// =====================================================================================
// 1) الهيكل (ق90، ق81، ق79، ق84، ق83)
// =====================================================================================
test('ج1 (ق90/ق81) الرأس الداكن: زر «رجوع» بسهم SVG يغلق، الاسم وحده 20/900 أبيض، «نقاطه: N» = getCumulativeStats.tripPoints بأرقام 0-9 (14 --green-100)؛ لا «الإنجاز ·» ولا حلقة ولا معلم', async () => {
    const h = await teacherPage();
    try {
        await openAch(h, 1, false);
        const g = await h.page.evaluate(() => {
            const name = document.getElementById('generalQuickName'), who = document.getElementById('generalQuickWho');
            const back = [...document.querySelectorAll('#generalQuickSection button[aria-label="رجوع"]')].find(b => b.getClientRects().length);
            let head = name; while (head && head !== document.body && getComputedStyle(head).backgroundColor === 'rgba(0, 0, 0, 0)') head = head.parentElement;
            const cs = e => e && getComputedStyle(e), r = back?.getBoundingClientRect();
            return { name: name?.innerText.trim(), who: who?.innerText.replace(/\s+/g, ' ').trim(), nameFont: [cs(name)?.fontSize, cs(name)?.fontWeight, cs(name)?.color],
                whoFont: [cs(who)?.fontSize, cs(who)?.color], headBg: cs(head)?.backgroundColor, headHasBack: !!back && head.contains(back),
                back: back ? { svg: !!back.querySelector('svg'), w: r.width, h: r.height } : null,
                points: getCumulativeStats(students.find(s => s.id === 1)).tripPoints, headText: head?.innerText.replace(/\s+/g, ' ').trim() || '' };
        });
        assert.ok(g.back, `زر «رجوع» (button[aria-label="رجوع"]) غير ظاهر في رأس النافذة. ${JSON.stringify(g)}`);
        assert.equal(g.points, 30, 'الشرط المسبق: نقاط أحمد المزروعة 30');
        assert.deepEqual([g.name, g.who], ['أحمد', 'نقاطه: 30'], 'الرأس: [الاسم وحده، «نقاطه: N»]');
        assert.ok(!/الإنجاز ·|حلقة|الأستاذ|عبدالله/.test(g.headText), `الرأس فيه «الإنجاز ·» أو الحلقة أو المعلم: ${g.headText}`);
        assert.ok(!/[\u0660-\u0669\u06F0-\u06F9]/.test(g.headText), 'أرقام غير لاتينية في الرأس');
        assert.equal(g.headBg, GREEN_800, 'خلفية الرأس ليست --green-800');
        assert.deepEqual([g.headHasBack, g.back.svg, g.back.w >= 44 && g.back.h >= 44], [true, true, true], `زر الرجوع: [داخل الرأس، سهم SVG، ≥ 44] ${JSON.stringify(g.back)}`);
        assert.deepEqual(g.nameFont, ['20px', '900', 'rgb(255, 255, 255)'], 'الاسم 20/900 أبيض');
        assert.deepEqual(g.whoFont, ['14px', GREEN_100], '«نقاطه» 14 --green-100');
        await h.page.locator('#generalQuickSection button[aria-label="رجوع"]').filter({ visible: true }).first().click();
        await staysClosed(h, 'زر «رجوع»');
        await openAch(h, 2, false);
        assert.equal(norm(await h.page.locator('#generalQuickWho').innerText()), 'نقاطه: ' + await h.page.evaluate(() => getCumulativeStats(students.find(s => s.id === 2)).tripPoints), 'نقاط بدر');
    } finally { await h.close(); }
    // المشرف: الاسم و«الحلقة · الأستاذ» كما اليوم.
    const a = await adminPage();
    try {
        await a.page.evaluate(() => openSmartModal(1));
        assert.deepEqual([norm(await a.page.locator('#generalQuickName').innerText()), norm(await a.page.locator('#generalQuickWho').innerText())], ['أحمد', 'حلقة أُبيّ · الأستاذ عبدالله'], 'رأس المشرف تغيّر');
    } finally { await a.close(); }
    await adminSame('open-1');
});

test('ج2 (ق90/ق79/ق84) ثلاثة أقسام بالترتيب «الجديد» «المراجعة» «السلوك» لكلٍّ زر «تأكيد» 44×≥88؛ لا تبويبات ولا .tch-skip؛ «استوفى المعايير» و«التحضير المنزلي» و«استثناءات» والقائمة داخل قسم السلوك وحده', async () => {
    const h = await teacherPage();
    try {
        await openAch(h, 1);
        const r = await h.page.evaluate(([SEL]) => {
            const sec = [...document.querySelectorAll('#generalQuickSection [data-sec]')];
            const beh = document.querySelector('#generalQuickSection [data-sec="behavior"]');
            const btn = re => [...document.querySelectorAll('#smartModal button')].filter(b => re.test(b.innerText.replace(/\s+/g, ' ').trim()));
            return { order: sec.map(s => s.dataset.sec),
                titles: sec.map(s => (s.querySelector(SEL.toggle)?.innerText || '').replace(/\s+/g, ' ').trim()),
                confirms: sec.map(s => { const c = s.querySelector(SEL.confirm); const r = c?.getBoundingClientRect(); return c ? [c.innerText.trim(), c.getAttribute('aria-pressed'), r.height >= 44, r.width >= 88] : null; }),
                tabs: ['.tch-quick-tabs', '#quickTabNew', '#quickTabReview', '#smartModal [role=tab]'].filter(s => document.querySelector(s)),
                skip: ['.tch-skip', '#quickNoNewToday', '#quickNoReviewToday'].filter(s => document.querySelector(s)),
                skipText: btn(/بلا (جديد|مراجعة) اليوم/).length,
                inBeh: ['استوفى المعايير', 'التحضير المنزلي', 'استثناءات'].map(t => { const all = btn(new RegExp('^✓?\\s*(🏠\\s*)?' + t)); return [t, all.length > 0 && all.every(b => beh?.contains(b))]; }),
                list: !!beh && beh.contains(document.getElementById('criteriaList')),
                actionsOutside: [...document.querySelectorAll('.tch-quick-actions')].filter(e => !beh?.contains(e)).length };
        }, [SELD]);
        assert.deepEqual(r.order, KINDS, 'ترتيب الأقسام [data-sec]');
        assert.deepEqual(r.titles.map(t => t.split(' ')[0]), ['الجديد', 'المراجعة', 'السلوك'], 'عناوين الأقسام');
        assert.deepEqual(r.confirms, [['تأكيد', 'false', true, true], ['تأكيد', 'false', true, true], ['تأكيد', 'false', true, true]], 'زر «تأكيد» لكل قسم (النص، aria-pressed، ارتفاع ≥ 44، عرض ≥ 88)');
        assert.deepEqual(r.tabs, [], 'تبويبات باقية');
        assert.deepEqual([r.skip, r.skipText], [[], 0], 'ق79: أزرار «بلا … اليوم» باقية');
        assert.deepEqual(r.inBeh, [['استوفى المعايير', true], ['التحضير المنزلي', true], ['استثناءات', true]], 'ق84: الأزرار ليست داخل قسم السلوك وحده');
        assert.deepEqual([r.list, r.actionsOutside], [true, 0], 'قائمة المعايير خارج قسم السلوك، أو شريط .tch-quick-actions خارجه');
    } finally { await h.close(); }
    await adminSame('open-1');
});

test('ج3 (ق83) الجمل الشارحة الخمس غير ظاهرة للمعلم (ولا بعد لمس المعايير)، ويبقى «آخر محفوظ: البقرة 5 ← يبدأ من: البقرة 6» في قسم الجديد؛ وظاهرة للمشرف', async () => {
    const GONE = ['لتصحيح الموضع أبلغ المشرف', 'غير مقيّم — لا نقاط', 'محفوظه بعد اليوم', 'سيُحفظ:', 'لم يستوفِ', 'استوفى المعايير كلها'];
    const h = await teacherPage();
    try {
        await openAch(h, 1);
        const st = await secState(h.page);
        assert.match(st.new.text, /آخر محفوظ:\s*البقرة 5\s*يبدأ من:\s*البقرة 6/, 'سطرا «آخر محفوظ» و«يبدأ من» في قسم الجديد');   // أ18: ف6 حذف السهم
        { const fl = (await h.page.evaluate(() => {
            const box = document.getElementById('quick_new_start');
            const rows = [...(box?.children || [])].filter(e => e.getClientRects().length).map(e => ({ t: e.innerText.replace(/[\s\u00a0\u202f\u2060]+/g, ' ').trim(), r: e.getBoundingClientRect() }));
            return { all: (box?.innerText || '').replace(/\s+/g, ' ').trim(), rows: rows.map(x => x.t), separate: rows.length === 2 && rows[1].r.top >= rows[0].r.bottom - 1 };
        }));
            assert.deepEqual([fl.rows, fl.separate, fl.all.includes('←')], [['آخر محفوظ: البقرة 5', 'يبدأ من: البقرة 6'], true, false], `سطرا «آخر محفوظ» و«يبدأ من» (ف6: سطران منفصلان بلا سهم): ${JSON.stringify(fl)}`); }
        const seen = async () => { const t = norm(await h.page.locator('#smartModal').innerText()); return GONE.filter(x => t.includes(x)); };
        assert.deepEqual(await seen(), [], 'جمل شارحة ظاهرة عند الفتح');
        await fillNew(h.page); await fillReview(h.page); await fulfill(h.page);
        assert.deepEqual(await seen(), [], 'جمل شارحة ظاهرة بعد الإدخال ولمس المعايير');
        assert.equal(await h.page.evaluate(() => { const e = document.getElementById('generalCriteriaState'); return !!e && e.getClientRects().length > 0; }), false, '#generalCriteriaState ظاهر');
    } finally { await h.close(); }
    const a = await adminPage();
    try {
        await a.page.evaluate(() => openSmartModal(1));
        const t = norm(await a.page.locator('#smartModal').innerText());
        assert.deepEqual(['غير مقيّم — لا نقاط', 'محفوظه بعد اليوم', 'سيُحفظ:'].filter(x => !t.includes(x)), [], 'جملة شارحة غابت عند المشرف');
    } finally { await a.close(); }
    await adminSame('filled-1');
});

test('ج4 (ق90/ق93-4) الافتراضي: الجديد مفتوح والآخران مطويان؛ قسم واحد مفتوح في كل وقت؛ رأس المطوي يفتحه ويطوي غيره؛ رأس المفتوح يطويه؛ المعايير كلها غير معلَّمة', async () => {
    const h = await teacherPage();
    try {
        await openAch(h, 1);
        assert.deepEqual(openOf(await secState(h.page)), ['new'], 'عند الفتح: المفتوح الجديد وحده');
        for (const k of ['review', 'behavior', 'new', 'behavior']) {
            await h.page.locator(SEL.sec(k) + ' ' + SEL.toggle).click();
            assert.deepEqual(openOf(await secState(h.page)), [k], `بعد الضغط على رأس «${k}»: المفتوح`);
        }
        await h.page.locator(SEL.sec('behavior') + ' ' + SEL.toggle).click();
        assert.deepEqual(openOf(await secState(h.page)), [], 'الضغط على رأس المفتوح لم يطوه (اختيار v7 رقم 15)');
        await openSec(h.page, 'behavior');
        const c = await h.page.evaluate(() => ({ checked: [...document.querySelectorAll('#criteriaList .crit-box, #generalOptInHost .crit-box')].filter(b => b.checked).map(b => b.dataset.cid),
            pressed: [...document.querySelectorAll('[data-sec="behavior"] button')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.innerText.trim()) }));
        assert.deepEqual(c, { checked: [], pressed: [] }, 'ق93-4: معيار معلَّم أو زر مضغوط عند الفتح');
        assert.deepEqual(confirmedOf(await secState(h.page)), [], 'قسم مؤكَّد عند الفتح');
    } finally { await h.close(); }
    await adminSame('open-1');
});

// =====================================================================================
// 2) التأكيد (ق90، اختيارات v7 16–17، ق93-1)
// =====================================================================================
test('ج5 (ق90) «تأكيد» الجديد: بلا آية «إلى» ← «اكتب آية النهاية»؛ آية قبل البداية ← رسالة «قبل البداية»؛ بلا تقدير ← «اختر تقديراً» وحدّ التقدير أحمر؛ وفي كلها لا يُؤكَّد؛ المكتمل ← «مؤكَّد ✓» ويُطوى ويُفتح المراجعة بملخص', async () => {
    const h = await teacherPage();
    try {
        await openAch(h, 1);
        const rejected = async (msg, what) => {
            await confirmSec(h.page, 'new');
            const st = await secState(h.page);
            assert.deepEqual([confirmedOf(st), openOf(st)], [[], ['new']], `${what}: أُكِّد أو طُوي`);
            const m = await messageIn(h.page, 'new', msg);
            assert.ok(m, `${what}: لا رسالة «${msg}» ظاهرة داخل قسم الجديد. نص القسم: ${st.new.text}`);
            assert.equal(m.color, RED, `${what}: الرسالة ليست حمراء (--red-700)`);
        };
        await grade(h.page, 'new', 'ممتاز');
        await rejected('اكتب آية النهاية', 'بلا آية «إلى»');
        await setField(h.page, 'quick_new_toAyah', 3);
        await rejected('قبل البداية', 'البقرة 3 قبل البداية البقرة 6');
        await h.page.evaluate(() => { generalQuickEntry.grades.new = ''; renderGeneralQuickGrades(); updateGeneralQuickPreview(); });
        await setField(h.page, 'quick_new_toAyah', 10);
        await rejected('اختر تقديراً', 'بلا تقدير');
        const borders = await h.page.evaluate(() => { const box = document.getElementById('quick_new_grades'); const bs = [...box.querySelectorAll('button')];
            return { box: getComputedStyle(box).borderColor, buttons: bs.map(b => getComputedStyle(b).borderTopColor) }; });
        assert.ok(borders.box === RED || (borders.buttons.length && borders.buttons.every(c => c === RED)), `حدّ التقدير ليس أحمر: ${JSON.stringify(borders)}`);
        await grade(h.page, 'new', 'ممتاز');
        await confirmSec(h.page, 'new');
        const st = await secState(h.page);
        assert.deepEqual([confirmedOf(st), openOf(st)], [['new'], ['review']], 'المكتمل: [المؤكَّد، المفتوح]');
        assert.equal(st.new.confirm.svg, true, '«مؤكَّد» بلا علامة SVG');
        assert.ok(st.new.sum.includes('البقرة') && st.new.sum.includes('ممتاز'), `ملخص الجديد المطوي: «${st.new.sum}»`);
        assert.equal((await okWrites(h, 1)).length, 0, 'التأكيد كتب شيئاً');
    } finally { await h.close(); }
    await adminSame('filled-1');
});

test('ج6 (ق90) «تأكيد» المراجعة: بلا آية «إلى» ← «اكتب آية النهاية»؛ بلا تقدير ← «اختر تقديراً»؛ المكتمل ← مؤكَّد ويُطوى بملخص ويُفتح السلوك؛ والسلوك يُؤكَّد بلا شرط (اختيار 16)', async () => {
    const h = await teacherPage();
    try {
        await openAch(h, 1);
        await openSec(h.page, 'review');
        await grade(h.page, 'review', 'جيد');
        await confirmSec(h.page, 'review');
        let st = await secState(h.page);
        assert.deepEqual([confirmedOf(st), openOf(st)], [[], ['review']], 'بلا آية: أُكِّد أو طُوي');
        assert.ok(await messageIn(h.page, 'review', 'اكتب آية النهاية'), `لا «اكتب آية النهاية» في قسم المراجعة: ${st.review.text}`);
        await h.page.evaluate(() => { generalQuickEntry.grades.review = ''; renderGeneralQuickGrades(); updateGeneralQuickPreview(); });
        await fillReview(h.page, null);
        await confirmSec(h.page, 'review');
        st = await secState(h.page);
        assert.deepEqual(confirmedOf(st), [], 'بلا تقدير: أُكِّد');
        assert.ok(await messageIn(h.page, 'review', 'اختر تقديراً'), `لا «اختر تقديراً» في قسم المراجعة: ${st.review.text}`);
        await grade(h.page, 'review', 'جيد');
        await confirmSec(h.page, 'review');
        st = await secState(h.page);
        assert.deepEqual([confirmedOf(st), openOf(st)], [['review'], ['behavior']], 'المكتمل: [المؤكَّد، المفتوح]');
        assert.ok(st.review.sum.includes('الفاتحة') && st.review.sum.includes('جيد'), `ملخص المراجعة المطوي: «${st.review.sum}»`);
        await confirmSec(h.page, 'behavior');
        st = await secState(h.page);
        assert.deepEqual(confirmedOf(st), ['review', 'behavior'], 'السلوك بلا لمس لم يُؤكَّد');
        assert.equal((await okWrites(h, 1)).length, 0, 'التأكيد كتب شيئاً');
    } finally { await h.close(); }
    await adminSame('filled-1');
});

test('ج7 (ق90، اختيار 17) الضغط على «مؤكَّد» يلغي التأكيد ويفتح القسم للتعديل؛ قسم مؤكَّد فُتح من رأسه يبقى مؤكَّداً ما دام صحيحاً، وتعديل يُفسده يعيده غير مؤكَّد والذيل معطّلاً', async () => {
    const h = await teacherPage();
    try {
        await openAch(h, 1);
        await fillNew(h.page); await confirmSec(h.page, 'new');
        assert.deepEqual(confirmedOf(await secState(h.page)), ['new'], 'الشرط المسبق: الجديد مؤكَّد');
        await confirmSec(h.page, 'new');   // الضغط على «مؤكَّد»
        let st = await secState(h.page);
        assert.deepEqual([confirmedOf(st), openOf(st), bare(st.new.confirm?.text)], [[], ['new'], 'تأكيد'], 'الضغط على «مؤكَّد»: [المؤكَّد، المفتوح، نص الزر]');
        await confirmSec(h.page, 'new');
        await h.page.locator(SEL.sec('new') + ' ' + SEL.toggle).click();   // فتح المؤكَّد من رأسه
        st = await secState(h.page);
        assert.deepEqual([confirmedOf(st), openOf(st)], [['new'], ['new']], 'فتح المؤكَّد من رأسه ألغى تأكيده');
        await setField(h.page, 'quick_new_toAyah', 12);
        assert.deepEqual(confirmedOf(await secState(h.page)), ['new'], 'تعديل صحيح ألغى التأكيد');
        assert.equal(footPoints((await foot(h.page)).text) !== null && !(await foot(h.page)).disabled, true, 'الذيل ليس مفعّلاً بجديد مؤكَّد');
        await setField(h.page, 'quick_new_toAyah', 3);   // قبل البداية
        st = await secState(h.page);
        assert.deepEqual(confirmedOf(st), [], 'تعديل مُفسد (البقرة 3 قبل البداية) أبقى القسم مؤكَّداً');
        const f = await foot(h.page);
        assert.equal(f.disabled, true, `الذيل مفعّل بعد فساد القسم المؤكَّد الوحيد: ${f.text}`);
    } finally { await h.close(); }
    await adminSame('filled-1');
});

test('ج8 (ق93-1/ق93-2) Enter في آية «إلى» = «تأكيد» القسم لا الحفظ (الجديد ثم المراجعة)؛ Enter في بحث السورة بلا نتيجة يغلق القائمة برسالة بلا حفظ ولا تأكيد؛ الحفظ من «حفظ» وحده؛ والمشرف: Enter يحفظ كما اليوم', async () => {
    const h = await teacherPage();
    try {
        await openAch(h, 1);
        await fillNew(h.page);
        await h.page.locator('#quick_new_toAyah').focus();
        await h.page.keyboard.press('Enter');
        await h.page.waitForTimeout(500);
        assert.equal((await okWrites(h, 1)).length, 0, 'Enter في آية الجديد حفظ');
        let st = await secState(h.page);
        assert.deepEqual([confirmedOf(st), openOf(st), await modalOpen(h.page)], [['new'], ['review'], true], 'Enter في آية الجديد: [المؤكَّد، المفتوح، النافذة مفتوحة]');
        assert.deepEqual(await sheets(h.page), [], 'Enter أظهر ورقة');
        // ق93-2: بحث بلا نتيجة + Enter.
        await h.page.locator('#quick_review_toSurah_search').fill('xyz');
        assert.equal(await h.page.locator('#quick_review_toSurah_list').isVisible(), true, 'الشرط المسبق: قائمة البحث مفتوحة');
        await h.page.locator('#quick_review_toSurah_search').press('Enter');
        await h.page.waitForTimeout(500);
        st = await secState(h.page);
        assert.equal(await h.page.locator('#quick_review_toSurah_list').isVisible(), false, 'القائمة لم تُغلق');
        assert.ok(await messageIn(h.page, 'review', 'لا سورة بهذا الاسم'), 'لا «لا سورة بهذا الاسم» في قسم المراجعة');
        assert.deepEqual([confirmedOf(st), (await okWrites(h, 1)).length], [['new'], 0], 'Enter في البحث بلا نتيجة أكّد أو حفظ');
        await fillReview(h.page);
        await h.page.locator('#quick_review_toAyah').focus();
        await h.page.keyboard.press('Enter');
        await h.page.waitForTimeout(500);
        st = await secState(h.page);
        assert.deepEqual([confirmedOf(st), (await okWrites(h, 1)).length, await modalOpen(h.page)], [['new', 'review'], 0, true], 'Enter في آية المراجعة: [المؤكَّد، الكتابات، النافذة مفتوحة]');
        await pressSave(h.page);
        await waitToast(h, 'أحمد');
        assert.deepEqual((await mineToday(h, 1)).map(e => e.kind).sort(), ['new', 'review'], 'زر «حفظ» لم يحفظ القسمين المؤكَّدين');
    } finally { await h.close(); }
    // المشرف: Enter في آية المراجعة يحفظ الجديد والمراجعة كما اليوم.
    const a = await adminPage();
    try {
        await a.page.evaluate(ADMIN_RUN, ADMIN_STATES['filled-1']);
        await a.page.locator('#quick_review_toAyah').focus();
        await a.page.keyboard.press('Enter');
        await a.page.waitForTimeout(600);
        assert.equal((await okWrites(a, 1)).filter(l => l.op === 'updateDoc').length, 1, 'Enter عند المشرف لم يحفظ');
    } finally { await a.close(); }
    await adminSame('filled-1');
});

// =====================================================================================
// 3) الذيل والحفظ (ق90، ق98-1/-2، ق78)
// =====================================================================================
test('ج9 (ق90/ق98-2) الذيل: بلا تأكيد «حفظ» معطّل + «أكّد قسماً واحداً على الأقل»؛ السلوك وحده ← «أكّد الجديد أو المراجعة» ومعطّل؛ النقاط من المؤكَّد وحده (20 ← 23.5 ← + المعايير) وتساوي المحفوظ', async () => {
    const h = await teacherPage();
    try {
        await openAch(h, 1);
        let f = await foot(h.page);
        assert.deepEqual([f.disabled, f.text.includes('أكّد قسماً واحداً على الأقل')], [true, true], `بلا تأكيد: ${f.text}`);
        await h.page.evaluate(() => document.getElementById('generalQuickSaveBtn').click());
        await h.page.waitForTimeout(300);
        assert.equal((await okWrites(h, 1)).length, 0, 'الحفظ المعطّل حفظ');
        await openSec(h.page, 'behavior'); await confirmSec(h.page, 'behavior');
        f = await foot(h.page);
        assert.deepEqual([f.disabled, f.text.includes('أكّد الجديد أو المراجعة')], [true, true], `السلوك وحده مؤكَّد: ${f.text}`);
        await confirmSec(h.page, 'behavior');   // «مؤكَّد» ← يُلغى ويُفتح
        await fulfill(h.page);                  // معايير بلا تأكيد السلوك
        await fillNew(h.page); await confirmSec(h.page, 'new');
        f = await foot(h.page);
        assert.deepEqual([f.disabled, footPoints(f.text)], [false, 20], `الجديد وحده مؤكَّد (المعايير غير مؤكَّدة لا تُحسب): ${f.text}`);
        await fillReview(h.page);
        assert.equal(footPoints((await foot(h.page)).text), 20, 'مراجعة مكتوبة غير مؤكَّدة حُسبت في الذيل');
        await confirmSec(h.page, 'review');
        assert.equal(footPoints((await foot(h.page)).text), 23.5, 'الجديد والمراجعة مؤكَّدان');
        await openSec(h.page, 'behavior'); await confirmSec(h.page, 'behavior');
        const n = footPoints((await foot(h.page)).text);
        assert.ok(n !== null && n !== 23.5, `السلوك المؤكَّد (استوفى المعايير) لم يغيّر الذيل: ${(await foot(h.page)).text}`);
        await pressSave(h.page);
        await waitToast(h, 'أحمد');
        const w = (await okWrites(h, 1)).filter(l => l.op === 'updateDoc');
        assert.equal(w.length, 1, 'عدد الكتابات');
        assert.equal(savedPoints(w[0].writes[0]), n, 'نقاط الذيل ≠ النقاط المحفوظة (التسجيلات + criteriaPoints)');
    } finally { await h.close(); }
    await adminSame('filled-1');
});

test('ج10 (ق98-1/ق78) مراجعة مكتوبة غير مؤكَّدة + جديد مؤكَّد + «حفظ» ← ورقة «لم تُدخل مراجعة لِأحمد»: «حفظ» الأصلي لا يحفظ ما دامت ظاهرة، لمس الخلفية و«أدخل المراجعة» يفتحان المراجعة بما كُتب ويركّزان آية «إلى»، «احفظ الجديد فقط» يحفظ تسجيلاً واحداً', async () => {
    const h = await teacherPage();
    try {
        await openAch(h, 1);
        await fillNew(h.page); await confirmSec(h.page, 'new');
        await fillReview(h.page);
        await openSec(h.page, 'new');
        const showSheet = async what => {
            await pressSave(h.page);
            const sh = await sheets(h.page);
            assert.equal(sh.length, 1, `${what}: الورقة الحاجبة .tch-sheet لم تظهر. ${await diagnose(h)}`);
            assert.ok(bare(sh[0].text).startsWith(bare('لم تُدخل مراجعة لِأحمد')), `${what}: عنوان الورقة «${sh[0].text}»`);
            assert.deepEqual(sh[0].buttons, ['أدخل المراجعة', 'احفظ الجديد فقط'], `${what}: أزرار الورقة`);
            assert.equal((await okWrites(h, 1)).length, 0, `${what}: حُفظ مع ظهور الورقة`);
        };
        const backToReview = async what => {
            assert.deepEqual(await sheets(h.page), [], `${what}: الورقة باقية`);
            const st = await secState(h.page);
            assert.deepEqual(openOf(st), ['review'], `${what}: قسم المراجعة لم يُفتح`);
            assert.equal(await h.page.evaluate(() => document.activeElement?.id), 'quick_review_toAyah', `${what}: التركيز ليس على آية «إلى» للمراجعة`);
            assert.equal(await h.page.inputValue('#quick_review_toAyah'), '7', `${what}: ما كتبه المعلم في المراجعة ضاع`);
            assert.equal((await okWrites(h, 1)).length, 0, `${what}: حُفظ`);
        };
        await showSheet('الحفظ الأول');
        // الضغطة الثانية على «حفظ» الأصلي (برمجياً) والورقة ظاهرة ← لا حفظ.
        await h.page.evaluate(() => document.getElementById('generalQuickSaveBtn').click());
        await h.page.waitForTimeout(400);
        assert.equal((await okWrites(h, 1)).length, 0, 'الضغطة الثانية على «حفظ» حفظت والورقة ظاهرة');
        assert.equal((await sheets(h.page)).length, 1, 'الورقة اختفت بالضغطة الثانية');
        // لمس الخلفية في موضع زر «حفظ» نفسه = «أدخل المراجعة».
        const box = await h.page.locator('#generalQuickSaveBtn').boundingBox();
        await h.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await h.page.waitForTimeout(300);
        await backToReview('لمس الخلفية');
        await openSec(h.page, 'new');
        await showSheet('الحفظ الثاني');
        await sheetButton(h.page, 'أدخل المراجعة');
        await h.page.waitForTimeout(200);
        await backToReview('«أدخل المراجعة»');
        await showSheet('الحفظ الثالث');
        await sheetButton(h.page, 'احفظ الجديد فقط');
        await waitToast(h, 'أحمد');
        assert.deepEqual((await mineToday(h, 1)).map(e => e.kind), ['new'], '«احفظ الجديد فقط» لم يحفظ تسجيلاً واحداً (الجديد)');
        assert.equal((await okWrites(h, 1)).length, 1, 'عدد الكتابات');
        await staysClosed(h, 'بعد «احفظ الجديد فقط»');
    } finally { await h.close(); }
    await adminSame('newonly-1');
});

test('ج11 (ق78/ق98-1) الاتجاه المعاكس: جديد مكتوب غير مؤكَّد + مراجعة مؤكَّدة لفهد ← «لم تُدخل جديداً لِفهد»: «أدخل الجديد» يفتح الجديد بما كُتب ويركّز آيته؛ «احفظ المراجعة فقط» يحفظ المراجعة وحدها', async () => {
    const h = await teacherPage();
    try {
        await openAch(h, 5);
        await fillNew(h.page);
        await fillReview(h.page); await confirmSec(h.page, 'review');
        await pressSave(h.page);
        let sh = await sheets(h.page);
        assert.equal(sh.length, 1, `الورقة لم تظهر. ${await diagnose(h)}`);
        assert.ok(bare(sh[0].text).startsWith(bare('لم تُدخل جديداً لِفهد')), `عنوان الورقة «${sh[0].text}»`);
        assert.deepEqual(sh[0].buttons, ['أدخل الجديد', 'احفظ المراجعة فقط'], 'أزرار الورقة');
        await sheetButton(h.page, 'أدخل الجديد');
        await h.page.waitForTimeout(200);
        assert.deepEqual(openOf(await secState(h.page)), ['new'], 'قسم الجديد لم يُفتح');
        assert.deepEqual([await h.page.evaluate(() => document.activeElement?.id), await h.page.inputValue('#quick_new_toAyah')], ['quick_new_toAyah', '10'], 'التركيز أو ما كُتب في الجديد');
        await pressSave(h.page);
        sh = await sheets(h.page);
        assert.equal(sh.length, 1, 'الورقة لم تظهر في الحفظ الثاني');
        await sheetButton(h.page, 'احفظ المراجعة فقط');
        await waitToast(h, 'فهد');
        assert.deepEqual((await mineToday(h, 5)).map(e => e.kind), ['review'], 'المحفوظ ليس المراجعة وحدها (الجديد غير المؤكَّد حُفظ أو لم يُحفظ شيء)');
    } finally { await h.close(); }
    await adminSame('newonly-1');
});

test('ج12 (ق98-1) السلوك غير المؤكَّد لا يُحفظ: جديد ومراجعة مؤكَّدان و«استوفى المعايير» بلا تأكيد السلوك ← التسجيل بلا criteria، مطابق بايتاً لحفظ المشرف الجديد والمراجعة بلا معايير', async () => {
    const h = await teacherPage();
    let teacher;
    try {
        await openAch(h, 1);
        await fillNew(h.page); await confirmSec(h.page, 'new');
        await fillReview(h.page); await confirmSec(h.page, 'review');
        await fulfill(h.page);
        assert.deepEqual(confirmedOf(await secState(h.page)), ['new', 'review'], 'الشرط المسبق: السلوك غير مؤكَّد');
        assert.equal(footPoints((await foot(h.page)).text), 23.5, 'الذيل حسب معايير غير مؤكَّدة');
        await pressSave(h.page);
        assert.deepEqual(await sheets(h.page), [], 'ورقة ظهرت والجديد والمراجعة مؤكَّدان');
        await waitToast(h, 'أحمد');
        const w = (await okWrites(h, 1)).filter(l => l.op === 'updateDoc');
        assert.equal(w.length, 1, 'عدد الكتابات');
        teacher = w[0].writes[0];
        assert.deepEqual(Object.keys(teacher.data).filter(k => /\.criteria(Points)?$/.test(k)), [], 'المعايير غير المؤكَّدة حُفظت');
    } finally { await h.close(); }
    const a = await adminPage();
    try {
        await a.page.evaluate(ADMIN_RUN, { id: 1, newTo: 10, review: true, save: true });
        await a.page.waitForTimeout(500);
        const w = (await okWrites(a, 1)).filter(l => l.op === 'updateDoc');
        assert.equal(w.length, 1, 'الشرط المسبق: المشرف لم يحفظ');
        assert.equal(JSON.stringify(normalizePatch(teacher)), JSON.stringify(normalizePatch(w[0].writes[0])), 'تسجيل المعلم ليس بايتاً كتسجيل المشرف للمدخلات المؤكَّدة نفسها');
    } finally { await a.close(); }
    await adminSame('filled-1');
});

test('ج13 (ق90/ق98) الثلاثة مؤكَّدة (جديد البقرة 6–10 ممتاز، مراجعة الفاتحة 1–7 جيد، استوفى المعايير) ← التسجيل مطابق بايتاً لما يحفظه المشرف بالمدخلات نفسها (عدا by)، والنقاط في الذيل = المحفوظة', async () => {
    const h = await teacherPage();
    let teacher, shown;
    try {
        await openAch(h, 1);
        await fillNew(h.page); await confirmSec(h.page, 'new');
        await fillReview(h.page); await confirmSec(h.page, 'review');
        await fulfill(h.page); await confirmSec(h.page, 'behavior');
        assert.deepEqual(confirmedOf(await secState(h.page)), KINDS, 'الشرط المسبق: الثلاثة مؤكَّدة');
        shown = footPoints((await foot(h.page)).text);
        await pressSave(h.page);
        await waitToast(h, 'أحمد');
        const w = (await okWrites(h, 1)).filter(l => l.op === 'updateDoc');
        assert.equal(w.length, 1, 'عدد الكتابات');
        teacher = w[0].writes[0];
        assert.deepEqual([...new Set(Object.entries(teacher.data).filter(([k]) => k.includes('.entries.')).map(([, v]) => v.by))], ['teacher-uid'], 'by');
    } finally { await h.close(); }
    const a = await adminPage();
    try {
        await a.page.evaluate(ADMIN_RUN, { ...ADMIN_STATES['filled-1'], save: true });
        await a.page.waitForTimeout(500);
        const w = (await okWrites(a, 1)).filter(l => l.op === 'updateDoc');
        assert.equal(w.length, 1, 'الشرط المسبق: المشرف لم يحفظ');
        assert.equal(JSON.stringify(normalizePatch(teacher)), JSON.stringify(normalizePatch(w[0].writes[0])), 'تسجيل المعلم ليس بايتاً كتسجيل المشرف');
        assert.ok(Object.keys(teacher.data).some(k => k.endsWith('.criteriaPoints')), 'الشرط المسبق: المعايير لم تُحفظ');
        assert.equal(shown, savedPoints(teacher), 'نقاط الذيل ≠ المحفوظة');
    } finally { await a.close(); }
    await adminSame('filled-1');
});

// =====================================================================================
// 4) الحالات داخل الهيكل الجديد (ق80، 03g–03j، ق77، ق70)
// =====================================================================================
test('ج14 (ق80) المتوقف عن الجديد: قسم الجديد معطّل بلا «تأكيد» بسطر «متوقف عن الجديد · اختبار · يفتحه المشرف» ولا يُفتح؛ النافذة على المراجعة؛ حفظ المراجعة وحدها بلا ورقة؛ رفع الحالة من المشرف (المستمع) يفتحه في الفتح التالي', async () => {
    const h = await teacherPage({ mods: { 1: { newPaused: EXAM_NOW() } } });
    try {
        await openAch(h, 1);
        let st = await secState(h.page);
        assert.deepEqual([st.new.disabled, st.new.confirm, openOf(st)], [true, null, ['review']], 'المتوقف: [الجديد معطّل، زر تأكيد فيه، المفتوح]');
        assert.ok(bare(st.new.text).includes(bare('متوقف عن الجديد · اختبار · يفتحه المشرف')), `سطر المتوقف في قسم الجديد: «${st.new.text}»`);
        await h.page.locator(SEL.sec('new') + ' ' + SEL.toggle).click({ force: true }).catch(() => {});
        assert.deepEqual(openOf(await secState(h.page)), ['review'], 'الضغط على الجديد المعطّل فتحه');
        await fillReview(h.page); await confirmSec(h.page, 'review');
        await pressSave(h.page);
        assert.deepEqual(await sheets(h.page), [], 'ورقة ق78 ظهرت للمتوقف');
        await waitToast(h, 'أحمد');
        assert.deepEqual((await mineToday(h, 1)).map(e => e.kind), ['review'], 'مراجعة المتوقف لم تُحفظ من أول ضغطة');
        // رفع الحالة من جهاز المشرف (لقطة المستمع).
        await h.page.evaluate(([p, today]) => { const d = window.__fb.get(p); d.newPaused = [{ reason: 'exam', from: '2026-11-18', to: today }]; window.__fb.set(p, d); }, [S(1), TODAY]);
        await h.page.waitForFunction(() => !document.querySelector('.teacher-card[data-id="1"]')?.innerText.includes('متوقف عن الجديد'), null, { timeout: 3000 })
            .catch(() => assert.fail('الشارة باقية بعد رفع الحالة'));
        await openAch(h, 1);
        st = await secState(h.page);
        assert.deepEqual([st.new.disabled, !!st.new.confirm, openOf(st)], [false, true, ['new']], 'بعد الرفع: [الجديد معطّل، زر تأكيد، المفتوح]');
        assert.ok(!st.new.text.includes('يفتحه المشرف'), 'سطر المتوقف باقٍ بعد الرفع');
    } finally { await h.close(); }
    await adminSame('paused-1');
});

test('ج15 (ق90 03i/ق43) المسجَّل اليوم: صندوق «سُجّل اليوم» فوق الأقسام (من جهاز آخر بلا «تراجع»)؛ ولتسجيل هذا الجهاز «تراجع» يحذف تسجيلاً واحداً', async () => {
    const h = await teacherPage();
    try {
        await openAch(h, 2);
        const geo = async () => h.page.evaluate(sel => {
            const box = [...document.querySelectorAll('#smartModal *')].filter(e => e.getClientRects().length && /^سُجّل اليوم/.test((e.innerText || '').trim())).pop();
            const first = document.querySelector(sel);
            return box ? { text: box.closest('#quickTodayBox')?.innerText.replace(/\s+/g, ' ').trim() || box.innerText.replace(/\s+/g, ' ').trim(),
                above: !!first && box.getBoundingClientRect().bottom <= first.getBoundingClientRect().top + 0.5 && !first.contains(box) } : null;
        }, SEL.sec('new'));
        let g = await geo();
        assert.ok(g, 'صندوق «سُجّل اليوم» غير ظاهر لبدر');
        assert.equal(g.above, true, 'صندوق «سُجّل اليوم» ليس فوق الأقسام');
        assert.ok(g.text.includes('سُجّل من جهاز آخر') && !g.text.includes('تراجع'), `صندوق بدر: ${g.text}`);
        await h.page.locator('#generalQuickSection button[aria-label="رجوع"]').filter({ visible: true }).first().click();
        await openAch(h, 1);
        await fillNew(h.page); await confirmSec(h.page, 'new');
        await fillReview(h.page); await confirmSec(h.page, 'review');
        await pressSave(h.page);
        await waitToast(h, 'أحمد');
        await staysClosed(h, 'بعد حفظ أحمد');
        await openAch(h, 1);
        g = await geo();
        assert.ok(g && g.above && g.text.includes('تراجع'), `صندوق أحمد (هذا الجهاز): ${JSON.stringify(g)}`);
        await h.page.locator('#quickTodayBox button').filter({ hasText: 'تراجع' }).first().click();
        await h.page.waitForTimeout(700);
        assert.equal((await mineToday(h, 1)).length, 1, '«تراجع» لم يحذف تسجيلاً واحداً');
    } finally { await h.close(); }
    await adminSame('open-2');
});

test('ج16 (ق90 03g) الموضع الأول (سعد بلا موضع): صندوق «أول إنجاز» بحقلي الموضع داخل قسم الجديد؛ «تأكيد» بلا موضع يُرفض برسالة؛ بالموضع يُؤكَّد ويُحفظ frontierFix باسم المعلم', async () => {
    const h = await teacherPage();
    try {
        await openAch(h, 4);
        const r = await h.page.evaluate(sel => {
            const s = document.querySelector(sel), pos = ['quick_positionSurah', 'quick_positionAyah'].map(id => document.getElementById(id));
            const head = s && [...s.querySelectorAll('*')].filter(e => e.getClientRects().length && /أول إنجاز/.test(e.innerText || '')).pop();
            return { head: !!head, inside: pos.every(e => !!e && s.contains(e)), boxHasPos: !!head && pos.every(e => head.closest('div,fieldset,section')?.contains(e) || false) };
        }, SEL.sec('new'));
        assert.deepEqual([r.head, r.inside], [true, true], `«أول إنجاز» أو حقلا الموضع ليسا داخل قسم الجديد: ${JSON.stringify(r)}`);
        await setField(h.page, 'quick_new_toAyah', 10); await grade(h.page, 'new', 'ممتاز');
        await confirmSec(h.page, 'new');
        const st = await secState(h.page);
        assert.deepEqual(confirmedOf(st), [], 'أُكِّد بلا موضع');
        assert.ok(await messageIn(h.page, 'new', 'حدّد'), `لا رسالة «حدّد …» للموضع في قسم الجديد: ${st.new.text}`);
        await setField(h.page, 'quick_positionSurah', 2); await setField(h.page, 'quick_positionAyah', 5);
        await setField(h.page, 'quick_new_toSurah', 2); await setField(h.page, 'quick_new_toAyah', 10);   // السورة بقيت الفاتحة (القسم ملموس بالتقدير)
        await confirmSec(h.page, 'new');
        { const s2 = await secState(h.page); assert.deepEqual(confirmedOf(s2), ['new'], 'لم يُؤكَّد بالموضع: ' + s2.new.text.slice(0, 200)); }
        await fillReview(h.page); await confirmSec(h.page, 'review');
        await pressSave(h.page);
        await waitToast(h, 'سعد');
        const d = await h.doc(S(4));
        assert.deepEqual([d.frontierFix?.surah, d.frontierFix?.ayah, d.frontierFix?.by], [2, 5, 'teacher-uid'], 'frontierFix');
    } finally { await h.close(); }
    await adminSame('open-4');
});

test('ج17 (ق90 03h) فشل الحفظ: ورقة «لم يُحفظ؛ أعد المحاولة» والنافذة باقية بأقسامها المؤكَّدة؛ «إعادة المحاولة» بعد عودة الخادم تحفظ وتغلق', async () => {
    const h = await teacherPage();
    try {
        await openAch(h, 1);
        await fillNew(h.page); await confirmSec(h.page, 'new');
        await fillReview(h.page); await confirmSec(h.page, 'review');
        await h.page.evaluate(() => { window.__fb.failWrites = { code: 'unavailable' }; });
        await pressSave(h.page);
        await h.page.waitForTimeout(600);
        assert.ok((await h.fbLog()).some(l => l.result === 'failed'), 'الشرط المسبق: لم تُحاول الكتابة');
        const sh = await sheets(h.page);
        assert.ok(sh.some(s => s.text.includes('لم يُحفظ؛ أعد المحاولة') && s.buttons.includes('إعادة المحاولة')), `ورقة الفشل: ${JSON.stringify(sh)}`);
        assert.equal(await modalOpen(h.page), true, 'الفشل أغلق النافذة');
        assert.deepEqual(confirmedOf(await secState(h.page)), ['new', 'review'], 'الفشل ألغى التأكيد');
        await h.page.evaluate(() => { window.__fb.failWrites = null; });
        await sheetButton(h.page, 'إعادة المحاولة');
        await waitToast(h, 'أحمد');
        assert.deepEqual((await mineToday(h, 1)).map(e => e.kind).sort(), ['new', 'review'], 'إعادة المحاولة لم تحفظ');
        await staysClosed(h, 'بعد إعادة المحاولة');
    } finally { await h.close(); }
    await adminSame('filled-1');
});

// أ29 (ق189–ق190، الجولة 5، 2026-11-20): كان «فتح سعد والرسالة ظاهرة ← الرسالة ثابتة فوق الذيل مباشرة ولا تغطي «حفظ» ولا رأس الجديد».
// هذا لم يعد ممكناً: فتح نافذة الإنجاز يزيل الرسالة. صار: فتح سعد يزيل الرسالة، فلا شيء فوق «حفظ» ولا رأس الجديد.
test('ج18 (ق77/ق70/ق190) الحفظ يغلق ويعود للقائمة (المحفوظ له ينزل) بلا فتح أحد؛ وفتح سعد والرسالة ظاهرة ← الرسالة تُزال فلا تغطي «حفظ» ولا رأس الجديد', async () => {
    const h = await teacherPage();
    try {
        assert.deepEqual(await cardIds(h.page), [1, 4, 5, 2, 3], 'الشرط المسبق: ترتيب البطاقات');
        await openAch(h, 1);
        await fillNew(h.page); await confirmSec(h.page, 'new');
        await fillReview(h.page); await confirmSec(h.page, 'review');
        await pressSave(h.page);
        await waitToast(h, 'أحمد');
        await staysClosed(h, 'بعد الحفظ');
        assert.deepEqual(await cardIds(h.page), [4, 5, 1, 2, 3], 'القائمة بعد الحفظ');
        await openAch(h, 4);
        await h.page.waitForTimeout(150);
        const g = await h.page.evaluate(KINDS => {
            const r = e => { if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }; };
            const t = document.getElementById('teacherToast');
            return { toast: r(t), position: t && getComputedStyle(t).position, footer: r(document.getElementById('generalQuickFooter')), save: r(document.getElementById('generalQuickSaveBtn')),
                heads: KINDS.map(k => r(document.querySelector(`#generalQuickSection [data-sec="${k}"] .tch-acc-toggle`))) };
        }, KINDS);
        const overlap = (a, b) => !!a && !!b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        assert.ok(g.footer && g.heads.every(Boolean), `الشرط المسبق: الذيل أو رؤوس الأقسام غير ظاهرة ${JSON.stringify(g)}`);
        assert.equal(g.toast, null, `فتح نافذة سعد لم يُزل الرسالة (ق190): ${JSON.stringify(g)}`);
        assert.equal(overlap(g.toast, g.save), false, 'الرسالة تغطي «حفظ»');
        assert.equal(overlap(g.toast, g.heads[0]), false, 'الرسالة تغطي رأس الجديد (أول الأقسام، موضع التبويبين في ق70)');
    } finally { await h.close(); }
    await adminSame('open-1');
});

// =====================================================================================
// 5) المساعدة و1280
// =====================================================================================
test('ج19 (ق90) المساعدة «!»: ست خطوات بنص v7 (شاشة 09) — العدد والكلمات المفتاحية لكل خطوة، و«فهمت» تغلقها', async () => {
    const KEYS = [['اختر الحلقة'], ['الإنجاز', 'بطاقة الطالب'], ['الجديد', 'تأكيد', 'المراجعة', 'السلوك', 'حفظ', 'تُغلق النافذة'], ['تراجع'],
        ['غائب', 'بعذر', 'بغير عذر', 'إلغاء الغياب'], ['تعديل', 'حذف', 'الأيام الفائتة يسجّلها المشرف']];
    const h = await teacherPage();
    try {
        await h.page.locator('#teacherHelpBtn').click();
        await waitFor(h, '#teacherHelpSheet', 'ورقة المساعدة');
        const r = await h.page.evaluate(() => { const s = document.getElementById('teacherHelpSheet');
            return { title: s.querySelector('h2')?.innerText.trim(), steps: [...s.querySelectorAll('ol > li')].filter(e => e.getClientRects().length).map(e => e.innerText.replace(/\s+/g, ' ').trim()),
                svgs: s.querySelectorAll('ol > li:last-child svg, ol > li:last-child i').length }; });
        assert.equal(r.title, 'كيف تسجّل إنجاز اليوم', 'عنوان المساعدة');
        assert.equal(r.steps.length, 6, `عدد الخطوات (ol > li): ${JSON.stringify(r.steps)}`);
        KEYS.forEach((keys, i) => assert.deepEqual(keys.filter(k => !r.steps[i].includes(k)), [], `الخطوة ${i + 1} «${r.steps[i]}» تنقصها كلمات`));
        assert.ok(r.svgs >= 2, 'الخطوة 6 بلا أيقونتي التعديل والخيارات');
        await h.page.locator('#teacherHelpSheet button').filter({ hasText: /^\s*فهمت\s*$/ }).click();
        assert.equal(await h.page.locator('#teacherHelpSheet').count(), 0, '«فهمت» لم تغلق المساعدة');
    } finally { await h.close(); }
    await adminSame('open-1');
});

test('ج20 (ق90، 1280) على الحاسوب: نافذة الإنجاز بعرض ≤ 560 في الوسط، والأقسام والذيل داخلها', async () => {
    const h = await teacherPage({ width: 1280, height: 800 });
    try {
        await openAch(h, 1);
        const g = await h.page.evaluate(() => {
            const panel = document.getElementById('generalQuickSection').closest('#smartModal > *');
            const r = e => e.getBoundingClientRect();
            const p = r(panel), inside = e => { const b = r(e); return b.left >= p.left - 0.5 && b.right <= p.right + 0.5; };
            return { w: p.width, left: p.left, right: innerWidth - p.right, secs: [...document.querySelectorAll('#generalQuickSection [data-sec]')].map(inside), foot: inside(document.getElementById('generalQuickFooter')) };
        });
        assert.ok(g.w <= 560 && g.w >= 320, `عرض النافذة ${g.w}`);
        assert.ok(Math.abs(g.left - g.right) <= 2, `النافذة ليست في الوسط: يسار ${g.left}، يمين ${g.right}`);
        assert.deepEqual([g.secs, g.foot], [[true, true, true], true], 'الأقسام أو الذيل خارج النافذة');
    } finally { await h.close(); }
    await adminSame('open-1');
});

// =====================================================================================
// أ15 (حكم المراجع المستقل ج7 «يُصلَح أولاً»، teacher-r2-review-out.md: ف1، ف2، والطفرة الناجية K7) — 2026-11-18، إضافة فقط.
// =====================================================================================
async function footState(page) {
    return page.evaluate(() => {
        const f = document.getElementById('generalQuickFooter'), b = document.getElementById('generalQuickSaveBtn');
        const lines = [...f.querySelectorAll('*')].filter(e => e.getClientRects().length && e.children.length === 0 && (e.innerText || '').trim())
            .map(e => ({ text: e.innerText.replace(/\s+/g, ' ').trim(), color: getComputedStyle(e).color }));
        return { text: (f.innerText || '').replace(/\s+/g, ' ').trim(), lines, disabled: !!b && (b.disabled || b.getAttribute('aria-disabled') === 'true') };
    });
}
test('ج21 (ف1، ق93-1) Enter في بحث السورة والقائمة مغلقة، وفي خانة معيار، وفي أي حقل ليس خانة آية ← لا حفظ ولا تأكيد ولا ورقة، والنافذة والذيل كما هما؛ والمسار الطبيعي (اختيار سورة ثم لمس البحث ثانية + Enter) لا يحفظ؛ وEnter في خانة آية يبقى تأكيداً', async () => {
    const h = await teacherPage();
    try {
        await openAch(h, 1);
        await fillNew(h.page); await confirmSec(h.page, 'new');
        await fillReview(h.page); await confirmSec(h.page, 'review');
        assert.deepEqual(confirmedOf(await secState(h.page)), ['new', 'review'], 'الشرط المسبق: الجديد والمراجعة مؤكَّدان (فالحفظ المباشر ينجح لو وقع)');
        const footBefore = (await foot(h.page)).text;
        const still = async what => {
            await h.page.waitForTimeout(600);
            const st = await secState(h.page);
            assert.equal((await okWrites(h, 1)).length, 0, `${what}: حُفظ بـEnter (ف1: Enter في وضع المعلم لا يصل إلى حفظ المشرف)`);
            assert.deepEqual([await modalOpen(h.page), confirmedOf(st), await sheets(h.page)], [true, ['new', 'review'], []], `${what}: [النافذة مفتوحة، المؤكَّد، الأوراق]`);
            assert.equal((await foot(h.page)).text, footBefore, `${what}: الذيل تغيّر`);
        };
        // (1) بحث سورة المراجعة والقائمة مغلقة: Enter مرتين.
        await openSec(h.page, 'review');
        await h.page.locator('#quick_review_toSurah_search').focus();
        assert.equal(await h.page.locator('#quick_review_toSurah_list').isVisible(), false, 'الشرط المسبق: القائمة مغلقة');
        await h.page.keyboard.press('Enter'); await h.page.keyboard.press('Enter');
        await still('Enter في بحث سورة المراجعة (القائمة مغلقة)');
        // (2) بحث سورة الجديد.
        await openSec(h.page, 'new');
        await h.page.locator('#quick_new_toSurah_search').focus();
        await h.page.keyboard.press('Enter');
        await still('Enter في بحث سورة الجديد');
        // (3) حقل ليس خانة آية: بحث «من» للمراجعة.
        await openSec(h.page, 'review');
        await h.page.locator('#quick_review_fromSurah_search').focus();
        await h.page.keyboard.press('Enter');
        await still('Enter في بحث «من» للمراجعة');
        // (4) المسار الطبيعي: كتابة «الفاتحة» واختيارها بـEnter، ثم لمس البحث ثانية وEnter.
        await h.page.locator('#quick_review_toSurah_search').fill('الفاتحة');
        assert.equal(await h.page.locator('#quick_review_toSurah_list').isVisible(), true, 'الشرط المسبق: قائمة البحث مفتوحة');
        await h.page.locator('#quick_review_toSurah_search').press('Enter');
        await h.page.waitForTimeout(200);
        await h.page.locator('#quick_review_toSurah_search').click();
        await h.page.keyboard.press('Enter');
        await still('المسار الطبيعي (اختيار ثم لمس البحث + Enter)');
        // (5) خانة معيار.
        await openSec(h.page, 'behavior');
        await h.page.locator(SEL.sec('behavior') + ' button').filter({ hasText: 'استثناءات' }).first().click();
        const box = h.page.locator('#criteriaList .crit-box').filter({ visible: true }).first();
        assert.ok(await box.count(), 'الشرط المسبق: لا خانة معيار ظاهرة');
        await box.focus();
        await h.page.keyboard.press('Enter');
        await still('Enter في خانة معيار');
        // (6) خانة الآية تبقى تأكيداً: «مؤكَّد» على المراجعة يلغيها، وEnter في آيتها يعيدها مؤكَّدة بلا حفظ.
        await confirmSec(h.page, 'review');
        assert.deepEqual(confirmedOf(await secState(h.page)), ['new'], 'الشرط المسبق: المراجعة أُلغي تأكيدها');
        await h.page.locator('#quick_review_toAyah').focus();
        await h.page.keyboard.press('Enter');
        await h.page.waitForTimeout(500);
        assert.deepEqual([confirmedOf(await secState(h.page)), (await okWrites(h, 1)).length], [['new', 'review'], 0], 'Enter في آية المراجعة: [المؤكَّد، الكتابات]');
    } finally { await h.close(); }
    await adminSame('filled-1');
});

test('ج22 (ف2) «حفظ» معطّل بخطأ حساب («التحضير المنزلي» مع «يُعاد» في القسمين) ← سطر أحمر في الذيل بنص سبب البرنامج نفسه، ولا مجموع نقاط؛ وعند زوال السبب يختفي السطر ويعود «N نقاط» و«حفظ» مفعّلاً', async () => {
    const h = await teacherPage();
    try {
        await openAch(h, 1);
        const reason = await h.page.evaluate(() => homePrepRejectionMessage(getProgramSettings()));
        assert.ok(reason.includes('التحضير المنزلي'), `الشرط المسبق: نص سبب البرنامج «${reason}»`);
        await fillNew(h.page, 10, 'يُعاد'); await confirmSec(h.page, 'new');
        await fillReview(h.page, 'يُعاد'); await confirmSec(h.page, 'review');
        await openSec(h.page, 'behavior');
        const prep = h.page.locator(SEL.sec('behavior') + ' button').filter({ hasText: /التحضير المنزلي/ }).filter({ visible: true }).first();
        assert.ok(await prep.count(), 'زر «التحضير المنزلي» غير ظاهر في قسم السلوك');
        await prep.click();
        await confirmSec(h.page, 'behavior');
        assert.deepEqual(confirmedOf(await secState(h.page)), KINDS, 'الشرط المسبق: الثلاثة مؤكَّدة');
        assert.ok(await h.page.evaluate(m => calculateGeneralQuickEntry(students.find(s => s.id === 1)).errors.some(e => e.message === m), reason), 'الشرط المسبق: الحساب لا يرفض التحضير المنزلي مع «يُعاد»');
        let f = await footState(h.page);
        const line = f.lines.find(l => l.text.includes(reason));
        assert.ok(line, `الذيل بلا سطر السبب «${reason}» و«حفظ» ${f.disabled ? 'معطّل' : 'مفعّل'}: «${f.text}»`);
        assert.equal(line.color, RED, 'سطر السبب ليس أحمر (--red-700)');
        if (f.disabled) assert.equal(footPoints(f.text), null, `مجموع نقاط مضلّل في الذيل مع الزر المعطّل: «${f.text}»`);
        // زوال السبب: إلغاء «التحضير المنزلي».
        await openSec(h.page, 'behavior');
        await prep.click();
        await h.page.waitForTimeout(200);
        f = await footState(h.page);
        assert.ok(!f.text.includes(reason), `سطر السبب باقٍ بعد زواله: «${f.text}»`);
        assert.deepEqual([f.disabled, footPoints(f.text) !== null], [false, true], `بعد زوال السبب: [«حفظ» معطّل، «N نقاط» ظاهرة] «${f.text}»`);
    } finally { await h.close(); }
    await adminSame('filled-1');
});

test('ج23 (K7، حارس) فشل الحفظ: كل مدخلات الأقسام غير المؤكَّدة تعود كما كتبها المعلم (المراجعة بسورتيها وآيتيها وتقديرها، والمعايير)، وتظهر «لم يُحفظ؛ أعد المحاولة»، ولا يُفقد شيء', async () => {
    const h = await teacherPage();
    try {
        await openAch(h, 1);
        await fillNew(h.page); await confirmSec(h.page, 'new');
        await fillReview(h.page);              // مكتوبة غير مؤكَّدة
        await fulfill(h.page);                 // معايير بلا تأكيد السلوك
        const snap = () => h.page.evaluate(() => ({
            review: ['fromSurah', 'fromAyah', 'toSurah', 'toAyah'].map(f => document.getElementById('quick_review_' + f).value),
            grade: [...document.querySelectorAll('#quick_review_grades button')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.innerText.trim()),
            gradeState: generalQuickEntry.grades.review,
            crit: [...document.querySelectorAll('.crit-box')].filter(b => b.checked).map(b => b.dataset.cid).sort(),
            newTo: document.getElementById('quick_new_toAyah').value }));
        const before = await snap();
        assert.deepEqual([before.review, before.grade, before.crit.length > 0], [['1', '1', '1', '7'], ['جيد'], true], `الشرط المسبق: ${JSON.stringify(before)}`);
        await h.page.evaluate(() => { window.__fb.failWrites = { code: 'unavailable' }; });
        await pressSave(h.page);
        await sheetButton(h.page, 'احفظ الجديد فقط');
        await h.page.waitForTimeout(800);
        assert.ok((await h.fbLog()).some(l => l.result === 'failed'), 'الشرط المسبق: لم تُحاول الكتابة');
        const sh = await sheets(h.page);
        assert.ok(sh.some(s => s.text.includes('لم يُحفظ؛ أعد المحاولة')), `ورقة الفشل: ${JSON.stringify(sh)}`);
        assert.deepEqual(await snap(), before, 'مدخلات الأقسام غير المؤكَّدة لم تعد كما كتبها المعلم بعد فشل الحفظ');
        assert.deepEqual([await modalOpen(h.page), confirmedOf(await secState(h.page))], [true, ['new']], 'النافذة أو التأكيد بعد الفشل');
    } finally { await h.close(); }
    await adminSame('filled-1');
});

// =====================================================================================
// أ17 (محاكي الجولة 2 د6، teacher-r2-emu-out.md: ي1، ي2) — 2026-11-19، إضافة فقط.
// =====================================================================================
const DISABLED_BG = 'rgb(229, 233, 231)';   // --disabled-bg
async function saveBtnState(page) {
    return page.evaluate(() => {
        const b = document.getElementById('generalQuickSaveBtn');
        return { disabled: b.disabled, aria: b.getAttribute('aria-disabled'), bg: getComputedStyle(b).backgroundColor };
    });
}
test('ج24 (ي1) فتح الإنجاز من البطاقة بالمسار الكامل (openSmartModal وما يستدعيه، ومنه updateGeneralUndoButton) ← «حفظ» معطّل فعلاً ومظهره المعطّل ما دام لا قسم مؤكَّداً، ويبقى كذلك بعد استدعاء لاحق لـupdateGeneralUndoButton وبعد لقطة من الخادم؛ ويتفعّل بعد تأكيد الجديد', async () => {
    const h = await teacherPage();
    try {
        await openAch(h, 1);   // نقرة «الإنجاز» على البطاقة ← openSmartModal كاملة
        await h.page.waitForTimeout(200);
        const off = async what => {
            const b = await saveBtnState(h.page);
            assert.ok(b.disabled === true || b.aria === 'true', `${what}: «حفظ» غير معطّل ${JSON.stringify(b)}`);
            assert.equal(b.bg, DISABLED_BG, `${what}: «حفظ» بمظهر فعّال لا معطّل (المطلوب --disabled-bg) ${JSON.stringify(b)}`);
            assert.equal(b.disabled, true, `${what}: «حفظ» disabled=false (ي1: updateGeneralUndoButton أعاد تفعيله) ${JSON.stringify(b)}`);
        };
        assert.deepEqual(confirmedOf(await secState(h.page)), [], 'الشرط المسبق: لا قسم مؤكَّد');
        await off('عند الفتح');
        await h.page.evaluate(() => updateGeneralUndoButton());
        await off('بعد استدعاء updateGeneralUndoButton');
        // لقطة من الخادم لطالب آخر (المستمع يعيد الرسم).
        await h.page.evaluate(p => { const d = window.__fb.get(p); d.name = d.name + ' '; window.__fb.set(p, d); }, S(5));
        await h.page.waitForTimeout(500);
        assert.equal(await modalOpen(h.page), true, 'الشرط المسبق: النافذة أُغلقت باللقطة');
        await off('بعد لقطة من الخادم');
        await fillNew(h.page); await confirmSec(h.page, 'new');
        const on = await saveBtnState(h.page);
        assert.deepEqual([on.disabled, on.aria === 'true', on.bg === DISABLED_BG], [false, false, false], `بعد تأكيد الجديد «حفظ» لم يتفعّل ${JSON.stringify(on)}`);
        await h.page.evaluate(() => updateGeneralUndoButton());
        assert.equal((await saveBtnState(h.page)).disabled, false, 'updateGeneralUndoButton عطّل «حفظ» بعد التأكيد');
    } finally { await h.close(); }
    await adminSame('open-1');
});

test('ج25 (ي2) فشل الحفظ عند المعلم (patchStudent يرمي، ورفض الكتابة في الفايربيس الوهمي) ← ورقة «لم يُحفظ؛ أعد المحاولة» وحدها: لا رسالة «فشل الحفظ السحابي…» ولا نص الخطأ الخام؛ وعند المشرف الرسالة العامة كما كانت', async () => {
    const RAW = 'FirebaseError: raw-test-error-7Q';
    const generic = page => page.evaluate(() => {
        const t = document.getElementById('toastMessage'), txt = (document.getElementById('toastText')?.innerText || '').trim();
        const shown = !!t && !t.classList.contains('hidden') && t.getClientRects().length > 0 && getComputedStyle(t).visibility !== 'hidden';
        return { shown, txt, body: document.body.innerText };
    });
    for (const how of ['throw', 'failWrites']) {
        const h = await teacherPage();
        try {
            await openAch(h, 1);
            await fillNew(h.page); await confirmSec(h.page, 'new');
            await fillReview(h.page); await confirmSec(h.page, 'review');
            if (how === 'throw') await h.page.evaluate(raw => { window.almahraData.patchStudent = async () => { throw new Error(raw); }; }, RAW);
            else await h.page.evaluate(() => { window.__fb.failWrites = { code: 'unavailable', message: 'raw-test-error-7Q' }; });
            await pressSave(h.page);
            await h.page.waitForTimeout(300);
            const sh = await sheets(h.page);
            assert.ok(sh.some(s => s.text.includes('لم يُحفظ؛ أعد المحاولة')), `(${how}) ورقة الفشل لم تظهر: ${JSON.stringify(sh)}`);
            const g = await generic(h.page);
            assert.ok(!g.shown || g.txt === '', `(${how}) رسالة البرنامج العامة ظاهرة فوق الورقة: «${g.txt}»`);
            assert.ok(!g.body.includes('raw-test-error-7Q') && !g.body.includes('فشل الحفظ السحابي'), `(${how}) نص خطأ خام أو «فشل الحفظ السحابي» ظاهر في الصفحة`);
            assert.equal(await modalOpen(h.page), true, `(${how}) النافذة أُغلقت`);
        } finally { await h.close(); }
    }
    // المشرف: الرسالة العامة كما كانت.
    const a = await adminPage();
    try {
        await a.page.evaluate(ADMIN_RUN, ADMIN_STATES['filled-1']);
        await a.page.evaluate(raw => { window.almahraData.patchStudent = async () => { throw new Error(raw); }; }, RAW);
        await a.page.evaluate(() => document.getElementById('generalQuickSaveBtn').click());
        await a.page.waitForTimeout(300);
        const g = await generic(a.page);
        assert.deepEqual([g.shown, g.txt], [true, 'فشل الحفظ السحابي: ' + RAW], 'رسالة المشرف العامة عند الفشل تغيّرت');
    } finally { await a.close(); }
    await adminSame('filled-1');
});
