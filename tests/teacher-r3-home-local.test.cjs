// بطاقة 4-4 «حسابات المعلمين» — الجولة 3 «الدخول والرئيسية بشكل v7»: اختبار القبول الأحمر، 2026-11-19، كاتب اختبار أ16.
// المرجع: D:\المهره\notes\features\accounts\teacher-accounts-card.md (ق88 الدخول، ق89 الرئيسية، ق90 المساعدة، ق98-6 التوكنات، ق109 قرارات الجولة 3)،
// والنموذج الملزم D:\المهره\notes\design-v1\teacher\teacher-mockup-v7.html (الشاشات 01، 01a، 01b، 02–02g، 09-help، 11-home-1280)
// وتقريره teacher-mockup-v7-out.md (الاختيارات 2، 4–13، 26)، وD:\المهره\notes\design-v1\DESIGN.md للتوكنات.
// الطريقة: Playwright فوق tests/helpers/teacher-ui-harness.cjs (index.html + الملفات الثلاثة الحقيقية + فايربيس وهمي)، على 390×844 (و1280×900 حيث ذُكر).
//
// «المشرف بلا تغيير» في كل اختبار: adminSame() يفتح جهاز المشرف بالبذرة الافتراضية ويقارن sha256 لـouterHTML
// (#appHeader، nav، #page-home، #page-students) بالمرجع ADMIN_REF المأخوذ من الكود الحالي (index.html 1a145c1e…) بسكربت
// admin-capture.cjs في مجلد الأدلة (يقرأ ADMIN_RUN من هذا الملف حرفياً)؛ ومعه: لا body.teacher-mode، لا #teacherHome، وكل منطقة موجودة.
//
// افتراضات الاختبار فيما لم تسمّه البطاقة (تُذكر في التقرير §5 لتُلزم الباني؛ المحدّدات كلها في SEL وحده):
//   • الدخول: البطاقة البيضاء .tch-login-card، وفيها الشعار (img ظاهر واحد src ينتهي بـassets/brand/afdalkom-logo-vertical-color.png)
//     والعنوان [data-program-brand] «برنامج الحوافز» والخط الذهبي .tch-gold-line؛ النقش عنصر .tch-login-pattern يغطي الشاشة كلها.
//     الزرّان #loginRoleAdmin/#loginRoleTeacher باقيان بعد الاختيار مبدّلاً بـaria-pressed (اختيار v7 رقم 4)؛ الرسالة #loginError القائمة.
//   • الرئيسية: الرأس الأخضر #teacherHeader يحوي بالترتيب #teacherTopBar (الاسم في strong، #teacherHelpBtn، #teacherLogoutBtn)،
//     ثم #teacherHalaqaTabs (أزرار [data-halaqa] بـaria-pressed، وفي كلٍّ عنصر الوقت .tch-when مستقلاً عن الاسم)، ثم #teacherDate.
//   • بطاقات الأرقام: #teacherStats فيها [data-stat="total"|"rec"|"left"] بالترتيب، وفي كلٍّ .tch-stat-label و.tch-stat-num و.tch-stat-ab
//     (الصف الثالث المحجوز؛ نص «منهم غائب k» في بطاقة «متبقٍ» وحدها حين k>0، وغير ظاهر وإلا).
//   • البحث: input#teacherSearch (type=text)، وأيقونة svg داخل أبيه المباشر. المرشّحات: #teacherFilters فيها [data-filter="all"|"none"|"rec"|"abs"] بـaria-pressed.
//   • القائمة #teacherStudentList وبطاقاتها .teacher-card[data-id] كما هي؛ «+ طالب جديد» #teacherAddStudentBtn؛ العطلة .tch-holiday؛ لا اتصال #teacherOffline.
//   • «الطلاب» = طلاب الحلقة المختارة في القائمة (العدد m نفسه في سطر اليوم القائم «سُجّل n من m»)؛ «سُجّل» = له تسجيل اليوم؛ «متبقٍ» = الباقي ومنهم الغائب (ق109-1).
//   • البحث يطابق أي جزء من الاسم بعد حذف التشكيل وتوحيد أ/إ/آ ← ا في الاسم والمكتوب معاً (ق109-2).
//   • المقارنات العربية بعد حذف الحركات (bare)، والأرقام 0-9.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const H = require('./helpers/teacher-ui-harness.cjs');

const TODAY = H.TODAY;
const S = id => 'programs/general/seasons/s1/students/' + id;
const SEL = {
    card: '#loginOverlay .tch-login-card', pattern: '#loginOverlay .tch-login-pattern', brand: '#loginOverlay [data-program-brand]', gold: '#loginOverlay .tch-gold-line',
    header: '#teacherHeader', topBar: '#teacherTopBar', name: '#teacherTopBar strong', help: '#teacherHelpBtn', logout: '#teacherLogoutBtn',
    tabs: '#teacherHalaqaTabs', tab: '#teacherHalaqaTabs button[data-halaqa]', when: '.tch-when', date: '#teacherDate',
    stats: '#teacherStats', stat: k => `#teacherStats [data-stat="${k}"]`, statLabel: '.tch-stat-label', statNum: '.tch-stat-num', statAb: '.tch-stat-ab',
    search: '#teacherSearch', filters: '#teacherFilters', filter: k => `#teacherFilters [data-filter="${k}"]`,
    list: '#teacherStudentList', add: '#teacherAddStudentBtn', holiday: '.tch-holiday', offline: '#teacherOffline'
};
const C = {   // DESIGN.md
    green700: 'rgb(18, 92, 47)', green900: 'rgb(12, 63, 32)', green100: 'rgb(227, 241, 232)', gold600: 'rgb(201, 177, 75)', ink: 'rgb(19, 35, 26)',
    red700: 'rgb(180, 35, 24)', amber800: 'rgb(138, 83, 0)', amber50: 'rgb(255, 244, 220)', white: 'rgb(255, 255, 255)', borderControl: 'rgb(127, 148, 136)',
    clear: 'rgba(0, 0, 0, 0)'
};
const CODE_MSG = 'الرمز غير صحيح أو أُبطل؛ اطلب الرابط من المشرف';
const EMPTY_MSG = 'لا طالب بهذا الوصف';
let browser;
before(async () => {
    const playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); });

// ===== أدوات =====
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
const bare = s => norm(s).replace(/[\u064B-\u0652\u0670]/g, '');
async function diagnose(h) {
    const st = await h.page.evaluate(() => ({ body: document.body.className, loginError: document.getElementById('loginError')?.innerText || '',
        home: (document.getElementById('teacherHome')?.innerText || '').replace(/\s+/g, ' ').slice(0, 300) })).catch(e => ({ evalError: e.message }));
    return `الحال=${JSON.stringify(st)} أخطاء الصفحة=${JSON.stringify(h.errors.slice(0, 3))}`;
}
async function waitFor(h, selector, what, timeout = 6000) {
    try { await h.page.locator(selector).first().waitFor({ state: 'attached', timeout }); }
    catch { assert.fail(`${what}: العنصر ${selector} غير موجود. ${await diagnose(h)}`); }
}
async function teacherPage({ mods = {}, seed = {}, width, height } = {}) {
    const list = H.students();
    for (const [id, extra] of Object.entries(mods)) Object.assign(list[id], extra);
    const size = width ? { width, height: height || 900 } : {};
    let h;
    // تحت حمل المجموعة قد يتأخر التحميل الأول؛ محاولة ثانية واحدة (كما س28).
    try { h = await H.openPage(browser, { user: H.TEACHER_USER, seed: { teacherUser: true, list, ...seed }, ...size }); }
    catch (_) { h = await H.openPage(browser, { user: H.TEACHER_USER, seed: { teacherUser: true, list, ...seed }, ...size }); }
    await waitFor(h, '#teacherHome', 'صفحة المعلم لم تُفتح', 8000);
    await h.page.waitForTimeout(250);
    return h;
}
async function loginPage(opts = {}) {
    const h = await H.openPage(browser, opts);
    await h.page.locator('#loginOverlay').waitFor({ state: 'visible' });
    await h.page.waitForTimeout(150);
    return h;
}
const cardIds = page => page.$$eval('#teacherStudentList .teacher-card[data-id]', els => els.filter(e => e.getClientRects().length).map(e => Number(e.dataset.id)));
const card = (page, id) => page.locator(`.teacher-card[data-id="${id}"]`);
// مقاسات العنصر وقيمه المحسوبة (null إن لم يوجد)؛ visible = له مستطيل ظاهر غير مخفي.
function box(page, selector) {
    return page.evaluate(sel => {
        const e = document.querySelector(sel); if (!e) return null;
        const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height,
            visible: e.getClientRects().length > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0 && r.height > 0,
            bg: cs.backgroundColor, color: cs.color, size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight), opacity: Number(cs.opacity),
            borderColor: cs.borderTopColor, borderWidth: parseFloat(cs.borderTopWidth), borderStyle: cs.borderTopStyle,
            radius: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(parseFloat),
            text: (e.innerText || '').replace(/\s+/g, ' ').trim(), pressed: e.getAttribute('aria-pressed'), type: e.type, placeholder: e.getAttribute('placeholder'),
            value: e.value, gridRows: cs.gridTemplateRows };
    }, selector);
}
const visible = async (page, selector) => !!(await box(page, selector))?.visible;

// ===== المشرف بلا تغيير =====
// <admin-run> (يقرؤه admin-capture.cjs حرفياً)
const ADMIN_REGIONS = ['#appHeader', 'nav', '#page-home', '#page-students'];
async function ADMIN_RUN(browser, H) {
    const a = await H.openPage(browser, { user: H.ADMIN_USER });
    try {
        await a.page.waitForFunction(() => window.almahraPrograms?.getCurrentProgramId?.() === 'general' && window.almahraData?.isReady?.(), null, { timeout: 8000 });
        await a.page.locator('#loadingOverlay').waitFor({ state: 'hidden' }).catch(() => {});
        await a.page.waitForTimeout(500);
        return await a.page.evaluate(regions => ({ teacherMode: document.body.classList.contains('teacher-mode'), teacherHome: !!document.getElementById('teacherHome'),
            html: Object.fromEntries(regions.map(s => [s, document.querySelector(s)?.outerHTML ?? null])) }), ADMIN_REGIONS);
    } finally { await a.close(); }
}
// </admin-run>
const ADMIN_REF = {   // admin-capture.cjs على index.html 1a145c1ee7e5100e1ca58c13bb4a9ef811a0646e5ecea05d83431ec54716d3df
    '#appHeader': '7241b294b73cfab8c1f5f1fb6195aa8a7dfeb155f3e5e74941e1f181f92ad5f7',
    'nav': 'e1458c50c8162cc962ac27dd3d9e0e7e7df9bdebd09f6f0704625186f474c195',
    '#page-home': '05a637a1d2a157bc3bcad4bc5a6a60f6bf17a6c385774fd451ef070ec2cb8e21',
    '#page-students': 'ee0befdb2363232b8255550d42db684aa14c8d4f83d49bca3d7186a30554763d'
};
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
async function adminSame() {
    const r = await ADMIN_RUN(browser, H);
    assert.equal(r.teacherMode, false, 'المشرف: body.teacher-mode');
    assert.equal(r.teacherHome, false, 'المشرف يرى #teacherHome');
    for (const s of ADMIN_REGIONS) {
        assert.ok(r.html[s] !== null, `المشرف فقد ${s}`);
        assert.equal(sha(r.html[s]), ADMIN_REF[s], `المشرف تغيّر: ${s} (طوله الآن ${r.html[s].length})`);
    }
}

// =====================================================================================
// (أ) الدخول (ق88، الشاشات 01/01a/01b)
// =====================================================================================
// لون الخلفية الفعلي عند نقطة: أول أب غير شفاف للعنصر الذي تحتها (النقش لا يلتقط اللمس فلا يظهر هنا).
const bgAt = (page, pts) => page.evaluate(pts => pts.map(([x, y]) => {
    let e = document.elementFromPoint(x, y);
    while (e && getComputedStyle(e).backgroundColor === 'rgba(0, 0, 0, 0)') e = e.parentElement;
    return e ? getComputedStyle(e).backgroundColor : null;
}), pts);

