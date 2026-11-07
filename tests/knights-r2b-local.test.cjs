const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {cloud,runtime,key,GUARD,LOCK}=require('./helpers/knights-r2b-harness.cjs');
const {source,root,copy}=require('./helpers/quick-entry-harness.cjs');
const answers=require('./rules/knights-r2-answer-key.json');
const rows=server=>Object.values(server.season().weekKnightsLog||{});
const operations=[
    ['patchStudent',[1,{'history.2026-11-25.attended':true}]],
    ['commitBatch',[[{type:'update',id:1,fields:{'history.2026-11-25.attended':false}}]]],
    ['createGeneralStudentIfAbsent',[{id:99,sid:'new',teacherId:'t1',stage:'primary',halaqaId:'a',history:{}},'s1']],
    ['upsertStudent',[{id:1,name:'تغيير'}]],['removeStudent',[1]],['saveAllStudents',[[]]],
    ['importStudentsFromSeason',['general','old',true]],['setMissingJoinedOn',['general','s1',[1],key.season.termStart]]
];
for(const [name,args] of operations)test('r2b guard denies before any student operation: '+name,async()=>{
    const server=cloud(),store=server.stores().almahraData;
    let calls=0;store.setWriteGuard(async()=>{calls++;return {ok:false}});
    assert.deepEqual(copy(await store[name](...args)),{success:false,error:GUARD});
    assert.equal(calls,1);assert.equal(server.state.events.length,0);assert.equal(server.state.writes.length,0);
});
for(const [name,args] of [
    ['saveKnightsEntry',['general','s1',key.manualApproval]],
    ['updateSeasonCalendar',['general','s1',key.season,key.season]],
    ['updateSettings',['general',key.settings]],['resetSettings',['general']]
])test('r2b guard denies before any program operation: '+name,async()=>{
    const server=cloud(),store=server.stores().almahraPrograms;store.setWriteGuard(async()=>{throw Error('فشل')});
    assert.deepEqual(copy(await store[name](...args)),{success:false,error:GUARD});
    assert.equal(server.state.events.length,0);assert.equal(server.state.writes.length,0);
});
test('r2b other programs bypass the guard',async()=>{
    const server=cloud(),store=server.stores().almahraPrograms;store.setWriteGuard(()=>{throw Error('must not run')});
    assert.equal((await store.updateSettings('summer',{points:{attendance:8}})).success,true);
    assert.equal((await store.saveKnightsEntry('review-day','s2',{dateStr:'2026-11-25',fars:[]})).success,true);
});
test('r2b late Saad sheet freezes Fahd before writing and adds exactly 70 points',async()=>{
    const server=cloud(),h=runtime(server),store=h.ctx.window.almahraData;
    const saad=server.students().find(s=>s.name==='سعد'),fahd=server.students().find(s=>s.name==='فهد');
    const day=copy(fahd.history['2026-11-22']);
    const before=h.call('knightsDayPointsTenths',day);
    assert.equal(await before,600);
    const score=async student=>{let total=0;for(const value of Object.values(student.history))total+=(await h.call('knightsDayPointsTenths',value))/10+(value.attended===true?10:0);return total};
    const oldPoints=await score(saad);
    const result=await store.patchStudent(saad.id,{'history.2026-11-25':day});
    assert.equal(await score(server.students().find(s=>s.id===saad.id))-oldPoints,70);
    assert.equal(result.success,true);
    assert.equal(rows(server).length,7);assert.equal(rows(server)[0].knights[0].name,'فهد');
    assert.equal(rows(server)[0].nominees.find(s=>s.name==='سعد').eligible,false);
    assert.equal(day.entries.e0.points+day.entries.e1.points+10,70);
    const writes=server.state.writes;
    assert.equal(writes[0].path,'programs/general/seasons/s1');
    assert.equal(writes.at(-1).path,'programs/general/seasons/s1/students/'+saad.id);
    assert.deepEqual(server.season().extra,{preserved:7});
    const count=server.state.events.filter(e=>e.startsWith('read:')).length;
    await h.frozen();await h.frozen();
    assert.equal(server.state.events.filter(e=>e.startsWith('read:')).length,count);
    for(const row of rows(server))assert.match(row.key,/^s1\|2026-11-22\|/);
});
test('r2b two devices freeze simultaneously: one row per halaqa and only one transaction writes',async()=>{
    const server=cloud(),a=runtime(server),b=runtime(server);
    const results=await Promise.all([a.frozen(),b.frozen()]);
    assert.ok(results.every(r=>r.ok));
    assert.equal(rows(server).length,7);assert.equal(server.state.writes.length,1);
    assert.ok(server.state.transactionConflicts >= 1);
    assert.ok(server.state.transactionAttempts >= 3);
    assert.ok(rows(server).every(r=>r.frozenAt.seconds&&r.frozenBy==='fake-admin'&&r.v===1));
});
test('r2b two elapsed weeks freeze in order, including short week and device day change',async()=>{
    const server=cloud();
    for(const s of server.students()){
        const original=copy(s.history);s.history={...original};
        for(const [day,value]of Object.entries(original)){
            const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+7);
            const ds=date.toISOString().slice(0,10);if(ds!=='2026-12-01')s.history[ds]=value;
        }
        server.docs.set('programs/general/seasons/s1/students/'+s.id,s);
    }
    const {entry}=require('./helpers/knights-r2-harness.cjs');
    for(const s of server.students().filter(s=>s.halaqaId==='a')){
        for(const ds of ['2026-11-29','2026-11-30','2026-12-02']){
            s.history[ds]=s.name==='فهد'||s.name==='خالد'&&ds!=='2026-11-30'
                ? {attended:true,entries:{n:entry({kind:'new',passage:5,grade:'excellent'})}}
                : s.name==='سعد'?{attended:true}:{attended:false,absence:'unexcused'};
        }
        server.docs.set('programs/general/seasons/s1/students/'+s.id,s);
    }
    const h=runtime(server,'2026-12-06T12:00:00Z');assert.equal((await h.frozen()).ok,true);
    assert.deepEqual(server.state.writes.map(w=>Object.keys(w.patch.frozenWeeks)),[['2026-11-22'],['2026-11-22','2026-11-29']]);
    const row=rows(server).find(r=>r.halaqaId==='a'&&r.weekStart==='2026-11-29');
    assert.deepEqual(copy(await h.call('knightsMessageLines',server.students()[0],[row],true)),answers.variants.shortWeek.messages['فهد']);
    assert.equal(row.knights[0].name,'فهد');assert.equal(row.schoolDates.length,3);
    assert.deepEqual(copy(row.knights[0].nominations),['2026-11-29','2026-11-30','2026-12-02']);
    const readCount=server.state.events.length;
    class NextDate extends Date{constructor(...args){super(...(args.length?args:['2026-12-07T12:00:00Z']))}static now(){return +new Date('2026-12-07T12:00:00Z')}}
    h.ctx.Date=NextDate;await h.frozen();assert.ok(server.state.events.length>readCount);
});
test('r2b empty school week writes its marker only; failure is retried and never cached',async()=>{
    const server=cloud();server.season().calendar=[{from:'2026-11-22',to:'2026-11-25'}];
    const h=runtime(server);server.state.failRead=true;
    assert.equal((await h.frozen()).ok,false);assert.equal(server.state.writes.length,0);
    server.state.failRead=false;assert.equal((await h.frozen()).ok,true);
    assert.equal(rows(server).length,0);assert.ok(server.season().frozenWeeks['2026-11-22']);
});
test('r2b mandatory refreeze reason, fresh server sheet, history, lock denial and idempotent lock',async()=>{
    const server=cloud(),h=runtime(server);await h.frozen();
    assert.equal((await h.call('unfreezeHalaqaWeek','2026-11-22','a','')).success,false);
    const saad=server.docs.get('programs/general/seasons/s1/students/2');
    saad.history['2026-11-25']=copy(server.docs.get('programs/general/seasons/s1/students/1').history['2026-11-22']);
    let result=await h.call('unfreezeHalaqaWeek','2026-11-22','a','تصحيح ورقة سعد');
    assert.equal(result.success,true);
    let row=rows(server).find(r=>r.halaqaId==='a');
    assert.equal(row.knights[0].name,'سعد');assert.equal(row.v,2);assert.equal(row.refreeze.length,1);
    assert.equal(row.refreeze[0].previous.knights[0].name,'فهد');assert.equal(row.refreeze[0].reason,'تصحيح ورقة سعد');
    result=await h.call('lockWeekRows','2026-11-22','primary','fake-admin');assert.equal(result.success,true);
    row=rows(server).find(r=>r.halaqaId==='a');assert.ok(row.lockedAt);assert.deepEqual(row.lockedSteps,row.steps);
    const count=server.state.writes.length;
    await h.call('lockWeekRows','2026-11-22','primary','another');assert.equal(server.state.writes.length,count);
    assert.equal((await h.call('unfreezeHalaqaWeek','2026-11-22','a','تغيير')).error,'أُعلن الأسبوع؛ لا تُعاد الحسبة');
});
test('r2b size guard rejects atomically including marker and keeps unrelated fields',async()=>{
    const server=cloud(),h=runtime(server);
    server.season().padding='س'.repeat(410000);
    assert.equal((await h.frozen()).ok,false);assert.equal(server.state.writes.length,0);
    assert.equal(server.season().frozenWeeks,undefined);
    assert.equal(h.run('weekKnightsChecks.size'),0);
    const store=h.ctx.window.almahraPrograms;
    const result=await store.saveWeekKnightsRows('general','s1',[],{weekStart:'2026-11-22',frozenAtDevice:0,frozenBy:'a'});
    assert.equal(result.error,'سجل الفرسان كبير؛ راجع المدير');
});
test('r2b snapshot projection uses locked rows, frozen order, statuses and no IDs; row is stable after renames and multipliers',async()=>{
    const server=cloud(),h=runtime(server);await h.frozen();
    assert.deepEqual(copy(await h.call('getLockedWeekKnights','maghrib')),[]);
    await h.call('lockWeekRows','2026-11-22','middle');
    const before=copy(await h.call('getLockedWeekKnights','maghrib'));
    assert.deepEqual(before.map(s=>s.stage),['المقداد بن عمرو','سلمان الفارسي','أبو ذر','حذيفة']);
    assert.equal(before[0].status,'لم يُحسم فارسها هذا الأسبوع');assert.equal(before[3].status,'لا ترشيحات هذا الأسبوع');
    assert.deepEqual(before[1].names,[{name:'هاني',rank:1}]);assert.doesNotMatch(JSON.stringify(before),/"id"/);
    server.docs.get('programs/general').settings.kindMult={newMemorization:99,review:99};
    server.docs.get('programs/general').settings.halaqas=[];
    for(const s of server.students())server.docs.get('programs/general/seasons/s1/students/'+s.id).name='تغيير';
    assert.deepEqual(copy(await h.call('getLockedWeekKnights','maghrib')),before);
});
test('r2b frozen message lines for every student match the locked answer key after names/settings change',async()=>{
    const server=cloud(),h=runtime(server);await h.frozen();
    for(const student of server.students()){
        const actual=copy(await h.call('knightsMessageLines',{...student,name:'تغيير'},h.rows(),true));
        const expected=answers.messages[student.name];
        assert.ok(expected,'answer key entry '+student.name);
        assert.deepEqual(actual,expected,student.name);
    }
});
test('r2b message and copy await lock and never send or copy on failure',async()=>{
    for(const sender of ['sendGeneralWeeklyMessage','copyWeeklyKnightsAnnouncement']){
        const server=cloud(),h=runtime(server);await h.frozen();h.install(sender);
        h.element('generalMessageWeek').value='previous';
        h.ctx.getGeneralMessageWeek=()=>({startStr:'2026-11-22',endStr:'2026-11-28'});
        h.install('getGeneralSchoolDates','getSchoolDayInfo','schoolCivilDate','isSeasonCalendarComplete');
        h.ctx.quranMeta={surahs:{references:[]}};h.ctx.programBrandName=()=> 'المهرة';
        h.ctx.normalizeSaudiPhone=()=> '966500000000';h.ctx.measureReady=()=>true;
        server.state.failTx=true;await h.call(sender,server.students()[0]);
        assert.equal(h.ctx.window.location.href,'unchanged');assert.equal(h.state.copies.length,0);
        assert.equal(h.state.messages.at(-1).message,LOCK);
        server.state.failTx=false;
        let release;server.state.gate=new Promise(r=>release=r);
        const pending=h.call(sender,server.students()[0]);await new Promise(r=>setImmediate(r));
        assert.equal(h.ctx.window.location.href,'unchanged');assert.equal(h.state.copies.length,0);
        release();await pending;
        assert.ok(rows(server).some(r=>r.lockedAt));
        if(sender==='sendGeneralWeeklyMessage')assert.match(decodeURIComponent(h.ctx.window.location.href),/🏆 فارس حلقته للأسبوع/);
        else assert.equal(h.state.copies.length,1);
    }
});
test('r2b TV first sends no closing slide, retries failure on heartbeat, then immediately sends locked slide',async()=>{
    const server=cloud(),h=runtime(server);await h.frozen();h.install('sendGeneralTvSnapshot');
    const sent=[];h.run('generalTv.enabled=true');h.ctx.generalTvReady=()=>true;h.ctx.generalTvContext=()=> 'general:s1';
    h.ctx.postGeneralTv=snapshot=>sent.push(copy(snapshot));
    h.run('let honorKnightsLog=[]');h.ctx.getBoardDate=()=> '2026-11-29';h.ctx.getBoardWeekRange=()=>({startStr:'2026-11-29',endStr:'2026-12-02'});
    h.ctx.getWorkingDatesInRange=()=>[];h.ctx.getGeneralTvBoard=()=>[];h.ctx.getHomePrepWeek=()=>[];h.ctx.getMostImproved=()=>[];
    server.state.failTx=true;await h.call('sendGeneralTvSnapshot');await new Promise(r=>setImmediate(r));
    assert.equal(sent.length,1);assert.equal(sent[0].stages[0].weekKnights,undefined);
    server.state.failTx=false;await h.call('sendGeneralTvSnapshot');await new Promise(r=>setImmediate(r));
    assert.ok(sent.at(-1).stages[0].weekKnights.length);
    const count=server.state.writes.length;await h.call('sendGeneralTvSnapshot');await new Promise(r=>setImmediate(r));
    assert.equal(server.state.writes.length,count);
});
test('r2b general settings migration only adds keys and preserves every existing value including null/false/arrays',()=>{
    const text=fs.readFileSync(root+'/programs-store.js','utf8');
    const defaults=copy(key.settings),ctx=vm.createContext({PROGRAM_DEFS:{general:{defaultSettings:defaults}}});
    vm.runInContext(source('migrateSettings',text),ctx);
    for(const input of [{features:null},{features:false},{features:[]},{features:{attendance:false,custom:8},kindMult:{newMemorization:2},criteria:[],titleRules:null,workingDays:[],custom:9}]){
        ctx.input=copy(input);const output=copy(vm.runInContext("migrateSettings('general',input).settings",ctx));
        const preserves=(old,next)=>{for(const [key,value]of Object.entries(old)){
            if(value&&typeof value==='object'&&!Array.isArray(value))preserves(value,next[key]);
            else assert.deepEqual(next[key],value);
        }};preserves(input,output);
        assert.deepEqual(copy(ctx.input),input);
        ctx.upgraded=output;assert.equal(vm.runInContext("migrateSettings('general',upgraded).changed",ctx),false);
    }
});
test('r2b local patch and batch rollback guard failure, bulk caller waits on returned promise',async()=>{
    const server=cloud(),h=runtime(server);h.ctx.window.almahraData.setWriteGuard(async()=>({ok:false}));
    h.install('commitPatches','commitStudentPatch','restoreStudent');
    const student=h.run('students[0]'),before=copy(student);
    h.ctx.target=student;h.ctx.fields={'history.2026-11-25.attended':false,'history.2026-11-25.absence':'unexcused','history.2026-11-25.note':''};
    assert.equal(h.run('commitStudentPatch(target,fields)'),true);await new Promise(r=>setImmediate(r));
    assert.deepEqual(copy(student),before);assert.match(h.state.messages.at(-1).message,/لا يمكن الحفظ الآن/);
    const result=await h.call('commitPatches',[{student,fields:{name:'تغيير'}}]);
    assert.equal(result,false);assert.deepEqual(copy(student),before);assert.equal(server.state.writes.length,0);
    assert.match(source('saveBulkTierAssign'),/await commitPatches/);
});
test('r2b clock drift warns strictly above ten minutes and review uses frozen data',async()=>{
    const server=cloud();server.state.now-=600001;const h=runtime(server);await h.frozen();
    assert.ok(h.state.messages.some(m=>m.message==='ساعة الجهاز غير مضبوطة'));
    const row=h.rows()[0];row.frozenAt={seconds:(row.frozenAtDevice-600000)/1000};
    assert.equal(await h.call('knightsClockWarning',row),false);
    const text=source('renderWeekKnightsReview');
    for(const token of ['ensureWeekKnightsFrozen','row.nominees','s.reasons','row.lockedAt','data-refreeze','data-reason'])assert.ok(text.includes(token));
});

