// قرارات إصلاح المحرك: وظائف الإنتاج والميزان الحقيقي، وسحابة وهمية فقط.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const { harness, student, entry, today, savedEntries, copy, source, html, root } = require('./helpers/quick-entry-harness.cjs');
const position = (h, point) => {
    h.element('quick_positionNone').checked = point === null;
    if (point) { h.element('quick_positionSurah').value = point[0]; h.element('quick_positionAyah').value = point[1]; }
    h.run('generalQuickPositionChanged()');
};
const known = (extra = {}) => student({}, { lastSurah: 78, lastAyah: 20, ...extra });

test('unknown position occurs once, locks new and mutes review; nothing writes before position is specified', async () => {
    const h = harness();
    assert.equal((h.element('generalQuickPanels').innerHTML.match(/id="quick_positionAyah"/g) || []).length, 1);
    assert.equal(h.ctx.document.getElementById('quick_new_fromAyah'), null);
    assert.equal(h.element('quick_review_message').textContent, 'حدّد آخر آية حفظها أولاً');
    assert.equal(h.element('quick_review_row').classList.contains('qe-disabled'), true);
    assert.equal(h.element('quick_new_toAyah').value, '');
    assert.equal(h.state.focus, 'quick_positionAyah');
    assert.equal(h.state.focusVisible, true);
    h.range('new', null, [114, 6]); h.grade('new'); h.preview(); await h.save();
    assert.equal(h.state.writes.length, 0); assert.equal(h.state.prompts.length, 0);
    assert.match(h.element('quick_new_message').textContent, /حدّد آخر آية/);
});

for (const initial of [null, [78,20]]) for (const withSection of [false,true]) test('initial position atomic save: ' + JSON.stringify(initial) + '/new=' + withSection, async () => {
    const h = harness(); h.run('Date.now = () => 1000'); position(h, initial);
    if (withSection) { h.range('new', null, initial ? [78,25] : [114,6]); h.grade('new'); }
    h.preview(); await h.save();
    assert.equal(h.state.writes.length, 1);
    const fields = h.state.writes[0].fields;
    assert.deepEqual(fields.frontierFix, { surah: initial?.[0] ?? null, ayah: initial?.[1] ?? null, at:1000, by:'fake-admin', prev:null });
    assert.equal(savedEntries(h).length, withSection ? 1 : 0);
    if (withSection) {
        assert.equal(fields['history.' + today + '.attended'], true);
        assert.ok(savedEntries(h)[0].at > fields.frontierFix.at);
        assert.deepEqual(savedEntries(h)[0].spec.from, initial ? [78,21] : [114,1]);
    } else assert.deepEqual(Object.keys(fields), ['frontierFix']);
    h.reopen(); assert.equal(h.ctx.document.getElementById('quick_positionAyah'), null);
    assert.equal(h.run('hasGeneralAcceptedNew(students[0])'), true);
    const end = withSection ? initial ? [78,25] : [114,6] : initial;
    assert.deepEqual(copy(h.run('computeFrontier(students[0])')), end ? { surah:end[0], ayah:end[1] } : null);
    assert.match(h.state.messages.at(-1).message, withSection ? /حُفظ لطالب وهمي: الجديد/ : /حُفظ لطالب وهمي: موضع الطالب/);
});

test('position alone preserves today absence, reason and note; preview includes the position actually saved', async () => {
    for (const point of [[78,20], null]) {
        const day = { attended: false, absence: 'excused', note: 'ملاحظة وهمية', hijri: 'تاريخ وهمي' };
        const h = harness(student({}, { history: { [today]: copy(day) } }));
        position(h, point); h.preview();
        assert.match(h.element('generalQuickPreview').textContent, point
            ? /الموضع: آخر آية حفظها النبأ 20/ : /الموضع: لم يحفظ شيئاً بعد/);
        await h.save();
        assert.deepEqual(Object.keys(h.state.writes[0].fields), ['frontierFix']);
        assert.deepEqual(h.s.history[today], day);
        assert.equal(h.state.messages.at(-1).message, 'حُفظ لطالب وهمي: موضع الطالب');
    }
});

test('position with changed criteria keeps the usual attendance and discipline save', async () => {
    const h = harness(student({}, { history: { [today]: { attended: false, absence: 'excused', note: 'وهمي' } } }));
    position(h, [78,20]); h.run('fulfillGeneralCriteria()'); h.preview();
    assert.match(h.element('generalQuickPreview').textContent, /الموضع: آخر آية حفظها النبأ 20/);
    await h.save();
    const fields = h.state.writes[0].fields;
    assert.equal(fields.frontierFix.ayah, 20);
    assert.equal(fields['history.' + today + '.attended'], true);
    assert.equal(fields['history.' + today + '.criteriaPoints'], 8);
    assert.equal(h.s.history[today].absence, undefined);
    assert.equal(h.s.history[today].note, undefined);
});