for (const [width, height] of [[390, 844], [1280, 900]]) test(`ل1 (ق88، 01) الدخول على ${width}: الصفحة كلها --green-700 بنقش يغطيها، بطاقة بيضاء زاوية 16 بعرض min(100%−32,420) في الوسط تبدأ قرب الأعلى، فيها الشعار الملوّن و«برنامج الحوافز» 28/900 --green-900 والخط الذهبي، و«مشرف» ثانوي و«معلم» أساسي ≥ 56`, async () => {
    const h = await loginPage({ width, height });
    try {
        const c = await box(h.page, SEL.card);
        assert.ok(c && c.visible, `البطاقة ${SEL.card} غير ظاهرة`);
        // الخلفية: الزوايا الأربع وأعلى الشاشة وأسفلها وجانبا البطاقة أخضر --green-700.
        const pts = [[3, 3], [width - 3, 3], [3, height - 3], [width - 3, height - 3], [width / 2, height - 3], [width / 2, 3]];
        if (c.left > 6) pts.push([c.left / 2, height / 2], [(c.right + width) / 2, height / 2]);
        const bgs = await bgAt(h.page, pts);
        assert.deepEqual(bgs, pts.map(() => C.green700), `الصفحة ليست كلها خضراء --green-700 حول البطاقة: ${JSON.stringify(bgs)} عند ${JSON.stringify(pts)}`);
        // النقش: عنصر شفافيته 7% بصورة svg لا يلتقط اللمس ويغطي الشاشة كلها.
        const pats = await h.page.$$eval(SEL.pattern, (els, [w, hh]) => els.map(e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
            return { full: r.left <= 1 && r.top <= 1 && r.right >= w - 1 && r.bottom >= hh - 1, op: Number(cs.opacity), svg: cs.backgroundImage.includes('svg'), pe: cs.pointerEvents }; }), [width, height]);
        assert.ok(pats.some(p => p.full && Math.abs(p.op - 0.07) < 0.006 && p.svg && p.pe === 'none'), `لا نقش (${SEL.pattern}) 7% svg بلا لمس يغطي الشاشة كلها: ${JSON.stringify(pats)}`);
        // البطاقة.
        assert.equal(c.bg, C.white, 'البطاقة ليست بيضاء');
        assert.deepEqual(c.radius, [16, 16, 16, 16], 'زاوية البطاقة ليست 16');
        const want = Math.min(width - 32, 420);
        assert.ok(Math.abs(c.width - want) <= 1, `عرض البطاقة ${c.width} والمطلوب min(100%−32,420) = ${want}`);
        assert.ok(Math.abs(c.left - (width - c.right)) <= 1, `البطاقة ليست في الوسط: يسار ${c.left} يمين ${width - c.right}`);
        assert.ok(c.top >= height * 0.04 && c.top <= height * 0.14, `أعلى البطاقة ${Math.round(c.top)} ليس بين 4% و14% من الارتفاع ${height}`);
        // الشعار والعنوان والخط الذهبي داخل البطاقة وبهذا الترتيب.
        const brand = await h.page.evaluate(([cardSel, brandSel, goldSel]) => {
            const card = document.querySelector(cardSel);
            const imgs = card ? [...card.querySelectorAll('img')].filter(i => i.getClientRects().length && getComputedStyle(i).visibility !== 'hidden') : [];
            const t = document.querySelector(brandSel), g = document.querySelector(goldSel);
            const r = e => e ? e.getBoundingClientRect() : null;
            return { imgs: imgs.map(i => ({ src: i.getAttribute('src'), w: i.naturalWidth, h: i.getBoundingClientRect().height, bottom: i.getBoundingClientRect().bottom })),
                titleIn: !!card && !!t && card.contains(t), goldIn: !!card && !!g && card.contains(g),
                title: t ? { text: t.innerText.trim(), size: parseFloat(getComputedStyle(t).fontSize), weight: Number(getComputedStyle(t).fontWeight), color: getComputedStyle(t).color, top: r(t).top, bottom: r(t).bottom } : null,
                gold: g ? { bg: getComputedStyle(g).backgroundColor, top: r(g).top, h: r(g).height, shown: g.getClientRects().length > 0 } : null,
                admin: r(document.getElementById('loginRoleAdmin'))?.top ?? null };
        }, [SEL.card, SEL.brand, SEL.gold]);
        assert.equal(brand.imgs.length, 1, `صور ظاهرة داخل البطاقة: ${JSON.stringify(brand.imgs)} (المطلوب الشعار الملوّن وحده)`);
        assert.match(brand.imgs[0].src || '', /assets\/brand\/afdalkom-logo-vertical-color\.png$/, 'الشعار ليس الملوّن من assets/brand');
        assert.ok(brand.imgs[0].w > 0, 'الشعار لم يُحمَّل');
        assert.ok(brand.imgs[0].h >= 168 - 1 && brand.imgs[0].h <= 220 + 1, `ارتفاع الشعار ${brand.imgs[0].h} ليس بين 168 (ق88) و220 (إصلاح v7 ف8)`);
        assert.ok(brand.titleIn, `«برنامج الحوافز» (${SEL.brand}) ليس داخل البطاقة البيضاء`);
        assert.equal(brand.title.text, 'برنامج الحوافز');
        assert.deepEqual([brand.title.size, brand.title.weight >= 900, brand.title.color], [28, true, C.green900], `العنوان: ${JSON.stringify(brand.title)} والمطلوب 28/900 --green-900`);
        assert.ok(brand.goldIn && brand.gold.shown && brand.gold.bg === C.gold600, `الخط الذهبي داخل البطاقة: ${JSON.stringify(brand.gold)}`);
        assert.ok(brand.imgs[0].bottom <= brand.title.top + 1 && brand.title.bottom <= brand.gold.top + 1 && brand.gold.top < brand.admin, 'الترتيب: الشعار ثم العنوان ثم الخط الذهبي ثم الزرّان');
        // الزرّان.
        const a = await box(h.page, '#loginRoleAdmin'), t = await box(h.page, '#loginRoleTeacher');
        assert.ok(a.visible && t.visible, 'الزرّان غير ظاهرين');
        assert.ok(a.height >= 56 && t.height >= 56, `ارتفاع الزرّين ${a.height}/${t.height} < 56`);
        assert.deepEqual([a.bg, a.borderColor, a.borderWidth, a.color], [C.white, C.borderControl, 1, C.ink], `«مشرف» ليس ثانوياً (أبيض، حد 1 --border-control، نص --ink): ${JSON.stringify([a.bg, a.borderColor, a.borderWidth, a.color])}`);
        assert.deepEqual([t.bg, t.color], [C.green700, C.white], `«معلم» ليس أساسياً: ${JSON.stringify([t.bg, t.color])}`);
        assert.ok(a.left >= c.left && a.right <= c.right && t.left >= c.left && t.right <= c.right && a.top >= c.top && t.bottom <= c.bottom, 'الزرّان خارج البطاقة');
        const sh = await h.page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
        assert.ok(sh[0] <= width && sh[1] <= height, `تمرير في شاشة الدخول: ${sh}`);
    } finally { await h.close(); }
    await adminSame();
});

test('ل2 (ق88، 01a، اختيار v7 رقم 4) بعد «معلم»: الزرّان مبدّل (aria-pressed) «معلم» محدّد --green-700، تسمية «رمز الدخول» وحقل #teacherCodeInput ≥ 52، وزر «دخول» ذهبي --gold-600 بنص --ink ≥ 52 تحت الحقل داخل البطاقة؛ و«مشرف» يعكس ويُظهر نموذج البريد', async () => {
    const h = await loginPage();
    try {
        await h.page.locator('#loginRoleTeacher').click();
        await h.page.waitForTimeout(100);
        const c = await box(h.page, SEL.card), a = await box(h.page, '#loginRoleAdmin'), t = await box(h.page, '#loginRoleTeacher');
        const inp = await box(h.page, '#teacherCodeInput'), btn = await box(h.page, '#teacherCodeBtn');
        assert.ok(inp?.visible && btn?.visible, 'الحقل أو الزر غير ظاهر بعد «معلم»');
        assert.ok(a.visible && t.visible, 'الزرّان اختفيا بعد الاختيار (اختيار v7 رقم 4: يبقى المبدّل)');
        assert.deepEqual([t.pressed, a.pressed], ['true', 'false'], `aria-pressed بعد «معلم»: معلم=${t.pressed} مشرف=${a.pressed}`);
        assert.deepEqual([t.bg, t.color], [C.green700, C.white], '«معلم» المحدّد ليس --green-700 بنص أبيض');
        assert.notEqual(a.bg, C.green700, '«مشرف» غير المحدّد أخضر');
        assert.ok(inp.height >= 52, `ارتفاع حقل الرمز ${inp.height} < 52`);
        assert.ok((await h.page.locator('#loginOverlay').innerText()).includes('رمز الدخول'), 'تسمية «رمز الدخول» غائبة');
        assert.equal(btn.text, 'دخول');
        assert.deepEqual([btn.bg, btn.color], [C.gold600, C.ink], `زر «دخول» ليس ذهبياً --gold-600 بنص --ink: ${JSON.stringify([btn.bg, btn.color])}`);
        assert.ok(btn.height >= 52, `ارتفاع «دخول» ${btn.height} < 52`);
        assert.ok(btn.top >= inp.bottom - 1, '«دخول» ليس تحت الحقل');
        for (const [n, b] of [['الحقل', inp], ['«دخول»', btn]]) assert.ok(b.left >= c.left && b.right <= c.right && b.top >= c.top && b.bottom <= c.bottom + 1, `${n} خارج البطاقة البيضاء`);
        const sh = await h.page.evaluate(() => document.documentElement.scrollHeight);
        assert.ok(sh <= 844, `تمرير بعد «معلم»: ${sh}`);
        await h.page.locator('#loginRoleAdmin').click();
        await h.page.waitForTimeout(100);
        assert.deepEqual([(await box(h.page, '#loginRoleAdmin')).pressed, (await box(h.page, '#loginRoleTeacher')).pressed], ['true', 'false'], 'aria-pressed بعد «مشرف»');
        assert.equal(await h.page.locator('#loginForm').isVisible(), true, '#loginForm لم يظهر بعد «مشرف»');
        assert.equal(await h.page.locator('#teacherCodeForm').isVisible(), false, 'حقل الرمز بقي مع «مشرف»');
    } finally { await h.close(); }
    await adminSame();
});

test('ل3 (ق88، 01b) رمز خاطئ (يدوياً وبالرابط) ← «الرمز غير صحيح أو أُبطل؛ اطلب الرابط من المشرف» --red-700 تحت الحقل مباشرة وفوق «دخول» بلا تمرير؛ ثم الرمز الصحيح يدخل؛ ودخول المشرف بالبريد كما كان (خطأ ظاهر ثم دخول)', async () => {
    const where = async (h, label) => {
        await h.page.waitForFunction(msg => document.getElementById('loginError')?.innerText.trim() === msg && document.getElementById('loginError').getClientRects().length, CODE_MSG, { timeout: 6000 })
            .catch(async () => assert.fail(`${label}: الرسالة لم تظهر. ${await diagnose(h)}`));
        const e = await box(h.page, '#loginError'), inp = await box(h.page, '#teacherCodeInput'), btn = await box(h.page, '#teacherCodeBtn');
        assert.ok(inp?.visible && btn?.visible, `${label}: الحقل أو «دخول» غير ظاهر مع الرسالة`);
        assert.equal(e.color, C.red700, `${label}: لون الرسالة ${e.color} ليس --red-700`);
        assert.ok(e.top >= inp.bottom - 1 && e.top - inp.bottom <= 12, `${label}: الرسالة ليست تحت الحقل مباشرة (أعلاها ${Math.round(e.top)}، أسفل الحقل ${Math.round(inp.bottom)})`);
        assert.ok(e.bottom <= btn.top + 1, `${label}: الرسالة ليست فوق «دخول» (أسفلها ${Math.round(e.bottom)}، أعلى الزر ${Math.round(btn.top)})`);
        const sc = await h.page.evaluate(() => { const o = document.getElementById('loginOverlay'); return [document.documentElement.scrollHeight, innerHeight, o.scrollHeight, o.clientHeight]; });
        assert.ok(sc[0] <= sc[1] && sc[2] <= sc[3] + 1, `${label}: تمرير بعد الرسالة ${JSON.stringify(sc)}`);
        assert.ok(btn.bottom <= sc[1], `${label}: «دخول» خارج الشاشة`);
    };
    let h = await loginPage();
    try {
        await h.page.locator('#loginRoleTeacher').click();
        await h.page.locator('#teacherCodeInput').fill('t1.NOPENOPE2345');
        await h.page.locator('#teacherCodeBtn').click();
        await where(h, 'الإدخال اليدوي');
        await h.page.locator('#teacherCodeInput').fill(H.TEACHER_CODE);
        await h.page.locator('#teacherCodeBtn').click();
        await waitFor(h, '#teacherHome', 'الرمز الصحيح بعد الخطأ لم يُدخل', 7000);
    } finally { await h.close(); }
    h = await loginPage({ url: '/?k=t1.WRONGWRONG23' });
    try { await where(h, 'الرابط برمز خطأ'); assert.doesNotMatch(h.page.url(), /[?&]k=/, 'الرمز باقٍ في العنوان'); }
    finally { await h.close(); }
    // المشرف: البريد وكلمة المرور كما كانا.
    h = await loginPage();
    try {
        await h.page.locator('#loginRoleAdmin').click();
        await h.page.locator('#loginEmail').fill('admin@test');
        await h.page.locator('#loginPassword').fill('wrong');
        await h.page.locator('#loginBtn').click();
        await h.page.waitForFunction(() => document.getElementById('loginError')?.innerText.trim() && document.getElementById('loginError').getClientRects().length, null, { timeout: 5000 })
            .catch(async () => assert.fail('المشرف: كلمة مرور خاطئة بلا رسالة ظاهرة. ' + await diagnose(h)));
        await h.page.locator('#loginPassword').fill('pw');
        await h.page.locator('#loginBtn').click();
        await h.page.waitForFunction(() => window.almahraPrograms?.getCurrentProgramId?.() === 'general' && window.almahraData?.isReady?.(), null, { timeout: 8000 })
            .catch(async () => assert.fail('المشرف لم يدخل بالبريد. ' + await diagnose(h)));
        assert.equal(await h.page.evaluate(() => document.body.classList.contains('teacher-mode')), false, 'المشرف في وضع المعلم');
    } finally { await h.close(); }
    await adminSame();
});

