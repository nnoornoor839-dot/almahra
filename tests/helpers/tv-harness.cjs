// اعتماديات العرض الحقيقية للحواضن التي تستخرج دوال index منفردة.
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
function installTv(run, install) {
    run(html.match(/const generalTv = .*;/)[0]);
    run("const weekKnightsState = new Map(), weekKnightsTvLocks = new Set();");
    run("const weekKnightsChecks = new Map(), weekKnightsPending = new Map();");
    run(html.match(/const KNIGHTS_GUARD_ERROR = .*;/)[0]);
    install('knightsFreezeCheckKey', 'ensureWeekKnightsFrozen', 'knightsToday', 'knightsStoredSeason', 'knightsPreviousWeekStart', 'getLockedWeekKnights', 'lockWeekRows');
    install('knightsIdentityOrder', 'knightsDayPointsTenths', 'knightsAttendanceState', 'knightsDaysText', 'knightsRankName', 'knightsMessageRow', 'knightsMessageLines', 'readKnightsPerHalaqa', 'dayAcceptedWeightTenths', 'topTiedBy', 'getDayHalaqaKnights', 'getBlockingCriteriaIds', 'dayHasBlockingViolation', 'tvNameWords', 'tvDisplayName', 'getGeneralTvLeaders', 'getGeneralTvPeriod', 'getGeneralTvBoard',
        'generalPerformanceSettings', 'getGeneralCelebrationRank', 'getHomePrepWeek', 'getGeneralTvSnapshot',
        'generalTvContext', 'generalTvReady', 'postGeneralTv', 'sendGeneralTvSnapshot', 'clearGeneralTv', 'enableGeneralTv',
        'initGeneralTv', 'openGeneralTv', 'sendGeneralTvCelebration', 'cancelGeneralTvCelebration', 'readGeneralTvPrayer');
    for (const name of ['formatDateLocal', 'getWeekStartDate', 'addDaysToDateStr', 'getTiers', 'studentTierId', 'getTierById', 'noLevelReason', 'getStudentHalaqa', 'generalAttendanceStart', 'calculateStudentAttendance', 'getGeneralAttendanceEligibility', 'getAttendanceState'])
        if (!run(`typeof ${name} === 'function'`)) install(name);
}
// قفل العرض الكامل كان للجولتين السابقتين؛ الآن يبقى قفل المنطق والاعتماديات المحلية.
function tvInvariant(file, source) {
    source = require('./board-invariants.cjs').beforeBoard(source, file);
    if (file === 'tv.js') return source.split("if (typeof document !== 'undefined')")[0];
    if (file === 'tv.html') return [...source.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]).join('\n');
    return source;
}
module.exports = { installTv, tvInvariant };
