const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { source, root, copy, harness: quick } = require('./quick-entry-harness.cjs');
const { functions, fixtures } = require('./knights-r2-harness.cjs');
const key = require('../rules/knights-answer-key.json');
const html = fs.readFileSync(root + '/index.html', 'utf8');
const GUARD = 'لا يمكن الحفظ الآن: الأسبوع الماضي لم يُغلق بعد (تحقق من الاتصال ثم أعد المحاولة)';
const LOCK = 'تعذّر قفل فرسان الأسبوع؛ لم تُرسل الرسالة (تحقق من الاتصال ثم أعد المحاولة)';
function cloud() {
    const docs = new Map([
        ['programs/general', { settings: copy(key.settings), activeSeasonId: 's1' }],
        ['programs/general/seasons/s1', { ...copy(key.season), knightsLog: [copy(key.manualApproval)], extra: { preserved: 7 } }]
    ]);
    fixtures().forEach(s => docs.set('programs/general/seasons/s1/students/' + s.id, s));
    const state = { events: [], writes: [], now: +new Date('2026-11-29T12:40:00Z'), failRead: false, failTx: false, gate: null,
        transactionAttempts: 0, transactionConflicts: 0, transactionReads: [], transactionCommits: [], onTransactionRead: null };
    const versions = new Map();
    const snapshot = path => {
        const exists = docs.has(path), data = exists ? copy(docs.get(path)) : undefined;
        return { id: path.split('/').at(-1), exists: () => exists, data: () => exists ? copy(data) : undefined };
    };
    const resolve = (value, inArray = false) => {
        if (value?.__serverTimestamp) {
            assert.equal(inArray, false, 'Firestore disallows serverTimestamp within arrays');
            return { seconds: Math.floor(state.now / 1000), nanoseconds: 0 };
        }
        if (Array.isArray(value)) return value.map(v => resolve(v, true));
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,resolve(v,inArray)]));
        return value;
    };
    const apply = (path, patch, type) => {
        if (type === 'delete') { docs.delete(path); return; }
        const next = type === 'set' ? {} : copy(docs.get(path) || {});
        for (const [key, value] of Object.entries(patch)) {
            const parts = key.split('.'); let target = next;
            for (const part of parts.slice(0,-1)) target = target[part] ||= {};
            target[parts.at(-1)] = resolve(value);
        }
        docs.set(path, next);
    };
    const write = (path, patch, type = 'update') => {
        state.events.push('write:' + path); state.writes.push({path,patch:copy(patch || {}),type});
        apply(path, patch, type);
        versions.set(path, (versions.get(path) || 0) + 1);
    };
    const read = async path => {
        state.events.push('read:' + path);
        if (state.failRead) throw Error('خادم غير متصل');
        return snapshot(path);
    };
    const getDocs = async path => {
        await read(path);
        const list = [...docs.keys()].filter(p => p.startsWith(path + '/') && !p.slice(path.length+1).includes('/')).map(snapshot);
        return { docs:list, empty:!list.length, forEach:fn=>list.forEach(fn) };
    };
    const sdk = {
        initializeApp:()=>({}), getApps:()=>[{}], getApp:()=>({}), getFirestore:()=>({}),
        collection:(_, ...parts)=>parts.join('/'), doc:(_, ...parts)=>parts.join('/'),
        getDoc:read, getDocFromServer:read, getDocs, getDocsFromServer:getDocs,
        serverTimestamp:()=>({__serverTimestamp:true}), deleteField:()=>({__almahraDelete:true}),
        updateDoc:async(p,v)=>write(p,v), setDoc:async(p,v)=>write(p,v,'set'), deleteDoc:async p=>write(p,{},'delete'),
        onSnapshot:()=>()=>{}, query:x=>x, orderBy:()=>null,
        writeBatch:()=>{ const pending=[]; return {
            update:(p,v)=>pending.push([p,v,'update']),set:(p,v)=>pending.push([p,v,'set']),delete:p=>pending.push([p,{},'delete']),
            commit:async()=>pending.forEach(args=>write(...args))
        }},
        runTransaction:async(_, fn)=>{
            for (let attempt = 0; attempt < 5; attempt++) {
                const attemptId = ++state.transactionAttempts;
                if (state.gate) await state.gate;
                if (state.failTx) throw Error('فشل معاملة وهمي');
                const pending=[], reads=new Map();
                const result=await fn({
                    get:async p=>{
                        assert.equal(pending.length,0);
                        const version=versions.get(p)||0, value=JSON.stringify(docs.get(p));
                        const snap=await read(p);
                        reads.set(p,{version,value});
                        state.transactionReads.push({attemptId,path:p,version});
                        if(state.onTransactionRead)await state.onTransactionRead({attemptId,path:p,attempt});
                        return snap;
                    },
                    update:(p,v)=>pending.push([p,v,'update']),set:(p,v)=>pending.push([p,v,'set']),delete:p=>pending.push([p,{},'delete'])
                });
                // Commit validation and writes have no await between them: one atomic turn.
                if ([...reads].some(([p,r]) => (versions.get(p)||0)!==r.version || JSON.stringify(docs.get(p))!==r.value)) {
                    state.transactionConflicts++;
                    continue;
                }
                for(const args of pending)write(...args);
                state.transactionCommits.push({attemptId,writes:pending.length});
                return result;
            }
            throw Error('transaction retries exhausted');
        }
    };
    function stores() {
        const window={addEventListener(){},dispatchEvent(){},almahraAuth:null};
        const ctx=vm.createContext({...sdk,window,TextEncoder,structuredClone,Intl,Date,console:{log(){},warn(){},error(){}},
            localStorage:{getItem(){},setItem(){}},CustomEvent:class{},firebaseConfig:{}});
        for(const file of ['programs-store.js','data-store.js']){
            let code=fs.readFileSync(root+'/'+file,'utf8').replace(/import\s[\s\S]*?;\n/g,'').replace('export const','const');
            // Separate module lexical scopes while preserving exports on their shared window.
            vm.runInContext('(function(){'+code+'\n'+(file==='programs-store.js'
                ? "programsCache.general={settings:seedSettings,activeSeasonId:'s1'}; seasonsCache.general=[{...seedSeason,id:'s1'}]; currentProgramId='general';currentSeasonId='s1';"
                : "activeProgramId='general';activeSeasonId='s1';isReady=true;studentsCache=seedStudents;")+'})()',vm.createContext({...ctx,window,
                seedSettings:copy(docs.get('programs/general').settings),seedSeason:copy(docs.get('programs/general/seasons/s1')),seedStudents:fixtures()}));
        }
        return window;
    }
    return { docs,state,stores,season:()=>docs.get('programs/general/seasons/s1'), students:()=>[...docs.entries()].filter(([p])=>p.includes('/students/')).map(([,s])=>copy(s)) };
}
const runtimeNames=['knightsFreezeCheckKey','knightsToday','knightsStoredSeason','knightsEndedWeeks','knightsFreezeRow','knightsClockWarning','ensureWeekKnightsFrozen',
    'checkWeekKnightsOnLoad','lockWeekRows','unfreezeHalaqaWeek','knightsPreviousWeekStart','getLockedWeekKnights','lockKnightsForMessage',
    'copyWeeklyKnightsAnnouncement','renderWeekKnightsReview','generalPerformanceSettings'];
