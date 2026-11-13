// ================================================================
// طبقة البرامج والمواسم — Programs & Seasons Store
// ================================================================
// ثلاثة برامج ثابتة، لكل واحد مواسم متعددة
// البنية: programs/{programId}/seasons/{seasonId}/students/{studentId}
// ================================================================

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
    getFirestore,
    collection,
    doc,
    getDoc,
    getDocFromServer,
    getDocs,
    getDocsFromServer,
    setDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    query,
    orderBy,
    serverTimestamp,
    writeBatch,
    runTransaction
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

const PROGRAMS = 'programs';
const SEASONS = 'seasons';
const CURRENT_PROGRAM_KEY = 'almahra_current_program_id';

// ================================================================
// تعريف البرامج الثابتة
// ================================================================
export const PROGRAM_DEFS = {
    summer: {
        id: 'summer',
        name: 'البرنامج الصيفي',
        icon: '🌞',
        shortDesc: 'حفظ ومراجعة · عدة أسابيع',
        color: 'amber',
        defaultSettings: {
            raceName: 'سباق رحلة الطائف',
            raceSubtitle: 'يوم الحضور (10) + الحفظ الجديد (3) + المراجعة (1) + محطات واعتمادات السرد',
            points: { attendance: 10, newMemorization: 3, review: 1 },
            workingDays: [0, 1, 2, 3], // الأحد=0 .. السبت=6
            // minJuz: أقل عدد أجزاء محفوظة لدخول الشريحة (نهايتها = بداية التي تليها)
            tiers: [
                { id: 't_beginner',     name: 'المبتدئون',  order: 1, minJuz: 0 },
                { id: 't_intermediate', name: 'المتوسطون',  order: 2, minJuz: 2 },
                { id: 't_advanced',     name: 'المتقدمون',  order: 3, minJuz: 3 }
            ],
            criteria: [
                { id: 'early',     name: 'الحضور المبكر',          points: 5,   enabled: true },
                { id: 'manners',   name: 'حسن الخلق والأدب',        points: 5,   enabled: true },
                { id: 'uniform',   name: 'الالتزام بالزي الرسمي',   points: 3,   enabled: true },
                { id: 'engage',    name: 'المشاركة والتفاعل',       points: 3,   enabled: true },
                { id: 'neat',      name: 'النظافة والمظهر',         points: 2,   enabled: true },
                { id: 'late',      name: 'تأخر بغير عذر',           points: -5,  enabled: true, blocksTitles: false },
                { id: 'misbehave', name: 'مخالفة الأدب في الحلقة',  points: -10, enabled: true, blocksTitles: true },
                { id: 'disturb',   name: 'إزعاج أو تشويش',          points: -5,  enabled: true, blocksTitles: false }
            ],
            // شروط استحقاق الألقاب (لوحة الشرف)
            titleRules: {
                requireSard: true,            // لا لقب لمن لم يسرد شيئاً
                weeklyAttendancePct: 75,      // أدنى حضور لفارس الأسبوع (٪ من أيام العمل)
                disciplineRequiresFullWeek: true // نجوم الانضباط: حضور كامل بلا غياب ولا مخالفة
            },
            features: {
                newMemorization: true,
                review: true,
                goldenBoard: true,
                attendance: true,
                knights: true,
                honorBoard: true,
                finalExam: true,
                examPrep: true,
                groups: false,
                pomodoro: true,
                tiers: true
            }
        }
    },
    general: {
        id: 'general',
        name: 'البرنامج العام',
        icon: '📖',
        shortDesc: 'حفظ ومراجعة · حلقات ومعلمون',
        color: 'emerald',
        defaultSettings: {
            raceName: 'سباق البرنامج العام',
            raceSubtitle: 'الحضور والحفظ الجديد والمراجعة والإنجاز',
            points: { attendance: 10, newMemorization: 3, review: 1 },
            workingDays: [0, 1, 2, 3],
            stages: [
                { id: 'primary', name: 'ابتدائي', order: 1 },
                { id: 'middle', name: 'متوسط', order: 2 }
            ],
            teachers: [],
            grades: [
                { id: 'excellent', name: 'ممتاز', percent: 100 },
                { id: 'very-good', name: 'جيد جداً', percent: 75 },
                { id: 'good', name: 'جيد', percent: 50 },
                { id: 'repeat', name: 'يُعاد', percent: 0, fullPointsOnSuccessfulRepeat: true }
            ],
            kindMult: { newMemorization: 3, review: 1 },
            absence: [
                { id: 'excused', name: 'بعذر' },
                { id: 'unexcused', name: 'بغير عذر' }
            ],
            knightsRules: { disciplinePct: 70, achievementPct: 30 },
            featuredHalaqa: { weeklyAttendancePct: 75 },
            criteria: [
                { id: 'homeprep', name: 'التحضير المنزلي', points: 10, enabled: true, optIn: true },
                { id: 'early', name: 'الحضور المبكر', points: 5, enabled: true },
                { id: 'manners', name: 'حسن الخلق والأدب', points: 5, enabled: true },
                { id: 'uniform', name: 'الالتزام بالزي الرسمي', points: 3, enabled: true },
                { id: 'engage', name: 'المشاركة والتفاعل', points: 3, enabled: true },
                { id: 'neat', name: 'النظافة والمظهر', points: 2, enabled: true },
                { id: 'late', name: 'تأخر بغير عذر', points: -5, enabled: true, blocksTitles: false },
                { id: 'misbehave', name: 'مخالفة الأدب في الحلقة', points: -10, enabled: true, blocksTitles: true },
                { id: 'disturb', name: 'إزعاج أو تشويش', points: -5, enabled: true, blocksTitles: false }
            ],
            titleRules: { requireSard: true, weeklyAttendancePct: 75, disciplineRequiresFullWeek: true },
            features: {
                newMemorization: true, review: true, goldenBoard: false, attendance: true,
                knights: true, honorBoard: true, finalExam: false, examPrep: false,
                groups: false, pomodoro: false, tiers: false
            }
        }
    },
    'review-day': {
        id: 'review-day',
        name: 'اليوم القرآني المكثّف',
        icon: '⚡',
        shortDesc: 'مراجعة مكثّفة · يوم واحد',
        color: 'blue',
        defaultSettings: {
            raceName: 'سباق المراجعة المكثّفة',
            raceSubtitle: 'كل آية تُراجَع تُحتسب نقطة',
            points: { attendance: 10, newMemorization: 3, review: 1 },
            workingDays: [0, 1, 2, 3, 4, 5, 6], // يوم واحد - كل الأيام مسموحة
            tiers: [
                { id: 't_beginner',     name: 'المبتدئون',  order: 1, minJuz: 0 },
                { id: 't_intermediate', name: 'المتوسطون',  order: 2, minJuz: 2 },
                { id: 't_advanced',     name: 'المتقدمون',  order: 3, minJuz: 3 }
            ],
            criteria: [
                { id: 'early',     name: 'الحضور المبكر',          points: 5,   enabled: true },
                { id: 'manners',   name: 'حسن الخلق والأدب',        points: 5,   enabled: true },
                { id: 'engage',    name: 'المشاركة والتفاعل',       points: 3,   enabled: true },
                { id: 'late',      name: 'تأخر بغير عذر',           points: -5,  enabled: true, blocksTitles: false },
                { id: 'misbehave', name: 'مخالفة الأدب في الحلقة',  points: -10, enabled: true, blocksTitles: true }
            ],
            titleRules: {
                requireSard: true,
                weeklyAttendancePct: 75,
                disciplineRequiresFullWeek: true
            },
            features: {
                tiers: true,
                newMemorization: false,  // مراجعة فقط
                review: true,
                goldenBoard: true,
                attendance: true,
                knights: true,
                honorBoard: true,
                finalExam: false,
                examPrep: false,
                groups: false,
                pomodoro: false
            }
        }
    }
};

