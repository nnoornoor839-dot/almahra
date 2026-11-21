// دفعة إصلاح الجولة 4 (ب12-ف1) — اختبار القبول الأحمر م33–م39، 2026-11-19، كاتب اختبار أ27.
// المرجع: D:\المهره\notes\fast-track-prompts\teacher-r4-review-out.md (ف1، ف2، ن1، ن3) وقرار ق173 في features/accounts/teacher-accounts-card.md،
// والبطاقة features/accounts/teacher-r4-card.md (ل14، ل17). منهج السباق من verify/teacher-r4-2026-11-19/review/probe-race.cjs:
// التأخير في الفايربيس الوهمي وحده (window.__fb.getDocFromServer)، بلا طفرة في المنتج.
// لماذا ملف جديد لا teacher-r4-local: بصمة teacher-r4-local (2054083b…) مسجّلة في الفئة 28 (teacherAccountsR4) ويفحصها تدقيق teacher-ui-audit-local؛
// تعديله يكسر ذلك التدقيق ويخلط اختبارات بناء معتمد باختبارات دفعة الإصلاح. هنا ملف مستقل يُسجَّل وحده.
//
// افتراضات الاختبار فيما لم يسمّه الأمر (تُلزم الباني، ومذكورة في التقرير):
//   • ساعة الهاركنس ثابتة (Date.now لا يتقدّم) ← التخميد 10 ث في probeTeacherKey لا ينقضي داخل الصفحة: كل فحص بعد الأول مخمَّد.
//     لذلك المهلة (م34) يجب أن تُبنى على setTimeout/Promise.race لا على فرق Date.now.
//   • «الإنجاز» = .teacher-card[data-id] [data-a=ach]؛ أحمد = 1 وسعد = 4 (H.students). م35 يقرأ الزر المضغوط وحده؛ أزرار البطاقات الأخرى تبقى قابلة للضغط (م33 يضغط سعد أثناء فحص أحمد).
//   • «انتهى الفحص» في م35 = ظهرت النافذة؛ بعدها الزر بلا aria-busy="true" وغير معطّل.
//   • م37: الشارة عنصر .general-tv-status خارج الزر (ليس من نسله) — في الشرف داخل أبي #generalTvButton، وفي الإعدادات هي #generalSettingsTv.nextElementSibling
//     أو داخله (يبقى م31 في teacher-r4-local أخضر بقراءته الحالية)؛ بُعدها عن الزر ≤ 24px؛ نصّ الزر نفسه بلا «موصول»؛ role="status"؛
//     13px/700؛ ارتفاع ≥ 24؛ حبّية (ق173): نصف قطر الزوايا ≥ نصف الارتفاع − 1؛ الألوان تُقرأ من التوكنات في الصفحة نفسها. وفي وضع المعلم لا .general-tv-status في DOM.
//   • م38: «مطويّ» = [data-sec="behavior"] .tch-acc-toggle aria-expanded="false" والجسم .tch-acc-body غير ظاهر و.tch-acc-sum ظاهر؛
//     السطر الكهرماني = #quickHomePrepBelow ظاهر نصّه «التحضير المنزلي: دون الحد اليومي (الجديد 8 أسطر)».
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const H = require('./helpers/teacher-ui-harness.cjs');

const BELOW = 'التحضير المنزلي: دون الحد اليومي';
const AHMAD = '1', SAAD = '4';
let browser;
before(async () => {
    const playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); });

