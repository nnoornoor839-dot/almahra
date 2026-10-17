/*
 * exam-store.js — تخزين محرك الاختبار الشفوي.
 *
 * واجهة واحدة بدوال غير متزامنة (Promise)، ليحلّ محلها محوّل Firestore في المرحلة ٣ دون تعديل الشاشات.
 * هذا الملف: المحوّل المحلي (localStorage على الجهاز نفسه). كل «نطاق» (برنامج/موسم) منفصل عن غيره.
 *
 *   getTemplate / saveTemplate      قالب الورقة (null = القالب الافتراضي في exam-core)
 *   getPrefs / savePrefs            تفضيلات الجهاز (آخر أسماء محكّمين)
 *   listLevels / saveLevels         المستويات
 *   listExaminers / saveExaminers   قائمة المحكّمين (معرّف واسم ثابتان)
 *   listDrafts / getDraft / saveDraft / deleteDraft   اختبارات لم تُعتمد بعد (تُحفظ مع كل ضغطة)
 *   listResults / getResult / saveResult              النتائج المعتمدة (لا تُعدَّل بعد حفظها)
 *   usedExtents(candidateId)       مواضع أسئلة المرشح السابقة، ليأخذ المعيد أسئلة مختلفة
 *   usage()                        تقدير امتلاء ذاكرة الجهاز (للتنبيه قبل أن يفشل الحفظ)
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ExamStore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const NS = 'almahra.exam.v1';
  const QUOTA_CHARS = 5000000;   // حدّ المتصفحات الشائع لذاكرة الموقع (تقريبي)

  class StoreError extends Error { constructor(code, message) { super(message); this.name = 'StoreError'; this.code = code; } }

  function createLocalStore({ storage, scope = 'default' } = {}) {
    // الوضع الخاص أو منع بيانات المواقع: مجرد قراءة localStorage قد يرمي استثناءً
    let S = storage || null;
    if (!S) { try { S = typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { S = null; } }
    if (!S) throw new StoreError('NO_STORAGE', 'ذاكرة المتصفح غير متاحة (الوضع الخاص أو منع بيانات المواقع)، فلا يُحفظ الاختبار. افتح الصفحة في نافذة عادية أو اسمح بحفظ بيانات الموقع.');
    const key = k => `${NS}:${scope}:${k}`;
    const read = (k, def) => {
      let raw = null;
      try { raw = S.getItem(key(k)); } catch (e) { throw new StoreError('READ_FAILED', 'تعذّرت القراءة من ذاكرة الجهاز'); }
      if (raw == null) return def;
      try { return JSON.parse(raw); } catch (e) { throw new StoreError('CORRUPT', `بيانات الاختبارات المحفوظة (${k}) تالفة`); }
    };
    const write = (k, v) => {
      try { S.setItem(key(k), JSON.stringify(v)); }
      catch (e) { throw new StoreError('WRITE_FAILED', 'تعذّر الحفظ في ذاكرة الجهاز (قد تكون ممتلئة)'); }
    };
    let counter = 0;
    const newId = prefix => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    // مواضع أسئلة نموذج: من أقسامه (النتائج الجديدة والمسودات) أو من قائمته المسطّحة (النتائج القديمة)
    const questionsOf = form => (!form ? [] : Array.isArray(form.parts) && form.parts.length ? form.parts.flatMap(p => (p && p.questions) || []) : form.questions || []);
    // ومع كل موضع تاريخ محاولته ورقمها: حين تنفد المواضع الجديدة يُكرَّر الأقدم أولاً
    const extentsOf = (form, date, attempt) => questionsOf(form).map(q => ({
      from: q.from, to: q.to, fromWord: q.fromWord == null ? null : q.fromWord, toWord: q.toWord == null ? null : q.toWord,
      date: date == null ? null : date, attempt: attempt == null ? null : attempt }));

    return {
      kind: 'local',
      scope,
      newId,

      async getTemplate() { return read('template', null); },
      async saveTemplate(t) { write('template', t); return t; },

      // تفضيلات هذا الجهاز (مثل آخر أسماء محكّمين كُتبت)
      async getPrefs() { return read('prefs', {}); },
      async savePrefs(p) { write('prefs', p); return p; },

      async listLevels() { return read('levels', []); },
      async saveLevels(levels) { write('levels', levels); return levels; },

      // قائمة المحكّمين الثابتة [{ id، name }]
      async listExaminers() { return read('examiners', []); },
      async saveExaminers(list) { write('examiners', list); return list; },

      async listDrafts() { return read('drafts', []).slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); },
      async getDraft(id) { return read('drafts', []).find(d => d.id === id) || null; },
      async saveDraft(d) {
        if (!d || !d.id) throw new StoreError('BAD_DRAFT', 'مسودة بلا معرّف');
        const all = read('drafts', []); const i = all.findIndex(x => x.id === d.id);
        if (i >= 0) all[i] = d; else all.push(d);
        write('drafts', all); return d;
      },
      async deleteDraft(id) { write('drafts', read('drafts', []).filter(d => d.id !== id)); },

      async listResults() { return read('results', []).slice().sort((a, b) => (b.approvedAt || 0) - (a.approvedAt || 0)); },
      async getResult(id) { return read('results', []).find(r => r.id === id) || null; },
      // النتيجة المعتمدة تُضاف ولا تُستبدل: حفظ معرّف موجود مرفوض
      async saveResult(r) {
        if (!r || !r.id) throw new StoreError('BAD_RESULT', 'نتيجة بلا معرّف');
        const all = read('results', []);
        if (all.some(x => x.id === r.id)) throw new StoreError('RESULT_EXISTS', 'هذه النتيجة محفوظة مسبقاً ولا تُعدَّل');
        // اختبار واحد لا يُعتمد مرتين (ضغطتان سريعتان أو تبويبان)، فلا تُحتسب عليه محاولتان
        if (r.draftId && all.some(x => x.draftId === r.draftId)) throw new StoreError('DRAFT_APPROVED', 'هذا الاختبار اعتُمد مسبقاً');
        all.push(r); write('results', all); return r;
      },

      // تقدير امتلاء ذاكرة الجهاز. المساحة (نحو 5 ملايين حرف) مشتركة مع كل ما يحفظه البرنامج على هذا الجهاز، لا الاختبارات وحدها.
      async usage() {
        let chars = 0;
        try { for (let i = 0; i < S.length; i++) { const k = S.key(i); chars += k.length + (S.getItem(k) || '').length; } }
        catch (e) { return { chars: null, ratio: null, nearFull: false }; }
        const ratio = chars / QUOTA_CHARS;
        return { chars, ratio, nearFull: ratio >= 0.8 };
      },

      async usedExtents(candidateId) {
        const out = [];
        read('results', []).filter(r => r.candidate && r.candidate.id === candidateId).forEach(r => out.push(...extentsOf(r.form, r.approvedAt, r.attempt)));
        read('drafts', []).filter(d => d.candidate && d.candidate.id === candidateId).forEach(d => out.push(...extentsOf(d.form, d.updatedAt || d.createdAt, d.attempt)));
        return out;
      },
      async attemptsOf(candidateId) {
        return read('results', []).filter(r => r.candidate && r.candidate.id === candidateId)
          .sort((a, b) => a.approvedAt - b.approvedAt)
          .map(r => ({ id: r.id, percent: r.computed.percent, passed: r.computed.passed, date: r.approvedAt }));
      }
    };
  }

  return { createLocalStore, StoreError, NS };
});
