// بيانات وهمية حصراً. متصفح حقيقي، ملفات الإنتاج كما هي، وكل الشبكة الخارجية محجوبة.
const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { tvInvariant } = require('./helpers/tv-harness.cjs');
const root = path.resolve(__dirname, '..');
let browser;
before(async () => {
    const playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); });
const leaders = () => Array.from({ length: 10 }, (_, i) => ({ name: ['سعد فهد ناصر', 'خالد عبد الله سالم', 'عمر عبد الرحمن صالح'][i % 3], points: 96 - i * 6, rank: i + 1 }));
const snapshot = (extra = {}) => ({ type: 'snapshot', boardDate: '2026-11-01', leaders: leaders(),
    dayKnights: [{ stage: 'ابتدائي', names: ['سعد فهد ناصر'] }, { stage: 'متوسط', names: ['خالد عبد الله سالم'] }, { stage: 'ثانوي', names: ['عمر عبد الرحمن صالح'] }],
    weekKnights: [{ stage: 'متوسط', names: ['خالد عبد الله سالم', 'سعد فهد ناصر'] }],
    risingStars: [{ name: 'عمر عبد الرحمن صالح' }], ...extra });
async function openTv(options = {}) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce', ...options });
    const page = await context.newPage(), requests = [], external = [], errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => requests.push(r.url()));
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== 'http://tv.test') { external.push(url.href); return route.abort('internetdisconnected'); }
        const file = path.resolve(root, decodeURIComponent(url.pathname.slice(1)));
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
        await route.fulfill({ path: file });
    });
    await page.clock.install({ time: new Date('2026-11-01T12:00:00Z') });
    await page.goto('http://tv.test/tv.html');
    await page.evaluate(() => document.fonts.ready);
    await page.clock.pauseAt(new Date('2026-11-01T12:00:01Z'));
    const post = message => page.evaluate(message => {
        window.tvTestSender ||= new BroadcastChannel('almahra-tv'); window.tvTestSender.postMessage(message);
    }, message);
    return { page, context, requests, external, errors, post,
        async snapshot(message = snapshot()) { await post(message); await page.waitForFunction(() => document.querySelector('.leader')); await page.clock.runFor(850); },
        close: () => context.close() };
}
async function safe(page, selectors) {
    const bounds = await page.locator(selectors).evaluateAll(nodes => nodes.filter(n => n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden').map(n => {
        const r = n.getBoundingClientRect(); return { text: n.textContent, x: r.x, y: r.y, right: r.right, bottom: r.bottom };
    }));
    assert.ok(bounds.length);
    for (const r of bounds) assert.ok(r.x >= 95.5 && r.y >= 53.5 && r.right <= 1824.5 && r.bottom <= 1026.5, JSON.stringify(r));
}

