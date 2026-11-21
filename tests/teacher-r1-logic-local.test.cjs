// بطاقة حسابات المعلمين، الجولة 1 «منطق بلا شكل» — اختبار القبول الأحمر لـق82 (ر2) وق86 (ر4) وق87 (ر5) وق92 (ر6)، 2026-11-18، كاتب اختبار أ10.
// المرجع: D:\المهره\notes\features\accounts\teacher-accounts-card.md (ق82، ق86، ق87، ق92، ق93) والأمر fast-track-prompts/teacher-r1-red-prompt.md.
// ر1 (ق77) في tests/teacher-ui-local.test.cjs (ح15–ح20 معادة الكتابة) وtests/new-paused-local.test.cjs (ت8)؛ ر3 (ق85) في tests/surah-search-local.test.cjs.
// الطريقة: Playwright فوق tests/helpers/teacher-ui-harness.cjs (فايربيس وهمي) كما teacher-ui-local؛ لا توسيع للهاركنس (الطلاب والإعدادات تُزرع بـseed القائم).
//
// افتراضات الاختبار فيما لم تسمّه البطاقة (تُذكر في التقرير ليقرّها Fable):
//   • ر2: المعيار السالب يحمل opposes: [معرّفات] اختيارياً؛ غيابه = الافتراضي late→early، misbehave→manners، disturb→manners؛ opposes: [] = لا يحجب شيئاً.
//     «محجوب» = خانة .crit-box[data-cid] غير معلَّمة وdisabled. «استوفى المعايير» لا يلغي السالب المعلَّم (يعلّم الإيجابية غير المحجوبة فقط).
//     محرّر المعايير: صف .crit-row[data-kind=negative] في #psCriteriaNegative نصّه يحوي «يحجب:» وأسماء أضداده.
//   • ر4: «الشاشة ظاهرة» = #page-records نشطة ومعها #recPanelMain، و#page-settings نشطة ومعها #setPanelStudents. الفحص بالأثر: لا تغيير في
//     #reportsTableBody/#dailyTimelineTableBody/#executiveAttendanceDashboard/#settingsStudentsList (MutationObserver) والشاشة غير ظاهرة،
//     وعند إظهارها يكون الناتج = ناتج استدعاء الدالة مباشرة. الزمن = مدة saveGeneralQuickEntry + مدة كل updateAllUIs بعدها خلال 1.5 ث (الأقل من 3 حفظات).
//   • ر6 (أ26، الجولة 4 ل0: نُقل من «الحضور المبكر» إلى «التحضير المنزلي»): حدّا المرحلة في settings.stages[i].homePrepMin = { newLines, reviewPages }؛
//     غيابه = الافتراضي بمعرّف المرحلة (primary 8/1، middle 15/2، غيرهما بلا شرط). التسجيل يُبقي «التحضير المنزلي» معلَّماً: criteria.homeprep = 10 إن بلغ
//     مجموع اليوم الحد و0 إن لم يبلغ، وcriteriaPoints = مجموع قيم criteria. سطر «التحضير المنزلي: دون الحد اليومي (…)» تحت زر التحضير.
//     الأسطر = أسطر QuranMeasure لكل تسجيل (بلا «يُعاد»)، والمراجعة ≥ reviewPages × 15 سطراً. «الحضور المبكر» بلا شرط (ر6-0).
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs');
const H = require('./helpers/teacher-ui-harness.cjs');
const { source } = require('./helpers/quick-entry-harness.cjs');

const html = H.read('index.html').replaceAll('\r\n', '\n');
const TODAY = H.TODAY;   // 2026-11-22
const S = id => 'programs/general/seasons/s1/students/' + id;
const EVIDENCE = 'D:/المهره/notes/design-v1/verify/teacher-r1-2026-11-18/red/';
let browser;
before(async () => {
    const playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); });

