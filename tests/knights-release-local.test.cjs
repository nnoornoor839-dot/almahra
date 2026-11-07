const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { newPage, root } = require('./helpers/t25-browser.cjs');
const { fixtures } = require('./helpers/knights-r2-harness.cjs');
const { cloud, runtime, key } = require('./helpers/knights-r2b-harness.cjs');
const { source, html } = require('./helpers/quick-entry-harness.cjs');
const { beforeKnightsRelease } = require('./helpers/knights-release-audit.cjs');
let browser;
before(async () => {
    const playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); });
const open = (options = {}) => newPage(browser, { width: 1280, today: '2026-11-24', list: fixtures(), settings: key.settings, ...options });
const shown = page => page.locator('#supervisorPanel select[id$="Select"]:visible').count();

test('release general: settings card opens approval only, active h: options, fields, reason and configured counts 1..5/fallback', async () => {
    const h = await open();
    try {
        await h.page.evaluate(() => {
            const settings = window.almahraPrograms.getSettings();
            settings.features.knights = false; // New approval remains available independently of the old feature.
            settings.halaqas.push({ id: 'inactive', name: 'Inactive', active: false });
            goHome('page-settings');
        });
        const card = h.page.locator('[onclick="openSettingsSection(\'setPanelKnights\')"]');
        assert.equal(await card.isVisible(), true);
        await card.click();
        assert.equal(await h.page.locator('#setPanelKnights').isVisible(), true);
        assert.equal(await h.page.locator('#supervisorPanel').isVisible(), true);
        assert.deepEqual(await h.page.locator('#farsAutoMode option').evaluateAll(list => list.map(o => o.value)), key.settings.halaqas.filter(h => h.active === true).map(h => 'h:' + h.id));
        assert.equal(await h.page.locator('#farsDayInput').isVisible(), false);
        for (const n of [1,2,3]) assert.equal(await h.page.locator('#fars' + n + 'Achievement').isVisible(), false);
        assert.equal(await h.page.locator('#farsHalaqaReason').isVisible(), true);
        assert.doesNotMatch(await h.page.locator('#farsApproveButton').innerText(), /شاشة/);
        assert.match(await h.page.locator('#farsAutoHelp').innerText(), /بسبب إلزامي/);
        for (const count of [1,2,3,4,5,undefined]) {
            await h.page.evaluate(count => {
                const settings = window.almahraPrograms.getSettings();
                settings.titleRules.knightsPerHalaqa = { ...settings.titleRules.knightsPerHalaqa, a: count };
                document.getElementById('farsAutoMode').value = 'h:a';
                updateThreeKnightsSelects();
            }, count);
            assert.equal(await shown(h.page), count ?? 3);
        }
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

test('release general: non-h modes cannot save/open/auto-pick; h saves exact reason, rejects blank and ignores hidden selections', async () => {
    const h = await open();
    try {
        const result = await h.page.evaluate(async () => {
            const writes = [], legacy = [];
            window.almahraPrograms.saveKnightsEntry = async (...args) => { writes.push(args); return {success:true}; };
            saveCurrentThreeKnights = async (...args) => { legacy.push(args); return true; };
            getDayRanking = getDisciplineRanking = () => { throw Error('Legacy ranking reached'); };
            sendGeneralTvSnapshot = () => {};
            const mode = document.getElementById('farsAutoMode');
            for (const value of ['all','discipline','stage1','']) {
                mode.innerHTML = ''; mode.add(new Option(value,value)); mode.value = value;
                await launchThreeKnights(); autoPickKnights();
            }
            const blocked = {writes:writes.length,legacy:legacy.length,open:document.getElementById('threeKnightsModal').classList.contains('flex')};
            fillFarsModeSelect(); mode.value = 'h:b';
            window.almahraPrograms.getSettings().titleRules.knightsPerHalaqa.b = 1;
            updateThreeKnightsSelects();
            document.getElementById('farsAutoDate').value = '2026-11-24';
            document.getElementById('fars1Select').value = '7';
            document.getElementById('fars2Select').value = '1'; // Stale hidden choice from another halaqa must not be saved.
            document.getElementById('farsHalaqaReason').value = '  ';
            const empty = await launchThreeKnights(), emptyWrites = writes.length;
            document.getElementById('farsHalaqaReason').value = '  تقدير المعلم  ';
            const saved = await launchThreeKnights();
            const hidden = getComputedStyle(document.getElementById('threeKnightsModal')).display;
            return {blocked,empty,emptyWrites,saved,writes,legacy,hidden};
        });
        assert.deepEqual(result.blocked, {writes:0,legacy:0,open:false});
        assert.equal(result.empty, false); assert.equal(result.emptyWrites, 0);
        assert.equal(result.saved, true); assert.equal(result.writes.length, 1);
        const [program,season,entry] = result.writes[0];
        assert.equal(program,'general'); assert.equal(season,'s-general');
        assert.equal(entry.mode,'h:b'); assert.equal(entry.reason,'تقدير المعلم');
        assert.deepEqual(entry.fars,[{id:7,name:'ماجد'}]);
        assert.equal(result.hidden,'none'); assert.deepEqual(result.legacy,[]);
        assert.deepEqual(h.errors,[]);
    } finally { await h.close(); }
});

test('release general: all five allowed manual positions save and old modal stays hidden', async () => {
    const h = await open();
    try {
        const result = await h.page.evaluate(async () => {
            let saved;
            const list = window.__fixture.list;
            const template = list.find(s => s.id === 7);
            for(let i=0;i<4;i++) list.push({...structuredClone(template),id:100+i,name:'Synthetic '+i});
            students = list;
            const settings=window.almahraPrograms.getSettings(); settings.titleRules.knightsPerHalaqa.b=5;
            document.getElementById('farsAutoMode').value='h:b'; updateThreeKnightsSelects();
            document.getElementById('farsAutoDate').value='2026-11-24';
            [7,100,101,102,103].forEach((id,i)=>document.getElementById('fars'+(i+1)+'Select').value=String(id));
            document.getElementById('farsHalaqaReason').value='تقدير المعلم';
            window.almahraPrograms.saveKnightsEntry=async(p,s,e)=>{saved=e;return {success:true}};
            sendGeneralTvSnapshot=()=>{};
            return {ok:await launchThreeKnights(),saved};
        });
        assert.equal(result.ok,true); assert.deepEqual(result.saved.fars.map(s=>s.id),[7,100,101,102,103]);
        assert.deepEqual(h.errors,[]);
    } finally { await h.close(); }
});

test('release general: computed hidden cards and animation schedules only visible cards without gaps', async () => {
    const h = await open();
    try {
        const result = await h.page.evaluate(() => {
            for(const id of ['threeKnightsModal','hbCardDaily','hbCardWeekly']) document.getElementById(id).style.display='flex';
            const hidden=['threeKnightsModal','hbCardDaily','hbCardWeekly'].map(id=>getComputedStyle(document.getElementById(id)).display);
            const cards=[...document.querySelectorAll('#hbBoard .hb-card')];
            const visible=cards.filter(c=>getComputedStyle(c).display!=='none').map(c=>c.id);
            const scheduled=[],opened=[],nativeTimer=window.setTimeout,nativeOpen=hbSetOpen;
            try {
                window.setTimeout=(fn,delay)=>{scheduled.push(delay);fn();return 0};
                hbSetOpen=card=>opened.push(card.id);
                playHonorBoardEntranceAnimation();
            } finally { window.setTimeout=nativeTimer;hbSetOpen=nativeOpen;hbStopReveal(); }
            return {hidden,visible,opened,scheduled,start:HB_REVEAL_START,step:HB_REVEAL_STEP};
        });
        assert.deepEqual(result.hidden,['none','none','none']);
        assert.ok(result.visible.length); assert.deepEqual(result.opened,result.visible);
        assert.deepEqual(result.scheduled,result.visible.map((_,i)=>result.start+i*result.step));
        assert.deepEqual(h.errors,[]);
    } finally { await h.close(); }
});

for(const program of ['summer','review-day']) test('release '+program+': original options, three positions, achievements, launch and honor cards survive', async()=>{
    const h=await open({program});
    try {
        const result=await h.page.evaluate(async()=>{
            goHome('page-settings');openSettingsSection('setPanelKnights');fillFarsModeSelect();
            const options=[...document.getElementById('farsAutoMode').options].map(o=>o.value);
            const expected=['all',...(tiersFeatureOn()?getTiers().map(t=>t.id):[]),'discipline'];
            let saved;
            canWriteView=()=>true; // Exercise the legacy branch without changing the production program lock.
            saveCurrentThreeKnights=async entry=>{saved=entry;return true};
            await launchThreeKnights();
            return {options,expected,saved,mode:document.getElementById('farsAutoMode').value,
                day:getComputedStyle(document.getElementById('farsDayInput')).display,
                achievements:[1,2,3].map(n=>getComputedStyle(document.getElementById('fars'+n+'Achievement')).display),
                modal:getComputedStyle(document.getElementById('threeKnightsModal')).display,
                cards:['hbCardDaily','hbCardWeekly'].map(id=>getComputedStyle(document.getElementById(id)).display),
                button:document.getElementById('farsApproveButton').textContent,reason:document.getElementById('farsHalaqaReasonRow').hidden};
        });
        assert.deepEqual(result.options,result.expected);assert.ok(result.saved);assert.equal(result.saved.mode,result.mode);
        assert.notEqual(result.day,'none'); assert.ok(result.achievements.every(x=>x!=='none'));
        assert.notEqual(result.modal,'none');assert.ok(result.cards.every(x=>x!=='none'));
        assert.match(result.button,/شاشة/);assert.equal(result.reason,true);assert.equal(await shown(h.page),3);
        assert.deepEqual(h.errors,[]);
    } finally {await h.close()}
});

test('release general: review/copy/refreeze buttons share general tokens, icons and 44px targets', async()=>{
    const h=await open();
    try {
        const server=cloud(),r=runtime(server);await r.frozen();await r.call('renderWeekKnightsReview');
        const review=r.element('weekKnightsReview').innerHTML;
        await h.page.evaluate(review=>{
            goHome('page-records');openRecordsSection('recPanelAbsence');
            const host=document.getElementById('weekKnightsReview');host.innerHTML=review;host.classList.remove('hidden');
        },review);
        const buttons=h.page.locator('.general-knights-action:visible');assert.ok(await buttons.count()>=3);
        for(const button of await buttons.all()) {
            assert.ok((await button.boundingBox()).height>=40);
            assert.equal(await button.locator('i.fas').count(),1);
            const style=await button.evaluate(el=>({color:getComputedStyle(el).color,brand:getComputedStyle(document.body).getPropertyValue('--general-brand').trim(),gap:getComputedStyle(el).gap}));
            assert.ok(style.brand);assert.equal(style.gap,'12px');
        }
        assert.deepEqual(h.errors,[]);
    } finally {await h.close()}
});

test('release TV: production transport delivers new provisional halaqa knights and omits weekly knights before lock',async()=>{
    const server=cloud(),h=runtime(server);await h.frozen();h.run('let honorKnightsLog = []');
    h.install('sendGeneralTvSnapshot');h.ctx.getBoardDate=()=>key.days[1];h.ctx.getBoardWeekRange=()=>({startStr:key.days[0],endStr:key.days[1]});
    h.ctx.getWorkingDatesInRange=()=>key.days.slice(0,2);h.ctx.getGeneralTvBoard=()=>[];h.ctx.getMostImproved=()=>[];
    for(const name of ['getApprovedKnightsForMode','getWeekTitleCandidates','getDayRanking']) h.ctx[name]=()=>assert.fail('old TV path: '+name);
    const posted=[];h.ctx.generalTvReady=()=>true;h.ctx.generalTvContext=()=> 'general:s1';h.ctx.postGeneralTv=value=>posted.push(value);
    h.ctx.fixtureChannel={enabled:true};h.run('Object.assign(generalTv, fixtureChannel)');
    let release;h.ctx.lockWeekRows=()=>new Promise(resolve=>{release=resolve});
    await h.call('sendGeneralTvSnapshot');
    assert.ok(posted.length);const maghrib=posted[0].stages.find(s=>s.period==='maghrib');
    assert.deepEqual(JSON.parse(JSON.stringify(maghrib.dayKnights)),[
        {stage:'سلمان الفارسي',teacher:'الأستاذ محمد',names:['وليد'],times:1,provisional:true},
        {stage:'أبو ذر',teacher:'الأستاذ فهد',names:['يزيد'],times:1,provisional:true}]);
    assert.ok(posted[0].stages.every(s=>!Object.hasOwn(s,'weekKnights')));
    release?.({success:false});
    const old=cp.execFileSync('git',['show','2d78da2:index.html'],{cwd:root,encoding:'utf8'});
    for(const name of ['getGeneralTvSnapshot','getLockedWeekKnights','getDayHalaqaKnights']) assert.equal(source(name),source(name,old));
});

test('release audit: exact hunks, protected calculations/stores/rules, four locked keys and registered owner expectations',()=>{
    const audit=require('./rules/design-expectation-audit.json');
    assert.equal(audit.categories['11'],'الفرسان: تجهيز الرفع باعتماد المالك ٢٠٢٦-١١-٠٧');
    assert.equal(audit.knightsReleaseNotes.existingExpectedResultsChanged,true);
    const {changesFrom}=require('./helpers/design-expectation-audit.cjs');
    for(const row of [...audit.knightsReleaseProductionChanges,...audit.knightsReleaseExpectationChanges]) {
        const baseline=row.reviewBaseline || audit.knightsReleaseBaseline;
        assert.deepEqual({file:row.file,hunks:row.hunks},changesFrom(row.file,baseline));
        const original=cp.execFileSync('git',['show',baseline+':'+row.file],{cwd:root,encoding:'utf8'}).replaceAll('\r\n','\n');
        assert.equal(createHash('sha256').update(original).digest('hex'),row.beforeSha256);
        assert.equal(beforeKnightsRelease(fs.readFileSync(path.join(root,row.file),'utf8'),row.file),original);
    }
    const original=cp.execFileSync('git',['show','2d78da2:index.html'],{cwd:root,encoding:'utf8'});
    for(const name of ['dayStats','getCumulativeStats','topTied','getWeekTitleCandidates','getDisciplineStars','ensureWeekKnightsFrozen','lockWeekRows','unfreezeHalaqaWeek','knightsToday']) assert.equal(source(name),source(name,original),name);
    assert.equal(html.match(/const dayPoints = .*;/)[0],original.match(/const dayPoints = .*;/)[0]);
    assert.equal(beforeKnightsRelease(fs.readFileSync(path.join(root,'tv.js'),'utf8'),'tv.js'),cp.execFileSync('git',['show','2d78da2:tv.js'],{cwd:root,encoding:'utf8'}).replaceAll('\r\n','\n'));
    for(const file of ['programs-store.js','data-store.js','firestore.rules','tv.html',...['knights-answer-key','knights-r2-answer-key','board-answer-key','homeprep-answer-key'].map(n=>'tests/rules/'+n+'.json')])
        assert.deepEqual(fs.readFileSync(path.join(root,file)),cp.execFileSync('git',['show','2d78da2:'+file],{cwd:root}));
});

test('release TV audit: only the three teacher-rendering lines are exempt; unrelated logic and rendering changes stay exposed',()=>{
    const audit=require('./rules/design-expectation-audit.json');
    const row=audit.knightsReleaseProductionChanges.find(r=>r.file==='tv.js');
    assert.equal(row.category,11);
    assert.equal(row.reason,audit.categories['11']);
    assert.equal(row.hunks.length,1);
    assert.deepEqual(row.hunks[0],{oldLine:251,newLine:251,before:[
        "                        if (slide.kind === 'dayKnights' || slide.kind === 'weekKnights') {",
        "                            if (item.teacher) cardBody.append(node('p', 'muted', item.teacher));",
        "                        }"
    ],after:[]});
    const current=fs.readFileSync(path.join(root,'tv.js'),'utf8');
    const original=cp.execFileSync('git',['show','9f2224d:tv.js'],{cwd:root,encoding:'utf8'}).replaceAll('\r\n','\n');
    assert.equal(beforeKnightsRelease(current,'tv.js'),original);
    for(const [from,to] of [[', 15000);',', 15001);'],["node('p', 'stage', item.stage)","node('p', 'stage', item.teacher)"]]) {
        const changed=current.replace(from,to);
        assert.notEqual(changed,current,'mutation must exercise production code');
        assert.notEqual(beforeKnightsRelease(changed,'tv.js'),original,'unapproved TV change remains visible');
    }
});