const norm = s => String(s || '').replace(/[\u2066-\u2069\u200e\u200f\u061c]/g, '').replace(/\s+/g, ' ').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
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
// قراءة الخادم: ms = عدد الميلي ثانية قبل الرد الحقيقي، أو null = لا ترد أبداً. سجل كل طلب في window.__probeLog.
function slowProbe(page, ms) {
    return page.evaluate(ms => {
        const orig = window.__fb.getDocFromServer; window.__probeLog = [];
        window.__fb.getDocFromServer = r => { window.__probeLog.push(r.path);
            return ms == null ? new Promise(() => {}) : new Promise(res => setTimeout(res, ms)).then(() => orig(r)); };
    }, ms);
}
// مسجّل حال النافذة في الصفحة كل 20ms: كل تغيّر في (مفتوحة؟، العنوان، currentEditingStudentId) يُحفظ بزمنه.
function startRecorder(page) {
    return page.evaluate(() => {
        window.__modalTrail = []; const t0 = performance.now(); let last = '';
        const snap = () => { const m = document.getElementById('smartModal'), open = !!m?.classList.contains('flex');
            const s = open ? (document.getElementById('smartStudentName')?.innerText || '').trim() + '#' + (typeof currentEditingStudentId !== 'undefined' ? currentEditingStudentId : '?') : 'مغلقة';
            if (s !== last) { last = s; window.__modalTrail.push({ t: Math.round(performance.now() - t0), s }); } };
        snap(); window.__modalTimer = setInterval(snap, 20);
    });
}
const trail = page => page.evaluate(() => window.__modalTrail.map(x => x.t + 'ms:' + x.s));
const modalState = page => page.evaluate(() => ({ مفتوحة: document.getElementById('smartModal').classList.contains('flex'),
    العنوان: (document.getElementById('smartStudentName')?.innerText || '').trim(), editing: typeof currentEditingStudentId !== 'undefined' ? String(currentEditingStudentId) : null }));
const outState = page => page.evaluate(() => ({ signOut: window.__fb.authLog.filter(l => l.op === 'signOut').length, المعلم: !!document.getElementById('teacherHome') }));

// =====================================================================================
// ف1 (ل17) — فحص الرمز عند فتح «الإنجاز»: التسلسل، المهلة، الانتظار، التخميد
// =====================================================================================
test('م33 (ف1، السباق) قراءة الخادم 3 ث: «الإنجاز» لأحمد ثم بعد 400ms لسعد ← النافذة لسعد ولا تُستبدل بأحمد حين تنتهي قراءته؛ وإن أُغلقت نافذة سعد لا تُفتح نافذة أحمد لاحقاً', async () => {
    const got = {};
    // (أ) تبقى مفتوحة لسعد
    let h = await teacherPage();
    try {
        await slowProbe(h.page, 3000); await startRecorder(h.page);
        await h.page.locator(ach(AHMAD)).click();
        await h.page.waitForTimeout(400);
        got.ضغطة_سعد = await h.page.locator(ach(SAAD)).click({ timeout: 2000 }).then(() => 'تمّت', e => 'تعذّرت: ' + e.message.split('\n')[0].slice(0, 100));
        await h.page.waitForTimeout(4000);   // ما بعد انتهاء قراءة أحمد (3 ث) بهامش
        got.النهاية = await modalState(h.page);
        const tr = await trail(h.page);
        got.ظهر_أحمد = tr.some(x => /أحمد/.test(x));
        got.المسار = tr;
    } finally { await h.close(); }
    // (ب) سعد ثم إغلاق نافذته قبل انتهاء قراءة أحمد ← لا شيء يُفتح بعدها
    h = await teacherPage();
    try {
        await slowProbe(h.page, 3000); await startRecorder(h.page);
        await h.page.locator(ach(AHMAD)).click();
        await h.page.waitForTimeout(400);
        await h.page.locator(ach(SAAD)).click({ timeout: 2000 }).catch(() => {});
        const saadOpened = await h.page.waitForFunction(() => document.getElementById('smartModal').classList.contains('flex') && /سعد/.test(document.getElementById('smartStudentName')?.innerText || ''),
            null, { timeout: 4000 }).then(() => true, () => false);
        if (saadOpened) await h.page.evaluate(() => closeSmartModal(true));
        await h.page.waitForTimeout(4000);
        const tr = await trail(h.page);
        got.ب = { فُتحت_لسعد: saadOpened, النهاية_مفتوحة: (await modalState(h.page)).مفتوحة, ظهر_أحمد: tr.some(x => /أحمد/.test(x)), المسار: tr };
    } finally { await h.close(); }
    const want = { ضغطة_سعد: 'تمّت', النهاية: { مفتوحة: true, العنوان: 'سعد', editing: SAAD }, ظهر_أحمد: false,
        ب: { فُتحت_لسعد: true, النهاية_مفتوحة: false, ظهر_أحمد: false } };
    const cmp = { ضغطة_سعد: got.ضغطة_سعد, النهاية: got.النهاية, ظهر_أحمد: got.ظهر_أحمد, ب: { فُتحت_لسعد: got.ب.فُتحت_لسعد, النهاية_مفتوحة: got.ب.النهاية_مفتوحة, ظهر_أحمد: got.ب.ظهر_أحمد } };
    assert.deepEqual(cmp, want, `م33 الظاهر: ${JSON.stringify(got)}`);
});