test('TV design: core state, calculations, filtering and all existing timings remain byte-identical', () => {
    const original = cp.execFileSync('git', ['show', '5a952da:tv.js'], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n');
    assert.equal(tvInvariant('tv.js', fs.readFileSync(path.join(root, 'tv.js'), 'utf8')), tvInvariant('tv.js', original));
    for (const interval of [20000, 1000, 15000, 30000]) assert.match(fs.readFileSync(path.join(root, 'tv.js'), 'utf8'), new RegExp(`, ${interval}\\);`));
    assert.equal(fs.readFileSync(path.join(root, 'tv.html'), 'utf8').includes('\r'), false);
    assert.equal(fs.readFileSync(path.join(root, 'tv.js'), 'utf8').includes('\r'), false);
});

test('TV design: local Cairo at 600/700 and inline SVG load with external network blocked, including a reload', async () => {
    const h = await openTv();
    try {
        await h.snapshot();
        await h.page.reload(); await h.page.evaluate(() => document.fonts.ready); await h.snapshot();
        assert.deepEqual(h.external, []); assert.deepEqual(h.errors, []);
        const loaded = await h.page.evaluate(() => ({ faces: [...document.fonts].map(f => ({ status: f.status, weight: f.weight })),
            family: getComputedStyle(document.querySelector('.name')).fontFamily,
            icons: [...document.querySelectorAll('.slide.active use')].map(n => ({ href: n.getAttribute('href'), width: n.getBoundingClientRect().width })) }));
        assert.ok(loaded.family.includes('Cairo'));
        assert.equal(loaded.faces.length, 2); assert.ok(loaded.faces.every(f => f.status === 'loaded' && f.weight === '200 1000'));
        assert.ok(loaded.icons.every(icon => icon.href.startsWith('#icon-') && icon.width > 0));
        assert.ok(h.requests.some(url => url.endsWith('Cairo-arabic.woff2')));
        assert.ok(h.requests.some(url => url.endsWith('Cairo-latin.woff2')));
        assert.ok(h.requests.every(url => url.startsWith('http://tv.test/')));
    } finally { await h.close(); }
});

test('TV design: Latin digits in clock, rank, points, date and celebration; same rank has the same solid medal', async () => {
    const h = await openTv();
    try {
        const items = leaders(); items[2].rank = 2; items[2].points = items[1].points;
        await h.snapshot(snapshot({ leaders: items, boardDate: '2026-10-29' }));
        assert.doesNotMatch(await h.page.locator('#tv').innerText(), /[٠-٩]/);
        assert.match(await h.page.locator('#clock').innerText(), /[0-9]+:[0-9]{2}/);
        assert.match(await h.page.locator('#resultsDate').innerText(), /29-10/);
        const medals = await h.page.locator('.rank').evaluateAll(nodes => nodes.map(n => getComputedStyle(n).backgroundColor));
        assert.equal(medals[0], 'rgb(217, 187, 95)'); assert.equal(medals[1], 'rgb(205, 213, 208)'); assert.equal(medals[2], medals[1]);
        await safe(h.page, '.tv-head, .leader, .name, .points, #resultsDate');
        await h.post({ type: 'celebrate', id: 'latin', name: 'سعد فهد ناصر', added: 6, total: 88, rank: 2 });
        await h.page.waitForFunction(() => !document.getElementById('celebration').hidden);
        assert.equal(await h.page.locator('#celeAdded').innerText(), '+ 6 نقطة');
        assert.equal(await h.page.locator('#celeTotal').innerText(), 'المجموع: 88 نقطة');
        assert.equal(await h.page.locator('#celeRank').innerText(), 'الترتيب: 2');
        assert.doesNotMatch(await h.page.locator('#celebration').innerText(), /[٠-٩]/);
        assert.ok(await h.page.locator('#celeAdded').evaluate(n => parseFloat(getComputedStyle(n).fontSize)) > await h.page.locator('#celeName').evaluate(n => parseFloat(getComputedStyle(n).fontSize)));
        await safe(h.page, '#celeName, #celeAdded, #celeTotal, #celeRank');
        await h.page.screenshot({ path: path.join(root, '.cache/tv-design-celebration.png') });
    } finally { await h.close(); }
});

test('TV design: ten leaders use two five-row columns; names fit at 75, then 60–74, then two lines at 58; compounds never break', async () => {
    const h = await openTv();
    try {
        const names = ['سعد فهد ناصر', 'خالد عبد الله سالم', 'عمر عبد الرحمن صالح', 'عبد الرحمن عبد العزيز عبد الكريم'];
        await h.snapshot(snapshot({ leaders: leaders().map((row, i) => ({ ...row, name: names[i % names.length] })) }));
        const rows = await h.page.locator('.leader').evaluateAll(nodes => nodes.map(n => {
            const r = n.getBoundingClientRect(), name = n.querySelector('.name'), style = getComputedStyle(name);
            return { x: r.x, y: r.y, size: parseFloat(style.fontSize), lines: name.getBoundingClientRect().height / parseFloat(style.lineHeight), width: name.clientWidth, scroll: name.scrollWidth };
        }));
        assert.equal(new Set(rows.map(r => r.x)).size, 2); assert.equal(new Set(rows.map(r => r.y)).size, 5);
        assert.ok(rows.some(r => r.size === 75)); assert.ok(rows.some(r => r.size >= 60 && r.size < 75));
        assert.ok(rows.some(r => r.size === 58 && r.lines > 1.9 && r.lines < 2.1));
        assert.ok(rows.every(r => r.scroll <= r.width + 1));
        const words = await h.page.locator('.leader .name-word').evaluateAll(nodes => nodes.map(n => ({ text: n.textContent, rects: n.getClientRects().length, whiteSpace: getComputedStyle(n).whiteSpace })));
        assert.ok(words.some(w => w.text === 'عبد الله')); assert.ok(words.some(w => w.text === 'عبد الرحمن'));
        assert.ok(words.every(w => w.rects === 1 && w.whiteSpace === 'nowrap'));
        await safe(h.page, '.leader, .name, .rank, .points');
        await h.page.screenshot({ path: path.join(root, '.cache/tv-design-leaders.png') });
    } finally { await h.close(); }
});

test('TV design: stage/name/rising text sizes and every student-facing slide stay within the 1920×1080 safe area', async () => {
    const h = await openTv();
    try {
        await h.snapshot();
        for (const kind of ['dayKnights', 'weekKnights', 'risingStars']) {
            await h.page.clock.runFor(15000);
            const title = await h.page.locator('.slide.active h2').innerText();
            assert.match(title, kind === 'dayKnights' ? /فرسان اليوم/ : kind === 'weekKnights' ? /فرسان الأسبوع/ : /النجم الصاعد/);
            await safe(h.page, '.slide.active .slide-title, .slide.active .card, .slide.active h3, .slide.active p');
            assert.equal(await h.page.locator('.slide.active h3').first().evaluate(n => getComputedStyle(n).fontSize), '80px');
            if (kind !== 'risingStars') assert.equal(await h.page.locator('.slide.active .stage').first().evaluate(n => getComputedStyle(n).fontSize), '64px');
            else assert.equal(await h.page.locator('.slide.active .muted').evaluate(n => getComputedStyle(n).fontSize), '56px');
            if (kind === 'dayKnights') await h.page.screenshot({ path: path.join(root, '.cache/tv-design-knights.png') });
        }
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

test('TV design: fullscreen button and pointer hide at 3000ms and wake on mouse movement; fullscreen and prayer still hide the button', async () => {
    const h = await openTv();
    try {
        await h.snapshot(); await h.page.mouse.move(400, 400);
        await h.page.clock.runFor(2999); assert.equal(await h.page.locator('#tv').evaluate(n => n.classList.contains('idle')), false);
        await h.page.clock.runFor(1); assert.equal(await h.page.locator('#tv').evaluate(n => n.classList.contains('idle')), true);
        await h.page.clock.runFor(450);
        assert.equal(await h.page.locator('#fullscreen').evaluate(n => getComputedStyle(n).opacity), '0');
        assert.equal(await h.page.locator('#fullscreen').evaluate(n => getComputedStyle(n).cursor), 'none');
        await h.page.mouse.move(410, 410); await h.page.clock.runFor(450);
        assert.equal(await h.page.locator('#fullscreen').evaluate(n => getComputedStyle(n).opacity), '1');
        await h.page.locator('#fullscreen').click();
        await h.page.waitForFunction(() => !!document.fullscreenElement);
        assert.equal(await h.page.locator('#fullscreen').evaluate(n => n.hidden), true);
        await h.page.evaluate(() => document.exitFullscreen());
        await h.page.waitForFunction(() => !document.fullscreenElement && !document.getElementById('fullscreen').hidden);
        const start = await h.page.evaluate(() => +new adhan.PrayerTimes(new adhan.Coordinates(20.14804, 40.27224), new Date(2026, 10, 1, 12), adhan.CalculationMethod.UmmAlQura()).maghrib);
        await h.page.clock.fastForward(start - await h.page.evaluate(() => Date.now()));
        await h.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        assert.equal(await h.page.locator('#fullscreen').evaluate(n => n.hidden), true);
        assert.equal(await h.page.locator('#prayerText').innerText(), 'حان وقت صلاة المغرب');
        await safe(h.page, '.prayer-icon, #prayerText');
        await h.page.screenshot({ path: path.join(root, '.cache/tv-design-prayer.png') });
        await h.page.mouse.move(420, 420); assert.equal(await h.page.locator('#fullscreen').evaluate(n => n.hidden), true);
    } finally { await h.close(); }
});

test('TV design: one peripheral burst per celebration, cancellation starts the next burst, 7000ms duration and reduced motion', async () => {
    for (const reducedMotion of ['no-preference', 'reduce']) {
        const h = await openTv({ reducedMotion });
        try {
            await h.snapshot();
            const event = { type: 'celebrate', id: 'first', name: 'خالد عبد الله سالم', added: 6, total: 88, rank: null };
            await h.post(event); await h.page.waitForFunction(() => !document.getElementById('celebration').hidden);
            assert.equal(await h.page.locator('#confetti span').count(), reducedMotion === 'reduce' ? 0 : 34);
            assert.equal(await h.page.locator('#celeRank').evaluate(n => n.hidden), true);
            if (reducedMotion !== 'reduce') {
                const geometry = await h.page.evaluate(() => {
                    const box = document.getElementById('confetti'), clip = getComputedStyle(box).clipPath;
                    window.firstPiece = box.firstChild;
                    return { clip, positions: [...box.children].map(n => ({ left: parseFloat(n.style.left), dy: parseFloat(n.style.getPropertyValue('--dy')) })) };
                });
                assert.match(geometry.clip, /polygon/); assert.ok(geometry.positions.every(p => p.left <= 8 || p.left >= 92 || p.dy <= 200));
                await h.post(snapshot()); await h.page.clock.runFor(1000);
                assert.equal(await h.page.evaluate(() => document.getElementById('confetti').firstChild === window.firstPiece), true);
            }
            await h.post({ ...event, id: 'next', name: 'سعد فهد ناصر' }); await h.post({ type: 'cancel', id: 'first' });
            await h.page.waitForFunction(() => document.getElementById('celeName').textContent === 'سعد فهد ناصر' && !document.getElementById('celebration').hidden);
            if (reducedMotion !== 'reduce') assert.equal(await h.page.evaluate(() => document.getElementById('confetti').firstChild === window.firstPiece), false);
            await h.page.clock.runFor(6999); assert.equal(await h.page.locator('#celebration').evaluate(n => n.hidden), false);
            await h.page.clock.runFor(1); assert.equal(await h.page.locator('#celebration').evaluate(n => n.hidden), true);
            assert.deepEqual(h.errors, []);
        } finally { await h.close(); }
    }
});
