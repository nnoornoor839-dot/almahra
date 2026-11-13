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
const { beforeKnightsOwnerAuto } = require('./helpers/knights-owner-auto-audit.cjs');
const { beforeKnightsLastWeek } = require('./helpers/knights-oneplace-audit.cjs');
let browser;
before(async () => {
    const playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); });
const open = (options = {}) => newPage(browser, { width: 1280, today: '2026-11-24', list: fixtures(), settings: key.settings, ...options });
const shown = page => page.locator('#supervisorPanel select[id$="Select"]:visible').count();

test('release general: owner removed replacement UI and all manual approval entry points refuse', async () => {
    const h = await open();
    try {
        const result = await h.page.evaluate(async () => {
            let writes = 0;
            window.almahraPrograms.saveKnightsEntry = async () => { writes++; return {success:true}; };
            goHome('page-settings'); openSettingsSection('setPanelKnights'); updateAllUIs();
            return { writes, panel: document.getElementById('setPanelKnights').classList.contains('active'),
                replacement: document.getElementById('generalKnightsPanel') !== null,
                render: typeof renderGeneralKnightsPanel,
                approved: await approveGeneralHalaqaKnights(), replacementSaved: await saveGeneralKnightsReplacement(),
                sharedSaved: await saveCurrentThreeKnights({dateStr:'2026-11-24', mode:'all', fars:[]}) };
        });
        assert.deepEqual(result, {writes:0, panel:false, replacement:false, render:'undefined', approved:false, replacementSaved:false, sharedSaved:false});
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
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
                weekly:document.querySelectorAll('#setPanelPoints #psTrWeeklyAtt').length,
                text:document.body.innerText};
        });
        assert.deepEqual(result.called,[]);assert.deepEqual(result.counts,{});
        assert.deepEqual(result.hidden,Array(6).fill('none'));
        assert.equal(result.requireSard,'none');assert.equal(result.fullWeek,'none');
        assert.equal(result.feature,'none');assert.equal(result.weekly,0);
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

