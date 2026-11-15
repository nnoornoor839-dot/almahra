// بطاقة 2-10 (بحث السورة بالكتابة) و2-9 (رقم الآية فوق آخر السورة يرجع لآخرها) — اختبار القبول، 2026-11-16.
// المرجع: D:\المهره\notes\features\engine\surah-search-card.md (§3 المواصفة، §4 الأمثلة س1–س19؛ س20 صور وس21 المجموعة ليسا هنا).
// س17 منقول من tests/page-field-local.test.cjs على الفرع page-field (ق11–ق18) بلا أي شيء عن الصفحة.
// دوال الإنتاج عبر الهاركنس؛ كل كتابة إلى سحابة وهمية. التطبيع المرجعي هنا مستقل عن normalizeSurahQuery.
//
// افتراضات الاختبار فيما لم تسمّه البطاقة (تُذكر في التقرير ليقرّها Fable):
//   • حقل البحث: #<معرّف الـselect>_search (من البطاقة).
//   • القائمة المخصصة: #<معرّف الـselect>_list، وكل نتيجة عنصر (div/button) فيه data-surah="رقم السورة".
//   • النتيجة المظلَّلة: صنف active أو aria-selected="true".
//   • زر السهم ▾: عنصر BUTTON شقيق لحقل البحث (الأب نفسه)، أو #<معرّف الـselect>_toggle.
//   • الأحداث: تُطلق بـ dispatchEvent إن وُجدت على العنصر، وإلا بالخاصية on<type> (oninput/onkeydown/onclick/onblur…).
//   • «النقر خارج القائمة» = blur ثم focusout على حقل البحث (الهاركنس بلا مستمعات على document).
'use strict';
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { harness, student, copy, html, root } = require('./helpers/quick-entry-harness.cjs');

const metaCtx = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(root, 'quran/quran-meta.js'), 'utf8'), metaCtx);
const META = metaCtx.window.QURAN_META;
const TITLES = META.titles; // الاسم كما في القائمة (بالتشكيل وبادئة «سُورَةُ»)
const ayahsOf = s => META.surahs[s - 1][1];

// ===== التطبيع المرجعي المستقل (قاعدة §3-1 حرفياً، ومعها ٱ ← ا لأن عنوان الفاتحة فيه ألف وصل) =====
const refNormalize = text => String(text)
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ').trim().replace(/^سوره(?:\s+|$)/, '').trim();
const refStripAl = text => text.replace(/^ال/, '').trim();
const REF_NAMES = TITLES.map(t => refStripAl(refNormalize(t)));
// البادئة أولاً (بترتيب المصحف) ثم الاحتواء.
function refMatches(query) {
    const q = refStripAl(refNormalize(query));
    if (!q) return [];
    const prefix = [], contains = [];
    REF_NAMES.forEach((name, i) => {
        if (name.startsWith(q)) prefix.push(i + 1);
        else if (name.includes(q) || refNormalize(TITLES[i]).includes(q)) contains.push(i + 1);
    });
    return [...prefix, ...contains];
}

