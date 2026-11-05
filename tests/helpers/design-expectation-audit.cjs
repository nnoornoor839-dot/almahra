const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const baseline = '82bf19f';
function changes(file) {
    const before = cp.execFileSync('git', ['show', `${baseline}:${file}`], { cwd: root, encoding: 'utf8' }).split(/\r?\n/);
    const after = fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/);
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
const ownerText = line => line.replaceAll('أكملهم ←', 'أكمل التسجيل ←')
    .replace('>⌄/', '><i class="fas fa-caret-down"><\\/i>/');
module.exports = { root, baseline, changes, digits, ownerText };
