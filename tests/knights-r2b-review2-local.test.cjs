const {test}=require('node:test');
const assert=require('node:assert/strict');
const {cloud,runtime,LOCK}=require('./helpers/knights-r2b-harness.cjs');
const {copy}=require('./helpers/quick-entry-harness.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const rows=server=>Object.values(server.season().weekKnightsLog||{});

for(const context of ['summer','season'])test('r2b review2 restore: pending general backup preserves the newly opened '+context,async()=>{
    const server=cloud(),h=runtime(server);
    h.install('isValidStudentBackup','importNuclearBackup','generalStudentMembership');
    const backup=[{...copy(h.run('students[0]')),history:{},sid:'backup-sid',name:'نسخة العام'}];
    h.ctx.requireSchoolCalendar=()=>true;h.ctx.studentsCountLabel=String;h.ctx.confirm=()=>true;
    h.run("let _noLevelWarned={key:'unchanged',ids:[]}");
    h.ctx.FileReader=class{readAsText(){h.ctx.readBackup=()=>this.onload({target:{result:JSON.stringify(backup)}})}};
    let release;
    const writes=[];
    h.ctx.window.almahraData.saveAllStudents=()=>new Promise(resolve=>release=()=>{writes.push('general:s1');resolve({success:true})});
    h.ctx.saveData=()=>writes.push('wrong-context');
    await h.call('importNuclearBackup',{target:{files:[{}]}});
    const pending=h.ctx.readBackup();await tick();assert.equal(typeof release,'function');
    h.ctx.window.almahraPrograms.getCurrentProgramId=()=>context==='summer'?'summer':'general';
    h.ctx.window.almahraPrograms.getCurrentSeasonId=()=>context==='summer'?'summer-s1':'s2';
    h.ctx.openedStudents=[{id:901,name:'طالب القائمة المفتوحة',history:{'2026-11-22':{attended:true,entries:{saved:{points:33}}}}}];
    h.run('students=openedStudents');const opened=h.run('students'),before=copy(opened),updates=h.state.updates;
    release();await pending;
    assert.equal(h.run('students'),opened);assert.deepEqual(copy(opened),before);
    assert.deepEqual(writes,['general:s1']);assert.equal(h.state.updates,updates);
    assert.equal(h.run('_noLevelWarned.key'),'unchanged');
    assert.ok(!h.state.messages.some(m=>m.type==='success'));
});

function prepareSender(h){
    h.install('sendGeneralWeeklyMessage','getGeneralSchoolDates','getSchoolDayInfo','schoolCivilDate','isSeasonCalendarComplete');
    h.element('generalMessageWeek').value='previous';
    h.ctx.getGeneralMessageWeek=()=>({startStr:'2026-11-22',endStr:'2026-11-28'});
    h.ctx.quranMeta={surahs:{references:[]}};h.ctx.programBrandName=()=> 'المهرة';
    h.ctx.normalizeSaudiPhone=()=> '966500000000';h.ctx.measureReady=()=>true;
}

// الجزء ٣ (٢٠٢٦-١١-٠٨): الحسم نهائي في general؛ محاولة إعادة الحسم قبل الإرسال أو بعده تُرفض بلا معاملة، والرسالة تُبنى من السطر الأصلي المقفل.
for(const first of ['refreeze','lock'])test('r2b review2 message: moved Hani, a correction refreeze attempted '+(first==='refreeze'?'before':'after')+' the send is refused; the message uses the original locked row',async()=>{
    const server=cloud(),h=runtime(server),other=runtime(server);await h.frozen();
    const hani=server.students().find(s=>s.name==='هاني');
    await h.ctx.window.almahraData.patchStudent(hani.id,{halaqaId:'a'});
    assert.equal((await h.call('unfreezeHalaqaWeek','2026-11-22','a','نقل هاني')).error,'الحسم نهائي؛ لا تُعاد الحسبة');
    const moved={...hani,halaqaId:'a'};
    assert.equal((await h.call('knightsMessageRow',moved,h.rows())).halaqaId,'e');
    await other.ctx.window.almahraData.patchStudent(hani.id,{
        'history.2026-11-22.groupDisciplinePoints':100,
        'history.2026-11-23':{...copy(hani.history['2026-11-22']),groupDisciplinePoints:100}
    });
    prepareSender(h);
    // اشتراك الموسم يرى حسم أ الجديد حتى إن كانت نتيجة قفل هـ قد سبقتْه.
    h.ctx.window.almahraPrograms.getCurrentSeason=()=>server.season();
    let built;
    const build=h.ctx.buildGeneralWeeklyMessage;
    h.ctx.buildGeneralWeeklyMessage=(student,week,settings)=>{
        built=h.ctx.knightsMessageRow(student,settings.weekKnightsRows.filter(r=>r.weekStart===week.startStr));
        assert.ok(built?.lockedAt,'the row used to build the outgoing message must be locked');
        assert.deepEqual(copy(built),rows(server).find(r=>r.key===built.key),'build from the confirmed locked server version');
        return build(student,week,settings);
    };
    const before=server.state.writes.length;
    let result;
    if(first==='refreeze')result=await other.call('unfreezeHalaqaWeek','2026-11-22','a','تصحيح تسجيلات هاني');
    if(first==='refreeze')assert.equal(server.state.writes.length,before);
    await h.call('sendGeneralWeeklyMessage',moved);
    if(first==='lock')result=await other.call('unfreezeHalaqaWeek','2026-11-22','a','تصحيح تسجيلات هاني');
    assert.equal(result.success,false);assert.equal(result.error,'الحسم نهائي؛ لا تُعاد الحسبة');
    assert.equal(built.halaqaId,'e');assert.ok(built.lockedAt);
    const message=decodeURIComponent(h.ctx.window.location.href);
    for(const line of await h.call('knightsMessageLines',moved,[built],true))assert.ok(message.includes(line));
    const count=server.state.writes.length;
    assert.equal((await other.call('unfreezeHalaqaWeek','2026-11-22',built.halaqaId,'بعد الإرسال')).error,'الحسم نهائي؛ لا تُعاد الحسبة');
    assert.equal(server.state.writes.length,count);
});

test('r2b review2 message: stop after three locks if selection still points to an unlocked row',async()=>{
    const server=cloud(),h=runtime(server);await h.frozen();prepareSender(h);
    let attempts=0,builds=0;
    h.ctx.lockWeekRows=async()=>{attempts++;return {success:true,season:copy(server.season())}};
    h.ctx.buildGeneralWeeklyMessage=()=>{builds++;return 'must not send'};
    await h.call('sendGeneralWeeklyMessage',server.students()[0]);
    assert.equal(attempts,3);assert.equal(builds,0);
    assert.equal(h.ctx.window.location.href,'unchanged');assert.equal(h.state.messages.at(-1).message,LOCK);
});

test('r2b review2 announcement: builds only from confirmed locked rows',async()=>{
    const server=cloud(),h=runtime(server);await h.frozen();
    const build=h.ctx.buildWeeklyKnightsAnnouncement;let built;
    h.ctx.buildWeeklyKnightsAnnouncement=list=>{
        built=copy(list);assert.ok(list.length&&list.every(r=>r.lockedAt));
        for(const row of list)assert.deepEqual(copy(row),rows(server).find(r=>r.key===row.key));
        return build(list);
    };
    await h.call('copyWeeklyKnightsAnnouncement');
    assert.equal(built.length,7);assert.equal(h.state.copies.length,1);
    for(const row of built)assert.equal((await h.call('unfreezeHalaqaWeek',row.weekStart,row.halaqaId,'بعد النسخ')).error,'الحسم نهائي؛ لا تُعاد الحسبة'); // الجزء ٣: الرفض العام يسبق فحص القفل
});
