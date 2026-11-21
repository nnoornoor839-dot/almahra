// بطاقة «متوقف عن الجديد» — اختبار القبول الأحمر (أمثلة ت1–ت16)، 2026-11-17، كاتب اختبار أ9.
// المرجع: D:\المهره\notes\features\accounts\new-paused-card.md (§2، §4، §6، وقرارات Fable س1–س10).
// ت11 في tests/rules/teacher.test.js (قواعد حقيقية على المحاكي)؛ ت17 = المجموعة كاملة؛ ت18 = جولة المحاكي بحسابين (ليس هنا).
// الطريقتان كما في teacher-ui-local: (أ) vm لدوال التقارير، (ب) Playwright فوق tests/helpers/teacher-ui-harness.cjs (فايربيس وهمي).
//
// افتراضات الاختبار فيما لم تسمّه البطاقة (تُذكر في التقرير ليقرّها Fable):
//   • الحقل كما س1: newPaused = [{ reason: 'exam'|'circumstance', from: 'YYYY-MM-DD', to: null|'YYYY-MM-DD' }]؛ متوقف الآن = آخر عنصر to === null؛
//     اليوم D من أيام حالته = from <= D و(to === null أو D < to). يوم الوضع مستثنى، ويوم الرفع يُحسب عادياً (§4).
//   • خانة المشرف (س3): في #studentModal عنصر checkbox ظاهر في وضع التعديل وحده، نص تسميته (label أو aria-label) يحوي «متوقف عن الجديد»،
//     والسبب select ظاهر بخياري «اختبار»/«ظرف» أو زرّا راديو بالنصين. الحفظ بزر #studentSaveButton القائم (saveStudent).
//   • الكتابة: مفتاح newPaused كاملاً (مصفوفة) في طلب تعديل الطالب نفسه؛ ولا يُكتب newPaused إن لم تتغيّر الخانة (ت3: طالب بلا الحقل كما اليوم).
//   • الشارة نصّاً «متوقف عن الجديد · اختبار» أو «· ظرف»: داخل .teacher-card عند المعلم (و.tch-badge تبقى كما هي)، وداخل صف .gs-card في صفحة الطلاب.
//   • التقارير: الاستثناء يقرأ student.newPaused داخل generalPerformanceTotals وgeneralStudentReport (أو دالة نقية مساعدة)، لا قارئاً جديداً في readers.
//     الـvm يحمّل دوال التقارير كما reports-local ومعها أي دالة اسمها يحوي NewPaus/newPaus.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const H = require('./helpers/teacher-ui-harness.cjs');
const { source } = require('./helpers/quick-entry-harness.cjs');

const html = H.read('index.html');
const TODAY = H.TODAY;   // 2026-11-22
const S = id => 'programs/general/seasons/s1/students/' + id;
const BADGE = 'متوقف عن الجديد';
const EXAM_NOW = () => [{ reason: 'exam', from: '2026-11-18', to: null }];
let browser;
before(async () => {
    const playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); });