// ================================================================
// الحالة الداخلية
// ================================================================
let programsCache = {};        // { summer: {...}, 'review-day': {...} }
let seasonsCache = {};         // { summer: [...], 'review-day': [...] }
let currentProgramId = null;
let currentSeasonId = null;
let programsReady = false;
let writeGuard = null;
const WRITE_GUARD_ERROR = 'لا يمكن الحفظ الآن: الأسبوع الماضي لم يُغلق بعد (تحقق من الاتصال ثم أعد المحاولة)';
async function beforeWrite(programId, seasonId = programsCache[programId]?.activeSeasonId) {
    if (programId !== 'general') return null;
    try {
        const result = writeGuard && await writeGuard(programId, seasonId);
        if (result?.ok === true || result?.success === true) return null;
    } catch (_) {}
    return { success: false, error: WRITE_GUARD_ERROR };
}

// الخريطة تسمح بطابع الخادم داخل السطر؛ Firestore يرفض التحويلات داخل المصفوفات.
function weekKnightsRows(season) {
    const log = season?.weekKnightsLog;
    return Array.isArray(log) ? log : Object.values(log || {});
}
function weekKnightsMap(seasonId, season) {
    return Object.fromEntries(weekKnightsRows(season).map(row => [seasonId + '|' + row.weekStart + '|' + row.halaqaId, row]));
}
function checkKnightsSize(season) {
    // هامش لأسماء الحقول وفهارس الوثيقة والطوابع فوق حجم UTF-8.
    if (new TextEncoder().encode(JSON.stringify(season)).length * 1.2 + 4096 > 800 * 1024)
        throw new Error('سجل الفرسان كبير؛ راجع المدير');
}
async function mutateWeekKnights(programId, seasonId, mutate) {
    if (programId !== 'general' || !seasonId) return { success: false, error: 'لا يوجد موسم عام نشط' };
    try {
        const ref = doc(db, PROGRAMS, programId, SEASONS, seasonId);
        const result = await runTransaction(db, async transaction => {
            const snap = await transaction.get(ref);
            if (!snap.exists()) throw new Error('الموسم غير موجود');
            const season = snap.data(), log = weekKnightsMap(seasonId, season);
            const patch = mutate(season, log);
            if (patch) {
                checkKnightsSize({ ...season, ...patch });
                transaction.update(ref, patch);
            }
        });
        // نقرأ الطوابع المحلولة من الخادم، ولا نعرض تحويلاً محلياً على أنه قفل مؤكّد.
        const snap = await getDocFromServer(ref);
        return { success: true, season: snap.data(), rows: weekKnightsRows(snap.data()) };
    } catch (error) { return { success: false, error: error.message }; }
}
const programsSettled = new Set();
let initializationErrors = [];
let subscribers = [];
let programUnsubscribes = {};