test('م34 (ف1، المهلة) قراءة الخادم لا تعود أبداً ← خلال ≤ 3.5 ث تُفتح نافذة أحمد (المهلة = انقطاع)، ولا خروج', async () => {
    const h = await teacherPage();
    try {
        await slowProbe(h.page, null);
        const t0 = Date.now();
        await h.page.locator(ach(AHMAD)).click();
        const opened = await h.page.waitForFunction(() => document.getElementById('smartModal').classList.contains('flex'), null, { timeout: 3500 }).then(() => true, () => false);
        const ms = Date.now() - t0;
        await h.page.waitForTimeout(300);
        const st = await modalState(h.page), out = await outState(h.page);
        const probes = await h.page.evaluate(() => window.__probeLog.slice());
        const got = { فُتحت_خلال_3500: opened, العنوان: st.العنوان, signOut: out.signOut, المعلم: out.المعلم, طُلبت_القراءة: probes.length > 0 };
        assert.deepEqual(got, { فُتحت_خلال_3500: true, العنوان: 'أحمد', signOut: 0, المعلم: true, طُلبت_القراءة: true },
            `م34 الظاهر (${opened ? 'فُتحت بعد ' + ms + 'ms' : 'لم تُفتح خلال 3500ms'}): ${JSON.stringify({ ...got, probes })}`);
    } finally { await h.close(); }
});

test('م35 (ف1، الانتظار) أثناء الفحص المؤخَّر 3 ث: زر «الإنجاز» المضغوط aria-busy="true" ومعطّل، ويعود بعد انتهاء الفحص', async () => {
    const h = await teacherPage();
    try {
        await slowProbe(h.page, 3000);
        const btn = sel => h.page.evaluate(sel => { const b = document.querySelector(sel); return b ? { busy: b.getAttribute('aria-busy'), disabled: b.disabled } : 'لا زر'; }, sel);
        await h.page.locator(ach(AHMAD)).click();
        await h.page.waitForTimeout(300);
        const during = await btn(ach(AHMAD));
        const opened = await h.page.waitForFunction(() => document.getElementById('smartModal').classList.contains('flex'), null, { timeout: 6000 }).then(() => true, () => false);
        await h.page.waitForTimeout(200);
        const afterProbe = await btn(ach(AHMAD));
        const got = { أثناء: during, فُتحت: opened, بعد: afterProbe && afterProbe !== 'لا زر' ? { busy: afterProbe.busy === 'true' ? 'true' : 'ليس true', disabled: afterProbe.disabled } : afterProbe };
        assert.deepEqual(got, { أثناء: { busy: 'true', disabled: true }, فُتحت: true, بعد: { busy: 'ليس true', disabled: false } },
            `م35 الظاهر: ${JSON.stringify({ أثناء: during, فُتحت: opened, بعد: afterProbe })}`);
    } finally { await h.close(); }
});

