// اختبارات قبول الجزء ٣ من «الفرسان في مكان واحد» (البطاقة: D:/المهره/notes/features/knights/one-place-card.md): ف5 وف9. حمراء قبل البناء.
const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { cloud, runtime, key } = require('./helpers/knights-r2b-harness.cjs');
const { harness: quick, student, copy, source, html, QuranMeasure, generalEntryPoints } = require('./helpers/quick-entry-harness.cjs');
const { newPage } = require('./helpers/t25-browser.cjs');
const hp = require('./rules/homeprep-answer-key.json');
const rows = server => copy(Object.values(server.season().weekKnightsLog || {}));
let browser;
before(async () => {
    const playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); });

test('ف5: in general, refreeze is refused at both the page and the store with zero writes; the frozen row and local state stay; a non-general program is not short-circuited by the general refusal', async () => {
    const server = cloud(); server.season().knightsLog = [];
    const h = runtime(server); await h.frozen();
    const before = rows(server), writes = server.state.writes.length, local = copy(h.run('[...weekKnightsState.entries()]'));
    const page = await h.call('unfreezeHalaqaWeek', key.days[0], 'a', 'تصحيح ورقة سعد');
    assert.equal(page.success, false); assert.match(String(page.error || ''), /الحسم نهائي/);
    const stores = h.ctx.window.almahraPrograms;
    const row = before.find(r => r.halaqaId === 'a');
    const direct = await stores.refreezeWeekKnightsRow('general', 's1', row, row.v, 'سبب مباشر', 'fake-admin');
    assert.equal(direct.success, false); assert.match(String(direct.error || ''), /الحسم نهائي/);
    assert.equal(server.state.writes.length, writes, 'صفر كتابات');
    assert.deepEqual(rows(server), before, 'السطر المجمَّد كما هو');
    assert.deepEqual(copy(h.run('[...weekKnightsState.entries()]')), local, 'الحالة المحلية كما هي');
    // برنامج آخر لا يمر برفض general: يصل إلى مسار المخزن الأصلي (يفشل هنا لغياب السطر، لا بـ«الحسم نهائي»)
    const other = await stores.refreezeWeekKnightsRow('summer', 's1', row, row.v, 'سبب', 'fake-admin');
    assert.doesNotMatch(String(other.error || ''), /الحسم نهائي/);
    assert.ok(!source('renderWeekKnightsReview').includes('unfreezeHalaqaWeek'), 'لا استدعاء من الجدول');
});

function entry(kind, page, grade) {
    const spec = copy(hp.pages[page]);
    const measured = QuranMeasure.measure({ spec });
    const score = generalEntryPoints({ lines: measured.lines, kind, gradeId: grade, settings: hp.settings });
    return { kind, grade, spec, iv: measured.intervals, mult: score.mult, points: score.points, rep: 1, at: 1, by: 'fake-admin' };
}
function pure(minGrade) {
    const h = quick();
    Object.assign(h.state.settings, copy(hp.settings));
    if (minGrade === undefined) delete h.state.settings.homePrepMinGrade; else h.state.settings.homePrepMinGrade = minGrade;
    return (saved, sections) => { h.ctx.saved = saved; h.ctx.sections = sections; return h.run('homePrepQualifies(saved, sections, getProgramSettings())'); };
}

test('ف9: home-prep minimum grade is a setting: absent = «جيد» accepts a good recitation; «جيد جداً» rejects it; «ممتاز» rejects very-good; repeat never qualifies', () => {
    const good = entry('new', 5, 'good'), veryGood = entry('new', 6, 'very-good'), excellent = entry('review', 4, 'excellent');
    assert.ok(!html.includes('const HOMEPREP_MIN_PERCENT = 75;'), 'لا رقم ثابت 75 في الكود');
    const q0 = pure(undefined);
    assert.equal(q0([], [good]), true, 'الافتراضي جيد: تسميع جيد يستوفي');
    assert.equal(q0([good], [veryGood]), true);
    assert.equal(q0([], [{ ...good, grade: 'repeat' }]), false);
    const q1 = pure('very-good');
    assert.equal(q1([], [good]), false, 'جيد جداً: جيد لا يستوفي');
    assert.equal(q1([], [veryGood]), true);
    assert.equal(q1([veryGood], [good]), false, 'كل أقسام اليوم');
    const q2 = pure('excellent');
    assert.equal(q2([], [veryGood]), false); assert.equal(q2([], [excellent]), true);
});