// ===== أدوات (على نمط teacher-ui-local وnew-paused-local) =====
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function diagnose(h) {
    const st = await h.page.evaluate(() => ({ toast: document.getElementById('toastText')?.innerText || '', role: window.almahraAuth?.currentRole || null })).catch(e => ({ evalError: e.message }));
    const log = await h.fbLog().catch(() => []);
    return `الحال=${JSON.stringify(st)} أخطاء الصفحة=${JSON.stringify(h.errors.slice(0, 3))} آخر عمليات السحابة=${log.slice(-5).map(l => l.op + ':' + (l.path || (l.writes || []).map(w => w.type + ' ' + w.path).join(',')) + (l.result ? '=' + l.result : '')).join(' | ')}`;
}
function list(mods = {}, extra = {}) {
    const l = H.students();
    for (const [id, m] of Object.entries(mods)) Object.assign(l[id], m);
    return { ...l, ...extra };
}
async function teacherPage(seed = {}) {
    const h = await H.openPage(browser, { user: H.TEACHER_USER, seed: { teacherUser: true, ...seed } });
    await h.page.locator('#teacherHome').waitFor({ state: 'attached', timeout: 8000 }).catch(async () => assert.fail('صفحة المعلم لم تُفتح. ' + await diagnose(h)));
    return h;
}
async function adminPage(seed = {}, size = { width: 1280, height: 900 }) {
    const h = await H.openPage(browser, { user: H.ADMIN_USER, seed, ...size });
    await h.page.waitForFunction(() => window.almahraPrograms?.getCurrentProgramId?.() === 'general' && window.almahraData?.isReady?.(), null, { timeout: 15000 });
    await h.page.locator('#loadingOverlay').waitFor({ state: 'hidden' }).catch(() => {});
    return h;
}
const modalOpen = page => page.evaluate(() => document.getElementById('smartModal').classList.contains('flex'));
async function closeQuick(h) {
    if (!await modalOpen(h.page)) return;
    await h.page.evaluate(() => closeSmartModal(true));
    await h.page.waitForFunction(() => !document.getElementById('smartModal')?.classList.contains('flex'), null, { timeout: 3000 });
}
// يفتح نافذة الإنجاز: المعلم من بطاقته، والمشرف بـopenSmartModal القائمة.
// أ14 (ق101 س2): بأداة الهاركنس الواحدة (أقسام v7 للمعلم تُنتظر، والمشرف كما كان).
async function openQuick(h, id, role) {
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
// التقدير بالاسم حرفياً (لا «جيد» داخل «جيد جداً»).
async function grade(page, kind, name) {
    const b = page.locator(`#quick_${kind}_grades button`).filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }).first();
    assert.ok(await b.count(), `زر التقدير «${name}» غير موجود في #quick_${kind}_grades`);
    await b.click();
}
// أ14: عند المعلم «الإدخال» = فتح القسم + الحقول + «تأكيد» (ق98-1: ما لم يُؤكَّد لا يُحفظ)؛ عند المشرف التبويب كما كان ولا تأكيد.
async function newTo(page, toSurah, toAyah, g = 'ممتاز') {
    await H.openSec(page, 'new');
    await setField(page, 'quick_new_toSurah', toSurah); await setField(page, 'quick_new_toAyah', toAyah); await grade(page, 'new', g);
    await H.confirmSec(page, 'new');
}
async function review(page, from, to, g = 'ممتاز') {
    await H.openSec(page, 'review');
    for (const [id, v] of [['quick_review_fromSurah', from[0]], ['quick_review_fromAyah', from[1]], ['quick_review_toSurah', to[0]], ['quick_review_toAyah', to[1]]]) await setField(page, id, v);
    await grade(page, 'review', g);
    await H.confirmSec(page, 'review');
}
async function openExceptions(page) {
    await H.openSec(page, 'behavior');   // أ14: «استثناءات» داخل قسم السلوك عند المعلم (ق84 مستوعَب في ق90)
    if (await page.evaluate(() => document.getElementById('generalCriteriaHost')?.hidden !== false)) await page.locator('#generalCriteriaExceptions').click();
}
const box = (page, cid) => page.locator(`#generalCriteriaHost .crit-box[data-cid="${cid}"]`);
async function boxState(page, cid) {
    return page.evaluate(cid => { const b = document.querySelector(`#generalCriteriaHost .crit-box[data-cid="${cid}"]`); return b ? { checked: b.checked, disabled: b.disabled } : null; }, cid);
}
async function setBox(page, cid, on) {
    await openExceptions(page);
    const s = await boxState(page, cid);
    assert.ok(s, `خانة المعيار ${cid} غير موجودة`);
    if (s.checked !== on) await box(page, cid).click();
    assert.equal((await boxState(page, cid)).checked, on, `خانة ${cid} لم تصر ${on ? 'معلَّمة' : 'غير معلَّمة'}`);
}
const selection = page => page.evaluate(() => getCriteriaSelection());
// الحفظ: زر الحفظ، ثم تأكيد المعلم «حفظ» أو تذكير المشرف إن ظهر، حتى يزيد عدد تسجيلات اليوم أو تتغيّر المعايير.
async function save(h, id) {
    const day = async () => (await h.doc(S(id)))?.history?.[TODAY] || {};
    const before = JSON.stringify(await day());
    await H.confirmBehavior(h.page);   // أ14: المعايير الملموسة تُحفظ مؤكَّدة عند المعلم (ق98-1/-4)
    await h.page.evaluate(() => typeof updateGeneralQuickPreview === 'function' && updateGeneralQuickPreview());
    await h.page.locator('#generalQuickSaveBtn').click();
    for (let i = 0; i < 30; i++) {
        await sleep(150);
        if (JSON.stringify(await day()) !== before) { await sleep(300); return day(); }
        // أ14 (ق78): تأكيد القسم الواحد عند المعلم صار ورقة .tch-sheet؛ زرّها الثاني «احفظ … فقط» = «حفظ» في الشريط الأصفر الملغى.
        const only = h.page.locator('.tch-sheet button').filter({ hasText: /^\s*احفظ (الجديد|المراجعة) فقط\s*$/ }).filter({ visible: true });
        if (await only.count()) { await only.first().click(); continue; }
        if (await h.page.evaluate(() => !document.getElementById('generalQuickReviewReminder')?.hidden)) {
            await h.page.evaluate(() => typeof updateGeneralQuickPreview === 'function' && updateGeneralQuickPreview());
            await h.page.locator('#generalQuickSaveBtn').click();
        }
    }
    assert.fail(`الحفظ للطالب ${id} لم يكتب. ${await diagnose(h)}`);
}
const entriesPoints = day => Math.round(Object.values(day.entries || {}).reduce((s, e) => s + (Number(e.points) || 0), 0) * 10) / 10;
const dayNumbers = day => ({ criteria: day.criteria || {}, criteriaPoints: day.criteriaPoints, entriesPoints: entriesPoints(day) });

// =====================================================================================
// ر2 (ق82) تضادّ المعايير — للمعلم والمشرف معاً
// =====================================================================================
for (const role of ['teacher', 'admin']) {
    test(`ر2-1 (ق82، ${role === 'teacher' ? 'المعلم' : 'المشرف'}) تعليم «تأخر» يلغي «الحضور المبكر» ويعطّله؛ إلغاؤه يعيده متاحاً غير معلَّم`, async () => {
        const h = role === 'teacher' ? await teacherPage() : await adminPage();
        try {
            await openQuick(h, 1, role);
            await setBox(h.page, 'early', true);
            await setBox(h.page, 'late', true);
            assert.deepEqual(await boxState(h.page, 'early'), { checked: false, disabled: true }, '«الحضور المبكر» بعد تعليم «تأخر»: [معلَّم، معطّل]');
            assert.deepEqual(await selection(h.page), { late: -5 }, 'الاختيار بعد تعليم «تأخر» ليس السالب وحده');
            await setBox(h.page, 'late', false);
            assert.deepEqual(await boxState(h.page, 'early'), { checked: false, disabled: false }, '«الحضور المبكر» بعد إلغاء «تأخر»: يعود متاحاً غير معلَّم');
            assert.deepEqual(await selection(h.page), {}, 'الاختيار بعد الإلغاء');
        } finally { await h.close(); }
    });
}

test('ر2-2 (ق82، المعلم) «مخالفة الأدب» و«إزعاج» كلٌّ منهما يحجب «حسن الخلق والأدب»؛ يبقى محجوباً ما بقي أحدهما؛ والمعايير الأخرى لا تتأثر', async () => {
    const h = await teacherPage();
    try {
        await openQuick(h, 1, 'teacher');
        await setBox(h.page, 'manners', true); await setBox(h.page, 'uniform', true);
        await setBox(h.page, 'misbehave', true);
        assert.deepEqual(await boxState(h.page, 'manners'), { checked: false, disabled: true }, '«حسن الخلق» بعد «مخالفة الأدب»');
        await setBox(h.page, 'disturb', true);
        await setBox(h.page, 'misbehave', false);
        assert.deepEqual(await boxState(h.page, 'manners'), { checked: false, disabled: true }, '«حسن الخلق» و«إزعاج» ما زال معلَّماً');
        assert.deepEqual([await boxState(h.page, 'uniform'), await boxState(h.page, 'early')], [{ checked: true, disabled: false }, { checked: false, disabled: false }], 'معيار غير مضادّ تأثر');
        await setBox(h.page, 'disturb', false);
        assert.deepEqual(await boxState(h.page, 'manners'), { checked: false, disabled: false }, '«حسن الخلق» بعد إلغاء السالبين');
    } finally { await h.close(); }
});