// ===== أدوات (منسوخة من teacher-ui-local بلا تغيير في معناها) =====
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
async function diagnose(h) {
    const st = await h.page.evaluate(() => ({ toast: document.getElementById('toastText')?.innerText || '', role: window.almahraAuth?.currentRole || null })).catch(e => ({ evalError: e.message }));
    const log = await h.fbLog().catch(() => []);
    return `الحال=${JSON.stringify(st)} أخطاء الصفحة=${JSON.stringify(h.errors.slice(0, 3))} آخر عمليات السحابة=${log.slice(-5).map(l => l.op + ':' + (l.path || (l.writes || []).map(w => w.type + ' ' + w.path).join(',')) + (l.result ? '=' + l.result : '')).join(' | ')}`;
}
async function waitFor(h, selector, what, timeout = 6000) {
    try { await h.page.locator(selector).first().waitFor({ state: 'attached', timeout }); }
    catch { assert.fail(`${what}: العنصر ${selector} غير موجود. ${await diagnose(h)}`); }
}
function list(mods = {}) {
    const l = H.students();
    for (const [id, extra] of Object.entries(mods)) Object.assign(l[id], extra);
    return l;
}
async function teacherPage(seed = {}) {
    const h = await H.openPage(browser, { user: H.TEACHER_USER, seed: { teacherUser: true, ...seed } });
    await waitFor(h, '#teacherHome', 'صفحة المعلم لم تُفتح', 7000);
    return h;
}
async function adminPage(seed = {}, size = {}) {
    const h = await H.openPage(browser, { user: H.ADMIN_USER, seed, ...size });
    await h.page.waitForFunction(() => window.almahraPrograms?.getCurrentProgramId?.() === 'general' && window.almahraData?.isReady?.(), null, { timeout: 7000 });
    await h.page.locator('#loadingOverlay').waitFor({ state: 'hidden' }).catch(() => {});
    return h;
}
const card = (page, id) => page.locator(`.teacher-card[data-id="${id}"]`);
const isSelected = loc => loc.evaluate(e => e.getAttribute('aria-selected') === 'true' || e.getAttribute('aria-pressed') === 'true' || e.classList.contains('active'));
const pressed = (page, id) => page.evaluate(id => document.getElementById(id)?.getAttribute('aria-pressed') ?? null, id);
// أ14 (ق101 س2): الفتح والتنقل والتأكيد بأداة الهاركنس الواحدة (أقسام v7 للمعلم، والهيكل القديم للمشرف) بدل التبويبين الملغيين.
async function openAch(h, id) { await H.openAch(h, id).catch(async e => assert.fail(`${e.message}. ${await diagnose(h)}`)); }
async function setField(page, id, value) {
    const ok = await page.evaluate(([id, value]) => {
        const el = document.getElementById(id); if (!el) return false;
        el.value = String(value); ['input', 'change'].forEach(t => el.dispatchEvent(new Event(t, { bubbles: true }))); return true;
    }, [id, value]);
    assert.ok(ok, `الحقل #${id} غير موجود`);
}
async function grade(page, kind, name) {
    const b = page.locator(`#quick_${kind}_grades button`).filter({ hasText: name }).first();
    assert.ok(await b.count(), `زر التقدير «${name}» غير موجود`);
    await b.click();
}
// أ14: عند المعلم «الإدخال» = فتح القسم + الحقول + «تأكيد» (ق98-1: ما لم يُؤكَّد لا يُحفظ)؛ عند المشرف كما كان.
async function fillNew(page, toAyah = 10) {
    const acc = await H.quickAccordion(page);
    if (acc) await H.openSec(page, 'new');
    await setField(page, 'quick_new_toAyah', toAyah); await grade(page, 'new', 'ممتاز');
    if (acc) await H.confirmSec(page, 'new');
}
async function fillReview(page) {
    await H.openSec(page, 'review');
    for (const [id, v] of [['quick_review_fromSurah', 1], ['quick_review_fromAyah', 1], ['quick_review_toSurah', 1], ['quick_review_toAyah', 7]]) await setField(page, id, v);
    await grade(page, 'review', 'جيد');
    await H.confirmSec(page, 'review');
}
async function pressSave(page) {
    await H.confirmBehavior(page);   // أ14: السلوك يُحفظ مؤكَّداً (المعلم وحده)
    await page.evaluate(() => typeof updateGeneralQuickPreview === 'function' && updateGeneralQuickPreview());
    await page.locator('#generalQuickSaveBtn').click();
}
const okWrites = async (h, id) => (await h.fbLog()).filter(l => (l.writes || []).some(w => w.path === S(id)) && l.result === 'ok');
const mineToday = async (h, id) => Object.values((await h.doc(S(id)))?.history?.[TODAY]?.entries || {}).filter(e => e.by === 'teacher-uid');
const modalOpen = page => page.evaluate(() => document.getElementById('smartModal').classList.contains('flex'));
const quickWho = async page => norm(await page.locator('#generalQuickName').innerText());
async function waitWho(h, name, what) {
    await h.page.waitForFunction(n => document.getElementById('smartModal')?.classList.contains('flex')
        && document.getElementById('generalQuickName')?.innerText.replace(/\s+/g, ' ').trim() === 'الإنجاز · ' + n, name, { timeout: 4000 })
        .catch(async () => assert.fail(`${what}: لم تُفتح نافذة «الإنجاز · ${name}» (المفتوح: ${await modalOpen(h.page) ? await quickWho(h.page) : 'لا نافذة'}). ${await diagnose(h)}`));
}
async function waitToast(h, name) {
    await h.page.locator('#teacherToast').filter({ hasText: 'حُفظ ل' + name }).waitFor({ state: 'visible', timeout: 4000 })
        .catch(async () => assert.fail(`«حُفظ ل${name}» لم تظهر. ${await diagnose(h)}`));
}
async function closeQuick(h) { await H.closeAch(h.page); }   // أ14: «رجوع» عند المعلم (ق90) بدل ✕
// التسجيل بين حسابين/بذرتين: مفتاح التسجيل عشوائي ← نوعه، وby يُحذف (كما normalizePatch في teacher-ui-local).
function normalizePatch(write) {
    const out = {};
    for (const [k, v] of Object.entries(write.data)) {
        const m = /^(history\.[^.]+\.entries\.)(.+)$/.exec(k);
        if (m && v && typeof v === 'object') { const { by, ...rest } = v; out[m[1] + rest.kind] = rest; }
        else out[k] = v;
    }
    return out;
}
// أ14 (ق90/ق80/ق79): «التبويب المختار» صار «القسم المفتوح» (aria-expanded)، وحُذف noNew لأن زر «بلا جديد اليوم» حُذف بق79 (لا معنى له بعده).
async function tabState(h) {
    const st = await H.secState(h.page);
    return { reviewTab: !!st.review?.expanded, newTab: !!st.new?.expanded,
        reviewRow: await h.page.locator('#quick_review_row').isVisible(), newRow: await h.page.locator('#quick_new_row').isVisible() };
}
const PAUSED_TABS = { reviewTab: true, newTab: false, reviewRow: true, newRow: false };
const NORMAL_TABS = { reviewTab: false, newTab: true, reviewRow: false, newRow: true };
const normalTabs = s => s;

