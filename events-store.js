// ================================================================
// طبقة إدارة الأحداث - Events Store
// ================================================================
// كل حدث (برنامج صيفي / يوم مراجعة) صندوق مستقل بطلابه وإعداداته
// ================================================================

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
    getFirestore,
    collection,
    doc,
    setDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    query,
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

const EVENTS_COLLECTION = 'events';
const CURRENT_EVENT_KEY = 'almahra_current_event_id';

// ================================================================
// الإعدادات الافتراضية لكل نوع حدث
// ================================================================
const DEFAULT_SETTINGS = {
    summer: {
        raceName: "سباق رحلة الطائف",
        raceSubtitle: "يوم الحضور (10) + الحفظ الجديد (3) + المراجعة (1) + محطات واعتمادات السرد",
        raceIcon: "fa-bus-alt",
        points: { attendance: 10, newMemorization: 3, review: 1 },
        features: {
            newMemorization: true,   // الحفظ الجديد
            goldenBoard: true,        // اللوحة الذهبية
            examPrep: true,           // الاستعداد للاختبار
            finalExam: true,          // نتائج الاختبار النهائي
            attendance: true,         // الحضور والغياب
            knights: true,            // فرسان اليوم
            honorBoard: true,         // لوحة الشرف
            pomodoro: true            // شاشة البومودورو
        }
    },
    'review-day': {
        raceName: "سباق المراجعة المكثّفة",
        raceSubtitle: "كل آية تُراجَع = نقطة",
        raceIcon: "fa-bolt",
        points: { attendance: 10, newMemorization: 3, review: 1 },
        features: {
            newMemorization: false,   // مراجعة فقط - لا حفظ جديد
            goldenBoard: true,
            examPrep: false,
            finalExam: false,
            attendance: true,
            knights: true,
            honorBoard: true,
            pomodoro: false
        }
    }
};

const TYPE_LABELS = {
    summer: { name: 'برنامج صيفي', icon: '🌞', color: 'amber' },
    'review-day': { name: 'يوم مراجعة مكثّف', icon: '⚡', color: 'blue' }
};

// ================================================================
// الحالة الداخلية
// ================================================================
let eventsCache = [];
let currentEventId = null;
let currentEvent = null;
let eventsSubscribers = [];
let eventsUnsubscribe = null;
let isReady = false;

// ================================================================
// المستمع اللحظي للأحداث
// ================================================================
function startEventsListener() {
    if (eventsUnsubscribe) return;

    const q = query(collection(db, EVENTS_COLLECTION), orderBy('createdAt', 'desc'));

    eventsUnsubscribe = onSnapshot(q, (snapshot) => {
        const events = [];
        snapshot.forEach((docSnap) => {
            events.push({ id: docSnap.id, ...docSnap.data() });
        });
        eventsCache = events;
        isReady = true;

        // تحديث الحدث الحالي إن تغيّرت بياناته
        if (currentEventId) {
            currentEvent = events.find(e => e.id === currentEventId) || null;
        }

        eventsSubscribers.forEach(cb => {
            try { cb(events); } catch (e) { console.error('events subscriber error:', e); }
        });

        console.log(`📅 events-store: ${events.length} حدث`);
    }, (err) => {
        console.error('❌ Events listener error:', err.code, err.message);
    });
}