function runtime(server, now='2026-11-29T12:40:00Z', installGuard=true) {
    const h=quick(), stores=server.stores();
    h.state.settings=copy(key.settings);h.state.calendar=copy(key.season);
    Object.assign(h.ctx.window,stores);
    h.ctx.window.almahraAuth={currentUser:{uid:'fake-admin'},isAdmin:()=>true};
    h.ctx.fixtureList=server.students(); h.run('students = fixtureList'); h.ctx.fixtureToday=now.slice(0,10);h.run('todayStr=fixtureToday');
    class FixedDate extends Date { constructor(...args){super(...(args.length?args:[now]));} static now(){return +new Date(now);} }
    h.ctx.Date=FixedDate; h.ctx.Intl=Intl;
    h.run(html.slice(html.indexOf('        const weekKnightsState ='),html.indexOf('        function knightsToday(')).replace(/const weekKnights(?:State = new Map|Checks = new Map|Pending = new Map|TvLocks = new Set)\(\);|const KNIGHTS_GUARD_ERROR = .*;/g,''));
    h.run(html.match(/const dayPoints = .*;/)[0]);
    h.install(...functions.filter(n=>n!=='dayPoints'),...runtimeNames,'getWeekStartDate','addDaysToDateStr');
    if (installGuard) {
        stores.almahraData.setWriteGuard(h.ctx.ensureWeekKnightsFrozen);
        stores.almahraPrograms.setWriteGuard(h.ctx.ensureWeekKnightsFrozen);
    }
    h.ctx.window.location={href:'unchanged'};
    h.state.copies=[];h.ctx.navigator={clipboard:{writeText:async text=>h.state.copies.push(text)}};
    h.call=async(name,...args)=>{h.ctx.args=args;return h.run(name+'(...args)')};
    h.frozen=()=>h.call('ensureWeekKnightsFrozen');
    h.rows=()=>copy(h.run('knightsStoredSeason().weekKnightsLog'));
    return h;
}
module.exports={cloud,runtime,key,GUARD,LOCK};
