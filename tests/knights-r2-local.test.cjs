const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const { harness, entry, functions } = require('./helpers/knights-r2-harness.cjs');
const { source, html, root, copy } = require('./helpers/quick-entry-harness.cjs');
const key = require('./rules/knights-r2-answer-key.json');
const input = require('./rules/knights-answer-key.json');
const selected = (actual, expected) => Object.fromEntries(Object.keys(expected).map(k => [k, actual[k]]));
const deepFreeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); } return value; };

// تبقى نصوص المفتاح المقفل حرفية؛ الإضافة الوحيدة هي بيانات خروج كل اسم.
function withExitItems(steps) {
    const expected = copy(steps), nominees = expected.find(s => s.scene === 'list')?.nominees || [];
    const extend = exit => {
        exit.items = exit.names.map(name => {
            const days = nominees.find(s => s.name === name).days;
            return { name, days, daysText: days === 1 ? 'فارس يومٍ واحد' : days === 2 ? 'فارس يومين' : 'فارس ' + days + ' أيام' };
        });
    };
    for (const step of expected) {
        if (step.scene === 'exit') extend(step);
        for (const exit of step.exits || []) extend(exit);
    }
    return expected;
}

test('r2 fixed sha256, exact current reference section and protected round-one key', () => {
    assert.equal(createHash('sha256').update(fs.readFileSync(root + '/tests/rules/knights-r2-answer-key.json')).digest('hex'),
        '3752066efcecd2ed440809b43166f88f97329f5589a0dbd983cb48b9f52ba804');
    assert.equal(createHash('sha256').update(fs.readFileSync(root + '/tests/rules/knights-answer-key.json')).digest('hex'),
        '44b02f9751c555db0ea23c74aa0061a5a77367ae45df9c1ec35d186a868cd0f6');
    const reference = fs.readFileSync('D:/المهره/notes/knights-realism-table.md', 'utf8').replaceAll('\r\n', '\n');
    assert.equal(key.verbatimAnswerKey, reference.slice(reference.indexOf('## ٢)'), reference.indexOf('\n## ٣)')).trimEnd());
    assert.equal(key.verbatimAnswerKey, input.verbatimAnswerKey);
});

for (const id of ['a','b','d','c','e','f','g']) test('r2 real nominations, attendance, eligibility, integer totals, ranks, knights and verbatim scenes: ' + id, () => {
    const h = harness(), row = h.row(id);
    const expected = key.nominees.filter(s => input.students.find(x => x.id === s.id).halaqaId === id);
    assert.equal(row.nominees.length, expected.length);
    for (const s of row.nominees) {
        const wanted = expected.find(x => x.id === s.id);
        assert.deepEqual(selected(s, wanted), wanted, s.name);
        assert.equal(Number.isInteger(s.weekPointsTenths), true);
        for (const n of Object.values(s.weightTenths)) assert.equal(Number.isInteger(n), true);
    }
    const nominations = h.call('getWeekNominations', h.range, id, h.list, h.approvals, h.settings);
    assert.deepEqual(nominations.nominees, expected.slice().sort((a,b)=>a.id-b.id).map(s => selected(s,{id:0,name:'',nominations:[]})));
    assert.deepEqual(nominations.rejectedApprovals, []);
    const ranked = h.call('rankHalaqaWeekKnights', h.range, id, row.n, h.list, h.approvals, h.settings);
    assert.deepEqual(ranked.nominees, row.nominees);
    assert.deepEqual(ranked.knights, row.knights);
    assert.deepEqual(row.knights.map(s => s.name), key.knights[id]);
    assert.deepEqual(row.steps, withExitItems(key.steps[id]));
    assert.deepEqual(h.call('buildRevealSteps', row), withExitItems(key.steps[id]));
});