test('release general: review/copy buttons share general tokens, icons and 44px targets; no refreeze button', async()=>{
    const h=await open();
    try {
        const server=cloud(),r=runtime(server);await r.frozen();await r.call('renderWeekKnightsReview');
        const review=r.element('weekKnightsReview').innerHTML;
        // The knights panel renders its own review on open; inject the frozen rows after that render.
        await h.page.evaluate(()=>{goHome('page-settings');openSettingsSection('setPanelGeneralKnights');});
        // الفرسان في مكان واحد (الجزء ٢): الجدول بلا عنوان h3 مكرر وبلا زر إعادة حسم؛ يبقى زر النسخ ظاهراً (وزر الحفظ داخل الإعدادات المطوية).
        await h.page.locator('#setPanelGeneralKnights #weekKnightsReview > *').first().waitFor();
        await h.page.evaluate(review=>{
            const host=document.getElementById('weekKnightsReview');host.innerHTML=review;host.classList.remove('hidden');
        },review);
        assert.equal(await h.page.locator('#weekKnightsReview button').count(),0);
        const buttons=h.page.locator('.general-knights-action:visible');assert.ok(await buttons.count()>=1);
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
    h.ctx.getWorkingDatesInRange=()=>key.days.slice(0,2);h.ctx.getGeneralTvBoard=()=>[];h.ctx.getMostImproved=()=>[];h.ctx.getApprovedRisingStars=()=>[];
    for(const name of ['getApprovedKnightsForMode','getWeekTitleCandidates','getDayRanking']) h.ctx[name]=()=>assert.fail('old TV path: '+name);
    const posted=[];h.ctx.generalTvReady=()=>true;h.ctx.generalTvContext=()=> 'general:s1';h.ctx.postGeneralTv=value=>posted.push(value);
    h.ctx.fixtureChannel={enabled:true};h.run('Object.assign(generalTv, fixtureChannel)');
    let release;h.ctx.lockWeekRows=()=>new Promise(resolve=>{release=resolve});
    await h.call('sendGeneralTvSnapshot');
    assert.ok(posted.length);const maghrib=posted[0].stages.find(s=>s.period==='maghrib');
    assert.deepEqual(JSON.parse(JSON.stringify(maghrib.dayKnights)),[
        {stage:'سلمان الفارسي',teacher:'الأستاذ محمد',names:['وليد'],points:[68.1],times:1,provisional:true},
        {stage:'أبو ذر',teacher:'الأستاذ فهد',names:['يزيد'],points:[55],times:1,provisional:true}]);
    assert.ok(posted[0].stages.every(s=>!Object.hasOwn(s,'weekKnights')));
    release?.({success:false});
    const old=cp.execFileSync('git',['show','2d78da2:index.html'],{cwd:root,encoding:'utf8'});
    // الفئة 16 (آخر أسبوع دراسي محسوم) تُعكس قبل المقارنة
    for(const name of ['getGeneralTvSnapshot','getLockedWeekKnights','getDayHalaqaKnights']) assert.equal(source(name,beforeKnightsLastWeek(html)),source(name,old));
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
    for(const name of ['dayStats','getCumulativeStats','topTied','getWeekTitleCandidates','getDisciplineStars','ensureWeekKnightsFrozen','lockWeekRows','unfreezeHalaqaWeek','knightsToday']) assert.equal(source(name,require('./helpers/knights-oneplace-audit.cjs').beforeKnightsOnePlaceP3(html)),source(name,original),name); // الفئة 14 تُعكس بأسطرها فقط
    assert.equal(html.match(/const dayPoints = .*;/)[0],original.match(/const dayPoints = .*;/)[0]);
    assert.equal(beforeKnightsRelease(fs.readFileSync(path.join(root,'tv.js'),'utf8'),'tv.js'),cp.execFileSync('git',['show','2d78da2:tv.js'],{cwd:root,encoding:'utf8'}).replaceAll('\r\n','\n'));
    for(const file of ['programs-store.js','data-store.js','firestore.rules','tv.html',...['knights-answer-key','knights-r2-answer-key','board-answer-key','homeprep-answer-key'].map(n=>'tests/rules/'+n+'.json')])
        assert.equal(beforeKnightsOwnerAuto(fs.readFileSync(path.join(root,file),'utf8'),file),cp.execFileSync('git',['show','2d78da2:'+file],{cwd:root,encoding:'utf8'}).replaceAll('\r\n','\n'));
});

test('general cleanup audit: every changed line registered in category 11; save validation and entry remain exact',()=>{
    const audit=require('./rules/design-expectation-audit.json');
    const {changesFrom}=require('./helpers/design-expectation-audit.cjs');
    const {beforeGeneralKnightsCleanup}=require('./helpers/general-knights-cleanup-audit.cjs');
    const existing=new Set(cp.execFileSync('git',['ls-tree','-r','--name-only','55fd33e'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/));
    const changed=cp.execFileSync('git',['diff','--name-only','55fd33e'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/)
        .filter(f=>existing.has(f)&&f!=='tests/rules/design-expectation-audit.json').filter(f=>changesFrom(f,'55fd33e').hunks.length).sort();
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
        const current=Buffer.from(beforeKnightsOwnerAuto(fs.readFileSync(path.join(root,row.file),'utf8'),row.file));
        assert.equal(row.category,11);assert.equal(row.reason,audit.categories['11']);
        assert.equal(createHash('sha256').update(current).digest('hex'),row.sha256);
        assert.deepEqual(row.hunks,[{oldLine:1,newLine:1,before:[],after:current.toString('utf8').split('\n')}]);
    }
    const baseline=cp.execFileSync('git',['show','55fd33e:index.html'],{cwd:root,encoding:'utf8'});
    const reviewed = beforeKnightsOwnerAuto(html);
    const reads=source('approveGeneralHalaqaKnights',reviewed).replaceAll('generalKnightsHalaqa','farsAutoMode')
        .replaceAll('generalKnightsDate','farsAutoDate').replaceAll('generalKnightsReason','farsHalaqaReason')
        .replace("'generalKnightsChoice' + (i + 1)","'fars' + (i + 1) + 'Select'");
    assert.equal(reads,source('approveGeneralHalaqaKnights',baseline),'only field reads change');
    for(const name of ['dayStats','getCumulativeStats','topTied','getWeekTitleCandidates','getDisciplineStars',
        'saveCurrentThreeKnights','ensureWeekKnightsFrozen','lockWeekRows','unfreezeHalaqaWeek','saveSmartProgress'])
        assert.equal(source(name,reviewed),source(name,baseline),name);
    for(const file of ['tv.js','tv.html','programs-store.js','data-store.js','firestore.rules'])
        assert.equal(beforeKnightsOwnerAuto(fs.readFileSync(path.join(root,file),'utf8'),file),cp.execFileSync('git',['show','55fd33e:'+file],{cwd:root,encoding:'utf8'}).replaceAll('\r\n','\n'));
    const mutated=reviewed.replace("const options = '<option value=\"\">اختر البديل</option>'", "const options = '<option value=\"\">تغيير غير معتمد</option>'");
    assert.notEqual(mutated,reviewed);
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
