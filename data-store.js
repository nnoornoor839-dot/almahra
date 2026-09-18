// ================================================================
// طبقة الوصول للبيانات - Data Store Layer
// ================================================================
// تُبدّل تخزين البيانات من localStorage إلى Firestore السحابي
// الطلاب الآن داخل حدث محدد: events/{eventId}/students/{studentId}
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

const EVENTS_COLLECTION = 'events';
const STUDENTS_SUBCOLLECTION = 'students';

// ================================================================
// الحالة الداخلية
// ================================================================
let studentsCache = [];
let studentsSubscribers = [];
let studentsUnsubscribe = null;
let isReady = false;
let lastError = null;
let activeEventId = null;

// مرجع مجموعة طلاب الحدث الحالي
function studentsCollectionRef() {
    if (!activeEventId) return null;
    return collection(db, EVENTS_COLLECTION, activeEventId, STUDENTS_SUBCOLLECTION);
}

function studentDocRef(studentId) {
    if (!activeEventId) return null;
    return doc(db, EVENTS_COLLECTION, activeEventId, STUDENTS_SUBCOLLECTION, String(studentId));
}

// ================================================================
// المستمع اللحظي لطلاب الحدث الحالي
// ================================================================
function startStudentsListener() {
    stopStudentsListener();

    const ref = studentsCollectionRef();
    if (!ref) {
        console.warn('⚠️ data-store: لا يوجد حدث محدد — لن يبدأ المستمع');
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
                students.push({
                    ...data,
                    id: isNaN(idAsNum) ? docSnap.id : idAsNum
                });
            });
            studentsCache = students;
            isReady = true;
            lastError = null;
            notifySubscribers();
            console.log(`🔄 data-store: ${students.length} طالب في الحدث ${activeEventId}`);
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

function notifySubscribers() {
    studentsSubscribers.forEach(cb => {
        try { cb([...studentsCache]); } catch (e) { console.error('subscriber error:', e); }
    });
}

// ================================================================
// الواجهة العامة
// ================================================================
window.almahraData = {

    getStudents: () => [...studentsCache],
    isReady: () => isReady,
    lastError: () => lastError,
    getActiveEventId: () => activeEventId,

    // تبديل الحدث النشط - يُعيد تشغيل المستمع على طلاب الحدث الجديد
    setActiveEvent: (eventId) => {
        if (activeEventId === eventId) return;
        activeEventId = eventId;
        studentsCache = [];
        isReady = false;
        console.log('📂 data-store: تبديل إلى الحدث', eventId);
        startStudentsListener();
    },

    subscribeStudents: (callback) => {
        studentsSubscribers.push(callback);
        if (activeEventId && !studentsUnsubscribe) startStudentsListener();
        if (isReady) {
            try { callback([...studentsCache]); } catch (e) { console.error(e); }
        }
        return () => {
            studentsSubscribers = studentsSubscribers.filter(cb => cb !== callback);
        };
    },

    upsertStudent: async (student) => {
        if (!activeEventId) return { success: false, error: 'لا يوجد حدث محدد' };
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
        if (!activeEventId) return { success: false, error: 'لا يوجد حدث محدد' };
        try {
            await deleteDoc(studentDocRef(id));
            return { success: true };
        } catch (err) {
            console.error('❌ removeStudent:', err);
            return { success: false, error: err.message };
        }
    },

    saveAllStudents: async (students) => {
        if (!activeEventId) return { success: false, error: 'لا يوجد حدث محدد' };
        if (!Array.isArray(students)) {
            return { success: false, error: 'students يجب أن تكون مصفوفة' };
        }

        const currentIds = new Set(studentsCache.map(s => String(s.id)));
        const newIds = new Set(students.map(s => String(s.id)));

        const batch = writeBatch(db);

        students.forEach(student => {
            const { id: _, ...data } = student;
            batch.set(studentDocRef(student.id), data);
        });

        let deletedCount = 0;
        currentIds.forEach(id => {
            if (!newIds.has(id)) {
                batch.delete(studentDocRef(id));
                deletedCount++;
            }
        });

        try {
            await batch.commit();
            return { success: true, saved: students.length, deleted: deletedCount };
        } catch (err) {
            console.error('❌ saveAllStudents:', err);
            return { success: false, error: err.message };
        }
    },

    // نسخ طلاب من حدث آخر (للمتابعة من حدث سابق)
    // keepProgress=false يعني نأخذ الأسماء فقط بلا سجلات
    importStudentsFromEvent: async (sourceEventId, keepProgress = true) => {
        if (!activeEventId) return { success: false, error: 'لا يوجد حدث محدد' };
        try {
            const srcRef = collection(db, EVENTS_COLLECTION, sourceEventId, STUDENTS_SUBCOLLECTION);
            const snapshot = await getDocs(srcRef);
            const batch = writeBatch(db);
            let count = 0;

            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const newData = keepProgress
                    ? data
                    : { name: data.name, history: {} };
                batch.set(studentDocRef(docSnap.id), newData);
                count++;
            });

            await batch.commit();
            return { success: true, imported: count };
        } catch (err) {
            console.error('❌ importStudentsFromEvent:', err);
            return { success: false, error: err.message };
        }
    },

    stopListening: stopStudentsListener
};

// ================================================================
// الاستجابة لتغيير الحدث من events-store
// ================================================================
window.addEventListener('almahra-event-changed', (e) => {
    // detail يحمل { id, event } - نعتمد على id فقط (قد يصل قبل الكائن الكامل)
    const eventId = e.detail?.id || null;
    if (eventId) {
        window.almahraData.setActiveEvent(eventId);
    } else {
        // لا يوجد حدث (حُذف أو أُلغي الاختيار) - أوقف المستمع وفرّغ البيانات
        stopStudentsListener();
        activeEventId = null;
        studentsCache = [];
        isReady = false;
        notifySubscribers();
    }
});

console.log('✅ data-store.js loaded — window.almahraData is ready');
