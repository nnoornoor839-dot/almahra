// ================================================================
// بوابة المصادقة والصلاحيات - برنامج المهرة
// ================================================================
// هذا الملف يعمل كطبقة حماية فوق البرنامج الأصلي:
// - يمنع أي دخول قبل التحقق من الهوية
// - يجلب دور المستخدم من Firestore
// - يوفر واجهة عامة (window.almahraAuth) لبقية الكود
// ================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
    getAuth,
    signInAnonymously,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    sendPasswordResetEmail,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// تهيئة Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// حفظ الجلسة محلياً حتى لا يحتاج المستخدم إعادة الدخول كل مرة
setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn("Failed to set persistence:", err);
});

// حالة عامة يمكن لبقية الكود استخدامها
window.almahraAuth = {
    currentUser: null,
    currentRole: null,
    currentUserName: null,
    currentTeacherId: null,
    isAdmin: () => window.almahraAuth.currentRole === 'admin',
    isTeacher: () => window.almahraAuth.currentRole === 'teacher',
    signOut: () => signOut(auth)
};
let teacherSignInPending = null;
const TEACHER_CODE_ERROR = 'الرمز غير صحيح أو أُبطل؛ اطلب الرابط من المشرف';
const TEACHER_DENIED_FLAG = 'almahra-teacher-denied';
const TEACHER_PENDING_CODE = 'almahra-teacher-pending-code';
let teacherDeniedReloaded = false;

window.almahraAuth.signInTeacherWithCode = async function(rawCode) {
    const raw = String(rawCode || '').replace(/\s+/g, '');
    const dot = raw.lastIndexOf('.');
    const code = dot > 0 ? raw.slice(0, dot + 1) + raw.slice(dot + 1).toUpperCase() : raw;
    if (dot < 1 || !/^[A-Z0-9]{12}$/.test(code.slice(dot + 1))) {
        showLoginError(TEACHER_CODE_ERROR);
        return { success: false, code: 'TEACHER_CODE_INVALID' };
    }
    const teacherId = code.slice(0, dot);
    // ق60: هوية مجهولة قائمة (جلسة قديمة على الجوال) ← تحديث رمزها بالهوية نفسها بلا دخول جديد (ق4)؛
    // مستخدم بريد (مشرف) ← خروج ثم دخول مجهول؛ لا مستخدم ← دخول مجهول.
    const pending = (async () => {
        if (typeof auth.authStateReady === 'function') await auth.authStateReady();
        let user = auth.currentUser;
        if (user && !user.isAnonymous) { await signOut(auth); user = null; }
        if (!user) user = (await signInAnonymously(auth)).user;
        const ref = doc(db, 'users', user.uid);
        const existing = await getDoc(ref);
        if (existing.exists()) await updateDoc(ref, { code });
        else await setDoc(ref, { role: 'teacher', programId: 'general', teacherId, code });
    })();
    teacherSignInPending = pending;
    try {
        await pending;
        return { success: true };
    } catch (err) {
        await signOut(auth).catch(() => {});
        showLoginError(TEACHER_CODE_ERROR);
        return { success: false, code: 'TEACHER_CODE_INVALID' };
    } finally {
        if (teacherSignInPending === pending) teacherSignInPending = null;
        try { sessionStorage.removeItem(TEACHER_PENDING_CODE); } catch (_) {}
    }
};

// ================================================================
// عناصر الواجهة
// ================================================================
const $ = (id) => document.getElementById(id);

// ================================================================
// دوال العرض والإخفاء
// ================================================================

function showLogin() {
    const overlay = $('loginOverlay');
    const loading = $('loadingOverlay');
    if (loading) loading.classList.add('hidden');
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.classList.add('flex');
    }
    // إخفاء البرنامج الفعلي
    document.body.classList.add('auth-not-ready');
}

function hideLogin() {
    const overlay = $('loginOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
    }
    // إظهار البرنامج
    document.body.classList.remove('auth-not-ready');
}

function showLoginError(msg) {
    const err = $('loginError');
    if (err) {
        err.textContent = msg;
        err.classList.remove('hidden');
    }
}

function clearLoginError() {
    const err = $('loginError');
    if (err) err.classList.add('hidden');
}

// ================================================================
// ترجمة أخطاء Firebase إلى العربية
// ================================================================
function translateAuthError(code) {
    const map = {
        'auth/invalid-email': 'صيغة البريد الإلكتروني غير صحيحة',
        'auth/user-disabled': 'هذا الحساب معطّل، اتصل بالمشرف',
        'auth/user-not-found': 'لا يوجد حساب بهذا البريد',
        'auth/wrong-password': 'كلمة المرور غير صحيحة',
        'auth/invalid-credential': 'البريد أو كلمة المرور غير صحيحة',
        'auth/too-many-requests': 'محاولات كثيرة فاشلة، حاول بعد قليل',
        'auth/network-request-failed': 'لا يوجد اتصال بالإنترنت',
        'auth/missing-password': 'يرجى إدخال كلمة المرور'
    };
    return map[code] || 'حدث خطأ: ' + code;
}

