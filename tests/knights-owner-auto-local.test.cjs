const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { newPage, root } = require('./helpers/t25-browser.cjs');
const { cloud, runtime, key } = require('./helpers/knights-r2b-harness.cjs');
const { harness: pure, fixtures, entry } = require('./helpers/knights-r2-harness.cjs');
const { copy, source } = require('./helpers/quick-entry-harness.cjs');
let browser;
before(async () => {
    const playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); });
const open = (options = {}) => newPage(browser, { width: 1280, today: key.days[1], list: fixtures(), settings: key.settings, ...options });
const tick = () => new Promise(resolve => setImmediate(resolve));
const rows = server => copy(Object.values(server.season().weekKnightsLog || {}));
const report = h => h.install('summarizeRange', 'dayHasAnyViolation', 'dayMeetsDisciplineCriteria', 'getDisciplineCriteriaIds');
function tv(h, date = key.days[1]) {
    h.run('let honorKnightsLog = []');
    h.ctx.getBoardDate = () => date;
    h.ctx.getBoardWeekRange = () => ({ startStr: key.days[0], endStr: key.days[3] });
    h.ctx.getWorkingDatesInRange = () => key.days;
    h.ctx.getGeneralTvBoard = h.ctx.getHomePrepWeek = h.ctx.getMostImproved = () => [];
    const sent = [];
    h.ctx.generalTvReady = () => true; h.ctx.generalTvContext = () => 'general:s1';
    h.ctx.postGeneralTv = snapshot => sent.push(copy(snapshot));
    h.run('generalTv.enabled = true');
    return sent;
}
function sender(h) {
    h.install('sendGeneralWeeklyMessage', 'getGeneralSchoolDates');
    h.ctx.getGeneralMessageWeek = () => ({ startStr: key.days[0], endStr: key.days[3] });
    h.ctx.quranMeta = { surahs: { references: [] } };
    h.ctx.programBrandName = () => 'المهرة'; h.ctx.normalizeSaudiPhone = () => '966500000000';
}
async function correction() {
    const server = cloud(); server.season().knightsLog = [];
    const h = runtime(server); await h.frozen();
    const old = copy(rows(server).find(r => r.halaqaId === 'a'));
    const saad = server.docs.get('programs/general/seasons/s1/students/2');
    saad.history[key.days[3]] = copy(server.docs.get('programs/general/seasons/s1/students/1').history[key.days[0]]);
    return { server, h, old };
}