// ===== المشرف: خانة نموذج الطالب (س3) =====
// يعلّم عناصر الخانة والسبب بسمات data-np-* ليصل إليها Playwright؛ لا أثر على المنتج.
async function pauseControls(page) {
    return page.evaluate(() => {
        const modal = document.getElementById('studentModal');
        const vis = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
        const labelOf = e => [...(e.labels || [])].map(l => l.innerText).join(' ') + ' ' + (e.closest('label')?.innerText || '') + ' ' + (e.getAttribute('aria-label') || '');
        const box = [...modal.querySelectorAll('input[type=checkbox]')].find(e => labelOf(e).includes('متوقف عن الجديد'));
        if (box) box.dataset.npBox = '1';
        const select = [...modal.querySelectorAll('select')].find(s => [...s.options].some(o => o.text.trim() === 'اختبار') && [...s.options].some(o => o.text.trim() === 'ظرف'));
        if (select) select.dataset.npReason = '1';
        const radios = [...modal.querySelectorAll('input[type=radio]')].filter(r => ['اختبار', 'ظرف'].includes(labelOf(r).trim()));
        radios.forEach(r => { r.dataset.npRadio = labelOf(r).trim(); });
        const reasonNow = select ? select.options[select.selectedIndex]?.text.trim() : radios.find(r => r.checked)?.dataset.npRadio || null;
        return { box: !!box, boxVisible: vis(box), checked: box ? box.checked : null, select: !!select, radios: radios.length, reasonNow };
    });
}
async function setPause(page, on, reason = 'اختبار') {
    const c = await pauseControls(page);
    assert.ok(c.box && c.boxVisible, `خانة «${BADGE}» غير موجودة أو غير ظاهرة في نموذج تعديل الطالب: ${JSON.stringify(c)}`);
    // بلا نقر بالإحداثيات: النموذج يتمرّر داخلياً في الهاركنس (Tailwind غير محمّل)؛ التغيير بالقيمة + أحداث input/change كما setField.
    const fire = (sel, apply) => page.evaluate(([sel, apply]) => {
        const el = document.querySelector('#studentModal ' + sel); if (!el) return false;
        if (apply === 'toggle') el.click(); else if (apply === 'check') { el.checked = true; } else { el.value = [...el.options].find(o => o.text.trim() === apply).value; }
        ['input', 'change'].forEach(t => el.dispatchEvent(new Event(t, { bubbles: true }))); return true;
    }, [sel, apply]);
    if (c.checked !== on) await fire('[data-np-box="1"]', 'toggle');
    if (on) {
        if (c.select) await fire('[data-np-reason="1"]', reason);
        else if (c.radios) await fire(`[data-np-radio="${reason}"]`, 'check');
        else assert.fail(`لا اختيار للسبب «اختبار/ظرف» في النموذج: ${JSON.stringify(c)}`);
    }
    assert.equal((await pauseControls(page)).checked, on, 'حالة الخانة بعد التغيير');
}
async function saveStudentModal(h, id) {
    const before = (await okWrites(h, id)).length;
    await h.page.evaluate(() => document.getElementById('studentSaveButton').click());   // الزر قد يقع خارج إطار الهاركنس (Tailwind غير محمّل)
    await h.page.waitForFunction(([p, n]) => window.__fb.log.filter(l => l.result === 'ok' && (l.writes || []).some(w => w.path === p)).length > n, [S(id), before], { timeout: 4000 })
        .catch(async () => assert.fail(`حفظ نموذج الطالب ${id} لم يكتب. ${await diagnose(h)}`));
    const w = (await okWrites(h, id)).at(-1).writes.find(x => x.path === S(id));
    return w;
}
async function openEdit(h, id) {
    await h.page.evaluate(id => openStudentModal(id), id);
    await h.page.locator('#studentModal').waitFor({ state: 'visible' });
}

// =====================================================================================
// (أ) المعلم: النافذة والسؤال والشارة
// =====================================================================================
// أ14 (ق90/ق80/ق79): «تبويب المراجعة مختار» صار «قسم المراجعة مفتوح»؛ و«#quickNoNewToday مضغوط» حُذف (الزر حُذف بق79).
test('ت4 المعلم يفتح «الإنجاز» لمتوقف ← قسم المراجعة مفتوح والجديد مغلق؛ ت3 لطالب بلا الحقل كما اليوم (الجديد مفتوح)', async () => {
    const h = await teacherPage({ list: list({ 1: { newPaused: EXAM_NOW() } }) });
    try {
        await openAch(h, 1);
        assert.deepEqual(await tabState(h), PAUSED_TABS, 'نافذة المتوقف: [المراجعة مفتوحة، الجديد غير مفتوح، صف المراجعة ظاهر، صف الجديد مخفي]');
        await closeQuick(h);
        await openAch(h, 5);
        assert.deepEqual(normalTabs(await tabState(h)), NORMAL_TABS, 'ت3: نافذة طالب بلا الحقل تغيّرت');
    } finally { await h.close(); }
});

// أ14 (ق78/ق79): سؤال التبويب الواحد #quickOneSideConfirm صار ورقة ق78 (.tch-sheet)، و«بلا جديد اليوم» للطالب العادي (حُذف بق79) صار زر الورقة الثاني «احفظ المراجعة فقط».
test('ت5 المعلم يحفظ مراجعة فقط لمتوقف ← بلا ورقة ق78، من أول ضغطة، والتسجيل بايتاً كمراجعة طالب غير متوقف بـ«احفظ المراجعة فقط»', async () => {
    const run = async (mods, viaSheet) => {
        const h = await teacherPage({ list: list(mods) });
        try {
            await openAch(h, 1);
            await fillReview(h.page);
            await pressSave(h.page);
            await h.page.waitForTimeout(500);
            const confirmShown = (await H.quickSheets(h.page)).length > 0;
            const first = (await okWrites(h, 1)).filter(l => l.op === 'updateDoc').length;
            if (viaSheet && confirmShown) { await H.sheetButton(h.page, 'احفظ المراجعة فقط'); await h.page.waitForTimeout(500); }
            const writes = (await okWrites(h, 1)).filter(l => l.op === 'updateDoc');
            return { confirmShown, first, writes: writes.length, dialogs: h.dialogs.length, patch: writes[0] && normalizePatch(writes[0].writes[0]) };
        } finally { await h.close(); }
    };
    const paused = await run({ 1: { newPaused: EXAM_NOW() } }, false);
    assert.deepEqual([paused.confirmShown, paused.writes, paused.dialogs], [false, 1, 0], 'المتوقف: [ورقة القسم الواحد ظاهرة، كتابات بعد أول ضغطة، حوارات]');
    const normal = await run({}, true);
    assert.deepEqual([normal.confirmShown, normal.first, normal.writes], [true, 0, 1], 'الشرط المسبق: الطالب غير المتوقف [الورقة ظاهرة، لا كتابة قبلها، تسجيل واحد بـ«احفظ المراجعة فقط»]');
    assert.equal(JSON.stringify(paused.patch), JSON.stringify(normal.patch), 'تسجيل مراجعة المتوقف ليس بايتاً كتسجيل غير المتوقف (المفاتيح والنقاط)');
    assert.ok(!Object.keys(paused.patch).some(k => k.startsWith('newPaused')), 'تسجيل المعلم كتب newPaused');
});