function translateRole(role) {
    const map = {
        'admin': 'مشرف عام',
        'teacher': 'معلم',
        'viewer': 'شاشة عرض'
    };
    return map[role] || role;
}

// ================================================================
// جلب دور المستخدم من Firestore
// ================================================================
async function fetchUserData(uid) {
    try {
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists()) {
            return userDoc.data();
        }
        return null;
    } catch (err) {
        console.error('❌ خطأ في جلب دور المستخدم:', err);
        return null;
    }
}

// ================================================================
// معالج زر تسجيل الدخول
// ================================================================
async function handleLogin(e) {
    e.preventDefault();
    clearLoginError();

    const email = $('loginEmail').value.trim();
    const password = $('loginPassword').value;

    if (!email || !password) {
        showLoginError('يرجى إدخال البريد وكلمة المرور');
        return;
    }

    const btn = $('loginBtn');
    btn.disabled = true;
    btn.textContent = 'جاري الدخول…';

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // النجاح يُعالَج تلقائياً في onAuthStateChanged
    } catch (err) {
        showLoginError(translateAuthError(err.code));
        btn.disabled = false;
        btn.textContent = 'دخول';
    }
}

// ================================================================
// معالج زر نسيت كلمة المرور
// ================================================================
async function handleForgotPassword() {
    const email = $('loginEmail').value.trim();
    if (!email) {
        showLoginError('أدخل بريدك الإلكتروني أولاً لاسترجاع كلمة المرور');
        return;
    }
    try {
        await sendPasswordResetEmail(auth, email);
        clearLoginError();
        alert('✅ تم إرسال رابط استعادة كلمة المرور إلى بريدك\n\nراجع صندوق الوارد (وربما مجلد الرسائل غير المرغوبة).');
    } catch (err) {
        showLoginError(translateAuthError(err.code));
    }
}

// ================================================================
// معالج زر تسجيل الخروج (يُستدعى من الواجهة)
// ================================================================
window.almahraLogout = async function() {
    if (confirm('هل تريد تسجيل الخروج من البرنامج؟')) {
        try {
            await signOut(auth);
            location.reload();
        } catch (err) {
            alert('فشل تسجيل الخروج: ' + err.message);
        }
    }
};

// ================================================================
// مراقب حالة الدخول (يعمل تلقائياً عند كل تغيير)
// ================================================================
// ق60: رابط ?k= يُعالَج عند تقييم الوحدة، قبل أول معالجة لـonAuthStateChanged:
// يُحفظ الرمز معلّقاً في sessionStorage قبل مسحه من العنوان، ويُضبط teacherSignInPending فينتظره مستمع الدخول.
(() => {
    let linkCode = null;
    try {
        const url = new URL(location.href);
        linkCode = url.searchParams.get('k');
        if (linkCode !== null) {
            try { sessionStorage.setItem(TEACHER_PENDING_CODE, linkCode); } catch (_) {}
            url.searchParams.delete('k');
            history.replaceState(history.state, '', url.pathname + url.search + url.hash);
        }
    } catch (_) { return; }
    if (linkCode === null) return;
    $('teacherCodeForm')?.classList.remove('hidden');
    $('loginForm')?.classList.add('hidden');
    window.almahraAuth.signInTeacherWithCode(linkCode);
})();