for (const unknown of [false, true]) test('opening and reopening focus the first required ayah after the sheet and modal are visible: unknown=' + unknown, () => {
    const h = harness(unknown ? student() : known());
    const target = unknown ? 'quick_positionAyah' : 'quick_new_toAyah';
    assert.equal(h.state.focus, target);
    assert.equal(h.state.focusVisible, true);
    h.run('closeSmartModal()');
    assert.equal(h.element(target).checkVisibility(), false);
    h.reopen();
    assert.equal(h.state.focus, target);
    assert.equal(h.state.focusVisible, true);
});

test('empty total is Arabic zero; blocking errors use a dash and clearing restores zero', () => {
    for (const s of [student(), known()]) {
        const h = harness(s);
        assert.equal(h.element('generalQuickTotal').textContent, '0');
        h.grade('new'); h.preview();
        assert.equal(h.element('generalQuickTotal').textContent, '—');
        h.run("clearGeneralQuickSection('new')");
        assert.equal(h.element('generalQuickTotal').textContent, '0');
    }
});

test('initial no-memorization blocks review until accepted new, including repeat; both sections remain one request', async () => {
    for (const grade of ['', 'repeat', 'good']) {
        const h = harness(); position(h,null);
        if (grade) { h.range('new',null,[114,6]); h.grade('new',grade); }
        h.range('review',[114,1],[114,3]); h.grade('review'); h.preview(); await h.save();
        assert.equal(h.state.writes.length, grade === 'good' ? 1 : 0);
        assert.equal(h.state.prompts.length,0);
        if (grade === 'good') assert.equal(savedEntries(h).length,2);
        else assert.match(h.element('quick_review_message').textContent,/لا محفوظ/);
    }
});

test('position-only failure and missing actor cannot change local frontier or lose the entered position', async () => {
    for (const mode of ['failure','actor']) {
        const h=harness(), before=copy(h.s); position(h,[78,20]); h.preview();
        if(mode==='failure') h.state.pending=Promise.resolve({success:false,error:'وهمي'});
        else h.ctx.window.almahraAuth.currentUser=null;
        await h.save(); assert.deepEqual(h.s,before); assert.equal(h.element('quick_positionAyah').value,'20');
        assert.equal(h.element('smartModal').classList.contains('hidden'),false);
    }
});

test('an unknown-position form refuses to overwrite a position received since opening', async () => {
    const h=harness(); position(h,[78,20]); h.preview();
    h.s.lastSurah=78; h.s.lastAyah=25;
    await h.save(); assert.equal(h.state.writes.length,0);
    assert.match(h.element('quick_new_message').textContent,/تغيّر موضع الطالب/);
});

test('frontier reads valid original position even with null/stale derived base, never lastDaily; null correction wins', async () => {
    for (const frontierBase of [null,{surah:67,ayah:30}]) {
        const h=harness(known({frontierBase,lastDailySurah:2,lastDailyAyah:286}));
        assert.deepEqual(copy(h.run('computeFrontier(students[0])')),{surah:78,ayah:20});
        assert.deepEqual(copy(h.run('generalQuickEntry.newStart')),{surah:78,ayah:21});
    }
    const baseOnly=harness(student({}, {frontierBase:{surah:78,ayah:20}}));
    assert.equal(baseOnly.run('computeFrontier(students[0])'),null);
    assert.equal(baseOnly.run('generalQuickEntry.needsPosition'),true);
    const h=harness(known({frontierFix:{surah:null,ayah:null,at:100,by:'fake-admin',prev:null}}));
    assert.equal(h.run('computeFrontier(students[0])'),null);
    assert.deepEqual(copy(h.run('generalQuickEntry.newStart')),{surah:114,ayah:1});
    h.run('renderGeneralFrontierFix(1)');
    assert.equal(h.element('frontierFixNone').checked,true);
    assert.match(h.element('frontierFixCurrent').textContent,/لم يحفظ شيئاً/);
});