test('r2 row is a deterministic owned snapshot; input order, mutable globals and clock cannot affect it', () => {
    const h = harness();
    deepFreeze(h.list); deepFreeze(h.settings); deepFreeze(h.approvals); deepFreeze(h.range);
    for (const halaqa of h.settings.halaqas) {
        const row = h.row(halaqa.id), serialized = JSON.stringify(row);
        assert.equal(JSON.stringify(h.row(halaqa.id)), serialized);
        assert.equal(JSON.stringify(h.row(halaqa.id, [...h.list].reverse())), serialized);
        assert.equal(JSON.stringify(h.row(halaqa.id, [...h.list.slice(5), ...h.list.slice(0,5)])), serialized);
        assert.equal(row.key, h.range.startStr + '|' + halaqa.id); assert.equal(row.v, 1);
        assert.equal(row.weekStart, h.range.startStr); assert.equal(row.weekEnd, h.range.endStr);
        assert.equal(row.halaqaName, halaqa.name); assert.equal(row.halaqaOrder, halaqa.order);
        assert.equal(row.teacherName, h.settings.teachers.find(t => t.id === halaqa.teacherId).name);
        assert.equal(row.stageName, h.settings.stages.find(s => s.id === halaqa.stageId).name);
        assert.deepEqual(row.kindMult, h.settings.kindMult); assert.deepEqual(row.schoolDates, input.days);
        assert.equal(row.n, input.settings.titleRules.knightsPerHalaqa[halaqa.id] ?? 1);
        assert.equal(row.weeklyAttendancePct, 75);
        assert.doesNotMatch(serialized, /frozenAt|lockedAt|lockedBy|serverTimestamp|frozenBy|refreeze|revealed/);
        const before = JSON.stringify(row); deepFreeze(row);
        assert.equal(JSON.stringify(h.call('buildRevealSteps', row)), JSON.stringify(row.steps));
        assert.equal(JSON.stringify(row), before);
    }
});

for (const rejected of key.rejectedApprovals) test('r2 verbatim rejected approval falls back to suggestion: ' + rejected.name, () => {
    const h = harness(), s = h.list.find(s => s.name === rejected.name);
    const approvals = [{dateStr: rejected.dateStr, mode:'h:a', fars:[{id:s.id,name:s.name}],reason:'تشجيع'}];
    const result = h.call('getWeekNominations', h.range, 'a', h.list, approvals, h.settings);
    assert.deepEqual(result.rejectedApprovals, [rejected]);
    assert.deepEqual(result.nominees, h.call('getWeekNominations', h.range, 'a', h.list, [], h.settings).nominees);
});

test('r2 each invalid selection is identified; valid approvals replace the full daily group and duplicates earn one nomination', () => {
    const h = harness();
    const approvals = [{dateStr:input.days[0], mode:'h:a', fars:[{id:4,name:'راشد'},{id:3,name:'خالد'}]}];
    assert.deepEqual(h.call('getWeekNominations',h.range,'a',h.list,approvals,h.settings).rejectedApprovals,key.rejectedApprovals);
    const chosen = [{dateStr:input.days[1],mode:'h:a',fars:[{id:1,name:'اسم قديم'},{id:1,name:'اسم قديم'}]}];
    const result = h.call('getWeekNominations',h.range,'a',h.list,chosen,h.settings);
    assert.deepEqual(result.nominees.find(s=>s.id===1).nominations,[input.days[0],input.days[1],input.days[3]]);
    assert.equal(result.nominees.some(s=>s.id===2),false);
    assert.equal(result.nominees.find(s=>s.id===1).name,'فهد');
});

test('r2 Mazen has only the fixed missing-joinedOn reason and no attendance percentage', () => {
    const h = harness(), mazen = h.row('d').nominees.find(s => s.name === 'مازن');
    assert.deepEqual(mazen.reasons, ['بلا تاريخ استحقاق (joinedOn غير مثبَّت)']);
    assert.equal(mazen.attendance.pct, null); assert.equal(mazen.joinedOn, null); assert.equal(mazen.eligible, false);
});

test('r2 Omar 170 loses by integer weekly points after equal weight', () => {
    const h = harness(), s = h.list.find(s=>s.name==='عمر'), day = s.history[input.days[3]];
    day.criteria.late = -5; day.criteriaPoints -= 5;
    const row = h.row('b'), expected = key.variants.omar;
    assert.equal(row.nominees.find(s=>s.name==='عمر').weekPointsTenths, expected.weekPointsTenths);
    assert.deepEqual(Object.fromEntries(row.nominees.map(s=>[s.name,s.rank])), expected.ranks);
    assert.deepEqual(row.knights.map(s=>s.name), expected.knights); assert.deepEqual(row.steps, withExitItems(expected.steps));
    for(const s of h.list.filter(s=>s.halaqaId==='b')) assert.deepEqual(h.call('knightsMessageLines',s,[row],true),expected.messages[s.name]);
    assert.equal(h.call('buildWeeklyKnightsAnnouncement',h.settings.halaqas.map(c=>h.row(c.id))),expected.announcement);
});