// أ14 (قرار Fable على س1، 2026-11-18): حُذف ت6 «يختار الجديد لمتوقف… (لا قفل)» وت7 «يحفظ جديداً فقط لمتوقف»: ق80 قفل الجديد عند المعلم للمتوقف، وج14 في teacher-r2-accordion-local يغطيه.

// أ10 (ق77، 2026-11-18): أُعيدت كتابته بعد إلغاء «حفظ والتالي»: النافذة تُغلق بعد كل حفظ، والطالب التالي يُفتح من بطاقته؛ ما يحرسه باقٍ (لا تنتقل حالة طالب إلى غيره).
test('ت8 (ق77) حفظ عادي ثم فتح متوقف من بطاقته ← على المراجعة؛ وحفظه ثم فتح عادي ← على الجديد (لا تبقى حالة سابقة)؛ وكل حفظ يُغلق النافذة', async () => {
    // سعد (4) بموضع معروف ومتوقف؛ أحمد (1) وفهد (5) عاديان.
    const h = await teacherPage({ list: list({ 4: { lastSurah: 2, lastAyah: 5, newPaused: EXAM_NOW() } }) });
    const closed = async what => {
        await h.page.waitForFunction(() => !document.getElementById('smartModal')?.classList.contains('flex'), null, { timeout: 4000 })
            .catch(async () => assert.fail(`${what}: النافذة لم تُغلق (المفتوح: ${await quickWho(h.page)})`));
        await h.page.waitForTimeout(600);
        assert.equal(await modalOpen(h.page), false, `${what}: فُتحت نافذة بعد الحفظ (المفتوح: ${await quickWho(h.page)})`);
    };
    try {
        await openAch(h, 1);
        assert.deepEqual(normalTabs(await tabState(h)), NORMAL_TABS, 'الشرط المسبق: أحمد على الجديد');
        await fillNew(h.page); await fillReview(h.page); await pressSave(h.page);
        await waitToast(h, 'أحمد');
        await closed('بعد حفظ أحمد');
        await openAch(h, 4);
        assert.deepEqual(await tabState(h), PAUSED_TABS, 'نافذة سعد المتوقف ليست على المراجعة');
        await fillReview(h.page); await pressSave(h.page);
        await waitToast(h, 'سعد');
        assert.equal((await mineToday(h, 4)).length, 1, 'مراجعة سعد لم تُحفظ من أول ضغطة');
        await closed('بعد حفظ سعد');
        await openAch(h, 5);
        assert.deepEqual(normalTabs(await tabState(h)), NORMAL_TABS, 'نافذة فهد العادي ليست على الجديد (بقيت حالة سعد)');
    } finally { await h.close(); }
});

test('ت10 الشارة «متوقف عن الجديد · اختبار» و«· ظرف» على .teacher-card، و.tch-badge كما هي؛ لا شارة لطالب بلا الحقل أو حالته مرفوعة', async () => {
    const h = await teacherPage({ list: list({ 1: { newPaused: EXAM_NOW() }, 5: { newPaused: [{ reason: 'circumstance', from: TODAY, to: null }] },
        4: { newPaused: [{ reason: 'exam', from: '2026-11-15', to: '2026-11-18' }] } }) });
    try {
        const text = async id => norm(await card(h.page, id).innerText());
        assert.ok((await text(1)).includes(BADGE + ' · اختبار'), `بطاقة أحمد: ${await text(1)}`);
        assert.ok((await text(5)).includes(BADGE + ' · ظرف'), `بطاقة فهد: ${await text(5)}`);
        assert.ok(!(await text(4)).includes(BADGE), `بطاقة سعد (حالة مرفوعة) فيها الشارة: ${await text(4)}`);
        assert.ok(!(await text(2)).includes(BADGE), 'بطاقة بدر (بلا الحقل) فيها الشارة');
        assert.equal(norm(await card(h.page, 1).locator('.tch-badge').innerText()), 'لم يُسجَّل', '.tch-badge لأحمد تغيّرت');
    } finally { await h.close(); }
});

test('ت2 رفع الحالة من جهاز المشرف ← الشارة تختفي عند المعلم لحظياً (المستمع)، والنافذة تعود على الجديد', async () => {
    const h = await teacherPage({ list: list({ 1: { newPaused: EXAM_NOW() } }) });
    try {
        assert.ok(norm(await card(h.page, 1).innerText()).includes(BADGE), 'الشرط المسبق: الشارة لا تظهر لأحمد المتوقف');
        await h.page.evaluate(([p, today]) => { const d = window.__fb.get(p); d.newPaused = [{ reason: 'exam', from: '2026-11-18', to: today }]; window.__fb.set(p, d); }, [S(1), TODAY]);
        await h.page.waitForFunction(b => !document.querySelector('.teacher-card[data-id="1"]')?.innerText.includes(b), BADGE, { timeout: 3000 })
            .catch(() => assert.fail('الشارة باقية عند المعلم بعد رفع الحالة'));
        await openAch(h, 1);
        assert.deepEqual(normalTabs(await tabState(h)), NORMAL_TABS, 'بعد الرفع: النافذة ليست على الجديد');
    } finally { await h.close(); }
});

