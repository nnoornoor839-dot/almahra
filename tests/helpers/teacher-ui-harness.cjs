// بطاقة 4-4 (حسابات المعلمين) — هاركنس اختبار الواجهة الأحمر، 2026-11-16.
// فايربيس وهمي بالكامل (مصادقة + Firestore في الذاكرة + محاكاة مبسّطة لقواعد firestore.rules في d10b432)،
// يُستعمل في Node (vm) لتحميل auth.js وdata-store.js وprograms-store.js كما هي، وفي المتصفح (Playwright)
// بدل وحدات gstatic، فتعمل الملفات الحقيقية الثلاثة وindex.html بلا أي اتصال بفايربيس حقيقي.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const store = read('programs-store.js');
const PROGRAM_DEFS = vm.runInNewContext(`(${store.match(/export const PROGRAM_DEFS = ([\s\S]*?);\r?\n/)[1]})`);
const key = require('../rules/home-answer-key.json');
const copy = value => JSON.parse(JSON.stringify(value));

// ===== الفايربيس الوهمي: دالة واحدة تُسلسَل إلى المتصفح كما هي =====
function installFakeFirebase(win, seed) {
    const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
    const docs = new Map(Object.entries(clone(seed.docs || {})));
    const fb = { docs, log: [], authLog: [], listeners: [], hold: null, failWrites: null, serverTime: 1000, uidSeq: 0,
        accounts: seed.accounts || {}, authListeners: [], currentUser: seed.user ? { ...seed.user } : null };
    const SERVER_TS = { __fbServerTimestamp: true }, DELETE = { __fbDeleteField: true };
    const isTs = v => v && typeof v === 'object' && v.__fbServerTimestamp === true;
    const isDel = v => v && typeof v === 'object' && v.__fbDeleteField === true;
    const denied = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    // القيم المكتوبة: طابع الخادم يُحفظ علامةً تحمل رقم «وقت الخادم» للطلب.
    const resolve = (v, t) => isTs(v) ? { __serverTime: t } : Array.isArray(v) ? v.map(x => resolve(x, t))
        : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x, t)])) : v;
    const rawCopy = v => isTs(v) ? { __sentinel: 'serverTimestamp' } : isDel(v) ? { __sentinel: 'deleteField' }
        : Array.isArray(v) ? v.map(rawCopy) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rawCopy(x)])) : v;
    const toTimestamp = t => ({ seconds: t, nanoseconds: 0, toMillis: () => t * 1000, toDate: () => new Date(t * 1000), valueOf: () => t * 1000 });
    const reveal = v => v && typeof v === 'object' && '__serverTime' in v ? toTimestamp(v.__serverTime) : Array.isArray(v) ? v.map(reveal)
        : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, reveal(x)])) : v;
    const join = segs => segs.map(String).join('/');
    const parent = p => p.split('/').slice(0, -1).join('/');
    const snapDoc = p => {
        const data = docs.get(p);
        return { id: p.split('/').pop(), ref: { type: 'doc', path: p, id: p.split('/').pop() }, exists: () => data !== undefined,
            data: () => data === undefined ? undefined : reveal(clone(data)), get: f => data === undefined ? undefined : reveal(clone(data))[f] };
    };
    // ===== المصادقة =====
    const auth = { get currentUser() { return fb.currentUser; } };
    const notifyAuth = () => { const u = fb.currentUser; fb.authListeners.forEach(cb => setTimeout(() => cb(u), 0)); };
    const afterLoad = fn => {
        if (win.document && win.document.readyState === 'loading') win.document.addEventListener('DOMContentLoaded', () => setTimeout(fn, 0));
        else setTimeout(fn, 0);
    };
    const A = {
        getAuth: () => auth, setPersistence: async () => {}, browserLocalPersistence: { type: 'LOCAL' },
        browserSessionPersistence: { type: 'SESSION' }, inMemoryPersistence: { type: 'NONE' }, connectAuthEmulator() {},
        onAuthStateChanged(_auth, cb) { fb.authListeners.push(cb); afterLoad(() => { fb.authLog.push({ op: 'authStateChanged', uid: fb.currentUser?.uid || null }); cb(fb.currentUser); }); return () => { fb.authListeners = fb.authListeners.filter(x => x !== cb); }; },
        async signInAnonymously() {
            fb.authLog.push({ op: 'signInAnonymously', search: win.location ? String(win.location.search) : '', href: win.location ? String(win.location.href) : '' });
            // أ6: كفايربيس الحقيقي (@firebase/auth 1.10.8، index-35c79a8a.js:5617–5623): هوية مجهولة قائمة تُعاد كما هي بلا هوية جديدة.
            if (fb.currentUser?.isAnonymous) return { user: fb.currentUser };   // لا تغيّر في الهوية ← لا إشعار onAuthStateChanged
            fb.currentUser ={ uid: 'anon-' + (++fb.uidSeq), isAnonymous: true, email: null, providerId: 'anonymous', getIdToken: async () => 'fake' };
            notifyAuth(); return { user: fb.currentUser };
        },
        async signInWithEmailAndPassword(_auth, email, password) {
            fb.authLog.push({ op: 'signInWithEmailAndPassword', email });
            const account = fb.accounts[email];
            if (!account || account.password !== password) throw Object.assign(new Error('bad'), { code: 'auth/invalid-credential' });
            fb.currentUser = { uid: account.uid, isAnonymous: false, email, providerId: 'password', getIdToken: async () => 'fake' };
            notifyAuth(); return { user: fb.currentUser };
        },
        async signOut() { fb.authLog.push({ op: 'signOut', uid: fb.currentUser?.uid || null }); fb.currentUser = null; notifyAuth(); },
        async sendPasswordResetEmail() {}, updateProfile: async () => {}
    };
    // ===== محاكاة القواعد (مبسّطة، من firestore.rules في d10b432) =====
    const userDoc = () => fb.currentUser ? docs.get('users/' + fb.currentUser.uid) : undefined;
    const isAdmin = () => userDoc()?.role === 'admin';
    const liveKey = (tid, code) => { const k = docs.get('programs/general/teacherKeys/' + tid); return !!k && typeof tid === 'string' && k.code === code && k.active === true; };
    const isTeacher = () => { const u = userDoc(); return !!u && u.role === 'teacher' && u.programId === 'general' && liveKey(u.teacherId, u.code); };
    const myHalaqas = () => docs.get('programs/general/teacherKeys/' + userDoc().teacherId)?.halaqaIds || [];
    const activeSeason = () => docs.get('programs/general')?.activeSeasonId;
    const STUDENT_KEYS = ['sid', 'name', 'history', 'memorizedJuz', 'parentPhone', 'frontierBase', 'lastDailyBase', 'joinedOn', 'halaqaId', 'teacherId', 'stage'];
    const UPDATE_KEYS = ['history', 'lastDailySurah', 'lastDailyAyah', 'lastDailySardRange', 'frontierBase', 'lastDailyBase', 'name', 'memorizedJuz', 'parentPhone', 'frontierFix', 'tierId', 'tierManual'];   // كما teacherStudentUpdateOk في firestore.rules (لا updatedAt)
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const changedKeys = (before, after) => [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].filter(k => !same(before?.[k], after?.[k]));
    function canRead(p, kind, constraints) {
        const s = p.split('/');
        if (s[0] === 'users') return !!fb.currentUser && (s[1] === fb.currentUser.uid || isAdmin());
        if (s[0] !== 'programs') return false;
        if (isAdmin()) return true;
        if (!isTeacher() || s[1] !== 'general') return false;
        if (s.length === 2) return true;                         // programs/general
        if (s[2] === 'teacherKeys' || s[4] === 'deletedStudents') return false;
        if (s[2] === 'seasons' && s.length <= 4) return true;    // المواسم
        if (s[4] === 'students') {
            if (kind === 'get') { const d = docs.get(p); return d === undefined || myHalaqas().includes(d.halaqaId); }
            const w = (constraints || []).find(c => c.kind === 'where' && c.field === 'halaqaId');
            if (!w) return false;
            const vals = w.op === 'in' ? w.value : w.op === '==' ? [w.value] : null;
            return Array.isArray(vals) && vals.every(v => myHalaqas().includes(v));
        }
        return false;
    }
    function canWrite(op, p, before, after, batch) {
        const s = p.split('/');
        if (s[0] === 'users') {
            if (isAdmin()) return true;
            const u = fb.currentUser;
            if (!u || s[1] !== u.uid) return false;
            if (op.type === 'set' && before === undefined) return u.isAnonymous && same(Object.keys(after).sort(), ['code', 'programId', 'role', 'teacherId'])
                && after.role === 'teacher' && after.programId === 'general' && liveKey(after.teacherId, after.code);
            if (before !== undefined && op.type !== 'delete') return before.role === 'teacher' && same(changedKeys(before, after), ['code']) && liveKey(before.teacherId, after.code);
            return false;
        }
        if (s[0] !== 'programs') return false;
        if (isAdmin()) return s[1] === 'general';
        if (!isTeacher() || s[1] !== 'general' || s.length < 6 || s[3] !== activeSeason()) return false;
        if (s[4] === 'students') {
            if (before === undefined && after !== undefined)
                return same(Object.keys(after).sort(), [...STUDENT_KEYS].sort()) && same(after.history, {}) && after.frontierBase === null && after.lastDailyBase === null
                    && myHalaqas().includes(after.halaqaId) && after.teacherId === userDoc().teacherId
                    && !docs.has(join(s.slice(0, 4)) + '/deletedStudents/' + after.sid);
            if (before !== undefined && after !== undefined) {
                const ch = changedKeys(before, after);
                return myHalaqas().includes(before.halaqaId) && before.halaqaId === after.halaqaId && ch.every(k => UPDATE_KEYS.includes(k))
                    && (!ch.includes('frontierFix') || !('frontierFix' in before)) && (!ch.includes('tierId') || !('tierId' in after))
                    && (!ch.includes('tierManual') || !('tierManual' in after))
                    && (!ch.includes('history') || ('history' in before ? changedKeys(before.history, after.history).length === 1 : Object.keys(after.history || {}).length === 1));
            }
            if (before !== undefined && after === undefined) {
                if (!myHalaqas().includes(before.halaqaId)) return false;
                const copyOp = (batch || []).find(o => o.type === 'set' && o.path === join(s.slice(0, 4)) + '/deletedStudents/' + before.sid);
                return !!copyOp && copyOp.data.studentId === s[5] && isTs(copyOp.data.deletedAt);
            }
            return false;
        }
        if (s[4] === 'deletedStudents' && before === undefined && op.type === 'set') {
            const d = op.data, sp = join(s.slice(0, 4)) + '/students/' + d.studentId, real = docs.get(sp);
            if (typeof d.studentId !== 'string' || !real || s[5] !== real.sid || d.sid !== real.sid || !myHalaqas().includes(real.halaqaId)) return false;
            if (!(batch || []).some(o => o.type === 'delete' && o.path === sp)) return false;
            const extra = changedKeys(real, Object.fromEntries(Object.entries(d).filter(([k]) => !['deletedBy', 'deletedAt', 'studentId'].includes(k))));
            return extra.length === 0 && d.deletedBy === fb.currentUser.uid && isTs(d.deletedAt);
        }
        return false;
    }
    // ===== تطبيق الكتابات =====
    function applyFields(target, fields, t) {
        for (const [k, v] of Object.entries(fields)) {
            const segs = k.split('.'); let cur = target;
            if (isDel(v)) { for (const sg of segs.slice(0, -1)) { if (!cur[sg] || typeof cur[sg] !== 'object') { cur = null; break; } cur = cur[sg]; } if (cur) delete cur[segs.at(-1)]; continue; }
            segs.slice(0, -1).forEach(sg => { if (!cur[sg] || typeof cur[sg] !== 'object' || Array.isArray(cur[sg])) cur[sg] = {}; cur = cur[sg]; });
            cur[segs.at(-1)] = resolve(clone(v === undefined ? null : v), t);
        }
        return target;
    }
    function after(op, t) {
        const before = docs.get(op.path);
        if (op.type === 'delete') return undefined;
        if (op.type === 'update') return applyFields(clone(before), op.data, t);
        if (op.type === 'set' && op.options?.merge) return applyFields(clone(before) || {}, op.data, t);
        const out = {}; for (const [k, v] of Object.entries(op.data)) if (!isDel(v)) out[k] = resolve(clone(v), t);
        return out;
    }
    function hasUndefinedDeep(v) { return v === undefined || (v && typeof v === 'object' && !isTs(v) && !isDel(v) && Object.values(v).some(hasUndefinedDeep)); }
    async function commit(ops, label) {
        fb.log.push({ op: label, uid: fb.currentUser?.uid || null, writes: ops.map(o => ({ type: o.type, path: o.path, data: o.data === undefined ? undefined : rawCopy(o.data) })) });
        const entry = fb.log.at(-1);
        if (fb.hold) await fb.hold;
        if (fb.failWrites) { const e = fb.failWrites; entry.result = 'failed'; throw Object.assign(new Error(e.message || 'failed'), { code: e.code || 'unavailable' }); }
        const t = ++fb.serverTime;
        for (const o of ops) {
            if (o.data !== undefined && hasUndefinedDeep(o.data)) { entry.result = 'invalid-argument'; throw Object.assign(new Error('undefined'), { code: 'invalid-argument' }); }
            const before = docs.get(o.path);
            if (o.type === 'update' && before === undefined) { entry.result = 'not-found'; throw Object.assign(new Error('No document to update'), { code: 'not-found' }); }
            if (!canWrite(o, o.path, before, after(o, t), ops)) { entry.result = 'permission-denied'; throw denied(); }
        }
        for (const o of ops) { const a = after(o, t); if (a === undefined) docs.delete(o.path); else docs.set(o.path, a); }
        entry.result = 'ok';
        fireListeners();
    }
    // ===== المستمعون =====
    function matches(q, p, data) {
        if (parent(p) !== q.path) return false;
        return (q.constraints || []).every(c => c.kind !== 'where' || (c.op === 'in' ? c.value.includes(data?.[c.field]) : c.op === '==' ? data?.[c.field] === c.value : true));
    }
    function querySnap(q) {
        const list = [...docs.keys()].filter(p => matches(q, p, docs.get(p))).sort().map(snapDoc);
        return { docs: list, size: list.length, empty: !list.length, forEach: fn => list.forEach(fn) };
    }
    function emit(l) {
        if (l.type === 'doc') { if (!canRead(l.path, 'get')) return l.error?.(denied()); l.next(snapDoc(l.path)); return; }
        if (!canRead(l.path + '/x', 'list', l.constraints)) { l.dead = true; return l.error?.(denied()); }
        l.next(querySnap(l));
    }
    function fireListeners() { fb.listeners.filter(l => !l.dead).forEach(l => setTimeout(() => !l.dead && emit(l), 0)); }
    const ref = (type, segs) => ({ type, path: join(segs), id: String(segs.at(-1)) });
    const F = {
        initializeApp: () => ({ name: 'fake' }), getApps: () => [{ name: 'fake' }], getApp: () => ({ name: 'fake' }),
        getFirestore: () => ({ fake: true }), connectFirestoreEmulator() {},
        doc: (base, ...segs) => base && base.type === 'col' ? ref('doc', [base.path, ...(segs.length ? segs : [Math.random().toString(36).slice(2)])]) : ref('doc', segs),
        collection: (base, ...segs) => base && base.type === 'doc' ? ref('col', [base.path, ...segs]) : ref('col', segs),
        query: (base, ...constraints) => ({ type: 'query', path: base.path, id: base.id, constraints }),
        where: (field, op, value) => ({ kind: 'where', field, op, value: clone(value) }),
        orderBy: (field, dir) => ({ kind: 'orderBy', field, dir }), limit: n => ({ kind: 'limit', n }), documentId: () => '__name__',
        serverTimestamp: () => SERVER_TS, deleteField: () => DELETE,
        arrayUnion: (...v) => v, arrayRemove: () => [], increment: n => n, Timestamp: { now: () => toTimestamp(fb.serverTime), fromMillis: ms => toTimestamp(ms / 1000) },
        async getDoc(r) { fb.log.push({ op: 'getDoc', path: r.path, uid: fb.currentUser?.uid || null }); if (!canRead(r.path, 'get')) throw denied(); return snapDoc(r.path); },
        async getDocs(q) { fb.log.push({ op: 'getDocs', path: q.path, constraints: clone(q.constraints || []), uid: fb.currentUser?.uid || null }); if (!canRead(q.path + '/x', 'list', q.constraints)) throw denied(); return querySnap(q); },
        async setDoc(r, data, options) { return commit([{ type: 'set', path: r.path, data, options }], 'setDoc'); },
        async updateDoc(r, data) { return commit([{ type: 'update', path: r.path, data }], 'updateDoc'); },
        async deleteDoc(r) { return commit([{ type: 'delete', path: r.path }], 'deleteDoc'); },
        writeBatch() {
            const ops = [];
            return { set(r, data, options) { ops.push({ type: 'set', path: r.path, data, options }); return this; },
                update(r, data) { ops.push({ type: 'update', path: r.path, data }); return this; },
                delete(r) { ops.push({ type: 'delete', path: r.path }); return this; },
                commit: () => commit(ops, 'batch') };
        },
        async runTransaction(_db, fn) {
            const ops = [];
            const tx = { async get(r) { fb.log.push({ op: 'tx.get', path: r.path, uid: fb.currentUser?.uid || null }); if (!canRead(r.path, 'get')) throw denied(); return snapDoc(r.path); },
                set(r, data, options) { ops.push({ type: 'set', path: r.path, data, options }); return tx; },
                update(r, data) { ops.push({ type: 'update', path: r.path, data }); return tx; },
                delete(r) { ops.push({ type: 'delete', path: r.path }); return tx; } };
            const result = await fn(tx);
            if (ops.length) await commit(ops, 'transaction');
            return result;
        },
        onSnapshot(target, next, error) {
            if (typeof next === 'object' && next) { error = next.error; next = next.next; }
            const l = { type: target.type === 'doc' ? 'doc' : 'query', path: target.path, constraints: clone(target.constraints || []), next, error };
            fb.listeners.push(l);
            fb.log.push({ op: 'onSnapshot', path: target.path, kind: l.type, constraints: l.constraints, uid: fb.currentUser?.uid || null });
            setTimeout(() => !l.dead && emit(l), 0);
            return () => { l.dead = true; };
        }
    };
    F.getDocFromServer = async r => { fb.log.push({ op: 'getDocFromServer', path: r.path, uid: fb.currentUser?.uid || null }); if (!canRead(r.path, 'get')) throw denied(); return snapDoc(r.path); };
    F.getDocsFromServer = async q => { fb.log.push({ op: 'getDocsFromServer', path: q.path, constraints: clone(q.constraints || []), uid: fb.currentUser?.uid || null }); if (!canRead(q.path + '/x', 'list', q.constraints)) throw denied(); return querySnap(q); };
    Object.assign(fb, A, F, {
        get(p) { return clone(docs.get(p)); }, set(p, v) { docs.set(p, clone(v)); fireListeners(); }, del(p) { docs.delete(p); fireListeners(); },
        release: null, setHold() { let r; fb.hold = new Promise(x => { r = x; }); fb.release = () => { fb.hold = null; r(); }; }
    });
    // أ4 (ق50/ق53): location.reload لا يمكن اعتراضه في المتصفح (خاصية غير قابلة للتعديل)، فيُحاكى ما يبقى بعد إعادة التحميل:
    // seed.carry = 'all' ← حالة المصادقة (كحفظ جلسة فايربيس الحقيقي: الخروج يبقى خروجاً) + السجلّات + عدد مرات التحميل؛
    // seed.carry = 'logs' ← السجلّات وعدد التحميل فقط (الجلسة المزروعة تعود: محاكاة خروج لم يثبت، لفحص حارس الحلقة).
    // تُحمل عبر sessionStorage عند beforeunload. بلا carry (الافتراضي) لا شيء يتغيّر.
    if (seed.carry && win.sessionStorage && win.addEventListener) {
        const KEY = '__fbCarry';
        let prev = null;
        try { prev = JSON.parse(win.sessionStorage.getItem(KEY) || 'null'); } catch (_) {}
        fb.loads = (prev?.loads || 0) + 1;
        if (prev) {
            fb.authLog.push(...prev.authLog); fb.log.push(...prev.log); fb.uidSeq = prev.uidSeq;
            if (seed.carry === 'all') fb.currentUser = prev.currentUser ? { ...prev.currentUser, getIdToken: async () => 'fake' } : null;
        }
        fb.authLog.push({ op: 'pageLoad', n: fb.loads, uid: fb.currentUser?.uid || null });
        win.addEventListener('beforeunload', () => {
            try { win.sessionStorage.setItem(KEY, JSON.stringify({ loads: fb.loads, authLog: fb.authLog, log: fb.log, uidSeq: fb.uidSeq,
                currentUser: fb.currentUser ? { uid: fb.currentUser.uid, isAnonymous: fb.currentUser.isAnonymous, email: fb.currentUser.email, providerId: fb.currentUser.providerId } : null })); } catch (_) {}
        });
    }
    win.__fb = fb;
    return fb;
}
const AUTH_EXPORTS = ['getAuth', 'setPersistence', 'browserLocalPersistence', 'browserSessionPersistence', 'inMemoryPersistence', 'connectAuthEmulator',
    'onAuthStateChanged', 'signInAnonymously', 'signInWithEmailAndPassword', 'signOut', 'sendPasswordResetEmail', 'updateProfile'];