// ================================================================
// الواجهة العامة
// ================================================================
window.almahraEvents = {

    getEvents: () => [...eventsCache],
    getCurrentEvent: () => currentEvent,
    getCurrentEventId: () => currentEventId,
    isReady: () => isReady,

    getTypeLabel: (type) => TYPE_LABELS[type] || { name: type, icon: '📋', color: 'slate' },
    getDefaultSettings: (type) => JSON.parse(JSON.stringify(DEFAULT_SETTINGS[type] || DEFAULT_SETTINGS.summer)),

    // هل ميزة معينة مفعّلة في الحدث الحالي؟
    isFeatureEnabled: (featureName) => {
        if (!currentEvent || !currentEvent.settings || !currentEvent.settings.features) return true;
        return currentEvent.settings.features[featureName] !== false;
    },

    // الاشتراك في تغييرات قائمة الأحداث
    subscribeEvents: (callback) => {
        eventsSubscribers.push(callback);
        startEventsListener();
        if (isReady) {
            try { callback([...eventsCache]); } catch (e) { console.error(e); }
        }
        return () => {
            eventsSubscribers = eventsSubscribers.filter(cb => cb !== callback);
        };
    },

    // اختيار الحدث الحالي للعمل عليه (null = لا حدث)
    // مهم: نُرسل المعرّف دائماً حتى لو لم يصل كائن الحدث للذاكرة المؤقتة بعد
    // (يحدث عند إنشاء حدث جديد قبل أن يستقبله المستمع اللحظي)
    setCurrentEvent: (eventId) => {
        currentEventId = eventId || null;
        currentEvent = eventId ? (eventsCache.find(e => e.id === eventId) || null) : null;
        try {
            if (eventId) localStorage.setItem(CURRENT_EVENT_KEY, eventId);
            else localStorage.removeItem(CURRENT_EVENT_KEY);
        } catch (e) {}
        console.log('📅 الحدث الحالي:', currentEvent?.name || currentEventId || '(لا شيء)');
        window.dispatchEvent(new CustomEvent('almahra-event-changed', {
            detail: { id: currentEventId, event: currentEvent }
        }));
    },

    // استرجاع آخر حدث مفتوح (من التخزين المحلي)
    getSavedEventId: () => {
        try { return localStorage.getItem(CURRENT_EVENT_KEY) || null; } catch (e) { return null; }
    },

    // إنشاء حدث جديد
    createEvent: async ({ name, type, startDate }) => {
        if (!name || !type) return { success: false, error: 'الاسم والنوع مطلوبان' };

        const eventId = `${type}_${Date.now()}`;
        const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[type] || DEFAULT_SETTINGS.summer));

        const eventData = {
            name: name.trim(),
            type: type,
            status: 'active',
            settings: settings,
            startDate: startDate || new Date().toISOString().slice(0, 10),
            endDate: null,
            createdAt: serverTimestamp()
        };

        try {
            await setDoc(doc(db, EVENTS_COLLECTION, eventId), eventData);
            return { success: true, id: eventId };
        } catch (err) {
            console.error('❌ createEvent:', err);
            return { success: false, error: err.message };
        }
    },

    // تعديل حدث (الاسم، الإعدادات، الحالة...)
    updateEvent: async (eventId, updates) => {
        try {
            await updateDoc(doc(db, EVENTS_COLLECTION, eventId), updates);
            return { success: true };
        } catch (err) {
            console.error('❌ updateEvent:', err);
            return { success: false, error: err.message };
        }
    },

    // إغلاق حدث (أرشفة)
    closeEvent: async (eventId) => {
        try {
            await updateDoc(doc(db, EVENTS_COLLECTION, eventId), {
                status: 'completed',
                endDate: new Date().toISOString().slice(0, 10)
            });
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    },

    // إعادة فتح حدث مغلق
    reopenEvent: async (eventId) => {
        try {
            await updateDoc(doc(db, EVENTS_COLLECTION, eventId), { status: 'active', endDate: null });
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    },

    // حذف حدث نهائياً (يحتاج حذف الطلاب داخله أولاً من data-store)
    deleteEvent: async (eventId) => {
        try {
            await deleteDoc(doc(db, EVENTS_COLLECTION, eventId));
            if (currentEventId === eventId) {
                currentEventId = null;
                currentEvent = null;
                try { localStorage.removeItem(CURRENT_EVENT_KEY); } catch (e) {}
            }
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
};

// ================================================================
// بدء تلقائي عند اكتمال المصادقة
// ================================================================
window.addEventListener('almahra-auth-ready', (e) => {
    if (e.detail?.currentUser) {
        startEventsListener();
    }
});

if (window.almahraAuth?.currentUser) {
    startEventsListener();
}

console.log('✅ events-store.js loaded — window.almahraEvents is ready');