// =====================================================================================
// (ب) الرئيسية (ق89، الشاشات 02–02g)
// =====================================================================================
async function stats(page) {
    return page.evaluate(SELS => Object.fromEntries(['total', 'rec', 'left'].map(k => {
        const e = document.querySelector(`#teacherStats [data-stat="${k}"]`);
        if (!e) return [k, null];
        const q = s => e.querySelector(s), vis = x => !!x && x.getClientRects().length > 0 && getComputedStyle(x).visibility !== 'hidden' && getComputedStyle(x).display !== 'none' && x.innerText.trim() !== '';
        const n = q(SELS.statNum), ab = q(SELS.statAb), r = e.getBoundingClientRect(), cs = getComputedStyle(e);
        return [k, { label: (q(SELS.statLabel)?.innerText || '').trim(), num: (n?.innerText || '').trim(), numTop: n ? n.getBoundingClientRect().top : null,
            ab: vis(ab) ? ab.innerText.replace(/\s+/g, ' ').trim() : '', abColor: ab ? getComputedStyle(ab).color : null, hasAb: !!ab,
            rows: cs.gridTemplateRows, bg: cs.backgroundColor, radius: parseFloat(cs.borderTopLeftRadius), top: r.top, left: r.left, width: r.width, height: r.height }];
    })), { statNum: SEL.statNum, statAb: SEL.statAb, statLabel: SEL.statLabel });
}
const nums = st => ['total', 'rec', 'left'].map(k => st[k] ? Number(st[k].num) : null);
async function waitNums(h, want, what) {
    try { await h.page.waitForFunction(([want, sel]) => ['total', 'rec', 'left'].map(k => Number(document.querySelector(`#teacherStats [data-stat="${k}"] ${sel}`)?.innerText.trim())).join() === want.join(), [want, SEL.statNum], { timeout: 5000 }); }
    catch { assert.fail(`${what}: الأرقام ${JSON.stringify(nums(await stats(h.page)))} والمطلوب ${JSON.stringify(want)}. ${await diagnose(h)}`); }
}
async function waitAb(h, want, what) {
    try { await h.page.waitForFunction(([sel, want]) => { const e = document.querySelector(sel); return !!e && e.innerText.replace(/\s+/g, ' ').trim() === want && getComputedStyle(e).visibility !== 'hidden'; }, [`${SEL.stat('left')} ${SEL.statAb}`, want], { timeout: 5000 }); }
    catch { assert.fail(`${what}: «${want}» لم تظهر. ${JSON.stringify(await stats(h.page))}`); }
}
// نافذة الإنجاز بأدوات الهاركنس (أقسام v7): جديد البقرة 6 ← 10 «ممتاز» + مراجعة الفاتحة 1–7 «جيد»، ثم «حفظ».
async function setField(page, id, value) {
    const ok = await page.evaluate(([id, value]) => { const el = document.getElementById(id); if (!el) return false;
        el.value = String(value); ['input', 'change'].forEach(t => el.dispatchEvent(new Event(t, { bubbles: true }))); return true; }, [id, value]);
    assert.ok(ok, `الحقل #${id} غير موجود`);
}
async function grade(page, kind, name) {
    const b = page.locator(`#quick_${kind}_grades button`).filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }).first();
    assert.ok(await b.count(), `زر التقدير «${name}» غير موجود`); await b.click();
}
async function saveFor(h, id) {
    await H.openAch(h, id);
    await H.openSec(h.page, 'new'); await setField(h.page, 'quick_new_toAyah', 10); await grade(h.page, 'new', 'ممتاز'); await H.confirmSec(h.page, 'new');
    await H.openSec(h.page, 'review');
    for (const [f, v] of [['quick_review_fromSurah', 1], ['quick_review_fromAyah', 1], ['quick_review_toSurah', 1], ['quick_review_toAyah', 7]]) await setField(h.page, f, v);
    await grade(h.page, 'review', 'جيد'); await H.confirmSec(h.page, 'review');
    await h.page.locator('#generalQuickSaveBtn').click();
    await h.page.waitForFunction(() => !document.getElementById('smartModal')?.classList.contains('flex'), null, { timeout: 5000 })
        .catch(async () => assert.fail('الحفظ لم يُغلق النافذة. ' + await diagnose(h)));
}
const recordedToday = () => ({ attended: true, hijri: 'وهمي', entries: { e_r3: { kind: 'new', grade: 'good', spec: { from: [2, 6], to: [2, 10] }, rep: 1, points: 3, at: 1, by: H.OTHER_UID, heardBy: 't1' } } });
async function remoteSet(h, id, patch) {
    await h.page.evaluate(([p, patch]) => { const d = window.__fb.get(p); window.__fb.set(p, { ...d, ...patch }); }, [S(id), patch]);
}

test('ر1 (ق89، 02/02b) الرأس --green-700 بزاوية سفلية 24 فيه بالترتيب: اسم المعلم 18/700 أبيض + «!» و«خروج» شفافان بحدّ أبيض ≥ 44؛ مبدّل الحلقتين حبّتان متساويتان (الوقت .tch-when 13/700 مستقل بجانب الاسم بفاصل ~8، المحددة بيضاء بنص --green-900)؛ التاريخ 14/700 --green-100؛ ولا سطر «سُجّل n من m»', async () => {
    const h = await teacherPage();
    try {
        const hd = await box(h.page, SEL.header);
        assert.ok(hd?.visible, `الرأس الأخضر ${SEL.header} غير موجود. ${await diagnose(h)}`);
        assert.equal(hd.bg, C.green700, 'خلفية الرأس ليست --green-700');
        assert.deepEqual(hd.radius, [0, 0, 24, 24], `زوايا الرأس ${JSON.stringify(hd.radius)} والمطلوب سفلية 24 فقط`);
        const inside = await h.page.evaluate(([hs, ids]) => ids.map(s => !!document.querySelector(hs)?.contains(document.querySelector(s))), [SEL.header, [SEL.topBar, SEL.tabs, SEL.date]]);
        assert.deepEqual(inside, [true, true, true], `داخل الرأس [${SEL.topBar}, ${SEL.tabs}, ${SEL.date}]`);
        const tb = await box(h.page, SEL.topBar), tabsB = await box(h.page, SEL.tabs), dt = await box(h.page, SEL.date);
        assert.ok(tb.bottom <= tabsB.top + 1 && tabsB.bottom <= dt.top + 1, 'الترتيب: الاسم والزرّان ثم المبدّل ثم التاريخ');
        // الصف 1
        const nm = await box(h.page, SEL.name);
        assert.deepEqual([nm.text, nm.size, nm.weight, nm.color], ['عبدالله', 18, 700, C.white], `اسم المعلم: ${JSON.stringify([nm.text, nm.size, nm.weight, nm.color])}`);
        for (const [sel, label] of [[SEL.help, '!'], [SEL.logout, 'خروج']]) {
            const b = await box(h.page, sel);
            assert.equal(b.text, label, sel);
            assert.deepEqual([b.bg, b.borderColor, b.borderWidth, b.borderStyle, b.color], [C.clear, C.white, 1, 'solid', C.white], `${sel} ليس شفافاً بحدّ أبيض: ${JSON.stringify([b.bg, b.borderColor, b.borderWidth, b.borderStyle, b.color])}`);
            assert.ok(b.height >= 44 && b.width >= 44, `${sel} أصغر من 44: ${b.width}×${b.height}`);
            assert.ok(Math.abs((b.top + b.bottom) / 2 - (nm.top + nm.bottom) / 2) <= 4, `${sel} ليس في صف الاسم`);
        }
        // الصف 2: المبدّل
        const pills = await h.page.$$eval(SEL.tab, (els, whenSel) => els.map(b => {
            const r = b.getBoundingClientRect(), cs = getComputedStyle(b), w = b.querySelector(whenSel);
            const nameLeaf = [...b.querySelectorAll('*')].find(e => e.children.length === 0 && e.textContent.trim().startsWith('حلقة') && !(w && w.contains(e)));
            const wr = w?.getBoundingClientRect(), nr = nameLeaf?.getBoundingClientRect();
            return { id: b.dataset.halaqa, pressed: b.getAttribute('aria-pressed'), w: r.width, h: r.height, top: r.top, bg: cs.backgroundColor, color: cs.color, radius: parseFloat(cs.borderTopLeftRadius),
                when: w ? { text: w.textContent.trim(), size: parseFloat(getComputedStyle(w).fontSize), weight: Number(getComputedStyle(w).fontWeight) } : null,
                name: nameLeaf ? nameLeaf.textContent.trim() : null,
                gap: wr && nr ? Math.max(wr.left - nr.right, nr.left - wr.right) : null, dy: wr && nr ? Math.abs((wr.top + wr.bottom) / 2 - (nr.top + nr.bottom) / 2) : null,
                fits: b.scrollWidth <= b.clientWidth + 1 };
        }), SEL.when);
        assert.equal(pills.length, 2, `حبّات المبدّل: ${JSON.stringify(pills)}`);
        assert.deepEqual(pills.map(p => [p.id, p.name, p.when?.text]), [['a1', 'حلقة أُبيّ', 'العصر'], ['m1', 'حلقة ابن مسعود', 'المغرب']], `الحبّتان: الاسم والوقت (${SEL.when}) بترتيب periodOf`);
        assert.ok(Math.abs(pills[0].w - pills[1].w) <= 1 && Math.abs(pills[0].top - pills[1].top) <= 1, `الحبّتان غير متساويتين أو ليستا في صف واحد: ${JSON.stringify(pills.map(p => [p.w, p.top]))}`);
        for (const p of pills) {
            assert.ok(p.h >= 44 && p.radius >= 20 && p.fits, `حبّة ${p.id}: الارتفاع ${p.h}، الزاوية ${p.radius}، المحتوى يتسع ${p.fits}`);
            assert.deepEqual([p.when.size, p.when.weight], [13, 700], `وقت ${p.id} ليس 13/700`);
            assert.ok(p.dy <= 4 && p.gap >= 6 && p.gap <= 10, `وقت ${p.id} ليس بجانب الاسم بفاصل ~8: الفاصل ${p.gap} والفرق الرأسي ${p.dy}`);
        }
        assert.deepEqual([pills[0].pressed, pills[0].bg, pills[0].color], ['true', C.white, C.green900], 'الحبّة المحددة ليست بيضاء بنص --green-900');
        assert.deepEqual([pills[1].pressed, pills[1].bg, pills[1].color], ['false', C.clear, C.white], 'الحبّة غير المحددة ليست شفافة بنص أبيض');
        // الصف 3: التاريخ
        const day = await h.page.evaluate(t => new Intl.DateTimeFormat('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh', weekday: 'long' }).format(new Date(t + 'T12:00:00Z')), TODAY);
        assert.equal(dt.text, `${day} ${TODAY}`, 'سطر التاريخ');
        assert.deepEqual([dt.size, dt.weight, dt.color], [14, 700, C.green100], `التاريخ ليس 14/700 --green-100: ${JSON.stringify([dt.size, dt.weight, dt.color])}`);
        assert.doesNotMatch(await h.page.locator('#teacherHome').innerText(), /سُجّل\s*\d+\s*من\s*\d+/, 'سطر «سُجّل n من m» القديم باقٍ (حلّت محله البطاقات الثلاث)');
        // التبديل يحدّد الأخرى بيضاء.
        await h.page.locator(SEL.tab).nth(1).click();
        await h.page.waitForTimeout(150);
        const after2 = await h.page.$$eval(SEL.tab, els => els.map(b => [b.getAttribute('aria-pressed'), getComputedStyle(b).backgroundColor]));
        assert.deepEqual(after2, [['false', C.clear], ['true', C.white]], 'بعد اختيار المغرب');
        assert.deepEqual(await cardIds(h.page), [6, 7]);
    } finally { await h.close(); }
    await adminSame();
});

