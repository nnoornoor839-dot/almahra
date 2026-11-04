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
    const element = id => {
        if (elements.has(id)) return elements.get(id);
        const classes = new Set();
        const el = { id, style: {}, dataset: {}, innerHTML: '', textContent: '',
            classList: { add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n)),
                contains: n => classes.has(n), toggle(n, on = !classes.has(n)) { if (on) classes.add(n); else classes.delete(n); } } };
        elements.set(id, el); return el;
    };
    for (const match of productionHtml.matchAll(/<\w+\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
        const el = element(match[2]);
        for (const cls of /\bclass="([^"]*)"/.exec(match[1])?.[1].split(/\s+/) || []) el.classList.add(cls);
        if (/display:\s*none/.test(match[1])) el.style.display = 'none';
    }
    const ctx = vm.createContext({ console, Date, Intl, document: { getElementById: element },
        window: { almahraPrograms: { getCurrentProgramId: () => state.program, isCurrentSeasonArchived: () => state.archived,
            getCurrentSeason: () => state.season, getCurrentSeasonId: () => state.season.id, getCurrentProgram: () => ({ name: 'برنامج وهمي' }) } },
        getProgramSettings: () => state.settings, goHome: id => state.navigation.push(id), goRecords: id => state.navigation.push(id),
        normalizeSaudiPhone: () => null, closeGeneralAbsenceModal() {}, initHadithTilt() {}, programBrandName: () => 'البرنامج العام',
        tiersFeatureOn: () => false, getTiers: () => [], formatGeneralUnit: n => String(n),
        renderHomeCare: () => { element('homeCare').innerHTML = 'legacy care'; },
        renderHomeLeaders: () => { element('homeLead').innerHTML = 'legacy leaders'; },
        computeComplexStats: () => ({ studentCount: list.length, todayPct: 50, presentToday: 1, absentToday: 1, ayahs: 2, pages: 3,
            quarters: 4, juzs: 5, hizbs: 6, chronic: 0 }), fixtures: list });
    const run = code => vm.runInContext(code, ctx);
    run(`let students = fixtures, todayStr = '${initialToday}';
        const FOLLOWUP_MIN_STREAK = 2, CHRONIC_MIN_STREAK = 3;
        const ALL_DAY_NAMES = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
        let generalHomeExpanded = { context: '', stalled: false, support: false };`);
    const install = (...names) => names.forEach(name => run(source(name, productionHtml)));
    install('isGeneralProgram', 'getStudentHalaqa', 'escapeHTML', 'countLabel', 'schoolCivilDate', 'formatDateLocal',
        'getWeekStartDate', 'isSeasonCalendarComplete', 'isWorkingDay', 'getSchoolDayInfo', 'getAttendanceState',
        'generalAttendanceStart', 'getGeneralSchoolDates', 'getWorkingDaysList', 'getConsecutiveAbsenceStreak',
        'getFollowupAbsentees', 'getGeneralUnrecordedDays', 'updateGeneralAttendanceUI', 'renderHomeDashboard');
    if (productionHtml === html) install('generalTodaySummary', 'generalStalledMemorization', 'generalRecitationSupport',
        'generalHomeDaysLabel', 'generalHomeHalaqaName', 'generalHomeFollowupText', 'generalTodayCardHtml',
        'generalHomeWhatsapp', 'generalHomeFollowupCard', 'renderGeneralHome', 'expandGeneralHomeList');
    return { state, list, ctx, run, element, install,
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
test('التنبيه يبقى كما كان: اليوم والأيام السابقة من الأسبوع نفسه', () => {
    const h = harness([{ name: 'وهمي', halaqaId: 'a', history: { '2026-11-15': { attended: true } } }], '2026-11-18');
    h.run('updateGeneralAttendanceUI()'); const bar = h.element('generalUnrecordedAlert');
    assert.equal(bar.classList.contains('hidden'), false);
    assert.match(bar.innerHTML, /2026-11-17/); assert.match(bar.innerHTML, /2026-11-18.*اليوم/);
    h.run(`todayStr = '${key.today}'; updateGeneralAttendanceUI()`);
    assert.equal(bar.classList.contains('hidden'), false);
    assert.match(bar.innerHTML, /2026-11-22.*اليوم/); assert.doesNotMatch(bar.innerHTML, /2026-11-17/);
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
test('general يخفي الحديث والمربعات والمتصدرين ويحذف زر قائمة الغياب، ولا يبني الأداء', () => {
    const h = harness(); h.run('renderHomeDashboard(); updateGeneralAttendanceUI()');
    for (const id of ['homeVerse', 'homeDashboard', 'homeLead', 'homeExtras']) assert.equal(h.element(id).style.display, 'none');
    assert.equal(h.element('homeDashboard').innerHTML, '');
    assert.equal(h.element('generalAttendanceTools').classList.contains('hidden'), true);
    const homeHtml = html.split('id="page-home"')[1].split('<!-- Pomodoro Tab -->')[0];
    assert.doesNotMatch(homeHtml, /قائمة الغياب|onclick="openGeneralTv|onclick="openGeneralWeeklySheetModal|الأداء|للتجربة|نموذج ببيانات وهمية/);
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