test('r2 Saad Wednesday sheet wins by nomination count; a row already built remains identical after later history edits', () => {
    const h = harness(), frozen = h.row('a'), before = JSON.stringify(frozen), s = h.list.find(s=>s.name==='سعد');
    s.history[input.days[3]] = {attended:true,entries:{n:entry({kind:'new',passage:8,grade:'excellent'}),r:entry({kind:'review',passage:4,grade:'excellent'})}};
    const row = h.row('a'), expected = key.variants.saadWednesday;
    assert.deepEqual(Object.fromEntries(row.nominees.map(s=>[s.name,s.nominations])),expected.nominations);
    assert.deepEqual(row.knights.map(s=>s.name),expected.knights);
    assert.equal(row.knights[0].weightTenths.total,expected.weightTenths);
    assert.equal(row.knights[0].weekPointsTenths,expected.weekPointsTenths);
    assert.equal(row.knights[0].nominations.length,2);
    assert.equal(row.nominees.find(s=>s.name==='فهد').nominations.length,1);
    for(const s of row.nominees) assert.deepEqual(selected(s,expected.nominees.find(e=>e.id===s.id)),expected.nominees.find(e=>e.id===s.id));
    assert.deepEqual(row.steps,withExitItems(expected.steps));
    for(const s of h.list.filter(s=>s.halaqaId==='a')) assert.deepEqual(h.call('knightsMessageLines',s,[row],true),expected.messages[s.name]);
    assert.equal(h.call('buildWeeklyKnightsAnnouncement',h.settings.halaqas.map(c=>h.row(c.id))),expected.announcement);
    assert.equal(JSON.stringify(frozen),before);
});

test('r2 short week excludes the holiday, preserves exact 2/3 and uses 67 only in the reason', () => {
    const h = harness(), expected = key.variants.shortWeek;
    for (const s of h.list.filter(s=>s.halaqaId==='a')) {
        s.history = {};
        for (const ds of expected.dates) {
            const present = s.name==='فهد' || (s.name==='خالد' && ds!=='2026-11-30') || s.name==='سعد';
            s.history[ds] = {attended:present,entries:present && s.name!=='سعد' ? {n:entry({kind:'new',passage:5,grade:'excellent'})} : {}};
        }
        // A recorded holiday is still excluded from every calculation.
        s.history['2026-12-01'] = {attended:true,entries:{n:entry({kind:'new',passage:5,grade:'excellent'})}};
    }
    const range = {startStr:'2026-11-29',endStr:'2026-12-02'};
    const row = h.call('buildWeekKnightsRow',range,h.settings.halaqas[0],h.list,[],h.settings);
    assert.deepEqual(row.schoolDates,expected.dates);
    assert.deepEqual(row.nominees.map((s,i)=>selected(s,expected.nominees[i])),expected.nominees);
    assert.deepEqual(row.steps,withExitItems(expected.steps));
    for(const s of h.list.filter(s=>s.halaqaId==='a')) assert.deepEqual(h.call('knightsMessageLines',s,[row],true),expected.messages[s.name]);
    assert.equal(h.call('buildWeeklyKnightsAnnouncement',[row]),expected.announcement);
});

for (const variant of ['bothTwo','midweek']) test('r2 historical entry multipliers, exact totals and verbatim reveal: '+variant, () => {
    const h = harness(variant), row = h.row('e'), expected=key.variants[variant];
    assert.deepEqual(row.nominees.map(s=>s.weightTenths),expected.weights);
    assert.deepEqual(row.nominees.map(s=>s.weekPointsTenths),expected.points);
    assert.deepEqual(row.nominees.map(s=>s.rank),expected.ranks);
    assert.deepEqual(row.nominees.map(s=>s.nominations),key.nominees.filter(s=>[17,18,19,20].includes(s.id)).map(s=>s.nominations));
    assert.equal(row.nominees.every(s=>s.eligible),true);
    assert.deepEqual(row.steps,withExitItems(expected.steps));
    assert.deepEqual(row.kindMult,{newMemorization:2,review:2});
    assert.equal(h.call('buildWeeklyKnightsAnnouncement',h.settings.halaqas.map(c=>h.row(c.id))),key.announcement);
    assert.deepEqual(row.nominees[0].weightMultipliers,variant==='midweek'?{new:null,review:1}:{new:2,review:2});
    for (const s of h.list.filter(s=>s.halaqaId==='e')) assert.deepEqual(h.call('knightsMessageLines',s,[row],true),key.messages[s.name]);
});

