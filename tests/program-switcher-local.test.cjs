// بلا شبكة أو بيانات حقيقية: دوال الإنتاج، وتعريفات البرامج، وساعة وواجهة محليتان.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const storeSource = fs.readFileSync(path.join(__dirname, '..', 'programs-store.js'), 'utf8');
const defs = vm.runInNewContext(`(${storeSource.match(/export const PROGRAM_DEFS = ([\s\S]*?);\r?\n/)[1]})`);
const functions = new Map();
function source(name) {
    if (functions.has(name)) return functions.get(name);
    const start = html.search(new RegExp(`(?:async )?function ${name}\\(`));
    assert.ok(start >= 0, name);
    for (let end = html.indexOf('}', start); end >= 0; end = html.indexOf('}', end + 1)) {
        const code = html.slice(start, end + 1);
        try { new vm.Script(`(${code})`); } catch { continue; }
        functions.set(name, code); return code;
    }
    throw Error(name);
}
function harness({ savedId = null, ready = true, currentId = 'general', archived = false } = {}) {
    const state = { opened: [], ready, currentId, archived, counts: 0, focused: null };
    const elements = new Map(), listeners = new Map(), timers = new Map();
    const element = id => {
        if (elements.has(id)) return elements.get(id);
        const classes = new Set(), attrs = {};
        const el = { id, innerHTML: '', style: {}, hidden: id === 'programSwitcherMenu',
            setAttribute: (key, value) => { attrs[key] = value; }, getAttribute: key => attrs[key],
            focus: () => { state.focused = id; },
            contains: target => target === el || ['currentEventBadge', 'programSwitcherMenu', 'menuItem'].includes(target?.id),
            querySelector: () => element('menuItem'),
            classList: { add: key => classes.add(key), remove: key => classes.delete(key), contains: key => classes.has(key),
                toggle(key, on) { if (on) classes.add(key); else classes.delete(key); } } };
        elements.set(id, el); return el;
    };
    const programs = Object.fromEntries(Object.keys(defs).map(id => [id, { id, name: defs[id].name, activeSeasonId: `active-${id}` }]));
    // أسماء المواسم وهمية للاختبار فقط؛ العرض يأخذها من المتجر.
    const seasons = id => [{ id: `active-${id}`, name: `موسم وهمي ${id}`, status: 'active' },
        { id: `archive-${id}`, name: `أرشيف وهمي ${id}`, status: 'archived' }];
    const listen = (name, callback) => {
        if (!listeners.has(name)) listeners.set(name, []);
        listeners.get(name).push(callback);
    };
    const ctx = vm.createContext({ console,
        document: { getElementById: element, addEventListener: listen, body: element('body') },
        window: { addEventListener: listen, almahraPrograms: {
            PROGRAM_DEFS: defs, getPrograms: () => programs, getSavedProgramId: () => savedId,
            isReady: () => state.ready, getInitializationErrors: () => [], subscribe() {},
            getCurrentProgram: () => programs[state.currentId], getSeasons: seasons,
            getCurrentSeason: () => seasons(state.currentId)[state.archived ? 1 : 0],
            isCurrentSeasonArchived: () => state.archived,
            openProgram(id) { state.opened.push(id); state.currentId = id; state.archived = false; return !!programs[id]; },
            countStudents() { state.counts++; assert.fail('قائمة التبديل لا تطلب عدد الطلاب'); }
        } },
        setInterval(fn) { const id = timers.size + 1; timers.set(id, fn); return id; },
        clearInterval: id => timers.delete(id),
        isGeneralProgram: () => state.currentId === 'general', updateProgramBrand() {},
        applyArchivedMode() {}, applyProgramFeatures() {}, showToast() {}, showProgramInitError() {}
    });
    const run = code => vm.runInContext(code, ctx);
    for (const name of ['escapeHTML', 'openEventPicker', 'closeEventPicker', 'renderEventsList', 'openProgram', 'updateCurrentEventBadge']) run(source(name));
    run(html.slice(html.indexOf('        function renderProgramSwitcher()'), html.indexOf('        function openEventPicker()')));
    const start = html.indexOf("        window.addEventListener('almahra-auth-ready', () => {");
    assert.ok(start > 0);
    run(html.slice(start, html.indexOf("        document.addEventListener('DOMContentLoaded'", start)));
    const fire = (name, event = {}) => (listeners.get(name) || []).forEach(fn => fn(event));
    const rows = () => [...element('programSwitcherMenu').innerHTML.matchAll(/<button\b[^>]*class="([^"]*)"[^>]*onclick="([^"]*)">([\s\S]*?)<\/button>/g)]
        .map(match => ({ current: match[1] === 'current', click: () => run(match[2]), content: match[3] }));
    return { state, element, run, fire, rows,
        login() { fire('almahra-auth-ready'); }, tick() { [...timers.values()].forEach(fn => fn()); } };
}

for (const savedId of ['summer', 'review-day', 'general', null, 'missing-program']) {
    test(`الدخول يستأنف ${savedId ?? 'بلا محفوظ'} بلا شاشة بطاقات`, () => {
        const h = harness({ savedId });
        h.login();
        assert.equal(h.element('eventPickerOverlay').classList.contains('flex'), false);
        h.tick();
        assert.deepEqual(h.state.opened, [savedId && savedId !== 'missing-program' ? savedId : 'general']);
        assert.equal(h.element('eventPickerOverlay').classList.contains('flex'), false);
        assert.equal(h.element('body').classList.contains('event-not-selected'), false);
        assert.equal(h.state.counts, 0);
    });
}