test('ر2 (ق89، ق109-1، 02/02c) ثلاث بطاقات أرقام بيضاء تتداخل مع الرأس (−28) بشبكة 17/29/17: «الطلاب 5» «سُجّل 1» «متبقٍ 4» + «منهم غائب 1» أحمر؛ تتبع الحلقة المختارة وتُحدَّث مع الحفظ و«تراجع» والغياب وإلغائه ولقطات الخادم، ولا تتأثر بالبحث', async () => {
    const h = await teacherPage();
    try {
        await waitFor(h, SEL.stats, 'بطاقات الأرقام (ق89)', 3000);
        let st = await stats(h.page);
        assert.deepEqual(['total', 'rec', 'left'].map(k => bare(st[k]?.label)), ['الطلاب', 'سجل', 'متبق'], `التسميات: ${JSON.stringify(st)}`);
        assert.deepEqual(nums(st), [5, 1, 4], 'أرقام حلقة أُبيّ: الطلاب/سُجّل/متبقٍ');
        assert.deepEqual([st.total.ab, st.rec.ab, st.left.ab], ['', '', 'منهم غائب 1'], 'سطر الغياب في «متبقٍ» وحدها');
        assert.equal(st.left.abColor, C.red700, '«منهم غائب» ليست --red-700');
        for (const k of ['total', 'rec', 'left']) {
            assert.equal(st[k].rows, '17px 29px 17px', `${k}: الشبكة ${st[k].rows}`);
            assert.ok(st[k].hasAb, `${k}: الصف الثالث المحجوز ${SEL.statAb} غائب`);
            assert.deepEqual([st[k].bg, st[k].radius], [C.white, 16], `${k}: ليست بيضاء بزاوية 16`);
            assert.match(st[k].num, /^[0-9]+$/, `${k}: الرقم ${st[k].num}`);
        }
        assert.ok(Math.abs(st.total.numTop - st.rec.numTop) <= 1 && Math.abs(st.rec.numTop - st.left.numTop) <= 1, 'الأرقام الثلاثة ليست على سطر واحد');
        assert.ok(Math.abs(st.total.width - st.left.width) <= 1 && Math.abs(st.total.top - st.left.top) <= 1 && Math.abs(st.total.height - st.left.height) <= 1, 'البطاقات غير متساوية');
        const hd = await box(h.page, SEL.header);
        assert.ok(hd?.visible, `الرأس ${SEL.header} غير موجود`);
        assert.ok(Math.abs((hd.bottom - st.total.top) - 28) <= 4, `التداخل مع الرأس ${Math.round(hd.bottom - st.total.top)} والمطلوب ~28`);
        // الحفظ ← سُجّل 2؛ التراجع ← يعود.
        await saveFor(h, 1);
        await waitNums(h, [5, 2, 3], 'بعد حفظ أحمد');
        // ب14 (ق205): كان زر التراجع في الشريط؛ صار الحفظ يعرض رسالة بلا أزرار.
        assert.equal(await h.page.locator('#teacherToast button').count(), 0, 'رسالة الحفظ فيها زر');
        // ب14 (ق205): كان التراجع من الشريط؛ صار من صندوق «سُجّل اليوم».
        await H.openAch(h, 1);
        await h.page.locator('#quickTodayBox button').filter({ hasText: 'تراجع' }).first().click();
        // «تراجع» يحذف تسجيلاً واحداً (ق43) ويبقى لأحمد تسجيل اليوم الآخر فيبقى «سُجّل»؛ وحذف ما بقي (لقطة الخادم) يعيده إلى المتبقي.
        await h.page.waitForTimeout(400);
        assert.deepEqual(nums(await stats(h.page)), [5, 2, 3], 'بعد «تراجع» (حُذف تسجيل واحد وبقي آخر)');
        await H.closeAch(h.page);
        await remoteSet(h, 1, { history: {} });
        await waitNums(h, [5, 1, 4], 'بعد حذف تسجيل أحمد كله');
        // لقطة من جهاز آخر (المستمع القائم).
        await remoteSet(h, 5, { history: { [TODAY]: recordedToday() } });
        await waitNums(h, [5, 2, 3], 'بعد تسجيل فهد من جهاز آخر');
        // البحث لا يغيّر الأرقام.
        await h.page.locator(SEL.search).fill('حم');
        await h.page.waitForTimeout(200);
        assert.deepEqual(nums(await stats(h.page)), [5, 2, 3], 'الأرقام تغيّرت بالبحث');
        await h.page.locator(SEL.search).fill('');
        await h.page.waitForTimeout(150);
        // الغياب ← «منهم غائب 2»؛ إلغاؤه ← 1.
        await card(h.page, 1).locator('[data-a=absent]').click();
        await h.page.locator('#teacherAbsenceSheet button').filter({ hasText: /^\s*بغير عذر\s*$/ }).click();
        await waitAb(h, 'منهم غائب 2', 'بعد غياب أحمد');
        assert.deepEqual(nums(await stats(h.page)), [5, 2, 3], 'بعد غياب أحمد (الغائب من المتبقي)');
        await card(h.page, 1).locator('[data-a=absent]').click();   // «إلغاء الغياب»
        await waitAb(h, 'منهم غائب 1', 'بعد إلغاء الغياب');
        assert.deepEqual(nums(await stats(h.page)), [5, 2, 3], 'بعد إلغاء الغياب');
        // الحلقة الأخرى.
        await h.page.locator(SEL.tab).nth(1).click();
        await waitNums(h, [2, 0, 2], 'حلقة ابن مسعود');
        st = await stats(h.page);
        assert.equal(st.left.ab, '', '«منهم غائب» ظاهرة بلا غائب');
        assert.equal(st.left.rows, '17px 29px 17px', 'الصف الثالث لم يبقَ محجوزاً بلا غائب');
        assert.ok(Math.abs(st.total.numTop - st.left.numTop) <= 1, 'الأرقام انزاحت بلا سطر الغياب');
    } finally { await h.close(); }
    await adminSame();
});

test('ر3 (ق89، ق109-2، اختيارا v7 رقم 9 و26، 02f) البحث: #teacherSearch نوعه text بارتفاع 48 و«ابحث باسم الطالب» وأيقونة svg؛ يطابق أي جزء بعد حذف التشكيل وتوحيد الهمزات؛ يبقى مع لقطة الخادم؛ بلا نتيجة «لا طالب بهذا الوصف» و«+ طالب جديد» باقٍ', async () => {
    const h = await teacherPage({ mods: { 5: { name: 'فَهْد' } } });
    try {
        const s = await box(h.page, SEL.search);
        assert.ok(s?.visible, `حقل البحث ${SEL.search} غير موجود. ${await diagnose(h)}`);
        assert.deepEqual([s.type, s.placeholder, s.height], ['text', 'ابحث باسم الطالب', 48], `الحقل: ${JSON.stringify([s.type, s.placeholder, s.height])}`);
        assert.ok(await h.page.evaluate(sel => { const i = document.querySelector(sel), svg = i?.parentElement?.querySelector('svg'); return !!svg && svg.getClientRects().length > 0; }, SEL.search), 'لا أيقونة svg ظاهرة بجانب حقل البحث');
        const stb = await box(h.page, SEL.stats);
        assert.ok(stb?.visible && s.top >= stb.bottom - 1, 'البحث ليس تحت بطاقات الأرقام');
        const search = async (q, want, what) => {
            await h.page.locator(SEL.search).fill(q);
            await h.page.waitForTimeout(150);
            assert.deepEqual(await cardIds(h.page), want, `${what} («${q}»)`);
        };
        await search('حم', [1], 'جزء من الوسط');
        await search('مد', [1], 'آخر الاسم');
        await search('سع', [4], 'أول الاسم');
        await search('احمد', [1], 'بلا همزة يطابق «أحمد»');
        await search('أَحْمد', [1], 'المكتوب بتشكيل');
        await search('فهد', [5], 'الاسم المشكول «فَهْد» بلا تشكيل');
        // لقطة الخادم (طالب آخر عُدّل) لا تمسح البحث ولا ترشيحه.
        await search('حم', [1], 'قبل اللقطة');
        await remoteSet(h, 2, { name: 'بدر ب' });
        await h.page.waitForTimeout(400);
        assert.equal(await h.page.locator(SEL.search).inputValue(), 'حم', 'لقطة الخادم مسحت البحث');
        assert.deepEqual(await cardIds(h.page), [1], 'لقطة الخادم ألغت ترشيح البحث');
        // بلا نتيجة.
        await search('زززز', [], 'بلا نتيجة');
        assert.ok(norm(await h.page.locator(SEL.list).innerText()).includes(EMPTY_MSG), `لا «${EMPTY_MSG}» في القائمة`);
        assert.equal(await visible(h.page, SEL.add), true, '«+ طالب جديد» اختفى مع البحث بلا نتيجة');
        await search('', [1, 4, 5, 2, 3], 'مسح البحث');
        assert.ok(!norm(await h.page.locator(SEL.list).innerText()).includes(EMPTY_MSG), `«${EMPTY_MSG}» باقية بعد المسح`);
    } finally { await h.close(); }
    await adminSame();
});

test('ر4 (ق89، ق109-3، 02g) المرشّحات الكل / لم يُسجَّل / سُجّل / غائب (المحدد --green-700 بنص أبيض، «الكل» افتراضياً) ترشّح بحسب حال اليوم والمتوقف بحسب حاله؛ تجتمع مع البحث؛ بلا نتيجة رسالة و«+ طالب جديد» باقٍ؛ والممنوعات (و4) غائبة', async () => {
    const h = await teacherPage({ mods: { 4: { newPaused: [{ reason: 'exam', from: '2026-11-18', to: null }] } } });
    try {
        await waitFor(h, SEL.filters, 'المرشّحات (ق89)', 3000);
        const chips = await h.page.$$eval('#teacherFilters [data-filter]', els => els.map(e => [e.dataset.filter, e.innerText.trim(), e.getAttribute('aria-pressed')]));
        assert.deepEqual(chips.map(c => [c[0], c[1].replace(/[\u064B-\u0652]/g, '')]), [['all', 'الكل'], ['none', 'لم يسجل'], ['rec', 'سجل'], ['abs', 'غائب']], `المرشّحات: ${JSON.stringify(chips)}`);
        assert.deepEqual(chips.map(c => c[2]), ['true', 'false', 'false', 'false'], '«الكل» ليس المحدد افتراضياً');
        const sb = await box(h.page, SEL.search), fb = await box(h.page, SEL.filters);
        assert.ok(sb?.visible && fb.top >= sb.bottom - 1, 'المرشّحات ليست تحت البحث');
        const pick = async (k, want, what) => {
            await h.page.locator(SEL.filter(k)).click();
            await h.page.waitForTimeout(150);
            assert.deepEqual(await cardIds(h.page), want, what);
            const st = await h.page.$$eval('#teacherFilters [data-filter]', els => els.map(e => [e.dataset.filter, e.getAttribute('aria-pressed'), getComputedStyle(e).backgroundColor, getComputedStyle(e).color, e.getBoundingClientRect().height]));
            for (const [f, p, bg, color, height] of st) {
                assert.ok(height >= 44, `مرشّح ${f} أقل من 44`);
                if (f === k) assert.deepEqual([p, bg, color], ['true', C.green700, C.white], `المرشّح المحدد ${f} ليس --green-700 بنص أبيض`);
                else assert.ok(p === 'false' && bg !== C.green700, `المرشّح ${f} يبدو محدداً`);
            }
        };
        await pick('none', [1, 4, 5], '«لم يُسجَّل» (ومنهم المتوقف سعد)');
        await pick('rec', [2], '«سُجّل»');
        await pick('abs', [3], '«غائب»');
        await pick('all', [1, 4, 5, 2, 3], '«الكل» بالترتيب القائم');
        await h.page.locator(SEL.filter('none')).click();
        await h.page.locator(SEL.search).fill('فهد');
        await h.page.waitForTimeout(150);
        assert.deepEqual(await cardIds(h.page), [5], '«لم يُسجَّل» + البحث «فهد»');
        await h.page.locator(SEL.filter('rec')).click();
        await h.page.waitForTimeout(150);
        assert.deepEqual(await cardIds(h.page), [], '«سُجّل» + «فهد» بلا نتيجة');
        assert.ok(norm(await h.page.locator(SEL.list).innerText()).includes(EMPTY_MSG), `لا «${EMPTY_MSG}» بمرشّح بلا نتيجة`);
        assert.equal(await visible(h.page, SEL.add), true, '«+ طالب جديد» اختفى');
        // حال اليوم يتبع اللقطة: تسجيل فهد من جهاز آخر يُدخله «سُجّل».
        await remoteSet(h, 5, { history: { [TODAY]: recordedToday() } });
        await h.page.waitForTimeout(400);
        assert.deepEqual(await cardIds(h.page), [5], '«سُجّل» + «فهد» بعد تسجيله من جهاز آخر');
        const forbidden = await h.page.evaluate(list => list.filter(s => document.querySelector(s) !== null), ['nav', '.nav-btn', '#page-home', '#page-settings', '#page-records', '#generalTvButton', '#generalSettingsTv',
            '#settingsGeneralKnightsCard', '#setPanelGeneralKnights', '#setPanelKnights', '#generalMissedDayBtn', '#quick_position_fix', '#quick_review_fix', '.qe-fix']);
        assert.deepEqual(forbidden, [], 'عناصر ممنوعة في DOM المعلم (و4)');
        assert.deepEqual(h.errors, [], 'أخطاء صفحة');
    } finally { await h.close(); }
    await adminSame();
});

