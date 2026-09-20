// ================================================================
// طبقة البرامج والمواسم — Programs & Seasons Store
// ================================================================
// برنامجان ثابتان (الصيفي + اليوم القرآني)، كل واحد له مواسم متعددة
// البنية: programs/{programId}/seasons/{seasonId}/students/{studentId}
// ================================================================

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
    getFirestore,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    query,
    orderBy,
    serverTimestamp,
    writeBatch
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

const PROGRAMS = 'programs';
const SEASONS = 'seasons';
const CURRENT_PROGRAM_KEY = 'almahra_current_program_id';

// ================================================================
// تعريف البرنامجين الثابتين
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
            tiers: [
                { id: 't_beginner',     name: 'المبتدئون',  order: 1 },
                { id: 't_intermediate', name: 'المتوسطون',  order: 2 },
                { id: 't_advanced',     name: 'المتقدمون',  order: 3 }
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
                { id: 't_beginner',     name: 'المبتدئون',  order: 1 },
                { id: 't_intermediate', name: 'المتوسطون',  order: 2 },
                { id: 't_advanced',     name: 'المتقدمون',  order: 3 }
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
const SETTINGS_VERSION = 3;

function migrateSettings(programId, settings) {
    const defaults = PROGRAM_DEFS[programId]?.defaultSettings;
    if (!defaults) return { settings, changed: false };

    const s = settings ? JSON.parse(JSON.stringify(settings)) : {};
    let changed = false;

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

    // الميزات: نضم أي ميزة جديدة بقيمتها الافتراضية دون المساس بما ضبطه المستخدم
    const mergedFeatures = { ...(defaults.features || {}), ...(s.features || {}) };
    if (JSON.stringify(mergedFeatures) !== JSON.stringify(s.features || {})) {
        s.features = mergedFeatures;
        changed = true;
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
// التهيئة: إنشاء البرنامجين + الموسم الأول + ترقية الإعدادات
// ================================================================
async function ensureProgramsExist() {
    for (const key of Object.keys(PROGRAM_DEFS)) {
        const def = PROGRAM_DEFS[key];
        const progRef = doc(db, PROGRAMS, def.id);
        const snap = await getDoc(progRef);

        if (!snap.exists()) {
            console.log(`🆕 إنشاء البرنامج: ${def.name}`);
            const fresh = JSON.parse(JSON.stringify(def.defaultSettings));
            fresh.settingsVersion = SETTINGS_VERSION;
            await setDoc(progRef, {
                name: def.name,
                type: def.id,
                settings: fresh,
                activeSeasonId: null,
                createdAt: serverTimestamp()
            });
        } else {
            // ترقية إعدادات برنامج قائم
            const current = snap.data();
            const { settings: upgraded, changed } = migrateSettings(def.id, current.settings);
            if (changed) {
                console.log(`⬆️ ترقية إعدادات: ${def.name} → v${SETTINGS_VERSION}`);
                await updateDoc(progRef, { settings: upgraded });
            }
        }

        // تأكد من وجود موسم نشط
        const progData = (await getDoc(progRef)).data();
        if (!progData.activeSeasonId) {
            const seasonId = await createSeasonInternal(def.id, defaultSeasonName(def.id));
            await updateDoc(progRef, { activeSeasonId: seasonId });
        }
    }
}

function defaultSeasonName(programId) {
    const now = new Date();
    if (programId === 'summer') {
        return `موسم ${now.getFullYear()}`;
    }
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
        endDate: null
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
                programsReady = Object.keys(programsCache).length === Object.keys(PROGRAM_DEFS).length;
                notify();
            }
        }, (err) => console.error('❌ program listener:', err.code, err.message));

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

// ================================================================
// الواجهة العامة
// ================================================================
window.almahraPrograms = {

    PROGRAM_DEFS,

    isReady: () => programsReady,
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

    // تحديث إعدادات البرنامج
    updateSettings: async (programId, newSettings) => {
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
        try {
            const def = PROGRAM_DEFS[programId];
            if (!def) return { success: false, error: 'برنامج غير معروف' };
            const fresh = JSON.parse(JSON.stringify(def.defaultSettings));
            fresh.settingsVersion = SETTINGS_VERSION;
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
        if (!programId || !seasonId) return { success: false, error: 'لا يوجد موسم نشط' };
        try {
            const ref = doc(db, PROGRAMS, programId, SEASONS, seasonId);
            const snap = await getDoc(ref);
            const log = (snap.exists() && Array.isArray(snap.data().knightsLog)) ? snap.data().knightsLog : [];
            // يُستبدل سجل اليوم نفسه إن وُجد، ولا يتكرر
            const filtered = log.filter(e => e.dateStr !== entry.dateStr);
            filtered.push(entry);
            filtered.sort((a, b) => (a.dateStr < b.dateStr ? 1 : -1));
            await updateDoc(ref, { knightsLog: filtered.slice(0, 200) });
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
    deleteSeason: async (programId, seasonId) => {
        try {
            const prog = programsCache[programId];
            if (prog?.activeSeasonId === seasonId) {
                return { success: false, error: 'لا يمكن حذف الموسم النشط' };
            }

            // حذف كل الطلاب أولاً (Firestore لا يحذف المجموعات الفرعية تلقائياً)
            const studentsSnap = await getDocs(collection(db, PROGRAMS, programId, SEASONS, seasonId, 'students'));
            if (!studentsSnap.empty) {
                const batch = writeBatch(db);
                studentsSnap.forEach(d => batch.delete(d.ref));
                await batch.commit();
            }

            await deleteDoc(doc(db, PROGRAMS, programId, SEASONS, seasonId));
            return { success: true };
        } catch (err) {
            console.error('❌ deleteSeason:', err);
            return { success: false, error: err.message };
        }
    },

    countStudents,

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