// أحمد بموضع البقرة 100 ليبلغ حدّ الابتدائي (ر6) فلا يتداخل الشرطان: جديد البقرة 101–102 (11.28 سطراً) ومراجعة البقرة 1–16 (21 سطراً).
const AHMAD_100 = { 1: { lastSurah: 2, lastAyah: 100 } };
for (const role of ['teacher', 'admin']) {
    test(`ر2-3 (ق82، ${role === 'teacher' ? 'المعلم' : 'المشرف'}) «استوفى المعايير» و«مخالفة الأدب» معلَّمة ← تُعلَّم الإيجابية غير المحجوبة وحدها وتبقى المخالفة؛ والتسجيل: الخريطة بلا «حسن الخلق» والنقاط = 5+3+3+2−10 = 3`, async () => {
        const h = role === 'teacher' ? await teacherPage({ list: list(AHMAD_100) }) : await adminPage({ list: list(AHMAD_100) });
        try {
            await openQuick(h, 1, role);
            await newTo(h.page, 2, 102); await review(h.page, [2, 1], [2, 16]);
            await setBox(h.page, 'misbehave', true);
            await h.page.locator(role === 'teacher' ? '#quickDisciplineAll' : '#generalCriteriaAllBtn').click();
            assert.deepEqual(await selection(h.page), { early: 5, uniform: 3, engage: 3, neat: 2, misbehave: -10 }, 'الاختيار بعد «استوفى المعايير» مع «مخالفة الأدب»');
            assert.deepEqual(await boxState(h.page, 'manners'), { checked: false, disabled: true }, '«حسن الخلق» ليس محجوباً');
            const day = await save(h, 1);
            assert.deepEqual({ criteria: day.criteria, criteriaPoints: day.criteriaPoints }, { criteria: { early: 5, uniform: 3, engage: 3, neat: 2, misbehave: -10 }, criteriaPoints: 3 }, 'المحفوظ في التسجيل');
        } finally { await h.close(); }
    });
}

test('ر2-4 (ق82، المشرف) «النقاط = السالب فقط»: «الحضور المبكر» ثم «تأخر» ← التسجيل { late: −5 } والنقاط −5', async () => {
    const h = await adminPage({ list: list(AHMAD_100) });
    try {
        await openQuick(h, 1, 'admin');
        await newTo(h.page, 2, 102); await review(h.page, [2, 1], [2, 16]);
        await setBox(h.page, 'early', true); await setBox(h.page, 'late', true);
        const day = await save(h, 1);
        assert.deepEqual({ criteria: day.criteria, criteriaPoints: day.criteriaPoints }, { criteria: { late: -5 }, criteriaPoints: -5 }, 'المحفوظ');
    } finally { await h.close(); }
});

test('ر2-5 (ق82) الحقل opposes في الإعدادات يُحترم إن وُجد: late.opposes = [manners] يحجب حسن الخلق لا المبكر، misbehave.opposes = [] لا يحجب شيئاً، disturb بلا الحقل = الافتراضي', async () => {
    const criteria = H.PROGRAM_DEFS.general.defaultSettings.criteria.map(c => c.id === 'late' ? { ...c, opposes: ['manners'] } : c.id === 'misbehave' ? { ...c, opposes: [] } : { ...c });
    const h = await adminPage({ settingsExtra: { criteria } });
    try {
        await openQuick(h, 1, 'admin');
        await setBox(h.page, 'early', true); await setBox(h.page, 'manners', true);
        await setBox(h.page, 'misbehave', true);
        assert.deepEqual([await boxState(h.page, 'early'), await boxState(h.page, 'manners')], [{ checked: true, disabled: false }, { checked: true, disabled: false }], 'misbehave بـopposes فارغة حجب شيئاً');
        await setBox(h.page, 'late', true);
        assert.deepEqual([await boxState(h.page, 'early'), await boxState(h.page, 'manners')], [{ checked: true, disabled: false }, { checked: false, disabled: true }], 'late بـopposes = [manners]: [المبكر، حسن الخلق]');
        await setBox(h.page, 'late', false); await setBox(h.page, 'misbehave', false);
        await setBox(h.page, 'manners', true); await setBox(h.page, 'disturb', true);
        assert.deepEqual(await boxState(h.page, 'manners'), { checked: false, disabled: true }, 'disturb بلا الحقل لم يأخذ الافتراضي');
    } finally { await h.close(); }
});

test('ر2-6 (ق82، بنيوي) محرّر المعايير عند المشرف: صف كل سالب يعرض «يحجب: …» بأسماء أضداده (الافتراضي)، ولا يعرضه صف إيجابي', async () => {
    const h = await adminPage();
    try {
        await h.page.evaluate(() => { switchTab('page-settings', document.querySelector('.nav-btn')); openSettingsSection('setPanelPoints'); });
        await h.page.locator('#psCriteriaNegative .crit-row').first().waitFor({ state: 'attached', timeout: 4000 });
        const rows = await h.page.evaluate(() => [...document.querySelectorAll('#psCriteriaPositive .crit-row, #psCriteriaNegative .crit-row')]
            .map(r => ({ cid: r.dataset.cid, kind: r.dataset.kind, text: (r.innerText || r.textContent).replace(/\s+/g, ' ') + ' ' + [...r.querySelectorAll('option:checked, input:checked')].map(o => o.closest('label')?.innerText || o.textContent || '').join(' ') })));
        const neg = Object.fromEntries(rows.filter(r => r.kind === 'negative').map(r => [r.cid, r.text]));
        const want = { late: 'الحضور المبكر', misbehave: 'حسن الخلق والأدب', disturb: 'حسن الخلق والأدب' };
        const bad = Object.entries(want).filter(([cid, name]) => !(neg[cid] || '').includes('يحجب') || !(neg[cid] || '').includes(name)).map(([cid]) => `${cid}: «${(neg[cid] || 'لا صف').slice(0, 120)}»`);
        assert.deepEqual(bad, [], 'صفوف سالبة بلا «يحجب: …» أو بلا اسم الضدّ');
        assert.deepEqual(rows.filter(r => r.kind === 'positive' && r.text.includes('يحجب')).map(r => r.cid), [], 'صف إيجابي يعرض «يحجب»');
    } finally { await h.close(); }
});