const STORE_EXPORTS = ['initializeApp', 'getApps', 'getApp', 'getFirestore', 'connectFirestoreEmulator', 'doc', 'collection', 'query', 'where', 'orderBy', 'limit',
    'documentId', 'serverTimestamp', 'deleteField', 'arrayUnion', 'arrayRemove', 'increment', 'Timestamp', 'getDoc', 'getDocs', 'setDoc', 'updateDoc', 'deleteDoc',
    'writeBatch', 'runTransaction', 'onSnapshot', 'getDocFromServer', 'getDocsFromServer'];
const CONSTANTS = ['browserLocalPersistence', 'browserSessionPersistence', 'inMemoryPersistence', 'Timestamp'];
const moduleSource = names => names.map(n => CONSTANTS.includes(n) ? `export const ${n} = window.__fb.${n};`
    : `export const ${n} = (...a) => window.__fb.${n}(...a);`).join('\n');

// ===== البيانات الوهمية المشتركة =====
const TODAY = key.today; // 2026-11-22 الأحد، يوم دراسي في تقويم المفتاح
const OTHER_UID = 'other-device-uid';
const TEACHER_CODE = 't1.ABCDEFGHJK23';   // ق23: <teacherId>.<12 حرفاً كبيراً>
function settings(extra = {}) {
    return { ...copy(PROGRAM_DEFS.general.defaultSettings), ...copy(key.settings), settingsVersion: 4,
        teachers: [{ id: 't1', name: 'عبدالله' }, { id: 't2', name: 'إبراهيم' }],
        // المغرب مذكورة أولاً عمداً: تبويبات المعلم ترتّب بـperiodOf (العصر أولاً)
        halaqas: [{ id: 'm1', name: 'حلقة ابن مسعود', teacherId: 't1', stageId: 'middle', active: true },
            { id: 'a1', name: 'حلقة أُبيّ', teacherId: 't1', stageId: 'primary', active: true },
            { id: 'b1', name: 'حلقة ب', teacherId: 't2', stageId: 'secondary', active: true }], ...extra };
}
const STAGE_OF = { a1: 'primary', m1: 'middle', b1: 'secondary' };
function makeStudent(id, name, halaqaId, extra = {}) {
    return { sid: 'sid-' + id, name, halaqaId, teacherId: halaqaId === 'b1' ? 't2' : 't1', stage: STAGE_OF[halaqaId], direction: 'down',
        lastSurah: 2, lastAyah: 5, history: {}, joinedOn: '2026-11-01', memorizedJuz: 2, parentPhone: '96650000000' + id,
        frontierBase: null, lastDailyBase: null, ...extra };
}
function students() {
    const today = TODAY;
    const recorded = { attended: true, hijri: 'وهمي', entries: { e_other_1: { kind: 'new', grade: 'good', spec: { from: [2, 6], to: [2, 10] }, rep: 1, points: 3, at: 1, by: OTHER_UID, heardBy: 't1' } } };
    const noPos = makeStudent(4, 'سعد', 'a1');
    delete noPos.lastSurah; delete noPos.lastAyah;
    return {
        1: makeStudent(1, 'أحمد', 'a1'),
        2: makeStudent(2, 'بدر', 'a1', { history: { [today]: recorded } }),
        3: makeStudent(3, 'خالد', 'a1', { history: { [today]: { attended: false, absence: 'unexcused' } } }),
        4: noPos,
        5: makeStudent(5, 'فهد', 'a1'),
        6: makeStudent(6, 'عمر', 'm1'),
        7: makeStudent(7, 'ماجد', 'm1'),
        8: makeStudent(8, 'يوسف', 'b1')
    };
}
function frozenWeeks(termStart, today) {
    const out = {};
    for (let d = new Date(termStart + 'T12:00:00Z'); d <= new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1))
        if (d.getUTCDay() === 0) out[d.toISOString().slice(0, 10)] = true;
    return out;
}
function seedDocs({ holiday = false, outOfSeason = false, teacherKey = { code: TEACHER_CODE, halaqaIds: ['m1', 'a1'], active: true }, list = students(), settingsExtra = {}, teacherUser = false, extraDocs = {} } = {}) {
    const season = { ...copy(key.season), name: 'موسم 2026', status: 'active', startedAt: { __serverTime: 1 }, measure: '1441', frozenWeeks: frozenWeeks(key.season.termStart, TODAY) };
    delete season.id;
    if (holiday) season.calendar = [...season.calendar, { from: TODAY, to: TODAY, name: 'إجازة وهمية', kind: 'official' }];
    if (outOfSeason) season.termEnd = '2026-11-19';
    const out = {
        'users/admin-uid': { role: 'admin', name: 'مشرف وهمي' },
        'programs/general': { name: 'البرنامج العام', type: 'general', settings: settings(settingsExtra), activeSeasonId: 's1' },
        'programs/general/seasons/s1': season
    };
    for (const id of ['summer', 'review-day']) {
        out['programs/' + id] = { name: PROGRAM_DEFS[id].name, type: id, settings: { ...copy(PROGRAM_DEFS[id].defaultSettings), settingsVersion: 4 }, activeSeasonId: 's-' + id };
        out[`programs/${id}/seasons/s-${id}`] = { name: 'موسم', status: 'active', startedAt: { __serverTime: 1 } };
    }
    if (teacherKey) out['programs/general/teacherKeys/t1'] = teacherKey;
    out['programs/general/teacherKeys/t2'] = { code: 't2.QWERTYUPAS23', halaqaIds: ['b1'], active: true };
    for (const [id, s] of Object.entries(list)) out['programs/general/seasons/s1/students/' + id] = s;
    if (teacherUser) out['users/teacher-uid'] = { role: 'teacher', programId: 'general', teacherId: 't1', code: TEACHER_CODE };
    return { ...out, ...extraDocs };
}