test('م36 (ف1، التخميد؛ حارس أخضر الآن) بعد فحص ناجح لأحمد، «الإنجاز» لسعد خلال التخميد ← نافذة سعد بلا قراءة خادم جديدة، والنافذة لسعد', async () => {
    const h = await teacherPage();
    try {
        await h.page.evaluate(() => { const orig = window.__fb.getDocFromServer; window.__probeLog = []; window.__fb.getDocFromServer = r => { window.__probeLog.push(r.path); return orig(r); }; });
        await h.page.locator(ach(AHMAD)).click();
        await h.page.waitForFunction(() => document.getElementById('smartModal').classList.contains('flex'), null, { timeout: 4000 });
        const first = await modalState(h.page);
        await h.page.evaluate(() => closeSmartModal(true));
        await h.page.waitForTimeout(200);
        await startRecorder(h.page);
        await h.page.locator(ach(SAAD)).click();
        const opened = await h.page.waitForFunction(() => document.getElementById('smartModal').classList.contains('flex'), null, { timeout: 4000 }).then(() => true, () => false);
        await h.page.waitForTimeout(600);
        const st = await modalState(h.page), probes = await h.page.evaluate(() => window.__probeLog.slice()), tr = await trail(h.page);
        const got = { الأولى: first.العنوان, فُتحت: opened, النافذة: { العنوان: st.العنوان, editing: st.editing }, قراءات_الخادم: probes.length, ظهر_أحمد_بعد_سعد: tr.some(x => /أحمد/.test(x)) };
        assert.deepEqual(got, { الأولى: 'أحمد', فُتحت: true, النافذة: { العنوان: 'سعد', editing: SAAD }, قراءات_الخادم: 1, ظهر_أحمد_بعد_سعد: false },
            `م36 الظاهر: ${JSON.stringify({ ...got, probes, tr })}`);
    } finally { await h.close(); }
});

// =====================================================================================
// ف2 (ل14) — شارة اتصال التلفاز عند المشرف (1280)
// =====================================================================================
function badges(page) {
    return page.evaluate(() => {
        const strip = s => String(s || '').replace(/[\u2066-\u2069\u200e\u200f\u061c]/g, '').replace(/\s+/g, ' ').trim();
        const tok = (host, prop, name) => { const p = document.createElement('span'); p.style[prop] = `var(${name})`; (host || document.body).appendChild(p);
            const v = getComputedStyle(p)[prop]; p.remove(); return v; };
        const rectGap = (a, b) => { const dx = Math.max(0, a.left - b.right, b.left - a.right), dy = Math.max(0, a.top - b.bottom, b.top - a.bottom); return Math.round(Math.hypot(dx, dy)); };
        const one = (btn, scope) => {
            if (!btn) return 'لا زر';
            const inside = [...btn.querySelectorAll('.general-tv-status')];
            const cands = scope ? [...(scope.matches?.('.general-tv-status') ? [scope] : []), ...scope.querySelectorAll('.general-tv-status')].filter(e => !btn.contains(e)) : [];
            const b = cands[0];
            const res = { داخل_الزر: inside.length, نص_الزر_فيه_موصول: /موصول/.test(btn.textContent) };
            if (!b) return { ...res, الشارة: 'لا شارة خارج الزر' };
            const cs = getComputedStyle(b), r = b.getBoundingClientRect(), br = btn.getBoundingClientRect();
            const host = b.parentElement;
            return { ...res, الشارة: {
                ظاهرة: b.getClientRects().length > 0 && cs.visibility !== 'hidden' && r.width > 0, النص: strip(b.textContent), role: b.getAttribute('role'),
                حجم: parseFloat(cs.fontSize), وزن: Number(cs.fontWeight), ارتفاع_24: r.height >= 24, حبّية: parseFloat(cs.borderTopLeftRadius) >= r.height / 2 - 1,
                البعد_24: rectGap(r, br) <= 24, color: cs.color, bg: cs.backgroundColor },
                التوكنات: { green100: tok(host, 'backgroundColor', '--green-100'), green900: tok(host, 'color', '--green-900'), bg: tok(host, 'backgroundColor', '--bg'), ink2: tok(host, 'color', '--ink-2') },
                تفاصيل: { ارتفاع: r.height, نصف_القطر: cs.borderTopLeftRadius, البعد: rectGap(r, br) } };
        };
        const tv = document.getElementById('generalTvButton'), st = document.getElementById('generalSettingsTv');
        const next = st?.nextElementSibling && !st.nextElementSibling.classList.contains('panel-card') ? st.nextElementSibling : null;
        return { الشرف: one(tv, tv?.parentElement), الإعدادات: one(st, next) };
    });
}
function judge(raw, connected) {
    const out = {};
    for (const [where, v] of Object.entries(raw)) {
        if (typeof v === 'string' || typeof v.الشارة === 'string') { out[where] = typeof v === 'string' ? v : { داخل_الزر: v.داخل_الزر, نص_الزر_فيه_موصول: v.نص_الزر_فيه_موصول, الشارة: v.الشارة }; continue; }
        const s = v.الشارة, t = v.التوكنات;
        const [wantBg, wantColor] = connected ? [t.green100, t.green900] : [t.bg, t.ink2];
        out[where] = { داخل_الزر: v.داخل_الزر, نص_الزر_فيه_موصول: v.نص_الزر_فيه_موصول, الشارة: { ظاهرة: s.ظاهرة, النص: s.النص, role: s.role, حجم: s.حجم, وزن: s.وزن,
            ارتفاع_24: s.ارتفاع_24, حبّية: s.حبّية, البعد_24: s.البعد_24, خلفية_التوكن: s.bg === wantBg ? 'نعم' : `${s.bg} ≠ ${wantBg}`, لون_التوكن: s.color === wantColor ? 'نعم' : `${s.color} ≠ ${wantColor}` } };
    }
    return out;
}
const wantBadge = text => ({ داخل_الزر: 0, نص_الزر_فيه_موصول: false, الشارة: { ظاهرة: true, النص: text, role: 'status', حجم: 13, وزن: 700, ارتفاع_24: true, حبّية: true, البعد_24: true, خلفية_التوكن: 'نعم', لون_التوكن: 'نعم' } });