// =====================================================================================
// ر4 (ق86) سرعة الحفظ: كتابة الـHTML مرة واحدة، ولا رسم للشاشتين غير الظاهرتين، والناتج مطابق نصاً للمرجع
// =====================================================================================
const R4_DAYS = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18'];
function hundred() {
    const l = H.students();
    for (let i = 9; i <= 100; i++) {
        const history = {};
        for (const d of R4_DAYS) history[d] = { attended: true, hijri: 'وهمي ' + d, entries: { ['e' + i + d.replaceAll('-', '')]: { kind: 'review', grade: 'good', spec: { from: [1, 1], to: [1, 7] }, iv: [[0, 6]], rep: 1, points: 3.5, mult: 1, at: 1, by: 'admin-uid', heardBy: 't1' } } };
        l[i] = H.makeStudent(i, 'طالب ' + i, i % 2 ? 'a1' : 'm1', { history });
    }
    return l;
}
// المرجع: ناتج الكود الحالي (82415c9، index.html cd5ab5c0…) على هذه البيانات والشاشتان ظاهرتان؛ النص الكامل في مجلد الأدلة r4-reference-*.html.
const R4_REFERENCE = {
    reportsTableBody: '1113d6e9e21f549ba5f8a7ebc724149d1d0275d869c45701191c21804bfbd58d',
    dailyTimelineTableBody: '5dfcc5047390dcaebf4d261dc4d41ca595c97afec5e346807d4cdbb06dc405c3',
    executiveAttendanceDashboard: '40367278fb5ea8b5b2b19ed4cb6e06dbce4898a1aa9131eefb84f4799b4ca331',
    settingsStudentsList: 'f1d04a84e7c78d2550d3c48a70a85c1843ad1f7766f002f077b991a2fa90201c'
};
const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
async function showRecords(page) { await page.evaluate(() => { switchTab('page-records', document.querySelector('.nav-btn')); openRecordsSection('recPanelMain'); }); }
async function showSettingsStudents(page) { await page.evaluate(() => { switchTab('page-settings', document.querySelector('.nav-btn')); openSettingsSection('setPanelStudents'); }); }
async function r4Snapshot(page) {
    await showRecords(page);
    const a = await page.evaluate(() => { renderReportsTable(); return Object.fromEntries(['reportsTableBody', 'dailyTimelineTableBody', 'executiveAttendanceDashboard'].map(id => [id, document.getElementById(id).innerHTML])); });
    await showSettingsStudents(page);
    const b = await page.evaluate(() => { renderSettingsStudents(); return { settingsStudentsList: document.getElementById('settingsStudentsList').innerHTML }; });
    return { ...a, ...b };
}

test('ر4-1 (ق86، بنيوي) renderReportsTable وrenderSettingsStudents تكتبان الـHTML مرة واحدة: لا innerHTML += ولا insertAdjacentHTML فيهما', () => {
    const bad = [];
    for (const name of ['renderReportsTable', 'renderSettingsStudents']) {
        const src = source(name, html);
        const plus = (src.match(/\.innerHTML\s*\+=/g) || []).length, adj = (src.match(/insertAdjacentHTML/g) || []).length;
        if (plus || adj) bad.push(`${name}: innerHTML += ×${plus}، insertAdjacentHTML ×${adj}`);
    }
    assert.deepEqual(bad, [], 'كتابة صفاً صفاً');
});

test('ر4-2 (ق86) الحفظ والشاشتان غير ظاهرتين (الرئيسية): لا تغيير في جدول التقارير ولا قائمة طلاب الإعدادات؛ وعند إظهار كلٍّ منهما ناتجها = ناتج الدالة الآن', async () => {
    const h = await adminPage({ list: hundred() });
    try {
        assert.deepEqual(await h.page.evaluate(() => [...document.querySelectorAll('.tab-content.active')].map(e => e.id)), ['page-home'], 'الشرط المسبق: الرئيسية هي الظاهرة');
        await h.page.evaluate(() => {
            window.__r4m = {};
            for (const id of ['reportsTableBody', 'dailyTimelineTableBody', 'executiveAttendanceDashboard', 'settingsStudentsList']) {
                window.__r4m[id] = 0;
                new MutationObserver(list => { window.__r4m[id] += list.length; }).observe(document.getElementById(id), { childList: true, subtree: true, characterData: true, attributes: true });
            }
        });
        await openQuick(h, 1, 'admin');
        await newTo(h.page, 2, 10); await review(h.page, [1, 1], [1, 7]);
        await save(h, 1);
        await sleep(1500);
        const mutations = await h.page.evaluate(() => window.__r4m);
        assert.deepEqual(mutations, { reportsTableBody: 0, dailyTimelineTableBody: 0, executiveAttendanceDashboard: 0, settingsStudentsList: 0 }, 'رُسمت شاشة غير ظاهرة مع الحفظ (عدد التغييرات)');
        await showRecords(h.page); await sleep(300);
        const shown = await h.page.evaluate(() => document.getElementById('reportsTableBody').innerHTML);
        const fresh = await h.page.evaluate(() => { renderReportsTable(); return document.getElementById('reportsTableBody').innerHTML; });
        assert.ok(shown.length > 0 && shown === fresh, 'جدول التقارير عند إظهاره ليس محدَّثاً (≠ ناتج renderReportsTable الآن)');
        await showSettingsStudents(h.page); await sleep(300);
        const shownS = await h.page.evaluate(() => document.getElementById('settingsStudentsList').innerHTML);
        const freshS = await h.page.evaluate(() => { renderSettingsStudents(); return document.getElementById('settingsStudentsList').innerHTML; });
        assert.ok(shownS.length > 0 && shownS === freshS, 'قائمة طلاب الإعدادات عند إظهارها ليست محدَّثة');
    } finally { await h.close(); }
});

test('ر4-3 (ق86) زمن الحفظ على 100 طالب في الهاركنس أقل من 300ms (الحفظ + كل updateAllUIs بعده خلال 1.5 ث؛ الأقل من ثلاث حفظات)', async () => {
    const h = await adminPage({ list: hundred() });
    try {
        await h.page.evaluate(() => {
            const original = updateAllUIs;
            window.__uiTimes = [];
            window.updateAllUIs = function (...args) { const t0 = performance.now(); try { return original.apply(this, args); } finally { window.__uiTimes.push([t0, performance.now() - t0]); } };
        });
        const times = [];
        for (const id of [1, 5, 9]) {
            await openQuick(h, id, 'admin');
            await newTo(h.page, 2, 10); await review(h.page, [1, 1], [1, 7]);
            await h.page.evaluate(() => updateGeneralQuickPreview());
            const t = await h.page.evaluate(async () => {
                window.__uiTimes = [];
                const t0 = performance.now(); await saveGeneralQuickEntry(); const end = performance.now();
                await new Promise(r => setTimeout(r, 1500));
                return { save: end - t0, after: window.__uiTimes.filter(([s]) => s >= end).reduce((a, [, d]) => a + d, 0), wrote: !document.getElementById('smartModal').classList.contains('flex') };
            });
            assert.equal(t.wrote, true, `الحفظ ${id} لم يكتمل`);
            times.push(Math.round(t.save + t.after));
        }
        assert.ok(Math.min(...times) < 300, `زمن الحفظ على 100 طالب (ms) للحفظات الثلاث: ${times.join('، ')}`);
    } finally { await h.close(); }
});