function notify() {
    subscribers.forEach(cb => {
        try { cb(); } catch (e) { console.error('programs subscriber error:', e); }
    });
}

// ================================================================
// ترقية الإعدادات: تضيف الحقول الجديدة للبرامج القائمة
// كل زيادة في هذا الرقم تُشغّل الترقية مرة واحدة على كل برنامج
// ================================================================
const SETTINGS_VERSION = 4;

// v4: يعطي كل شريحة بدايتها بالأجزاء (minJuz) إن لم تكن لها.
//  • الشرائح الافتراضية تأخذ قيمتها الافتراضية (٠ / ٢ / ٣)
//  • الشرائح المخصّصة تأخذ رقماً يلي ما قبلها
//  • الأولى (بالترتيب) تبدأ من الصفر دائماً، والبدايات متصاعدة بلا تكرار
function fillTierMinJuz(tiers, defaultTiers) {
    const sorted = [...tiers].sort((a, b) => (a.order || 0) - (b.order || 0));
    const mins = {};
    let prev = -1;
    sorted.forEach((t, i) => {
        const def = (defaultTiers || []).find(d => d.id === t.id);
        let m = Number.isInteger(t.minJuz) ? t.minJuz
              : Number.isInteger(def?.minJuz) ? def.minJuz
              : prev + 1;
        if (i === 0) m = 0;
        if (m <= prev) m = prev + 1;
        m = Math.min(30, Math.max(0, m));
        mins[t.id] = m;
        prev = m;
    });
    return tiers.map(t => ({ ...t, minJuz: mins[t.id] }));
}

function migrateSettings(programId, settings) {
    const defaults = PROGRAM_DEFS[programId]?.defaultSettings;
    if (!defaults) return { settings, changed: false };

    const s = settings ? JSON.parse(JSON.stringify(settings)) : {};
    let changed = false;

    if (programId === 'general') {
        // الإقلاع يضيف المفاتيح الناقصة فقط؛ null والمصفوفات والقيم المقصودة محفوظة.
        const addMissing = (target, fallback) => {
            if (!target || typeof target !== 'object' || Array.isArray(target)) return;
            for (const key of Object.keys(fallback)) {
                if (!Object.hasOwn(target, key)) {
                    target[key] = JSON.parse(JSON.stringify(fallback[key]));
                    changed = true;
                } else if (fallback[key] && typeof fallback[key] === 'object' && !Array.isArray(fallback[key])) {
                    addMissing(target[key], fallback[key]);
                }
            }
        };
        addMissing(s, defaults);
        return { settings: s, changed };
    }

    // الشرائح: تُضاف إن لم تكن معرّفة إطلاقاً (undefined ≠ مصفوفة فارغة متعمّدة)
    if (s.tiers === undefined) {
        s.tiers = JSON.parse(JSON.stringify(defaults.tiers || []));
        changed = true;
    }

    // المعايير: تُضاف كاملة إن غابت، أو تُكمَّل بالسلبية إن لم توجد أي سالبة
    if (!Array.isArray(s.criteria)) {
        s.criteria = JSON.parse(JSON.stringify(defaults.criteria || []));
        changed = true;
    } else if ((s.settingsVersion || 0) < 2) {
        const hasNegative = s.criteria.some(c => (c.points || 0) < 0);
        if (!hasNegative) {
            const negatives = (defaults.criteria || []).filter(c => (c.points || 0) < 0);
            if (negatives.length) {
                s.criteria = [...s.criteria, ...JSON.parse(JSON.stringify(negatives))];
                changed = true;
            }
        }
    }

    // v3: خانة "تحجب الترشّح للألقاب" على المخالفات + شروط الألقاب
    if ((s.settingsVersion || 0) < 3) {
        if (Array.isArray(s.criteria)) {
            s.criteria = s.criteria.map(c => {
                if ((c.points || 0) >= 0 || c.blocksTitles !== undefined) return c;
                // الافتراضي: مخالفة الأدب وحدها تحجب (ونتعرّف عليها بالمعرّف أو بالاسم)
                const isManners = c.id === 'misbehave' || /أدب|خلق/.test(c.name || '');
                changed = true;
                return { ...c, blocksTitles: isManners };
            });
        }
        if (s.titleRules === undefined) {
            s.titleRules = JSON.parse(JSON.stringify(defaults.titleRules || {}));
            changed = true;
        }
    }

    // v4: تعريف الشرائح بالأجزاء — يُفحص دائماً (لا بالإصدار فقط) فأي شريحة بلا بداية تُكمَّل
    if (Array.isArray(s.tiers) && s.tiers.some(t => !Number.isInteger(t.minJuz))) {
        s.tiers = fillTierMinJuz(s.tiers, defaults.tiers);
        changed = true;
    }

    // الميزات: نضم أي ميزة جديدة بقيمتها الافتراضية دون المساس بما ضبطه المستخدم
    for (const key of Object.keys(defaults.features || {})) {
        if (s.features?.[key] === undefined) {
            if (!s.features) s.features = {};
            s.features[key] = defaults.features[key];
            changed = true;
        }
    }

    // بقية الحقول الأساسية
    ['raceName', 'raceSubtitle', 'points', 'workingDays'].forEach(k => {
        if (s[k] === undefined && defaults[k] !== undefined) {
            s[k] = JSON.parse(JSON.stringify(defaults[k]));
            changed = true;
        }
    });

    if ((s.settingsVersion || 0) < SETTINGS_VERSION) {
        s.settingsVersion = SETTINGS_VERSION;
        changed = true;
    }

    return { settings: s, changed };
}