test('ق1: general hides the knights card and entire panel, including forced display and direct open', async () => {
    const h = await open();
    try {
        await h.page.evaluate(() => { goHome('page-settings'); openSettingsSection('setPanelKnights'); });
        assert.equal(await h.page.locator('[onclick="openSettingsSection(\'setPanelKnights\')"]').isVisible(), false);
        assert.equal(await h.page.locator('#setPanelKnights').isVisible(), false);
        assert.equal(await h.page.locator('#setPanelKnights.active').count(), 0);
        assert.equal(await h.page.locator('#generalKnightsPanel').count(), 0);
        await h.page.evaluate(() => { document.getElementById('setPanelKnights').style.display = 'block'; });
        assert.equal(await h.page.locator('#setPanelKnights').isVisible(), false);
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

test('ق2: approve and launch reject general without writes or local changes', async () => {
    const h = await open();
    try {
        const result = await h.page.evaluate(async () => {
            let writes = 0;
            window.almahraPrograms.saveKnightsEntry = async () => { writes++; return { success: true }; };
            const before = JSON.stringify([honorKnightsLog, currentThreeKnights]);
            // Seed the removed panel only when testing the pre-change implementation.
            if (document.getElementById('generalKnightsPanel')) {
                document.getElementById('generalKnightsHalaqa').value = 'h:b';
                document.getElementById('generalKnightsDate').value = '2026-11-24';
                renderGeneralKnightsPanel(true);
                document.getElementById('generalKnightsChoice1').value = '7';
                document.getElementById('generalKnightsReason').value = 'تصحيح';
            }
            return { approved: await approveGeneralHalaqaKnights(), launched: await launchThreeKnights(), writes,
                same: before === JSON.stringify([honorKnightsLog, currentThreeKnights]) };
        });
        assert.equal(result.approved, false); assert.equal(result.launched, false);
        assert.equal(result.writes, 0); assert.equal(result.same, true);
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

test('ق3: weekly count and joinedOn live in the general knights panel with review/refreeze/announcement', async () => {
    const h = await open();
    try {
        await h.page.evaluate(() => { goHome('page-settings'); openSettingsSection('setPanelGeneralKnights'); });
        await h.page.click('#setPanelGeneralKnights #gkSettings summary');
        assert.equal(await h.page.locator('#psKnights_a').count(), 1);
        assert.equal(await h.page.locator('#setPanelGeneralKnights #gkSettings #psKnights_a').isVisible(), true);
        assert.match(await h.page.locator('#setPanelGeneralKnights #gkSettings').innerText(), /عدد فرسان الأسبوع لكل حلقة.*1–5/);
        const server = cloud(), r = runtime(server); await r.frozen(); await r.call('renderWeekKnightsReview');
        assert.match(r.element('weekKnightsReview').innerHTML, /إعادة الحسم/);
        assert.ok(fs.readFileSync(path.join(root, 'index.html'), 'utf8').includes('onclick="copyWeeklyKnightsAnnouncement()"'));
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

async function dailyCorrection() {
    const h = await open({ today: key.days[2] });
    try {
        const result = await h.page.evaluate(async ({ high, low, corrected }) => {
            const date = '2026-11-24', winner = students.find(s => s.id === 1), rival = students.find(s => s.id === 2);
            winner.name = 'أحمد'; rival.name = 'يوسف';
            for (const s of students.filter(s => s.halaqaId === 'a')) s.history[date] = { attended: false, absence: 'unexcused' };
            winner.history[date] = { attended: true, entries: { e: high, extra: structuredClone(high) } };
            rival.history[date] = { attended: true, entries: { e: low } };
            const before = getGeneralTvSnapshot();
            const log = JSON.stringify(honorKnightsLog);
            if (!await commitGeneralStudentPatch(winner, { ['history.' + date + '.entries.e']: corrected, ['history.' + date + '.entries.extra']: DEL_FIELD })) throw Error('valid correction refused');
            return { before, after: getGeneralTvSnapshot(), sameLog: log === JSON.stringify(honorKnightsLog), writes: window.__fixture.writes };
        }, { high: { ...entry({kind:'new',passage:5,grade:'excellent'}), heardBy:'t-a' },
            low: { ...entry({kind:'new',passage:4,grade:'excellent'}), heardBy:'t-a' },
            corrected: { ...entry({kind:'new',passage:4,grade:'good'}), heardBy:'t-a' } });
        const names = s => s.stages.flatMap(stage => stage.dayKnights).find(k => k.stage === key.settings.halaqas.find(k => k.id === 'a').name).names;
        assert.deepEqual(names(result.before), ['أحمد']); assert.deepEqual(names(result.after), ['يوسف']);
        assert.equal(result.sameLog, true); assert.equal(result.writes.length, 1);
        // Render the actual snapshot through production TV rendering, offline.
        const context = await browser.newContext();
        try {
            const page = await context.newPage();
            await page.addInitScript(() => { const NativeDate = Date; window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : ['2026-11-24T10:00:00Z'])); } static now() { return +new NativeDate('2026-11-24T10:00:00Z'); } }; });
            await page.route('**/*', route => {
                const url = new URL(route.request().url());
                const file = url.pathname === '/' ? 'tv.html' : url.pathname.slice(1);
                const absolute = path.resolve(root, file);
                if (url.hostname !== 'almahra.test' || !absolute.startsWith(root + path.sep) || !fs.existsSync(absolute)) return route.fulfill({ body: '' });
                return route.fulfill({ path: absolute });
            });
            await page.goto('http://almahra.test/tv.html');
            // The renderer is also exported for deterministic offline rendering.
            await page.evaluate(snapshot => { snapshot.stages.forEach(s => { s.board = []; s.weekKnights = []; s.prepWeek = []; s.risingStars = []; }); const channel = new BroadcastChannel('almahra-tv'); channel.postMessage(snapshot); channel.close(); }, result.after);
            await page.waitForFunction(() => document.body.innerText.includes('يوسف'));
            assert.ok((await page.locator('body').innerText()).includes('يوسف'));
        } finally { await context.close(); }
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
}
test('ق4: correcting Ahmad recitation changes snapshot.stages[].dayKnights and TV automatically', dailyCorrection);
test('ق15: a saved correction changes the provisional TV knight without an approval', dailyCorrection);

async function refreeze() {
    const { server, h, old } = await correction();
    assert.equal(old.knights[0].name, 'فهد');
    assert.deepEqual(rows(server).find(r => r.halaqaId === 'a'), old);
    for (const reason of ['', '   ']) assert.equal((await h.call('unfreezeHalaqaWeek', key.days[0], 'a', reason)).success, false);
    assert.equal((await h.call('unfreezeHalaqaWeek', key.days[0], 'a', 'تصحيح ورقة سعد')).success, true);
    const fresh = rows(server).find(r => r.halaqaId === 'a');
    assert.equal(fresh.knights[0].name, 'سعد'); assert.equal(fresh.refreeze[0].reason, 'تصحيح ورقة سعد');
    assert.deepEqual(server.season().knightsLog, []);
    assert.equal(h.run('students.find(s=>s.id===2).history["2026-11-25"]'), undefined, 'refreeze used server, not stale local students');
}
test('ق5: after freeze, reason is mandatory and corrected server data changes weekly knight', refreeze);
test('ق17: frozen row persists until refreeze, blank/whitespace refused and fresh server reason recorded', refreeze);

test('ق6: after announcement refreeze refuses and correction updates points/report but not announced knight', async () => {
    const { server, h } = await correction();
    await h.call('copyWeeklyKnightsAnnouncement');
    const old = copy(rows(server)), announcement = h.state.copies[0];
    report(h);
    const student = h.run('students[0]'), before = copy(await h.call('summarizeRange', student, key.days));
    await h.call('commitGeneralStudentPatch', student, { ['history.' + key.days[0] + '.criteriaPoints']: -100 });
    const after = copy(await h.call('summarizeRange', student, key.days));
    assert.notEqual(after.points, before.points);
    assert.equal((await h.call('unfreezeHalaqaWeek', key.days[0], 'a', 'تصحيح')).error, 'أُعلن الأسبوع؛ لا تُعاد الحسبة');
    await h.call('copyWeeklyKnightsAnnouncement');
    assert.equal(h.state.copies[1], announcement); assert.deepEqual(rows(server), old);
    await h.call('renderWeekKnightsReview'); assert.doesNotMatch(h.element('weekKnightsReview').innerHTML, /onclick="refreeze/);
});

test('ق12: refresh/settings and round trips never restore general knights UI or call removed renderers', async () => {
    const h = await open();
    try {
        for (const program of ['general', 'summer', 'general', 'review-day', 'general']) {
            await h.page.evaluate(program => window.almahraPrograms.openProgram(program), program);
            await h.page.waitForFunction(program => document.body.classList.contains('program-general') === (program === 'general'), program);
            await h.page.evaluate(() => { updateAllUIs(); goHome('page-settings'); });
            assert.equal(await h.page.locator('[onclick="openSettingsSection(\'setPanelKnights\')"]').isVisible(), program !== 'general');
            await h.page.evaluate(() => openSettingsSection('setPanelKnights'));
            assert.equal(await h.page.locator('#setPanelKnights').isVisible(), program !== 'general');
        }
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

test('ق13: every manual mode is rejected at UI/shared/store entries with no server/local/guard mutation', async () => {
    const server = cloud(), h = runtime(server);
    h.install('saveCurrentThreeKnights', 'saveGeneralKnightsReplacement', 'approveGeneralHalaqaKnights');
    h.run('let honorKnightsLog = [], currentThreeKnights = null');
    const before = copy([...server.docs]); let guard = 0;
    h.ctx.window.almahraPrograms.setWriteGuard(async () => { guard++; return { ok: true }; });
    for (const mode of ['h:a', 'all', 'discipline', 'stage1', '', undefined]) {
        const entry = { dateStr: key.days[1], fars: [{ id: 1, name: 'أحمد' }], ...(mode === undefined ? {} : { mode }) };
        assert.equal(await h.call('saveCurrentThreeKnights', entry), false);
        const result = await h.ctx.window.almahraPrograms.saveKnightsEntry('general', 's1', entry);
        assert.equal(result.success, false); assert.match(result.error, /الاعتماد اليدوي.*معطّل.*البرنامج العام/);
    }
    assert.equal(await h.call('saveGeneralKnightsReplacement'), false);
    assert.equal(h.run('currentThreeKnights'), null); assert.deepEqual(copy(h.run('honorKnightsLog')), []);
    assert.deepEqual(copy([...server.docs]), before); assert.equal(server.state.writes.length, 0); assert.equal(guard, 0);
});

test('ق14: count default/1..5 persists and freezes; boundary ties share rank and daily winners have no count limit', async () => {
    for (const n of [undefined, 1, 2, 3, 4, 5]) {
        const server = cloud(), settings = copy(key.settings);
        for (const s of server.students().filter(s => s.halaqaId === 'c')) {
            s.history = copy(server.students()[0].history); s.joinedOn = key.days[0];
            server.docs.set('programs/general/seasons/s1/students/' + s.id, s);
        }
        settings.titleRules.knightsPerHalaqa = n === undefined ? {} : { c: n };
        const store = server.stores().almahraPrograms;
        store.setWriteGuard(async () => ({ok:true}));
        assert.equal((await store.updateSettings('general', settings)).success, true);
        assert.deepEqual(copy(await store.getSettingsFromServer('general')).titleRules, settings.titleRules);
        const h = runtime(server); await h.frozen();
        const row = rows(server).find(r => r.halaqaId === 'c');
        assert.equal(row.n, n ?? 1); assert.equal(row.knights.length, 2);
        assert.deepEqual(row.knights.map(k => k.rank), [1, 1]);
        const day = await h.call('getDayHalaqaKnights', key.days[0], 'c', server.students(), [], { ...settings, season: key.season });
        assert.equal(day.names.length, 2);
    }
});

test('ق16: saved removal of accepted recitation, absence or blocker chooses rival or removes empty TV card', async () => {
    for (const kind of ['no-accepted', 'absent', 'blocking']) {
        const server = cloud(), h = runtime(server); tv(h);
        const list = h.run('students'), winner = list.find(s => s.id === 1), rival = list.find(s => s.id === 2);
        for (const s of list.filter(s => s.halaqaId === 'a' && ![1,2].includes(s.id))) s.history[key.days[1]] = {attended:false,absence:'unexcused'};
        const day = key.days[1]; winner.history[day] = copy(winner.history[key.days[0]]);
        rival.history[day] = copy(winner.history[day]);
        Object.values(winner.history[day].entries).forEach(e => e.points = 1000);
        const names = async () => copy(await h.call('getGeneralTvSnapshot')).stages.flatMap(s => s.dayKnights).find(k => k.stage === key.settings.halaqas.find(k => k.id === 'a').name)?.names;
        assert.deepEqual(await names(), ['فهد']);
        const removeEntries = student => Object.fromEntries(Object.keys(student.history[day].entries || {}).map(id => ['history.' + day + '.entries.' + id, h.run('DEL_FIELD')]));
        const patch = kind === 'no-accepted' ? removeEntries(winner) : kind === 'absent'
            ? { ['history.' + day + '.attended']: false, ['history.' + day + '.absence']: 'unexcused', ['history.' + day + '.note']: '' }
            : { ['history.' + day + '.criteria']: { [key.settings.criteria.find(c => c.blocksTitles && c.points < 0).id]: -1 } };
        if (kind === 'absent') Object.assign(patch, removeEntries(winner));
        assert.equal(await h.call('commitGeneralStudentPatch', winner, patch), true);
        assert.deepEqual(await names(), ['سعد']);
        for (const student of list.filter(s => s.halaqaId === 'a')) await h.call('commitGeneralStudentPatch', student, { ...removeEntries(student), ['history.' + day + '.attended']: false, ['history.' + day + '.absence']: 'unexcused', ['history.' + day + '.note']: '' });
        assert.equal(await names(), undefined); assert.equal(h.run('honorKnightsLog.length'), 0);
    }
});

test.todo('ق18/ق19 الجرد: لا يوجد مسار ابدأ الجرد في HEAD؛ يلزم تنفيذ مستقل أو فرع يحتويه لاختبار القفل وإعادة العرض');
for (const route of ['snapshot', 'message', 'announcement']) test('ق18: '+route+' locks before output and refuses direct refreeze', async () => {
    const server = cloud(), h = runtime(server); await h.frozen();
    if (route === 'snapshot') { const sent = tv(h); await h.call('sendGeneralTvSnapshot'); await tick(); assert.ok(sent.at(-1).stages.some(s => s.weekKnights?.length)); }
    if (route === 'announcement') { await h.call('copyWeeklyKnightsAnnouncement'); assert.equal(h.state.copies.length, 1); }
    if (route === 'message') { sender(h); await h.call('sendGeneralWeeklyMessage', server.students()[0]); assert.notEqual(h.ctx.window.location.href, 'unchanged'); }
    const row = rows(server).find(r => r.halaqaId === 'a'); assert.ok(row.lockedAt);
    assert.equal((await h.call('unfreezeHalaqaWeek', key.days[0], 'a', 'تصحيح')).error, 'أُعلن الأسبوع؛ لا تُعاد الحسبة');
    assert.deepEqual(row.lockedSteps, row.steps);
});

test('ق19: corrected points/reports resend snapshot/message from unchanged locked names/ranks/steps', async () => {
    const server = cloud(), h = runtime(server); await h.frozen();
    await h.call('copyWeeklyKnightsAnnouncement'); const old = copy(rows(server)); const sent = tv(h); sender(h);
    report(h); const student = h.run('students[0]');
    const before = copy(await h.call('summarizeRange', student, key.days));
    await h.call('commitGeneralStudentPatch', student, { ['history.' + key.days[0] + '.criteriaPoints']: -999 });
    assert.notEqual((await h.call('summarizeRange', student, key.days)).points, before.points);
    await h.call('sendGeneralWeeklyMessage', student); await h.call('sendGeneralTvSnapshot'); await tick();
    for (const row of old) for (const line of await h.call('knightsMessageLines', student, [row], true)) assert.ok(decodeURIComponent(h.ctx.window.location.href).includes(line));
    assert.ok(sent.length); assert.deepEqual(rows(server), old);
});

test('ق20: summer/review-day old launch and isolated season logs survive round trips', async () => {
    const h = await open({ program: 'summer' });
    try {
        const result = await h.page.evaluate(async () => {
            canWriteView = () => true;
            const logs = new Map(), writes = [];
            window.almahraPrograms.getKnightsLog = (p, s) => logs.get(p + ':' + s) || [];
            window.almahraPrograms.saveKnightsEntry = async (p, s, entry) => { writes.push({p,s,entry}); logs.set(p + ':' + s, [entry]); return {success:true}; };
            const visits = [];
            for (const program of ['summer', 'review-day', 'general', 'summer', 'review-day']) {
                window.almahraPrograms.openProgram(program); loadCurrentThreeKnights();
                if (program !== 'general') { openSettingsSection('setPanelKnights'); await launchThreeKnights(); }
                visits.push({ program, log: structuredClone(honorKnightsLog), current: structuredClone(currentThreeKnights) });
            }
            return {writes, visits};
        });
        assert.ok(result.writes.every(w => w.p !== 'general' && w.s === 's-' + w.p));
        assert.equal(result.visits[2].current, null); assert.deepEqual(result.visits[2].log, []);
        assert.equal(result.writes.length, 4); assert.deepEqual(h.errors, []);
        const server = cloud(), store = server.stores().almahraPrograms;
        for (const p of ['summer', 'review-day']) {
            assert.equal((await store.saveKnightsEntry(p, 'other', { dateStr: key.days[0], mode: 'all', fars: [{name:p}] })).success, true);
            assert.equal(server.docs.get('programs/' + p + '/seasons/other').knightsLog[0].fars[0].name, p);
        }
    } finally { await h.close(); }
});

test('ق21: historical h: approval follows locked keys in daily/freeze; loading and announced row stay intact', async () => {
    const h = pure();
    const daily = h.call('getDayHalaqaKnights', key.days[2], 'b', h.list, h.approvals, h.settings);
    assert.deepEqual(daily.names, key.daily.b[2]);
    const server = cloud(), r = runtime(server); await r.frozen();
    const row = rows(server).find(row => row.halaqaId === 'b');
    assert.deepEqual(row.knights.map(k => k.name), h.row('b').knights.map(k => k.name));
    r.install('loadCurrentThreeKnights'); r.run('let honorKnightsLog=[], currentThreeKnights=null');
    await r.call('loadCurrentThreeKnights');
    assert.deepEqual(copy(r.run('honorKnightsLog')), [key.manualApproval]);
    await r.call('lockWeekRows', key.days[0], row.stageId);
    const locked = copy(rows(server).find(row => row.halaqaId === 'b'));
    server.season().knightsLog = [];
    assert.equal((await r.call('unfreezeHalaqaWeek', key.days[0], 'b', 'تاريخي')).success, false);
    assert.deepEqual(rows(server).find(row => row.halaqaId === 'b'), locked);
});

test('owner audit: exact changed lines only, all protected functions/keys/history and other-program branches retain HEAD behavior', () => {
    const cp = require('node:child_process'), { createHash } = require('node:crypto');
    const audit = require('./rules/design-expectation-audit.json');
    const { changesFrom } = require('./helpers/design-expectation-audit.cjs');
    const { beforeKnightsOwnerAuto } = require('./helpers/knights-owner-auto-audit.cjs');
    const original = file => cp.execFileSync('git', ['show', '186a18e:' + file], {cwd:root, encoding:'utf8', maxBuffer:4*1024*1024}).replaceAll('\r\n','\n');
    const changed = cp.execFileSync('git', ['diff','--name-only','186a18e'], {cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(f => f && f !== 'tests/rules/design-expectation-audit.json' && !audit.knightsOwnerAutoAddedFiles.some(r => r.file === f) && changesFrom(f,'186a18e').hunks.length).sort();
    assert.deepEqual(audit.knightsOwnerAutoChanges.map(r => r.file).sort(), changed);
    for (const row of audit.knightsOwnerAutoChanges) {
        assert.equal(row.category,11); assert.equal(row.reason,audit.categories['11']);
        assert.deepEqual({file:row.file,hunks:row.hunks},changesFrom(row.file,'186a18e'));
        assert.equal(createHash('sha256').update(original(row.file)).digest('hex'),row.beforeSha256);
        assert.equal(beforeKnightsOwnerAuto(fs.readFileSync(path.join(root,row.file),'utf8'),row.file),original(row.file));
    }
    for (const row of audit.knightsOwnerAutoAddedFiles) {
        const text = require('./helpers/knights-oneplace-audit.cjs').beforeKnightsOnePlace(fs.readFileSync(path.join(root,row.file),'utf8'),row.file);
        assert.equal(row.category,11); assert.equal(row.reason,audit.categories['11']);
        assert.equal(createHash('sha256').update(text).digest('hex'),row.sha256);
        assert.deepEqual(row.hunks,[{oldLine:1,newLine:1,before:[],after:text.split('\n')}]);
    }
    const html = fs.readFileSync(path.join(root,'index.html'),'utf8'), old = original('index.html');
    for (const name of ['dayStats','getCumulativeStats','topTied','getWeekTitleCandidates','getDisciplineStars',
        'getDayHalaqaKnights','getWeekNominations','rankHalaqaWeekKnights','buildWeekKnightsRow','buildRevealSteps',
        'ensureWeekKnightsFrozen','lockWeekRows','unfreezeHalaqaWeek','lockKnightsForMessage','getGeneralTvSnapshot',
        'sendGeneralTvSnapshot','sendGeneralWeeklyMessage','copyWeeklyKnightsAnnouncement','loadCurrentThreeKnights'])
        assert.equal(source(name,html),source(name,old),name);
    assert.equal(html.match(/const dayPoints = .*;/)[0],old.match(/const dayPoints = .*;/)[0]);
    for (const name of ['launchThreeKnights','saveCurrentThreeKnights'])
        assert.equal(source(name,html).replace('            if (isGeneralProgram()) return false;\n',''),
            source(name,old).replace('            if (isGeneralProgram()) return;\n',''),name+': other programs');
    for (const file of ['firestore.rules','data-store.js','tv.js','tv.html', ...['knights-answer-key','knights-r2-answer-key','board-answer-key','homeprep-answer-key'].map(n=>'tests/rules/'+n+'.json')])
        assert.equal(fs.readFileSync(path.join(root,file),'utf8').replaceAll('\r\n','\n'),original(file),file);
    const mutated = html.replace("if (isGeneralProgram()) return false;", "if (isGeneralProgram()) return true;");
    assert.notEqual(mutated,html); assert.notEqual(beforeKnightsOwnerAuto(mutated),old);
});