test('r2 same displayed T triggers lines even when the new/review decomposition differs', () => {
    const h=harness(),row=h.row('e');
    row.nominees[1].weightTenths={new:450,review:581,total:1031};
    const tie=h.call('buildRevealSteps',row).find(s=>s.scene==='tie');
    assert.deepEqual(tie.group.map(s=>s.linesText),['(103.2 سطراً بالوزن)','(103.1 سطراً بالوزن)']);
    assert.equal(tie.group[1].pagesText,'6.9 أوجه = جديد 3.0 (×3) + مراجعة 3.9 (×1)');
});

test('r2a Hani Tuesday excellent recitation computes mixed-day batch exits from the real rules', () => {
    const h = harness(), hani = h.list.find(s => s.id === 17);
    const extra = entry({ kind: 'new', passage: '5', grade: 'excellent' });
    assert.equal(extra.mult, 3);
    assert.equal(extra.points, 45); // 15 سطراً × 3، ويضاف حضور الأسبوع 40 نقطة مرة واحدة.
    hani.history[input.days[2]].entries.extra = extra;
    const row = h.row('e');
    assert.deepEqual(row.nominees.map(s => selected(s, {
        id: 0, name: '', nominations: [], weightTenths: {}, weekPointsTenths: 0, rank: 0, eligible: true
    })), [
        { id: 17, name: 'هاني', nominations: [input.days[0], input.days[2], input.days[3]], weightTenths: {new: 1350, review: 132, total: 1482}, weekPointsTenths: 1882, rank: 1, eligible: true },
        { id: 18, name: 'وليد', nominations: [input.days[1], input.days[3]], weightTenths: {new: 900, review: 131, total: 1031}, weekPointsTenths: 1431, rank: 2, eligible: true },
        { id: 19, name: 'كريم', nominations: [input.days[2]], weightTenths: {new: 450, review: 0, total: 450}, weekPointsTenths: 850, rank: 3, eligible: true },
        { id: 20, name: 'سامر', nominations: [input.days[2]], weightTenths: {new: 450, review: 0, total: 450}, weekPointsTenths: 850, rank: 3, eligible: true }
    ]);
    assert.equal(row.n, 1);
    assert.ok(row.nominees.every(s => s.attendance.present === 4 && s.attendance.schoolDays === 4 && s.attendance.pct === 100));
    assert.deepEqual(row.knights.map(s => s.name), ['هاني']);
    assert.deepEqual(row.steps.map(s => s.scene), ['list', 'exit', 'announce']);
    assert.deepEqual(row.steps[1], {
        scene: 'exit', names: ['وليد', 'كريم', 'سامر'], title: 'فرسان الأيام — شكراً لهم 👏',
        items: [
            { name: 'وليد', days: 2, daysText: 'فارس يومين' },
            { name: 'كريم', days: 1, daysText: 'فارس يومٍ واحد' },
            { name: 'سامر', days: 1, daysText: 'فارس يومٍ واحد' }
        ]
    });
    deepFreeze(row);
    assert.deepEqual(h.call('buildRevealSteps', row), row.steps);
});

test('r2a multi-name tie exits carry ordered per-name days and retain the equal-day title', () => {
    const h = harness(), row = h.row('e');
    // وحدة عرض صريحة: الجميع في مجموعة فصل اليومين، مع بقاء الوزن والنقاط والرتب.
    for (const s of row.nominees) s.nominations = input.days.slice(0, 2);
    const steps = h.call('buildRevealSteps', deepFreeze(row));
    assert.deepEqual(steps.map(s => s.scene), ['list', 'tie', 'announce']);
    assert.deepEqual(steps[1].exits, [
        { names: ['كريم', 'سامر'], title: 'فرسان يومين — شكراً لهم 👏', items: [
            { name: 'كريم', days: 2, daysText: 'فارس يومين' },
            { name: 'سامر', days: 2, daysText: 'فارس يومين' }
        ] },
        { names: ['وليد'], title: 'فارس يومين — شكراً له 👏', items: [
            { name: 'وليد', days: 2, daysText: 'فارس يومين' }
        ] }
    ]);
});