test('م37 (ف2، ل14) الشارة عند المشرف (1280) بجانب «📺 شاشة العرض» في لوحة الشرف وبجانب بطاقة «شاشة التلفاز»: عنصر .general-tv-status منفصل عن الزر، role="status"، «التلفاز غير موصول» ثم «التلفاز موصول» بعد hello، بالتوكنات، 13/700، ارتفاع ≥ 24؛ ولا شارة في وضع المعلم', async () => {
    const got = {}, detail = {};
    const a = await adminPage();
    try {
        // الإعدادات: الصفحة ظاهرة لتُقاس البطاقة؛ لوحة الشرف: تُفتح ليظهر زرّها.
        const measure = async () => {
            await a.page.evaluate(() => { const nav = document.querySelector('.nav-btn[onclick*="page-settings"]'); if (nav) switchTab('page-settings', nav); });
            await a.page.waitForTimeout(150);
            const settings = (await badges(a.page)).الإعدادات;
            await a.page.evaluate(() => openHonorBoard());
            await a.page.waitForTimeout(300);
            const honor = (await badges(a.page)).الشرف;
            await a.page.evaluate(() => closeHonorBoard()); await a.page.waitForTimeout(150);
            return { الشرف: honor, الإعدادات: settings };
        };
        const before = await measure();
        detail.قبل = before; got.قبل_hello = judge(before, false);
        await a.page.evaluate(() => { new BroadcastChannel('almahra-tv').postMessage({ type: 'hello' }); });
        for (let i = 0; i < 20; i++) { await sleep(100); if (await a.page.evaluate(() => [...document.querySelectorAll('.general-tv-status')].some(e => /التلفاز موصول/.test(e.textContent) && !/غير/.test(e.textContent)))) break; }
        const after = await measure();
        detail.بعد = after; got.بعد_hello = judge(after, true);
        await a.page.screenshot({ path: path.join(process.env.R4FIX_EVIDENCE || require('node:os').tmpdir(), 'm37-admin-1280.png') }).catch(() => {});
    } finally { await a.close(); }
    const t = await teacherPage();
    try { got.المعلم = await t.page.evaluate(() => document.querySelectorAll('.general-tv-status').length); } finally { await t.close(); }
    assert.deepEqual(got, { قبل_hello: { الشرف: wantBadge('التلفاز غير موصول'), الإعدادات: wantBadge('التلفاز غير موصول') },
        بعد_hello: { الشرف: wantBadge('التلفاز موصول'), الإعدادات: wantBadge('التلفاز موصول') }, المعلم: 0 },
        `م37 الظاهر: ${JSON.stringify(got)} — القياس: ${JSON.stringify(detail)}`);
});