// ===== أدوات =====
const down = (extra = {}) => student({}, { direction: 'down', lastSurah: 2, lastAyah: 5, ...extra }); // جديده يبدأ البقرة 6
const up = (extra = {}) => student({}, { direction: 'up', lastSurah: 78, lastAyah: 20, ...extra }); // جديده يبدأ النبأ 21
const get = (h, id) => h.ctx.document.getElementById(id);
function field(h, id) {
    const el = get(h, id);
    assert.ok(el, `العنصر غير موجود: #${id}`);
    return el;
}
function need(h, name) {
    try { h.install(name); } catch { assert.fail(`الدالة غير معرّفة في index.html: ${name}`); }
}
const matches = (h, query) => { need(h, 'surahMatches'); return copy(h.run(`surahMatches(${JSON.stringify(query)})`)).map(Number); };
const normalized = (h, text) => { need(h, 'normalizeSurahQuery'); return h.run(`normalizeSurahQuery(${JSON.stringify(text)})`); };
function searchOf(h, selectId) {
    need(h, 'mountSurahPicker');
    return field(h, `${selectId}_search`);
}
function fire(el, type, extra = {}) {
    const event = { type, target: el, currentTarget: el, isComposing: false, defaultPrevented: false, bubbles: true,
        preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, stopImmediatePropagation() {}, ...extra };
    if (typeof el.dispatchEvent === 'function') el.dispatchEvent(event);
    else if (typeof el['on' + type] === 'function') el['on' + type].call(el, event);
    return event;
}
const press = (el, key) => fire(el, 'keydown', { key });
const tap = el => { fire(el, 'mousedown'); fire(el, 'mouseup'); fire(el, 'click'); };
function typeSearch(h, selectId, text) {
    const el = searchOf(h, selectId);
    el.value = text;
    fire(el, 'input');
    return el;
}
function descendants(el, out = []) {
    for (const child of el?.children || []) { out.push(child); descendants(child, out); }
    return out;
}
const listOf = (h, selectId) => get(h, `${selectId}_list`);
const itemsOf = (h, selectId) => descendants(listOf(h, selectId)).filter(el => el.dataset?.surah !== undefined && el.dataset.surah !== '');
const surahsShown = (h, selectId) => itemsOf(h, selectId).map(el => Number(el.dataset.surah));
const isHighlighted = el => el.classList.contains('active') || el.attrs?.['aria-selected'] === 'true';
const listOpen = (h, selectId) => {
    const list = listOf(h, selectId);
    return !!list && list.checkVisibility() && itemsOf(h, selectId).length > 0;
};
const listText = (h, selectId) => [listOf(h, selectId), ...descendants(listOf(h, selectId))].filter(Boolean).map(el => el.textContent || '').join(' ');
function arrowOf(h, selectId) {
    const search = searchOf(h, selectId);
    const sibling = (search.parentNode?.children || []).find(el => el !== search && el.tagName === 'BUTTON');
    const arrow = sibling || get(h, `${selectId}_toggle`);
    assert.ok(arrow, `زر السهم ▾ غير موجود بجانب #${selectId}_search`);
    return arrow;
}
// اختيار بالبحث: كتابة ثم Enter على المظلَّلة.
function pick(h, selectId, text) {
    const el = typeSearch(h, selectId, text);
    press(el, 'Enter');
    return el;
}
const point = (h, kind, edge) => [Number(h.element(`quick_${kind}_${edge}Surah`).value), Number(h.element(`quick_${kind}_${edge}Ayah`).value)];
function tagOf(markup, id) {
    const m = new RegExp(`<(input|select)\\b[^>]*\\bid="${id}"[^>]*>`).exec(markup);
    return m ? m[0] : null;
}
const attr = (tag, name) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag || '')?.[1];
const call = text => (text || '').replace(/\s+/g, '').replace(/"/g, "'");
const panels = h => h.element('generalQuickPanels').innerHTML;
function typeAyah(h, kind, edge, value) {
    const el = field(h, `quick_${kind}_${edge}Ayah`);
    need(h, 'quickAyahInput');
    el.value = String(value);
    h.run(`quickAyahInput('${kind}', '${edge}')`);
    return el;
}
function chooseSurah(h, kind, edge, surah) {
    h.element(`quick_${kind}_${edge}Surah`).value = String(surah);
    h.run(`quickSurahChanged('${kind}', '${edge}')`);
}

// ===== المرجع المستقل نفسه يطابق أرقام البطاقة =====
test('المرجع المستقل للتطبيع والترتيب يعطي أرقام س1–س8 المكتوبة في البطاقة (عدا س2: انظر التقرير)', () => {
    assert.equal(refMatches('أحز')[0], 33);
    assert.equal(refMatches('جمع')[0], 62);
    for (const q of ['الأح', 'اح', 'أح']) assert.deepEqual(refMatches(q).slice(0, 2), [33, 46], q);
    for (const q of ['بقر', 'البقرة', 'سورة البقرة']) assert.equal(refMatches(q)[0], 2, q);
    assert.equal(refMatches('عمران')[0], 3);
    for (const q of ['فاتحه', 'الفاتحة']) assert.equal(refMatches(q)[0], 1, q);
    for (const q of ['xyz', 'ق ق']) assert.deepEqual(refMatches(q), [], q);
    assert.equal(ayahsOf(33), 73);
});

// ===== 2-10 بحث السورة: س1–س16 =====
test('س1 كتابة «أحز» في بحث «إلى» بالجديد ← الأحزاب أولاً ومظلَّلة؛ Enter ← القيمة 33، الحقل يعرض الاسم كما في القائمة، التركيز في الآية، max = 73', () => {
    const h = harness(down());
    const search = searchOf(h, 'quick_new_toSurah');
    assert.equal(search.attrs?.autocomplete ?? search.autocomplete, 'off', 'autocomplete=off');
    assert.equal(search.attrs?.['aria-label'] ?? search.ariaLabel, 'بحث السورة', 'aria-label');
    typeSearch(h, 'quick_new_toSurah', 'أحز');
    assert.equal(listOpen(h, 'quick_new_toSurah'), true, 'القائمة لم تظهر');
    const items = itemsOf(h, 'quick_new_toSurah');
    assert.equal(Number(items[0].dataset.surah), 33);
    assert.ok(items[0].textContent.includes('33') && items[0].textContent.includes(TITLES[32]), `النتيجة: ${items[0].textContent}`);
    assert.equal(isHighlighted(items[0]), true, 'المطابقة الأولى غير مظلَّلة');
    assert.equal(items.filter(isHighlighted).length, 1);
    press(search, 'Enter');
    assert.equal(h.element('quick_new_toSurah').value, '33');
    assert.equal(search.value, TITLES[32]);
    assert.equal(search.value, 'سُورَةُ الأَحۡزَابِ');
    assert.equal(h.state.focus, 'quick_new_toAyah');
    assert.equal(Number(h.element('quick_new_toAyah').max), 73);
    assert.equal(listOpen(h, 'quick_new_toSurah'), false, 'القائمة لم تُغلق بعد الاختيار');
});

test('س2 «ياس» ← يس أولاً (36)', () => {
    const h = harness(down());
    assert.equal(matches(h, 'ياس')[0], 36);
    pick(h, 'quick_new_toSurah', 'ياس');
    assert.equal(h.element('quick_new_toSurah').value, '36');
});

test('س3 «جمع» ← الجمعة', () => {
    const h = harness(down());
    assert.equal(matches(h, 'جمع')[0], 62);
    pick(h, 'quick_new_toSurah', 'جمع');
    assert.equal(h.element('quick_new_toSurah').value, '62');
});

test('س4 «الأح» و«اح» و«أح» ← الأحزاب ثم الأحقاف (بترتيب المصحف)؛ «ال» والهمزات لا تفرّق', () => {
    const h = harness(down());
    assert.equal(normalized(h, 'الأحزاب'), 'الاحزاب');
    assert.equal(normalized(h, TITLES[32]), 'الاحزاب');
    assert.equal(normalized(h, 'إ آ ى ة'), 'ا ا ي ه');
    for (const q of ['الأح', 'اح', 'أح']) {
        assert.deepEqual(matches(h, q).slice(0, 2), [33, 46], q);
        typeSearch(h, 'quick_new_toSurah', q);
        assert.deepEqual(surahsShown(h, 'quick_new_toSurah').slice(0, 2), [33, 46], `القائمة لـ${q}`);
    }
});

test('س5 «بقر» و«البقرة» و«سورة البقرة» ← البقرة في الثلاث', () => {
    const h = harness(up());
    assert.equal(normalized(h, 'سورة البقرة'), 'البقره');
    assert.equal(normalized(h, TITLES[1]), 'البقره');
    for (const q of ['بقر', 'البقرة', 'سورة البقرة']) {
        assert.equal(matches(h, q)[0], 2, q);
        h.element('quick_new_toSurah').value = '78';
        pick(h, 'quick_new_toSurah', q);
        assert.equal(h.element('quick_new_toSurah').value, '2', q);
    }
});

test('س6 «عمران» ← آل عمران (احتواء) أولاً', () => {
    const h = harness(down());
    const list = matches(h, 'عمران');
    assert.equal(list[0], 3);
    assert.deepEqual(list, refMatches('عمران'));
    pick(h, 'quick_new_toSurah', 'عمران');
    assert.equal(h.element('quick_new_toSurah').value, '3');
});

// تعديل ~04:05 (قرار Fable بعد المراجعة المستقلة): س6ب وس22 وس23.
test('س6ب الاحتواء من وسط الاسم: «زاب» ← الأحزاب أولاً، و«مران» ← آل عمران أولاً', () => {
    const h = harness(down());
    assert.equal(matches(h, 'زاب')[0], 33);
    assert.equal(matches(h, 'مران')[0], 3);
});

test('س7 «فاتحه» (بهاء) و«الفاتحة» ← الفاتحة', () => {
    const h = harness(down());
    assert.equal(normalized(h, 'الفاتحة'), 'الفاتحه');
    for (const q of ['فاتحه', 'الفاتحة']) {
        assert.equal(matches(h, q)[0], 1, q);
        h.element('quick_review_fromSurah').value = '2';
        pick(h, 'quick_review_fromSurah', q);
        assert.equal(h.element('quick_review_fromSurah').value, '1', q);
    }
});

test('س8 «xyz» أو «ق ق» ← «لا سورة بهذا الاسم» ولا تغيير في القيمة', () => {
    for (const q of ['xyz', 'ق ق']) {
        const h = harness(down());
        assert.deepEqual(matches(h, q), [], q);
        const before = h.element('quick_new_toSurah').value;
        const search = typeSearch(h, 'quick_new_toSurah', q);
        assert.deepEqual(surahsShown(h, 'quick_new_toSurah'), [], q);
        assert.ok(listText(h, 'quick_new_toSurah').includes('لا سورة بهذا الاسم'), `سطر «لا سورة بهذا الاسم» غير ظاهر لـ${q}`);
        assert.equal(listOf(h, 'quick_new_toSurah').checkVisibility(), true, 'سطر «لا سورة» مخفي');
        press(search, 'Enter');
        assert.equal(h.element('quick_new_toSurah').value, before, q);
    }
});

test('س9 كتابة «أحز» ثم النقر خارج الحقل بلا اختيار ← الحقل يعود لاسم السورة المختارة، والقيمة لم تتغيّر', () => {
    const h = harness(down());
    assert.equal(h.element('quick_new_toSurah').value, '2');
    const search = typeSearch(h, 'quick_new_toSurah', 'أحز');
    assert.equal(listOpen(h, 'quick_new_toSurah'), true);
    fire(search, 'blur'); fire(search, 'focusout');
    assert.equal(search.value, TITLES[1]);
    assert.equal(h.element('quick_new_toSurah').value, '2');
    assert.equal(listOpen(h, 'quick_new_toSurah'), false, 'القائمة لم تُغلق');
});

test('س10 السهم ▾ ← قائمة 114 كاملة بالترتيب؛ النقر على «المُلك» ← 67', () => {
    const h = harness(down());
    tap(arrowOf(h, 'quick_new_toSurah'));
    assert.equal(listOpen(h, 'quick_new_toSurah'), true);
    assert.deepEqual(surahsShown(h, 'quick_new_toSurah'), Array.from({ length: 114 }, (_, i) => i + 1));
    const mulk = itemsOf(h, 'quick_new_toSurah').find(el => el.dataset.surah === '67');
    assert.ok(mulk.textContent.includes(TITLES[66]));
    tap(mulk);
    assert.equal(h.element('quick_new_toSurah').value, '67');
    assert.equal(searchOf(h, 'quick_new_toSurah').value, TITLES[66]);
    assert.equal(h.state.focus, 'quick_new_toAyah');
});

test('س11 ↓ ↓ Enter بعد «الأ» ← الخيار الثالث من المطابقات، والقائمة بأقصى 8 نتائج', () => {
    const h = harness(down());
    const expected = refMatches('الأ');
    assert.equal(expected[2], 8); // الأنفال
    assert.deepEqual(matches(h, 'الأ').slice(0, 8), expected.slice(0, 8));
    const search = typeSearch(h, 'quick_new_toSurah', 'الأ');
    assert.deepEqual(surahsShown(h, 'quick_new_toSurah'), expected.slice(0, 8));
    press(search, 'ArrowDown'); press(search, 'ArrowDown');
    const highlighted = itemsOf(h, 'quick_new_toSurah').filter(isHighlighted).map(el => Number(el.dataset.surah));
    assert.deepEqual(highlighted, [expected[2]]);
    press(search, 'Enter');
    assert.equal(h.element('quick_new_toSurah').value, String(expected[2]));
});

test('س12 اختيار سورة «إلى» عبر البحث ← آية «إلى» تُفرَّغ (السلوك القائم في quickSurahChanged)', () => {
    const h = harness(down());
    h.element('quick_new_toAyah').value = '10';
    pick(h, 'quick_new_toSurah', 'عمران');
    assert.equal(h.element('quick_new_toSurah').value, '3');
    assert.equal(h.element('quick_new_toAyah').value, '');
    assert.equal(Number(h.element('quick_new_toAyah').max), 200);
    h.element('quick_review_toAyah').value = '50';
    pick(h, 'quick_review_toSurah', 'ملك');
    assert.equal(h.element('quick_review_toSurah').value, '67');
    assert.equal(h.element('quick_review_toAyah').value, '');
});

test('س13 اختيار سورة «من» في المراجعة عبر البحث وآيتها 100 والسورة الجديدة 7 آيات ← الآية تُقصّ إلى 7', () => {
    const h = harness(down());
    chooseSurah(h, 'review', 'from', 2);
    h.element('quick_review_fromAyah').value = '100';
    pick(h, 'quick_review_fromSurah', 'فاتح');
    assert.equal(h.element('quick_review_fromSurah').value, '1');
    assert.equal(h.element('quick_review_fromAyah').value, '7');
    assert.equal(h.state.focus, 'quick_review_fromAyah');
});

test('س12/س13 الجزء القائم (كان أخضر ويبقى): تغيير سورة «إلى» بالقائمة يفرّغ آيتها، وتغيير سورة «من» يقصّها', () => {
    const d = harness(down());
    chooseSurah(d, 'new', 'to', 2);
    d.element('quick_new_toAyah').value = '286';
    chooseSurah(d, 'new', 'to', 3);
    assert.equal(d.element('quick_new_toAyah').value, '');
    assert.equal(Number(d.element('quick_new_toAyah').max), 200);
    d.element('quick_review_fromSurah').value = '2'; d.element('quick_review_fromAyah').value = '100';
    chooseSurah(d, 'review', 'from', 1);
    assert.equal(d.element('quick_review_fromAyah').value, '7');
});

test('س14 البحث نفسه في «آخر آية حفظها» و«تصحيح الموضع» ويطلق معالجيهما', () => {
    const h = harness(student()); // needsPosition
    assert.equal(h.run('generalQuickEntry.needsPosition'), true);
    h.element('quick_positionAyah').value = '5';
    pick(h, 'quick_positionSurah', 'بقر');
    assert.equal(h.element('quick_positionSurah').value, '2');
    assert.equal(searchOf(h, 'quick_positionSurah').value, TITLES[1]);
    assert.equal(h.element('quick_positionAyah').value, '', 'generalQuickPositionChanged(true) لم يُطلق');
    assert.equal(Number(h.element('quick_positionAyah').max), 286);
    assert.equal(h.state.focus, 'quick_positionAyah');

    const f = harness(up());
    f.run('renderGeneralFrontierFix(1)');
    f.element('frontierFixAyah').value = '300';
    pick(f, 'frontierFixSurah', 'بقر');
    assert.equal(f.element('frontierFixSurah').value, '2');
    assert.equal(searchOf(f, 'frontierFixSurah').value, TITLES[1]);
    assert.equal(Number(f.element('frontierFixAyah').max), 286, 'updateFrontierFixAyah لم يُطلق');
    assert.equal(f.element('frontierFixAyah').value, '286');
    assert.equal(f.state.focus, 'frontierFixAyah');
});

test('س15 ضبط القيمة برمجياً ثم refreshSurahPicker أو الفتح أو المسح ← الحقل يعرض الاسم الصحيح', () => {
    const h = harness(down());
    for (const id of ['quick_new_toSurah', 'quick_review_fromSurah', 'quick_review_toSurah'])
        assert.equal(searchOf(h, id).value, TITLES[Number(h.element(id).value) - 1], `عند الفتح: ${id}`);
    need(h, 'refreshSurahPicker');
    h.element('quick_new_toSurah').value = '33';
    h.run("refreshSurahPicker(document.getElementById('quick_new_toSurah'))");
    assert.equal(searchOf(h, 'quick_new_toSurah').value, TITLES[32]);
    // المسح يستعيد القيم الابتدائية، والحقل يتبعها.
    pick(h, 'quick_review_fromSurah', 'ملك');
    assert.equal(h.element('quick_review_fromSurah').value, '67');
    h.run("clearGeneralQuickSection('review')");
    const restored = h.element('quick_review_fromSurah').value;
    assert.notEqual(restored, '67');
    assert.equal(searchOf(h, 'quick_review_fromSurah').value, TITLES[Number(restored) - 1]);
    // إعادة الفتح.
    pick(h, 'quick_new_toSurah', 'ملك');
    h.reopen();
    assert.equal(searchOf(h, 'quick_new_toSurah').value, TITLES[Number(h.element('quick_new_toSurah').value) - 1]);
    // تصحيح الموضع بعد التعبئة.
    const f = harness(up());
    f.run('renderGeneralFrontierFix(1)');
    assert.equal(searchOf(f, 'frontierFixSurah').value, TITLES[Number(f.element('frontierFixSurah').value) - 1]);
    // آخر آية حفظها عند الفتح.
    const p = harness(student());
    assert.equal(searchOf(p, 'quick_positionSurah').value, TITLES[Number(p.element('quick_positionSurah').value) - 1]);
});

test('س16 كل الـ114: أول 3 حروف ← السورة ضمن الثماني الأولى؛ أول 4 حروف ← الأولى ما لم تشاركها سورة بالبادئة نفسها', t => {
    const h = harness(down());
    const failures = [], shared = [];
    for (let s = 1; s <= 114; s++) {
        const name = REF_NAMES[s - 1];
        for (const length of [3, 4]) {
            const query = name.slice(0, length);
            const group = REF_NAMES.map((n, i) => n.startsWith(query) ? i + 1 : 0).filter(Boolean);
            const got = matches(h, query), at = got.indexOf(s);
            if (length === 3 && (at < 0 || at > 7)) failures.push({ s, query, at, top: got.slice(0, 8) });
            if (length === 4) {
                if (group.length > 1) shared.push(`${s}:«${query}»←[${group.join(',')}]`);
                if (at < 0 || at >= group.length) failures.push({ s, query, at, group, top: got.slice(0, 8) });
            }
        }
    }
    t.diagnostic(`حالات البادئة المشتركة (4 حروف): ${shared.join(' · ')}`);
    assert.deepEqual(failures, []);
});

// ===== 2-9 الرجوع لآخر آية عند الكتابة: س17 = ق11–ق18 من بطاقة الصفحة بلا الصفحة =====
test('س17-ق11 كتابة 300 في آية «إلى» بالبقرة (نازل، جديد) عبر معالج oninput ← 286 فوراً، بلا رسالة خطأ، والمعاينة إلى البقرة 286', () => {
    const h = harness(down());
    for (const [kind, edge] of [['new', 'to'], ['review', 'from'], ['review', 'to']]) {
        const tag = tagOf(panels(h), `quick_${kind}_${edge}Ayah`);
        assert.equal(call(attr(tag, 'oninput')), call(`quickAyahInput('${kind}', '${edge}')`), `oninput لـ quick_${kind}_${edge}Ayah`);
    }
    h.grade('new');
    chooseSurah(h, 'new', 'to', 2);
    const el = typeAyah(h, 'new', 'to', 300);
    assert.equal(el.value, '286');
    assert.equal(h.element('quick_new_message').textContent, '');
    assert.equal(el.classList.contains('qe-error'), false);
    assert.match(h.element('generalQuickPreview').textContent, /الجديد: البقرة 6 ← البقرة 286/);
});

test('س17-ق12 كتابة 41 في آية «إلى» بالنبأ ← 40', () => {
    const h = harness(up());
    assert.equal(h.element('quick_new_toSurah').value, '78');
    assert.equal(typeAyah(h, 'new', 'to', 41).value, '40');
});

test('س17-ق13 كتابة 0 أو 2.5 أو فارغة عبر المعالج ← لا قصّ، ورسالة الرفض القائمة كما هي', () => {
    for (const [value, message] of [['0', /سورة النبأ فيها 40 آية — اكتب رقماً من 1 إلى 40/], ['2.5', /سورة النبأ فيها 40 آية — اكتب رقماً من 1 إلى 40/],
        ['', /آية النهاية فارغة — اكتب آخر آية سمّعها اليوم/], ['-3', /سورة النبأ فيها 40 آية — اكتب رقماً من 1 إلى 40/]]) {
        const h = harness(up()); h.grade('new');
        const el = typeAyah(h, 'new', 'to', value);
        assert.equal(el.value, value, `القيمة ${value} قُصّت`);
        h.preview();
        assert.match(h.element('quick_new_message').textContent, message, value);
    }
});

test('س17-ق14 ضبط .value = 999 مباشرة بلا معالج ثم المعاينة ← رسالة «سورة النبأ فيها 40 آية» كما اليوم', () => {
    const h = harness(up()); h.grade('new');
    h.element('quick_new_toAyah').value = '999'; h.preview();
    assert.equal(h.element('quick_new_toAyah').value, '999');
    assert.match(h.element('quick_new_message').textContent, /سورة النبأ فيها 40 آية — اكتب رقماً من 1 إلى 40/);
    assert.equal(h.element('quick_new_toAyah').classList.contains('qe-error'), true);
});

test('س17-ق15 بعد ق11: تغيير سورة «إلى» إلى آل عمران ← الآية تُفرَّغ (السلوك القائم)', () => {
    const h = harness(down());
    chooseSurah(h, 'new', 'to', 2);
    typeAyah(h, 'new', 'to', 300);
    assert.equal(h.element('quick_new_toAyah').value, '286');
    chooseSurah(h, 'new', 'to', 3);
    assert.equal(h.element('quick_new_toAyah').value, '');
});

test('س17-ق17 «آخر آية حفظها» (needsPosition): كتابة 300 في البقرة ← 286', () => {
    const h = harness(student());
    assert.equal(h.run('generalQuickEntry.needsPosition'), true);
    h.element('quick_positionSurah').value = '2'; h.run('generalQuickPositionChanged(true)');
    const el = h.element('quick_positionAyah'), handler = attr(tagOf(panels(h), 'quick_positionAyah'), 'oninput');
    assert.ok(handler, 'لا oninput على #quick_positionAyah');
    el.value = '300'; h.run(handler);
    assert.equal(el.value, '286');
});

test('س17-ق18 تصحيح الموضع: كتابة 300 في #frontierFixAyah بالبقرة ← 286 عند الكتابة لا عند تغيير السورة فقط', () => {
    const tag = /<input\b[^>]*\bid="frontierFixAyah"[^>]*>/.exec(html)?.[0];
    assert.ok(tag, 'العنصر غير موجود: #frontierFixAyah');
    const handler = attr(tag, 'oninput');
    assert.equal(call(handler), call('updateFrontierFixAyah()'), 'oninput على #frontierFixAyah');
    const h = harness(up());
    h.run('renderGeneralFrontierFix(1)');
    h.element('frontierFixSurah').value = '2'; h.run('updateFrontierFixAyah()');
    h.element('frontierFixAyah').value = '300'; h.run(handler);
    assert.equal(h.element('frontierFixAyah').value, '286');
});

// ===== س18–س19 =====
const normalizeIds = value => JSON.parse(JSON.stringify(value).replace(/e_\d+_[a-z0-9]{8}/g, 'ID'));
test('س18 التسجيل المحفوظ بعد اختيار بالبحث = التسجيل بعد اختيار بالقائمة (عدا المعرّف)', async () => {
    const viaSearch = harness(down()); viaSearch.run('Date.now = () => 1000');
    pick(viaSearch, 'quick_new_toSurah', 'عمران');
    assert.equal(viaSearch.element('quick_new_toSurah').value, '3');
    viaSearch.element('quick_new_toAyah').value = '10';
    viaSearch.grade('new'); viaSearch.preview(); await viaSearch.save();
    const direct = harness(down()); direct.run('Date.now = () => 1000');
    direct.range('new', null, [3, 10]); direct.grade('new'); direct.preview(); await direct.save();
    assert.equal(viaSearch.state.writes.length, 1);
    assert.equal(direct.state.writes.length, 1);
    assert.deepEqual(normalizeIds(viaSearch.state.writes[0].fields), normalizeIds(direct.state.writes[0].fields));
});

test('س19 لا عنصر صفحة في النافذة، ولا أثر لحقل الصفحة في index.html', () => {
    const h = harness(down());
    assert.equal(/\bid="[^"]*Page"/.test(panels(h)), false);
    for (const id of ['quick_new_toPage', 'quick_review_fromPage', 'quick_review_toPage', 'quick_positionPage'])
        assert.equal(get(h, id), null, id);
    assert.equal((html.match(/quickPageInput|syncQuickPage|qe-paged|Page"/g) || []).length, 0);
});

test('س22 إعادة اختيار السورة نفسها عبر المكوّن لا تفرّغ الآية (لا يُطلق change إلا عند تغيّر القيمة)', () => {
    const h = harness(down());
    need(h, 'surahPickerChoose');
    for (const [selectId, ayahId] of [['quick_new_toSurah', 'quick_new_toAyah'], ['quick_positionSurah', 'quick_positionAyah']]) {
        const k = selectId === 'quick_positionSurah' ? harness(student()) : h;
        if (k !== h) need(k, 'surahPickerChoose');
        pick(k, selectId, 'بقر');
        assert.equal(k.element(selectId).value, '2', selectId);
        // عبر دالة الاختيار.
        k.element(ayahId).value = '20';
        k.run(`surahPickerChoose(document.getElementById('${selectId}'), 2)`);
        assert.equal(k.element(selectId).value, '2', selectId);
        assert.equal(k.element(ayahId).value, '20', `${ayahId} فُرّغت بإعادة الاختيار عبر surahPickerChoose`);
        // عبر النقر على نتيجة تحمل الرقم نفسه.
        typeSearch(k, selectId, 'بقر');
        const same = itemsOf(k, selectId).find(el => el.dataset.surah === '2');
        assert.ok(same, `لا نتيجة للبقرة في قائمة ${selectId}`);
        tap(same);
        assert.equal(k.element(selectId).value, '2', selectId);
        assert.equal(k.element(ayahId).value, '20', `${ayahId} فُرّغت بإعادة الاختيار بالنقر`);
    }
});

test('س23 المطابقة التامة تتقدّم: «ص» ← ص (38) ثم الصافات (37)، و«ق» ← ق (50) أولاً', () => {
    const h = harness(down());
    const sad = matches(h, 'ص');
    assert.equal(sad[0], 38);
    assert.equal(sad[1], 37);
    assert.equal(matches(h, 'ق')[0], 50);
});