test('r2a frozen message follows Fahad ID after a move from A to B and ignores all B lines', () => {
    const h = harness(), rows = h.settings.halaqas.map(c => h.row(c.id));
    const fahad = h.list.find(s => s.id === 1);
    const expected = ['🏆 فارس حلقته للأسبوع', '🏅 فارس حلقته: يومان من 4'];
    assert.deepEqual(h.call('knightsMessageLines', fahad, rows, true), expected);
    const before = JSON.stringify(rows);
    fahad.halaqaId = 'b';
    for (const ordered of [rows, [...rows].reverse()]) {
        assert.deepEqual(h.call('knightsMessageLines', fahad, ordered, true), expected);
        assert.deepEqual(h.call('knightsMessageLines', {...fahad, id: String(fahad.id)}, ordered, true), expected);
    }
    assert.equal(JSON.stringify(rows), before);
    // لو تسرّبت قراءة من الحلقة الجديدة لظهر ترتيبها والتحضير المنزلي الوهمي.
    const b = rows.find(r => r.halaqaId === 'b');
    assert.equal(b.n, 2);
    b.knights.push({id: fahad.id, rank: 2});
    b.homePrepPointsTenths[String(fahad.id)] = 9990;
    assert.deepEqual(h.call('knightsMessageLines', fahad, deepFreeze([...rows].reverse()), true), expected);
});

test('r2 settings and source names edited after building cannot change row, reveal, message or announcement', () => {
    const h=harness(),rows=h.settings.halaqas.map(c=>h.row(c.id));
    const before=JSON.stringify(rows),announcement=h.call('buildWeeklyKnightsAnnouncement',rows);
    const messages=h.list.map(s=>h.call('knightsMessageLines',s,rows,true));
    h.settings.kindMult={newMemorization:2,review:2};h.settings.titleRules.knightsPerHalaqa={a:5};
    h.settings.halaqas.forEach(c=>c.name='اسم مختلف');h.settings.teachers.forEach(t=>t.name='معلم مختلف');h.list.forEach(s=>s.name='طالب مختلف');
    assert.equal(JSON.stringify(rows),before);
    for(const row of rows) assert.deepEqual(h.call('buildRevealSteps',row),row.steps);
    assert.equal(h.call('buildWeeklyKnightsAnnouncement',rows),announcement);
    assert.deepEqual(h.list.map(s=>h.call('knightsMessageLines',s,rows,true)),messages);
});

test('r2 all 23 students receive the exact fixed message lines and the complete public announcement', () => {
    const h=harness(),rows=h.settings.halaqas.map(c=>h.row(c.id));
    for(const s of h.list) {
        assert.deepEqual(h.call('knightsMessageLines',s,rows,true),key.messages[s.name],s.name);
        assert.deepEqual(h.call('knightsMessageLines',s,rows,false),key.unfrozen,s.name);
    }
    assert.equal(h.call('buildWeeklyKnightsAnnouncement',rows),key.announcement);
    assert.equal(h.call('buildWeeklyKnightsAnnouncement',[...rows].reverse()),key.announcement);
});

test('r2 general weekly message adds the fixed lines immediately after points and preserves every original byte', () => {
    const h=harness(),rows=h.settings.halaqas.map(c=>h.row(c.id));
    const old=cp.execFileSync('git',['show','8880f84:index.html'],{cwd:root,encoding:'utf8'}).replaceAll('\r\n','\n');
    require('node:vm').runInContext(source('buildGeneralWeeklyMessage',old).replace('function buildGeneralWeeklyMessage(','function oldWeeklyMessage('),h.ctx);
    for(const s of h.list) for(const frozen of [true,false]) {
        const settings={...h.settings,weekKnightsRows:rows,weekIsFrozen:frozen,todayStr:input.today,dayPoints:()=>0,
            measureEntry:()=>({lines:1}),surahName:()=>'سورة وهمية',brandName:'اسم البرنامج',attendanceSummary:()=>({actualDays:4,expectedDays:4,attendancePct:100,absences:0,excused:0,unexcused:0,unrecorded:0})};
        const message=h.call('buildGeneralWeeklyMessage',s,h.range,settings),baseline=h.call('oldWeeklyMessage',s,h.range,settings);
        const lines=frozen?key.messages[s.name]:key.unfrozen;
        const addition=lines.length?lines.join('\n')+'\n\n':'';
        assert.equal(message,baseline.slice(0,-settings.brandName.length)+addition+settings.brandName,s.name);
        if(addition) assert.ok(message.includes('أول أسبوع\n\n'+addition));
    }
});