const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('r2b page load registers both real guards and warns without blocking the page',async()=>{
    const server=cloud(),h=runtime(server,undefined,false);
    server.state.failRead=true;h.install('loadData');
    h.run('loadData()');await tick();
    assert.equal(h.run('students.length'),23);
    assert.ok(h.state.messages.some(m=>m.message===GUARD));
    assert.equal((await h.ctx.window.almahraData.removeStudent(1)).error,GUARD);
    assert.equal((await h.ctx.window.almahraPrograms.resetSettings('general')).error,GUARD);
    assert.equal(server.state.writes.length,0);
    server.state.failRead=false;await h.call('checkWeekKnightsOnLoad');
    assert.equal(rows(server).length,7);
    assert.equal((await h.ctx.window.almahraData.patchStudent(1,{name:'اسم جديد'})).success,true);
    assert.equal((await h.ctx.window.almahraPrograms.resetSettings('general')).success,true);
});
for(const path of ['quick','reset','attendance','present','absence','manual','calendar','settings','resetSettings','create','delete','import'])
test('r2b real UI path rejects failed freeze and preserves local and server data: '+path,async()=>{
    const server=cloud(),h=runtime(server);server.state.failRead=true;
    const before=copy(h.run('students')),stored=copy([...server.docs.entries()]);
    h.install('commitStudentPatch','restoreStudent');
    if(path==='quick'){
        h.run('openSmartModal(1)');await h.save();
    }else if(path==='reset'){
        h.run("todayStr='2026-11-25'");h.install('resetStudentToday');h.run('resetStudentToday()');
    }else if(path==='attendance'){
        h.install('saveAttendanceEdit');h.run('let attEditStudentId=1, attEditChoice=false');
        h.element('attEditDateInput').value='2026-11-25';h.element('attEditAbsence').value='unexcused';
        h.ctx.closeAttendanceEditModal=()=>{};h.run('saveAttendanceEdit()');
    }else if(path==='present'){
        h.install('markPresent');h.run('markPresent(1)');
    }else if(path==='absence'){
        h.install('saveGeneralAbsence');h.ctx.validateGeneralAbsenceDate=()=>true;h.ctx.hijriForDateStr=()=> 'وهمي';
        h.run("let generalAbsenceDraft={seasonId:'s1',dateStr:'2026-11-29',halaqaId:'a',rows:[{id:1,state:'unrecorded',hasEntries:false}]}");
        for(const [id,value]of [['generalAbsenceDate','2026-11-29'],['generalAbsenceHalaqa','a'],['generalReason0','unexcused'],['generalNote0','']])h.element(id).value=value;
        h.element('generalPresent0').checked=false;h.element('generalAbsent0').checked=true;h.element('generalAbsenceModal').classList.remove('hidden');
        await h.call('saveGeneralAbsence');assert.equal(h.run('generalAbsenceDraft.saving'),false);
        assert.equal(h.element('generalAbsenceSave').disabled,false);
    }else if(path==='manual'){
        h.install('approveGeneralHalaqaKnights','launchThreeKnights');h.run('let honorKnightsLog=[],currentThreeKnights=null');
        h.element('farsAutoMode').value='h:a';h.element('farsAutoDate').value='2026-11-22';
        h.element('farsHalaqaReason').value='تصحيح';h.element('fars1Select').value='1';
        assert.equal(await h.call('launchThreeKnights'),false);assert.equal(h.run('currentThreeKnights'),null);
        assert.equal(h.element('threeKnightsModal').classList.contains('hidden'),true);
    }else if(path==='calendar'){
        h.install('saveSeasonCalendar');h.ctx.collectSeasonCalendar=()=>copy(key.season);h.ctx.validateSeasonCalendar=()=>({overlaps:[]});
        h.ctx.calendarSeed=copy(key.season);h.run("let seasonCalendarDraft={seasonId:'s1',expected:calendarSeed}");
        await h.call('saveSeasonCalendar');assert.equal(h.run('seasonCalendarDraft.saving'),false);
    }else if(path==='settings'){
        h.install('commitProgramSettings');await h.call('commitProgramSettings',{settings:copy(key.settings),prog:{id:'general',settings:copy(key.settings)},season:{id:'s1'}});
    }else if(path==='resetSettings'){
        h.install('resetProgramSettings');const p=h.ctx.window.almahraPrograms;
        p.getCurrentProgram=()=>({id:'general',settings:copy(key.settings)});p.getAllStudents=async()=>server.students();
        await h.call('resetProgramSettings');
    }else if(path==='create'){
        h.install('saveStudent','parseTierMin','generalStudentMembership','normalizeArabicKey');
        h.run('let generalStudentSaveInFlight=false');h.ctx.crypto={randomUUID:()=> 'synthetic-new-student'};
        h.ctx.requireSchoolCalendar=()=>true;h.element('studentNameInput').value='طالب مستجد';h.element('studentHalaqaInput').value='a';
        await h.call('saveStudent');assert.equal(h.run('generalStudentSaveInFlight'),false);
    }else if(path==='delete'){
        h.install('executeDelete');h.run('let delId=1');h.ctx.closeDeleteModal=()=>{};h.run('executeDelete()');
    }else if(path==='import'){
        h.install('confirmGeneralExcelImport','normalizeArabicKey','cleanCellText');h.ctx.requireSchoolCalendar=()=>true;
        const row={name:'طالب مستورد',line:1,status:'new',teacherId:'t1',stage:'primary',halaqaId:'a',phone:null};
        h.ctx.importSeed={general:true,seasonId:'s1',rows:[row],rawRows:[row],savedStudents:[]};
        h.run('let pendingImport=importSeed,generalImportInFlight=null');h.ctx.crypto={randomUUID:()=> 'synthetic-import'};
        h.ctx.generalImportContextValid=()=>true;h.ctx.generalImportCanConfirm=()=>true;h.ctx.analyzeGeneralImportRows=()=>[row];
        h.ctx.renderGeneralImportPreview=()=>{};await h.call('confirmGeneralExcelImport');
        assert.equal(h.run('pendingImport.savedStudents.length'),0);
    }
    await tick();
    assert.deepEqual(copy(h.run('students')),before);assert.deepEqual(copy([...server.docs.entries()]),stored);
    assert.equal(server.state.writes.length,0);assert.ok(h.state.messages.some(m=>m.type==='error'&&m.message.includes(GUARD)),JSON.stringify(h.state.messages));
});
test('r2b empty school week needs no measure; a studied week refuses unavailable measure',async()=>{
    for(const empty of [true,false]){
        const server=cloud();if(empty)server.season().calendar=[{from:'2026-11-22',to:'2026-11-25'}];
        const h=runtime(server);h.ctx.measureReady=()=>false;
        assert.equal((await h.frozen()).ok,empty);
        assert.equal(server.state.writes.length,empty?1:0);
    }
});
test('r2b an existing key and unrelated rows survive freezing; stale refreeze cannot overwrite a concurrent lock',async()=>{
    const server=cloud(),h=runtime(server);await h.frozen();
    const store=h.ctx.window.almahraPrograms,original=copy(rows(server)[0]);
    delete server.season().frozenWeeks['2026-11-22'];
    const result=await store.saveWeekKnightsRows('general','s1',[{...original,halaqaName:'تغيير',knights:[]}],{weekStart:'2026-11-22',frozenAtDevice:0,frozenBy:'other'});
    assert.equal(result.success,true);assert.deepEqual(rows(server)[0],original);assert.equal(rows(server).length,7);
    await h.call('lockWeekRows','2026-11-22','primary');const count=server.state.writes.length;
    assert.equal((await store.refreezeWeekKnightsRow('general','s1',original,original.v,'تصحيح','other')).error,'أُعلن الأسبوع؛ لا تُعاد الحسبة');
    assert.equal(server.state.writes.length,count);
});
test('r2b review renders all frozen nominees and exact warnings, and hides refreeze controls after lock',async()=>{
    const server=cloud(),h=runtime(server);await h.frozen();
    await h.call('renderWeekKnightsReview');const host=h.element('weekKnightsReview');
    for(const name of answers.nominees.map(s=>s.name))assert.ok(host.innerHTML.includes(name),name);
    for(const warning of ['بلا مستوفٍ','تعادل تام','أسبوع غير مكتمل','طالب بلا تاريخ استحقاق: مازن — ثبّت التاريخ من الإعدادات'])assert.ok(host.innerHTML.includes(warning),warning);
    assert.ok(host.innerHTML.includes('data-refreeze'));
    await h.call('lockWeekRows','2026-11-22','primary');await h.call('lockWeekRows','2026-11-22','middle');await h.call('renderWeekKnightsReview');
    assert.ok(!host.innerHTML.includes('data-refreeze'));assert.ok(host.innerHTML.includes('أُعلن الأسبوع؛ لا تُعاد الحسبة'));
});