// =====================================================================================
// ن1 — «تأكيد» السلوك يطوي القسم حتى مع التحضير دون الحد، وملخّصه يذكر ذلك
// =====================================================================================
async function setField(page, id, value) {
    const ok = await page.evaluate(([id, value]) => { const el = document.getElementById(id); if (!el) return false;
        el.value = String(value); ['input', 'change'].forEach(t => el.dispatchEvent(new Event(t, { bubbles: true }))); return true; }, [id, value]);
    assert.ok(ok, `الحقل #${id} غير موجود`);
}
async function grade(page, kind, name) {
    const b = page.locator(`#quick_${kind}_grades button`).filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }).first();
    assert.ok(await b.count(), `زر التقدير «${name}» غير موجود`); await b.click();
}
function behaviorState(page) {
    return page.evaluate(() => {
        const strip = s => String(s || '').replace(/[\u2066-\u2069\u200e\u200f\u061c]/g, '').replace(/\s+/g, ' ').trim();
        const s = document.querySelector('#generalQuickSection [data-sec="behavior"]'); if (!s) return 'لا قسم سلوك';
        const t = s.querySelector('.tch-acc-toggle'), b = s.querySelector('.tch-acc-body'), sum = s.querySelector('.tch-acc-sum'), c = s.querySelector('.tch-confirm');
        const line = document.getElementById('quickHomePrepBelow');
        return { مفتوح: t?.getAttribute('aria-expanded') === 'true', الجسم_ظاهر: !!b && b.getClientRects().length > 0, مؤكَّد: c?.getAttribute('aria-pressed') === 'true',
            الملخص: sum && !sum.hidden && sum.getClientRects().length ? strip(sum.textContent) : null,
            السطر: line && !line.hidden && line.getClientRects().length && getComputedStyle(line).visibility !== 'hidden' ? strip(line.textContent) : null };
    });
}
test('م38 (ن1، المعلم) التحضير دون الحد (جديد 4.375 سطراً + مراجعة وجه + «التحضير المنزلي»): «تأكيد» السلوك يطوي القسم وملخّصه يحوي «التحضير المنزلي (دون الحد)»؛ وعند إعادة فتحه السطر الكهرماني ظاهر', async () => {
    const l = H.students(); Object.assign(l[1], { lastSurah: 2, lastAyah: 25 });
    const h = await teacherPage({ list: l });
    try {
        await H.openAch(h, 1);
        await H.openSec(h.page, 'new'); await setField(h.page, 'quick_new_toSurah', 2); await setField(h.page, 'quick_new_toAyah', 26); await grade(h.page, 'new', 'ممتاز'); await H.confirmSec(h.page, 'new');
        await H.openSec(h.page, 'review');
        for (const [id, v] of [['quick_review_fromSurah', 2], ['quick_review_fromAyah', 17], ['quick_review_toSurah', 2], ['quick_review_toAyah', 24]]) await setField(h.page, id, v);
        await grade(h.page, 'review', 'جيد'); await H.confirmSec(h.page, 'review');
        await H.openSec(h.page, 'behavior');
        const home = h.page.locator('#quickDisciplineHome');
        if ((await home.getAttribute('aria-pressed')) !== 'true') await home.click();
        const pre = await behaviorState(h.page);
        await h.page.locator('#generalQuickSection [data-sec="behavior"] .tch-confirm').click();
        await h.page.waitForTimeout(200);
        const confirmed = await behaviorState(h.page);
        await h.page.locator('#generalQuickSection [data-sec="behavior"] .tch-acc-toggle').click();
        await h.page.waitForTimeout(200);
        const reopened = await behaviorState(h.page);
        const got = { قبل_التأكيد_السطر: pre.السطر,
            بعد_التأكيد: { مفتوح: confirmed.مفتوح, الجسم_ظاهر: confirmed.الجسم_ظاهر, مؤكَّد: confirmed.مؤكَّد, الملخص_يذكر: (confirmed.الملخص || '').includes('التحضير المنزلي (دون الحد)') },
            بعد_إعادة_الفتح: { مفتوح: reopened.مفتوح, السطر: reopened.السطر } };
        assert.deepEqual(got, { قبل_التأكيد_السطر: BELOW + ' (الجديد 8 أسطر)', بعد_التأكيد: { مفتوح: false, الجسم_ظاهر: false, مؤكَّد: true, الملخص_يذكر: true },
            بعد_إعادة_الفتح: { مفتوح: true, السطر: BELOW + ' (الجديد 8 أسطر)' } },
            `م38 الظاهر: ${JSON.stringify(got)} — الملخص بعد التأكيد: ${JSON.stringify(confirmed.الملخص)}`);
    } finally { await h.close(); }
});

