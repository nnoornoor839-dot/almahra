const vm = require('node:vm');
const { source, html, QuranMeasure, generalEntryPoints, copy } = require('./quick-entry-harness.cjs');
const key = require('../rules/knights-answer-key.json');
function entry(row, settings = key.settings) {
    const passage = key.passages[row.passage];
    const spec = { from: [passage.from.surah, passage.from.ayah], to: [passage.to.surah, passage.to.ayah] };
    const m = QuranMeasure.measure({ spec });
    const score = generalEntryPoints({ lines: m.lines, kind: row.kind, gradeId: row.grade, settings });
    return { ...row, spec, iv: m.intervals, mult: score.mult, points: score.points, rep: 1 };
}
function fixtures(variant) {
    return key.students.map(row => {
        const history = {};
        row.days.forEach((d, i) => {
            if (d.state === 'unrecorded') return;
            if (d.state === 'absent') { history[d.date] = { attended: false, absence: 'unexcused' }; return; }
            const settings = variant && row.halaqaId === 'e' && (variant === 'bothTwo' || i >= 2)
                ? { ...key.settings, kindMult: key.variants[variant].kindMult } : key.settings;
            history[d.date] = { attended: true, entries: Object.fromEntries(d.entries.map((e, n) => ['e' + n, entry(e, settings)])),
                criteria: copy(d.criteria), criteriaPoints: Object.values(d.criteria).reduce((a, b) => a + b, 0), groupDisciplinePoints: d.groupDisciplinePoints };
        });
        return { id: row.id, name: row.name, halaqaId: row.halaqaId, history, ...('joinedOn' in row ? { joinedOn: row.joinedOn } : {}) };
    });
}
const functions = ['roundPointTotal', 'dayPoints', 'dayHasBlockingViolation', 'dayAcceptedWeightTenths', 'topTiedBy', 'knightsEligibilityStart',
    'getDayHalaqaKnights', 'knightsSchoolDates', 'knightsAttendanceState', 'knightsDayPointsTenths', 'knightsIdentityOrder',
    'getWeekNominations', 'rankHalaqaWeekKnights', 'buildWeekKnightsRow', 'knightsDaysText', 'knightsRankName', 'buildRevealSteps',
    'knightsMessageLines', 'buildWeeklyKnightsAnnouncement', 'buildGeneralWeeklyMessage'];
function harness(variant) {
    const list = fixtures(variant), settings = { ...copy(key.settings), season: copy(key.season) };
    if (variant) settings.kindMult = copy(key.variants[variant].kindMult);
    class ExplicitDate extends Date { constructor(...args) { if (!args.length) throw Error('clock read'); super(...args); } static now() { throw Error('clock read'); } }
    const ctx = vm.createContext({ QuranMeasure, Date: ExplicitDate });
    for (const name of ['ivPairs', 'measureEntry']) vm.runInContext(html.match(new RegExp('const ' + name + ' = .*;'))[0], ctx);
    for (const name of functions) vm.runInContext(name === 'dayPoints' ? html.match(/const dayPoints = .*;/)[0] : source(name), ctx);
    for (const name of ['students', 'todayStr', 'honorKnightsLog', 'window', 'getProgramSettings', 'getBlockingCriteriaIds', 'getAttendanceState', 'measureReady'])
        Object.defineProperty(ctx, name, { get() { throw Error('mutable global read: ' + name); } });
    const call = (name, ...args) => { ctx.args = args; return copy(vm.runInContext(name + '(...args)', ctx)); };
    const range = { startStr: key.days[0], endStr: key.days[3] }, approvals = [copy(key.manualApproval)];
    const row = (id, input = list) => call('buildWeekKnightsRow', range, settings.halaqas.find(h => h.id === id), input, approvals, settings);
    return { list, settings, approvals, range, ctx, call, row };
}
module.exports = { harness, fixtures, entry, functions };