test('ر4-4 (ق86) الـHTML الناتج للشاشتين ظاهرتين مطابق نصاً للمرجع المأخوذ من الكود الحالي (82415c9)', async () => {
    const h = await adminPage({ list: hundred() });
    try {
        const snap = await r4Snapshot(h.page);
        const bad = [];
        for (const [id, want] of Object.entries(R4_REFERENCE)) {
            if (sha(snap[id]) === want) continue;
            let at = '';
            try { const ref = fs.readFileSync(EVIDENCE + 'r4-reference-' + id + '.html', 'utf8'); let i = 0; while (i < ref.length && ref[i] === snap[id][i]) i++; at = ` أول اختلاف عند ${i}: «${snap[id].slice(i, i + 60)}» بدل «${ref.slice(i, i + 60)}»`; } catch (_) {}
            bad.push(`${id}: ${sha(snap[id]).slice(0, 12)} ≠ ${want.slice(0, 12)} (طول ${snap[id].length})${at}`);
        }
        assert.deepEqual(bad, [], 'الـHTML تغيّر عن المرجع');
    } finally { await h.close(); }
});

// =====================================================================================
// ر5 (ق87) بحث الطالب عند المشرف: Enter يفتح المطابق تماماً بين عدة نتائج
// =====================================================================================
const R5_LIST = () => list({}, { 11: H.makeStudent(11, 'علي احمد الجبيري', 'a1'), 40: H.makeStudent(40, 'علي احمد الجبيري الثاني', 'a1'), 53: H.makeStudent(53, 'محمد علي احمد الجبيري', 'm1') });
async function searchEnter(h, text) {
    await closeQuick(h);
    await h.page.evaluate(() => switchTab('page-students', document.querySelector('.nav-btn')));
    await h.page.locator('#generalStudentSearchInput').fill(text);
    await h.page.locator('#generalStudentSearchInput').press('Enter');
    await sleep(500);
    return h.page.evaluate(() => ({ open: document.getElementById('smartModal').classList.contains('flex'), id: currentEditingStudentId,
        rows: [...document.querySelectorAll('.gs-card')].filter(e => e.getClientRects().length).length }));
}
test('ر5 (ق87) ثلاث نتائج إحداها مطابقة تماماً للمكتوب ← Enter يفتحها؛ بلا مطابقة تامة ← لا شيء كما اليوم؛ ونتيجة واحدة ← تُفتح كما اليوم', async () => {
    const h = await adminPage({ list: R5_LIST() });
    try {
        const exact = await searchEnter(h, 'علي احمد الجبيري');
        assert.equal(exact.rows, 3, 'الشرط المسبق: ثلاث نتائج');
        assert.deepEqual([exact.open, exact.id], [true, 11], 'Enter مع مطابقة تامة بين ثلاث لم يفتح الطالب 11');
        const none = await searchEnter(h, 'علي احمد');
        assert.equal(none.rows, 3, 'الشرط المسبق: ثلاث نتائج بلا مطابقة تامة');
        assert.equal(none.open, false, 'Enter بلا مطابقة تامة فتح طالباً (السلوك الحالي: لا شيء)');
        const one = await searchEnter(h, 'الثاني');
        assert.deepEqual([one.rows, one.open, one.id], [1, true, 40], 'نتيجة واحدة لم تُفتح كما اليوم');
    } finally { await h.close(); }
});

// =====================================================================================
// ر6 (ق92 ← ل0، الجولة 4، أ26) الحد اليومي لكل مرحلة انتقل من «الحضور المبكر» إلى «التحضير المنزلي» (البطاقة teacher-r4-card.md ل0)
// نُقلت ر6-1…ر6-12 بلا إضعاف: الحدّان، التسجيلان، المتوقف (الساري والمنتهي)، «يُعاد»، تغيير الإعداد، التراجع، جدول الإعدادات، والقرّاء؛
// الاسم stage.homePrepMin والعنوان «الحد اليومي للتحضير المنزلي»؛ وسطر «التحضير المنزلي: دون الحد اليومي (…)» تحت زر التحضير
// (#quickDisciplineHome عند المعلم، #generalHomePrepBtn عند المشرف). ور6-0 (م8): «الحضور المبكر» بلا شرط.
// الأسطر (QuranMeasure): البقرة 101 = 2.78، 102 = 8.5، 101–102 = 11.28؛ مراجعة البقرة 1–16 = 21، الفاتحة 1–7 = 7؛ البقرة 77–83 = 15 (14.999999999999998)،
// 77–82 = 10.75، مراجعة البقرة 6–24 = 30. الحد: الابتدائي جديد ≥ 8 ومراجعة ≥ 15؛ المتوسط جديد ≥ 15 ومراجعة ≥ 30.
// التقديرات «ممتاز» (≥ «جيد» الافتراضي) فلا يتدخل شرط التقدير المانع إلا في ر6-4 حيث يُضبط homePrepMinGrade = «يُعاد» ليُعزل الحد وحده.
// =====================================================================================
const R6 = {
    reached: { homeprep: 10 }, below: { homeprep: 0 },
    ahmad: list({ 1: { lastSurah: 2, lastAyah: 100 } }),
    omar: list({ 6: { lastSurah: 2, lastAyah: 76 } })
};
const R6_BELOW = 'التحضير المنزلي: دون الحد اليومي';
// زر «التحضير المنزلي»: المعلم من الاختصار في قسم السلوك، والمشرف من 🏠.
async function setPrep(page, on = true) {
    const teacher = await page.evaluate(() => document.body.classList.contains('teacher-mode'));
    if (teacher) await H.openSec(page, 'behavior');
    const b = page.locator(teacher ? '#quickDisciplineHome' : '#generalHomePrepBtn');
    assert.ok(await b.count(), 'زر «التحضير المنزلي» غير موجود');
    if ((await b.getAttribute('aria-pressed')) !== String(on)) await b.click();
    assert.equal(await b.getAttribute('aria-pressed'), String(on), 'زر «التحضير المنزلي» لم يتبدّل');
}
// «ظاهر» = في النص المرئي (innerText)؛ يعيد [معلَّم، نص سطر «دون الحد» أو null].
async function prepRow(page) {
    return page.evaluate(B => {
        const strip = s => String(s || '').replace(/[⁦-⁩‎‏؜]/g, '').replace(/\s+/g, ' ').trim();
        updateGeneralQuickPreview();
        const teacher = document.body.classList.contains('teacher-mode');
        const btn = document.getElementById(teacher ? 'quickDisciplineHome' : 'generalHomePrepBtn');
        const line = [...document.querySelectorAll('#generalQuickSection *')].find(e => e.getClientRects().length && strip(e.innerText).startsWith(B) && ![...e.children].some(c => strip(c.innerText).startsWith(B)));
        return { pressed: btn?.getAttribute('aria-pressed') === 'true', below: line ? strip(line.innerText) : null };
    }, R6_BELOW);
}
const total = page => page.evaluate(() => { updateGeneralQuickPreview(); return document.getElementById('generalQuickTotal').innerText.trim(); });