test('ر5 (ق89، ق109-2، اختيار v7 رقم 7) تبديل الحلقة يمسح البحث ويعيد «الكل»، والقائمة والأرقام للحلقة الجديدة؛ والعودة كذلك', async () => {
    const h = await teacherPage();
    try {
        await waitFor(h, SEL.search, 'حقل البحث', 3000);
        await h.page.locator(SEL.search).fill('ب');
        await h.page.locator(SEL.filter('rec')).click();
        await h.page.waitForTimeout(150);
        assert.deepEqual(await cardIds(h.page), [2], 'قبل التبديل: «ب» + «سُجّل»');
        const state = async () => ({ q: await h.page.locator(SEL.search).inputValue(),
            pressed: await h.page.$$eval('#teacherFilters [data-filter]', els => els.filter(e => e.getAttribute('aria-pressed') === 'true').map(e => e.dataset.filter)), ids: await cardIds(h.page) });
        await h.page.locator(SEL.tab).nth(1).click();
        await h.page.waitForTimeout(200);
        assert.deepEqual(await state(), { q: '', pressed: ['all'], ids: [6, 7] }, 'بعد التبديل إلى المغرب');
        await waitNums(h, [2, 0, 2], 'أرقام المغرب');
        await h.page.locator(SEL.search).fill('عمر');
        await h.page.locator(SEL.filter('none')).click();
        await h.page.waitForTimeout(150);
        assert.deepEqual(await cardIds(h.page), [6], 'المغرب: «عمر» + «لم يُسجَّل»');
        await h.page.locator(SEL.tab).nth(0).click();
        await h.page.waitForTimeout(200);
        assert.deepEqual(await state(), { q: '', pressed: ['all'], ids: [1, 4, 5, 2, 3] }, 'بعد العودة إلى العصر');
        await waitNums(h, [5, 1, 4], 'أرقام العصر');
    } finally { await h.close(); }
    await adminSame();
});

test('ر6 (ق89، ق109-4، اختيار v7 رقم 6، 02d) العطلة وخارج الموسم: الرأس بالتاريخ وحده بلا عدّادات ولا بحث ولا مرشّحات، وصندوق «اليوم عطلة؛ لا تسجيل» تحت الرأس بلا تداخل، ولا بطاقات', async () => {
    for (const [label, seed] of [['عطلة', { holiday: true }], ['خارج الموسم', { outOfSeason: true }]]) {
        const h = await teacherPage({ seed });
        try {
            const hd = await box(h.page, SEL.header), dt = await box(h.page, SEL.date);
            assert.ok(hd?.visible, `${label}: الرأس ${SEL.header} غير موجود`);
            assert.ok(dt?.visible && dt.text.endsWith(TODAY) && !/سُجّل|غائب|متبق/.test(dt.text), `${label}: سطر التاريخ ${JSON.stringify(dt?.text)}`);
            for (const sel of [SEL.stats, SEL.search, SEL.filters]) assert.equal(await visible(h.page, sel), false, `${label}: ${sel} ظاهر يوم العطلة`);
            assert.doesNotMatch(await h.page.locator('#teacherHome').innerText(), /سُجّل\s*\d|منهم غائب|متبقٍ/, `${label}: عدّاد ظاهر`);
            const hol = await box(h.page, SEL.holiday);
            assert.ok(hol?.visible && hol.text.includes('اليوم عطلة؛ لا تسجيل'), `${label}: صندوق العطلة ${JSON.stringify(hol?.text)}`);
            assert.ok(hol.top >= hd.bottom, `${label}: الصندوق يتداخل مع الرأس (أعلاه ${hol.top}، أسفل الرأس ${hd.bottom})`);
            assert.equal(await h.page.locator('.teacher-card').count(), 0, `${label}: بطاقات ظاهرة`);
        } finally { await h.close(); }
    }
    await adminSame();
});

test('ر7 (ق89، 02e) لا اتصال: الشريط #teacherOffline أول الصفحة فوق الرأس الأخضر بخلفية --amber-50 ونص --amber-800 وبنصّه القائم، ويختفي عند العودة', async () => {
    const h = await teacherPage();
    try {
        await h.context.setOffline(true);
        await h.page.evaluate(() => window.dispatchEvent(new Event('offline')));
        await h.page.locator(SEL.offline).waitFor({ state: 'visible', timeout: 3000 }).catch(() => assert.fail('#teacherOffline لم يظهر'));
        const o = await box(h.page, SEL.offline), home = await box(h.page, '#teacherHome'), hd = await box(h.page, SEL.header);
        assert.equal(o.text, 'لا اتصال بالإنترنت؛ لن يُحفظ شيء حتى يعود');
        assert.ok(hd?.visible, `الرأس ${SEL.header} غير موجود`);
        assert.ok(Math.abs(o.top - home.top) <= 1 && o.bottom <= hd.top + 1, `الشريط ليس أول الصفحة فوق الرأس: ${o.top}/${o.bottom}، الرأس ${hd.top}`);
        assert.deepEqual([o.bg, o.color], [C.amber50, C.amber800], `ألوان الشريط ${JSON.stringify([o.bg, o.color])} والمطلوب --amber-50/--amber-800`);
        await h.context.setOffline(false);
        await h.page.evaluate(() => window.dispatchEvent(new Event('online')));
        await h.page.waitForTimeout(200);
        assert.equal(await visible(h.page, SEL.offline), false, 'الشريط باقٍ بعد العودة');
    } finally { await h.close(); }
    await adminSame();
});

test('ر8 (ق90/ق111، 09-help؛ تحقق: بُنيت في الجولة 2) «!» يفتح ورقة .tch-sheet «كيف تسجّل إنجاز اليوم» بست خطوات بنص v7 حرفاً (والسادسة بأيقونتي svg)، و«فهمت» تغلقها', async () => {
    const STEPS = [
        'اختر الحلقة من الزرّين في الرأس الأخضر أعلى الصفحة.',
        'اضغط «الإنجاز» على بطاقة الطالب.',
        'أدخل الجديد ثم «تأكيد»، ثم المراجعة ثم «تأكيد»، ثم السلوك ثم «تأكيد»، ثم «حفظ». تُغلق النافذة وتعود القائمة.',
        // ب14-ف1 (ق205): كان «أخطأت بعد الحفظ؟ اضغط «تراجع» في الرسالة أسفل الشاشة.» صار «أخطأت بعد الحفظ؟ افتح نافذة الطالب واضغط «تراجع» في «سُجّل اليوم».»
        'أخطأت بعد الحفظ؟ افتح نافذة الطالب واضغط «تراجع» في «سُجّل اليوم».',
        'الغائب: زر «غائب» ثم «بعذر» أو «بغير عذر». أخطأت؟ «إلغاء الغياب» على بطاقته.',
        'زر لتعديل بيانات الطالب، وزر لحذفه. الأيام الفائتة يسجّلها المشرف.'
    ];
    const h = await teacherPage();
    try {
        await h.page.locator(SEL.help).click();
        await h.page.locator('#teacherHelpSheet').waitFor({ state: 'visible', timeout: 3000 }).catch(() => assert.fail('ورقة المساعدة لم تظهر'));
        const r = await h.page.evaluate(() => {
            const s = document.getElementById('teacherHelpSheet');
            return { sheet: s.classList.contains('tch-sheet'), title: s.querySelector('h2')?.innerText.trim(),
                steps: [...s.querySelectorAll('ol > li')].map(li => ({ text: li.innerText.replace(/\s+/g, ' ').trim(), svg: li.querySelectorAll('svg').length })) };
        });
        assert.equal(r.sheet, true, 'المساعدة ليست ورقة .tch-sheet');
        assert.equal(r.title, 'كيف تسجّل إنجاز اليوم');
        assert.deepEqual(r.steps.map(s => s.text.replace(/^\d+\s*/, '')), STEPS, 'نص الخطوات الست');
        assert.deepEqual(r.steps.map(s => [s.text.match(/^\d+/)?.[0], s.svg]), STEPS.map((_, i) => [String(i + 1), i === 5 ? 2 : 0]), 'الأرقام 1–6 والأيقونتان في السادسة');
        await h.page.locator('#teacherHelpSheet button').filter({ hasText: /^\s*فهمت\s*$/ }).click();
        await h.page.waitForTimeout(150);
        assert.equal(await visible(h.page, '#teacherHelpSheet'), false, '«فهمت» لم تغلق الورقة');
    } finally { await h.close(); }
    await adminSame();
});

test('ر9 (ق89، DESIGN.md §7، 11-home-1280) على 1280: الصفحة عمود 580 في الوسط، والرأس والبطاقات والبحث والقائمة داخله', async () => {
    const h = await teacherPage({ width: 1280, height: 900 });
    try {
        const home = await box(h.page, '#teacherHome');
        assert.ok(Math.abs(home.width - 580) <= 1, `عرض العمود ${home.width} والمطلوب 580`);
        assert.ok(Math.abs(home.left - (1280 - 580) / 2) <= 1, `العمود ليس في الوسط: يسار ${home.left}`);
        for (const sel of [SEL.header, SEL.stats, SEL.search, SEL.list]) {
            const b = await box(h.page, sel);
            assert.ok(b?.visible, `${sel} غير موجود على 1280`);
            assert.ok(b.left >= home.left - 1 && b.right <= home.right + 1, `${sel} خارج العمود: ${b.left}–${b.right}`);
        }
        const sw = await h.page.evaluate(() => document.documentElement.scrollWidth);
        assert.ok(sw <= 1280, `تمرير أفقي ${sw}`);
    } finally { await h.close(); }
    await adminSame();
});

// =====================================================================================
// أ20 (حكم المراجع ج8 ف1، 2026-11-19): حرّاس لأربعة قرارات صريحة نجت طفراتها (M13، M7، M8، M9). إضافة فقط.
// =====================================================================================
// طالب له اليوم مُدخل غير الجديد والمراجعة فقط (كما قد يسجّله المشرف: kind 'exam').
const OTHER_ONLY = () => ({ history: { [TODAY]: { attended: true, hijri: 'وهمي', entries: { e_exam: { kind: 'exam', grade: 'good', points: 5, at: 1, by: 'admin-uid', heardBy: 't1' } } } } });

test('ر14 (ق109-1/ق118-4، أ20) العدّاد «سُجّل» يعدّ من له اليوم تسجيل جديد أو مراجعة فقط: فهد بمُدخل «اختبار» وحده لا يُعدّ، و«متبقٍ» يعدّه', async () => {
    const h = await teacherPage({ mods: { 5: OTHER_ONLY() } });
    try {
        await waitFor(h, SEL.stats, 'بطاقات الأرقام', 3000);
        await waitNums(h, [5, 1, 4], 'فهد بمُدخل غير الجديد والمراجعة');
        assert.equal((await stats(h.page)).left.ab, 'منهم غائب 1', 'سطر الغياب');
        // يصير «سُجّل» حين يُضاف له مُدخل جديد (لقطة الخادم).
        await remoteSet(h, 5, { history: { [TODAY]: { ...OTHER_ONLY().history[TODAY], entries: { ...OTHER_ONLY().history[TODAY].entries, ...recordedToday().entries } } } });
        await waitNums(h, [5, 2, 3], 'بعد إضافة مُدخل جديد لفهد');
    } finally { await h.close(); }
    await adminSame();
});

test('ر15 (ق118-4، أ20) المرشّح «سُجّل» والشارة على التعريف نفسه: فهد بمُدخل «اختبار» وحده تحت «لم يُسجَّل» لا «سُجّل»، وشارته «لم يُسجَّل» وبطاقته بلا recorded', async () => {
    const h = await teacherPage({ mods: { 5: OTHER_ONLY() } });
    try {
        await waitFor(h, SEL.filters, 'المرشّحات', 3000);
        const c5 = await card(h.page, 5).evaluate(e => ({ badge: e.querySelector('.tch-badge')?.innerText.trim(), recorded: e.classList.contains('recorded') }));
        assert.deepEqual(c5, { badge: 'لم يُسجَّل', recorded: false }, 'شارة فهد وصنف بطاقته');
        await h.page.locator(SEL.filter('rec')).click();
        await h.page.waitForTimeout(150);
        assert.deepEqual(await cardIds(h.page), [2], '«سُجّل»: فهد ظهر بمُدخل غير الجديد والمراجعة');
        await h.page.locator(SEL.filter('none')).click();
        await h.page.waitForTimeout(150);
        assert.ok((await cardIds(h.page)).includes(5), `«لم يُسجَّل» بلا فهد: ${JSON.stringify(await cardIds(h.page))}`);
    } finally { await h.close(); }
    await adminSame();
});

test('ر16 (ق116 س4، أ20) العطلة وخارج الموسم: «+ طالب جديد» ظاهر، مع إخفاء العدّادات والبحث والمرشّحات', async () => {
    for (const [label, seed] of [['عطلة', { holiday: true }], ['خارج الموسم', { outOfSeason: true }]]) {
        const h = await teacherPage({ seed });
        try {
            await waitFor(h, SEL.holiday, `${label}: صندوق العطلة`, 3000);
            assert.equal(await visible(h.page, SEL.add), true, `${label}: «+ طالب جديد» مخفي`);
            for (const sel of [SEL.stats, SEL.search, SEL.filters]) assert.equal(await visible(h.page, sel), false, `${label}: ${sel} ظاهر`);
        } finally { await h.close(); }
    }
    await adminSame();
});

test('ر17 (ق116 س5، أ20) صندوق العطلة فيه السطر الثاني «الأيام الفائتة يسجّلها المشرف»', async () => {
    for (const [label, seed] of [['عطلة', { holiday: true }], ['خارج الموسم', { outOfSeason: true }]]) {
        const h = await teacherPage({ seed });
        try {
            const hol = await box(h.page, SEL.holiday);
            assert.ok(hol?.visible && hol.text.includes('اليوم عطلة؛ لا تسجيل'), `${label}: صندوق العطلة ${JSON.stringify(hol?.text)}`);
            assert.ok(hol.text.includes('الأيام الفائتة يسجّلها المشرف'), `${label}: السطر الثاني غائب: ${JSON.stringify(hol.text)}`);
        } finally { await h.close(); }
    }
    await adminSame();
});