test('r2b Riyadh Wednesday boundary and the same-day server cache',async()=>{
    const server=cloud(),h=runtime(server,'2026-11-25T20:59:59Z');
    assert.equal((await h.frozen()).ok,true);assert.equal(server.state.writes.length,0);
    const reads=server.state.events.length;await h.frozen();assert.equal(server.state.events.length,reads);
    class Midnight extends Date{constructor(...args){super(...(args.length?args:['2026-11-25T21:00:00Z']))}static now(){return +new Date('2026-11-25T21:00:00Z')}}
    h.ctx.Date=Midnight;assert.equal((await h.frozen()).ok,true);assert.equal(rows(server).length,7);
});
test('r2b frozen persisted nominees and announcement match the unmodified answer key',async()=>{
    const server=cloud(),h=runtime(server);await h.frozen();
    const nominees=rows(server).flatMap(r=>r.nominees);
    for(const expected of answers.nominees){const actual=nominees.find(s=>s.id===expected.id);assert.ok(actual);
        assert.deepEqual(copy(Object.fromEntries(Object.keys(expected).map(k=>[k,actual[k]]))),expected,expected.name);}
    const before=JSON.stringify(rows(server)),announcement=await h.call('buildWeeklyKnightsAnnouncement',h.rows());
    assert.equal(announcement,answers.announcement);
    await h.ctx.window.almahraPrograms.updateSettings('general',{...key.settings,kindMult:{newMemorization:2,review:2},halaqas:[]});
    await h.ctx.window.almahraData.patchStudent(17,{name:'اسم جديد',halaqaId:'a'});
    assert.equal(JSON.stringify(rows(server)),before);assert.equal(await h.call('buildWeeklyKnightsAnnouncement',h.rows()),announcement);
});