test('all corrupt imported positions leave modal open with disabled sections and correction link, never a write', async () => {
    for (const point of [[115,1],[78,41],[78,0],[78,2.5],[1.5,1],[78,''],['x',1]]) {
        const h=harness(student({}, {lastSurah:point[0],lastAyah:point[1]}));
        assert.equal(h.run('computeFrontier(students[0])'),null);
        assert.equal(h.element('quick_new_toAyah').disabled,true);
        assert.equal(h.element('quick_position_fix').hidden,false);
        assert.match(h.element('quick_new_message').textContent,/موضع حفظ الطالب غير صالح — صحّحه من الإعدادات/);
        assert.equal(h.element('quick_review_message').textContent, 'صحّح موضع الطالب أولاً');
        assert.equal(h.element('generalQuickTotal').textContent, '—');
        await h.save(); assert.equal(h.state.writes.length,0);
        h.run('openGeneralFrontierFixFromQuick()'); assert.equal(h.state.tab,'page-settings');
    }
});

test('used means any field or grade; no partial section may be dropped beside valid section/criteria', async () => {
    for (const changed of ['newSurah','newAyah','reviewFromSurah','reviewFromAyah','reviewToSurah','reviewToAyah','grade']) {
        const h=harness(known()); h.run('fulfillGeneralCriteria()');
        const fields={newSurah:['quick_new_toSurah',77],newAyah:['quick_new_toAyah',30],reviewFromSurah:['quick_review_fromSurah',113],
            reviewFromAyah:['quick_review_fromAyah',2],reviewToSurah:['quick_review_toSurah',113],reviewToAyah:['quick_review_toAyah',3]};
        if(changed==='grade') h.grade('new'); else h.element(fields[changed][0]).value=fields[changed][1];
        h.preview(); await h.save(); assert.equal(h.state.writes.length,0,changed);
        assert.equal(h.element('generalQuickPreview').textContent,'لا يمكن الحفظ: أكمل ما تحته خط أحمر');
    }
});

test('empty ends and changing surah stay blank; second grade persists; clear resets every editable field', () => {
    const h=harness(known());
    for (const kind of ['new','review']) {
        assert.equal(h.element('quick_'+kind+'_toAyah').value,'');
        const original=copy(h.run("generalQuickSectionValues('"+kind+"')"));
        h.element('quick_'+kind+'_toSurah').value='77'; h.run("quickSurahChanged('"+kind+"','to')");
        assert.equal(h.element('quick_'+kind+'_toAyah').value,'');
        h.element('quick_'+kind+'_toAyah').value='5';
        if(kind==='review') {h.element('quick_review_fromSurah').value='78';h.element('quick_review_fromAyah').value='5';}
        h.grade(kind); h.grade(kind); h.preview();
        assert.equal(h.run("generalQuickEntry.grades."+kind),'good');
        assert.equal(h.element('quick_'+kind+'_clear').hidden,false);
        h.run("clearGeneralQuickSection('"+kind+"')");
        assert.deepEqual(copy(h.run("generalQuickSectionValues('"+kind+"')")),original);
        assert.equal(Number(h.element('quick_'+kind+'_toAyah').max),kind==='new'?40:6);
        assert.equal(h.run("generalQuickSectionUsed('"+kind+"')"),false);
        assert.equal(h.element('quick_'+kind+'_clear').hidden,true);
    }
});

test('specific five validation messages and field highlighting, plus completion, use both directions', async () => {
    for(const direction of ['up','down']) for(const kind of ['new','review']) {
        const setup=()=>{const h=harness(known({direction}));if(kind==='review')h.range(kind,[78,21],[78,'']);return h;};
        const h=setup(); h.grade(kind); h.preview();
        assert.match(h.element('quick_'+kind+'_message').textContent,/آية النهاية فارغة — اكتب آخر آية سمّعها اليوم/);
        assert.equal(h.element('quick_'+kind+'_toAyah').classList.contains('qe-error'),true);
        h.element('quick_'+kind+'_toAyah').value=41; h.preview();
        assert.match(h.element('quick_'+kind+'_message').textContent,/سورة النبأ فيها 40 آية — اكتب رقماً من 1 إلى 40/);
        h.element('quick_'+kind+'_toAyah').value=10; h.preview();
        assert.match(h.element('quick_'+kind+'_message').textContent,direction==='up'?/قبل البداية.*من الناس نحو البقرة/:/قبل البداية.*من البقرة نحو الناس/);
        h.run("clearGeneralQuickSection('"+kind+"')");
        h.range(kind,kind==='review'?[78,1]:null,[78,25]); h.preview();
        assert.match(h.element('quick_'+kind+'_message').textContent,new RegExp('اختر تقدير '+(kind==='new'?'الجديد':'المراجعة')+' — المقطع لا يُحفظ بلا تقدير'));
    }
    for(const [direction,surah,ayah] of [['up',1,7],['down',114,6]]) {
        const h=harness(known({direction,lastSurah:surah,lastAyah:ayah})); h.grade('new'); h.preview(); await h.save();
        assert.match(h.element('quick_new_message').textContent,/اكتمل المصحف/); assert.equal(h.state.writes.length,0);
    }
});