// =====================================================================================
// أ21 (د7 م3، ق123، القائمة 75–77، النموذج 07/07b/07c/07d): التأكيد الأول للحذف ورقة مصمّمة لا confirm() المتصفح. إضافة فقط.
// =====================================================================================
test('ر18 (ق123 م3، 07b/07c/07d) ⋯ ← «حذف الطالب» ← ورقة .tch-sheet «حذف فهد من حلقة أُبيّ؟ سيُمحى سجله ونقاطه» بـ«متابعة» أحمر و«إلغاء» نصي، بلا window.confirm؛ «إلغاء» بلا أثر؛ «متابعة» ← ورقة الاسم و«حذف نهائي» رمادي حتى يطابق الاسم ثم أحمر ويحذف', async () => {
    const ASK = 'حذف فهد من حلقة أُبيّ؟ سيُمحى سجله ونقاطه';
    const h = await teacherPage();
    try {
        await h.page.evaluate(() => { window.__confirms = []; const c = window.confirm; window.confirm = function (m) { window.__confirms.push(String(m)); return c.apply(window, arguments); }; });
        const confirms = async () => [...await h.page.evaluate(() => window.__confirms), ...h.dialogs.map(d => d.message)];
        // يعيد الورقة الظاهرة التي تحوي نص التأكيد الأول: نصها وأزرارها بألوانها.
        const askSheet = () => h.page.evaluate(ask => {
            const strip = t => t.replace(/\s+/g, ' ').replace(/[.。]\s*$/, '').trim();
            const s = [...document.querySelectorAll('.tch-sheet')].find(e => e.getClientRects().length && strip(e.innerText).includes(ask));
            if (!s) return null;
            const btn = t => { const b = [...s.querySelectorAll('button')].find(x => x.getClientRects().length && x.innerText.trim() === t); if (!b) return null;
                const cs = getComputedStyle(b); return { bg: cs.backgroundColor, color: cs.color, borderWidth: parseFloat(cs.borderTopWidth), h: b.getBoundingClientRect().height }; };
            return { id: s.id, text: strip(s.innerText), go: btn('متابعة') || btn('حذف'), cancel: btn('إلغاء') };
        }, ASK);
        const openAsk = async () => {
            await card(h.page, 5).locator('[data-a=more]').click();
            await h.page.locator('#teacherMoreSheet').waitFor({ state: 'visible', timeout: 3000 }).catch(() => assert.fail('#teacherMoreSheet لم يظهر'));
            await h.page.locator('#teacherMoreSheet button').filter({ hasText: /^\s*حذف الطالب\s*$/ }).click();
            await h.page.waitForTimeout(250);
        };
        // (1) لا confirm، والورقة المصمّمة بنصّها وزرّيها.
        await openAsk();
        assert.deepEqual(await confirms(), [], 'التأكيد الأول ما زال window.confirm من المتصفح (م3)');
        const a = await askSheet();
        assert.ok(a, `لا ورقة .tch-sheet ظاهرة نصها «${ASK}»`);
        assert.ok(a.go && a.cancel, `زرّا «متابعة» و«إلغاء»: ${JSON.stringify(a)}`);
        assert.ok(a.go.color === C.red700 || a.go.bg === C.red700, `«متابعة» ليس خطراً (--red-700): ${JSON.stringify(a.go)}`);
        assert.ok(a.go.h >= 44 && a.cancel.h >= 44, 'زر أقل من 44');
        assert.deepEqual([a.cancel.bg, a.cancel.borderWidth], [C.clear, 0], `«إلغاء» ليس نصياً: ${JSON.stringify(a.cancel)}`);
        // (2) «إلغاء» بلا أثر.
        const writes0 = (await h.fbLog()).filter(l => l.writes).length;
        await h.page.locator(`#${a.id} button`).filter({ hasText: /^\s*إلغاء\s*$/ }).click();
        await h.page.waitForTimeout(250);
        assert.equal(await askSheet(), null, '«إلغاء» لم يغلق الورقة');
        assert.equal(await visible(h.page, '#tsDeleteName'), false, '«إلغاء» فتح ورقة الاسم');
        assert.equal((await h.fbLog()).filter(l => l.writes).length, writes0, '«إلغاء» كتب شيئاً');
        assert.ok(await h.doc(S(5)), 'فهد حُذف بعد «إلغاء»');
        // (3) «متابعة» ← ورقة الاسم القائمة؛ «حذف نهائي» رمادي حتى يطابق ثم أحمر.
        await openAsk();
        const b = await askSheet();
        assert.ok(b, 'الورقة لم تظهر في الفتح الثاني');
        await h.page.locator(`#${b.id} button`).filter({ hasText: /^\s*(حذف|متابعة)\s*$/ }).click();
        await h.page.locator('#tsDeleteName').waitFor({ state: 'visible', timeout: 3000 }).catch(() => assert.fail('«متابعة» لم يفتح ورقة كتابة الاسم'));
        assert.equal(await askSheet(), null, 'ورقة التأكيد الأول باقية فوق ورقة الاسم');
        const fin = h.page.locator('button').filter({ hasText: /^\s*حذف نهائي\s*$/ }).filter({ visible: true }).first();
        const finState = () => fin.evaluate(e => ({ off: e.disabled || e.getAttribute('aria-disabled') === 'true', bg: getComputedStyle(e).backgroundColor, color: getComputedStyle(e).color }));
        for (const typed of ['', 'فهد ']) {
            await h.page.fill('#tsDeleteName', typed);
            const st = await finState();
            assert.ok(st.off && st.bg === 'rgb(229, 233, 231)', `«حذف نهائي» ليس رمادياً معطّلاً والاسم «${typed}»: ${JSON.stringify(st)}`);
            await fin.click({ force: true }).catch(() => {});
            await h.page.waitForTimeout(200);
            assert.ok(await h.doc(S(5)), `حُذف والاسم «${typed}» غير مطابق`);
        }
        await h.page.fill('#tsDeleteName', 'فهد');
        const on = await finState();
        assert.deepEqual([on.off, on.bg, on.color], [false, C.red700, C.white], `«حذف نهائي» بعد المطابقة ليس أحمر فعّالاً: ${JSON.stringify(on)}`);
        await fin.click();
        await h.page.waitForTimeout(500);
        assert.equal(await h.doc(S(5)), undefined, 'لم يُحذف بعد المطابقة');
        assert.deepEqual(await confirms(), [], 'window.confirm استُدعي في المسار');
    } finally { await h.close(); }
    await adminSame();
});

// =====================================================================================
// أ22 (مراجع الواجهة ف1–ف3، ق125، القائمة 12–13، DESIGN.md §5): حالات البطاقة والتنبيه القديم بعد «تراجع». إضافة فقط.
// =====================================================================================
const DISABLED_BG = 'rgb(229, 233, 231)';   // --disabled-bg
async function cardState(page, id) {
    return page.evaluate(id => {
        const c = document.querySelector(`.teacher-card[data-id="${id}"]`); if (!c) return null;
        const t = e => (e?.innerText || '').replace(/\s+/g, ' ').replace(/[\u064B-\u0652\u0670]/g, '').trim();
        const btn = a => { const b = c.querySelector(`[data-a=${a}]`); if (!b) return null; const cs = getComputedStyle(b);
            return { text: t(b), disabled: b.disabled, aria: b.getAttribute('aria-disabled'), bg: cs.backgroundColor, ws: cs.whiteSpace, overflow: b.scrollWidth > b.clientWidth + 1 }; };
        const leaves = [...c.querySelectorAll('.tch-card-info *')].filter(e => e.getClientRects().length && ![...e.children].some(x => x.getClientRects().length));
        const line = w => { const e = leaves.find(x => t(x).startsWith(w + ' ')); return e ? { text: t(e), color: getComputedStyle(e).color, size: parseFloat(getComputedStyle(e).fontSize) } : null; };
        return { badge: t(c.querySelector('.tch-badge')), newLine: line('جديد'), revLine: line('مراجعة'), ach: btn('ach'), absent: btn('absent') };
    }, id);
}
async function saveNewAndReview(h, id) {   // جديد البقرة 6–10 «ممتاز» + مراجعة الفاتحة 1–7 «جيد»
    await saveFor(h, id);
}

test('ر19 (ف2/ف3، ق125، القائمة 12–13) حالات البطاقة: المسجَّل اليوم شارته «سُجّل · التقدير» وتحت «آخر محفوظ» سطرا «جديد البقرة 6–10» و«مراجعة الفاتحة 1–7» (14 --green-900) و«غائب» معطّل لا يفتح ورقة؛ الغائب شارته «غائب · بغير عذر»/«غائب · بعذر» و«الإنجاز» معطّل لا يفتح النافذة و«إلغاء الغياب» في سطر واحد', async () => {
    const h = await teacherPage({ mods: { 5: { history: { [TODAY]: { attended: false, absence: 'excused' } } } } });
    try {
        await saveNewAndReview(h, 1);
        await h.page.waitForTimeout(400);
        // المسجَّل من هذا الجهاز (جديد + مراجعة).
        const r1 = await cardState(h.page, 1);
        assert.match(r1.badge, /^سجل · (ممتاز|جيد)$/, `شارة المسجَّل: ${r1.badge}`);
        assert.ok(r1.newLine && /^جديد البقرة 6\s*[–-]\s*10$/.test(r1.newLine.text), `سطر «جديد البقرة 6–10» غائب: ${JSON.stringify(r1)}`);
        assert.ok(r1.revLine && /^مراجعة الفاتحة 1\s*[–-]\s*7$/.test(r1.revLine.text), `سطر «مراجعة الفاتحة 1–7» غائب: ${JSON.stringify(r1.revLine)}`);
        for (const l of [r1.newLine, r1.revLine]) assert.deepEqual([l.color, l.size], [C.green900, 14], `سطر «${l.text}» ليس 14 --green-900`);
        // المسجَّل من جهاز آخر (جديد وحده): سطر الجديد بلا سطر مراجعة.
        const r2 = await cardState(h.page, 2);
        assert.ok(r2.newLine && /^جديد البقرة 6\s*[–-]\s*10$/.test(r2.newLine.text) && !r2.revLine, `بطاقة بدر: ${JSON.stringify(r2)}`);
        for (const [id, r] of [[1, r1], [2, r2]]) {
            assert.ok(r.absent && r.absent.disabled === true && r.absent.bg === DISABLED_BG, `«غائب» على المسجَّل ${id} ليس معطّلاً بمظهر المعطّل: ${JSON.stringify(r.absent)}`);
        }
        await card(h.page, 2).locator('[data-a=absent]').click({ force: true }).catch(() => {});
        await h.page.waitForTimeout(250);
        assert.equal(await visible(h.page, '#teacherAbsenceSheet'), false, '«غائب» على المسجَّل فتح ورقة الغياب');
        // الغائبان: بغير عذر (خالد) وبعذر (فهد).
        for (const [id, reason] of [[3, 'بغير عذر'], [5, 'بعذر']]) {
            const r = await cardState(h.page, id);
            assert.equal(r.badge, `غائب · ${reason}`, `شارة الغائب ${id}`);
            assert.ok(r.ach && r.ach.disabled === true && r.ach.bg === DISABLED_BG, `«الإنجاز» على الغائب ${id} ليس معطّلاً بمظهر المعطّل: ${JSON.stringify(r.ach)}`);
            assert.equal(r.absent?.text, 'إلغاء الغياب', `زر «إلغاء الغياب» للغائب ${id}`);
            assert.ok(r.absent.ws === 'nowrap' && !r.absent.overflow, `«إلغاء الغياب» ${id} قد ينكسر أو يُقصّ: ${JSON.stringify(r.absent)}`);
            await card(h.page, id).locator('[data-a=ach]').click({ force: true }).catch(() => {});
            await h.page.waitForTimeout(250);
            assert.equal(await h.page.evaluate(() => document.getElementById('smartModal')?.classList.contains('flex')), false, `«الإنجاز» على الغائب ${id} فتح النافذة`);
        }
    } finally { await h.close(); }
    await adminSame();
});

test('ر20 (ف1، ق125) بعد «تراجع» في وضع المعلم لا يظهر تنبيه البرنامج القديم (#toastMessage «تم التراجع عن…» فوق الرأس)؛ تكفي الرسالة الداكنة', async () => {
    const h = await teacherPage();
    try {
        await saveFor(h, 1);
        // ب14 (ق205): كان تراجع الشريط؛ صار من صندوق نافذة الطالب.
        assert.equal(await h.page.locator('#teacherToast button').count(), 0, 'رسالة الحفظ فيها زر');
        await H.openAch(h, 1);
        await h.page.locator('#quickTodayBox button').filter({ hasText: 'تراجع' }).first().click();
        const seen = [];
        for (let i = 0; i < 8; i++) {
            await h.page.waitForTimeout(150);
            seen.push(await h.page.evaluate(() => { const t = document.getElementById('toastMessage'), x = document.getElementById('toastText');
                const shown = !!t && t.getClientRects().length > 0 && getComputedStyle(t).visibility !== 'hidden' && !t.classList.contains('hidden');
                return shown && (x?.innerText || '').trim() ? x.innerText.trim() : ''; }));
        }
        assert.deepEqual(seen.filter(Boolean), [], `التنبيه القديم ظهر بعد «تراجع»: ${JSON.stringify([...new Set(seen.filter(Boolean))])}`);
    } finally { await h.close(); }
    await adminSame();
});