// =====================================================================================
// (ب) المشرف: المؤشر، الشارة في صفحة الطلاب، خانة النموذج
// =====================================================================================
test('ت9 المشرف يفتح «إدخال إنجاز» لمتوقف ← المؤشر في «إلى» للمراجعة (#quick_review_toAyah)؛ ولطالب عادي كما اليوم (#quick_new_toAyah)', async () => {
    const a = await adminPage({ list: list({ 1: { newPaused: EXAM_NOW() } }) });
    try {
        const focusAfterOpen = async id => {
            await a.page.evaluate(id => openSmartModal(id), id);
            await a.page.locator('#smartModal').waitFor({ state: 'visible' });
            await a.page.waitForTimeout(150);
            const f = await a.page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
            await a.page.evaluate(() => closeSmartModal(true));
            return f;
        };
        assert.equal(await focusAfterOpen(1), 'quick_review_toAyah', 'المؤشر عند فتح نافذة المتوقف');
        assert.equal(await focusAfterOpen(5), 'quick_new_toAyah', 'ت3: المؤشر لطالب عادي تغيّر');
    } finally { await a.close(); }
});

test('ت10 صفحة الطلاب عند المشرف: الشارة في صف .gs-card للمتوقف (اختبار/ظرف)، ولا شارة لغيره؛ ولا شارة في قائمة الإعدادات (س4)', async () => {
    const a = await adminPage({ list: list({ 1: { newPaused: EXAM_NOW() }, 6: { newPaused: [{ reason: 'circumstance', from: '2026-11-20', to: null }] },
        4: { newPaused: [{ reason: 'exam', from: '2026-11-15', to: '2026-11-18' }] } }) }, { width: 1280, height: 900 });
    try {
        await a.page.evaluate(() => { goHome('page-students'); renderGeneralStudentsGrid(); });
        const rows = await a.page.$$eval('#studentsGrid .gs-card', trs => Object.fromEntries(trs.map(tr => [tr.querySelector('.gs-name')?.innerText.trim(), tr.innerText.replace(/\s+/g, ' ').trim()])));
        assert.ok(rows['أحمد']?.includes(BADGE + ' · اختبار'), `صف أحمد: ${rows['أحمد']}`);
        assert.ok(rows['عمر']?.includes(BADGE + ' · ظرف'), `صف عمر: ${rows['عمر']}`);
        for (const name of ['سعد', 'بدر', 'فهد', 'ماجد']) assert.ok(rows[name] && !rows[name].includes(BADGE), `صف ${name} فيه الشارة أو غائب: ${rows[name]}`);
        await a.page.evaluate(() => renderSettingsStudents());
        assert.ok(!(await a.page.locator('#settingsStudentsList').innerText()).includes(BADGE), 'شارة في قائمة الإعدادات (س4: صفحة الطلاب فقط)');
    } finally { await a.close(); }
});

test('ت1 المشرف يضع «متوقف · اختبار» من نموذج تعديل الطالب ← newPaused = [{exam, from: اليوم, to: null}] في الطلب نفسه، وبقية الطلب كما تعديل بلا الخانة؛ الخانة غائبة في وضع الإضافة', async () => {
    // خط الأساس (ت3): حفظ النموذج بلا لمس الخانة لطالب بلا الحقل ← الطلب نفسه كما اليوم، بلا newPaused.
    const b = await adminPage({}, { width: 1280, height: 900 });
    let base;
    try { await openEdit(b, 1); base = await saveStudentModal(b, 1); } finally { await b.close(); }
    assert.ok(!('newPaused' in base.data), `ت3: تعديل طالب بلا الحقل كتب newPaused: ${JSON.stringify(base.data.newPaused)}`);
    const a = await adminPage({}, { width: 1280, height: 900 });
    try {
        await openEdit(a, 1);
        await setPause(a.page, true, 'اختبار');
        const w = await saveStudentModal(a, 1);
        assert.equal(w.type, 'update', 'الكتابة ليست تعديلاً بمسارات (patchStudent)');
        assert.deepEqual(w.data.newPaused, [{ reason: 'exam', from: TODAY, to: null }], 'newPaused المكتوب');
        const { newPaused, ...rest } = w.data;
        assert.equal(JSON.stringify(rest), JSON.stringify(base.data), 'مفاتيح أخرى تغيّرت غير newPaused');
        assert.deepEqual((await a.doc(S(1))).newPaused, [{ reason: 'exam', from: TODAY, to: null }], 'المستند بعد الحفظ');
        // وضع الإضافة: لا خانة (newPaused لا يدخل الإنشاء أبداً، §3 أ5).
        await a.page.evaluate(() => { closeStudentModal(); openStudentModal(null); });
        await a.page.locator('#studentModal').waitFor({ state: 'visible' });
        const add = await pauseControls(a.page);
        assert.equal(add.boxVisible, false, 'خانة «متوقف عن الجديد» ظاهرة في وضع إضافة طالب');
    } finally { await a.close(); }
});

test('ت1 «ظرف» لطالب له فترة سابقة مرفوعة ← يُضاف عنصر جديد في آخر المصفوفة والسابق كما هو', async () => {
    const old = { reason: 'exam', from: '2026-11-01', to: '2026-11-05' };
    const a = await adminPage({ list: list({ 1: { newPaused: [old] } }) }, { width: 1280, height: 900 });
    try {
        await openEdit(a, 1);
        const c = await pauseControls(a.page);
        assert.ok(c.box && c.boxVisible, `خانة «${BADGE}» غير موجودة أو غير ظاهرة: ${JSON.stringify(c)}`);
        assert.equal(c.checked, false, 'الخانة مختارة لطالب حالته مرفوعة');
        await setPause(a.page, true, 'ظرف');
        const w = await saveStudentModal(a, 1);
        assert.deepEqual(w.data.newPaused, [old, { reason: 'circumstance', from: TODAY, to: null }], 'newPaused المكتوب');
    } finally { await a.close(); }
});

