// ================================================================
// طبقة الوصول للبيانات - Data Store Layer
// ================================================================
// تُبدّل تخزين البيانات من localStorage إلى Firestore السحابي
// بقية الكود يستخدم window.almahraData بدل التعامل المباشر مع localStorage
// ================================================================

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
    getFirestore,
    collection,
    doc,
    setDoc,
    deleteDoc,
    onSnapshot,
    writeBatch
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// إعادة استخدام تطبيق Firebase إن كان مُهيّأً (auth.js يهيّئه)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

const STUDENTS_COLLECTION = 'students';

// ================================================================
// الحالة الداخلية
// ================================================================
let studentsCache = [];         // ذاكرة مؤقتة للطلاب - قراءة فورية
let studentsSubscribers = [];   // من يريد إشعاراً بأي تغيير
let studentsUnsubscribe = null; // دالة لإيقاف المستمع
let isReady = false;            // هل استقبلنا أول snapshot؟
let lastError = null;           // آخر خطأ حصل

// ================================================================
// المستمع اللحظي
// يبقى مفتوحاً طوال الجلسة، يستقبل أي تغيير من أي جهاز خلال ثوانٍ
// ================================================================
function startStudentsListener() {
    if (studentsUnsubscribe) return; // مُشغّل فعلاً - لا تكرر

    studentsUnsubscribe = onSnapshot(
        collection(db, STUDENTS_COLLECTION),
        (snapshot) => {
            const students = [];
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                // Firestore يخزّن الـ ID كنص - نعيده رقماً لتوافق البرنامج القديم
                const idAsNum = parseInt(docSnap.id, 10);
                students.push({
                    ...data,
                    id: isNaN(idAsNum) ? docSnap.id : idAsNum
                });
            });
            studentsCache = students;
            isReady = true;
            lastError = null;

            // إبلاغ كل المشتركين
            studentsSubscribers.forEach(cb => {
                try { cb(students); } catch (e) { console.error('subscriber error:', e); }
            });

            console.log(`🔄 data-store: تحديث لحظي — ${students.length} طالب`);
        },
        (err) => {
            console.error('❌ Firestore listener error:', err.code, err.message);
            lastError = err;
        }
    );
}

// ================================================================
// الواجهة العامة (Public API)
// ================================================================
window.almahraData = {

    // قراءة الطلاب الحاليين من الذاكرة (سريعة، متزامنة)
    getStudents: () => [...studentsCache],

    // هل بيانات الطلاب جاهزة؟ (استقبلنا أول snapshot)
    isReady: () => isReady,

    // آخر خطأ حصل (إن وُجد)
    lastError: () => lastError,

    // الاشتراك في التحديثات اللحظية
    // يُستدعى callback في كل مرة تتغير البيانات
    // يرجع دالة لإلغاء الاشتراك
    subscribeStudents: (callback) => {
        studentsSubscribers.push(callback);
        startStudentsListener();
        // إن كانت البيانات جاهزة، استدعِ callback فوراً بالحالة الحالية
        if (isReady) {
            try { callback([...studentsCache]); } catch (e) { console.error(e); }
        }
        return () => {
            studentsSubscribers = studentsSubscribers.filter(cb => cb !== callback);
        };
    },

    // إضافة/تحديث طالب واحد
    upsertStudent: async (student) => {
        if (!student || student.id === undefined || student.id === null) {
            return { success: false, error: 'الطالب يحتاج id' };
        }
        const id = String(student.id);
        const { id: _, ...data } = student; // نستثني الـ id (هو معرّف الوثيقة)
        try {
            await setDoc(doc(db, STUDENTS_COLLECTION, id), data);
            return { success: true };
        } catch (err) {
            console.error('❌ upsertStudent:', err);
            return { success: false, error: err.message };
        }
    },

    // حذف طالب
    removeStudent: async (id) => {
        try {
            await deleteDoc(doc(db, STUDENTS_COLLECTION, String(id)));
            return { success: true };
        } catch (err) {
            console.error('❌ removeStudent:', err);
            return { success: false, error: err.message };
        }
    },

    // حفظ كل الطلاب دفعة واحدة (Batch)
    // - يُستخدم عند تعديلات كثيرة معاً أو نقل البيانات القديمة
    // - يُزامن Firestore ليطابق المصفوفة المُعطاة (يضيف/يعدّل/يحذف)
    saveAllStudents: async (students) => {
        if (!Array.isArray(students)) {
            return { success: false, error: 'students يجب أن تكون مصفوفة' };
        }
        const currentIds = new Set(studentsCache.map(s => String(s.id)));
        const newIds = new Set(students.map(s => String(s.id)));

        const batch = writeBatch(db);

        // إضافة/تحديث كل طالب في المصفوفة
        students.forEach(student => {
            const id = String(student.id);
            const { id: _, ...data } = student;
            batch.set(doc(db, STUDENTS_COLLECTION, id), data);
        });

        // حذف من كان موجوداً في Firestore ولم يعد في المصفوفة
        let deletedCount = 0;
        currentIds.forEach(id => {
            if (!newIds.has(id)) {
                batch.delete(doc(db, STUDENTS_COLLECTION, id));
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

    // إيقاف المستمع (للاختبار أو التنظيف)
    stopListening: () => {
        if (studentsUnsubscribe) {
            studentsUnsubscribe();
            studentsUnsubscribe = null;
        }
    }
};

// ================================================================
// بدء تلقائي عند اكتمال المصادقة
// ================================================================
window.addEventListener('almahra-auth-ready', (e) => {
    const user = e.detail?.currentUser;
    if (user) {
        console.log('🔥 data-store: بدء المستمع للمستخدم', user.email);
        startStudentsListener();
    }
});

// إن كانت المصادقة اكتملت قبل تحميل هذا الملف
if (window.almahraAuth?.currentUser) {
    startStudentsListener();
}

console.log('✅ data-store.js loaded — window.almahraData is ready');
