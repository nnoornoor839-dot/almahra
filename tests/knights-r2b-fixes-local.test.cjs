const { firestoreContext } = require('./helpers/firestore-strict.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {cloud,runtime,key,GUARD}=require('./helpers/knights-r2b-harness.cjs');
const {source,root,copy}=require('./helpers/quick-entry-harness.cjs');
const tick=()=>new Promise(r=>setImmediate(r));
const rows=s=>Object.values(s.season().weekKnightsLog||{});

test('r2b fix 1: setting an earlier term after a same-day check freezes before the late sheet',async()=>{
    const server=cloud();delete server.season().termStart;
    const h=runtime(server);assert.equal((await h.frozen()).ok,true);
    assert.equal(server.state.writes.length,0);
    h.install('saveSeasonCalendar');h.ctx.collectSeasonCalendar=()=>copy(key.season);
    h.ctx.validateSeasonCalendar=()=>({overlaps:[]});
    h.ctx.seed=copy(server.season());h.run("let seasonCalendarDraft={seasonId:'s1',expected:seed}");
    h.ctx.redrawSeasonCalendar=()=>{};h.ctx.updateSchoolCalendarAlert=()=>{};
    await h.call('saveSeasonCalendar');
    assert.equal(h.run("weekKnightsChecks.has('s1')"),false);
    const saad=server.students().find(s=>s.name==='سعد'),fahd=server.students().find(s=>s.name==='فهد');
    server.state.writes.length=0;
    assert.equal((await h.ctx.window.almahraData.patchStudent(saad.id,{'history.2026-11-25':copy(fahd.history['2026-11-22'])})).success,true);
    assert.equal(rows(server).length,7);
    assert.equal(rows(server).find(r=>r.halaqaId==='a').knights[0].name,'فهد');
    assert.equal(server.state.writes[0].path,'programs/general/seasons/s1');
    assert.match(server.state.writes.at(-1).path,/students/);
    const reads=server.state.events.length;await h.frozen();assert.equal(server.state.events.length,reads);
    h.ctx.window.almahraPrograms.getCurrentSeason().termEnd='2027-01-15';
    await h.frozen();assert.ok(server.state.events.length>reads);
});

test('r2b fix 2: moved Hani message locks the stage of its selected frozen winning row',async()=>{
    const server=cloud(),h=runtime(server);await h.frozen();
    const hani=server.students().find(s=>s.name==='هاني');
    await h.ctx.window.almahraData.patchStudent(hani.id,{halaqaId:'a'});
    // الجزء ٣: لا إعادة حسم في general؛ الرسالة تقفل مرحلة سطر فوزه المجمَّد الأصلي.
    assert.equal((await h.call('unfreezeHalaqaWeek','2026-11-22','a','نقل الطالب')).error,'الحسم نهائي؛ لا تُعاد الحسبة');
    h.install('sendGeneralWeeklyMessage');h.element('generalMessageWeek').value='previous';
    h.ctx.getGeneralMessageWeek=()=>({startStr:'2026-11-22',endStr:'2026-11-28'});
    h.install('getGeneralSchoolDates','getSchoolDayInfo','schoolCivilDate','isSeasonCalendarComplete');
    h.ctx.quranMeta={surahs:{references:[]}};h.ctx.programBrandName=()=> 'المهرة';
    h.ctx.normalizeSaudiPhone=()=> '966500000000';h.ctx.measureReady=()=>true;
    await h.call('sendGeneralWeeklyMessage',{...hani,halaqaId:'a'});
    assert.match(decodeURIComponent(h.ctx.window.location.href),/🏆 فارس حلقته للأسبوع/);
    assert.ok(rows(server).find(r=>r.halaqaId==='e').lockedAt);
    assert.equal((await h.call('unfreezeHalaqaWeek','2026-11-22','e','تصحيح')).error,'الحسم نهائي؛ لا تُعاد الحسبة');
});

for(const failure of ['guard','throw','reject','pending-success'])test('r2b fix 3: backup preserves the original local list until confirmed save: '+failure,async()=>{
    const server=cloud(),h=runtime(server);h.install('isValidStudentBackup','importNuclearBackup','generalStudentMembership');
    const original=h.run('students'),before=copy(original),backup=[{...copy(original[0]),history:{},sid:'backup-sid',name:'نسخة مستعادة'}];
    h.ctx.requireSchoolCalendar=()=>true;h.ctx.studentsCountLabel=n=>String(n);h.ctx.confirm=()=>true;
    h.run('let _noLevelWarned={},_cloudSaveTimeout=null,_lastCloudSyncFromMe=0');
    h.ctx.FileReader=class{readAsText(){h.ctx.readBackup=()=>this.onload({target:{result:JSON.stringify(backup)}})}};
    h.install('saveData');h.ctx.refreshToday=()=>{};
    const data=h.ctx.window.almahraData;
    let release;
    if(failure==='guard')data.setWriteGuard(async()=>({ok:false}));
    else if(failure==='throw')data.saveAllStudents=()=>{throw Error('synthetic failure')};
    else if(failure==='reject')data.saveAllStudents=async()=>{throw Error('synthetic failure')};
    else data.saveAllStudents=()=>new Promise(r=>release=r);
    await h.call('importNuclearBackup',{target:{files:[{}]}});
    const pending=h.ctx.readBackup();await tick();
    assert.equal(h.run('students'),original);assert.deepEqual(copy(h.run('students')),before);
    assert.ok(!h.state.messages.some(m=>m.type==='success'));
    if(release){release({success:true});await pending;assert.equal(h.run('students[0].name'),'نسخة مستعادة');assert.ok(h.state.messages.some(m=>m.type==='success'));}
    else {
        await pending;assert.equal(server.state.writes.length,0);
        assert.ok(h.state.messages.some(m=>m.type==='error'&&m.message.includes(failure==='guard'?GUARD:'synthetic failure')));
    }
});

test('r2b fix 4: startup migrates current server settings and preserves another device changes',async()=>{
    const text=fs.readFileSync(root+'/programs-store.js','utf8'),settings={kindMult:{newMemorization:3},halaqas:[]};
    let stored={settings,activeSeasonId:'s1'},writes=0,reads=0,transactions=0;
    const snap=()=>{const data=copy(stored);return {exists:()=>true,data:()=>copy(data)}};
    const ctx=firestoreContext({PROGRAM_DEFS:{general:{id:'general',defaultSettings:copy(key.settings)}},db:{},PROGRAMS:'programs',
        SETTINGS_VERSION:1,initializationErrors:[],console:{log(){},error(e){throw e}},doc:()=> 'programs/general',
        getDoc:async()=>{const s=snap();if(++reads===1)stored.settings={...stored.settings,kindMult:{newMemorization:9,review:2},halaqas:[{id:'other-device'}]};return s},
        updateDoc:async(_,patch)=>{writes++;Object.assign(stored,patch)},
        runTransaction:async(_,fn)=>{transactions++;return fn({get:async()=>snap(),update:(_,patch)=>{writes++;Object.assign(stored,patch)}})}});
    vm.runInContext(source('migrateSettings',text)+'\n'+source('ensureProgramsExist',text),ctx);
    await vm.runInContext('ensureProgramsExist()',ctx);
    assert.deepEqual(copy(stored.settings.kindMult),{newMemorization:9,review:2});assert.deepEqual(copy(stored.settings.halaqas),[{id:'other-device'}]);
    assert.equal(transactions,1);assert.equal(writes,1);
    await vm.runInContext('ensureProgramsExist()',ctx);assert.equal(writes,1);
});

test('r2b fix 5: heartbeat recovers failed load freeze and sends a locked closing slide within two beats',async()=>{
    const server=cloud(),h=runtime(server);server.state.failRead=true;
    await h.call('checkWeekKnightsOnLoad');assert.equal(rows(server).length,0);
    h.install('sendGeneralTvSnapshot');const sent=[];h.run('generalTv.enabled=true');
    h.ctx.generalTvReady=()=>true;h.ctx.generalTvContext=()=> 'general:s1';h.ctx.postGeneralTv=s=>sent.push(copy(s));
    h.ctx.getGeneralTvSnapshot=()=>({weekKnights:h.run("getLockedWeekKnights('asr')")});
    server.state.failRead=false;
    let release;server.state.gate=new Promise(r=>release=r);
    await h.call('sendGeneralTvSnapshot');await h.call('sendGeneralTvSnapshot');await tick();
    release();await tick();await tick();
    assert.equal(rows(server).length,7);assert.ok(rows(server).every(r=>r.lockedAt));
    assert.ok(sent.some(s=>s.weekKnights.length));
    assert.equal(server.state.writes.length,3,'one freeze and one lock per stage');
});

test('r2b fix 6: overlapping reads retry the losing device without another freeze write',async()=>{
    const server=cloud(),a=runtime(server),b=runtime(server);
    let release;const gate=new Promise(r=>release=r),reads=[];
    server.state.onTransactionRead=async info=>{if(info.attempt===0){reads.push(info);await gate}};
    const pending=Promise.all([a.frozen(),b.frozen()]);await tick();
    try {assert.equal(reads.length,2);assert.equal(server.state.writes.length,0);}finally{release()}
    const results=await pending;
    assert.ok(results.every(r=>r.ok));assert.equal(rows(server).length,7);assert.equal(server.state.writes.length,1);
    assert.ok(server.state.transactionConflicts>=1);assert.ok(server.state.transactionAttempts>=3);
    assert.deepEqual(server.state.transactionCommits.map(t=>t.writes),[1,0]);
});

// الجزء ٣ (٢٠٢٦-١١-٠٨): إعادة الحسم في general تُرفض قبل أي قراءة معاملة، فلا سباق؛ القفل يمضي وحده.
test('r2b fix 6: beside a concurrent lock, a general refreeze is refused before any transaction read and the lock commits alone',async()=>{
    const server=cloud(),h=runtime(server);await h.frozen();
    const old=copy(rows(server).find(r=>r.halaqaId==='a')),store=h.ctx.window.almahraPrograms;
    let release;const gate=new Promise(r=>release=r),reads=[];
    server.state.onTransactionRead=async info=>{if(info.attempt===0){reads.push(info);await gate}};
    const pending=Promise.all([store.lockWeekRows('general','s1','2026-11-22','primary','a'),
        store.refreezeWeekKnightsRow('general','s1',{...old,halaqaName:'تغيير'},old.v,'تصحيح','b')]);
    await tick();try{assert.equal(reads.length,1);assert.equal(server.state.writes.length,1);}finally{release()}
    const result=await pending;
    assert.equal(result[0].success,true);assert.equal(result[1].error,'الحسم نهائي؛ لا تُعاد الحسبة');
    assert.equal(server.state.writes.length,2);assert.equal(rows(server).find(r=>r.halaqaId==='a').halaqaName,old.halaqaName);
});

test('r2b fix 6: a general refreeze issued before a concurrent lock is refused with no read or write; the lock locks the original version',async()=>{
    const server=cloud(),h=runtime(server);await h.frozen();
    const old=copy(rows(server).find(r=>r.halaqaId==='a')),store=h.ctx.window.almahraPrograms;
    let release;const gate=new Promise(r=>release=r),reads=[];
    server.state.onTransactionRead=async info=>{if(info.attempt===0){reads.push(info);await gate}};
    const pending=Promise.all([
        store.refreezeWeekKnightsRow('general','s1',{...old,halaqaName:'حلقة مصححة'},old.v,'تصحيح','b'),
        store.lockWeekRows('general','s1','2026-11-22','primary','a')]);
    await tick();try{assert.equal(reads.length,1);assert.equal(server.state.writes.length,1);}finally{release()}
    const result=await pending;assert.equal(result[0].error,'الحسم نهائي؛ لا تُعاد الحسبة');assert.equal(result[1].success,true);
    const row=rows(server).find(r=>r.halaqaId==='a');
    assert.equal(row.halaqaName,old.halaqaName);assert.ok(row.lockedAt);assert.equal(row.v,old.v+1);
    assert.equal(server.state.writes.length,2);
});
