// اعتماديات العرض الحقيقية للحواضن التي تستخرج دوال index منفردة.
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
function installTv(run, install) {
    run(html.match(/const generalTv = .*;/)[0]);
    install('tvNameWords', 'tvDisplayName', 'getGeneralTvLeaders', 'getGeneralCelebrationRank', 'getGeneralTvSnapshot',
        'generalTvContext', 'generalTvReady', 'postGeneralTv', 'sendGeneralTvSnapshot', 'clearGeneralTv', 'enableGeneralTv',
        'initGeneralTv', 'openGeneralTv', 'sendGeneralTvCelebration', 'cancelGeneralTvCelebration', 'readGeneralTvPrayer');
}
module.exports = { installTv };
