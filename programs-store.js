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
                pomodoro: true
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
            features: {
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
// التهيئة: إنشاء البرنامجين + الموسم الأول إن لم يوجدا
// ================================================================
async function ensureProgramsExist() {
    for (const key of Object.keys(PROGRAM_DEFS)) {
        const def = PROGRAM_DEFS[key];
        const progRef = doc(db, PROGRAMS, def.id);
        const snap = await getDoc(progRef);

        if (!snap.exists()) {
            console.log(`🆕 إنشاء البرنامج: ${def.name}`);
            await setDoc(progRef, {
                name: def.name,
                type: def.id,
                settings: JSON.parse(JSON.stringify(def.defaultSettings)),
                activeSeasonId: null,
                createdAt: serverTimestamp()
            });
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
            await updateDoc(doc(db, PROGRAMS, programId), { settings: newSettings });
            return { success: true };
        } catch (err) {
            console.error('❌ updateSettings:', err);
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
