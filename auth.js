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
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    sendPasswordResetEmail,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
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
    isAdmin: () => window.almahraAuth.currentRole === 'admin',
    isTeacher: () => window.almahraAuth.currentRole === 'teacher',
    signOut: () => signOut(auth)
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
    btn.textContent = '⏳ جاري الدخول...';

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // النجاح يُعالَج تلقائياً في onAuthStateChanged
    } catch (err) {
        showLoginError(translateAuthError(err.code));
        btn.disabled = false;
        btn.textContent = '🔓 تسجيل الدخول';
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
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // المستخدم مسجّل دخول - نتحقق من دوره
        const userData = await fetchUserData(user.uid);

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
});