// =====================================================================================
// أ24 (ق129-2، ق130 ع1/ع2، ق131 ص5–ص8؛ teacher-r3-polish-red-prompt.md، 2026-11-19): دفعة الصقل. إضافة فقط،
// إلا ر18 لُمس في سطرين ليقبل كلمة الزر «حذف» (ص7) كما يقبل «متابعة».
// =====================================================================================
const INK2 = 'rgb(74, 90, 81)';   // --ink-2
// حال التنبيه القديم #toastMessage الآن: نصه ونوعه (error = bg-red-600) إن كان ظاهراً، وإلا null.
const oldToastNow = page => page.evaluate(() => {
    const t = document.getElementById('toastMessage'), x = document.getElementById('toastText');
    const shown = !!t && t.getClientRects().length > 0 && getComputedStyle(t).visibility !== 'hidden' && !t.classList.contains('hidden');
    const text = (x?.innerText || '').trim();
    return shown && text ? { text, error: t.classList.contains('bg-red-600') } : null;
});
// طريقة ر20 معمَّمة: مراقبة n × 150ms، وتعيد كل تنبيه قديم ظهر (بلا تكرار).
async function watchOldToast(page, n = 8, every = 150) {
    const seen = [];
    for (let i = 0; i < n; i++) {
        await page.waitForTimeout(every);
        const s = await oldToastNow(page);
        if (s && !seen.some(x => x.text === s.text && x.error === s.error)) seen.push(s);
    }
    return seen;
}
// ينتظر اختفاء التنبيه القديم (≤ 3.5 ث) حتى لا يُنسب تنبيه فعل سابق إلى الفعل التالي.
const oldToastGone = page => page.waitForFunction(() => { const t = document.getElementById('toastMessage'); return !t || t.classList.contains('hidden') || !t.getClientRects().length; }, null, { timeout: 3500 }).catch(() => {});

test('ر21 (ص1، ق129-2، حارس الطفرة و) المشرف (بالبريد، البرنامج العام) بعد «تراجع» عن حفظ من هذا الجهاز يرى #toastMessage «تم التراجع عن…» خلال ≤ 1.5 ث، ونافذة تأكيده باقية (ق131 ص5: المشرف كما هو)؛ والمعلم لا يراه (ر20)', async () => {
    const a = await H.openPage(browser, { user: H.ADMIN_USER });
    try {
        await a.page.waitForFunction(() => window.almahraPrograms?.getCurrentProgramId?.() === 'general' && window.almahraData?.isReady?.(), null, { timeout: 8000 })
            .catch(async () => assert.fail('المشرف لم يدخل البرنامج العام. ' + await diagnose(a)));
        await a.page.locator('#loadingOverlay').waitFor({ state: 'hidden' }).catch(() => {});
        assert.equal(await a.page.evaluate(() => document.body.classList.contains('teacher-mode')), false, 'المشرف في وضع المعلم');
        await saveFor(a, 1);   // جديد البقرة 6–10 + مراجعة الفاتحة 1–7 من جهاز المشرف
        const mine = async () => Object.values((await a.doc(S(1)))?.history?.[TODAY]?.entries || {}).filter(e => e.by === 'admin-uid').length;
        assert.ok(await mine() >= 1, 'الشرط المسبق: لا تسجيل للمشرف اليوم بعد الحفظ');
        await oldToastGone(a.page);   // تنبيه الحفظ «حُفظ لأحمد…» يختفي أولاً
        await a.page.evaluate(() => openSmartModal(1));
        const undo = a.page.locator('#smartUndoBtn');
        await undo.waitFor({ state: 'visible', timeout: 3000 }).catch(async () => assert.fail('زر «تراجع» عند المشرف #smartUndoBtn غير ظاهر. ' + await diagnose(a)));
        const before = await mine(), n0 = a.dialogs.length;
        await undo.click();
        const t0 = Date.now(), seen = [];
        let hit = null;
        while (Date.now() - t0 <= 1500) {
            const s = await oldToastNow(a.page);
            if (s && !seen.some(x => x.text === s.text)) seen.push(s);
            if (s && s.text.startsWith('تم التراجع عن')) { hit = { ...s, ms: Date.now() - t0 }; break; }
            await a.page.waitForTimeout(100);
        }
        const dialogs = a.dialogs.slice(n0).map(d => d.message);
        const after = await mine();
        assert.equal(after, before - 1, `الشرط المسبق: «تراجع» المشرف لم يُزل تسجيلاً (قبل ${before} بعد ${after})`);
        assert.ok(dialogs.some(m => m.startsWith('التراجع عن: ')), `المشرف: نافذة تأكيد «التراجع عن: …؟» اختفت (ق131 ص5 المشرف كما هو): ${JSON.stringify(dialogs)}`);
        assert.ok(hit && !hit.error, `المشرف: #toastMessage «تم التراجع عن…» لم يظهر خلال 1.5 ث بعد «تراجع»؛ الظاهر: ${JSON.stringify(seen)}`);
    } finally { await a.close(); }
    await adminSame();
});

test('ر22 (ص2، ق129-2، v7 السطر 518) حقل الرمز مع رسالة الخطأ يحمل aria-invalid="true" (يدوياً وبالرابط)، ويزول عند الكتابة', async () => {
    const st = {};
    const attr = h => h.page.evaluate(() => document.getElementById('teacherCodeInput')?.getAttribute('aria-invalid') ?? null);
    const errShown = h => h.page.waitForFunction(msg => document.getElementById('loginError')?.innerText.trim() === msg && document.getElementById('loginError').getClientRects().length, CODE_MSG, { timeout: 6000 })
        .catch(async () => assert.fail('رسالة الرمز الخاطئ لم تظهر. ' + await diagnose(h)));
    let h = await loginPage();
    try {
        await h.page.locator('#loginRoleTeacher').click();
        st.قبل_الخطأ = (await attr(h)) === 'true' ? 'true' : 'لا';
        await h.page.locator('#teacherCodeInput').fill('t1.NOPENOPE2345');
        await h.page.locator('#teacherCodeBtn').click();
        await errShown(h);
        st.مع_الخطأ_يدوياً = await attr(h);
        await h.page.locator('#teacherCodeInput').press('Backspace');   // كتابة في الحقل
        await h.page.waitForTimeout(100);
        st.بعد_الكتابة = (await attr(h)) === 'true' ? 'true' : 'زال';
    } finally { await h.close(); }
    h = await loginPage({ url: '/?k=t1.WRONGWRONG23' });
    try { await errShown(h); st.مع_الخطأ_بالرابط = await attr(h); }
    finally { await h.close(); }
    assert.deepEqual(st, { قبل_الخطأ: 'لا', مع_الخطأ_يدوياً: 'true', بعد_الكتابة: 'زال', مع_الخطأ_بالرابط: 'true' },
        `aria-invalid على #teacherCodeInput (null = غائب): ${JSON.stringify(st)}`);
    await adminSame();
});

test('ر22-ب (أ26، ل1، ق137) رمز ناقص الشكل يُكتب يدوياً «t1.ABC» ثم «دخول» ← رسالة الخطأ ومعها aria-invalid="true" (الرفض المتزامن في auth.js قبل أي await)', async () => {
    const h = await loginPage();
    try {
        await h.page.locator('#loginRoleTeacher').click();
        await h.page.locator('#teacherCodeInput').fill('t1.ABC');
        await h.page.locator('#teacherCodeBtn').click();
        await h.page.waitForFunction(msg => document.getElementById('loginError')?.innerText.trim() === msg && document.getElementById('loginError').getClientRects().length, CODE_MSG, { timeout: 6000 })
            .catch(async () => assert.fail('رسالة الرمز الخاطئ لم تظهر. ' + await diagnose(h)));
        await h.page.waitForTimeout(150);
        assert.equal(await h.page.evaluate(() => document.getElementById('teacherCodeInput')?.getAttribute('aria-invalid') ?? null), 'true', 'aria-invalid على #teacherCodeInput بعد رفض «t1.ABC» (null = غائب)');
    } finally { await h.close(); }
    await adminSame();
});

