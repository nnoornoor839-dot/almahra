const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const baseline = '82bf19f';
function changesFrom(file, baseline) {
    const before = cp.execFileSync('git', ['show', `${baseline}:${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }).split(/\r?\n/);
    let currentText = fs.readFileSync(path.join(root, file), 'utf8');
    if (baseline === '186a18e' || baseline === 'd51bb42') {
        // الفئة 12 تُعكس أولاً، فيرى تدقيق الفئة 11 نسخة d51bb42 بالضبط.
        const text = baseline === 'd51bb42' ? currentText : require('./knights-oneplace-audit.cjs').beforeKnightsOnePlace(currentText, file);
        const diff = text === currentText ? cp.execFileSync('git', ['diff', '--no-ext-diff', '--unified=0', baseline, '--', file], { cwd: root, encoding: 'utf8' })
            : diffAgainstText(baseline, file, text);
        const hunks = []; let hunk;
        for (const line of diff.split(/\r?\n/)) {
            const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
            if (match) { hunk = { oldLine: +match[1] + (match[2] === '0' ? 1 : 0), newLine: +match[3] + (match[4] === '0' ? 1 : 0), before: [], after: [] }; hunks.push(hunk); }
            else if (hunk && line.startsWith('-')) hunk.before.push(line.slice(1));
            else if (hunk && line.startsWith('+')) hunk.after.push(line.slice(1));
        }
        return { file, hunks };
    }
    if (baseline === '55fd33e') return diffLines(file, before, require('./knights-owner-auto-audit.cjs').beforeKnightsOwnerAuto(currentText, file).split(/\r?\n/));
    currentText = require('./general-knights-cleanup-audit.cjs').beforeGeneralKnightsCleanup(currentText, file);
    if (!['2d78da2', '9f2224d'].includes(baseline)) currentText = require('./knights-release-audit.cjs').beforeKnightsRelease(currentText, file);
    if (!['0c5ec91', '2d78da2', '9f2224d'].includes(baseline)) currentText = require('./board-invariants.cjs').beforeKnightsRound2b(currentText, file);
    if (!['82bf19f', '0c5ec91', '2d78da2', '9f2224d'].includes(baseline)) {
        const rows = require('../rules/design-expectation-audit.json').knightsRound2bExpectationChanges || [];
        const lines = currentText.split(/\r?\n/);
        for (const hunk of rows.filter(row => row.file === file).reverse()) {
            require('node:assert/strict').deepEqual(lines.slice(hunk.newLine - 1, hunk.newLine - 1 + hunk.after.length), hunk.after);
            lines.splice(hunk.newLine - 1, hunk.after.length, ...hunk.before);
        }
        currentText = lines.join('\n');
    }
    return diffLines(file, before, currentText.split(/\r?\n/));
}
function diffAgainstText(baseline, file, text) {
    const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'almahra-audit-'));
    try {
        fs.writeFileSync(path.join(dir, 'a'), cp.execFileSync('git', ['show', `${baseline}:${file}`], { cwd: root, maxBuffer: 4 * 1024 * 1024 }));
        fs.writeFileSync(path.join(dir, 'b'), text);
        try { return cp.execFileSync('git', ['diff', '--no-index', '--no-ext-diff', '--unified=0', 'a', 'b'], { cwd: dir, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }); }
        catch (error) { if (error.status === 1) return error.stdout; throw error; }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
function diffLines(file, before, after) {
    const width = after.length + 1, scores = new Uint16Array((before.length + 1) * width);
    for (let i = before.length - 1; i >= 0; i--) for (let j = after.length - 1; j >= 0; j--)
        scores[i * width + j] = before[i] === after[j] ? scores[(i + 1) * width + j + 1] + 1
            : Math.max(scores[(i + 1) * width + j], scores[i * width + j + 1]);
    const hunks = [];
    for (let i = 0, j = 0; i < before.length || j < after.length;) {
        if (i < before.length && j < after.length && before[i] === after[j]) { i++; j++; continue; }
        const hunk = { oldLine: i + 1, newLine: j + 1, before: [], after: [] };
        while (i < before.length || j < after.length) {
            if (i < before.length && j < after.length && before[i] === after[j]) break;
            if (j >= after.length || (i < before.length && scores[(i + 1) * width + j] >= scores[i * width + j + 1])) hunk.before.push(before[i++]);
            else hunk.after.push(after[j++]);
        }
        hunks.push(hunk);
    }
    return { file, hunks };
}
const digits = line => line.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replaceAll('٫', '.').replaceAll("'ar-SA'", "'ar-SA-u-nu-latn'").replaceAll("'ar-SA-u-ca-islamic'", "'ar-SA-u-ca-islamic-nu-latn'")
    .replace("preview.total.toLocaleString('ar-SA-u-nu-latn')", "preview.total.toLocaleString('ar-SA-u-nu-latn').replace('.', '\\\\.')");
const ownerText = (line, round = 1) => round === 2
    ? line.replace("    const newToast = \"showToast(savedSummary.replace(/^حُفظ: /, `حُفظ ل${student.name}: `) + (missed ? ` — على يوم ${dayName}` : ''), 'success');\";", "    const newToast = \"showToast(`حُفظ ل${student.name}: ${savedSummary.replace(/^حُفظ:?\\\\s*/, '')}` + (missed ? ` — على يوم ${dayName}` : ''), 'success');\";")
        .replace('حُفظ: ', 'حُفظ لطالب وهمي: ')
        .replace('حُفظ موضع الطالب', 'حُفظ لطالب وهمي: موضع الطالب')
        .replace('حُفظ الحضور فقط', 'حُفظ لطالب وهمي: الحضور فقط')
        .replace('حُفظ الحضور، والانضباط ٨', 'حُفظ لطالب وهمي: الحضور، والانضباط 8')
        .replace("h.element('generalQuickSaveBtn').textContent,/Enter/", "h.element('generalQuickSaveBtn').innerHTML,/<small>Enter ↵<\\/small>/")
        .replace('a.messages.at(-1).message, /قبل البداية/', 'a.fieldMessages[kind], /قبل البداية/')
        .replace("a.messages.at(-1).message, bad === 'blank'", "a.fieldMessages.new, bad === 'blank'")
        .replace('h.state.messages.at(-1).message, /تغيّر آخر جديد/', "h.element('quick_new_message').textContent, /تغيّر آخر جديد/")
        .replace('<label>من 🔒<\\/label>', '<label>من <i class="fas fa-lock qe-lock-icon" aria-hidden="true"><\\/i><\\/label>')
    : line.replaceAll('أكملهم ←', 'أكمل التسجيل ←')
    .replace('>⌄/', '><i class="fas fa-caret-down"><\\/i>/');
const changes = file => changesFrom(file, baseline);
module.exports = { root, baseline, changes, changesFrom, digits, ownerText };