// ===== تحميل وحدة إنتاج كما هي داخل vm (بلا import/export) =====
function loadModule(files, { seed, win = {}, auth } = {}) {
    const target = new EventTarget();
    const elements = new Map();
    const element = id => { if (!elements.has(id)) elements.set(id, { id, value: '', textContent: '', innerHTML: '', disabled: false, hidden: false,
        classList: { add() {}, remove() {}, contains: () => false, toggle() {} }, addEventListener() {}, style: {} }); return elements.get(id); };
    const document = { readyState: 'complete', getElementById: element, addEventListener() {}, createElement: () => ({ set textContent(v) { this.innerHTML = String(v); }, innerHTML: '' }),
        querySelector: () => null, querySelectorAll: () => [], body: { classList: { add() {}, remove() {}, contains: () => false } } };
    const storage = new Map();
    const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, structuredClone, TextEncoder, Intl, crypto: globalThis.crypto, setTimeout, clearTimeout, setInterval, clearInterval,
        URL, URLSearchParams, CustomEvent, Event, EventTarget, Promise, JSON, Date, Math, document, alert() {}, confirm: () => true,
        localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
        location: { search: '', href: 'http://almahra.test/', origin: 'http://almahra.test', pathname: '/', hash: '', reload() {} },
        history: { replaceState(_s, _t, url) { ctx.__replaced.push(String(url)); }, pushState() {} }, __replaced: [],
        addEventListener: target.addEventListener.bind(target), removeEventListener: target.removeEventListener.bind(target), dispatchEvent: target.dispatchEvent.bind(target),
        firebaseConfig: {}, ...win };
    ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
    if (auth) ctx.almahraAuth = auth;
    vm.createContext(ctx);
    const fb = installFakeFirebase(ctx, seed || { docs: {} });
    ctx.__fb = fb;
    for (const n of [...AUTH_EXPORTS, ...STORE_EXPORTS]) ctx[n] = fb[n];
    for (const file of files) {
        const src = read(file).replace(/^\s*import\s[\s\S]*?\sfrom\s+["'][^"']+["'];?[ \t]*$/gm, '').replace(/^export\s+(?=const|function|async|let|class)/gm, '');
        vm.runInContext(src, ctx, { filename: file });
    }
    return { ctx, fb, elements, tick: (ms = 5) => new Promise(r => setTimeout(r, ms)) };
}

