const { firestoreContext } = require('./helpers/firestore-strict.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const { harness: quick, student, copy, source, html, root, QuranMeasure, generalEntryPoints } = require('./helpers/quick-entry-harness.cjs');
const key = require('./rules/knights-answer-key.json');
const store = fs.readFileSync(root + '/programs-store.js', 'utf8');
const dataStore = fs.readFileSync(root + '/data-store.js', 'utf8');

const measureSpec = spec => ({ from: [spec.from.surah, spec.from.ayah], to: [spec.to.surah, spec.to.ayah] });
function entry(specRow, settings = key.settings, at = 1) {
    const spec = measureSpec(key.passages[specRow.passage]), measured = QuranMeasure.measure({ spec });
    const score = generalEntryPoints({ lines: measured.lines, kind: specRow.kind, gradeId: specRow.grade, settings });
    return { kind: specRow.kind, grade: specRow.grade, spec, iv: measured.intervals, rep: 1, mult: score.mult, points: score.points, at, by: 'synthetic-admin' };
}
function fixtures(variant) {
    return key.students.map(row => {
        const history = {};
        row.days.forEach((d, i) => {
            if (d.state === 'unrecorded') return;
            if (d.state === 'absent') { history[d.date] = { attended: false, absence: 'unexcused' }; return; }
            const settings = variant && row.halaqaId === 'e' && (variant === 'bothTwo' || i >= 2)
                ? { ...key.settings, kindMult: key.variants[variant].kindMult } : key.settings;
            history[d.date] = { attended: true, entries: Object.fromEntries(d.entries.map((e, n) => ['e' + n, entry(e, settings, n + 1)])),
                criteria: copy(d.criteria), criteriaPoints: Object.values(d.criteria).reduce((a, b) => a + b, 0), groupDisciplinePoints: d.groupDisciplinePoints };
        });
        return student({}, { id: row.id, name: row.name, sid: 'synthetic-' + row.id, halaqaId: row.halaqaId,
            direction: 'down', history, ...('joinedOn' in row ? { joinedOn: row.joinedOn } : {}) });
    });
}
function harness(variant) {
    const list = fixtures(variant), h = quick(list[0]);
    Object.assign(h.state.settings, copy(key.settings)); h.state.calendar = copy(key.season);
    if (variant) h.state.settings.kindMult = copy(key.variants[variant].kindMult);
    h.ctx.list = list; h.ctx.approvals = [copy(key.manualApproval)];
    h.run('students = list; todayStr = "2026-11-29"; let honorKnightsLog = approvals; let currentThreeKnights = null;');
    h.run(html.match(/const dayPoints = .*;/)[0]);
    h.install('topTied', 'knightsEligibilityStart', 'densityFor', 'getCumulativeStats', 'summarizeRange', 'calculateStudentAttendance',
        'dayHasAnyViolation', 'getDisciplineCriteriaIds', 'dayMeetsDisciplineCriteria', 'getActiveCriteria', 'getApprovedKnightsForMode');
    h.list = list; h.call = (name, ...args) => { h.ctx.args = args; return copy(h.run(name + '(...args)')); };
    return h;
}

test('knights fixed section-two answer key sha256', () => {
    assert.equal(createHash('sha256').update(fs.readFileSync(root + '/tests/rules/knights-answer-key.json')).digest('hex'),
        '44b02f9751c555db0ea23c74aa0061a5a77367ae45df9c1ec35d186a868cd0f6');
    assert.equal(key.round2.round, 2);
    assert.equal(key.students.every(s => s.expected.round === 2), true);
});

test('real measure: pages 4–8 and partial passages 132/131', () => {
    for (const [id, spec] of Object.entries(key.passages)) assert.equal(Math.round(QuranMeasure.measure({ spec: measureSpec(spec) }).lines * 10), key.passageTenths[id], id);
});

for (const row of key.students) test('fixed daily points and weights: ' + row.name, () => {
    const h = harness(), s = h.list.find(s => s.id === row.id);
    for (const [i, expected] of row.days.entries()) {
        const day = s.history[key.days[i]];
        assert.equal(h.call('dayPoints', day), expected.dayPoints, row.name + ' day ' + (i + 1));
        assert.equal(h.call('dayAcceptedWeightTenths', day, key.settings.kindMult).total, expected.weightTenths, row.name + ' weight ' + (i + 1));
    }
});

for (const [halaqa, days] of Object.entries(key.daily)) for (const [i, names] of days.entries()) test('daily knight ' + halaqa + ' day ' + (i + 1), () => {
    const h = harness(), result = h.call('getDayHalaqaKnights', key.days[i], halaqa, h.list);
    assert.deepEqual(result.names.sort(), [...names].sort());
    assert.equal(result.times, names.length); assert.equal(result.provisional, true);
    assert.equal(result.source, halaqa === 'b' && i === 2 ? 'manual' : 'auto');
});

for (const variant of ['bothTwo', 'midweek']) test('saved multipliers: ' + variant, () => {
    const h = harness(variant), expected = key.variants[variant];
    for (const s of h.list.filter(s => s.halaqaId === 'e')) {
        key.days.forEach((date, i) => {
            assert.equal(h.call('dayPoints', s.history[date]), expected.dailyPoints[s.name][i]);
            assert.equal(h.call('dayAcceptedWeightTenths', s.history[date], h.state.settings.kindMult).total, expected.dailyWeights[s.name][i]);
            assert.deepEqual(h.call('getDayHalaqaKnights', date, 'e', h.list).names.sort(), [...key.daily.e[i]].sort());
        });
        assert.equal(h.call('summarizeRange', s, key.days).weightTenths.total, expected.round2.weight[s.name]);
    }
});

test('weight uses saved multiplier, settings fallback, integer rounding, accepted-only and remains pure', () => {
    const h = harness(), e = entry({kind:'new',passage:5,grade:'excellent'}), day = {entries:{e}};
    e.mult = 2; const original = JSON.stringify(day);
    assert.deepEqual(h.call('dayAcceptedWeightTenths', day, key.settings.kindMult), {new:300,review:0,total:300});
    assert.equal(JSON.stringify(day), original);
    for (const invalid of [undefined, null, '2', NaN, Infinity]) {
        e.mult = invalid; assert.equal(h.call('dayAcceptedWeightTenths', day, {newMemorization:1.25,review:2}).total, 188);
    }
    e.mult = 0; assert.equal(h.call('dayAcceptedWeightTenths', day, key.settings.kindMult).total, 0);
    e.mult = 2; e.grade = 'good'; assert.equal(h.call('dayAcceptedWeightTenths', day, key.settings.kindMult).total, 300);
    e.grade = 'repeat'; assert.equal(h.call('dayAcceptedWeightTenths', day, key.settings.kindMult).total, 0);
    assert.equal(h.call('dayAcceptedWeightTenths', {entries:{old:{kind:'new',points:99},other:{...e,kind:'golden'}}}, key.settings.kindMult).total, 0);
    const s = h.list.find(s => s.name === 'هاني');
    h.state.settings.kindMult = {newMemorization:2,review:2};
    assert.equal(h.call('summarizeRange',s,key.days).weightTenths.total,1032);
    assert.equal(h.call('summarizeRange',s,key.days).points + 40,143.2);
});

test('summarizeRange adds weight only; every pre-existing field retains its baseline result', () => {
    const h = harness(), baseline = cp.execFileSync('git',['show','c1bc38f:index.html'],{cwd:root,encoding:'utf8'});
    h.run(source('summarizeRange',baseline).replace('function summarizeRange(', 'function oldSummary('));
    for (const s of h.list) {
        const result = h.call('summarizeRange',s,key.days);
        const fixed = key.students.find(row => row.id === s.id).expected;
        if (fixed.weightTenths != null) assert.equal(result.weightTenths.total, fixed.weightTenths, s.name);
        if (fixed.weekPoints != null) assert.equal(result.points + result.attended * key.settings.points.attendance, fixed.weekPoints, s.name);
        delete result.weightTenths;
        assert.deepEqual(result,h.call('oldSummary',s,key.days));
    }
});

test('strict tuple equality has no tolerance and does not mutate topTied', () => {
    const h = harness();
    assert.deepEqual(h.call('topTiedBy',[],e=>e),[]);
    h.ctx.tuples = [{keys:[450,600]},{keys:[450,600]},{keys:[450,599]},{keys:[450,600,0]}];
    assert.equal(h.run('topTiedBy(tuples,e=>e.keys).length'),2);
    const base = cp.execFileSync('git',['show','c1bc38f:index.html'],{cwd:root,encoding:'utf8'});
    assert.equal(source('topTied'),source('topTied',base));
});

test('manual rejection restores suggestion: absent, zero weight, blocker, outside halaqa and inactive', () => {
    const h = harness();
    for (const [name,reason] of [['راشد','غائب ذلك اليوم'],['خالد','بلا تسميع مقبول (الوزن 0)'],['تركي','ليس في الحلقة']]) {
        h.ctx.approval = {dateStr:key.days[0],mode:'h:a',fars:[h.list.find(s=>s.name===name)]};
        h.run('honorKnightsLog = [approval]');
        const result = h.call('getDayHalaqaKnights',key.days[0],'a',h.list);
        assert.deepEqual(result.names,['فهد']); assert.equal(result.source,'auto');
        assert.equal(result.rejected,'اعتماد مرفوض ليوم 22-11: '+name+' '+reason);
    }
    h.ctx.approval = {dateStr:key.days[0],mode:'h:d',fars:[h.list.find(s=>s.name==='تركي')]}; h.run('honorKnightsLog = [approval]');
    assert.match(h.call('getDayHalaqaKnights',key.days[0],'d',h.list).rejected,/مخالفة حاجبة/);
    h.state.settings.halaqas.find(h=>h.id==='a').active=false;
    assert.deepEqual(h.call('getDayHalaqaKnights',key.days[0],'a',h.list).names,[]);
});

test('two batches, undo and late sheet recompute temporary daily knight', () => {
    const h=harness(), khalid=h.list.find(s=>s.name==='خالد'), saad=h.list.find(s=>s.name==='سعد');
    const day=khalid.history[key.days[2]], saved=day.entries.e1; delete day.entries.e1;
    assert.deepEqual(h.call('getDayHalaqaKnights',key.days[2],'a',h.list).names,['فهد']);
    day.entries.e1=saved; assert.deepEqual(h.call('getDayHalaqaKnights',key.days[2],'a',h.list).names,['خالد']);
    khalid.history[key.days[3]]={attended:true,entries:{e:entry({kind:'new',passage:7,grade:'excellent'})}};
    assert.deepEqual(h.call('getDayHalaqaKnights',key.days[3],'a',h.list).names,['خالد']);
    khalid.history[key.days[3]]=fixtures()[2].history[key.days[3]];
    assert.deepEqual(h.call('getDayHalaqaKnights',key.days[3],'a',h.list).names.sort(),['راشد','فهد'].sort());
    saad.history[key.days[3]]={attended:true,entries:{n:entry({kind:'new',passage:8,grade:'excellent'}),r:entry({kind:'review',passage:4,grade:'excellent'})}};
    assert.deepEqual(h.call('getDayHalaqaKnights',key.days[3],'a',h.list).names,['سعد']);
});

test('Monday maghrib has two halaqa cards, provisional title and no broadcast ids', () => {
    const h=harness(); h.ctx.getBoardDate=()=>key.days[1]; h.ctx.getBoardWeekRange=()=>({startStr:key.days[0],endStr:key.days[1]});
    h.ctx.getWorkingDatesInRange=()=>key.days.slice(0,2); h.ctx.getGeneralTvBoard=()=>[]; h.ctx.getMostImproved=()=>[]; h.ctx.getWeekTitleCandidates=()=>[];
    const snapshot=h.call('getGeneralTvSnapshot'), cards=snapshot.stages.find(s=>s.period==='maghrib').dayKnights;
    assert.deepEqual(cards,[{stage:'سلمان الفارسي',teacher:'الأستاذ محمد',names:['وليد'],points:[68.1],times:1,provisional:true},{stage:'أبو ذر',teacher:'الأستاذ فهد',names:['يزيد'],points:[55],times:1,provisional:true}]);
    assert.doesNotMatch(JSON.stringify(snapshot),/"id"|"sid"|synthetic-/);
    assert.equal(require('../tv.js').makeSlides(snapshot,'maghrib').find(s=>s.kind==='dayKnights').title,'⭐ فارس اليوم (مؤقت حتى الحسم)');
});

test('eligibility starts at max joinedOn/weekStart, missing is null', () => {
    const h=harness();
    assert.equal(h.call('knightsEligibilityStart',{},key.days[0]),null);
    assert.equal(h.call('knightsEligibilityStart',{joinedOn:key.days[2]},key.days[0]),'2026-11-24');
    assert.equal(h.call('knightsEligibilityStart',{joinedOn:'2026-11-01'},key.days[0]),key.days[0]);
});

// Runs the production store transaction against server documents independent of the UI cache.
function joinedOnHarness(list = [{id: 1}]) {
    const h = harness(); h.install('fixGeneralJoinedOn');
    h.list = copy(list); h.ctx.list = h.list; h.run('students = list');
    h.ctx.requireSchoolCalendar = () => true; h.ctx.renderProgramSettings = () => {};
    const server = new Map(h.list.map(s => ['general/s1/' + s.id, copy(s)]));
    const state = { calls: [], writes: [], retry: null, afterCommit: null, beforeRead: null, failAt: null };
    const ctx = firestoreContext({ beforeWrite: async () => null, db: {}, PROGRAMS: 'programs', SEASONS: 'seasons', STUDENTS: 'students',
        doc: (db, programs, program, seasons, season, students, id) => program + '/' + season + '/' + id,
        runTransaction: async (db, fn) => {
            const call = { reads: [], writes: [] }; state.calls.push(call);
            if (state.failAt === state.calls.length) throw new Error('server unavailable');
            async function attempt() {
                const pending = [];
                const result = await fn({
                    get: async ref => {
                        assert.equal(pending.length, 0, 'all reads must precede writes');
                        call.reads.push(ref); state.beforeRead?.(ref);
                        const row = server.get(ref);
                        return { id: ref.split('/').at(-1), exists: () => !!row, data: () => copy(row) };
                    },
                    update: (ref, patch) => pending.push({ ref, patch: copy(patch) })
                });
                return { result, pending };
            }
            let attemptResult = await attempt();
            if (state.retry) { const retry = state.retry; state.retry = null; retry(); attemptResult = await attempt(); }
            for (const write of attemptResult.pending) {
                Object.assign(server.get(write.ref), write.patch); call.writes.push(write); state.writes.push(write);
            }
            state.afterCommit?.();
            return attemptResult.result;
        }
    });
    Object.defineProperties(ctx, {
        activeProgramId: { get: () => h.state.program }, activeSeasonId: { get: () => h.state.season },
        isReady: { get: () => true }, isReadOnly: { get: () => h.state.archived }
    });
    vm.runInContext('const api={' + storeMethod(dataStore, 'setMissingJoinedOn') + '};', ctx);
    Object.assign(h.ctx.window.almahraData, {
        isReady: () => true, getActiveProgramId: () => h.state.program, getActiveSeasonId: () => h.state.season,
        getStudents: () => h.list,
        setMissingJoinedOn: async (program, season, ids, date) => {
            ctx.args = [program, season, ids, date];
            return copy(await vm.runInContext('api.setMissingJoinedOn(...args)', ctx));
        },
        commitBatch: () => { throw new Error('joinedOn must use transactions'); }
    });
    h.fix = () => h.run('fixGeneralJoinedOn()');
    return Object.assign(h, { server, transactionState: state });
}

test('joinedOn setup confirms, fills missing server values, counts accurately and repeats without changing anything', async () => {
    const h = joinedOnHarness(Array.from({length: 451}, (_, i) => ({id: i + 1})));
    h.server.get('general/s1/451').joinedOn = '2026-11-24';
    h.state.confirmed = false; await h.fix(); assert.equal(h.transactionState.calls.length, 0);
    h.state.confirmed = true; await h.fix();
    assert.match(h.state.prompts.at(-1), /عدد 451 طالب/);
    assert.equal(h.transactionState.calls.length, 2);
    assert.deepEqual(h.transactionState.calls.map(c => c.reads.length), [400, 51]);
    assert.equal(h.transactionState.writes.length, 450);
    assert.equal([...h.server.values()].filter(s => s.joinedOn === key.season.termStart).length, 450);
    assert.equal(h.server.get('general/s1/451').joinedOn, '2026-11-24');
    assert.match(h.state.messages.at(-1).message, /ثُبّت لـ450 طالباً، وتُرك 1/);
    assert.equal(h.state.messages.at(-1).type, 'success');
    const before = copy([...h.server]);
    // Keep a stale local snapshot to force a second server transaction.
    h.list.forEach(s => delete s.joinedOn);
    await h.fix();
    assert.deepEqual([...h.server], before); assert.equal(h.transactionState.writes.length, 450);
    assert.match(h.state.messages.at(-1).message, /ثُبّت لـ0 طالباً، وتُرك 451/);
});

test('joinedOn transaction preserves a server value absent from the local snapshot and reports left 1', async () => {
    const h = joinedOnHarness(); h.server.get('general/s1/1').joinedOn = '2026-11-24';
    await h.fix();
    assert.equal(h.server.get('general/s1/1').joinedOn, '2026-11-24');
    assert.equal(h.transactionState.writes.length, 0);
    assert.match(h.state.messages.at(-1).message, /ثُبّت لـ0 طالباً، وتُرك 1/);
});

test('joinedOn stops after first 400 of 451 when the displayed season changes, without writes to the other season or success', async () => {
    const h = joinedOnHarness(Array.from({length: 451}, (_, i) => ({id: i + 1})));
    h.server.set('general/archive/401', {id: 401, joinedOn: '2026-11-24'});
    h.transactionState.afterCommit = () => { h.state.season = 'archive'; h.state.archived = true; };
    await h.fix();
    assert.equal(h.transactionState.calls.length, 1); assert.equal(h.transactionState.writes.length, 400);
    assert.ok(h.transactionState.writes.every(w => w.ref.startsWith('general/s1/')));
    assert.equal([...h.server].filter(([ref, s]) => ref.startsWith('general/s1/') && !s.joinedOn).length, 51);
    assert.deepEqual(h.server.get('general/archive/401'), {id: 401, joinedOn: '2026-11-24'});
    assert.equal(h.state.messages.at(-1).message, 'توقّف التثبيت لأن الموسم المعروض تغيّر؛ ثُبّت لـ400 طالباً، والباقي 51 — أعد الضغط من الموسم الصحيح');
    assert.ok(h.state.messages.every(m => m.type !== 'success'));
});

test('knightsPerHalaqa defaults in UI, validates integers 1–5 and preserves omitted map keys', () => {
    const h=harness();h.install('readKnightsPerHalaqa');
    h.state.settings.titleRules.knightsPerHalaqa.preserved=4;
    for(const circle of h.state.settings.halaqas)h.element('psKnights_'+circle.id).value=String(key.settings.titleRules.knightsPerHalaqa[circle.id]??1);
    assert.deepEqual(h.call('readKnightsPerHalaqa'),{a:1,b:2,c:1,d:5,e:1,f:1,g:1,preserved:4});
    for(const invalid of ['',0,6,1.5,'NaN']){h.element('psKnights_a').value=invalid;assert.throws(()=>h.call('readKnightsPerHalaqa'),/1 إلى 5/)}
    assert.ok(source('renderGeneralKnightsOnePlace').includes('knightsPerHalaqa?.[h.id] ?? 1'));
    assert.doesNotMatch(source('migrateSettings',store),/knightsPerHalaqa|halaqas/);
});

function storeMethod(text, name) {
    const start=text.indexOf('    '+name+': async '), end=text.indexOf('\n    },',start)+7;
    assert.ok(start>=0&&end>start);return text.slice(start,end);
}
test('manual approval store rejects every general mode before reads, transactions or guard', async () => {
    const ctx = firestoreContext({ beforeWrite: () => assert.fail('guard reached'), console });
    vm.runInContext('const api={'+storeMethod(store,'saveKnightsEntry')+'};',ctx);
    for (const mode of ['h:b','all','discipline','stage1',undefined]) {
        ctx.entry = { ...key.manualApproval, mode };
        const result = copy(await vm.runInContext('api.saveKnightsEntry("general","s1",entry)',ctx));
        assert.equal(result.success,false); assert.equal(typeof result.error,'string');
    }
});
test('manual UI refuses general without reading removed fields or publishing', async () => {
    const h=harness(); h.install('approveGeneralHalaqaKnights','saveGeneralKnightsReplacement','saveCurrentThreeKnights');
    h.ctx.sendGeneralTvSnapshot=()=>assert.fail('publish reached');
    for (const fn of ['approveGeneralHalaqaKnights','saveGeneralKnightsReplacement','saveCurrentThreeKnights'])
        assert.equal(await h.run(fn+'({mode:"all",fars:[]})'),false);
    assert.equal(h.state.knightWrites,0); assert.equal(h.run('currentThreeKnights'),null);
    assert.deepEqual(copy(h.run('honorKnightsLog')),[key.manualApproval]);
});

test('create assigns Riyadh addition day, season import assigns new termStart for keep/reset', async () => {
    const writes=[];class FixedDate extends Date{constructor(...a){super(...(a.length?a:['2026-11-23T21:30:00Z']))}}
    const ctx=firestoreContext({ beforeWrite: async () => null,TextEncoder,structuredClone,Date:FixedDate,Intl,console,db:{},PROGRAMS:'programs',SEASONS:'seasons',STUDENTS:'students',
        activeProgramId:'general',activeSeasonId:'s1',isReady:true,isReadOnly:false,doc:()=> 'student',
        window:{almahraPrograms:{getCurrentSeason:()=>({termStart:key.season.termStart})}},
        runTransaction:async(db,fn)=>fn({get:async()=>({exists:()=>false}),set:(ref,data)=>writes.push(copy(data))}),
        studentsCollectionRef:()=> 'collection',studentDocRef:id=>id,getDocs:async()=>({empty:false,forEach:fn=>fn({id:'1',data:()=>({name:'وهمي',joinedOn:'2025-01-01',history:{}})})}),
        writeBatch:()=>({set:(ref,data)=>writes.push(copy(data)),commit:async()=>{}})});
    vm.runInContext(source('hasUndefined',dataStore)+source('createGeneralStudentIfAbsent',dataStore),ctx);
    ctx.input={id:1,sid:'synthetic',teacherId:'t-a',stage:'primary',halaqaId:'a',history:{},joinedOn:'2020-01-01'};
    assert.equal((await vm.runInContext('createGeneralStudentIfAbsent(input,"s1")',ctx)).success,true);
    assert.equal(writes[0].joinedOn,'2026-11-24');
    vm.runInContext('const api={'+storeMethod(dataStore,'importStudentsFromSeason')+'};',ctx);
    for(const keep of [true,false]){ctx.keep=keep;assert.equal((await vm.runInContext('api.importStudentsFromSeason("general","old",keep)',ctx)).success,true);assert.equal(writes.at(-1).joinedOn,key.season.termStart)}
    assert.match(source('confirmGeneralExcelImport'),/joinedOn: todayStr/);
});

test('joinedOn rechecks context after confirmation and restricts execution to active general', async () => {
    for (const change of [h => {h.state.season = 'other'}, h => {h.state.program = 'summer'}]) {
        const h = joinedOnHarness(); h.state.onConfirm = () => change(h); await h.fix();
        assert.equal(h.transactionState.calls.length, 0);
        assert.match(h.state.messages.at(-1).message, /ثُبّت لـ0 طالباً، والباقي 1/);
        assert.ok(h.state.messages.every(m => m.type !== 'success'));
    }
    for (const overrides of [{archived: true}, {program: 'summer'}, {program: 'review-day'}]) {
        const h = joinedOnHarness(); Object.assign(h.state, overrides); await h.fix();
        assert.equal(h.transactionState.calls.length, 0); assert.equal(h.state.prompts.length, 0);
    }
});

test('joinedOn retries count only the committed attempt, preserve concurrent values and never create missing documents', async () => {
    const h = joinedOnHarness([{id: 1}, {id: 2}, {id: 3}]); h.server.delete('general/s1/3');
    h.transactionState.retry = () => {h.server.get('general/s1/1').joinedOn = '2026-11-24'};
    await h.fix();
    assert.equal(h.transactionState.calls[0].reads.length, 6);
    assert.equal(h.transactionState.writes.length, 1);
    assert.equal(h.server.get('general/s1/1').joinedOn, '2026-11-24');
    assert.equal(h.server.get('general/s1/2').joinedOn, key.season.termStart);
    assert.equal(h.server.has('general/s1/3'), false);
    assert.match(h.state.messages.at(-1).message, /ثُبّت لـ1 طالباً، وتُرك 1/);
});

test('joinedOn store guards explicit context, archive status and the 400 document maximum', async () => {
    for (const [program, season, ids, archived] of [
        ['general', 'other', [1], false], ['summer', 's1', [1], false],
        ['general', 's1', [1], true], ['general', 's1', Array.from({length: 401}, (_, i) => i + 1), false]
    ]) {
        const h = joinedOnHarness(); h.state.archived = archived;
        const result = await h.ctx.window.almahraData.setMissingJoinedOn(program, season, ids, key.season.termStart);
        assert.equal(result.success, false); assert.equal(result.committed, 0); assert.equal(result.skipped, 0);
        assert.equal(h.transactionState.calls.length, 0);
    }
});

test('joinedOn context switch during a transaction read aborts that batch without success', async () => {
    const h = joinedOnHarness(); h.transactionState.beforeRead = () => {h.state.season = 'archive'};
    await h.fix(); assert.equal(h.transactionState.writes.length, 0);
    assert.match(h.state.messages.at(-1).message, /ثُبّت لـ0 طالباً، والباقي 1/);
    assert.ok(h.state.messages.every(m => m.type !== 'success'));
});

test('joinedOn failed second transaction reports only committed students without success', async () => {
    const h = joinedOnHarness(Array.from({length: 451}, (_, i) => ({id: i + 1})));
    h.transactionState.failAt = 2; await h.fix();
    assert.equal(h.transactionState.writes.length, 400);
    assert.match(h.state.messages.at(-1).message, /ثُبّت لـ400 طالباً، وتُرك 0، والباقي 51: server unavailable/);
    assert.ok(h.state.messages.every(m => m.type !== 'success'));
});

test('weight reports unavailable measure and protected calculations remain exact', () => {
    const ctx=firestoreContext({measureEntry:()=>{throw Object.assign(new Error('unavailable'),{code:'NOT_READY'})}});
    vm.runInContext(source('dayAcceptedWeightTenths'),ctx);
    assert.throws(()=>vm.runInContext('dayAcceptedWeightTenths({entries:{e:{kind:"new",spec:{}}}},{newMemorization:3,review:1})',ctx),/unavailable/);
    const baseline=cp.execFileSync('git',['show','c1bc38f:index.html'],{cwd:root,encoding:'utf8'});
    for(const name of ['dayStats','getCumulativeStats','getWeekTitleCandidates','getDisciplineStars','getMostImproved','getGeneralTvBoard','homePrepQualifies','buildEntryPatch','saveGeneralQuickEntry'])
        // الفئة 14 (الجزء ٣: حدّ التحضير صار إعداد homePrepMinGrade) تُعكس بأسطرها المسجلة فقط.
        assert.equal(source(name,require('./helpers/knights-oneplace-audit.cjs').beforeKnightsOnePlaceP3(html)),source(name,baseline),name);
    assert.equal(html.match(/const dayPoints = .*;/)[0],baseline.match(/const dayPoints = .*;/)[0]);
    assert.deepEqual(cp.execFileSync('git',['diff','c1bc38f','--','firestore.rules','tests/rules/board-answer-key.json','tests/rules/homeprep-answer-key.json'],{cwd:root,encoding:'utf8'}),'');
});

test('browser: daily halaqa title and tied names remain visible while nonempty teacher names are hidden', async () => {
    const path=require('node:path');
    const playwright=require(process.env.PLAYWRIGHT_MODULE||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
    const browser=await playwright.chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
    let context;
    try {
        context=await browser.newContext({viewport:{width:1920,height:1080},reducedMotion:'reduce'});
        const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.route('**/*',async route=>{
            const url=new URL(route.request().url()),file=path.resolve(root,decodeURIComponent(url.pathname.slice(1)));
            if(url.origin!=='http://knights.test'||!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.abort();
            await route.fulfill({path:file});
        });
        await page.clock.install({time:new Date('2026-11-29T12:00:00Z')});
        await page.goto('http://knights.test/tv.html');await page.evaluate(()=>document.fonts.ready);
        const cards=key.settings.halaqas.filter(h=>h.stageId==='primary').map(h=>({stage:h.name,
            teacher:key.settings.teachers.find(t=>t.id===h.teacherId).name,
            names:['عبدالرحمن محمد عبدالله','خالد عبد الله سالم'],times:2,provisional:true}));
        assert.ok(cards.every(c=>typeof c.teacher==='string' && c.teacher.trim()),'fixture has nonempty teacher names to hide');
        await page.evaluate(snapshot=>{const channel=new BroadcastChannel('almahra-tv');channel.postMessage(snapshot);channel.close()},
            {type:'snapshot',boardDate:'2026-11-25',stages:[{period:'asr',name:'ابتدائي',dayKnights:cards}]});
        await page.waitForSelector('.slide.active .card');await page.clock.runFor(850);
        assert.equal(await page.locator('.slide.active h2').innerText(),'فارس اليوم (مؤقت حتى الحسم)');
        assert.deepEqual(await page.locator('.slide.active .stage').allTextContents(),cards.map(c=>c.stage));
        assert.doesNotMatch(await page.locator('.slide.active').innerText(), /عدد الفرسان/);
        const visibleCards = await page.locator('.slide.active .card').evaluateAll(cards => cards.map(card => [...card.querySelectorAll('p,h3')].map(n => n.textContent)));
        assert.deepEqual(visibleCards, cards.map(c => [c.stage, ...c.names]));
        const visibleText=await page.locator('.slide.active').innerText();
        for(const card of cards)assert.ok(!visibleText.includes(card.teacher),'day knights hide teacher names (owner 2026-11-07)');
        const bounds=await page.locator('.slide.active .card').evaluateAll(cards=>cards.map(card=>{
            const r=card.getBoundingClientRect();return [...card.querySelectorAll('p,h3')].map(el=>{const b=el.getBoundingClientRect();return {text:el.textContent,inside:b.left>=r.left&&b.right<=r.right&&b.top>=r.top&&b.bottom<=r.bottom,screen:b.left>=96&&b.right<=1824&&b.top>=54&&b.bottom<=1026}})
        }).flat());
        for(const row of bounds)assert.ok(row.inside&&row.screen,JSON.stringify(row));
        assert.deepEqual(errors,[]);
    } finally {await context?.close();await browser.close()}
});
