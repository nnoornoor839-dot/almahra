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
    updateDoc,
    deleteField,
    deleteDoc,
    onSnapshot,
    writeBatch,
    getDocs,
    runTransaction
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
let writeGuard = null;
const WRITE_GUARD_ERROR = 'لا يمكن الحفظ الآن: الأسبوع الماضي لم يُغلق بعد (تحقق من الاتصال ثم أعد المحاولة)';
async function beforeWrite(programId = activeProgramId, seasonId = activeSeasonId) {
    if (programId !== 'general') return null;
    try {
        const result = writeGuard && await writeGuard(programId, seasonId);
        if (result?.ok === true || result?.success === true) {
            if (activeProgramId === programId && activeSeasonId === seasonId) return null;
        }
    } catch (_) {}
    return { success: false, error: WRITE_GUARD_ERROR };
}

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

function hasUndefined(v) {
    // Firestore يرفض الطلب كله إن وُجد undefined في أي عمق؛ يُكشف هنا قبل الإرسال
    if (v === undefined) return true;
    if (v === null || typeof v !== 'object') return false;
    return Object.values(v).some(hasUndefined);
}

function toFirestoreFields(fields) {
    // index.html لا يستورد Firebase فيرسل علامة الحذف { __almahraDelete: true }؛ تتحول هنا إلى deleteField() على المفتاح المباشر وحده
    const out = {};
    Object.keys(fields).forEach(k => {
        const v = fields[k];
        out[k] = (v && v.__almahraDelete === true) ? deleteField() : v;
    });
    return out;
}