test('ر6-0 (ل0 (هـ)، م8، المعلم) «الحضور المبكر» بلا شرط: البقرة 101 (2.78 سطراً) بلا مراجعة ← early = 5 كاملة، ولا «دون الحد اليومي» في صفه', async () => {
    const h = await teacherPage({ list: R6.ahmad });
    try {
        await openQuick(h, 1, 'teacher');
        await newTo(h.page, 2, 101);
        await setBox(h.page, 'early', true);
        const row = await h.page.evaluate(() => { const b = document.querySelector('#generalCriteriaHost .crit-box[data-cid="early"]'); const scope = b.closest('label') || b.parentElement;
            return { checked: b.checked, below: [scope, scope.parentElement].some(el => (el.innerText || '').includes('دون الحد اليومي')) }; });
        const day = await save(h, 1);
        assert.deepEqual({ row, early: day.criteria?.early, criteriaPoints: day.criteriaPoints }, { row: { checked: true, below: false }, early: 5, criteriaPoints: 5 }, '«الحضور المبكر» دون أي حد');
    } finally { await h.close(); }
});

for (const role of ['admin', 'teacher']) {
    test(`ر6-1 (ق92←ل0، ${role === 'teacher' ? 'المعلم' : 'المشرف'}) الابتدائي دون حد الجديد: البقرة 101 (2.78 سطراً) + مراجعة 21 سطراً ← «التحضير المنزلي» معلَّم بسطر «(الجديد 8 أسطر)»، لا نقاط له (المجموع 29.3)، والتسجيل homeprep = 0`, async () => {
        const h = role === 'teacher' ? await teacherPage({ list: R6.ahmad }) : await adminPage({ list: R6.ahmad });
        try {
            await openQuick(h, 1, role);
            await newTo(h.page, 2, 101); await review(h.page, [2, 1], [2, 16]);
            await setPrep(h.page, true);
            assert.deepEqual(await prepRow(h.page), { pressed: true, below: R6_BELOW + ' (الجديد 8 أسطر)' }, 'زر «التحضير المنزلي» دون الحد: [معلَّم، السطر]');
            assert.equal(await total(h.page), '29.3', 'المجموع المعروض يحسب «التحضير المنزلي» دون الحد (8.3 + 21)');
            const day = await save(h, 1);
            assert.deepEqual(dayNumbers(day), { criteria: R6.below, criteriaPoints: 0, entriesPoints: 29.3 }, 'المحفوظ');
        } finally { await h.close(); }
    });
}

test('ر6-2 (ق92←ل0، المعلم) الابتدائي دون حد المراجعة: جديد 11.28 سطراً + الفاتحة 1–7 (7 أسطر < 15) ← homeprep = 0 بسطر «(المراجعة وجه)»', async () => {
    const h = await teacherPage({ list: R6.ahmad });
    try {
        await openQuick(h, 1, 'teacher');
        await newTo(h.page, 2, 102); await review(h.page, [1, 1], [1, 7]);
        await setPrep(h.page, true);
        assert.equal((await prepRow(h.page)).below, R6_BELOW + ' (المراجعة وجه)', 'سطر «دون الحد» للمراجعة');
        const day = await save(h, 1);
        assert.deepEqual(dayNumbers(day), { criteria: R6.below, criteriaPoints: 0, entriesPoints: 40.8 }, 'المحفوظ (33.8 + 7)');
    } finally { await h.close(); }
});

test('ر6-3 (ق92←ل0، المعلم) تسجيلان في اليوم نفسه: الأول دون الحد (2.78 + مراجعة 21) ← homeprep = 0؛ الثاني البقرة 102 (8.5) يبلغ المجموع 11.28 ← homeprep = 10 والنقاط +10، ولا يُعاد كتابة التسجيل الأول', async () => {
    const h = await teacherPage({ list: R6.ahmad });
    try {
        await openQuick(h, 1, 'teacher');
        await newTo(h.page, 2, 101); await review(h.page, [2, 1], [2, 16]);
        await setPrep(h.page, true);
        const first = await save(h, 1);
        assert.deepEqual(dayNumbers(first), { criteria: R6.below, criteriaPoints: 0, entriesPoints: 29.3 }, 'التسجيل الأول');
        const firstEntries = JSON.stringify(first.entries);
        await openQuick(h, 1, 'teacher');
        assert.equal((await prepRow(h.page)).pressed, true, '«التحضير المنزلي» المعلَّم لم يبقَ معلَّماً عند الفتح الثاني');
        await newTo(h.page, 2, 102);
        assert.equal((await prepRow(h.page)).below, null, 'ما زال «دون الحد اليومي» والمجموع مع التسجيل الحالي يبلغ الحد');
        const second = await save(h, 1);
        assert.deepEqual({ criteria: second.criteria, criteriaPoints: second.criteriaPoints, entriesPoints: entriesPoints(second) }, { criteria: R6.reached, criteriaPoints: 10, entriesPoints: 54.8 }, 'بعد التسجيل الثاني (29.3 + 25.5)');
        const kept = Object.fromEntries(Object.entries(second.entries).filter(([k]) => Object.hasOwn(first.entries, k)));
        assert.equal(JSON.stringify(kept), firstEntries, 'تسجيلات الأول تغيّرت');
    } finally { await h.close(); }
});

test('ر6-4 (ق92←ل0، المشرف) «يُعاد» لا يُحسب في الحد: جديد 11.28 سطراً بتقدير «يُعاد» + مراجعة 21 ← homeprep = 0 (أقل تقدير للتحضير = «يُعاد» ليُعزل الحد عن شرط التقدير المانع)', async () => {
    const h = await adminPage({ list: R6.ahmad, settingsExtra: { homePrepMinGrade: 'repeat' } });
    try {
        await openQuick(h, 1, 'admin');
        await newTo(h.page, 2, 102, 'يُعاد'); await review(h.page, [2, 1], [2, 16]);
        await setPrep(h.page, true);
        assert.equal((await prepRow(h.page)).below, R6_BELOW + ' (الجديد 8 أسطر)', '«يُعاد» عُدّ في الحد');
        const day = await save(h, 1);
        assert.deepEqual(dayNumbers(day), { criteria: R6.below, criteriaPoints: 0, entriesPoints: 21 }, 'المحفوظ (0 + 21)');
    } finally { await h.close(); }
});