// حلقة التركيز بعد :focus-visible: Tab يضع الصفحة في وضع لوحة المفاتيح، ثم يُركَّز كل عنصر بـfocus().
async function rings(page, selectors) {
    await page.keyboard.press('Tab');
    return page.evaluate(sels => Object.fromEntries(sels.map(sel => {
        const e = document.querySelector(sel);
        if (!e || !e.getClientRects().length) return [sel, 'غير ظاهر'];
        e.focus();
        const cs = getComputedStyle(e);
        return [sel, { fv: e.matches(':focus-visible'), outline: `${cs.outlineStyle} ${parseFloat(cs.outlineWidth)} ${cs.outlineColor} +${parseFloat(cs.outlineOffset)}`,
            border: `${parseFloat(cs.borderTopWidth)} ${cs.borderTopColor}` }];
    })), selectors);
}
// ب14 (ق205): كان فحص حلقة تراجع الشريط؛ صار فحص غياب أزراره مع بقاء بقية حلقات التركيز.
test('ر23 (ص3 موسَّع، ق129-2، ق205) التركيز بلوحة المفاتيح لأزرار المعلم والنافذة والدور؛ شريط الحفظ بلا أزرار، وحدّ الحقول يبقى 1 --border-control', async () => {
    const WANT_RING = `solid 2 ${C.green700} +2`, WANT_BORDER = `1 ${C.borderControl}`;
    const got = {};
    const h = await teacherPage();
    try {
        Object.assign(got, await rings(h.page, [SEL.help, SEL.logout, `${SEL.tab}:nth-child(1)`, `${SEL.tab}:nth-child(2)`, SEL.filter('all'), SEL.filter('none'),
            '.teacher-card[data-id="1"] [data-a=ach]', '.teacher-card[data-id="1"] [data-a=absent]', '.teacher-card[data-id="1"] [data-a=edit]', '.teacher-card[data-id="1"] [data-a=more]', SEL.add]));
        await h.page.locator(SEL.add).click();
        await h.page.locator('#teacherStudentSheet').waitFor({ state: 'visible', timeout: 3000 });
        Object.assign(got, await rings(h.page, ['#tsName', '#tsJuz', '#tsPhone']));
        await h.page.locator('#teacherStudentSheet [data-cancel]').click();
        await card(h.page, 5).locator('[data-a=more]').click();
        await h.page.locator('#teacherMoreSheet button').filter({ hasText: /^\s*حذف الطالب\s*$/ }).click();
        await h.page.locator('#teacherDeleteAskSheet [data-go]').click();
        await h.page.locator('#tsDeleteName').waitFor({ state: 'visible', timeout: 3000 });
        Object.assign(got, await rings(h.page, ['#tsDeleteName']));
        await h.page.locator('#teacherDeleteSheet [data-cancel]').click();
        // أ26 (ل2، الجولة 4): أزرار نافذة الإنجاز في وضع المعلم (رجوع، رأس القسم، تأكيد، حبّة التقدير، الاختصاران، «استثناءات»، «حفظ») أخضر،
        // ب14 (ق205): كان فحص حلقة «تراجع» في شريط الحفظ؛ صار الشريط بلا أزرار.
        await H.openAch(h, 5);
        await H.openSec(h.page, 'new');
        Object.assign(got, await rings(h.page, ['#generalQuickSection button[aria-label="رجوع"]', '#generalQuickSection [data-sec="new"] .tch-acc-toggle',
            '#generalQuickSection [data-sec="new"] .tch-confirm', '#quick_new_grades button']));
        await H.openSec(h.page, 'behavior');
        Object.assign(got, await rings(h.page, ['#quickDisciplineAll', '#quickDisciplineHome', '#generalCriteriaExceptions']));
        await H.openSec(h.page, 'new'); await setField(h.page, 'quick_new_toAyah', 10); await grade(h.page, 'new', 'ممتاز'); await H.confirmSec(h.page, 'new');
        Object.assign(got, await rings(h.page, ['#generalQuickSaveBtn']));
        await H.closeAch(h.page);
        await saveFor(h, 1);
        assert.equal(await h.page.locator('#teacherToast button').count(), 0, 'ب14 (ق205): شريط الحفظ بلا أزرار');
    } finally { await h.close(); }
    const l = await loginPage();
    try {
        await l.page.locator('#loginRoleTeacher').click();
        await l.page.locator('#teacherCodeInput').waitFor({ state: 'visible' });
        Object.assign(got, await rings(l.page, ['#teacherCodeInput', '#loginRoleAdmin', '#loginRoleTeacher']));   // أ26 (ل2): زرّا الدور أخضر
    } finally { await l.close(); }
    const FIELDS = ['#tsName', '#tsJuz', '#tsPhone', '#tsDeleteName', '#teacherCodeInput'];
    const want = Object.fromEntries(Object.entries(got).map(([sel, v]) => [sel, typeof v === 'string' ? 'ظاهر'
        : { fv: true, outline: /^#teacher(HelpBtn|LogoutBtn|HalaqaTabs|Toast)/.test(sel) ? `solid 2 ${C.white} +2` : WANT_RING, border: FIELDS.includes(sel) ? WANT_BORDER : v.border }]));
    assert.deepEqual(got, want, 'حلقة التركيز لكل عنصر: [المتصفح يعدّه :focus-visible، outline «نمط عرض لون +إزاحة»، الحدّ «عرض لون» (يُقارن للحقول وحدها)]');
    await adminSame();
});

test('ر24 (ص4، ق129-2؛ review2 السطر 189) CSS القديم المغطّى محذوف: لا height:168px (الشعار، مغطّى بـ220) ولا #eef1ef (الشارة، مغطّى) في أي كتلة <style> في index.html', () => {
    const html = H.read('index.html');
    const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
    const found = css.split('\n').map(s => s.trim()).filter(s => /height\s*:\s*168px|#eef1ef/i.test(s)).map(s => s.slice(0, 140));
    assert.deepEqual(found, [], 'قواعد CSS ما زالت تحمل القيمتين المغطّاتين');
});

test('ر25 (ع1، ق130، ق131 (1)، 02c ط101) البطاقة المسجَّلة بجديد ومراجعة: «جديد …» أولاً ثم «مراجعة …» مهما كان ترتيب مفاتيح التسجيلات، والشارة «سُجّل · [تقدير الجديد]»، وبلا جديد فتقدير المراجعة', async () => {
    const e = (kind, grade, spec) => ({ kind, grade, spec, rep: 1, points: 2, at: 1, by: H.OTHER_UID, heardBy: 't1' });
    const NEW = e('new', 'excellent', { from: [2, 6], to: [2, 10] }), REV = e('review', 'good', { from: [1, 1], to: [1, 7] });
    const day = entries => ({ history: { [TODAY]: { attended: true, hijri: 'وهمي', entries } } });
    // 1: المراجعة أولاً أبجدياً وإدخالاً؛ 5: الجديد أولاً (الترتيب المعاكس)؛ 4: مراجعة وحدها.
    const h = await teacherPage({ mods: { 1: day({ a_rev: REV, b_new: NEW }), 5: day({ a_new: NEW, b_rev: REV }), 4: day({ a_rev: REV }) } });
    try {
        await waitFor(h, '.teacher-card[data-id="1"]', 'بطاقة أحمد', 3000);
        const got = await h.page.evaluate(ids => Object.fromEntries(ids.map(id => {
            const c = document.querySelector(`.teacher-card[data-id="${id}"]`);
            const t = x => (x?.innerText || '').replace(/\s+/g, ' ').replace(/[ً-ْٰ]/g, '').trim();
            const leaves = [...c.querySelectorAll('.tch-card-info *')].filter(x => x.getClientRects().length && ![...x.children].some(y => y.getClientRects().length));
            const lines = leaves.filter(x => /^(جديد|مراجعة) /.test(t(x))).sort((p, q) => p.getBoundingClientRect().top - q.getBoundingClientRect().top).map(t);
            return [id, { lines, badge: t(c.querySelector('.tch-badge')) }];
        })), [1, 5, 4]);
        const both = { lines: ['جديد البقرة 6–10', 'مراجعة الفاتحة 1–7'], badge: 'سجل · ممتاز' };
        assert.deepEqual(got, { 1: both, 5: both, 4: { lines: ['مراجعة الفاتحة 1–7'], badge: 'سجل · جيد' } },
            'لكل بطاقة: [سطرا الإنجاز من الأعلى، الشارة] (1 المراجعة أولاً في القاعدة، 5 الجديد أولاً، 4 مراجعة وحدها)');
    } finally { await h.close(); }
    await adminSame();
});

test('ر26 (ع2، ق130، ق131 (2)) وضع المعلم: لا #toastMessage نجاح بعد تسجيل غياب ولا بعد إلغائه ولا بعد حفظ إنجاز (الرسالة الداكنة تكفي)؛ ورسالة الخطأ ورسالة العطلة (ح4) تبقيان ظاهرتين؛ والمشرف ر21', async () => {
    const got = {};
    let h = await teacherPage();
    try {
        await card(h.page, 1).locator('[data-a=absent]').click();
        await h.page.locator('#teacherAbsenceSheet button').filter({ hasText: /^\s*بغير عذر\s*$/ }).click();
        got.تسجيل_غياب = await watchOldToast(h.page);
        assert.equal((await h.doc(S(1)))?.history?.[TODAY]?.attended, false, 'الشرط المسبق: الغياب لم يُكتب');
        await oldToastGone(h.page);
        await card(h.page, 1).locator('[data-a=absent]').click();   // «إلغاء الغياب»
        got.إلغاء_الغياب = await watchOldToast(h.page);
        assert.notEqual((await h.doc(S(1)))?.history?.[TODAY]?.attended, false, 'الشرط المسبق: الغياب لم يُلغَ');
        await oldToastGone(h.page);
        await saveFor(h, 5);
        got.حفظ_إنجاز = await watchOldToast(h.page);
        await oldToastGone(h.page);
        await h.page.evaluate(() => showToast('خطأ تجريبي', 'error'));
        got.رسالة_خطأ = await watchOldToast(h.page, 2);
    } finally { await h.close(); }
    h = await teacherPage({ seed: { holiday: true } });
    try {
        await h.page.waitForFunction(() => typeof students !== 'undefined' && students.some(s => s.id === 1), null, { timeout: 5000 });
        await h.page.evaluate(() => openSmartModal(1));
        got.العطلة = await watchOldToast(h.page, 2);
    } finally { await h.close(); }
    assert.deepEqual(got, { تسجيل_غياب: [], إلغاء_الغياب: [], حفظ_إنجاز: [], رسالة_خطأ: [{ text: 'خطأ تجريبي', error: true }], العطلة: [{ text: 'اليوم عطلة؛ لا تسجيل', error: false }] },
        'التنبيه القديم #toastMessage الظاهر بعد كل فعل في وضع المعلم');
    await adminSame();
});

// حفظ «جديد» وحده (البقرة 6 ← 10 «ممتاز») حتى يزيل «تراجع» واحد كل تسجيل اليوم.
async function saveNewOnly(h, id) {
    await H.openAch(h, id);
    await H.openSec(h.page, 'new'); await setField(h.page, 'quick_new_toAyah', 10); await grade(h.page, 'new', 'ممتاز'); await H.confirmSec(h.page, 'new');
    await H.confirmBehavior(h.page);
    await h.page.evaluate(() => typeof updateGeneralQuickPreview === 'function' && updateGeneralQuickPreview());
    await h.page.locator('#generalQuickSaveBtn').click();
    await h.page.locator('#teacherOneSideSheet').waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
    if (await h.page.locator('#teacherOneSideSheet').isVisible()) await H.sheetButton(h.page, 'احفظ الجديد فقط');   // ورقة «لم تُدخل مراجعة»
    await h.page.waitForFunction(() => !document.getElementById('smartModal')?.classList.contains('flex'), null, { timeout: 5000 })
        .catch(async () => assert.fail('الحفظ لم يُغلق النافذة. ' + await diagnose(h)));
}
// ب14 (ق205): كان التراجع من الرسالة؛ صار من صندوق «سُجّل اليوم» بلا window.confirm.
test('ر27 (ص5، ق131 (2)، DESIGN §8) تراجع صندوق نافذة المعلم بلا window.confirm والتسجيل يزول', async () => {
    const h = await teacherPage();
    try {
        await h.page.evaluate(() => { window.__confirms = []; const c = window.confirm; window.confirm = function (m) { window.__confirms.push(String(m)); return c.apply(window, arguments); }; });
        await saveNewOnly(h, 1);
        const mine = async () => Object.values((await h.doc(S(1)))?.history?.[TODAY]?.entries || {}).filter(e => e.by === H.TEACHER_USER.uid).length;
        assert.equal(await mine(), 1, 'الشرط المسبق: لا تسجيل للمعلم بعد الحفظ');
        assert.equal(await h.page.locator('#teacherToast button').count(), 0, 'رسالة الحفظ فيها زر');
        await H.openAch(h, 1);
        const undo = h.page.locator('#quickTodayBox button').filter({ hasText: 'تراجع' }).first();
        await undo.waitFor({ state: 'visible', timeout: 4000 });
        const n0 = h.dialogs.length, before = await mine();
        await undo.click();
        await h.page.waitForTimeout(800);
        const asked = [...await h.page.evaluate(() => window.__confirms), ...h.dialogs.slice(n0).map(d => d.message)];
        const got = { نوافذ_المتصفح: [...new Set(asked)], زال_تسجيل: before - await mine(), الشارة: (await cardState(h.page, 1)).badge };
        assert.deepEqual(got, { نوافذ_المتصفح: [], زال_تسجيل: 1, الشارة: 'لم يسجل' }, '«تراجع» عند المعلم: [نوافذ confirm/dialog، عدد ما زال من تسجيلاته، شارة البطاقة]');
    } finally { await h.close(); }
    await adminSame();
});

test('ر28 (ص6، ق131 (2)، ق133 س2، DESIGN §5) حقل جوال ولي الأمر #tsPhone في «طالب جديد» و«تعديل»: placeholder="05××××××××" (0 و5 ثم ثماني علامات ضرب U+00D7، لا X لاتينية) مع dir="ltr"', async () => {
    const h = await teacherPage();
    const got = {};
    try {
        for (const [label, open] of [['طالب جديد', () => h.page.locator(SEL.add).click()], ['تعديل', () => card(h.page, 1).locator('[data-a=edit]').click()]]) {
            await open();
            await h.page.locator('#teacherStudentSheet #tsPhone').waitFor({ state: 'visible', timeout: 3000 });
            got[label] = await h.page.evaluate(() => { const p = document.getElementById('tsPhone'); return { placeholder: p.getAttribute('placeholder'), dir: p.getAttribute('dir') }; });
            await h.page.locator('#teacherStudentSheet [data-cancel]').click();
        }
    } finally { await h.close(); }
    const want = { placeholder: '05××××××××', dir: 'ltr' }; // «05××××××××»
    const cps = (v) => v == null ? String(v) : JSON.stringify(v) + ' = [' + Array.from(v, (c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' ') + ']';
    const shown = Object.entries(got).map(([k, v]) => `${k}: placeholder ${cps(v.placeholder)}، dir=${v.dir}`).join(' | ');
    assert.deepEqual(got, { 'طالب جديد': want, 'تعديل': want }, `#tsPhone: المتوقع placeholder ${cps(want.placeholder)}، dir=ltr — الظاهر: ${shown}`);
    await adminSame();
});

test('ر29 (ص7+ص8، ق131 (2)، v7 07b/07c) ورقة الحذف الأولى: زرّ الخطر [data-go] نصّه «حذف»، والعنوان h2 «حذف فهد من حلقة أُبيّ؟» وتحته سطر ثانٍ «سيُمحى سجله ونقاطه» 15 --ink-2؛ وورقة الاسم عنوانها «للتأكيد اكتب اسم الطالب»', async () => {
    const h = await teacherPage();
    const got = {};
    try {
        await card(h.page, 5).locator('[data-a=more]').click();
        await h.page.locator('#teacherMoreSheet button').filter({ hasText: /^\s*حذف الطالب\s*$/ }).click();
        await h.page.locator('#teacherDeleteAskSheet').waitFor({ state: 'visible', timeout: 3000 }).catch(() => assert.fail('#teacherDeleteAskSheet لم تظهر'));
        Object.assign(got, await h.page.evaluate(() => {
            const s = document.getElementById('teacherDeleteAskSheet'), h2 = s.querySelector('h2'), go = s.querySelector('[data-go]');
            const t = x => (x?.innerText || '').replace(/\s+/g, ' ').trim();
            const sub = [...s.querySelectorAll('*')].find(x => x.getClientRects().length && !h2?.contains(x) && t(x) === 'سيُمحى سجله ونقاطه' && ![...x.children].some(y => t(y) === t(x)));
            const cs = sub && getComputedStyle(sub);
            return { الزر: t(go), العنوان: t(h2), السطر_الثاني: sub ? { size: parseFloat(cs.fontSize), color: cs.color, تحت_العنوان: sub.getBoundingClientRect().top >= h2.getBoundingClientRect().bottom - 1 } : 'غائب خارج h2' };
        }));
        await h.page.locator('#teacherDeleteAskSheet [data-go]').click();
        await h.page.locator('#teacherDeleteSheet').waitFor({ state: 'visible', timeout: 3000 });
        got.عنوان_ورقة_الاسم = await h.page.evaluate(() => document.querySelector('#teacherDeleteSheet h2')?.innerText.replace(/\s+/g, ' ').trim());
    } finally { await h.close(); }
    assert.deepEqual(got, { الزر: 'حذف', العنوان: 'حذف فهد من حلقة أُبيّ؟', السطر_الثاني: { size: 15, color: INK2, تحت_العنوان: true }, عنوان_ورقة_الاسم: 'للتأكيد اكتب اسم الطالب' },
        'ورقتا الحذف: [نص [data-go]، h2 الأولى، السطر الثاني (حجم، لون، تحت العنوان)، h2 ورقة الاسم]');
    await adminSame();
});