// ================================================================
// التهيئة: إنشاء البرامج + الموسم الأول + ترقية الإعدادات
// ================================================================
async function ensureProgramsExist() {
    for (const key of Object.keys(PROGRAM_DEFS)) {
        try {
        const def = PROGRAM_DEFS[key];
        const progRef = doc(db, PROGRAMS, def.id);
        const snap = await getDoc(progRef);

        if (!snap.exists()) {
            console.log(`🆕 إنشاء البرنامج: ${def.name}`);
            const fresh = JSON.parse(JSON.stringify(def.defaultSettings));
            fresh.settingsVersion = SETTINGS_VERSION;
            if (def.id === 'general') {
                const seasonRef = doc(db, PROGRAMS, def.id, SEASONS, `s_${Date.now()}`);
                const batch = writeBatch(db);
                batch.set(progRef, {
                    name: def.name, type: def.id, settings: fresh,
                    activeSeasonId: seasonRef.id, createdAt: serverTimestamp()
                });
                batch.set(seasonRef, {
                    name: defaultSeasonName(def.id), status: 'active',
                    startedAt: serverTimestamp(), startDate: new Date().toISOString().slice(0, 10),
                    archivedAt: null, endDate: null, measure: '1441'
                });
                await batch.commit();
                continue;
            }
            await setDoc(progRef, {
                name: def.name,
                type: def.id,
                settings: fresh,
                activeSeasonId: null,
                createdAt: serverTimestamp()
            });
        } else {
            // ترقية إعدادات برنامج قائم
            if (def.id === 'general') {
                await runTransaction(db, async transaction => {
                    const latest = await transaction.get(progRef);
                    if (!latest.exists()) throw new Error('برنامج غير موجود');
                    const { settings: upgraded, changed } = migrateSettings(def.id, latest.data().settings);
                    if (changed) transaction.update(progRef, { settings: upgraded });
                });
            } else {
            const current = snap.data();
            const { settings: upgraded, changed } = migrateSettings(def.id, current.settings);
            if (changed) {
                console.log(`⬆️ ترقية إعدادات: ${def.name} → v${SETTINGS_VERSION}`);
                await updateDoc(progRef, { settings: upgraded });
            }
            }
        }

        // تأكد من وجود موسم نشط
        const progData = (await getDoc(progRef)).data();
        if (!progData.activeSeasonId) {
            if (def.id === 'general') {
                const seasonRef = doc(db, PROGRAMS, def.id, SEASONS, `s_${Date.now()}`);
                const batch = writeBatch(db);
                batch.set(seasonRef, {
                    name: defaultSeasonName(def.id), status: 'active',
                    startedAt: serverTimestamp(), startDate: new Date().toISOString().slice(0, 10),
                    archivedAt: null, endDate: null, measure: '1441'
                });
                batch.update(progRef, { activeSeasonId: seasonRef.id });
                await batch.commit();
            } else {
                const seasonId = await createSeasonInternal(def.id, defaultSeasonName(def.id));
                await updateDoc(progRef, { activeSeasonId: seasonId });
            }
        }
        } catch (err) {
            console.error(`❌ تعذّر تهيئة البرنامج ${key}:`, err);
            initializationErrors.push({ programId: key, name: PROGRAM_DEFS[key].name });
            window.dispatchEvent(new CustomEvent('almahra-program-init-error', {
                detail: { programId: key, name: PROGRAM_DEFS[key].name }
            }));
            if (key !== 'general') throw err;
        }
    }
}

function defaultSeasonName(programId) {
    const now = new Date();
    if (programId === 'summer') {
        return `موسم ${now.getFullYear()}`;
    }
    if (programId === 'general') return `موسم ${now.getFullYear()}`;
    return `مراجعة ${now.toLocaleDateString('ar-SA', { month: 'long', year: 'numeric' })}`;
}

