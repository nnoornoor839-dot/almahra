// بلا شبكة: وظائف الإنتاج والميزان الحقيقي، مع طلاب وهميين وDOM وسحابة محاكيين.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const { generalEntryPoints } = require('../../general-points.js');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replaceAll('\r\n', '\n');
const baseline = cp.execFileSync('git', ['show', 'e93084d:index.html'], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n');
const copy = value => JSON.parse(JSON.stringify(value));
function source(name, text = html) {
    const start = text.search(new RegExp(`(?:async )?function ${name}\\(`));
    assert.ok(start >= 0, name);
    for (let end = text.indexOf('}', start); end >= 0; end = text.indexOf('}', end + 1)) {
        const candidate = text.slice(start, end + 1);
        try { new vm.Script(`(${candidate})`); return candidate; } catch {}
    }
    throw Error(name);
}
const qctx = vm.createContext({ window: {} });
for (const file of ['quran-meta', 'quran-lines', 'quran-words', 'quran-measure'])
    vm.runInContext(fs.readFileSync(path.join(root, 'quran', file + '.js'), 'utf8'), qctx);
const { QURAN_META, QURAN_LINES, QURAN_WORDS, QuranMeasure } = qctx.window;
assert.equal(QuranMeasure.init(QURAN_META, QURAN_LINES, QURAN_WORDS).ok, true);
const today = '2026-11-01';
const entry = (kind, from, to, grade = 'good', at = 1) => ({ kind, spec: { from, to }, grade, at, rep: 1, points: 2, by: 'fake-admin' });
const student = (entries = {}, extra = {}) => ({ id: 1, sid: 'fake-sid', name: 'طالب وهمي', direction: 'up', halaqaId: 'h1',
    frontierBase: null, lastDailyBase: null, history: { [today]: { entries } }, ...extra });
function harness(s = student()) {
    const state = { program: 'general', season: 's1', writes: [], prompts: [], messages: [], confetti: 0, updates: 0,
        school: true, cloud: true, measure: true, confirmed: true, archived: false, knightWrites: 0,
        calendar: { termStart: '2026-10-01', termEnd: '2026-12-31', calendar: [] },
        settings: { features: { goldenBoard: false }, grades: [{ id: 'good', name: 'جيد', percent: 100 }, { id: 'repeat', name: 'يُعاد', percent: 0 }],
            workingDays: [0, 1, 2, 3, 4], kindMult: { newMemorization: 3, review: 1 }, teachers: [{ id: 't1', name: 'معلم وهمي' }],
            halaqas: [{ id: 'h1', name: 'حلقة وهمية', teacherId: 't1', stageId: 'stage1', active: true }], stages: [{ id: 'stage1' }],
            criteria: [{ id: 'early', name: 'موجب وهمي', points: 5, enabled: true }, { id: 'uniform', name: 'موجب آخر', points: 3 },
                { id: 'late', name: 'سالب وهمي', points: -2 }, { id: 'off', name: 'معطل', points: 9, enabled: false }] } };
    const elements = new Map(), listeners = new Map(); let serial = 0;
    function element(id) {
        if (elements.has(id)) return elements.get(id);
        const classes = new Set(); let markup = '';
        const el = { id, children: [], value: '', dataset: {}, attrs: {}, style: {}, checked: false, disabled: false,
            textContent: '', innerText: '', options: [{ text: 'اسم وهمي' }], selectedIndex: 0,
            classList: { add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n)),
                contains: n => classes.has(n), toggle(n, on = !classes.has(n)) { if (on) classes.add(n); else classes.delete(n); } },
            setAttribute(n, v) { this.attrs[n] = v; },
            checkVisibility() {
                for (let el = this; el; el = el.parentNode)
                    if (el.hidden || el.classList.contains('hidden') || el.style.display === 'none') return false;
                return true;
            },
            focus() { state.focus = this.id; state.focusVisible = this.checkVisibility(); },
            querySelectorAll(selector) { return selector === 'button' ? this.children.filter(el => el.tagName === 'BUTTON') : []; },
            appendChild(child) { if (child.parentNode) child.parentNode.children = child.parentNode.children.filter(x => x !== child); this.children.push(child); child.parentNode = this; return child; },
            prepend(child) { this.appendChild(child); this.children = [child, ...this.children.filter(x => x !== child)]; },
            insertBefore(child, next) { this.appendChild(child); if (next) { this.children = this.children.filter(x => x !== child); this.children.splice(this.children.indexOf(next), 0, child); } },
            replaceChildren() { this.children.forEach(child => elements.delete(child.id)); this.children = []; },
            get nextSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] || null; },
            get parentElement() { return this.parentNode; },
            get innerHTML() { return markup; },
            set innerHTML(value) {
                markup = value; this.replaceChildren();
                for (const match of value.matchAll(/<(select|input|div|button|section|p)\b([^>]*)>/g)) {
                    const attrs = match[2], child = element(/\bid="([^"]+)"/.exec(attrs)?.[1] || `generated-${++serial}`);
                    for (const attr of attrs.matchAll(/data-([a-z]+)="([^"]*)"/g)) child.dataset[attr[1]] = attr[2];
                    child.tagName = match[1].toUpperCase();
                    child.value = /\bvalue="([^"]*)"/.exec(attrs)?.[1] || '';
                    const bareAttrs = attrs.replace(/"[^"]*"/g, '');
                    child.checked = /\bchecked\b/.test(bareAttrs);
                    child.hidden = /\bhidden\b/.test(bareAttrs);
                    child.textContent = value.slice(match.index + match[0].length).match(/^[^<]*/)[0];
                    const click = /\bonclick="([^"]*)"/.exec(attrs)?.[1];
                    if (click) child.onclick = () => run(click);
                    const names = /\bclass="([^"]*)"/.exec(attrs)?.[1] || '';
                    names.split(' ').forEach(name => child.classList.add(name));
                    this.appendChild(child);
                }
            } };
        let currentId = id, currentValue = '';
        Object.defineProperty(el, 'value', { get: () => currentValue, set: value => { currentValue = String(value); } });
        Object.defineProperty(el, 'id', { get: () => currentId, set: value => { elements.delete(currentId); currentId = value; elements.set(value, el); } });
        Object.defineProperty(el, 'className', { get: () => [...classes].join(' '), set: value => { classes.clear(); value.split(' ').forEach(n => classes.add(n)); } });
        elements.set(id, el); return el;
    }
    const legacy = element('legacyDailyBody'), modal = element('modalContent');
    legacy.appendChild(element('criteriaSection')); legacy.appendChild(element('legacySummary'));
    modal.appendChild(element('smartUndoRow'));
    // لا نخلق عنصراً مفقوداً بصمت؛ الأسماء الثابتة مأخوذة من HTML الفعلي.
    const staticMarkup = html.slice(0, html.indexOf('<script src="quran/'));
    for (const tag of staticMarkup.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
        const el = element(tag[3]);
        el.tagName = tag[1].toUpperCase();
        el.value = /\bvalue="([^"]*)"/.exec(tag[2])?.[1] || '';
        el.className = /\bclass="([^"]*)"/.exec(tag[2])?.[1] || '';
    }
    element('generalQuickSection').innerHTML = html.slice(html.indexOf('<div id="generalQuickSection"'), html.indexOf('<div id="smartDailySection"'));
    // سلسلة ظهور حقل النهاية تشمل ورقة الطالب والنافذة المخفية عند البداية.
    element('smartModal').appendChild(element('generalQuickSection'));
    element('generalQuickSection').appendChild(element('generalQuickPanels'));
    const quranMeta = { surahs: { references: QURAN_META.surahs.map((s, i) => ({ number: i + 1, name: QURAN_META.titles[i], numberOfAyahs: s[1] })) } };
    const ctx = vm.createContext({ console, structuredClone, QuranMeasure, quranMeta, generalEntryPoints,
        document: { getElementById: id => elements.get(id) || null, createElement: tag => { const el = element(`${tag}-${++serial}`); el.tagName = tag.toUpperCase(); return el; },
            querySelector: () => element('settingsNav'),
            querySelectorAll: selector => [...elements.values()].filter(el => selector.startsWith('.crit-box') && el.classList.contains('crit-box') && (!selector.includes(':checked') || el.checked)) },
        window: { scrollTo() {}, addEventListener: (name, fn) => listeners.set(name, fn), quranData: { surahStarts: { 1: 1 } },
            almahraAuth: { currentUser: { uid: 'fake-admin' } },
            almahraPrograms: { getCurrentProgramId: () => state.program, getCurrentSeasonId: () => state.season,
                getCurrentSeason: () => state.calendar, isCurrentSeasonArchived: () => state.archived,
                getKnightsLog: () => state.calendar.knightsLog || [], saveKnightsEntry: async () => { state.knightWrites++; return { success: true }; },
                getSettings: () => state.settings, PROGRAM_DEFS: { general: { defaultSettings: state.settings } } },
            almahraData: { patchStudent: (id, fields) => { state.writes.push({ id, fields: copy(fields) }); return state.pending || Promise.resolve({ success: true }); } } },
        prepareSchoolDay: () => { state.onPrepare?.(); return state.school; }, canWriteCloud: () => state.cloud, canWriteView: () => true,
        refreshToday() { state.onRefresh?.(); }, requireSchoolDay: () => state.school, requireQuranMeasure: () => state.measure, measureReady: () => true,
        isWriteLockedView: () => !state.cloud, showToast: (message, type) => state.messages.push({ message, type }),
        confirm: message => { state.prompts.push(message); state.onConfirm?.(); return state.confirmed; },
        updateAllUIs: () => state.updates++, getTierBadge: () => null, updateSmartButton() {},
        calculateExamPrepQuran() {}, escapeHTML: value => String(value),
        getCumulativeStats: () => ({ tripPoints: 123 }), getStudentRank: () => 2,
        switchTab: id => { state.tab = id; }, updateSettingsBadges() {},
        confetti: { create: () => () => state.confetti++ }, setTimeout() {}, closeKnightCelebration() {} });
    const run = code => vm.runInContext(code, ctx);
    run(html.match(/const GOLDEN_BOARD_UNDER_REPAIR = (?:true|false);/)[0]);
    const install = (...names) => names.forEach(name => run(source(name)));
    require('./tv-harness.cjs').installTv(run, install);
    ctx.fixture = s;
    run(`let students = [fixture], currentEditingStudentId = 1, todayStr = '${today}', hijriDateStr = 'وهمي', currentSardType = 'review';
        let selectedMinor = null, selectedJuzs = []; const endAyahTouched = { end: false, examEnd: false };
        let generalUndoInProgress = false; const criteriaAtOpen = { sel: null }; const DEL_FIELD = Object.freeze({ __almahraDelete: true });`);
    run(html.match(/const HOMEPREP_SCOPE = .*;/)[0]);
    run(html.match(/const HOMEPREP_MIN_PERCENT = .*;/)[0]);
    run(html.match(/const generalQuickEntry = .*;/)[0]);
    run(html.match(/const generalFrontierFix = .*;/)[0]);
    run(html.match(/const ALL_DAY_NAMES = .*;/)[0]);
    for (const name of ['ivPairs', 'measureEntry', 'rangeLabelOf', 'newEntryId']) run(html.match(new RegExp(`const ${name} = .*;`))[0]);
    install('homePrepQualifies', 'toggleGeneralOptIn', 'generalValidPoint', 'generalOriginalPosition', 'computeGeneralFrontier', 'generalQuickSectionValues', 'generalQuickPositionValues', 'generalQuickSectionUsed',
        'generalQuickDateBlocked', 'readGeneralQuickPosition', 'generalQuickPositionChanged', 'clearGeneralQuickSection', 'toggleGeneralCriteriaExceptions', 'generalQuickKeydown', 'generalQuickEntryLabel',
        'isGeneralProgram', 'getProgramSettings', 'generalGoldenHidden', 'getStudentHalaqa', 'generalRecitationTeacher', 'getActiveCriteria',
        'roundPointTotal', 'dayStats', 'schoolCivilDate', 'formatDateLocal', 'getWeekStartDate', 'isSeasonCalendarComplete', 'isWorkingDay', 'getSchoolDayInfo', 'getAttendanceState',
        'generalQuickDayName', 'getGeneralMissedDays', 'prepareGeneralQuickDate', 'renderGeneralQuickDate', 'showGeneralMissedDays', 'selectGeneralQuickDate',
        'generalQuickHasUnsavedInput', 'openGeneralFrontierFixFromQuick',
        'canOpenGeneralFrontierFix', 'updateFrontierFixVisibility', 'renderGeneralFrontierFix', 'renderFrontierFixStudents', 'renderFrontierFixPosition', 'updateFrontierFixAyah', 'saveGeneralFrontierFix', 'openSettingsSection', 'backToSettingsHome',
        'isFurther', 'endPointOf', 'computeFrontier', 'computeLastDaily', 'pinBaseFields', 'makeEntry', 'buildEntryPatch',
        'applyFieldsLocally', 'canWriteHistory', 'commitGeneralStudentPatch', 'computeLastReview', 'hasGeneralAcceptedNew', 'generalNextPoint',
        'generalQuickContext', 'generalQuickContextMatches', 'invalidateGeneralQuickEntry',
        'generalQuickSuggestions', 'generalPointLabel', 'moveGeneralQuickSections', 'initGeneralQuickEntry', 'renderGeneralQuickGrades',
        'resetGeneralQuickReviewConfirmation', 'generalQuickReviewConfirmationKey',
        'quickSurahChanged', 'fulfillGeneralCriteria', 'generalCriteriaChange', 'calculateGeneralQuickEntry', 'updateGeneralQuickPreview',
        'saveGeneralQuickEntry', 'getCriteriaSelection', 'getCriteriaPoints',
        'renderCriteriaList', 'updateCriteriaTotal', 'updateGrandTotal', 'updateGeneralUndoButton', 'getGeneralUndoTarget', 'generalUndoLabel',
        'undoLastGeneralEntry', 'switchSmartTab', 'updateSmartSimplification', 'openSmartModal', 'closeSmartModal',
        'refreshGeneralRecitationFields', 'updateAyahMax', 'setSardType');
    // حساب النافذة القديمة يُختبر في ملفاته؛ فتحها هنا يحتفظ بترتيبها الحقيقي.
    ctx.calculateQuran = () => {};
    run("window.addEventListener('almahra-program-changed', invalidateGeneralQuickEntry)");
    run('openSmartModal(1)');
    const range = (kind, from, to) => {
        if (from) for (const [edge, point] of [['from', from], ['to', to]]) {
            const surah = elements.get(`quick_${kind}_${edge}Surah`), ayah = elements.get(`quick_${kind}_${edge}Ayah`);
            if (surah && ayah) { surah.value = String(point[0]); ayah.value = String(point[1]); }
        }
        else { element(`quick_${kind}_toSurah`).value = String(to[0]); element(`quick_${kind}_toAyah`).value = String(to[1]); }
    };
    const grade = (kind, id = 'good') => { const box = element(`quick_${kind}_grades`), index = state.settings.grades.findIndex(g => g.id === id); box.children[index].onclick(); };
    return { state, s, ctx, run, install, element, range, grade, legacy, modal,
        changed: () => listeners.get('almahra-program-changed')(),
        preview: () => { run('updateGeneralQuickPreview()'); return copy(run('calculateGeneralQuickEntry(students[0])')); },
        pressSave: () => run('saveGeneralQuickEntry()'),
        // اختبارات الحفظ السابقة تكمل التأكيد الجديد؛ اختبارات الجولة ٢ تستعمل pressSave لكل ضغطة.
        save: () => {
            const first = run('saveGeneralQuickEntry()');
            return !element('generalQuickReviewReminder').hidden && run('!generalUndoInProgress && generalQuickEntry.noReviewConfirmation')
                ? run('saveGeneralQuickEntry()') : first;
        }, reopen: () => run('openSmartModal(1)') };
}
const savedEntries = h => Object.entries(h.state.writes[0].fields).filter(([key]) => key.includes('.entries.')).map(([, entry]) => entry);

module.exports = { harness, student, entry, today, savedEntries, copy, source, html, baseline, root, QuranMeasure, generalEntryPoints };