test('ت2 المشرف يرفع الحالة ← آخر عنصر to = اليوم والسابق كما هو، والشارة تختفي من صفحة الطلاب؛ وتعديل الاسم وحده لمتوقف لا يغيّر newPaused', async () => {
    const old = { reason: 'circumstance', from: '2026-11-01', to: '2026-11-05' };
    const a = await adminPage({ list: list({ 1: { newPaused: [old, ...EXAM_NOW()] }, 5: { newPaused: EXAM_NOW() } }) }, { width: 1280, height: 900 });
    try {
        await openEdit(a, 1);
        const c = await pauseControls(a.page);
        assert.ok(c.box && c.boxVisible, `خانة «${BADGE}» غير موجودة أو غير ظاهرة: ${JSON.stringify(c)}`);
        assert.deepEqual([c.checked, c.reasonNow], [true, 'اختبار'], 'النموذج لا يعرض الحالة الحالية (الخانة، السبب)');
        await setPause(a.page, false);
        const w = await saveStudentModal(a, 1);
        assert.deepEqual(w.data.newPaused, [old, { reason: 'exam', from: '2026-11-18', to: TODAY }], 'newPaused بعد الرفع');
        await a.page.evaluate(() => { goHome('page-students'); renderGeneralStudentsGrid(); });
        const row = await a.page.$$eval('#studentsGrid .gs-card', trs => trs.find(tr => tr.querySelector('.gs-name')?.innerText.trim() === 'أحمد')?.innerText || '');
        assert.ok(row && !row.includes('متوقف عن الجديد'), `الشارة باقية في صف أحمد بعد الرفع: ${row}`);
        // تعديل الاسم وحده لفهد المتوقف: الحالة لا تُعاد ولا يتغيّر تاريخها.
        await openEdit(a, 5);
        await a.page.evaluate(() => { const n = document.getElementById('studentNameInput'); n.value = 'فهد المعدَّل'; n.dispatchEvent(new Event('input', { bubbles: true })); });
        const w5 = await saveStudentModal(a, 5);
        assert.ok(!('newPaused' in w5.data) || JSON.stringify(w5.data.newPaused) === JSON.stringify(EXAM_NOW()), `تعديل الاسم غيّر newPaused: ${JSON.stringify(w5.data.newPaused)}`);
        assert.deepEqual((await a.doc(S(5))).newPaused, EXAM_NOW(), 'newPaused لفهد بعد تعديل الاسم');
    } finally { await a.close(); }
});