onAuthStateChanged(auth, async (user) => {
    if (user) {
        // المستخدم مسجّل دخول - نتحقق من دوره
        // ق60: ما دام دخول المعلم بالرمز قائماً (رابط ?k=) يُنتظر أولاً، فلا يُقرأ دور الجلسة القديمة ولا يبدأ boot برمزها المبطَل.
        if (teacherSignInPending) {
            try { await teacherSignInPending; } catch (_) {}
            if (auth.currentUser?.uid !== user.uid) return;   // الجلسة القديمة (مشرف خرج) استُبدلت بالهوية المجهولة
        }
        let userData = await fetchUserData(user.uid);
        if (!userData && teacherSignInPending) {
            try { await teacherSignInPending; } catch (_) {}
            userData = await fetchUserData(user.uid);
        }
        if (auth.currentUser?.uid !== user.uid) return;

        if (!userData || !userData.role) {
            // لا يوجد دور معتمد لهذا الحساب
            console.warn('⚠️ لا يوجد دور معتمد للمستخدم:', user.email);
            await signOut(auth);
            showLogin();
            showLoginError('حسابك ليس له صلاحيات في البرنامج. اتصل بالمشرف.');
            return;
        }

        // كل شيء صحيح - نحفظ الحالة عالمياً
        window.almahraAuth.currentUser = user;
        window.almahraAuth.currentRole = userData.role;
        window.almahraAuth.currentUserName = userData.name || user.email;
        window.almahraAuth.currentTeacherId = userData.role === 'teacher' ? userData.teacherId : null;

        // تحديث شريط المستخدم في الأعلى
        const userInfo = $('authUserInfo');
        if (userInfo) {
            userInfo.innerHTML = `
                <i class="fas fa-user-circle text-emerald-600"></i>
                <span>${escapeHtml(userData.name || user.email)}</span>
                <span class="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">${translateRole(userData.role)}</span>
            `;
            userInfo.classList.remove('hidden');
        }

        // إظهار زر الخروج
        const logoutBtn = $('authLogoutBtn');
        if (logoutBtn) logoutBtn.classList.remove('hidden');

        // إخفاء شاشة الدخول
        hideLogin();

        console.log('✅ تم الدخول:', user.email, '| الدور:', userData.role);

        // إشعار البرنامج بجاهزية الحالة (لأي كود ينتظرها)
        window.dispatchEvent(new CustomEvent('almahra-auth-ready', { detail: window.almahraAuth }));

    } else {
        // لا يوجد مستخدم مسجّل
        window.almahraAuth.currentUser = null;
        window.almahraAuth.currentRole = null;
        window.almahraAuth.currentUserName = null;
        window.almahraAuth.currentTeacherId = null;

        const userInfo = $('authUserInfo');
        if (userInfo) userInfo.classList.add('hidden');
        const logoutBtn = $('authLogoutBtn');
        if (logoutBtn) logoutBtn.classList.add('hidden');

        showLogin();
    }
});

// دالة صغيرة لتنظيف النصوص قبل عرضها كـ HTML
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ================================================================
// ربط الأحداث بالنموذج
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
    const form = $('loginForm');
    if (form) form.addEventListener('submit', handleLogin);

    const forgot = $('forgotBtn');
    if (forgot) forgot.addEventListener('click', handleForgotPassword);
    $('loginRoleAdmin')?.addEventListener('click', () => {
        $('loginForm')?.classList.remove('hidden');
        $('teacherCodeForm')?.classList.add('hidden');
        clearLoginError();
    });
    $('loginRoleTeacher')?.addEventListener('click', () => {
        $('teacherCodeForm')?.classList.remove('hidden');
        $('loginForm')?.classList.add('hidden');
        clearLoginError();
    });
    $('teacherCodeForm')?.addEventListener('submit', async e => {
        e.preventDefault(); clearLoginError();
        const btn = $('teacherCodeBtn');
        if (btn) btn.disabled = true;
        await window.almahraAuth.signInTeacherWithCode($('teacherCodeInput')?.value);
        if (btn) btn.disabled = false;
    });
    let deniedFlag = null;
    try { deniedFlag = sessionStorage.getItem(TEACHER_DENIED_FLAG); sessionStorage.removeItem(TEACHER_DENIED_FLAG); } catch (_) {}
    if (deniedFlag) { teacherDeniedReloaded = true; showLoginError(TEACHER_CODE_ERROR); }
});

// ق50/ق53: الإبطال = خروج ثم إعادة تحميل (كخروج المشرف)؛ الرسالة تعبر إعادة التحميل بعلامة في sessionStorage
// تُقرأ عند التحميل وتُعرض في #loginError ثم تُمسح. إن رُفض المعلم مرة ثانية في صفحة أُعيد تحميلها بسبب الإبطال
// (أي لم يثبت الخروج) فلا إعادة تحميل أخرى: شاشة الدخول بالرسالة مباشرة، فلا حلقة إعادة تحميل.
window.addEventListener('almahra-teacher-denied', async () => {
    // ق60: رفض يقع أثناء دخول بالرمز (تحديث الرمز لم يكتمل) يُهمل: لا خروج ولا إعادة تحميل؛ بعد اكتماله يقرأ مستمع الدخول الدور ويبدأ boot من جديد.
    if (teacherSignInPending) return;
    if (!window.almahraAuth.isTeacher()) return;
    if (!teacherDeniedReloaded) {
        try { sessionStorage.setItem(TEACHER_DENIED_FLAG, '1'); } catch (_) {}
        await signOut(auth).catch(() => {});
        location.reload();
        return;
    }
    await signOut(auth).catch(() => {});
    showLogin();
    showLoginError(TEACHER_CODE_ERROR);
});