// =====================================================================================
// ن3 — CSS الميت
// =====================================================================================
test('م39 (ن3) لا قاعدة crit-dim ولا تبديلها ولا الفرع الميت <small class="crit-below"> في صف معايير القائمة في index.html', () => {
    const html = fs.readFileSync(path.join(H.root, 'index.html'), 'utf8');
    const lines = re => html.split(/\r?\n/).map((l, i) => re.test(l) ? i + 1 : 0).filter(Boolean);
    const got = { crit_dim: lines(/crit-dim/), الفرع_الميت: lines(/c\.id === 'homeprep' && isGeneralProgram\(\) \? '<small class="crit-below"/) };
    assert.deepEqual(got, { crit_dim: [], الفرع_الميت: [] }, `م39 الأسطر الباقية في index.html: ${JSON.stringify(got)}`);
});

// =====================================================================================
// أ28 (دفعة إصلاح مراجع الواجهة، teacher-r4-ux-review-out.md القسم ج): م40 (ف1 ترتيب صندوق «سُجّل اليوم») وم41 (ف2 «(دون الحد)» لا ينكسر)
// افتراضات (تُلزم الباني): • م40: الصندوق #quickTodayBox وأول span فيه نصّ «سُجّل اليوم: …» والمقاطع مفصولة بـ« · »؛ الجديد قبل المراجعة دائماً
//   (كالفرز في teacherCardLines)، والنوع الواحد بترتيبه المخزَّن. المفاتيح a_review ثم b_new: المراجعة أولاً بترتيب الإدراج وبالترتيب الأبجدي
//   (Firestore الحقيقي يعيد مفاتيح الخريطة مرتّبة أبجدياً)، فلا يخضرّ الاختبار بالمصادفة.
// • م41: داخل .tch-acc-sum لقسم السلوك (لا الملخص نفسه) عنصر واحد white-space المحسوب له nowrap، نصّه «التحضير المنزلي (دون الحد)» بالضبط؛
//   والقاعدة .nowrap القائمة محصورة في .tch-sheet-panel (index.html:623)، فالصنف وحده بلا قاعدة تشمل النافذة لا يكفي.
// =====================================================================================
test('م40 (ف1، صندوق «سُجّل اليوم») تسجيلا اليوم مخزّنان المراجعة أولاً ثم الجديد ← الصندوق يذكر الجديد أولاً: «سُجّل اليوم: جديد … · مراجعة …»', async () => {
    const l = H.students();
    l[1].history = { [H.TODAY]: { attended: true, hijri: 'وهمي', entries: {
        a_review: { kind: 'review', grade: 'good', spec: { from: [2, 17], to: [2, 24] }, rep: 1, points: 2, at: 1, by: H.TEACHER_USER.uid, heardBy: 't1' },
        b_new: { kind: 'new', grade: 'excellent', spec: { from: [2, 6], to: [2, 10] }, rep: 1, points: 3, at: 2, by: H.TEACHER_USER.uid, heardBy: 't1' } } } };
    const h = await teacherPage({ list: l });
    try {
        const stored = await h.page.evaluate(today => Object.values(students.find(s => String(s.id) === '1')?.history?.[today]?.entries || {}).map(e => e.kind), H.TODAY);
        await H.openAch(h, 1);
        await h.page.locator('#quickTodayBox').waitFor({ state: 'visible', timeout: 4000 });
        const text = norm(await h.page.locator('#quickTodayBox span').first().textContent());
        const segs = text.replace(/^سُجّل اليوم:\s*/, '').split(' · ').map(s => s.split(' ')[0]);
        const got = { المخزَّن: stored, يبدأ_بجديد: text.startsWith('سُجّل اليوم: جديد'), الأنواع_بالترتيب: segs };
        assert.deepEqual(got, { المخزَّن: ['review', 'new'], يبدأ_بجديد: true, الأنواع_بالترتيب: ['جديد', 'مراجعة'] },
            `م40 الظاهر: ${JSON.stringify(text)} — ${JSON.stringify(got)}`);
    } finally { await h.close(); }
});

test('م41 (ف2، ملخص السلوك المطوي) «التحضير المنزلي (دون الحد)» في عنصر واحد white-space: nowrap داخل الملخص، والنص الكامل كما هو', async () => {
    const l = H.students(); Object.assign(l[1], { lastSurah: 2, lastAyah: 25 });
    const h = await teacherPage({ list: l });
    try {
        await H.openAch(h, 1);
        await H.openSec(h.page, 'new'); await setField(h.page, 'quick_new_toSurah', 2); await setField(h.page, 'quick_new_toAyah', 26); await grade(h.page, 'new', 'ممتاز'); await H.confirmSec(h.page, 'new');
        await H.openSec(h.page, 'review');
        for (const [id, v] of [['quick_review_fromSurah', 2], ['quick_review_fromAyah', 17], ['quick_review_toSurah', 2], ['quick_review_toAyah', 24]]) await setField(h.page, id, v);
        await grade(h.page, 'review', 'جيد'); await H.confirmSec(h.page, 'review');
        await H.openSec(h.page, 'behavior');
        const home = h.page.locator('#quickDisciplineHome');
        if ((await home.getAttribute('aria-pressed')) !== 'true') await home.click();
        await h.page.locator('#generalQuickSection [data-sec="behavior"] .tch-confirm').click();
        await h.page.waitForTimeout(200);
        const m = await h.page.evaluate(() => {
            const strip = s => String(s || '').replace(/[⁦-⁩‎‏؜]/g, '').replace(/\s+/g, ' ').trim();
            const sum = document.querySelector('#generalQuickSection [data-sec="behavior"] .tch-acc-sum');
            if (!sum || sum.hidden || !sum.getClientRects().length) return { ملخص: null };
            const nw = [...sum.querySelectorAll('*')].filter(e => getComputedStyle(e).whiteSpace === 'nowrap' || getComputedStyle(e).textWrapMode === 'nowrap');
            return { ملخص: strip(sum.textContent), html: sum.innerHTML, الملخص_نفسه_nowrap: getComputedStyle(sum).whiteSpace === 'nowrap',
                nowrap: nw.map(e => ({ نص: strip(e.textContent), أسطر: e.getClientRects().length })) };
        });
        const got = { النص_الكامل: /^\d+ استثناءات · التحضير المنزلي \(دون الحد\)$/.test(m.ملخص || ''), الملخص_نفسه_nowrap: !!m.الملخص_نفسه_nowrap,
            عناصر_nowrap: (m.nowrap || []).map(x => x.نص), في_سطر_واحد: (m.nowrap || []).every(x => x.أسطر === 1) };
        assert.deepEqual(got, { النص_الكامل: true, الملخص_نفسه_nowrap: false, عناصر_nowrap: ['التحضير المنزلي (دون الحد)'], في_سطر_واحد: true },
            `م41 الظاهر: ${JSON.stringify(got)} — الملخص: ${JSON.stringify(m.ملخص)} — HTML: ${JSON.stringify(m.html)}`);
    } finally { await h.close(); }
});