test('تعذّر تحميل البرامج يظهر الشاشة وتبقى إعادة المحاولة ظاهرة', () => {
    const h = harness({ ready: false, currentId: null }); h.login();
    for (let tick = 0; tick < 100; tick++) h.tick();
    assert.equal(h.element('eventPickerOverlay').classList.contains('flex'), false);
    h.tick();
    assert.equal(h.element('eventPickerOverlay').classList.contains('flex'), true);
    assert.match(h.element('epProgramsList').innerHTML, /تعذّر تحميل البرامج/);
    assert.match(h.element('epProgramsList').innerHTML, /<button onclick="location.reload\(\)"[^>]*>\s*🔄 إعادة المحاولة/);
    assert.deepEqual(h.state.opened, []);
});

test('القائمة تعرض البرامج الثلاثة بترتيب التعريفات والموسم النشط و✓ على الحالي بلا عدّ', () => {
    for (const currentId of Object.keys(defs)) {
        const h = harness({ currentId }); h.run('toggleProgramSwitcher()');
        const rows = h.rows();
        assert.equal(rows.length, 3);
        Object.keys(defs).forEach((id, index) => {
            assert.ok(rows[index].content.includes(defs[id].name));
            assert.ok(rows[index].content.includes(`<small>موسم وهمي ${id}</small>`));
            assert.equal(rows[index].current, id === currentId);
            assert.equal(rows[index].content.includes('✓'), id === currentId);
        });
        assert.equal(h.element('programSwitcherMenu').hidden, false);
        assert.equal(h.element('currentEventBadge').getAttribute('aria-expanded'), 'true');
        assert.equal(h.state.counts, 0);
    }
});

test('اختيار كل برنامج يستدعي openProgram الموجودة ويغلق القائمة', () => {
    Object.keys(defs).forEach((id, index) => {
        const h = harness();
        h.run('toggleProgramSwitcher()');
        h.rows()[index].click();
        assert.deepEqual(h.state.opened, [id]);
        assert.equal(h.element('programSwitcherMenu').hidden, true);
        assert.equal(h.element('currentEventBadge').getAttribute('aria-expanded'), 'false');
        assert.equal(h.state.focused, 'currentEventBadge');
    });
});

test('اختيار البرنامج الحالي من الأرشيف يعود إلى موسمه النشط', () => {
    const h = harness({ archived: true });
    h.run('updateCurrentEventBadge(); toggleProgramSwitcher()');
    assert.match(h.element('currentEventBadge').innerHTML, /📦 أرشيف/);
    assert.match(h.element('currentEventBadge').innerHTML, /أرشيف وهمي general/);
    assert.match(h.rows()[1].content, /موسم وهمي general/);
    h.rows()[1].click();
    assert.deepEqual(h.state.opened, ['general']);
    assert.equal(h.state.archived, false);
    assert.doesNotMatch(h.element('currentEventBadge').innerHTML, /📦 أرشيف/);
});

test('Esc والضغط خارج القائمة وإعادة الضغط على الزر يغلقانها', () => {
    const h = harness();
    h.run('toggleProgramSwitcher()');
    h.fire('click', { target: h.element('menuItem') });
    assert.equal(h.element('programSwitcherMenu').hidden, false);
    let prevented = false;
    h.fire('keydown', { key: 'Escape', preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(h.element('programSwitcherMenu').hidden, true);
    assert.equal(h.element('currentEventBadge').getAttribute('aria-expanded'), 'false');
    h.run('toggleProgramSwitcher()');
    h.fire('click', { target: h.element('outside') });
    assert.equal(h.element('programSwitcherMenu').hidden, true);
    h.run('toggleProgramSwitcher(); toggleProgramSwitcher()');
    assert.equal(h.element('programSwitcherMenu').hidden, true);
});

test('الزر يعرض الاسم والموسم والسهم وسمات الوصول ويخفي الموسم على الجوال', () => {
    const h = harness(); h.run('updateCurrentEventBadge()');
    const badge = h.element('currentEventBadge').innerHTML;
    assert.match(badge, /<b>البرنامج العام<\/b>/);
    assert.match(badge, /class="program-switcher-season">موسم وهمي general/);
    assert.match(badge, /class="program-switcher-caret"[^>]*><i class="fas fa-caret-down"><\/i>/);
    assert.match(html, /id="currentEventBadge"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"/);
    assert.match(html, /@media \(max-width: 720px\)\s*\{[^@]*?#currentEventBadge \.program-switcher-season \{ display: none; \}/);
});

test('الإعدادات لا تحتوي زر تبديل البرنامج وتبقى إعدادات البرنامج والمواسم', () => {
    const settings = html.slice(html.indexOf('<div id="page-settings"'), html.indexOf('<div id="setPanelPoints"'));
    assert.ok(settings.includes('id="setPanelProgram"'));
    assert.doesNotMatch(settings, /تبديل البرنامج|onclick="openEventPicker\(\)"/);
    assert.match(source('renderProgramSettings'), /اختر البرنامج من الشريط العلوي/);
});