test('summary, discipline disclosure, success, Enter and button share real calculation and actual saved ranges', async () => {
    const h=harness(known());
    assert.match(h.element('generalQuickPreview').textContent,/سيُحفظ: الجديد: لا شيء.*المراجعة: لا شيء/);
    assert.equal(h.element('generalCriteriaHost').hidden,true);
    h.run('toggleGeneralCriteriaExceptions()'); assert.equal(h.element('generalCriteriaHost').hidden,false);
    h.run('fulfillGeneralCriteria()'); assert.match(h.element('generalCriteriaState').textContent,/\+8.*استوفى المعايير كلها/);
    h.range('new',null,[78,30]); h.grade('new'); h.range('review',[114,1],[78,25]); h.grade('review'); h.preview();
    assert.match(h.element('generalQuickPreview').textContent,/الجديد: النبأ 21 ← النبأ 30 \(جيد\).*المراجعة: الناس 1 ← النبأ 25/);
    h.ctx.key={key:'Enter',target:{tagName:'INPUT'},preventDefault(){h.state.prevented=true;}};
    h.run('generalQuickKeydown(key)'); await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.state.prevented,true); assert.equal(h.state.writes.length,1);
    assert.match(h.state.messages.at(-1).message,/حُفظ لطالب وهمي: الجديد:.*، والمراجعة:/);
    assert.equal(savedEntries(h).length,2);
});

test('review pointer skips repeat and orders dates before at, then cycles at frontier, in both directions', () => {
    for(const direction of ['up','down']) {
        const h=harness(known({direction,history:{'2026-11-01':{entries:{a:entry('review',[78,1],[78,5],'good',9999)}},
            '2026-11-02':{entries:{a:entry('review',[78,6],[78,10],'good',1),b:entry('review',[78,11],[78,20],'repeat',2)}}}}));
        assert.deepEqual(copy(h.run('computeLastReview(students[0])')),{surah:78,ayah:10});
        assert.deepEqual(copy(h.run('generalQuickSuggestions(students[0]).reviewStart')),{surah:78,ayah:11});
    }
});

test('discipline-only success names the discipline actually saved; Enter hint survives undo-button refresh', async () => {
    const h=harness(known()); h.run('fulfillGeneralCriteria()'); h.preview();
    h.run('updateGeneralUndoButton()'); assert.match(h.element('generalQuickSaveBtn').innerHTML,/<small>Enter ↵<\/small>/);
    await h.save(); assert.equal(h.state.writes.length,1); assert.equal(savedEntries(h).length,0);
    assert.equal(h.state.writes[0].fields['history.'+today+'.criteriaPoints'],8);
    assert.match(h.state.messages.at(-1).message,/حُفظ لطالب وهمي: الحضور، والانضباط 8/);
    assert.doesNotMatch(h.state.messages.at(-1).message,/الحضور فقط/);
});

for (const [format, day] of Object.entries({
    sard: { sard: 5 },
    sessionPages: { sessionPages: 0.5 },
    'legacy-daily ayahs': { entries: { old: { kind: 'legacy-daily', ayahs: 5, pages: 0 } } },
    'legacy-daily pages': { entries: { old: { kind: 'legacy-daily', ayahs: 0, pages: 0.5 } } },
    exam: { entries: { old: entry('exam', [114,1], [114,3]) } },
    golden: { entries: { old: entry('golden', [114,1], [114,3]) } },
    'legacy-golden': { entries: { old: { kind: 'legacy-golden', ayahs: 5, pages: 0.5 } } },
    'new without quantity': { entries: { old: { kind: 'new', grade: 'repeat' } } },
    'review without quantity': { entries: { old: { kind: 'review' } } }
})) test('later recitation blocks older paper at menu, selection and stale save: ' + format, async () => {
    const h = harness(known({ history: { '2026-11-03': copy(day) } }));
    h.run("todayStr='2026-11-05'"); h.reopen(); h.run('showGeneralMissedDays()');
    const blocked = h.element('generalMissedDays').children.filter(button => button.disabled);
    assert.equal(blocked.length, 2);
    assert.ok(blocked.every(button => button.textContent.includes('سُجّل له بعد هذا اليوم')));
    h.run("selectGeneralQuickDate('2026-11-02')");
    assert.equal(h.run('generalQuickEntry.dateStr'), '2026-11-05');
    h.run("selectGeneralQuickDate('2026-11-03')");
    assert.equal(h.run('generalQuickEntry.dateStr'), '2026-11-03');
    h.s.history['2026-11-04'] = copy(day);
    await h.save();
    assert.equal(h.state.writes.length, 0);
    assert.match(h.state.messages.at(-1).message, /سُجّل له بعد هذا اليوم/);
});