// إنشاء general فقط: معاملة تحمي مستند الرقم من الاستبدال، ولا تضمن تفرد الاسم بين الأجهزة.
async function createGeneralStudentIfAbsent(student, expectedSeasonId) {
    const blocked = activeProgramId === 'general' ? await beforeWrite() : null;
    if (blocked) return blocked;
    const programId = activeProgramId, seasonId = activeSeasonId;
    const validId = value => typeof value === 'string' && value.trim() === value &&
        value.length > 0 && new TextEncoder().encode(value).length <= 1500 &&
        !value.includes('/') && value !== '.' && value !== '..' && !/^__.*__$/.test(value);
    const contextValid = () => programId === 'general' && activeProgramId === programId &&
        activeSeasonId === seasonId && seasonId === expectedSeasonId && isReady && !isReadOnly;
    if (!contextValid() || !validId(expectedSeasonId))
        return { success: false, code: 'IMPORT_CONTEXT_INVALID', error: 'سياق general غير جاهز أو تغيّر أو للقراءة فقط' };
    if (!student || typeof student !== 'object' || Array.isArray(student) || hasUndefined(student) ||
        !['number', 'string'].includes(typeof student.id) ||
        !/^[1-9]\d*$/.test(String(student.id)) || !Number.isSafeInteger(Number(student.id)) ||
        !validId(student.sid) || !validId(student.teacherId) || !validId(student.stage) || !validId(student.halaqaId))
        return { success: false, code: 'INVALID_STUDENT', error: 'معرّفات الطالب غير صالحة أو توجد قيمة undefined' };
    try {
        const { id, ...data } = structuredClone(student);
        data.joinedOn = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        const ref = doc(db, PROGRAMS, programId, SEASONS, seasonId, STUDENTS, String(id));
        const guard = () => {
            if (!contextValid()) throw Object.assign(new Error('تغيّر سياق الحفظ أو صلاحية الكتابة'), { code: 'IMPORT_CONTEXT_INVALID' });
        };
        await runTransaction(db, async transaction => {
            guard();
            const snapshot = await transaction.get(ref);
            guard();
            if (snapshot.exists()) throw Object.assign(new Error('رقم الطالب موجود؛ لم يُعدّل مستنده'), { code: 'STUDENT_ID_CONFLICT' });
            transaction.set(ref, data);
            guard();
        });
        // المعاملة المرسلة قد تنجح بعد تبديل الواجهة: نجاحها يُنسب إلى سياقها المثبّت وحده.
        return { success: true, programId, seasonId, contextChanged: !contextValid() };
    } catch (error) {
        return { success: false, code: error.code || 'STUDENT_CREATE_FAILED', error: error.message };
    }
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

    setWriteGuard: fn => { writeGuard = fn; },
    createGeneralStudentIfAbsent,

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
        const blocked = activeProgramId === 'general' ? await beforeWrite() : null;
        if (blocked) return blocked;
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

    // كتابة حقول طالب واحد بمساراتها المنقّطة (history.<تاريخ>.entries.<مفتاح>…) بدل الوثيقة كلها:
    // جهازان يحفظان للطالب نفسه في اللحظة نفسها لا يطمس أحدهما ما كتبه الآخر
    patchStudent: async (id, fields) => {
        const blocked = activeProgramId === 'general' ? await beforeWrite() : null;
        if (blocked) return blocked;
        if (isReadOnly) return { success: false, error: 'هذا موسم مؤرشف — للقراءة فقط' };
        if (!activeProgramId || !activeSeasonId) return { success: false, error: 'لم تُحدَّد جلسة عمل' };
        if (!fields || typeof fields !== 'object' || !Object.keys(fields).length) return { success: false, error: 'لا حقول للحفظ' };
        if (hasUndefined(fields)) return { success: false, error: 'قيمة غير معرّفة (undefined) في الحقول — لم يُرسل شيء' };
        try {
            await updateDoc(studentDocRef(id), toFirestoreFields(fields));
            return { success: true };
        } catch (err) {
            console.error('❌ patchStudent:', err);
            return { success: false, error: err.message };
        }
    },

    // عمليات جماعية (نقاط المجموعات، التوزيع، الاستيراد): { type: 'update', id, fields } | { type: 'set', id, data } | { type: 'delete', id }
    // تُقسَّم دفعات ≤ ٤٥٠ (حد Firestore ٥٠٠): كل دفعة ذرّية وحدها، أما المجموع الأكبر من دفعة فليس ذرّياً —
    // committed يقول كم هبط فعلاً قبل أول دفعة فاشلة
    // دفعة واحدة بمعاملة: جميع القراءات تسبق الكتابة، والعدّ من المحاولة التي التزمت فعلاً.
    setMissingJoinedOn: async (programId, seasonId, ids, dateStr) => {
        const blocked = activeProgramId === 'general' ? await beforeWrite() : null;
        if (blocked) return blocked;
        const empty = { committed: 0, skipped: 0, notFound: 0, committedIds: [] };
        const sameContext = () => programId === 'general' && activeProgramId === programId && activeSeasonId === seasonId;
        const guard = () => {
            if (!sameContext()) throw Object.assign(new Error('تغيّر سياق الموسم'), { code: 'JOINED_ON_CONTEXT_CHANGED' });
            if (!isReady || isReadOnly) throw new Error('الموسم غير جاهز أو مؤرشف');
        };
        try {
            guard();
            if (!Array.isArray(ids) || ids.length > 400 || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr) ||
                !seasonId || String(seasonId).includes('/') || ids.some(id => !String(id) || String(id).includes('/')))
                throw new Error('دفعة تثبيت غير صالحة؛ الحد الأقصى 400 طالب');
            const refs = [...new Set(ids.map(String))].map(id => doc(db, PROGRAMS, programId, SEASONS, seasonId, STUDENTS, id));
            const result = await runTransaction(db, async transaction => {
                guard();
                const snapshots = [];
                for (const ref of refs) snapshots.push(await transaction.get(ref));
                guard();
                const counts = { ...empty, committedIds: [] };
                snapshots.forEach((snapshot, i) => {
                    if (!snapshot.exists()) { counts.notFound++; return; }
                    if (snapshot.data().joinedOn) { counts.skipped++; return; }
                    transaction.update(refs[i], { joinedOn: dateStr });
                    counts.committed++;
                    counts.committedIds.push(snapshot.id);
                });
                return counts;
            });
            return { success: true, ...result };
        } catch (error) {
            return { success: false, ...empty, code: error.code, error: error.message };
        }
    },

    commitBatch: async (ops) => {
        const blocked = activeProgramId === 'general' ? await beforeWrite() : null;
        if (blocked) return blocked;
        if (isReadOnly) return { success: false, committed: 0, error: 'هذا موسم مؤرشف — للقراءة فقط' };
        if (!activeProgramId || !activeSeasonId) return { success: false, committed: 0, error: 'لم تُحدَّد جلسة عمل' };
        if (!Array.isArray(ops)) return { success: false, committed: 0, error: 'ops يجب أن تكون مصفوفة' };
        if (hasUndefined(ops)) return { success: false, committed: 0, error: 'قيمة غير معرّفة (undefined) في العمليات — لم يُرسل شيء' };
        let committed = 0;
        try {
            for (let i = 0; i < ops.length; i += 450) {
                const chunk = ops.slice(i, i + 450), batch = writeBatch(db);
                chunk.forEach(op => {
                    const ref = studentDocRef(op.id);
                    if (op.type === 'update') batch.update(ref, toFirestoreFields(op.fields));
                    else if (op.type === 'set') batch.set(ref, op.data);
                    else if (op.type === 'delete') batch.delete(ref);
                    else throw new Error('عملية غير معروفة: ' + op.type);
                });
                await batch.commit();
                committed += chunk.length;
            }
            return { success: true, committed };
        } catch (err) {
            console.error('❌ commitBatch:', err);
            return { success: false, committed, error: err.message };
        }
    },

    removeStudent: async (id) => {
        const blocked = activeProgramId === 'general' ? await beforeWrite() : null;
        if (blocked) return blocked;
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
        const blocked = activeProgramId === 'general' ? await beforeWrite() : null;
        if (blocked) return blocked;
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
        const blocked = activeProgramId === 'general' ? await beforeWrite() : null;
        if (blocked) return blocked;
        if (isReadOnly) return { success: false, error: 'موسم مؤرشف' };
        if (!activeProgramId || !activeSeasonId) return { success: false, error: 'لم تُحدَّد جلسة عمل' };
        try {
            const srcRef = studentsCollectionRef(srcProgramId, srcSeasonId);
            if (!srcRef) return { success: false, error: 'مصدر غير صالح' };

            const snapshot = await getDocs(srcRef);
            if (snapshot.empty) return { success: true, imported: 0 };

            const joinedOn = activeProgramId === 'general' ? window.almahraPrograms?.getCurrentSeason()?.termStart : null;
            if (activeProgramId === 'general' && !joinedOn) return { success: false, error: 'حدّد يوم انطلاق الموسم أولاً' };
            const batch = writeBatch(db);
            let count = 0;
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const newData = keepProgress
                    ? data
                    : {
                        name: data.name,
                        history: {},
                        // مقدار الحفظ حقيقة تنتقل مع الطالب؛ الشريحة لا تُخزَّن بل تُحسب منه بتعريفات البرنامج
                        memorizedJuz: Number.isInteger(data.memorizedJuz) ? data.memorizedJuz : null,
                        // جوال ولي الأمر حقيقة تنتقل معه أيضاً — لا علاقة لها بتقدّم الموسم
                        parentPhone: data.parentPhone || null,
                        lastSurah: data.lastSurah || null,
                        lastAyah: data.lastAyah || null,
                        lastDailySurah: data.lastDailySurah || null,
                        lastDailyAyah: data.lastDailyAyah || null
                      };
                if (activeProgramId === 'general') newData.joinedOn = joinedOn;
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
