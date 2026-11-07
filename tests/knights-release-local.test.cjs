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

test('release general: independent replacement panel, active halaqas, automatic winner, scoped sorted students and counts 1..5/default 1', async () => {
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
        assert.equal(await h.page.locator('#supervisorPanel').isVisible(), false);
        assert.equal(await h.page.locator('#generalKnightsPanel').isVisible(), true);
        assert.equal(await h.page.locator('#generalKnightsTitle').innerText(), 'فارس الحلقة');
        assert.deepEqual(await h.page.locator('#generalKnightsHalaqa option').evaluateAll(list => list.map(o => ({value:o.value,text:o.textContent}))), key.settings.halaqas.filter(h => h.active === true).map(h => ({value:'h:' + h.id,text:h.name})));
        assert.equal(await h.page.locator('#farsDayInput').isVisible(), false);
        for (const n of [1,2,3]) assert.equal(await h.page.locator('#fars' + n + 'Achievement').isVisible(), false);
        assert.equal(await h.page.locator('#generalKnightsReason').isVisible(), true);
        assert.doesNotMatch(await h.page.locator('#generalKnightsPanel').innerText(), /اختيار آلي|يوم الفرسان|الإنجاز|الأول|الثاني|الثالث|🚀/);
        for (const count of [1,2,3,4,5,undefined]) {
            await h.page.evaluate(count => {
                const settings = window.almahraPrograms.getSettings();
                settings.titleRules.knightsPerHalaqa = { ...settings.titleRules.knightsPerHalaqa, a: count };
                document.getElementById('generalKnightsHalaqa').value = 'h:a';
                renderGeneralKnightsPanel(true);
            }, count);
            assert.equal(await h.page.locator('#generalKnightsChoices select').count(), count ?? 1);
        }
        const data = await h.page.evaluate(() => ({
            options:[...document.getElementById('generalKnightsChoice1').options].slice(1).map(o=>({id:o.value,text:o.textContent})),
            expected:students.filter(s=>s.halaqaId==='a').sort((a,b)=>a.name.localeCompare(b.name,'ar')).map(s=>({id:String(s.id),text:s.name+(getGeneralAttendanceEligibility(s,['2026-11-24'],100).status==='incomplete'?' — غير مكتمل':'')})),
            automatic:document.getElementById('generalKnightsAutomatic').textContent,
            names:getDayHalaqaKnights('2026-11-24','a',students,[]).names
        }));
        assert.deepEqual(data.options,data.expected);for(const name of data.names)assert.ok(data.automatic.includes(name));
        await h.page.evaluate(() => {delete students.find(s=>s.halaqaId==='a').history['2026-11-23'];document.getElementById('generalKnightsDate').value='2026-11-23';renderGeneralKnightsPanel(true)});
        assert.match(await h.page.locator('#generalKnightsChoice1').innerText(), /غير مكتمل/);
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

test('release general: all legacy entry points are inert; replacement rejects blank reason and saves exact entry', async () => {
    const h = await open();
    try {
        const result = await h.page.evaluate(async () => {
            const writes = [], legacy = [];
            window.almahraPrograms.saveKnightsEntry = async (...args) => { writes.push(args); return {success:true}; };
            saveCurrentThreeKnights = async (...args) => { legacy.push(args); return true; };
            getDayRanking = getDisciplineRanking = () => { throw Error('Legacy ranking reached'); };
            sendGeneralTvSnapshot = () => {};
            const mode = document.getElementById('farsAutoMode');
            const before = document.getElementById('supervisorPanel').innerHTML;
            for (const value of ['all','discipline','stage1','']) {
                mode.innerHTML = ''; mode.add(new Option(value,value)); mode.value = value;
                const html = document.getElementById('supervisorPanel').innerHTML;
                await launchThreeKnights(); autoPickKnights(); fillFarsModeSelect(); updateThreeKnightsSelects(); syncFarsDayFromDate();
                if (html !== document.getElementById('supervisorPanel').innerHTML) throw Error('Legacy mutation');
            }
            const blocked = {writes:writes.length,legacy:legacy.length,open:document.getElementById('threeKnightsModal').classList.contains('flex')};
            document.getElementById('generalKnightsHalaqa').value = 'h:b';
            window.almahraPrograms.getSettings().titleRules.knightsPerHalaqa.b = 1;
            document.getElementById('generalKnightsDate').value = '2026-11-24';
            renderGeneralKnightsPanel(true);
            document.getElementById('generalKnightsChoice1').value = '7';
            document.getElementById('fars2Select').value = '1'; // Stale hidden choice from another halaqa must not be saved.
            document.getElementById('generalKnightsReason').value = '  ';
            const empty = await saveGeneralKnightsReplacement(), emptyWrites = writes.length;
            document.getElementById('generalKnightsReason').value = '  تقدير المعلم  ';
            const saved = await saveGeneralKnightsReplacement();
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
        assert.deepEqual(Object.keys(entry).sort(), ['dateStr','mode','fars','reason','by','at'].sort());
        assert.match(await h.page.locator('#generalKnightsSaved').innerText(), /ماجد.*تقدير المعلم/);
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
            document.getElementById('generalKnightsHalaqa').value='h:b';
            document.getElementById('generalKnightsDate').value='2026-11-24';renderGeneralKnightsPanel(true);
            [7,100,101,102,103].forEach((id,i)=>document.getElementById('generalKnightsChoice'+(i+1)).value=String(id));
            document.getElementById('generalKnightsReason').value='تقدير المعلم';
            window.almahraPrograms.saveKnightsEntry=async(p,s,e)=>{saved=e;return {success:true}};
            sendGeneralTvSnapshot=()=>{};
            return {ok:await saveGeneralKnightsReplacement(),saved};
        });
        assert.equal(result.ok,true); assert.deepEqual(result.saved.fars.map(s=>s.id),[7,100,101,102,103]);
        assert.deepEqual(h.errors,[]);
    } finally { await h.close(); }
});

test('general replacement: changing date/halaqa clears draft, no automatic winner, saved reason, and all eligibility rejections', async () => {
    const h = await open();
    try {
        await h.page.evaluate(() => {goHome('page-settings');openSettingsSection('setPanelKnights')});
        await h.page.selectOption('#generalKnightsHalaqa','h:b');
        await h.page.selectOption('#generalKnightsChoice1','7');
        await h.page.fill('#generalKnightsReason','سبب سابق');
        await h.page.selectOption('#generalKnightsHalaqa','h:a');
        assert.equal(await h.page.inputValue('#generalKnightsChoice1'),'');
        assert.equal(await h.page.inputValue('#generalKnightsReason'),'');
        await h.page.selectOption('#generalKnightsChoice1','1');
        await h.page.fill('#generalKnightsReason','سبب آخر');
        await h.page.fill('#generalKnightsDate','2026-11-23');
        await h.page.locator('#generalKnightsDate').dispatchEvent('change');
        assert.equal(await h.page.inputValue('#generalKnightsChoice1'),'');
        assert.equal(await h.page.inputValue('#generalKnightsReason'),'');
        await h.page.fill('#generalKnightsDate','2026-11-20');
        await h.page.locator('#generalKnightsDate').dispatchEvent('change');
        assert.equal(await h.page.locator('#generalKnightsAutomatic').innerText(),'لا فارس آلياً لهذا اليوم');
        const result=await h.page.evaluate(async()=>{
            let writes=0;window.almahraPrograms.saveKnightsEntry=async()=>{writes++;return {success:true}};
            const student=students.find(s=>s.id===7), original=structuredClone(student.history['2026-11-24']);
            document.getElementById('generalKnightsDate').value='2026-11-24';
            document.getElementById('generalKnightsHalaqa').value='h:b';renderGeneralKnightsPanel(true);
            document.getElementById('generalKnightsReason').value='تصحيح الورقة';
            const rejected=[];
            for(const type of ['absent','no-recitation','repeat','blocking','wrong-halaqa']) {
                student.history['2026-11-24']=structuredClone(original);
                if(type==='absent')student.history['2026-11-24']={attended:false,absence:'unexcused'};
                if(type==='no-recitation')student.history['2026-11-24'].entries={};
                if(type==='repeat')Object.values(student.history['2026-11-24'].entries).forEach(e=>e.grade='repeat');
                if(type==='blocking') {
                    const c=getProgramSettings().criteria.find(c=>c.blocksTitles && c.points<0);
                    student.history['2026-11-24'].criteria[c.id]=c.points;
                }
                const select=document.getElementById('generalKnightsChoice1');
                if(type==='wrong-halaqa') {select.add(new Option('طالب حلقة أخرى','1'));select.value='1'}else select.value='7';
                rejected.push(await approveGeneralHalaqaKnights());
            }
            student.history['2026-11-24']=original;
            return {writes,rejected};
        });
        assert.equal(result.writes,0);assert.deepEqual(result.rejected,[false,false,false,false,false]);
        assert.deepEqual(h.errors,[]);
    } finally {await h.close()}
});

test('general legacy inventory: hidden with forced inline displays, no old ranking reads, settings and text classified', async()=>{
    const h=await open();
    try {
        const result=await h.page.evaluate(()=>{
            const called=[];
            for(const name of ['getDayTitleCandidates','getDayRanking','getWeekTitleCandidates','getApprovedKnightsForMode','getDisciplineStars'])
                window[name]=()=>{called.push(name);throw Error('legacy read')};
            honorKnightsLog.push({dateStr:'2026-11-24',mode:'all',fars:[{id:1,name:'قديم لا يظهر',achievement:'إنجاز قديم'}]});
            renderHonorBoard();renderHomeDashboard();renderReportsTable();renderGeneralWeeklyMessages();
            const counts=getKnightWinCounts();
            const ids=['supervisorPanel','threeKnightsModal','knightCelebrationModal','hbCardDaily','hbCardWeekly','hbCardDiscipline'];
            ids.forEach(id=>document.getElementById(id).style.display='flex');
            const hidden=ids.map(id=>getComputedStyle(document.getElementById(id)).display);
            openNoLevelModal([students[0]]);
            const noLevel=document.getElementById('noLevelDescription').textContent;
            closeNoLevelModal();
            return {called,counts,hidden,noLevel,
                requireSard:getComputedStyle(document.getElementById('psTrRequireSard').closest('label')).display,
                fullWeek:getComputedStyle(document.getElementById('psTrDisciplineFullWeek').closest('label')).display,
                feature:getComputedStyle(document.querySelector('[data-feat="knights"]').closest('label')).display,
                discipline:[...document.querySelectorAll('.crit-disc')].map(e=>getComputedStyle(e.closest('label')).display),
                weekly:document.getElementById('psTrWeeklyAtt').closest('div').textContent,
                text:document.body.innerText};
        });
        assert.deepEqual(result.called,[]);assert.deepEqual(result.counts,{});
        assert.deepEqual(result.hidden,Array(6).fill('none'));
        assert.equal(result.requireSard,'none');assert.equal(result.fullWeek,'none');
        assert.equal(result.feature,'none');
        assert.ok(result.discipline.length);assert.ok(result.discipline.every(s=>s==='none'));
        assert.match(result.noLevel,/حلقة فعّالة/);assert.doesNotMatch(result.noLevel,/شريحة|فرسان/);
        assert.doesNotMatch(result.text,/قديم لا يظهر|إنجاز قديم/);
        assert.deepEqual(h.errors,[]);
    } finally {await h.close()}
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

test('general cleanup audit: every changed line registered in category 11; save validation and entry remain exact',()=>{
    const audit=require('./rules/design-expectation-audit.json');
    const {changesFrom}=require('./helpers/design-expectation-audit.cjs');
    const {beforeGeneralKnightsCleanup}=require('./helpers/general-knights-cleanup-audit.cjs');
    const changed=cp.execFileSync('git',['diff','--name-only'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/)
        .filter(f=>f&&f!=='tests/rules/design-expectation-audit.json').sort();
    assert.deepEqual(audit.generalKnightsCleanupChanges.map(r=>r.file).sort(),changed);
    assert.equal(audit.generalKnightsCleanupBaseline,'55fd33e');
    for(const row of audit.generalKnightsCleanupChanges) {
        assert.equal(row.category,11);assert.equal(row.reason,audit.categories['11']);
        assert.deepEqual({file:row.file,hunks:row.hunks},changesFrom(row.file,'55fd33e'));
        const original=cp.execFileSync('git',['show','55fd33e:'+row.file],{cwd:root,encoding:'utf8'}).replaceAll('\r\n','\n');
        assert.equal(createHash('sha256').update(original).digest('hex'),row.beforeSha256);
        assert.equal(beforeGeneralKnightsCleanup(fs.readFileSync(path.join(root,row.file),'utf8'),row.file),original);
    }
    for(const row of audit.generalKnightsCleanupAddedFiles) {
        const current=fs.readFileSync(path.join(root,row.file));
        assert.equal(row.category,11);assert.equal(row.reason,audit.categories['11']);
        assert.equal(createHash('sha256').update(current).digest('hex'),row.sha256);
        assert.deepEqual(row.hunks,[{oldLine:1,newLine:1,before:[],after:current.toString('utf8').split('\n')}]);
    }
    const baseline=cp.execFileSync('git',['show','55fd33e:index.html'],{cwd:root,encoding:'utf8'});
    const reads=source('approveGeneralHalaqaKnights').replaceAll('generalKnightsHalaqa','farsAutoMode')
        .replaceAll('generalKnightsDate','farsAutoDate').replaceAll('generalKnightsReason','farsHalaqaReason')
        .replace("'generalKnightsChoice' + (i + 1)","'fars' + (i + 1) + 'Select'");
    assert.equal(reads,source('approveGeneralHalaqaKnights',baseline),'only field reads change');
    for(const name of ['dayStats','getCumulativeStats','topTied','getWeekTitleCandidates','getDisciplineStars',
        'saveCurrentThreeKnights','ensureWeekKnightsFrozen','lockWeekRows','unfreezeHalaqaWeek','saveSmartProgress'])
        assert.equal(source(name),source(name,baseline),name);
    for(const file of ['tv.js','tv.html','programs-store.js','data-store.js','firestore.rules'])
        assert.deepEqual(fs.readFileSync(path.join(root,file)),cp.execFileSync('git',['show','55fd33e:'+file],{cwd:root}));
    const mutated=html.replace("const options = '<option value=\"\">اختر البديل</option>'", "const options = '<option value=\"\">تغيير غير معتمد</option>'");
    assert.notEqual(mutated,html);
    assert.notEqual(beforeGeneralKnightsCleanup(mutated),baseline.replaceAll('\r\n','\n'));
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