test('r2 homeprep points are still reported for a student without nominations', () => {
    const h=harness(),s=h.list.find(s=>s.name==='زياد');
    s.history[input.days[0]].criteria.homeprep=10;s.history[input.days[0]].criteriaPoints=10;
    const row=h.row('b');assert.equal(row.nominees.some(n=>n.id===s.id),false);
    assert.deepEqual(h.call('knightsMessageLines',s,[row],true),['🏠 التحضير المنزلي: 10 نقطة']);
});

test('r2 no tolerance in any of the three ranking keys and competition ranks keep gaps', () => {
    const h=harness();
    const row=h.row('b');assert.deepEqual(row.nominees.map(s=>s.rank),[1,2,2,4]);
    const s=h.list.find(s=>s.name==='عمر');s.history[input.days[3]].criteriaPoints=-0.1;
    const ranked=h.row('b');assert.deepEqual(ranked.nominees.map(s=>s.rank),[1,2,3,4]);
    const e=h.row('e');assert.equal(e.nominees[0].weightTenths.total-e.nominees[1].weightTenths.total,1);
    assert.deepEqual(e.nominees.map(s=>s.rank),[1,2,3,3]);
});

test('r2 joinedOn excludes earlier dates and an empty school week produces no nominees or steps', () => {
    const h=harness(),s=h.list.find(s=>s.name==='فهد');s.joinedOn=input.days[2];
    const row=h.row('a');const nominee=row.nominees.find(n=>n.id===s.id);
    assert.deepEqual(nominee.nominations,[input.days[3]]);assert.equal(nominee.attendance.schoolDays,2);
    assert.deepEqual(nominee.weightTenths,{new:900,review:150,total:1050});
    const empty=h.call('buildWeekKnightsRow',{startStr:'2026-12-01',endStr:'2026-12-01'},h.settings.halaqas[0],h.list,[],h.settings);
    assert.deepEqual(empty.nominees,[]);assert.deepEqual(empty.knights,[]);assert.deepEqual(empty.steps,[]);
});

test('r2 forbidden functions, senders, stores and original fixed answer keys stay byte-for-byte at round-one HEAD', () => {
    const baseline=cp.execFileSync('git',['show','8880f84:index.html'],{cwd:root,encoding:'utf8'}).replaceAll('\r\n','\n');
    for(const name of ['dayStats','getCumulativeStats','topTied','getWeekTitleCandidates','getDisciplineStars','getGeneralTvBoard','getGeneralTvSnapshot','sendGeneralWeeklyMessage','sendGeneralTvSnapshot','homePrepQualifies'])
        assert.equal(source(name),source(name,baseline),name);
    assert.equal(html.match(/const dayPoints = .*;/)[0],baseline.match(/const dayPoints = .*;/)[0]);
    assert.equal(cp.execFileSync('git',['diff','8880f84','--','data-store.js','programs-store.js','firestore.rules','tv.js','tv.html','tests/rules/knights-answer-key.json','tests/rules/board-answer-key.json','tests/rules/homeprep-answer-key.json'],{cwd:root,encoding:'utf8'}),'');
    for(const name of functions.filter(n=>!['roundPointTotal','dayPoints','buildGeneralWeeklyMessage'].includes(n)))
        assert.doesNotMatch(source(name),/Date\.now|new Date\(\)|setTimeout|setInterval|serverTimestamp|saveWeek|updateDoc|setDoc|localStorage/);
});

test('r2 audit permits only the exact approved production diff and records both old-test exceptions', () => {
    const audit=require('./rules/design-expectation-audit.json');
    const {changesFrom}=require('./helpers/design-expectation-audit.cjs');
    const {beforeKnightsRound2}=require('./helpers/board-invariants.cjs');
    assert.deepEqual(audit.knightsRound2ProductionChanges,[changesFrom('index.html','8880f84')]);
    assert.equal(beforeKnightsRound2(html),cp.execFileSync('git',['show','8880f84:index.html'],{cwd:root,encoding:'utf8'}).replaceAll('\r\n','\n'));
    assert.equal(audit.knightsRound2ExpectationChanges.length,9);
    for(const row of audit.knightsRound2ExpectationChanges) {
        assert.equal(row.category,9);assert.equal(row.reason,'الفرسان الجولة ٢أ باعتماد المالك ٢٠٢٦-١١-٠٦');
        assert.equal(row.reviewBaseline,'8880f84');
    }
});
