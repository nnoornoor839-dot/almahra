// حساب نقاط التسميع في البرنامج العام من مقدار الأسطر الذي يعيده QuranMeasure.
(function (root) {
    'use strict';
    function generalEntryPoints({ lines, kind, gradeId, settings }) {
        if (!Number.isFinite(lines) || lines < 0) throw new Error('مقدار الأسطر غير صالح');
        const key = kind === 'new' ? 'newMemorization' : kind === 'review' ? 'review' : null;
        if (!key) throw new Error('نوع التسميع غير معروف');
        const mult = settings?.kindMult?.[key];
        if (!Number.isFinite(mult) || mult < 0) throw new Error('معامل التسميع غير صالح');
        const grade = settings?.grades?.find(g => g.id === gradeId);
        if (!grade) throw new Error('التقدير غير معروف');
        const gradePercent = grade.percent;
        if (!Number.isInteger(gradePercent) || gradePercent < 0 || gradePercent > 100) throw new Error('نسبة التقدير غير صالحة');
        const raw = lines * mult * (gradePercent / 100);
        if (!Number.isFinite(raw)) throw new Error('النقاط المحسوبة غير صالحة');
        return { points: Math.max(0, Math.round(raw * 10) / 10), mult, gradePercent };
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = { generalEntryPoints };
    root.generalEntryPoints = generalEntryPoints;
})(typeof window !== 'undefined' ? window : globalThis);
