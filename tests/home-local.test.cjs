// بلا شبكة أو كتابة بيانات: المفتاح المعتمد ثابت، والدوال وHTML وCSS من الإنتاج.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const key = require('./rules/home-answer-key.json');
const performanceKey = require('./rules/home-performance-answer-key.json');
const { QuranMeasure } = require('./helpers/quick-entry-harness.cjs');
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
function answerStudents() {
    return key.students.map((row, index) => {
        let page = 3;
        const history = {};
        row.days.forEach((code, dayIndex) => {
            if (code === '—' || code === 'لم يبدأ') return;
            const date = key.dates[dayIndex];
            if (code === 'غ' || code === 'غع') {
                history[date] = { attended: false, absence: code === 'غع' ? 'excused' : 'unexcused' }; return;
            }
            const day = history[date] = { attended: true };
            if (code === 'ح') return;
            day.entries = {};
            code.split(' + ').forEach((token, entryIndex) => {
                const kind = token.startsWith('ج') ? 'new' : 'review';
                const grade = token.includes('✗') ? 'repeat' : token.includes('ممتاز') ? 'excellent' : 'good';
                day.entries[`e${entryIndex}`] = { kind, grade, spec: copy(key.pages[kind === 'new' ? page : 3]), rep: 1 };
                if (kind === 'new' && grade !== 'repeat') page++;
            });
        });
        return { id: index + 1, sid: `home-synthetic-${index + 1}`, name: row.name, halaqaId: row.halaqaId,
            lastSurah: 2, lastAyah: 5, history };
    });
}
function harness(list = answerStudents(), initialToday = key.today, productionHtml = html) {
    const state = { program: 'general', archived: false, season: copy(key.season), settings: copy(key.settings), navigation: [], writes: [] };
    const elements = new Map();
    const events = new Map(), frames = new Map();
    let frameId = 0;
    const element = id => {
        if (elements.has(id)) return elements.get(id);
        const classes = new Set();
        const el = { id, style: {}, dataset: {}, innerHTML: '', textContent: '', value: '', querySelector: () => null, querySelectorAll: () => [],
            classList: { add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n)),
                contains: n => classes.has(n), toggle(n, on = !classes.has(n)) { if (on) classes.add(n); else classes.delete(n); } } };
        elements.set(id, el); return el;
    };
    for (const match of productionHtml.matchAll(/<\w+\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
        const el = element(match[2]);
        for (const cls of /\bclass="([^"]*)"/.exec(match[1])?.[1].split(/\s+/) || []) el.classList.add(cls);
        if (/display:\s*none/.test(match[1])) el.style.display = 'none';
    }
    const ctx = vm.createContext({ console, Date, Intl, QuranMeasure, document: { getElementById: element, querySelectorAll: () => [] },
        requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
        window: { addEventListener: (type, callback) => events.set(type, callback),
            almahraPrograms: { getCurrentProgramId: () => state.program, isCurrentSeasonArchived: () => state.archived,
            getSettings: () => state.settings, getCurrentSeason: () => state.season, getCurrentSeasonId: () => state.season.id,
            getCurrentProgram: () => ({ id: state.program, name: 'برنامج وهمي', get settings() { return state.settings; }, set settings(value) { state.settings = value; } }) } },
        getProgramSettings: () => state.settings, goHome: id => state.navigation.push(id), goRecords: id => state.navigation.push(id),
        normalizeSaudiPhone: () => null, closeGeneralAbsenceModal() {}, initHadithTilt() {}, programBrandName: () => 'البرنامج العام',
        tiersFeatureOn: () => false, getTiers: () => [], formatGeneralUnit: n => String(n),
        renderHomeCare: () => { element('homeCare').innerHTML = 'legacy care'; },
        renderHomeLeaders: () => { element('homeLead').innerHTML = 'legacy leaders'; },
        computeComplexStats: () => ({ studentCount: list.length, todayPct: 50, presentToday: 1, absentToday: 1, ayahs: 2, pages: 3,
            quarters: 4, juzs: 5, hizbs: 6, chronic: 0 }), fixtures: list });
    const run = code => vm.runInContext(code, ctx);
    run(html.match(/const ivPairs = .*;/)[0]); run(html.match(/const measureEntry = .*;/)[0]);
    run(`let students = fixtures, todayStr = '${initialToday}';
        const FOLLOWUP_MIN_STREAK = 2, CHRONIC_MIN_STREAK = 3;
        const ALL_DAY_NAMES = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
        let generalHomeExpanded = { context: '', stalled: false, support: false };`);
    const install = (...names) => names.forEach(name => run(source(name, productionHtml)));
    install('isGeneralProgram', 'getStudentHalaqa', 'escapeHTML', 'countLabel', 'schoolCivilDate', 'formatDateLocal',
        'getWeekStartDate', 'isSeasonCalendarComplete', 'isWorkingDay', 'getSchoolDayInfo', 'getAttendanceState',
        'generalAttendanceStart', 'getGeneralSchoolDates', 'getWorkingDaysList', 'getConsecutiveAbsenceStreak',
        'getFollowupAbsentees', 'getGeneralUnrecordedDays', 'updateGeneralAttendanceUI', 'renderHomeDashboard');
    if (productionHtml === html) install('updateHomeProgramVisibility', 'generalTodaySummary', 'generalStalledMemorization', 'generalRecitationSupport',
        'generalHomeDaysLabel', 'generalHomeHalaqaName', 'generalHomeFollowupText', 'generalTodayCardHtml',
        'generalHomeWhatsapp', 'generalHomeFollowupCard', 'renderGeneralHome', 'expandGeneralHomeList');
    if (productionHtml === html) install(...[...html.matchAll(/function ((?:generalPerformance|renderGeneralPerformance|setGeneralPerformance|bindGeneralPerformance)\w*)\(/g)].map(m => m[1]));
    if (productionHtml === html) run(html.match(/window\.addEventListener\('resize', generalPerformanceResize\);/)[0]);
    return { state, list, ctx, run, element, install,
        resize: () => events.get('resize')(), pendingFrames: () => frames.size,
        flushFrame() { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); },
        performance: (period = 'all') => copy(run(`generalPerformanceModel(students, getProgramSettings(), generalPerformanceSettings(), '${period}',
            { dates: getGeneralSchoolDates(), today: todayStr }, window.almahraPrograms.getCurrentSeason(),
            { stateOf: getAttendanceState, startOf: generalAttendanceStart, measure: measureEntry, schoolDayInfo: getSchoolDayInfo })`)),
        summary: () => copy(run('generalTodaySummary(students, todayStr, getProgramSettings(), getSchoolDayInfo(todayStr), getAttendanceState, generalAttendanceStart)')),
        lists: () => ({ absent: run('getFollowupAbsentees()'),
            stalled: run('generalStalledMemorization(students, getGeneralSchoolDates(), todayStr, getAttendanceState, generalAttendanceStart)'),
            support: run('generalRecitationSupport(students, getGeneralSchoolDates(), todayStr, generalAttendanceStart)') }),
        click(markup, text) {
            const button = [...markup.matchAll(/<button\b[^>]*onclick="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)]
                .find(m => m[2].includes(text));
            assert.ok(button, text); run(button[1]);
        } };
}

for (const [type, title] of [['absent', '١ غائبون'], ['stalled', '٢ متوقفون'], ['support', '٣ تثبيت']]) {
    test(`مفتاح الإجابة §5: البطاقة ${title} — الأسماء والأعداد والنصوص حرفياً`, () => {
        const h = harness(), before = JSON.stringify(h.list);
        const actual = h.lists()[type].map(row => ({ name: row.student.name, days: row.streak ?? row.days,
            text: h.ctx.generalHomeFollowupText(type, row, h.state.settings) }));
        assert.deepEqual(copy(actual), key.expected[type]);
        const markup = h.ctx.generalHomeFollowupCard(type, h.lists()[type], h.state.settings, false);
        assert.match(markup, new RegExp(`gh-count[^>]*>${key.expected[type].length.toLocaleString('ar-SA')}<`));
        for (const expected of key.expected[type]) assert.ok(markup.includes(expected.name) && markup.includes(expected.text));
        assert.equal(JSON.stringify(h.list), before);
    });
}

test('ثوابت المفتاح: ٨ طلاب و٣ حلقات، أول موضع، المقاطع، الإجازة، وبداية ماجد المتأخرة', () => {
    const h = harness();
    assert.equal(h.list.length, 8); assert.equal(h.state.settings.halaqas.length, 3);
    assert.deepEqual(copy(h.run('getGeneralSchoolDates()')), key.dates);
    assert.equal(h.ctx.generalAttendanceStart(h.list[7]), '2026-11-15');
    assert.ok(h.list.every(s => s.lastSurah === 2 && s.lastAyah === 5));
    assert.equal(h.list[3].history['2026-11-15'].entries.e0.grade, 'excellent');
    assert.deepEqual(h.list[0].history['2026-11-16'].entries.e1.spec, key.pages[5]);
    assert.equal(h.list[6].history['2026-11-18'].entries.e0.kind, 'review');
});

test('مفتاح اليوم الجاري: فيصل يخرج من الغياب وماجد من التوقف فور تسميعهما', () => {
    const h = harness();
    for (const index of [2, 7]) delete h.list[index].history[key.today];
    assert.ok(h.lists().absent.some(row => row.student.name === 'فيصل'));
    assert.ok(h.lists().stalled.some(row => row.student.name === 'ماجد'));
    h.list[2].history[key.today] = { entries: { e: { kind: 'new', grade: 'good' } } };
    h.list[7].history[key.today] = { entries: { e: { kind: 'new', grade: 'good' } } };
    assert.ok(!h.lists().absent.some(row => row.student.name === 'فيصل'));
    assert.ok(!h.lists().stalled.some(row => row.student.name === 'ماجد'));
});

test('التوقف: الغياب يُتخطّى، الماضي غير المسجل يقطع، واليوم غير المسجل يُتخطّى', () => {
    const h = harness(), omar = h.list.find(s => s.name === 'عمر');
    delete omar.history['2026-11-17'];
    assert.ok(!h.lists().stalled.some(row => row.student.name === 'عمر'));
    omar.history['2026-11-17'] = { attended: false, absence: 'excused' };
    assert.equal(h.lists().stalled.find(row => row.student.name === 'عمر').days, 2);
    omar.history[key.today] = { attended: true };
    assert.equal(h.lists().stalled.find(row => row.student.name === 'عمر').days, 3);
});

test('التثبيت: ٤ أيام تشمل اليوم، تعدد تسجيلات اليوم يوم واحد، وي٥ خارج النافذة', () => {
    const h = harness();
    assert.deepEqual(copy(h.lists().support.map(r => r.student.name)), ['زياد']);
    h.list.find(s => s.name === 'عمر').history[key.today] = { entries: { e: { kind: 'review', grade: 'repeat' } } };
    assert.equal(h.lists().support.find(r => r.student.name === 'عمر').days, 2);
    const ziad = h.list.find(s => s.name === 'زياد');
    delete ziad.history['2026-11-16'].entries.e0.grade;
    assert.ok(!h.lists().support.some(r => r.student.name === 'زياد'));
});

function todayStudents() {
    const rows = [{ entries: { e: { kind: 'new', grade: 'repeat' } } }, { entries: { e: { kind: 'review', grade: 'good' } } },
        { attended: true }, { attended: false, absence: 'excused' }, { attended: false, absence: 'unexcused' }, null];
    return rows.map((day, index) => ({ id: index + 1, name: `وهمي ${index + 1}`, halaqaId: 'a',
        history: day ? { [key.today]: day } : {} }));
}
test('بطاقة اليوم: حضر ٣ من ٦ وغاب ٢ بعذر ١ وبغير ١ ولم يسجل ١، والزر ينقل للتحضير', () => {
    const h = harness(todayStudents()), before = JSON.stringify(h.list);
    assert.deepEqual(h.summary(), { holiday: false, present: 3, absent: 2, excused: 1, unexcused: 1, unrecorded: 1, total: 6 });
    h.run('renderHomeDashboard()');
    const card = h.element('generalTodayCard').innerHTML;
    assert.match(card, />٣<\/b><span>حضر<\/span><small>من ٦/);
    assert.match(card, />٢<\/b><span>غاب<\/span><small>بعذر ١ · بغير ١/);
    h.click(card, 'أكملهم ←'); assert.deepEqual(h.state.navigation, ['page-students']);
    assert.equal(JSON.stringify(h.list), before);
});
test('بطاقة اليوم: الحلقة غير النشطة وبلا حلقة ومن لم يبدأ بعد خارج المجموعة', () => {
    const h = harness(todayStudents());
    h.state.settings.halaqas.push({ id: 'off', active: false });
    for (const [halaqaId, history] of [['off', {}], ['', {}], ['a', { '2026-11-23': { attended: true } }]])
        h.list.push({ name: 'خارج المجموعة', halaqaId, history });
    assert.equal(h.summary().total, 6); assert.equal(h.summary().unrecorded, 1);
    assert.doesNotMatch(source('generalTodaySummary'), /getGeneralDayAttendance/);
});
test('بطاقة اليوم: الإجازة والعطلة الأسبوعية بدل الخانات، والاكتمال بدل زر أكملهم', () => {
    const h = harness(todayStudents());
    h.state.season.calendar.push({ from: key.today, to: key.today, name: 'إجازة وهمية' });
    h.run('renderGeneralHome()'); assert.match(h.element('generalTodayCard').innerHTML, /اليوم إجازة/);
    assert.doesNotMatch(h.element('generalTodayCard').innerHTML, /gh-today-grid/);
    h.state.season.calendar.pop(); h.run("todayStr = '2026-11-20'; renderGeneralHome()");
    assert.match(h.element('generalTodayCard').innerHTML, /اليوم إجازة/);
    h.run(`todayStr = '${key.today}'`); h.list[5].history[key.today] = { attended: true };
    h.run('renderGeneralHome()'); assert.match(h.element('generalTodayCard').innerHTML, /✓.*اكتمل التسجيل.*لا أحد ينتظر/s);
    assert.doesNotMatch(h.element('generalTodayCard').innerHTML, /أكملهم/);
});
test('بطاقة اليوم تُخفى في المؤرشف والتقويم الناقص، والفراغ يعرض رسائل المتابعة', () => {
    const h = harness([]); h.state.archived = true; h.run('renderGeneralHome()');
    assert.equal(h.element('generalTodayCard').style.display, 'none');
    h.state.archived = false; delete h.state.season.calendar; h.run('renderGeneralHome()');
    assert.equal(h.element('generalTodayCard').style.display, 'none');
    for (const text of ['لا غائبين متتابعين', 'كل الحاضرين سمّعوا جديداً', 'لا تعثّر متكرر في التسميع'])
        assert.ok(h.element('generalHomeFollowup').innerHTML.includes(text));
});
test('ت٢٥: الشريط مخفي دائماً؛ مصدر الأيام يبقى لليوم والأيام السابقة من الأسبوع نفسه', () => {
    const h = harness([{ name: 'وهمي', halaqaId: 'a', history: { '2026-11-15': { attended: true } } }], '2026-11-18');
    h.run('updateGeneralAttendanceUI()'); const bar = h.element('generalUnrecordedAlert');
    assert.equal(bar.classList.contains('hidden'), true);
    assert.equal(bar.innerHTML, '');
    assert.match(JSON.stringify(h.run('getGeneralUnrecordedDays()')), /2026-11-17/);
    assert.match(JSON.stringify(h.run('getGeneralUnrecordedDays()')), /2026-11-18/);
    h.run(`todayStr = '${key.today}'; updateGeneralAttendanceUI()`);
    assert.equal(bar.classList.contains('hidden'), true);
    assert.equal(bar.innerHTML, '');
    assert.match(JSON.stringify(h.run('getGeneralUnrecordedDays()')), /2026-11-22/);
    assert.doesNotMatch(JSON.stringify(h.run('getGeneralUnrecordedDays()')), /2026-11-17/);
});
test('٣ أسطر ثم عرض الكل؛ الغياب للسجل والمتوقفون والتثبيت يتوسعون في موضعهم', () => {
    for (const type of ['absent', 'stalled', 'support']) {
        const h = harness();
        const template = h.lists()[type][0];
        h.list.splice(0, h.list.length, ...Array.from({ length: 5 }, (_, i) => ({ ...copy(template.student), id: i + 1, name: `وهمي ${i + 1}` })));
        h.run('renderGeneralHome()');
        const card = () => h.ctx.generalHomeFollowupCard(type, h.lists()[type], h.state.settings, h.run(`!!generalHomeExpanded.${type}`));
        assert.equal((card().match(/class="gh-row"/g) || []).length, 3);
        h.click(card(), 'عرض الكل ←');
        if (type === 'absent') assert.deepEqual(h.state.navigation, ['recPanelAbsence']);
        else {
            assert.equal((card().match(/class="gh-row"/g) || []).length, 5);
            assert.doesNotMatch(card(), /عرض الكل/); assert.deepEqual(h.state.navigation, []);
            h.state.season.id = 'different-season'; h.run('renderGeneralHome()');
            assert.equal((card().match(/class="gh-row"/g) || []).length, 3);
        }
    }
});
test('واتساب يطابق رسالة renderHomeCare الحالية، بلا ضغط للأسطر أو كتابة من الرئيسية', () => {
    const h = harness(); h.ctx.normalizeSaudiPhone = () => '966500000000';
    const row = h.lists().absent[0];
    const link = h.ctx.generalHomeWhatsapp(row.student, row.streak);
    const expected = 'السلام عليكم ورحمة الله وبركاته\nولي أمر خالد الكريم:\n\nنفتقد حضوره في حلقة القرآن منذ 5 أيام، ونأمل منكم المتابعة والتواصل معنا.\n\nجزاكم الله خيراً';
    assert.equal(decodeURIComponent(/text=([^"]+)/.exec(link)[1]), expected);
    const card = h.ctx.generalHomeFollowupCard('absent', [row], h.state.settings, false);
    assert.doesNotMatch(card, /<button|onclick=/);
    for (const name of ['renderGeneralHome', 'generalTodaySummary', 'generalStalledMemorization', 'generalRecitationSupport',
        'expandGeneralHomeList', 'generalHomeFollowupCard']) assert.doesNotMatch(source(name), /commit|save|setDoc|updateDoc|localStorage/);
});
// انقلب مع الجولة الثانية (ت٢٣)
test('general يخفي الحديث والمربعات والمتصدرين ويحذف زر قائمة الغياب', () => {
    const h = harness(); h.run('renderHomeDashboard(); updateGeneralAttendanceUI()');
    for (const id of ['homeVerse', 'homeDashboard', 'homeLead', 'homeExtras']) assert.equal(h.element(id).style.display, 'none');
    assert.equal(h.element('homeDashboard').innerHTML, '');
    assert.equal(h.element('generalAttendanceTools').classList.contains('hidden'), true);
    const homeHtml = html.split('id="page-home"')[1].split('<!-- Pomodoro Tab -->')[0];
    assert.doesNotMatch(homeHtml, /قائمة الغياب|onclick="openGeneralTv|onclick="openGeneralWeeklySheetModal|للتجربة|نموذج ببيانات وهمية/);
    assert.match(homeHtml, /id="generalPerformance"[\s\S]*?الأداء/);
    h.state.program = 'summer'; h.run('renderHomeDashboard()');
    assert.equal(h.element('generalHome').style.display, 'none');
    assert.equal(h.element('homeVerse').style.display, ''); assert.equal(h.element('homeLead').style.display, '');
});
test('العزل: summer وreview-day مطابقان قبل التغيير في الحديث والمربعات والمتابعة والمتصدرين', () => {
    const baseline = cp.execFileSync('git', ['show', 'HEAD:index.html'], { cwd: root, encoding: 'utf8' });
    for (const program of ['summer', 'review-day']) {
        const current = harness(), old = harness(answerStudents(), key.today, baseline);
        for (const h of [current, old]) { h.state.program = program; h.run('renderHomeDashboard()'); }
        for (const id of ['homeDashboard', 'homeCare', 'homeLead']) assert.equal(current.element(id).innerHTML, old.element(id).innerHTML, `${program} ${id}`);
        for (const name of ['renderHomeCare', 'renderHomeLeaders', 'initHadithTilt']) assert.equal(source(name), source(name, baseline));
        const verse = text => text.match(/<div id="homeVerse"[\s\S]*?<!-- لوحة معلومات المجمع -->/)[0];
        assert.equal(verse(html), verse(baseline));
    }
    for (const name of ['getFollowupAbsentees', 'getAttendanceState', 'getConsecutiveAbsenceStreak', 'generalRecitationTotals'])
        assert.equal(source(name), source(name, baseline));
});
test('الإعدادات تستدعي الدالتين الحاليتين، والأماكن القديمة تبقى، والتغيير العام نص وصورة فقط', () => {
    const settings = html.split('id="settingsHome"')[1].split('id="setPanelFrontierFix"')[0];
    assert.match(settings, /id="generalSettingsTv"[^>]*onclick="openGeneralTv\(\)"[\s\S]*?شاشة التلفاز/);
    assert.match(settings, /id="generalSettingsWeeklySheet"[^>]*onclick="openGeneralWeeklySheetModal\(\)"[\s\S]*?طباعة الأوراق الأسبوعية/);
    assert.match(source('applyProgramFeatures'), /generalSettingsTv.*generalSettingsWeeklySheet/);
    const baseline = cp.execFileSync('git', ['show', 'HEAD:index.html'], { cwd: root, encoding: 'utf8' });
    for (const name of ['openGeneralTv', 'openGeneralWeeklySheetModal']) assert.equal(source(name), source(name, baseline));
    for (const id of ['generalTvButton', 'generalWeeklySheetButton']) {
        const tag = text => text.match(new RegExp(`<button id="${id}"[^>]*>`))[0]; assert.equal(tag(html), tag(baseline));
    }
    assert.match(html, /جارٍ التحميل…/); assert.doesNotMatch(html, /تهيئة اللوحة الذهبية والمحرك المكاني V25/);
    assert.match(html, /class="ah-logo" src="\.\/assets\/brand\/afdalkom-logo-horizontal-color.png"/);
    const images = text => [...text.matchAll(/<img\b[^>]*>/g)].map(m => m[0]).filter(m => !m.includes('class="ah-logo"'));
    assert.deepEqual(images(html), images(baseline));
});
test('التخطيط: ثلاثة أعمدة على الحاسب، عمود دون 1020، وثلاث خانات لليوم حتى على 390', () => {
    assert.match(html, /\.gh-grid\s*\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
    assert.match(html, /@media \(max-width:1019px\)\s*\{\s*\.gh-grid\s*\{\s*grid-template-columns:1fr/);
    assert.match(html, /\.gh-today-grid\s*\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
    assert.equal((html.match(/\.gh-today-grid\s*\{/g) || []).length, 1);
    assert.match(html, /\.gh-main\s*\{[^}]*min-width:0[^}]*overflow-wrap:anywhere/);
});

for (const period of ['all', 'asr', 'maghrib']) {
    test(`مفتاح الإجابة البطاقات ٤–٦: ${period} الحضور والإنجاز والهدف والفرق حرفياً`, () => {
        const h = harness(), before = JSON.stringify({ students: h.list, settings: h.state.settings, season: h.state.season });
        const model = h.performance(period), e = performanceKey.periods[period];
        assert.deepEqual({ present: model.current.present, absent: model.current.absent, attendance: model.current.attendancePct,
            previousAttendance: model.previous.attendancePct, attendanceDelta: model.attendanceDelta,
            raw: model.current.raw, goal: model.current.goal, counted: model.current.counted, achievement: model.current.newPct,
            previousAchievement: model.previous.newPct, achievementDelta: model.achievementDelta }, e);
        assert.equal(JSON.stringify({ students: h.list, settings: h.state.settings, season: h.state.season }), before);
        h.run('renderGeneralHome()');
        h.ctx.setGeneralPerformancePeriod(period);
        assert.ok(h.element('generalAttendanceCard').innerHTML.includes(h.ctx.generalPerformancePercent(e.attendance)));
        const achievement = h.element('generalAchievementCard').innerHTML;
        assert.ok(achievement.includes(`حفظوا ${h.ctx.generalPerformanceNumber(e.raw)} أوجه من هدف ${h.ctx.generalPerformanceNumber(e.goal)}`));
        if (e.achievementDelta === 0) assert.doesNotMatch(achievement, /gh-delta|↑|↓/);
        else assert.ok(achievement.includes(`↓ ${h.ctx.generalPerformanceNumber(-e.achievementDelta)} نقطة`));
    });
}

test('مفتاح الإجابة البطاقة ٦: سطر الفترات من المراحل الفعلية ويغيّر القسم كله بلا كتابة', () => {
    const h = harness(); h.run('renderGeneralHome()');
    const periods = h.element('generalPerformancePeriods').innerHTML;
    assert.match(periods, /المجمع<small>كل الحلقات/);
    assert.match(periods, /حلقات العصر<small>ابتدائي/);
    assert.match(periods, /حلقات المغرب<small>متوسط وثانوي/);
    h.click(periods, 'حلقات المغرب');
    assert.match(h.element('generalPerformancePeriods').innerHTML, /aria-pressed="true"[^>]*>حلقات المغرب/);
    assert.match(h.element('generalAttendanceCard').innerHTML, /٨٥٪/);
    assert.match(h.element('generalAchievementCard').innerHTML, /٦٥٪/);
    h.state.settings.stages[0].name = 'اسم المرحلة الجديد'; h.run('renderGeneralPerformance()');
    assert.match(h.element('generalPerformancePeriods').innerHTML, /اسم المرحلة الجديد/);
    h.state.season.id = 'other'; h.run('renderGeneralPerformance()');
    assert.equal(h.element('generalPerformance').dataset.period, 'all');
    assert.deepEqual(h.state.writes, []);
});

test('مفتاح الإجابة البطاقة ٧: أ وج في الحضور، ب وج في الإنجاز، الأستاذ والنسبة حرفياً', () => {
    const h = harness(), model = h.performance();
    assert.deepEqual(model.followup.attendance.map(r => [r.halaqa.id, r.totals.attendancePct]), performanceKey.attendanceFollowup);
    assert.deepEqual(model.followup.achievement.map(r => [r.halaqa.id, r.totals.newPct]), performanceKey.achievementFollowup);
    h.run('renderGeneralHome()');
    const attendance = h.element('generalAttendanceCard').innerHTML, achievement = h.element('generalAchievementCard').innerHTML;
    for (const text of ['حلقة أ — الأستاذ عبدالله', 'حلقة ج — الأستاذ صالح', 'حضورها أقل من ٨٥٪']) assert.ok(attendance.includes(text));
    for (const text of ['حلقة ب — الأستاذ إبراهيم', 'حلقة ج — الأستاذ صالح', 'إنجازها أقل من ٨٠٪']) assert.ok(achievement.includes(text));
    h.state.settings.teachers[0].name = 'الأستاذ عبدالله'; h.run('renderGeneralPerformance()');
    assert.doesNotMatch(h.element('generalAttendanceCard').innerHTML, /الأستاذ الأستاذ/);
    h.ctx.setGeneralPerformancePeriod('asr');
    assert.match(h.element('generalAchievementCard').innerHTML, /✓ لا حلقة تحت الحد/);
    assert.doesNotMatch(achievement, /المراجعة|generalRecitationTotals/);
});

test('مفتاح الإجابة البطاقة ٨: القيم اليومية والأسبوعية، الإجازة فجوة، لا نقطة لليوم ولا أسابيع قبل الفصل', () => {
    const h = harness(), model = h.performance();
    assert.deepEqual(model.daily.map(row => row.holiday ? 'إجازة' : row.totals.attendancePct), performanceKey.daily);
    assert.deepEqual(model.weekly.map(row => row.holiday ? 'إجازة' : row.totals.newPct), performanceKey.weekly);
    assert.deepEqual(model.weekly.map(row => row.start), performanceKey.weeks);
    assert.ok(model.daily.every(row => row.date !== key.today));
    const line = h.ctx.generalPerformanceChart(model.daily, 'attendance');
    const bars = h.ctx.generalPerformanceChart(model.weekly, 'achievement');
    const path = /class="gh-attendance-line" d="([^"]*)"/.exec(line.html)[1];
    assert.equal((path.match(/M/g) || []).length, 2);
    assert.equal((line.html.match(/<circle cx=/g) || []).length, 8);
    assert.match(line.html, /إجازة/);
    assert.equal((bars.html.match(/class="gh-bar"/g) || []).length, 2);
    assert.match(bars.html, /data-goal="100"/); assert.match(bars.html, /إجازة/); assert.match(bars.html, />—<\/text>/);
    for (const chart of [line, bars]) for (let i = 1; i < chart.points.length; i++) assert.ok(chart.points[i - 1].x > chart.points[i].x);
    assert.equal(bars.points[1].value, null); assert.equal(bars.points[3].value, null);
    // تغيير تسجيلات اليوم لا يغيّر أي رقم من الأرقام أو الرسمين.
    for (const student of h.list) student.history[key.today] = { entries: { e: { kind: 'new', grade: 'excellent', spec: copy(key.pages[3]), rep: 10 } } };
    assert.deepEqual(h.performance(), model);
});

test('لا مقام: — بلا سهم أو حلقة متابعة؛ والغياب ذو مقام يبقى صفراً حقيقياً', () => {
    const h = harness([]), model = h.performance();
    assert.equal(model.current.attendancePct, null); assert.equal(model.current.newPct, null);
    assert.equal(model.attendanceDelta, null); assert.equal(model.achievementDelta, null);
    assert.deepEqual(model.followup, { attendance: [], achievement: [] });
    h.run('renderGeneralHome()');
    for (const id of ['generalAttendanceCard', 'generalAchievementCard']) {
        const text = h.element(id).innerHTML;
        assert.match(text, /gh-kpi-value">—/); assert.doesNotMatch(text, /gh-delta|↑|↓/);
    }
    const absent = harness([answerStudents()[1]]).performance();
    assert.equal(absent.current.attendancePct, 0); assert.equal(absent.current.newPct, null);
    assert.deepEqual(absent.followup.achievement, []);
});

test('بلا حلقة أو بلا مرحلة يدخل المجمع وحده؛ البداية من أول سجل ولو كان غياباً', () => {
    for (const kind of ['no-halaqa', 'missing-stage']) {
        const h = harness(), baseline = h.performance();
        const student = { id: 9, name: 'طالب وهمي بلا فترة', halaqaId: kind === 'no-halaqa' ? '' : 'unclassified',
            history: { '2026-11-17': { attended: false }, '2026-11-18': { attended: true,
                entries: { n: { kind: 'new', grade: 'good', spec: copy(key.pages[3]) } } } } };
        if (kind === 'missing-stage') h.state.settings.halaqas.push({ id: 'unclassified', name: 'حلقة بلا مرحلة', active: true });
        const asr = h.performance('asr'), maghrib = h.performance('maghrib'); h.list.push(student);
        const all = h.performance();
        assert.equal(all.current.present, baseline.current.present + 1); assert.equal(all.current.absent, baseline.current.absent + 1);
        assert.equal(all.current.goal, baseline.current.goal + 0.5); assert.equal(all.current.counted, baseline.current.counted + 0.5);
        assert.deepEqual(h.performance('asr'), asr); assert.deepEqual(h.performance('maghrib'), maghrib);
    }
});

test('إعدادات الأداء: افتراضيات موحّدة بلا كتابة أو تعديل للخام، والتغيير المحفوظ يسبقها', () => {
    const h = harness(), raw = h.state.settings, before = JSON.stringify(raw);
    h.ctx.raw = { stages: raw.stages };
    const cfg = h.run('generalPerformanceSettings(raw)');
    assert.equal(cfg.newGoalPerDay, 0.5); assert.deepEqual(copy(cfg.limits), { attendancePct: 85, newPct: 80 });
    assert.equal(cfg.periodOf({ id: 'primary' }), 'asr'); assert.equal(cfg.periodOf({ id: 'middle' }), 'maghrib');
    assert.equal(cfg.periodOf({ id: 'custom' }), 'maghrib'); assert.equal(cfg.periodOf({ id: 'primary', period: 'invalid' }), 'asr');
    assert.equal(cfg.periodOf({ id: 'primary', period: 'maghrib' }), 'maghrib');
    for (const invalid of [0, -1, '1', Infinity, NaN, null]) assert.equal(h.ctx.generalPerformanceSettings({ newGoalPerDay: invalid }).newGoalPerDay, 0.5);
    for (const invalid of [0, 101, '85', NaN, Infinity, null]) assert.deepEqual(copy(h.ctx.generalPerformanceSettings({ followupLimits: { attendancePct: invalid, newPct: invalid } }).limits), { attendancePct: 85, newPct: 80 });
    assert.equal(JSON.stringify(raw), before);
    // هدف ١: ٨ أوجه محسوبة من ٢١؛ المتميز لا يتجاوز هدفه.
    h.state.settings.newGoalPerDay = 1;
    assert.equal(h.performance().current.newPct, 38); assert.equal(h.performance().current.goal, 21); assert.equal(h.performance().current.counted, 8);
    h.state.settings.followupLimits = { attendancePct: 70, newPct: 80 };
    assert.deepEqual(h.performance().followup.attendance.map(row => row.halaqa.id), ['a']);
    h.state.settings.followupLimits.attendancePct = 95;
    assert.deepEqual(h.performance().followup.attendance.map(row => row.halaqa.id), ['a', 'c', 'b']);
    h.state.settings.stages[0].period = 'maghrib';
    assert.equal(h.performance('asr').current.attendancePct, null);
    assert.deepEqual(h.performance('maghrib').current, h.performance().current);
});

function settingsHarness() {
    const h = harness();
    h.state.settings.grades = [];
    h.ctx.window.almahraPrograms.getAllStudents = async () => [];
    Object.assign(h.ctx, { canWriteView: () => true, readGeneralTvPrayer: () => ({ maghribMinutes: 20, ishaMinutes: 30 }),
        collectCriteriaFromRows: () => [], collectGeneralSettingRows: kind => h.state.settings[kind === 'stage' ? 'stages' : 'teachers'],
        collectGeneralHalaqaRows: () => copy(h.state.settings.halaqas), validateGeneralHalaqas: () => null,
        generalHalaqaStudentPatches: () => [], generalTeacherIsUsed: () => false,
        showToast: message => { h.state.error = message; },
        commitProgramSettings: async commit => { h.state.writes.push(copy(commit.settings)); } });
    h.run('let generalSettingsHalaqaBaseline = null;');
    h.install('saveProgramSettings', 'generalSettingRow', 'collectGeneralSettingRows');
    // صفوف النموذج تُختبر منفردة أدناه؛ هنا نختبر طريق الحفظ الحالي.
    h.ctx.collectGeneralSettingRows = kind => h.state.settings[kind === 'stage' ? 'stages' : 'teachers'];
    for (const [id, value] of Object.entries({ psPtAtt: '10', psMultNew: '3', psMultRev: '1', psNewGoalPerDay: '0.5', psFollowupAttendance: '85', psFollowupNew: '80' })) h.element(id).value = value;
    return h;
}

test('حفظ الإعدادات من الطريق الحالي: الهدف والحدان والفترة يبقون، والمهاجر لا يحذفهم', async () => {
    const h = settingsHarness(); h.element('psNewGoalPerDay').value = '1'; h.element('psFollowupAttendance').value = '90';
    h.element('psFollowupNew').value = '75'; h.state.settings.stages[0].period = 'maghrib';
    h.state.settings.preserved = { custom: true };
    await h.run('saveProgramSettings()');
    assert.equal(h.state.writes.length, 1);
    const saved = h.state.writes[0];
    assert.equal(saved.newGoalPerDay, 1); assert.deepEqual(saved.followupLimits, { attendancePct: 90, newPct: 75 });
    assert.equal(saved.stages[0].period, 'maghrib'); assert.deepEqual(saved.preserved, { custom: true });
    const store = fs.readFileSync(path.join(root, 'programs-store.js'), 'utf8');
    const defs = store.slice(store.indexOf('export const PROGRAM_DEFS'), store.indexOf('// الحالة الداخلية')).replace('export ', '');
    const ctx = vm.createContext({ saved });
    vm.runInContext(defs + '\n' + source('migrateSettings', store), ctx);
    const migrated = copy(vm.runInContext("migrateSettings('general', saved).settings", ctx));
    assert.equal(migrated.newGoalPerDay, 1); assert.deepEqual(migrated.followupLimits, saved.followupLimits);
    assert.deepEqual(migrated.stages, saved.stages); assert.deepEqual(migrated.preserved, saved.preserved);
});

test('القيم غير الصالحة تُرفض قبل حفظ إعدادات general: الهدف والحدان والفترة', async () => {
    for (const [id, value] of [ ['psNewGoalPerDay', '0'], ['psNewGoalPerDay', '-1'], ['psNewGoalPerDay', ''], ['psNewGoalPerDay', 'NaN'],
        ['psNewGoalPerDay', 'Infinity'], ['psFollowupAttendance', '0'], ['psFollowupAttendance', '101'], ['psFollowupAttendance', ''],
        ['psFollowupNew', '0'], ['psFollowupNew', '101'], ['psFollowupNew', 'invalid'] ]) {
        const h = settingsHarness(); h.element(id).value = value; await h.run('saveProgramSettings()');
        assert.equal(h.state.writes.length, 0, `${id}=${value}`); assert.ok(h.state.error);
    }
    const h = settingsHarness(); h.state.settings.stages[0].period = 'invalid'; await h.run('saveProgramSettings()');
    assert.equal(h.state.writes.length, 0); assert.match(h.state.error, /فترة المرحلة/);
    const valid = settingsHarness(); valid.element('psNewGoalPerDay').value = '0.01'; valid.element('psFollowupAttendance').value = '1'; valid.element('psFollowupNew').value = '100';
    await valid.run('saveProgramSettings()'); assert.equal(valid.state.writes.length, 1);
});

test('واجهة المراحل تجمع الفترة وتحفظ الحقول السابقة؛ الافتراضي يظهر بلا حفظ', () => {
    const h = harness(); h.install('generalSettingRow', 'collectGeneralSettingRows');
    const stage = h.state.settings.stages[0]; delete stage.period; stage.preserved = 'باقٍ';
    assert.match(h.ctx.generalSettingRow(stage, 'stage'), /value="asr" selected/);
    assert.match(h.ctx.generalSettingRow({ id: 'custom', name: 'مخصصة' }, 'stage'), /value="maghrib" selected/);
    h.ctx.document.querySelectorAll = () => [{ dataset: { id: 'primary' }, querySelector: selector => ({ value: selector === 'input' ? 'ابتدائي' : 'maghrib' }) }];
    const collected = copy(h.ctx.collectGeneralSettingRows('stage'));
    assert.equal(collected[0].period, 'maghrib'); assert.equal(collected[0].preserved, 'باقٍ');
    assert.equal('period' in stage, false);
    assert.match(source('renderProgramSettings'), /generalPerformanceSettingsSection[\s\S]*psNewGoalPerDay[\s\S]*psFollowupAttendance[\s\S]*psFollowupNew/);
});

test('عزل الجولة الثانية: الملف المشترك والدوال الممنوعة حرفياً، وترحيل summer وreview-day كما دخل', () => {
    const store = fs.readFileSync(path.join(root, 'programs-store.js'), 'utf8');
    assert.equal(store.replaceAll('\r\n', '\n'), cp.execFileSync('git', ['show', 'HEAD:programs-store.js'], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n'));
    const baseline = cp.execFileSync('git', ['show', 'HEAD:index.html'], { cwd: root, encoding: 'utf8' });
    for (const name of ['getProgramSettings', 'getAttendanceState', 'getSchoolDayInfo', 'computeComplexStats', 'generalRecitationTotals']) assert.equal(source(name), source(name, baseline));
    assert.equal(html.match(/const measureEntry = .*;/)[0], baseline.match(/const measureEntry = .*;/)[0]);
    const defs = store.slice(store.indexOf('export const PROGRAM_DEFS'), store.indexOf('// الحالة الداخلية')).replace('export ', '');
    const ctx = vm.createContext({});
    vm.runInContext(defs + '\n' + source('fillTierMinJuz', store) + '\n' + source('migrateSettings', store) + '\nconst SETTINGS_VERSION = 4;', ctx);
    for (const program of ['summer', 'review-day']) {
        const result = copy(vm.runInContext(`(() => { const settings = { ...PROGRAM_DEFS['${program}'].defaultSettings, settingsVersion: 4 };
            const before = JSON.stringify(settings), result = migrateSettings('${program}', settings); return { before, after: JSON.stringify(result.settings), changed: result.changed }; })()`, ctx));
        assert.equal(result.after, result.before); assert.equal(result.changed, false);
    }
    for (const name of ['generalPerformanceTotals', 'generalPerformanceModel', 'renderGeneralPerformance', 'setGeneralPerformancePeriod'])
        assert.doesNotMatch(source(name), /setDoc|updateDoc|commit|localStorage|generalRecitationTotals|computeComplexStats/);
});

test('الرسم أعلى على 390، والمحاور لا تُصغّر، والبطاقتان جنباً إلى جنب عند 1280', () => {
    const h = harness(), model = h.performance();
    const phone = h.ctx.generalPerformanceChart(model.daily, 'attendance', 310), desktop = h.ctx.generalPerformanceChart(model.daily, 'attendance', 550);
    assert.match(phone.html, /viewBox="0 0 310 280"/); assert.match(desktop.html, /viewBox="0 0 550 220"/);
    assert.match(html, /\.gh-performance-grid\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
    assert.match(html, /@media \(max-width:1019px\)\s*\{\s*\.gh-performance-grid\s*\{\s*grid-template-columns:1fr/);
    assert.match(source('bindGeneralPerformanceTip'), /pointermove/); assert.match(source('bindGeneralPerformanceTip'), /pointerdown/);
});

test('تلميح الرسم يعمل بالمؤشر واللمس ولوحة المفاتيح، ويخفي النقطة عند فجوة الإجازة', () => {
    const h = harness(), model = h.performance();
    const chart = h.ctx.generalPerformanceChart(model.daily, 'attendance', 310);
    const listeners = {}, attrs = () => ({ values: {}, setAttribute(name, value) { this.values[name] = value; } });
    const cross = attrs(), dot = attrs(), classes = new Set();
    const tip = { innerHTML: '', style: {}, getBoundingClientRect: () => ({ width: 150 }),
        classList: { add: v => classes.add(v), remove: v => classes.delete(v) } };
    const svg = { viewBox: { baseVal: { width: 310, height: 280 } }, getBoundingClientRect: () => ({ left: 40, width: 310, height: 280 }),
        querySelector: selector => selector === '.gh-cross' ? cross : dot, addEventListener: (type, handler) => { listeners[type] = handler; } };
    h.ctx.bindGeneralPerformanceTip({ querySelector: selector => selector === 'svg' ? svg : tip }, chart.points);
    listeners.pointermove({ clientX: 40 + chart.points[0].x });
    assert.ok(classes.has('on')); assert.match(tip.innerHTML, /١٠٠٪/); assert.match(tip.innerHTML, /حضر ٧ · غاب ٠/);
    listeners.pointerdown({ clientX: 40 + chart.points[4].x });
    assert.equal(tip.innerHTML, 'إجازة'); assert.equal(dot.values.opacity, '0');
    let prevented = false;
    listeners.keydown({ key: 'ArrowLeft', preventDefault() { prevented = true; } });
    assert.equal(prevented, true); assert.match(tip.innerHTML, /٧٥٪/);
    assert.ok(parseFloat(tip.style.left) >= 75 && parseFloat(tip.style.left) <= 235);
    listeners.pointerleave(); assert.equal(classes.has('on'), false); assert.equal(cross.values.opacity, '0');
});

test('حد متابعة الحضور يطابق المعروض: ٨٤٫٦٪ تصبح ٨٥٪ خارج القائمة و٨٤٫٤٪ تصبح ٨٤٪ داخلها', () => {
    for (const [present, total, displayed, included] of [[11, 13, 85, false], [423, 500, 85, false], [422, 500, 84, true]]) {
        const list = Array.from({ length: total }, (_, i) => ({ id: i + 1, halaqaId: 'a',
            history: { '2026-11-18': { attended: i < present, ...(i < present ? {} : { absence: 'unexcused' }) } } }));
        const h = harness(list), model = h.performance();
        assert.equal(model.current.attendancePct, displayed);
        assert.equal(model.followup.attendance.some(row => row.halaqa.id === 'a'), included);
        h.run('renderGeneralHome()');
        const markup = h.element('generalAttendanceCard').innerHTML;
        assert.match(markup, new RegExp(`gh-kpi-value">${h.ctx.generalPerformancePercent(displayed)}`));
        assert.equal(markup.includes('حلقة أ — الأستاذ عبدالله'), included);
    }
});

test('حد متابعة الإنجاز يطابق المعروض: ٧٩٫٦٪ تصبح ٨٠٪ خارج القائمة و٧٩٫٤٪ تصبح ٧٩٪ داخلها', () => {
    for (const [rawPct, displayed, included] of [[79.6, 80, false], [79.4, 79, true]]) {
        const h = harness([{ id: 1, halaqaId: 'a', history: { '2026-11-18': { attended: true,
            entries: { n: { kind: 'new', grade: 'good', spec: copy(key.pages[3]) } } } } }]);
        // وجه حقيقي واحد، وهدف قابل للضبط ينتج النسبة الحدودية المطلوبة.
        h.state.settings.newGoalPerDay = 100 / rawPct;
        const model = h.performance();
        assert.ok(Math.abs(model.current.newRawPct - rawPct) < 1e-9);
        assert.equal(model.current.newPct, displayed);
        assert.equal(model.followup.achievement.some(row => row.halaqa.id === 'a'), included);
        h.run('renderGeneralHome()');
        const markup = h.element('generalAchievementCard').innerHTML;
        assert.match(markup, new RegExp(`gh-kpi-value">${h.ctx.generalPerformancePercent(displayed)}`));
        assert.equal(markup.includes('حلقة أ — الأستاذ عبدالله'), included);
    }
});

function watchPerformance(h) {
    const counts = { calculations: 0, totals: 0, drawings: 0, charts: 0 };
    for (const [name, counter] of [['generalPerformanceModel', 'calculations'], ['generalPerformanceTotals', 'totals'],
        ['renderGeneralPerformanceCharts', 'drawings'], ['generalPerformanceChart', 'charts']]) {
        const original = h.ctx[name];
        h.ctx[name] = (...args) => { counts[counter]++; return original(...args); };
    }
    return counts;
}

test('resize خارج الرئيسية لا يحسب ولا يرسم ولا يحجز إطاراً، وكذلك summer وreview-day', () => {
    const h = harness(); h.run('renderGeneralHome()');
    h.element('page-home').classList.remove('active');
    const counts = watchPerformance(h);
    h.resize(); h.resize(); h.flushFrame();
    assert.deepEqual(counts, { calculations: 0, totals: 0, drawings: 0, charts: 0 });
    assert.equal(h.pendingFrames(), 0);
    h.element('page-home').classList.add('active');
    for (const program of ['summer', 'review-day']) { h.state.program = program; h.resize(); }
    assert.equal(h.pendingFrames(), 0);
    assert.deepEqual(counts, { calculations: 0, totals: 0, drawings: 0, charts: 0 });
});

test('resize في الرئيسية يرسم الرسمين من النتيجة الأخيرة بلا حساب، ويجمع الأحداث في إطار واحد', () => {
    const h = harness(); h.run('renderGeneralHome()');
    const counts = watchPerformance(h), snapshot = h.element('generalPerformance').generalPerformanceSnapshot;
    const cards = ['generalAttendanceCard', 'generalAchievementCard'].map(id => h.element(id).innerHTML);
    h.element('generalAttendanceChart').clientWidth = 310; h.element('generalAchievementChart').clientWidth = 310;
    h.resize(); h.resize(); h.resize();
    assert.equal(h.pendingFrames(), 1);
    assert.deepEqual(counts, { calculations: 0, totals: 0, drawings: 0, charts: 0 });
    h.flushFrame();
    assert.deepEqual(counts, { calculations: 0, totals: 0, drawings: 1, charts: 2 });
    for (const id of ['generalAttendanceChart', 'generalAchievementChart']) assert.match(h.element(id).innerHTML, /viewBox="0 0 310 280"/);
    assert.equal(h.element('generalPerformance').generalPerformanceSnapshot, snapshot);
    assert.deepEqual(['generalAttendanceCard', 'generalAchievementCard'].map(id => h.element(id).innerHTML), cards);
    h.resize(); assert.equal(h.pendingFrames(), 1); h.flushFrame();
    assert.deepEqual(counts, { calculations: 0, totals: 0, drawings: 2, charts: 4 });
});

test('إطار resize المنتظر لا يرسم بعد إخفاء الرئيسية أو تبديل الموسم أو اليوم', () => {
    for (const change of [h => h.element('page-home').classList.remove('active'), h => { h.state.season.id = 'other'; },
        h => { h.state.program = 'summer'; }, h => h.run("todayStr = '2026-11-23'")]) {
        const h = harness(); h.run('renderGeneralHome()'); const counts = watchPerformance(h);
        h.resize(); assert.equal(h.pendingFrames(), 1);
        change(h); h.flushFrame();
        assert.deepEqual(counts, { calculations: 0, totals: 0, drawings: 0, charts: 0 });
        assert.equal(h.pendingFrames(), 0);
    }
});

test('تحديث البيانات ثم العرض أو تبديل الفترة يحسب من جديد، وإطار resize يستعمل النتيجة الأحدث', () => {
    const h = harness(); h.run('renderGeneralHome()');
    const old = h.element('generalPerformance').generalPerformanceSnapshot, counts = watchPerformance(h);
    h.resize();
    h.list[1].history['2026-11-15'] = { attended: true, entries: { n: { kind: 'new', grade: 'good', spec: copy(key.pages[3]) } } };
    h.run('renderGeneralHome()');
    const latest = h.element('generalPerformance').generalPerformanceSnapshot;
    assert.notEqual(latest, old); assert.equal(counts.calculations, 1);
    assert.equal(latest.model.current.attendancePct, 69); assert.equal(latest.model.current.newPct, 73);
    assert.match(h.element('generalAttendanceCard').innerHTML, /gh-kpi-value">٦٩٪/);
    assert.match(h.element('generalAchievementCard').innerHTML, /gh-kpi-value">٧٣٪/);
    const actualDraw = h.ctx.renderGeneralPerformanceCharts;
    let drawnModel;
    h.ctx.renderGeneralPerformanceCharts = model => { drawnModel = model; return actualDraw(model); };
    h.flushFrame();
    assert.equal(drawnModel, latest.model); assert.equal(counts.calculations, 1);
    h.ctx.setGeneralPerformancePeriod('asr');
    assert.equal(counts.calculations, 2);
    assert.equal(h.element('generalPerformance').generalPerformanceSnapshot.period, 'asr');
    assert.notEqual(h.element('generalPerformance').generalPerformanceSnapshot.model, latest.model);
});

// حاضنة المسارات الفعلية: التنقل، اشتراك البرامج، وحفظ الإعدادات بتأكيد سحابة وهمية.
function performanceRoutes(h = harness()) {
    h.install('switchTab');
    h.ctx.window.scrollTo = () => {};
    h.ctx.document.querySelectorAll = selector => selector === '.tab-content'
        ? ['page-home', 'page-students', 'page-settings', 'page-records'].map(h.element)
        : selector === '.nav-btn' ? ['testHomeNav', 'testStudentsNav'].map(h.element) : [];
    for (const name of ['updateSchoolCalendarAlert', 'renderEventsList', 'updateCurrentEventBadge', 'applyArchivedMode',
        'applyProgramFeatures', 'renderProgramSettings', 'sendGeneralTvSnapshot', 'renderHonorBoard']) h.ctx[name] = () => {};
    for (const id of ['eventPickerOverlay', 'smartModal', 'honorBoardModal']) h.element(id).classList.remove('flex');
    let listener;
    h.ctx.window.almahraPrograms.subscribe = callback => { listener = callback; };
    const subscription = html.match(/window\.almahraPrograms\.subscribe\(\(\) => \{[\s\S]*?\n[ \t]*\}\);/);
    assert.ok(subscription);
    h.run(subscription[0]);
    return Object.assign(h, {
        openHome: () => h.run("switchTab('page-home', document.getElementById('testHomeNav'))"),
        leaveHome: () => h.run("switchTab('page-students', document.getElementById('testStudentsNav'))"),
        notifyPrograms: () => listener()
    });
}
function performanceSettingsRoutes() {
    const h = performanceRoutes(settingsHarness());
    h.install('commitProgramSettings');
    h.ctx.window.almahraPrograms.updateSettings = async (program, settings) => {
        assert.equal(program, 'general'); h.state.writes.push(copy(settings)); return { success: true };
    };
    // لا تحديث طلاب: هذا هو مسار الحفظ الذي كشف تقرير Sol بقاء اللقطة فيه.
    h.ctx.syncGeneralHalaqaStudents = async () => true;
    return h;
}
const performanceSettingChanges = [
    { id: 'psNewGoalPerDay', value: '1', change: h => { h.state.settings.newGoalPerDay = 1; },
        check(model) { assert.equal(model.current.newPct, 38); assert.equal(model.weekly[2].totals.newPct, 38); } },
    { id: 'psFollowupAttendance', value: '70', change: h => { h.state.settings.followupLimits = { attendancePct: 70, newPct: 80 }; },
        check(model) { assert.deepEqual(copy(model.followup.attendance.map(row => row.halaqa.id)), ['a']); } },
    { id: 'psFollowupNew', value: '65', change: h => { h.state.settings.followupLimits = { attendancePct: 85, newPct: 65 }; },
        check(model) { assert.deepEqual(copy(model.followup.achievement.map(row => row.halaqa.id)), ['b']); } }
];

test('الحفظ الحقيقي للإعدادات يجدد الهدف وحدّي المتابعة فوراً، وresize يرسم النتيجة الجديدة بلا حساب', async () => {
    for (const change of performanceSettingChanges) {
        const h = performanceSettingsRoutes(); h.openHome();
        const old = h.element('generalPerformance').generalPerformanceSnapshot, counts = watchPerformance(h);
        h.resize(); h.element(change.id).value = change.value;
        await h.run('saveProgramSettings()');
        assert.equal(h.state.writes.length, 1); assert.equal(counts.calculations, 1);
        const snapshot = h.element('generalPerformance').generalPerformanceSnapshot;
        assert.notEqual(snapshot, old); change.check(snapshot.model);
        let drawnModel;
        const draw = h.ctx.renderGeneralPerformanceCharts;
        h.ctx.renderGeneralPerformanceCharts = model => { drawnModel = model; return draw(model); };
        h.resize(); h.flushFrame();
        assert.equal(drawnModel, snapshot.model); assert.equal(counts.calculations, 1);
        assert.match(h.element('generalAttendanceCard').innerHTML, /حضورها أقل من/);
        if (change.id === 'psNewGoalPerDay') assert.match(h.element('generalAchievementCard').innerHTML, /gh-kpi-value">٣٨٪/);
        if (change.id === 'psFollowupAttendance') assert.doesNotMatch(h.element('generalAttendanceCard').innerHTML, /حلقة ج — الأستاذ صالح/);
        if (change.id === 'psFollowupNew') assert.doesNotMatch(h.element('generalAchievementCard').innerHTML, /حلقة ج — الأستاذ صالح/);
    }
});

test('مستمع البرامج الحقيقي يجدد تغيّر الهدف والحدّين والتقويم قبل أي رسم عند resize', () => {
    const calendarChange = { change: h => h.state.season.calendar.push({ from: '2026-11-18', to: '2026-11-18', name: 'إجازة اختبار' }),
        check(model) { assert.equal(model.current.attendancePct, 74); assert.equal(model.current.newPct, 70); assert.ok(model.daily.every(row => row.date !== '2026-11-18')); } };
    for (const change of [...performanceSettingChanges, calendarChange]) {
        const h = performanceRoutes(); h.openHome();
        const old = h.element('generalPerformance').generalPerformanceSnapshot, counts = watchPerformance(h);
        h.resize(); change.change(h); h.notifyPrograms();
        const snapshot = h.element('generalPerformance').generalPerformanceSnapshot;
        assert.notEqual(snapshot, old); assert.equal(counts.calculations, 1); change.check(snapshot.model);
        h.resize(); h.flushFrame();
        assert.equal(counts.calculations, 1); assert.equal(counts.drawings, 2);
    }
});

test('الحفظ والمستمع خارج الرئيسية يبطلان اللقطة بلا حساب حتى التنقل الحقيقي إليها', async () => {
    for (const route of ['save', 'subscription']) for (const change of performanceSettingChanges) {
        const h = performanceSettingsRoutes(); h.openHome(); h.resize(); h.leaveHome();
        const counts = watchPerformance(h);
        if (route === 'save') { h.element(change.id).value = change.value; await h.run('saveProgramSettings()'); }
        else { change.change(h); h.notifyPrograms(); }
        assert.equal(h.element('generalPerformance').generalPerformanceSnapshot, null);
        h.resize(); h.flushFrame();
        assert.deepEqual(counts, { calculations: 0, totals: 0, drawings: 0, charts: 0 });
        h.openHome();
        assert.equal(counts.calculations, 1); change.check(h.element('generalPerformance').generalPerformanceSnapshot.model);
        h.resize(); h.flushFrame(); assert.equal(counts.calculations, 1);
    }
});

test('فتح الرئيسية عبر switchTab يحسب دائماً من البيانات الحالية حتى دون إشعار برامج', () => {
    const h = performanceRoutes(); h.openHome(); h.leaveHome();
    const counts = watchPerformance(h);
    h.state.settings.newGoalPerDay = 1;
    h.openHome();
    assert.equal(counts.calculations, 1);
    assert.equal(h.element('generalPerformance').generalPerformanceSnapshot.model.current.newPct, 38);
    h.openHome(); assert.equal(counts.calculations, 2);
});

test('حفظ التقويم الحقيقي يبطل اللقطة، ويجددها بالتحديث الحالي أو عند فتح الرئيسية', async () => {
    for (const visible of [true, false]) {
        const h = performanceRoutes(); h.openHome();
        if (!visible) h.leaveHome();
        const counts = watchPerformance(h), next = copy(h.state.season);
        next.calendar.push({ id: 'holiday-test', from: '2026-11-18', to: '2026-11-18', name: 'إجازة اختبار', kind: 'official' });
        Object.assign(h.ctx, { structuredClone, canWriteCloud: () => true, collectSeasonCalendar: () => copy(next),
            validateSeasonCalendar: () => ({ overlaps: [] }), redrawSeasonCalendar() {}, showToast() {} });
        h.ctx.window.almahraAuth = { currentUser: { uid: 'synthetic-admin' } };
        h.ctx.window.almahraPrograms.updateSeasonCalendar = async () => ({ success: true });
        h.ctx.calendarDraftFixture = { seasonId: h.state.season.id, expected: copy(h.state.season) };
        h.run('let seasonCalendarDraft = calendarDraftFixture;');
        for (const name of ['updateGeneralAttendanceUI', 'renderCompactTripGrid', 'renderStudentsGrid', 'renderSettingsStudents',
            'renderReportsTable', 'processRealClockPomodoro', 'updateThreeKnightsSelects', 'renderExamEntryList', 'renderExamResultsReport']) h.ctx[name] = () => {};
        h.install('saveSeasonCalendar', 'updateAllUIs');
        await h.run('saveSeasonCalendar()');
        assert.equal(counts.calculations, visible ? 1 : 0);
        if (!visible) { assert.equal(h.element('generalPerformance').generalPerformanceSnapshot, null); h.openHome(); }
        const model = h.element('generalPerformance').generalPerformanceSnapshot.model;
        assert.equal(model.current.attendancePct, 74); assert.equal(model.current.newPct, 70);
        assert.ok(model.daily.every(row => row.date !== '2026-11-18'));
        h.resize(); h.flushFrame(); assert.equal(counts.calculations, 1);
    }
});
