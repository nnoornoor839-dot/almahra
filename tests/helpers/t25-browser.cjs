// Offline browser fixture: production HTML/scripts and local assets, fake stores only.
// Tailwind's CDN is unavailable offline; these standard utility/preflight rules cover
// the tested surfaces. All component/layout CSS comes unchanged from index.html.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { root, html } = require('./quick-entry-harness.cjs');
const key = require('../rules/home-answer-key.json');
const store = fs.readFileSync(path.join(root, 'programs-store.js'), 'utf8');
const defs = vm.runInNewContext(`(${store.match(/export const PROGRAM_DEFS = ([\s\S]*?);\r?\n/)[1]})`);
const copy = value => JSON.parse(JSON.stringify(value));
function answerStudents() {
    return key.students.map((row, index) => {
        let page = 3;
        const history = {};
        row.days.forEach((code, i) => {
            if (code === '—' || code === 'لم يبدأ') return;
            const date = key.dates[i];
            if (code === 'غ' || code === 'غع') {
                history[date] = { attended: false, absence: code === 'غع' ? 'excused' : 'unexcused' }; return;
            }
            const day = history[date] = { attended: true };
            if (code === 'ح') return;
            day.entries = {};
            code.split(' + ').forEach((token, j) => {
                const kind = token.startsWith('ج') ? 'new' : 'review';
                const grade = token.includes('✗') ? 'repeat' : token.includes('ممتاز') ? 'excellent' : 'good';
                day.entries[`e${j}`] = { kind, grade, spec: copy(key.pages[kind === 'new' ? page : 3]), rep: 1, points: 1 };
                if (kind === 'new' && grade !== 'repeat') page++;
            });
        });
        return { id: index + 1, sid: `home-synthetic-${index + 1}`, name: row.name, halaqaId: row.halaqaId,
            lastSurah: 2, lastAyah: 5, history };
    });
}
const utilityCss = `*,::before,::after{box-sizing:border-box;border-width:0;border-style:solid}body{margin:0}
button,input,select{font:inherit}button{cursor:pointer;background:transparent}h1,h2,h3,h4,p{margin:0}
img{display:block;max-width:100%}.flex{display:flex}.flex-col{flex-direction:column}.flex-wrap{flex-wrap:wrap}
.items-center{align-items:center}.justify-center{justify-content:center}.justify-between{justify-content:space-between}
.flex-grow{flex-grow:1}.gap-5{gap:1.25rem}.w-full{width:100%}.mx-auto{margin-inline:auto}.p-4{padding:1rem}
.fixed{position:fixed}.inset-0{inset:0}.hidden{display:none}.no-print{print-color-adjust:exact}
.bottom-0{bottom:0}.left-0{left:0}.right-0{right:0}.flex-1{flex:1 1 0%}.z-50{z-index:50}
[class~="z-[2000]"]{z-index:2000}
@media(min-width:768px){.md\\:p-8{padding:2rem}}`;
async function newPage(browser, { width = 390, program = 'general', today = key.today, list = answerStudents(), holiday = false, hold = false, studentLoadError = false, settings = {} } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 950 } });
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const config = { program, today, list, key, defs, holiday, settings, studentLoadError };
    await page.addInitScript(config => {
        const { key, defs, program, today, list } = config;
        const NativeDate = Date;
        window.Date = class extends NativeDate {
            constructor(...args) { super(...(args.length ? args : [today + 'T09:00:00Z'])); }
            static now() { return new NativeDate(today + 'T09:00:00Z').getTime(); }
        };
        window.tailwind = {};
        window.confetti = { create: () => () => {} };
        const programs = Object.fromEntries(Object.entries(defs).map(([id, def]) => [id, { id, name: def.name,
            activeSeasonId: 's-' + id, settings: id === 'general' ? { ...def.defaultSettings, ...key.settings, ...config.settings } : def.defaultSettings }]));
        const seasons = Object.fromEntries(Object.keys(defs).map(id => [id, { ...key.season, id: 's-' + id, name: 'موسم 2026', status: 'active' }]));
        if (config.holiday) seasons.general.calendar.push({ from: today, to: today, name: 'إجازة وهمية' });
        const state = window.__fixture = { ready: false, current: null, list, programs, seasons, writes: [], errors: [], studentUpdates: 0, studentError: null };
        const listeners = [], studentListeners = [];
        state.emit = () => {
            if (config.studentLoadError) {
                state.studentError = { code: 'unavailable', message: 'Synthetic student load failure' };
                return;
            }
            studentListeners.forEach(fn => { state.studentUpdates++; fn(state.list); });
        };
        state.start = () => { state.ready = true; };
        window.almahraAuth = { currentUser: { uid: 'synthetic-admin' }, isAdmin: () => true };
        window.almahraPrograms = {
            PROGRAM_DEFS: defs, getInitializationErrors: () => [], isReady: () => state.ready,
            getSavedProgramId: () => program, getCurrentProgramId: () => state.current,
            getPrograms: () => programs, getCurrentProgram: () => programs[state.current] || null,
            getSettings: () => programs[state.current]?.settings || {},
            isFeatureEnabled: key => programs[state.current]?.settings?.features?.[key] !== false,
            getSeasons: id => [seasons[id]], getCurrentSeason: () => seasons[state.current] || null,
            getCurrentSeasonId: () => seasons[state.current]?.id || null,
            isCurrentSeasonArchived: () => false, subscribe: fn => listeners.push(fn),
            getKnightsLog: () => [], getDefaultSettings: id => defs[id].defaultSettings,
            openProgram(id) {
                state.current = id;
                window.dispatchEvent(new Event('almahra-program-changed'));
                state.emit(); listeners.forEach(fn => fn()); return true;
            }
        };
        window.almahraData = {
            subscribeStudents: fn => studentListeners.push(fn), isReady: () => !config.studentLoadError, isReadOnly: () => false,
            lastError: () => state.studentError,
            getActiveProgramId: () => state.current, getActiveSeasonId: () => seasons[state.current]?.id,
            async patchStudent(id, fields) {
                state.writes.push({ id, fields: structuredClone(fields) });
                const student = state.list.find(s => s.id === id);
                for (const [key, value] of Object.entries(fields)) {
                    const parts = key.split('.'); let target = student;
                    parts.slice(0, -1).forEach(part => { target = target[part] ||= {}; });
                    target[parts.at(-1)] = value;
                }
                return { success: true };
            }
        };
        window.addEventListener('DOMContentLoaded', () => {
            document.body.classList.remove('auth-not-ready');
            document.getElementById('authUserInfo').innerHTML = '<span>مشرف وهمي</span><span>المشرف</span>';
            document.getElementById('authUserInfo').classList.remove('hidden');
            document.getElementById('authLogoutBtn').classList.remove('hidden');
            window.dispatchEvent(new Event('almahra-auth-ready'));
        });
    }, config);
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname !== 'almahra.test') {
            return route.fulfill({ contentType: url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript', body: '' });
        }
        const file = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
        if (['auth.js', 'programs-store.js', 'data-store.js'].includes(file)) return route.fulfill({ contentType: 'text/javascript', body: '' });
        if (file === 'index.html') return route.fulfill({ contentType: 'text/html', body: html.replace('</head>', `<style>${utilityCss}</style></head>`) });
        const absolute = path.resolve(root, file);
        if (!absolute.startsWith(root + path.sep) || !fs.existsSync(absolute)) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ path: absolute });
    });
    await page.goto('http://almahra.test/', { waitUntil: 'load' });
    if (!hold) {
        await page.evaluate(() => window.__fixture.start());
        await page.waitForFunction(() => window.__fixture.current !== null && !document.body.classList.contains('event-not-selected'));
        await page.locator('#loadingOverlay').waitFor({ state: 'hidden' });
    }
    return { page, context, errors, close: () => context.close() };
}
module.exports = { newPage, answerStudents, root };