test('ر6-5 (ق92←ل0، المعلم) طالب «متوقف عن الجديد» سارٍ معفى من شرط الجديد: مراجعة 21 سطراً وحدها ← homeprep = 10 (حارس: أخضر الآن)', async () => {
    const h = await teacherPage({ list: list({ 1: { lastSurah: 2, lastAyah: 100, newPaused: [{ reason: 'exam', from: '2026-11-18', to: null }] } }) });
    try {
        await openQuick(h, 1, 'teacher');
        await review(h.page, [2, 1], [2, 16]);
        await setPrep(h.page, true);
        assert.equal((await prepRow(h.page)).below, null, '«دون الحد اليومي» ظاهر لمتوقف بلغ حد المراجعة');
        const day = await save(h, 1);
        assert.deepEqual(dayNumbers(day), { criteria: R6.reached, criteriaPoints: 10, entriesPoints: 21 }, 'المحفوظ');
    } finally { await h.close(); }
});

test('ر6-6 (ق92←ل0، المشرف) المتوسط 15/2: البقرة 77–83 (15 سطراً بالضبط، 14.999999999999998 بالفاصلة) + مراجعة 30 ← homeprep = 10؛ والبقرة 77–82 (10.75) + 30 ← homeprep = 0 بسطر «(الجديد 15 سطراً)»', async () => {
    const h = await adminPage({ list: R6.omar });
    try {
        await openQuick(h, 6, 'admin');
        await newTo(h.page, 2, 82); await review(h.page, [2, 6], [2, 24]);
        await setPrep(h.page, true);
        assert.equal((await prepRow(h.page)).below, R6_BELOW + ' (الجديد 15 سطراً)', '10.75 سطراً للمتوسط: سطر «دون الحد اليومي»');
        await newTo(h.page, 2, 83);
        assert.equal((await prepRow(h.page)).below, null, '15 سطراً بالضبط للمتوسط تُعدّ دون الحد (خطأ الفاصلة)');
        const day = await save(h, 6);
        assert.deepEqual(dayNumbers(day), { criteria: R6.reached, criteriaPoints: 10, entriesPoints: 75 }, 'المحفوظ (45 + 30)');
    } finally { await h.close(); }
    const b = await adminPage({ list: R6.omar });
    try {
        await openQuick(b, 6, 'admin');
        await newTo(b.page, 2, 82); await review(b.page, [2, 6], [2, 24]);
        await setPrep(b.page, true);
        const day = await save(b, 6);
        assert.deepEqual(dayNumbers(day), { criteria: R6.below, criteriaPoints: 0, entriesPoints: 62.3 }, 'المحفوظ (32.3 + 30)');
    } finally { await b.close(); }
});

test('ر6-7 (ق92←ل0، المشرف) حراس أخضر الآن: الابتدائي بالغ الحد (11.28 + 21) ← homeprep = 10؛ والثانوي (مرحلة بلا قيم) بمراجعة 7 أسطر وحدها ← homeprep = 10', async () => {
    const h = await adminPage({ list: R6.ahmad });
    try {
        await openQuick(h, 1, 'admin');
        await newTo(h.page, 2, 102); await review(h.page, [2, 1], [2, 16]);
        await setPrep(h.page, true);
        assert.equal((await prepRow(h.page)).below, null, '«دون الحد اليومي» لطالب بلغ الحد');
        const day = await save(h, 1);
        assert.deepEqual(dayNumbers(day), { criteria: R6.reached, criteriaPoints: 10, entriesPoints: 54.8 }, 'الابتدائي (33.8 + 21)');
        await openQuick(h, 8, 'admin');
        await review(h.page, [1, 1], [1, 7]);
        await setPrep(h.page, true);
        assert.equal((await prepRow(h.page)).below, null, '«دون الحد اليومي» لمرحلة بلا قيم');
        const sec = await save(h, 8);
        assert.deepEqual(dayNumbers(sec), { criteria: R6.reached, criteriaPoints: 10, entriesPoints: 7 }, 'الثانوي');
    } finally { await h.close(); }
});

const stagesWith = (stageId, homePrepMin) => H.settings().stages.map(s => s.id === stageId ? { ...s, homePrepMin } : { ...s });
test('ر6-8 (ق92←ل0، المشرف) تغيير الإعداد يغيّر النتيجة: الابتدائي homePrepMin { newLines: 2, reviewPages: 1 } ← 2.78 + 21 يبلغ (homeprep = 10)؛ و{ newLines: 8, reviewPages: 2 } ← 11.28 + 21 لا يبلغ (homeprep = 0)', async () => {
    const a = await adminPage({ list: R6.ahmad, settingsExtra: { stages: stagesWith('primary', { newLines: 2, reviewPages: 1 }) } });
    try {
        await openQuick(a, 1, 'admin');
        await newTo(a.page, 2, 101); await review(a.page, [2, 1], [2, 16]);
        await setPrep(a.page, true);
        const day = await save(a, 1);
        assert.deepEqual(dayNumbers(day), { criteria: R6.reached, criteriaPoints: 10, entriesPoints: 29.3 }, 'بالحد المخفَّض');
    } finally { await a.close(); }
    const b = await adminPage({ list: R6.ahmad, settingsExtra: { stages: stagesWith('primary', { newLines: 8, reviewPages: 2 }) } });
    try {
        await openQuick(b, 1, 'admin');
        await newTo(b.page, 2, 102); await review(b.page, [2, 1], [2, 16]);
        await setPrep(b.page, true);
        const day = await save(b, 1);
        assert.deepEqual(dayNumbers(day), { criteria: R6.below, criteriaPoints: 0, entriesPoints: 54.8 }, 'بحد المراجعة صفحتين (21 < 30)');
    } finally { await b.close(); }
});

test('ر6-9 (ق92/ق93-3←ل0 (ز)، بنيوي) إعدادات المشرف: جدول «الحد اليومي للتحضير المنزلي» صف لكل مرحلة بخانتين (جديد أسطر، مراجعة صفحات) بالافتراضي 8/1، 15/2، وفارغ للثانوي؛ ولا جدول «الحد اليومي للحضور المبكر»', async () => {
    const h = await adminPage();
    try {
        await h.page.evaluate(() => { switchTab('page-settings', document.querySelector('.nav-btn')); });
        await sleep(300);
        const read = title => h.page.evaluate(title => {
            const t = [...document.querySelectorAll('#page-settings *')].find(e => e.children.length === 0 && (e.textContent || '').includes(title));
            if (!t) return null;
            let box = t.parentElement;
            while (box && box.querySelectorAll('input[type=number]').length < 2) box = box.parentElement;
            const rowOf = name => { const label = [...box.querySelectorAll('*')].find(e => e.children.length === 0 && (e.textContent || '').trim() === name); let r = label?.parentElement; while (r && r.querySelectorAll('input[type=number]').length < 2) r = r.parentElement; return r ? [...r.querySelectorAll('input[type=number]')].slice(0, 2).map(i => i.value) : null; };
            return { ابتدائي: rowOf('ابتدائي'), متوسط: rowOf('متوسط'), ثانوي: rowOf('ثانوي') };
        }, title);
        assert.deepEqual({ الجديد: await read('الحد اليومي للتحضير المنزلي'), القديم: await read('الحد اليومي للحضور المبكر') },
            { الجديد: { ابتدائي: ['8', '1'], متوسط: ['15', '2'], ثانوي: ['', ''] }, القديم: null }, 'جدول الحد اليومي في إعدادات البرنامج العام');
    } finally { await h.close(); }
});