async function createSeasonInternal(programId, name) {
    const seasonId = `s_${Date.now()}`;
    await setDoc(doc(db, PROGRAMS, programId, SEASONS, seasonId), {
        name: name,
        status: 'active',
        startedAt: serverTimestamp(),
        startDate: new Date().toISOString().slice(0, 10),
        archivedAt: null,
        endDate: null,
        ...(programId === 'general' ? { measure: '1441' } : {})
    });
    return seasonId;
}

// ================================================================
// المستمعون اللحظيون
// ================================================================
function startListeners() {
    Object.keys(PROGRAM_DEFS).forEach(programId => {
        if (programUnsubscribes[programId]) return;

        // مستمع بيانات البرنامج نفسه
        const unsubProg = onSnapshot(doc(db, PROGRAMS, programId), (snap) => {
            if (snap.exists()) {
                programsCache[programId] = { id: programId, ...snap.data() };
                if (currentProgramId === programId) {
                    currentSeasonId = programsCache[programId].activeSeasonId;
                }
            }
            programsSettled.add(programId);
            programsReady = programsSettled.size === Object.keys(PROGRAM_DEFS).length;
            notify();
        }, (err) => {
            console.error('❌ program listener:', err.code, err.message);
            initializationErrors.push({ programId, name: PROGRAM_DEFS[programId].name });
            window.dispatchEvent(new CustomEvent('almahra-program-init-error', {
                detail: { programId, name: PROGRAM_DEFS[programId].name }
            }));
            programsSettled.add(programId);
            programsReady = programsSettled.size === Object.keys(PROGRAM_DEFS).length;
            notify();
        });

        // مستمع مواسم البرنامج
        const seasonsQ = query(collection(db, PROGRAMS, programId, SEASONS), orderBy('startedAt', 'desc'));
        const unsubSeasons = onSnapshot(seasonsQ, (snap) => {
            const list = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() }));
            seasonsCache[programId] = list;
            notify();
        }, (err) => console.error('❌ seasons listener:', err.code, err.message));

        programUnsubscribes[programId] = () => { unsubProg(); unsubSeasons(); };
    });
}

// ================================================================
// عدّ الطلاب في موسم (للعرض في شاشة الاختيار)
// ================================================================
async function countStudents(programId, seasonId) {
    if (!seasonId) return 0;
    try {
        const snap = await getDocs(collection(db, PROGRAMS, programId, SEASONS, seasonId, 'students'));
        return snap.size;
    } catch (e) {
        return 0;
    }
}

async function getAllStudents(programId) {
    const seasons = await getDocs(collection(db, PROGRAMS, programId, SEASONS));
    const students = await Promise.all(seasons.docs.map(async season => {
        const snap = await getDocs(collection(db, PROGRAMS, programId, SEASONS, season.id, 'students'));
        return snap.docs.map(d => d.data());
    }));
    return students.flat();
}