test('ف9ب: the rejection message names the chosen grade; the settings row carries the select; saving stores homePrepMinGrade and the TV/points of earlier saved days do not change', async () => {
    const h = await newPage(browser, { width: 1280, today: key.days[1] });
    try {
        await h.page.evaluate(() => {
            window.almahraPrograms.updateSettings = async (id, settings) => {
                window.__fixture.programs[id].settings = settings;
                window.__fixture.writes.push({ id, settings: structuredClone(settings) });
                return { success: true };
            };
            window.almahraPrograms.getAllStudents = async () => window.__fixture.list;
            window.almahraData.getStudents = () => window.__fixture.list;
            goHome('page-settings'); openSettingsSection('setPanelPoints');
        });
        const sel = h.page.locator('#setPanelPoints #psHomePrepMinGrade');
        assert.equal(await sel.count(), 1, 'قائمة أقل تقدير في سطر التحضير');
        assert.equal(await sel.inputValue(), 'good', 'الافتراضي جيد');
        assert.deepEqual(await sel.locator('option').allTextContents(), ['جيد', 'جيد جداً', 'ممتاز']);
        await sel.selectOption('very-good');
        const before = await h.page.evaluate(() => window.__fixture.writes.length);
        await h.page.evaluate(async () => { await saveProgramSettings(); });
        await h.page.waitForFunction(n => window.__fixture.writes.length > n, before);
        const saved = await h.page.evaluate(() => window.__fixture.writes.filter(w => w.settings).at(-1).settings);
        assert.equal(saved.homePrepMinGrade, 'very-good');
        const msg = await h.page.evaluate(() => { const s = document.documentElement.outerHTML; return s.includes('التحضير المنزلي يحتاج تسميعاً بتقدير جيد جداً فأعلى') ? 'static' : 'dynamic'; });
        assert.equal(msg, 'dynamic', 'رسالة الرفض ليست نصاً ثابتاً');
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
    const h2 = quick(); Object.assign(h2.state.settings, copy(hp.settings)); h2.state.settings.homePrepMinGrade = 'very-good';
    h2.ctx.saved = []; h2.ctx.sections = [entry('new', 5, 'good')];
    assert.equal(h2.run('homePrepQualifies(saved, sections, getProgramSettings())'), false);
    const text = h2.run('typeof homePrepRejectionMessage === "function" ? homePrepRejectionMessage(getProgramSettings()) : ""');
    assert.match(text, /جيد جداً/, 'الرسالة تذكر التقدير المختار');
    h2.state.settings.homePrepMinGrade = 'excellent';
    assert.match(h2.run('homePrepRejectionMessage(getProgramSettings())'), /ممتاز/);
});

test('ف9ج: changing the home-prep minimum grade has no retroactive effect on saved days (points and homeprep criterion unchanged)', () => {
    const h = quick(); Object.assign(h.state.settings, copy(hp.settings)); delete h.state.settings.homePrepMinGrade;
    h.install('summarizeRange');
    const day = { attended: true, entries: { e0: entry('new', 5, 'good') }, criteria: { homeprep: 10 }, criteriaPoints: 10 };
    h.ctx.fixtureStudent = { id: 9, name: 'طالب', halaqaId: 'a', history: { [hp.days[0]]: copy(day) } };
    h.ctx.fixtureDates = [hp.days[0]];
    const before = copy(h.run('summarizeRange(fixtureStudent, fixtureDates)'));
    h.state.settings.homePrepMinGrade = 'excellent';
    const after = copy(h.run('summarizeRange(fixtureStudent, fixtureDates)'));
    assert.deepEqual(after, before, 'يوم محفوظ لا يتغير بتغيير الإعداد');
    assert.equal(h.ctx.fixtureStudent.history[hp.days[0]].criteria.homeprep, 10);
});

test('ف9د: with the setting absent (= «جيد»), the real save path stores a good-graded recitation with home prep +10; with «جيد جداً» the same save is refused with no write', async () => {
    const run = async minGrade => {
        const h = quick(student({}, { id: 1, sid: 'p3-1', name: 'طالب', halaqaId: 'a', lastSurah: 2, lastAyah: 24, history: {} })); Object.assign(h.state.settings, copy(hp.settings));
        if (minGrade) h.state.settings.homePrepMinGrade = minGrade; else delete h.state.settings.homePrepMinGrade;
        Object.assign(h.ctx.window.almahraData, { isReady: () => true, getActiveProgramId: () => 'general', getActiveSeasonId: () => 's1' });
        h.run('generalTv.enabled = false');
        h.run('currentEditingStudentId = students[0].id; initGeneralQuickEntry(students[0], todayStr);'); // إعادة الفتح بعد ضبط الإعدادات حتى تُرسم التقديرات منها
        h.range('new', null, [2, 29]); h.grade('new', 'good');
        h.run("toggleGeneralOptIn(document.getElementById('generalHomePrepBtn'))");
        const preview = h.preview();
        const writes = h.state.writes.length; await h.save(); // يضغط ثانية عند تذكير المراجعة كما في المسار الحقيقي
        return { errors: preview.errors.map(e => e.message), wrote: h.state.writes.length > writes, fields: h.state.writes.at(-1)?.fields || {} };
    };
    const absent = await run(undefined);
    assert.deepEqual(absent.errors, [], 'بلا إعداد: لا خطأ');
    assert.equal(absent.wrote, true, 'حُفظ');
    const prepKey = Object.keys(absent.fields).find(k => k.endsWith('.criteria'));
    assert.ok(prepKey, 'حقل المعايير في الحفظ');
    assert.equal(absent.fields[prepKey].homeprep, 10, '+10');
    assert.equal(absent.fields[prepKey.replace(/.criteria$/, '.criteriaPoints')], 10, 'نقاط الانضباط 10');
    const strict = await run('very-good');
    assert.ok(strict.errors.some(m => /جيد جداً/.test(m)), 'جيد جداً: رسالة الرفض بالتقدير');
    assert.equal(strict.wrote, false, 'لا كتابة');
});