// =====================================================================================
// أ12 (2026-11-18) ← أ26: ف1–ف3 لـق92 منقولة إلى «التحضير المنزلي» (ل0 (و): التراجع يعيد التقييم على الباقي).
// =====================================================================================
const R6_DAY = async (h, id) => (await h.doc(S(id)))?.history?.[TODAY] || {};
// تراجع واحد: من #teacherToast إن كانت ظاهرة، وإلا من #quickTodayBox بعد فتح نافذة الطالب؛ ينتظر حتى ينقص عدد تسجيلات اليوم.
async function undoOnce(h, id) {
    const before = Object.keys((await R6_DAY(h, id)).entries || {}).length;
    const toastBtn = h.page.locator('#teacherToast button').filter({ hasText: 'تراجع' });
    if (await toastBtn.count() && await toastBtn.first().isVisible()) await toastBtn.first().click();
    else {
        await openQuick(h, id, 'teacher');
        await h.page.locator('#quickTodayBox button').filter({ hasText: 'تراجع' }).first().click();
    }
    for (let i = 0; i < 30; i++) {
        await sleep(150);
        if (Object.keys((await R6_DAY(h, id)).entries || {}).length < before) { await sleep(300); return R6_DAY(h, id); }
    }
    assert.fail(`التراجع للطالب ${id} لم يحذف تسجيلاً. ${await diagnose(h)}`);
}
test('ر6-10 (ق92/ف1←ل0 (و)، المعلم) التراجع يعيد تقييم الحد على الباقي: تسجيلان بلغا الحد (homeprep = 10) ← تراجع عن الثاني (البقرة 102) ← homeprep = 0 والنقاط بلا 10؛ والتراجعات التالية لا تعيده 10 حتى لا يبقى تسجيل', async () => {
    const h = await teacherPage({ list: R6.ahmad });
    try {
        await openQuick(h, 1, 'teacher');
        await newTo(h.page, 2, 101); await review(h.page, [2, 1], [2, 16]);
        await setPrep(h.page, true);
        await save(h, 1);
        // الساعة في الهاركنس ثابتة؛ التسجيل الثاني بعد دقيقة كما في الواقع، فيكون هو «الأخير» الذي يتراجع عنه.
        await h.page.evaluate(() => { const t = Date.now() + 60000; Date.now = () => t; });
        await openQuick(h, 1, 'teacher');
        await newTo(h.page, 2, 102);
        const reached = await save(h, 1);
        assert.deepEqual(dayNumbers(reached), { criteria: R6.reached, criteriaPoints: 10, entriesPoints: 54.8 }, 'الشرط المسبق: بلغ الحد بالتسجيلين');
        await closeQuick(h);
        const afterFirst = await undoOnce(h, 1);
        assert.deepEqual(dayNumbers(afterFirst), { criteria: R6.below, criteriaPoints: 0, entriesPoints: 29.3 }, 'بعد التراجع عن البقرة 102 (الباقي 2.78 + 21 دون الحد)');
        await closeQuick(h);
        const afterSecond = await undoOnce(h, 1);
        assert.deepEqual(dayNumbers(afterSecond), { criteria: R6.below, criteriaPoints: 0, entriesPoints: 8.3 }, 'بعد التراجع الثاني (الباقي البقرة 101 وحدها)');
        await closeQuick(h);
        const afterThird = await undoOnce(h, 1);
        assert.deepEqual([Object.keys(afterThird.entries || {}).length, afterThird.criteria?.homeprep ?? 0, afterThird.criteriaPoints ?? 0], [0, 0, 0], 'بعد التراجع الثالث: [تسجيلات، homeprep، النقاط]');
    } finally { await h.close(); }
});

test('ر6-11 (ق92/ف2←ل0، المشرف) «متوقف عن الجديد» منتهٍ (آخر عنصر to ≠ null) لا يُعفى من شرط الجديد: مراجعة 21 سطراً بلا جديد ← homeprep = 0؛ والساري (to = null) يُعفى ← homeprep = 10', async () => {
    for (const [pause, want, what] of [[[{ reason: 'exam', from: '2026-11-10', to: '2026-11-15' }], R6.below, 'المنتهي'], [[{ reason: 'exam', from: '2026-11-18', to: null }], R6.reached, 'الساري']]) {
        const h = await adminPage({ list: list({ 1: { lastSurah: 2, lastAyah: 100, newPaused: pause } }) });
        try {
            await openQuick(h, 1, 'admin');
            await review(h.page, [2, 1], [2, 16]);
            await setPrep(h.page, true);
            const day = await save(h, 1);
            assert.deepEqual(dayNumbers(day), { criteria: want, criteriaPoints: want.homeprep, entriesPoints: 21 }, `${what}: المحفوظ`);
        } finally { await h.close(); }
    }
});

test('ر6-12 (ق92/ف3←ل0) القرّاء الذين يعدّون المعايير المستوفاة (buildAchievementText: نص الإنجاز ورسالة فارس الانضباط) لا يعدّون homeprep = 0 مستوفى (ولا early = 0 المخزّن في أيام قديمة)', async () => {
    const h = await adminPage();
    try {
        const texts = await h.page.evaluate(() => ({
            below: buildAchievementText({ sard: 0, points: 3, criteriaPoints: 3, criteria: { homeprep: 0, early: 0, uniform: 3 } }),
            reached: buildAchievementText({ sard: 0, points: 18, criteriaPoints: 18, criteria: { homeprep: 10, early: 5, uniform: 3 } }),
            belowDiscipline: buildAchievementText({ disciplineOnly: true, sard: 0, points: 3, criteriaPoints: 3, criteria: { homeprep: 0, early: 0, uniform: 3 } }),
            reachedDiscipline: buildAchievementText({ disciplineOnly: true, sard: 0, points: 18, criteriaPoints: 18, criteria: { homeprep: 10, early: 5, uniform: 3 } }) }));
        const has = (t, name) => t.includes(name);
        assert.deepEqual(Object.fromEntries(Object.entries(texts).map(([k, t]) => [k, [has(t, 'الالتزام بالزي الرسمي'), has(t, 'التحضير المنزلي'), has(t, 'الحضور المبكر')]])),
            { below: [true, false, false], reached: [false, false, false], belowDiscipline: [true, false, false], reachedDiscipline: [true, true, true] },
            `[الزي، التحضير المنزلي، الحضور المبكر] في النصوص: ${JSON.stringify(texts)}`);
    } finally { await h.close(); }
});