// ===== صفحة Playwright: index.html + الملفات الثلاثة الحقيقية + فايربيس وهمي =====
const utilityCss = `*,::before,::after{box-sizing:border-box;border-width:0;border-style:solid}body{margin:0}
button,input,select{font:inherit}button{cursor:pointer;background:transparent}h1,h2,h3,h4,p{margin:0}
img{display:block;max-width:100%}.flex{display:flex}.flex-col{flex-direction:column}.flex-wrap{flex-wrap:wrap}
.items-center{align-items:center}.justify-center{justify-content:center}.justify-between{justify-content:space-between}
.flex-grow{flex-grow:1}.gap-5{gap:1.25rem}.w-full{width:100%}.mx-auto{margin-inline:auto}.p-4{padding:1rem}
.fixed{position:fixed}.inset-0{inset:0}.hidden{display:none}.no-print{print-color-adjust:exact}
.bottom-0{bottom:0}.left-0{left:0}.right-0{right:0}.flex-1{flex:1 1 0%}.z-50{z-index:50}
[class~="z-[2000]"]{z-index:2000}
@media(min-width:768px){.md\\:p-8{padding:2rem}}`;
async function openPage(browser, { width = 390, height = 844, user = null, url = '/', seed = {}, fonts = false, initScripts = [], carry = null } = {}) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    const errors = [], dialogs = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => { dialogs.push({ type: d.type(), message: d.message() }); (page.__dialogAnswer === false ? d.dismiss() : d.accept()).catch(() => {}); });
    const config = { today: TODAY, docs: seedDocs(seed), user, accounts: { 'admin@test': { uid: 'admin-uid', password: 'pw' } } };
    await page.addInitScript(`(${installFakeFirebase.toString()})(window, ${JSON.stringify({ docs: config.docs, user: config.user, accounts: config.accounts, carry })});`);
    await page.addInitScript(today => {
        const NativeDate = Date;
        window.Date = class extends NativeDate {
            constructor(...args) { super(...(args.length ? args : [today + 'T09:00:00Z'])); }
            static now() { return new NativeDate(today + 'T09:00:00Z').getTime(); }
        };
        window.tailwind = {};
        window.confetti = Object.assign(() => {}, { create: () => () => {} });
        window.__spy = { openProgram: 0, openEventPicker: 0, openTeacherHome: 0, celebrations: [] };
        // يُلفّ بعد تعريف دوال الصفحة وقبل أول استدعاء لمستمع المصادقة الوهمي (يُطلق بعد DOMContentLoaded).
        window.addEventListener('DOMContentLoaded', () => {
            for (const name of ['openProgram', 'openEventPicker', 'openTeacherHome']) {
                const original = window[name];
                if (typeof original !== 'function') continue;
                window[name] = function (...args) { window.__spy[name]++; return original.apply(this, args); };
            }
            const cel = window.sendGeneralTvCelebration;
            if (typeof cel === 'function') window.sendGeneralTvCelebration = function (...args) { window.__spy.celebrations.push(args[0]?.id); return cel.apply(this, args); };
        });
    }, TODAY);
    // أ3 (ح5): سكربتات تمهيد يمرّرها اختبار بعينه (مراقب BroadcastChannel) قبل سكربتات الصفحة؛ الافتراضي لا شيء فلا أثر على غيره.
    for (const script of initScripts) await page.addInitScript(script);
    await page.route('**/*', async route => {
        const u = new URL(route.request().url());
        if (u.hostname === 'www.gstatic.com' && u.pathname.includes('/firebasejs/')) {
            const names = u.pathname.endsWith('firebase-auth.js') ? AUTH_EXPORTS : STORE_EXPORTS;
            return route.fulfill({ contentType: 'text/javascript', body: moduleSource(names) });
        }
        if (fonts && /fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) return route.continue();
        if (u.hostname !== 'almahra.test') return route.fulfill({ contentType: u.pathname.endsWith('.css') ? 'text/css' : 'text/javascript', body: '' });
        const file = u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname.slice(1));
        if (file === 'firebase-config.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const firebaseConfig = {};' });
        if (file === 'index.html') return route.fulfill({ contentType: 'text/html', body: read('index.html').replace('</head>', `<style>${utilityCss}</style></head>`) });
        const absolute = path.resolve(root, file);
        if (!absolute.startsWith(root + path.sep) || !fs.existsSync(absolute)) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ path: absolute });
    });
    await page.goto('http://almahra.test' + url, { waitUntil: 'load' });
    const fbLog = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__fb.log)));
    const doc = p => page.evaluate(p => window.__fb.get(p), p);
    return { page, context, errors, dialogs, fbLog, doc, close: () => context.close() };
}