// =====================================================================================
// (ج) التقارير (vm): «إنجاز الجديد» والحضور
// =====================================================================================
const DATES = ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18'];
function reportsVm(text = html) {
    const ctx = vm.createContext({ Date, Math, JSON });
    const names = new Set(['schoolCivilDate', 'formatDateLocal']);
    for (const m of text.matchAll(/function ((?:generalPerformance|generalPeriod|generalStudentReport|generalHalaqaReport)\w*)\(/g))
        if (!/^generalPerformance(?:Number|Percent|.*Html|Chart|DateLabel|Invalidate|Resize)$/.test(m[1])) names.add(m[1]);
    for (const m of text.matchAll(/function (\w*[Nn]ewPaus\w*)\(/g)) names.add(m[1]);
    for (const name of names) vm.runInContext(source(name, text), ctx);
    const readers = {
        stateOf: (s, d) => s.history?.[d]?.attended === false ? { state: 'absent', absence: '' } : s.history?.[d] ? { state: 'present' } : { state: 'unrecorded' },
        startOf: () => '2026-11-01', measure: e => ({ ayahs: e.pages * 10, pages: e.pages, quarters: e.pages / 2.5, hizb: e.pages / 10, juz: e.pages / 20 }),
        schoolDayInfo: d => ({ isSchoolDay: DATES.includes(d) }), endPoint: () => ({ surah: 2, ayah: 1 })
    };
    const config = { newGoalPerDay: 0.5, limits: { attendancePct: 85, newPct: 80 }, periodOf: () => 'asr' };
    const settings = { halaqas: [{ id: 'h', stageId: 'st' }], stages: [{ id: 'st' }] };
    const range = { from: DATES[0], to: DATES.at(-1), today: TODAY };
    const J = v => JSON.parse(JSON.stringify(v));
    return {
        report: s => J(ctx.generalStudentReport(s, range, config, readers)),
        halaqa: l => J(ctx.generalHalaqaReport(l, 'h', range, config, readers)),
        totals: l => J(ctx.generalPerformanceTotals(l, settings, config, 'all', { dates: DATES, today: TODAY }, readers))
    };
}
// حاضر 4 أيام؛ وجهان جديدان في اليومين الأولين؛ مراجعة فقط في الأخيرين.
function stud(id, newPages = [1, 1, 0, 0], extra = {}) {
    const history = {};
    DATES.forEach((d, i) => {
        const entries = { r: { kind: 'review', grade: 'good', pages: 1 } };
        if (newPages[i]) entries.n = { kind: 'new', grade: 'good', pages: newPages[i], spec: { from: [2, 1], to: [2, 5] } };
        history[d] = { attended: true, entries };
    });
    return { id, sid: 'sid-' + id, name: 'ط' + id, halaqaId: 'h', history, ...extra };
}
const HEAD = cp.execFileSync('git', ['show', '9302f6e:index.html'], { cwd: H.root, encoding: 'utf8', maxBuffer: 16e6 });

test('ت12 تقرير الطالب بالأرقام: حاضر 4، متوقف آخر يومين، وجهان في الأولين ← الهدف 1 والإنجاز 100%؛ الحضور 100% وnoNewDates كما هي (س7)', () => {
    const now = reportsVm(), head = reportsVm(HEAD);
    const paused = stud(1, [1, 1, 0, 0], { newPaused: [{ reason: 'exam', from: '2026-11-17', to: null }] });
    const r = now.report(paused);
    assert.deepEqual(r.achievement, { raw: 2, goal: 1, counted: 1, excess: 1, pct: 100 }, 'إنجاز الجديد للمتوقف');
    const plain = head.report(stud(1));
    assert.deepEqual(r.attendance, plain.attendance, 'الحضور تغيّر');
    assert.equal(r.attendance.pct, 100);
    assert.deepEqual(r.noNewDates, ['2026-11-17', '2026-11-18'], 'noNewDates (س7: لا يُلمس)');
    const t = now.totals([paused]);
    assert.deepEqual([t.present, t.absent, t.attendancePct, t.raw, t.goal, t.counted, t.newPct], [4, 0, 100, 2, 1, 1, 100],
        'generalPerformanceTotals [حضر، غاب، الحضور%، الخام، الهدف، المحسوب، الجديد%]');
});

test('ت13 متوقف كل المدى ← هدفه 0 لا يدخل حلقته؛ إنجاز الحلقة = البقية، وحدّ المتابعة 80% عليهم وحدهم', () => {
    const now = reportsVm();
    const whole = stud(1, [0, 0, 0, 0], { newPaused: [{ reason: 'circumstance', from: '2026-11-10', to: null }] }), other = stud(2, [1, 1, 0, 0]);
    const r = now.report(whole);
    assert.deepEqual([r.achievement.goal, r.achievement.pct], [0, null], 'المتوقف كل المدى: [الهدف، النسبة]');
    const hq = now.halaqa([whole, other]);
    assert.deepEqual(hq.achievement, { raw: 2, goal: 2, counted: 2, pct: 100 }, 'إنجاز الحلقة');
    assert.equal(hq.status.new, false, 'الحلقة تحت حدّ المتابعة بسبب المتوقف');
    assert.equal(hq.attendance.pct, 100, 'حضور الحلقة');
    const t = now.totals([whole, other]);
    assert.deepEqual([t.present, t.goal, t.counted, t.newPct, t.attendancePct], [8, 2, 2, 100, 100], 'Totals [حضر، الهدف، المحسوب، الجديد%، الحضور%]');
});

test('ت14 بعد الرفع: أيام الحالة الماضية تبقى مستثناة، ويوم الرفع يُحسب عادياً (from <= D < to)', () => {
    const now = reportsVm();
    const lifted = to => stud(1, [1, 1, 0, 0], { newPaused: [{ reason: 'exam', from: '2026-11-17', to }] });
    assert.deepEqual(now.report(lifted('2026-11-20')).achievement, { raw: 2, goal: 1, counted: 1, excess: 1, pct: 100 }, 'رفع بعد المدى: اليومان مستثنيان');
    assert.deepEqual(now.report(lifted('2026-11-18')).achievement, { raw: 2, goal: 1.5, counted: 1.5, excess: 0.5, pct: 100 }, 'رفع يوم 18: يوم 17 وحده مستثنى');
    assert.deepEqual(now.totals([lifted('2026-11-18')]).goal, 1.5, 'Totals بعد الرفع يوم 18');
    // يوم الوضع مستثنى: from = 18 ← هدف 1.5.
    assert.equal(now.report(stud(1, [1, 1, 0, 0], { newPaused: [{ reason: 'exam', from: '2026-11-18', to: null }] })).achievement.goal, 1.5, 'يوم الوضع لم يُستثنَ');
});

test('ت3 (تقارير) طالب بلا الحقل أو بمصفوفة فارغة ← تقريره وحلقته وTotals بايتاً كما في 9302f6e', () => {
    const now = reportsVm(), head = reportsVm(HEAD);
    const l = [stud(1, [1, 0, 1, 0]), stud(2, [0, 0, 0, 0]), stud(3, [2, 1, 0, 0], { newPaused: [] })];
    for (const s of l) assert.equal(JSON.stringify(now.report(s)), JSON.stringify(head.report(s)), 'تقرير ' + s.name);
    assert.equal(JSON.stringify(now.halaqa(l)), JSON.stringify(head.halaqa(l)), 'تقرير الحلقة');
    assert.equal(JSON.stringify(now.totals(l)), JSON.stringify(head.totals(l)), 'Totals');
});

// =====================================================================================
// (د) لوحة «متوقفون عن الحفظ» في الرئيسية، والنقاط والتلفاز
// =====================================================================================
// أيام الدراسة قبل اليوم في تقويم الهاركنس: 15، 16، 17، 18؛ اليوم 22 بلا تسجيل. مراجعة فقط في 16–18 ← «متوقفون» منذ 3 أيام بلا الحالة.
function reviewOnly(dates) {
    return Object.fromEntries(dates.map(d => [d, { attended: true, entries: { r: { kind: 'review', grade: 'good', spec: { from: [1, 1], to: [1, 7] }, rep: 1, points: 2, at: 1, heardBy: 't1' } } }]));
}
async function stalledRows(seedList) {
    const a = await adminPage({ list: seedList }, { width: 1280, height: 900 });
    try {
        await a.page.evaluate(() => renderGeneralHome());
        return await a.page.evaluate(() => {
            const cards = [...document.querySelectorAll('#generalHomeFollowup > *')];
            const stalled = cards.find(c => c.innerText.includes('متوقفون عن الحفظ'));
            return Object.fromEntries([...(stalled?.querySelectorAll('.gh-row') || [])].map(r => [r.querySelector('.gh-name')?.innerText.trim(), r.querySelector('.gh-tag')?.innerText.trim()]));
        });
    } finally { await a.close(); }
}
test('ت15 لوحة «متوقفون عن الحفظ» لا تذكر المتوقف ما دامت حالته؛ وبعد الرفع لا تعدّ إلا أيام ما بعد الرفع (يوم الرفع منها)', async () => {
    const days = ['2026-11-16', '2026-11-17', '2026-11-18'];
    const base = await stalledRows(list({ 1: { history: reviewOnly(days) } }));
    assert.equal(base['أحمد'], 'منذ 3 أيام', `الشرط المسبق: أحمد بلا الحالة في اللوحة ${JSON.stringify(base)}`);
    const paused = await stalledRows(list({ 1: { history: reviewOnly(days), newPaused: [{ reason: 'exam', from: '2026-11-16', to: null }] } }));
    assert.equal(paused['أحمد'], undefined, `المتوقف مذكور في اللوحة: ${JSON.stringify(paused)}`);
    // رُفعت يوم 17: 17 و18 بعد الرفع ← «منذ يومين».
    const lifted2 = await stalledRows(list({ 1: { history: reviewOnly(days), newPaused: [{ reason: 'exam', from: '2026-11-15', to: '2026-11-17' }] } }));
    assert.equal(lifted2['أحمد'], 'منذ يومين', `بعد الرفع بيومين: ${JSON.stringify(lifted2)}`);
    // رُفعت يوم 18: يوم واحد بعد الرفع ← لا يُذكر.
    const lifted1 = await stalledRows(list({ 1: { history: reviewOnly(days), newPaused: [{ reason: 'exam', from: '2026-11-15', to: '2026-11-18' }] } }));
    assert.equal(lifted1['أحمد'], undefined, `بعد الرفع بيوم واحد مذكور: ${JSON.stringify(lifted1)}`);
});

test('ت16 النقاط والفرسان والنجم الصاعد ولقطة التلفاز: المشرف يسجّل المراجعة نفسها لمتوقف ولغير متوقف ← التسجيل واللقطة واللوحة متطابقة بايتاً', async () => {
    const run = async mods => {
        const a = await adminPage({ list: list(mods) }, { width: 1280, height: 900 });
        try {
            await a.page.evaluate(() => openSmartModal(1));
            await a.page.locator('#smartModal').waitFor({ state: 'visible' });
            await fillReview(a.page); await pressSave(a.page);
            await a.page.waitForFunction(p => window.__fb.log.some(l => l.result === 'ok' && (l.writes || []).some(w => w.path === p)), S(1), { timeout: 4000 })
                .catch(async () => assert.fail('حفظ المشرف لم يكتب. ' + await diagnose(a)));
            await a.page.waitForTimeout(300);
            const w = (await okWrites(a, 1)).at(-1).writes.find(x => x.path === S(1));
            // اللقطة كما تُرسل للتلفاز بايتاً؛ والقادة واللوحة بالرقم والنقاط والرتبة (تحمل كائن الطالب كاملاً بمفتاح تسجيل عشوائي).
            const tv = await a.page.evaluate(() => JSON.stringify({ snapshot: getGeneralTvSnapshot(),
                leaders: getGeneralTvLeaders().map(e => [e.student.id, e.points, e.rank]),
                board: ['asr', 'maghrib'].map(p => getGeneralTvBoard(p).map(e => [e.student.id, e.points, e.rank])),
                rank: getGeneralCelebrationRank(students.find(s => s.id === 1)), stats: getCumulativeStats(students.find(s => s.id === 1)) }));
            return { patch: JSON.stringify(normalizePatch(w)), tv, newPaused: (await a.doc(S(1))).newPaused };
        } finally { await a.close(); }
    };
    const plain = await run({}), paused = await run({ 1: { newPaused: EXAM_NOW() } });
    assert.deepEqual(paused.newPaused, EXAM_NOW(), 'الشرط المسبق: الحالة في المستند');
    assert.equal(paused.patch, plain.patch, 'تسجيل المراجعة (المفاتيح والنقاط) يختلف للمتوقف');
    assert.equal(paused.tv, plain.tv, 'لقطة التلفاز أو الفرسان أو اللوحة تختلف للمتوقف');
    assert.ok(!paused.tv.includes('newPaused') && !paused.tv.includes(BADGE), 'الحالة تسرّبت إلى لقطة التلفاز');
});

// أ11 (ق74، المراجع ف1): رفع حالة وُضعت اليوم نفسه (from = اليوم) ← يُحذف العنصر بطول صفر، والفترة السابقة كما هي.
test('ت17 (ق74) المشرف يرفع حالة وُضعت اليوم ← newPaused المكتوب = الفترة السابقة المرفوعة وحدها، بلا عنصر from = to', async () => {
    const old = { reason: 'exam', from: '2026-11-10', to: '2026-11-14' };
    const a = await adminPage({ list: list({ 1: { newPaused: [old, { reason: 'exam', from: TODAY, to: null }] } }) }, { width: 1280, height: 900 });
    try {
        await openEdit(a, 1);
        const c = await pauseControls(a.page);
        assert.ok(c.box && c.boxVisible, `خانة «${BADGE}» غير موجودة أو غير ظاهرة: ${JSON.stringify(c)}`);
        assert.equal(c.checked, true, 'الشرط المسبق: الخانة غير مختارة لحالة وُضعت اليوم');
        await setPause(a.page, false);
        const w = await saveStudentModal(a, 1);
        assert.deepEqual(w.data.newPaused, [old], 'newPaused بعد رفع حالة اليوم نفسه');
        assert.deepEqual((await a.doc(S(1))).newPaused, [old], 'المستند بعد الحفظ');
    } finally { await a.close(); }
});
