// ================================================================
// طبقة الوصول لبيانات الطلاب — Data Store Layer
// ================================================================
// البنية: programs/{programId}/seasons/{seasonId}/students/{studentId}
// تتبع البرنامج والموسم النشطين من programs-store
// ================================================================

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
    getFirestore,
    collection,
    doc,
    setDoc,
    deleteDoc,
    onSnapshot,
    writeBatch,
    getDocs
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

const PROGRAMS = 'programs';
const SEASONS = 'seasons';
const STUDENTS = 'students';

// ================================================================
// الحالة الداخلية
// ================================================================
let studentsCache = [];
let studentsSubscribers = [];
let studentsUnsubscribe = null;
let isReady = false;
let lastError = null;
let activeProgramId = null;
let activeSeasonId = null;
let isReadOnly = false;

function studentsCollectionRef(programId = activeProgramId, seasonId = activeSeasonId) {
    if (!programId || !seasonId) return null;
    return collection(db, PROGRAMS, programId, SEASONS, seasonId, STUDENTS);
}

function studentDocRef(studentId) {
    if (!activeProgramId || !activeSeasonId) return null;
    return doc(db, PROGRAMS, activeProgramId, SEASONS, activeSeasonId, STUDENTS, String(studentId));
}

function notifySubscribers() {
    studentsSubscribers.forEach(cb => {
        try { cb([...studentsCache]); } catch (e) { console.error('subscriber error:', e); }
    });
}

// ================================================================
// المستمع اللحظي
// ================================================================
function startStudentsListener() {
    stopStudentsListener();

    const ref = studentsCollectionRef();
    if (!ref) {
        console.warn('⚠️ data-store: لا يوجد برنامج/موسم محدد');
        studentsCache = [];
        isReady = false;
        notifySubscribers();
        return;
    }

    studentsUnsubscribe = onSnapshot(
        ref,
        (snapshot) => {
            const students = [];
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const idAsNum = parseInt(docSnap.id, 10);
                students.push({ ...data, id: isNaN(idAsNum) ? docSnap.id : idAsNum });
            });
            studentsCache = students;
            isReady = true;
            lastError = null;
            notifySubscribers();
            console.log(`🔄 data-store: ${students.length} طالب (${activeProgramId}/${activeSeasonId})`);
        },
        (err) => {
            console.error('❌ Firestore listener error:', err.code, err.message);
            lastError = err;
        }
    );
}

function stopStudentsListener() {
    if (studentsUnsubscribe) {
        studentsUnsubscribe();
        studentsUnsubscribe = null;
    }
}

// ================================================================
// الواجهة العامة
// ================================================================
window.almahraData = {

    getStudents: () => [...studentsCache],
    isReady: () => isReady,
    lastError: () => lastError,
    getActiveProgramId: () => activeProgramId,
    getActiveSeasonId: () => activeSeasonId,
    isReadOnly: () => isReadOnly,

    // تبديل البرنامج/الموسم النشط
    setActiveContext: (programId, seasonId, readOnly = false) => {
        if (activeProgramId === programId && activeSeasonId === seasonId && isReadOnly === readOnly) return;
        activeProgramId = programId || null;
        activeSeasonId = seasonId || null;
        isReadOnly = !!readOnly;
        studentsCache = [];
        isReady = false;
        console.log('📂 data-store: السياق الجديد', programId, seasonId, readOnly ? '(قراءة فقط)' : '');
        if (activeProgramId && activeSeasonId) startStudentsListener();
        else { stopStudentsListener(); notifySubscribers(); }
    },

    subscribeStudents: (callback) => {
        studentsSubscribers.push(callback);
        if (activeProgramId && activeSeasonId && !studentsUnsubscribe) startStudentsListener();
        if (isReady) { try { callback([...studentsCache]); } catch (e) { console.error(e); } }
        return () => { studentsSubscribers = studentsSubscribers.filter(cb => cb !== callback); };
    },

    upsertStudent: async (student) => {
        if (isReadOnly) return { success: false, error: 'هذا موسم مؤرشف — للقراءة فقط' };
        if (!activeProgramId || !activeSeasonId) return { success: false, error: 'لم تُحدَّد جلسة عمل' };
        if (!student || student.id === undefined || student.id === null) {
            return { success: false, error: 'الطالب يحتاج id' };
        }
        const { id: _, ...data } = student;
        try {
            await setDoc(studentDocRef(student.id), data);
            return { success: true };
        } catch (err) {
            console.error('❌ upsertStudent:', err);
            return { success: false, error: err.message };
        }
    },

    removeStudent: async (id) => {
        if (isReadOnly) return { success: false, error: 'هذا موسم مؤرشف — للقراءة فقط' };
        if (!activeProgramId || !activeSeasonId) return { success: false, error: 'لم تُحدَّد جلسة عمل' };
        try {
            await deleteDoc(studentDocRef(id));
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    },

    saveAllStudents: async (students) => {
        if (isReadOnly) return { success: false, error: 'هذا موسم مؤرشف — للقراءة فقط' };
        if (!activeProgramId || !activeSeasonId) return { success: false, error: 'لم تُحدَّد جلسة عمل' };
        if (!Array.isArray(students)) return { success: false, error: 'students يجب أن تكون مصفوفة' };

        const currentIds = new Set(studentsCache.map(s => String(s.id)));
        const newIds = new Set(students.map(s => String(s.id)));

        const batch = writeBatch(db);
        students.forEach(student => {
            const { id: _, ...data } = student;
            batch.set(studentDocRef(student.id), data);
        });

        let deletedCount = 0;
        currentIds.forEach(id => {
            if (!newIds.has(id)) { batch.delete(studentDocRef(id)); deletedCount++; }
        });

        try {
            await batch.commit();
            return { success: true, saved: students.length, deleted: deletedCount };
        } catch (err) {
            console.error('❌ saveAllStudents:', err);
            return { success: false, error: err.message };
        }
    },

    // استيراد طلاب من موسم سابق (للمتابعة أو البدء بنفس الأسماء)
    importStudentsFromSeason: async (srcProgramId, srcSeasonId, keepProgress = true) => {
        if (isReadOnly) return { success: false, error: 'موسم مؤرشف' };
        if (!activeProgramId || !activeSeasonId) return { success: false, error: 'لم تُحدَّد جلسة عمل' };
        try {
            const srcRef = studentsCollectionRef(srcProgramId, srcSeasonId);
            if (!srcRef) return { success: false, error: 'مصدر غير صالح' };

            const snapshot = await getDocs(srcRef);
            if (snapshot.empty) return { success: true, imported: 0 };

            const batch = writeBatch(db);
            let count = 0;
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const newData = keepProgress
                    ? data
                    : {
                        name: data.name,
                        history: {},
                        lastSurah: data.lastSurah || null,
                        lastAyah: data.lastAyah || null,
                        lastDailySurah: data.lastDailySurah || null,
                        lastDailyAyah: data.lastDailyAyah || null
                      };
                batch.set(studentDocRef(docSnap.id), newData);
                count++;
            });
            await batch.commit();
            return { success: true, imported: count };
        } catch (err) {
            console.error('❌ importStudentsFromSeason:', err);
            return { success: false, error: err.message };
        }
    },

    stopListening: stopStudentsListener
};

// ================================================================
// الاستجابة لتغيير البرنامج/الموسم
// ================================================================
window.addEventListener('almahra-program-changed', (e) => {
    const d = e.detail || {};
    window.almahraData.setActiveContext(d.programId, d.seasonId, d.readOnly);
});

console.log('✅ data-store.js loaded — programs/seasons aware');