// ===== أ14 (2026-11-18): نافذة الإنجاز في الهيكلين — أداة واحدة للاختبارات القديمة =====
// المعلم: أقسام v7 بمحدّدات ق101 س1 (كما tests/teacher-r2-accordion-local.test.cjs): [data-sec="new"|"review"|"behavior"] داخل #generalQuickSection،
// رأسه .tch-acc-toggle (aria-expanded)، وزر .tch-confirm (aria-pressed)، والجسم .tch-acc-body، والأوراق .tch-sheet.
// المشرف: الهيكل القديم كما هو (التبويبان #quickTabNew/#quickTabReview إن وُجدا، ولا تأكيد أقسام).
const QUICK_SEL = { sec: k => `#generalQuickSection [data-sec="${k}"]`, toggle: '.tch-acc-toggle', confirm: '.tch-confirm', body: '.tch-acc-body', sum: '.tch-acc-sum', sheet: '.tch-sheet' };
const quickAccordion = page => page.evaluate(() => document.body.classList.contains('teacher-mode') && !!document.querySelector('#generalQuickSection [data-sec="new"]'));
// يفتح نافذة الإنجاز: المعلم من زر «الإنجاز» في بطاقته وينتظر الأقسام؛ المشرف بـopenSmartModal القائمة.
async function openAch(h, id) {
    const teacher = await h.page.evaluate(() => document.body.classList.contains('teacher-mode'));
    if (teacher) {
        const btn = h.page.locator(`.teacher-card[data-id="${id}"] [data-a=ach]`);
        await btn.first().waitFor({ state: 'attached', timeout: 6000 }).catch(() => { throw new Error(`زر «الإنجاز» لبطاقة ${id} غير موجود`); });
        await btn.first().click();
        await h.page.locator('#smartModal').waitFor({ state: 'visible' });
        await h.page.locator(QUICK_SEL.sec('new')).waitFor({ state: 'attached', timeout: 3000 })
            .catch(() => { throw new Error('أقسام النافذة الثلاثة (ق90) غير موجودة: [data-sec="new"]'); });
    } else {
        await h.page.evaluate(id => openSmartModal(id), id);
        await h.page.locator('#generalQuickSection').waitFor({ state: 'visible' });
    }
}
// يفتح القسم (المعلم) أو التبويب (المشرف)؛ يعيد false إن كان رأس القسم معطّلاً (الجديد لمتوقف، ق80) فلا يُفتح.
async function openSec(page, k) {
    if (await quickAccordion(page)) {
        const t = page.locator(QUICK_SEL.sec(k) + ' ' + QUICK_SEL.toggle);
        if (await t.evaluate(e => e.disabled || e.getAttribute('aria-disabled') === 'true')) return false;
        if (await t.getAttribute('aria-expanded') !== 'true') await t.click();
        return true;
    }
    if (k === 'behavior') return true;
    const tab = page.locator(k === 'new' ? '#quickTabNew' : '#quickTabReview');
    if (await tab.count()) await tab.click();
    return true;
}
const secConfirmed = (page, k) => page.evaluate(sel => document.querySelector(sel + ' .tch-confirm')?.getAttribute('aria-pressed') === 'true', QUICK_SEL.sec(k));
// يؤكّد القسم إن لم يكن مؤكَّداً (المعلم وحده؛ المشرف بلا تأكيد). يعيد حالة التأكيد بعده.
async function confirmSec(page, k) {
    if (!await quickAccordion(page)) return true;
    const c = page.locator(QUICK_SEL.sec(k) + ' ' + QUICK_SEL.confirm);
    if (!await c.count()) return false;
    if (!await secConfirmed(page, k)) { await c.click(); await page.waitForTimeout(60); }
    return secConfirmed(page, k);
}
// قبل «حفظ» عند المعلم: ما لُمس في السلوك لا يُحفظ إلا مؤكَّداً (ق98-1)، والسلوك يُؤكَّد بلا شرط (ق98-4).
async function confirmBehavior(page) { if (await quickAccordion(page)) await confirmSec(page, 'behavior'); }
// الأوراق الظاهرة (.tch-sheet) بنصّها وأزرارها.
function quickSheets(page) {
    return page.evaluate(sel => [...document.querySelectorAll(sel)].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden')
        .map(e => ({ id: e.id, text: e.innerText.replace(/\s+/g, ' ').trim(), buttons: [...e.querySelectorAll('button')].filter(b => b.getClientRects().length).map(b => b.innerText.replace(/\s+/g, ' ').trim()) })), QUICK_SEL.sheet);
}
async function sheetButton(page, label) {
    const b = page.locator(QUICK_SEL.sheet).locator('button').filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) }).filter({ visible: true }).first();
    if (!await b.count()) throw new Error(`لا زر «${label}» في ورقة ظاهرة. الأوراق: ${JSON.stringify(await quickSheets(page))}`);
    await b.click();
}
// يغلق النافذة من زرّها الظاهر: «رجوع» عند المعلم (ق90، ج1)، و✕ .qe-close عند المشرف.
async function closeAch(page) {
    if (!await page.evaluate(() => document.getElementById('smartModal')?.classList.contains('flex'))) return;
    await page.locator(await quickAccordion(page) ? '#generalQuickSection button[aria-label="رجوع"]' : '#generalQuickSection .qe-close').click();
    await page.waitForFunction(() => !document.getElementById('smartModal')?.classList.contains('flex'), null, { timeout: 3000 });
}
// حالة الأقسام: مفتوح/مؤكَّد/معطّل وظهور الجسم.
function secState(page) {
    return page.evaluate(() => Object.fromEntries(['new', 'review', 'behavior'].map(k => {
        const s = document.querySelector(`#generalQuickSection [data-sec="${k}"]`);
        if (!s) return [k, null];
        const t = s.querySelector('.tch-acc-toggle'), c = s.querySelector('.tch-confirm'), b = s.querySelector('.tch-acc-body');
        return [k, { expanded: t?.getAttribute('aria-expanded') === 'true', bodyVisible: !!b && b.getClientRects().length > 0,
            confirmed: c?.getAttribute('aria-pressed') === 'true', disabled: !!t && (t.disabled || t.getAttribute('aria-disabled') === 'true') }];
    })));
}

module.exports = { QUICK_SEL, quickAccordion, openAch, openSec, secConfirmed, confirmSec, confirmBehavior, quickSheets, sheetButton, closeAch, secState,
    installFakeFirebase, loadModule, openPage, seedDocs, students, settings, makeStudent, PROGRAM_DEFS, TODAY, OTHER_UID, TEACHER_CODE, root, read, copy,
    TEACHER_USER: { uid: 'teacher-uid', isAnonymous: true, email: null, providerId: 'anonymous' }, ADMIN_USER: { uid: 'admin-uid', isAnonymous: false, email: 'admin@test', providerId: 'password' } };