// ================================================================
// الواجهة العامة
// ================================================================
window.almahraPrograms = {
    setWriteGuard: fn => { writeGuard = fn; },
    getSettingsFromServer: async programId => {
        const snap = await getDocFromServer(doc(db, PROGRAMS, programId));
        if (!snap.exists()) throw new Error('البرنامج غير موجود');
        return snap.data().settings;
    },
    getSeasonFromServer: async (programId, seasonId) => {
        const snap = await getDocFromServer(doc(db, PROGRAMS, programId, SEASONS, seasonId));
        if (!snap.exists()) throw new Error('الموسم غير موجود');
        return snap.data();
    },
    getStudentsFromServer: async (programId, seasonId) => {
        const snap = await getDocsFromServer(collection(db, PROGRAMS, programId, SEASONS, seasonId, 'students'));
        return snap.docs.map(s => ({ ...s.data(), id: /^\d+$/.test(s.id) ? Number(s.id) : s.id }));
    },
    getWeekKnightsLog: (programId, seasonId) => weekKnightsRows((seasonsCache[programId] || []).find(s => s.id === seasonId)),
    saveWeekKnightsRows: async (programId, seasonId, rows, meta) => mutateWeekKnights(programId, seasonId, (season, log) => {
        const weekStart = meta.weekStart;
        if (season.frozenWeeks?.[weekStart]) return null;
        for (const row of rows) {
            if (row.weekStart !== weekStart) throw new Error('أسبوع السطر غير مطابق');
            const key = seasonId + '|' + weekStart + '|' + row.halaqaId;
            if (!log[key]) log[key] = { ...row, key, v: 1, frozenAt: serverTimestamp(),
                frozenAtDevice: meta.frozenAtDevice, frozenBy: meta.frozenBy };
        }
        return { weekKnightsLog: log, frozenWeeks: { ...season.frozenWeeks, [weekStart]: serverTimestamp() } };
    }),
    lockWeekRows: async (programId, seasonId, weekStart, stageId, by) => mutateWeekKnights(programId, seasonId, (season, log) => {
        if (!season.frozenWeeks?.[weekStart]) throw new Error('الأسبوع غير مجمّد');
        let changed = false;
        for (const [key, row] of Object.entries(log)) {
            if (row.weekStart !== weekStart || row.stageId !== stageId || row.lockedAt) continue;
            log[key] = { ...row, v: row.v + 1, lockedAt: serverTimestamp(), lockedBy: by,
                lockedSteps: row.steps };
            changed = true;
        }
        return changed ? { weekKnightsLog: log } : null;
    }),
    refreezeWeekKnightsRow: async (programId, seasonId, row, expect, reason, by) => {
        if (programId === 'general') return { success: false, error: 'الحسم نهائي؛ لا تُعاد الحسبة' };
        if (!String(reason || '').trim()) return { success: false, error: 'سبب إعادة الحسم إلزامي' };
        return mutateWeekKnights(programId, seasonId, (season, log) => {
            const key = seasonId + '|' + row.weekStart + '|' + row.halaqaId, old = log[key];
            if (!old) throw new Error('السطر غير موجود');
            if (old.lockedAt) throw new Error('أُعلن الأسبوع؛ لا تُعاد الحسبة');
            if (old.v !== expect) throw new Error('تغيّر السطر من جهاز آخر؛ أعد المراجعة');
            const { refreeze = [], ...previous } = old;
            log[key] = { ...row, key, v: old.v + 1, frozenAt: serverTimestamp(),
                frozenAtDevice: Date.now(), frozenBy: by,
                refreeze: [...refreeze, { reason: reason.trim(), by, atDevice: Date.now(), previous }] };
            return { weekKnightsLog: log };
        });
    },
    saveRisingStar: async (programId, seasonId, record) => mutateWeekKnights(programId, seasonId, season => {
        if (!season.frozenWeeks?.[record.weeks[0]] || !season.frozenWeeks?.[record.weeks[1]])
            throw new Error('الدورة لم تُحسم بعد');
        if (season.risingStars?.[record.cycleEnd]?.[record.halaqaId])
            throw new Error('اعتُمد نجم هذه الحلقة لهذه الدورة؛ لا يُغيَّر');
        if (!['candidate', 'other', 'none'].includes(record.choice) ||
            (record.choice !== 'none' && !record.studentId))
            throw new Error('اختيار النجم غير صالح');
        if (record.choice !== 'candidate' && !String(record.reason || '').trim())
            throw new Error('سبب المعلم إلزامي');
        return { risingStars: {
            ...season.risingStars,
            [record.cycleEnd]: {
                ...season.risingStars?.[record.cycleEnd],
                [record.halaqaId]: { ...record, v: 1, approvedAt: serverTimestamp(), lockedAt: serverTimestamp() }
            }
        } };
    }),

    PROGRAM_DEFS,

    isReady: () => programsReady,
    getInitializationErrors: () => [...initializationErrors],
    getPrograms: () => ({ ...programsCache }),
    getProgram: (id) => programsCache[id] || null,
    getSeasons: (programId) => [...(seasonsCache[programId] || [])],

    getCurrentProgramId: () => currentProgramId,
    getCurrentProgram: () => currentProgramId ? programsCache[currentProgramId] : null,
    getCurrentSeasonId: () => currentSeasonId,
    getCurrentSeason: () => {
        if (!currentProgramId || !currentSeasonId) return null;
        return (seasonsCache[currentProgramId] || []).find(s => s.id === currentSeasonId) || null;
    },

    // إعدادات البرنامج الحالي
    getSettings: () => {
        const p = currentProgramId ? programsCache[currentProgramId] : null;
        return p?.settings || null;
    },

    // هل ميزة مفعّلة في البرنامج الحالي؟
    isFeatureEnabled: (featureName) => {
        const p = currentProgramId ? programsCache[currentProgramId] : null;
        if (!p?.settings?.features) return true;
        return p.settings.features[featureName] !== false;
    },

    // فتح برنامج للعمل عليه
    openProgram: (programId) => {
        const prog = programsCache[programId];
        if (!prog) { console.warn('برنامج غير موجود:', programId); return false; }
        currentProgramId = programId;
        currentSeasonId = prog.activeSeasonId;
        try { localStorage.setItem(CURRENT_PROGRAM_KEY, programId); } catch (e) {}
        console.log('📂 فُتح البرنامج:', prog.name, '| الموسم:', currentSeasonId);
        window.dispatchEvent(new CustomEvent('almahra-program-changed', {
            detail: { programId: currentProgramId, seasonId: currentSeasonId, program: prog }
        }));
        return true;
    },

    // فتح موسم مؤرشف للقراءة فقط
    openArchivedSeason: (programId, seasonId) => {
        const prog = programsCache[programId];
        if (!prog) return false;
        currentProgramId = programId;
        currentSeasonId = seasonId;
        console.log('📦 فُتح موسم مؤرشف:', seasonId);
        window.dispatchEvent(new CustomEvent('almahra-program-changed', {
            detail: { programId, seasonId, program: prog, readOnly: true }
        }));
        return true;
    },

    // هل الموسم الحالي مؤرشف (للقراءة فقط)؟
    isCurrentSeasonArchived: () => {
        const prog = currentProgramId ? programsCache[currentProgramId] : null;
        if (!prog) return false;
        return currentSeasonId !== prog.activeSeasonId;
    },

    getSavedProgramId: () => {
        try { return localStorage.getItem(CURRENT_PROGRAM_KEY) || null; } catch (e) { return null; }
    },

    // التقويم مستقل عن الإعدادات، مع كشف تعارض الأجهزة.
    updateSeasonCalendar: async (programId, seasonId, expected, next) => {
        const blocked = programId === 'general' ? await beforeWrite(programId, seasonId) : null;
        if (blocked) return blocked;
        try {
            if (programId !== 'general') throw new Error('التقويم الدراسي للبرنامج العام فقط');
            await runTransaction(db, async (transaction) => {
                const programRef = doc(db, PROGRAMS, programId);
                const seasonRef = doc(db, PROGRAMS, programId, SEASONS, seasonId);
                const programSnap = await transaction.get(programRef);
                const seasonSnap = await transaction.get(seasonRef);
                if (programSnap.data()?.activeSeasonId !== seasonId) throw new Error('لا يمكن تعديل تقويم موسم غير نشط');
                if (!seasonSnap.exists()) throw new Error('الموسم غير موجود');
                // ترتيب مفاتيح السطر لا يغيّر قيمته، وغياب المصفوفة يختلف عن [].
                const stable = value => JSON.stringify(value, function(key, item) {
                    return item && typeof item === 'object' && !Array.isArray(item)
                        ? Object.fromEntries(Object.keys(item).sort().map(k => [k, item[k]])) : item;
                });
                const current = seasonSnap.data();
                if (['termStart', 'termEnd', 'calendar'].some(k => stable(current[k]) !== stable(expected[k]))) {
                    throw new Error('تغيّر التقويم من جهاز آخر، أعد فتح الإعدادات');
                }
                transaction.update(seasonRef, { termStart: next.termStart, termEnd: next.termEnd, calendar: next.calendar });
            });
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    },

    // تحديث إعدادات البرنامج
    updateSettings: async (programId, newSettings) => {
        const blocked = programId === 'general' ? await beforeWrite(programId) : null;
        if (blocked) return blocked;
        try {
            const payload = { ...newSettings, settingsVersion: SETTINGS_VERSION };
            await updateDoc(doc(db, PROGRAMS, programId), { settings: payload });
            return { success: true };
        } catch (err) {
            console.error('❌ updateSettings:', err);
            return { success: false, error: err.message };
        }
    },

    // إعادة ضبط إعدادات برنامج للافتراضي (زر طوارئ)
    resetSettings: async (programId) => {
        if (programId === 'general') {
            const blocked = await beforeWrite(programId);
            if (blocked) return blocked;
        }
        try {
            const def = PROGRAM_DEFS[programId];
            if (!def) return { success: false, error: 'برنامج غير معروف' };
            const fresh = JSON.parse(JSON.stringify(def.defaultSettings));
            fresh.settingsVersion = SETTINGS_VERSION;
            if (programId === 'general') {
                fresh.teachers = JSON.parse(JSON.stringify(programsCache[programId]?.settings?.teachers || []));
                fresh.halaqas = JSON.parse(JSON.stringify(programsCache[programId]?.settings?.halaqas || []));
            }
            await updateDoc(doc(db, PROGRAMS, programId), { settings: fresh });
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    },

    // تحديث اسم البرنامج
    updateProgramName: async (programId, name) => {
        try {
            await updateDoc(doc(db, PROGRAMS, programId), { name });
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    },

    // ============================================================
    // فرسان اليوم المعتمدون — يُحفظون داخل الموسم ليظهروا على كل جهاز
    // المسار: programs/{programId}/seasons/{seasonId} → حقل knightsLog
    // ============================================================
    saveKnightsEntry: async (programId, seasonId, entry) => {
        if (programId === 'general') return { success: false, error: 'الاعتماد اليدوي للفرسان معطّل في البرنامج العام' };
        if (!programId || !seasonId) return { success: false, error: 'لا يوجد موسم نشط' };
        try {
            const ref = doc(db, PROGRAMS, programId, SEASONS, seasonId);
            const mergeEntry = snap => {
                const log = (snap.exists() && Array.isArray(snap.data().knightsLog)) ? snap.data().knightsLog : [];
                const filtered = log.filter(e => !(e.dateStr === entry.dateStr && (e.mode || 'all') === (entry.mode || 'all')));
                filtered.push(entry);
                filtered.sort((a, b) => (a.dateStr < b.dateStr ? 1 : -1));
                return filtered;
            };
            const snap = await getDoc(ref);
            await updateDoc(ref, { knightsLog: mergeEntry(snap).slice(0, 200) });
            return { success: true };
        } catch (err) {
            console.error('❌ saveKnightsEntry:', err);
            return { success: false, error: err.message };
        }
    },

    getKnightsLog: (programId, seasonId) => {
        const list = seasonsCache[programId] || [];
        const season = list.find(s => s.id === seasonId);
        return Array.isArray(season?.knightsLog) ? season.knightsLog : [];
    },

    // تحديث اسم الموسم النشط
    updateSeasonName: async (programId, seasonId, name) => {
        try {
            await updateDoc(doc(db, PROGRAMS, programId, SEASONS, seasonId), { name });
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    },

    // بدء موسم جديد (يؤرشف الحالي)
    startNewSeason: async (programId, newSeasonName) => {
        try {
            const prog = programsCache[programId];
            if (!prog) return { success: false, error: 'برنامج غير موجود' };

            // أرشفة الموسم الحالي
            if (prog.activeSeasonId) {
                await updateDoc(doc(db, PROGRAMS, programId, SEASONS, prog.activeSeasonId), {
                    status: 'archived',
                    archivedAt: serverTimestamp(),
                    endDate: new Date().toISOString().slice(0, 10)
                });
            }

            // إنشاء موسم جديد
            const newId = await createSeasonInternal(programId, newSeasonName || defaultSeasonName(programId));
            await updateDoc(doc(db, PROGRAMS, programId), { activeSeasonId: newId });

            // فتح الموسم الجديد إن كنا في نفس البرنامج
            if (currentProgramId === programId) {
                currentSeasonId = newId;
                window.dispatchEvent(new CustomEvent('almahra-program-changed', {
                    detail: { programId, seasonId: newId, program: prog }
                }));
            }

            return { success: true, seasonId: newId };
        } catch (err) {
            console.error('❌ startNewSeason:', err);
            return { success: false, error: err.message };
        }
    },

    // حذف موسم مؤرشف نهائياً (مع كل طلابه)
    // إضافة طالب بين فحص الخلو وحذف الموسم لا يمكن إغلاقها من العميل (المعاملات لا تستعلم مجموعات)؛ مقبول ضمن ق٢ (مشرف واحد، جهاز واحد) ولموسم مؤرشف.
    deleteSeason: async (programId, seasonId) => {
        let deletedCount = 0;
        try {
            const prog = programsCache[programId];
            if (prog?.activeSeasonId === seasonId) {
                return { success: false, error: 'لا يمكن حذف الموسم النشط', deletedCount };
            }

            const programSnap = await getDocFromServer(doc(db, PROGRAMS, programId));
            if (programSnap.data()?.activeSeasonId === seasonId) {
                return { success: false, error: 'لا يمكن حذف الموسم النشط', deletedCount };
            }

            // حذف كل الطلاب أولاً (Firestore لا يحذف المجموعات الفرعية تلقائياً)
            const studentsRef = collection(db, PROGRAMS, programId, SEASONS, seasonId, 'students');
            const studentsSnap = await getDocsFromServer(studentsRef);
            for (let i = 0; i < studentsSnap.docs.length; i += 450) {
                const batch = writeBatch(db);
                const students = studentsSnap.docs.slice(i, i + 450);
                students.forEach(d => batch.delete(d.ref));
                await batch.commit();
                deletedCount += students.length;
            }

            const remainingSnap = await getDocsFromServer(studentsRef);
            if (!remainingSnap.empty) {
                return { success: false, error: 'تعذر حذف الموسم: لا تزال هناك وثائق طلاب', deletedCount };
            }

            await runTransaction(db, async (transaction) => {
                const programRef = doc(db, PROGRAMS, programId);
                const seasonRef = doc(db, PROGRAMS, programId, SEASONS, seasonId);
                const programSnap = await transaction.get(programRef);
                if (programSnap.data()?.activeSeasonId === seasonId) {
                    throw new Error('لا يمكن حذف الموسم النشط');
                }
                const seasonSnap = await transaction.get(seasonRef);
                if (!seasonSnap.exists()) {
                    throw new Error('الموسم غير موجود');
                }
                if (seasonSnap.data()?.status === 'active') {
                    throw new Error('لا يمكن حذف الموسم النشط');
                }
                transaction.delete(seasonRef);
            });
            return { success: true, deletedCount };
        } catch (err) {
            console.error('❌ deleteSeason:', err);
            return { success: false, error: err.message, deletedCount };
        }
    },

    countStudents,
    getAllStudents,

    subscribe: (callback) => {
        subscribers.push(callback);
        if (programsReady) { try { callback(); } catch (e) {} }
        return () => { subscribers = subscribers.filter(cb => cb !== callback); };
    },

    getDefaultSettings: (programId) => JSON.parse(JSON.stringify(PROGRAM_DEFS[programId]?.defaultSettings || {}))
};

// ================================================================
// البدء بعد اكتمال المصادقة
// ================================================================
async function boot() {
    try {
        await ensureProgramsExist();
        startListeners();
        console.log('✅ programs-store: البرامج جاهزة');
    } catch (err) {
        console.error('❌ programs-store boot failed:', err);
    }
}

window.addEventListener('almahra-auth-ready', (e) => {
    if (e.detail?.currentUser) boot();
});

if (window.almahraAuth?.currentUser) boot();

console.log('✅ programs-store.js loaded');