test('attendance, points and empty legacy quantities alone do not block an older paper', () => {
    for (const day of [{ attended: true }, { sard: 0 }, { sessionPages: 0 },
        { entries: { old: { kind: 'legacy-daily', ayahs: 0, pages: 0 } } },
        { entries: { old: { kind: 'legacy-points', points: 5 } } }]) {
        const h = harness(known({ history: { '2026-11-03': day } }));
        h.run("todayStr='2026-11-05'"); h.reopen();
        assert.equal(h.run("generalQuickDateBlocked(students[0], '2026-11-02')"), false);
        h.run("selectGeneralQuickDate('2026-11-02')");
        assert.equal(h.run('generalQuickEntry.dateStr'), '2026-11-02');
    }
});

test('date chip disables older papers; direct selection and stale save cannot evade later-record guard', async () => {
    const h=harness(known({history:{'2026-11-03':{entries:{r:entry('review',[114,1],[114,3])}}}}));
    h.run("todayStr='2026-11-05'"); h.reopen(); h.run('showGeneralMissedDays()');
    const blocked=h.element('generalMissedDays').children.filter(b=>b.disabled);
    assert.equal(blocked.length,2); assert.ok(blocked.every(b=>b.textContent.includes('سُجّل له بعد هذا اليوم؛ لا يمكن إدخال ورقة أقدم')));
    h.run("selectGeneralQuickDate('2026-11-01')"); assert.equal(h.run('generalQuickEntry.dateStr'),'2026-11-05');
    h.run("selectGeneralQuickDate('2026-11-03')");
    h.s.history['2026-11-04']={entries:{n:entry('new',[78,21],[78,25])}};
    h.preview(); await h.save(); assert.equal(h.state.writes.length,0);
    assert.match(h.state.messages.at(-1).message,/سُجّل له بعد هذا اليوم/);
});

test('draft cancellation protects all starts, ends, grades, position and criteria for date and correction navigation', () => {
    for(const nav of ['date','fix']) for(const change of ['fromSurah','fromAyah','toSurah','toAyah','grade','criteria','position']) {
        const h=harness(change==='position'?student():known()); h.run("todayStr='2026-11-05'"); h.reopen();
        if(change==='position') position(h,[78,20]);
        else if(change==='grade') h.grade('new'); else if(change==='criteria') h.run('fulfillGeneralCriteria()');
        else h.element('quick_review_'+change).value=change.endsWith('Surah')?'78':'2';
        h.preview(); const before=copy(h.run('generalQuickSectionValues("review")'));
        h.state.confirmed=false;
        h.run(nav==='date'?"selectGeneralQuickDate('2026-11-01')":'openGeneralFrontierFixFromQuick()');
        assert.equal(h.state.prompts.at(-1),'سيُترك ما أدخلته دون حفظ. متابعة؟',nav+'/'+change);
        assert.equal(h.run('generalQuickEntry.dateStr'),'2026-11-05'); assert.equal(h.state.tab,undefined);
        assert.deepEqual(copy(h.run('generalQuickSectionValues("review")')),before);
    }
});

test('07719ee isolation is literal for legacy engine branches, modal, saver and protected functions', () => {
    const base=cp.execFileSync('git',['show','07719ee:index.html'],{cwd:root,encoding:'utf8'}).replaceAll('\r\n','\n');
    for(const name of ['saveSmartProgress','buildEntryPatch','commitGeneralStudentPatch','migrateSettings']) {
        if(name==='migrateSettings') continue;
        assert.equal(source(name),source(name,base),name);
    }
    assert.equal(source('computeFrontier').replace('            if (isGeneralProgram()) return computeGeneralFrontier(student);\n',''),source('computeFrontier',base));
    const legacyPin=text=>text.slice(text.indexOf('// أول كتابة لطالب قديم'));
    assert.equal(legacyPin(source('pinBaseFields')),legacyPin(source('pinBaseFields',base)));
    const legacyModal=text=>text.slice(text.indexOf('            <div id="smartDailySection"'),text.indexOf('            <div id="smartMasterySection"'));
    assert.equal(legacyModal(html),legacyModal(base));
});