test('r2b audit accounts for every exact production/test hunk and leaves all four locked keys unchanged',()=>{
    const cp=require('node:child_process'),{changesFrom}=require('./helpers/design-expectation-audit.cjs');
    const audit=require('./rules/design-expectation-audit.json');
    const files=cp.execFileSync('git',['diff','--name-only','0c5ec91'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/);
    const production=files.filter(f=>!f.startsWith('tests/'));
    assert.deepEqual(audit.knightsRound2bProductionChanges,production.map(f=>changesFrom(f,'0c5ec91')));
    const testFiles=files.filter(f=>f.startsWith('tests/')&&f!=='tests/rules/design-expectation-audit.json');
    const hunks=testFiles.flatMap(file=>changesFrom(file,'0c5ec91').hunks.map(h=>({file,...h,category:10,reason:audit.categories['10'],reviewBaseline:'0c5ec91'})));
    assert.deepEqual(audit.knightsRound2bExpectationChanges,hunks);
    assert.equal(audit.categories['10'],'الفرسان الجولة ٢ب باعتماد المالك ٢٠٢٦-١١-٠٦');
    for(const name of ['knights-answer-key','knights-r2-answer-key','board-answer-key','homeprep-answer-key']){
        const f='tests/rules/'+name+'.json';assert.deepEqual(fs.readFileSync(root+'/'+f),cp.execFileSync('git',['show','0c5ec91:'+f],{cwd:root}));
    }
    const original=cp.execFileSync('git',['show','0c5ec91:index.html'],{cwd:root,encoding:'utf8'});
    for(const name of ['dayStats','getCumulativeStats','topTied','getWeekTitleCandidates','getDisciplineStars','buildWeekKnightsRow','buildRevealSteps','rankHalaqaWeekKnights','buildGeneralWeeklyMessage','buildWeeklyKnightsAnnouncement','buildEntryPatch','saveGeneralQuickEntry'])
        assert.equal(source(name),source(name,original),name);
    const oldMessage=source('knightsMessageLines',original);
    const selection=oldMessage.slice(oldMessage.indexOf('            const row ='),oldMessage.indexOf('            if (!row)'));
    assert.equal(source('knightsMessageRow'),'function knightsMessageRow(student, rows) {\n'+selection.replace('const row =','return')+'        }');
    assert.equal(source('knightsMessageLines'),oldMessage.replace(selection,'            const row = knightsMessageRow(student, rows);\n'));
});
