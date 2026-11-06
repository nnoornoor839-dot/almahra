/* شاشة محلية للعرض فقط. */
'use strict';

function riyadhDate(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const part = key => parts.find(p => p.type === key).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
}

function prayerPeriods(adhan, dateStr, prayer = {}) {
    const [year, month, day] = dateStr.split('-').map(Number);
    // المكتبة تقرأ أجزاء التاريخ المحلية؛ نعطيها يوم الرياض صراحةً، مهما كانت منطقة الجهاز.
    const times = new adhan.PrayerTimes(new adhan.Coordinates(20.14804, 40.27224), new Date(year, month - 1, day, 12), adhan.CalculationMethod.UmmAlQura());
    return [
        { name: 'المغرب', start: +times.maghrib, end: +times.maghrib + (prayer.maghribMinutes ?? 20) * 60000 },
        { name: 'العشاء', start: +times.isha, end: +times.isha + (prayer.ishaMinutes ?? 30) * 60000 }
    ];
}

function activePrayer(periods, now) {
    return periods.find(p => +now >= p.start && +now < p.end)?.name || null;
}

function makeSlides(snapshot) {
    if (!snapshot) return [];
    const slides = [];
    const leaders = snapshot.leaders || [];
    if (leaders.length) slides.push({ kind: 'leaders', title: '🏆 المتصدرون في المجمع', items: leaders });
    for (const [kind, title] of [['dayKnights', '⭐ فرسان اليوم'], ['weekKnights', '🛡️ فرسان الأسبوع']]) {
        const items = (snapshot[kind] || []).filter(item => item.names?.length);
        if (items.length) slides.push({ kind, title, items });
    }
    if (snapshot.risingStars?.length) slides.push({ kind: 'risingStars', title: '🚀 النجم الصاعد', items: snapshot.risingStars.slice(0, 3) });
    return slides;
}

function createTvState({ now = Date.now, schedule = setTimeout, unschedule = clearTimeout, changed = () => {} } = {}) {
    let snapshot = null, current = null, timer = null, prayer = null, lastMessage = now();
    let slides = [], slide = 0;
    const queue = [], seen = new Set();
    function stopCurrent() {
        if (timer !== null) unschedule(timer);
        timer = null; current = null;
    }
    function next() {
        if (current || prayer || !snapshot || !queue.length) return;
        current = queue.shift();
        const id = current.id;
        timer = schedule(() => {
            // مؤقت قديم لا يغلق حدثاً تالياً بعد الإلغاء.
            if (current?.id !== id) return;
            stopCurrent(); next(); changed();
        }, 7000);
    }
    function clear() {
        snapshot = null; slides = []; slide = 0; queue.length = 0; stopCurrent();
    }
    return {
        receive(message) {
            if (!message || !['snapshot', 'celebrate', 'cancel', 'clear', 'bye'].includes(message.type)) return;
            lastMessage = now();
            if (message.type === 'clear' || message.type === 'bye') clear();
            if (message.type === 'snapshot') {
                snapshot = message; slides = makeSlides(message); slide = slides.length ? slide % slides.length : 0;
            }
            if (message.type === 'celebrate' && message.id && !seen.has(message.id)) {
                seen.add(message.id);
                if (!prayer && snapshot && queue.length < 3) { queue.push(message); next(); }
            }
            if (message.type === 'cancel') {
                seen.add(message.id);
                const index = queue.findIndex(e => e.id === message.id);
                if (index >= 0) queue.splice(index, 1);
                if (current?.id === message.id) { stopCurrent(); next(); }
            }
            changed();
        },
        setPrayer(name) {
            if (name === prayer) return;
            prayer = name;
            if (prayer) { queue.length = 0; stopCurrent(); }
            changed();
        },
        checkConnection() { if (now() - lastMessage >= 90000) { clear(); changed(); } },
        advance() { if (!prayer && !current && slides.length) { slide = (slide + 1) % slides.length; changed(); } },
        view() { return { snapshot, current, prayer, slides, slide, pending: queue.length }; }
    };
}

if (typeof module !== 'undefined') module.exports = { riyadhDate, prayerPeriods, activePrayer, makeSlides, createTvState };

if (typeof document !== 'undefined') {
    // قرار المالك 6: أرقام لاتينية في شاشة البرنامج العام كلها.
    const ar = n => String(n).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    const el = id => document.getElementById(id);
    const node = (tag, className, text) => {
        const result = document.createElement(tag); result.className = className;
        if (text !== undefined) result.textContent = text;
        return result;
    };
    function icon(kind) {
        const ns = el('tvIcons').namespaceURI;
        const svg = document.createElementNS ? document.createElementNS(ns, 'svg') : node('span', 'icon');
        svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
        const use = document.createElementNS ? document.createElementNS(ns, 'use') : node('span', '');
        use.setAttribute('href', '#icon-' + kind); svg.append(use);
        return svg;
    }
    // لفّ المركّب فقط؛ textContent يبقى اسم اللقطة حرفياً، بلا اختصار جديد.
    function protectName(element) {
        if (!document.createTextNode) return;
        const name = element.textContent, parts = [];
        let from = 0;
        for (const match of name.matchAll(/عبد\s+\S+/g)) {
            parts.push(document.createTextNode(name.slice(from, match.index)), node('span', 'name-word', match[0]));
            from = match.index + match[0].length;
        }
        parts.push(document.createTextNode(name.slice(from))); element.replaceChildren(...parts);
    }
    function fitNames() {
        if (!document.createRange) return;
        const scale = el('tv').getBoundingClientRect().width / 1920;
        document.querySelectorAll('.leader .name').forEach(name => {
            name.classList.remove('fit', 'two'); name.style.removeProperty('--fit');
            const range = document.createRange(); range.selectNodeContents(name);
            const width = range.getBoundingClientRect().width / scale, room = name.clientWidth;
            if (!room || width <= room) return;
            const size = Math.floor(75 * room / width);
            if (size >= 60) { name.style.setProperty('--fit', size + 'px'); name.classList.add('fit'); }
            else name.classList.add('two');
        });
    }
    function fitScreen() {
        if (typeof window === 'undefined') return;
        const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
        el('tv').style.transform = `translate(${(window.innerWidth - 1920 * scale) / 2}px, ${(window.innerHeight - 1080 * scale) / 2}px) scale(${scale})`;
        fitNames();
    }
    function burst() {
        const box = el('confetti'); box.replaceChildren();
        if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        // الشريط العلوي وطرفا الشاشة فقط، مع استبعاد مستطيلي الاسم والنقاط حتى للاسم الطويل.
        if (document.createRange) {
            const scale = el('tv').getBoundingClientRect().width / 1920, origin = el('tv').getBoundingClientRect().left;
            const rects = ['celeName', 'celeAdded'].map(id => el(id).getBoundingClientRect());
            const left = Math.max(0, Math.min(160, (Math.min(...rects.map(r => r.left)) - origin) / scale - 24));
            const right = Math.min(1920, Math.max(1760, (Math.max(...rects.map(r => r.right)) - origin) / scale + 24));
            box.style.clipPath = `polygon(0 0,100% 0,100% 100%,${right}px 100%,${right}px 150px,${left}px 150px,${left}px 100%,0 100%)`;
        }
        const colors = ['#d9bb5f', '#f5f7f5', '#5fae7f'];
        for (let i = 0; i < 34; i++) {
            const piece = node('span', ''), top = i >= 24, k = i % 12;
            piece.style.left = (top ? 16 + (k * 23) % 68 : i < 12 ? 92 + (k * 3) % 7 : 1 + (k * 3) % 7) + '%';
            piece.style.background = colors[i % colors.length];
            if (piece.style.setProperty) {
                piece.style.setProperty('--dur', (top ? 1.6 + k % 3 * .3 : 2.4 + k % 4 * .25) + 's');
                piece.style.setProperty('--dy', (top ? 110 + k % 4 * 30 : 1120) + 'px');
                piece.style.setProperty('--dx', ((k % 2 ? 1 : -1) * 12) + 'px');
                piece.style.setProperty('--rot', (260 + k % 3 * 90) + 'deg');
                piece.style.setProperty('--delay', (k % 6 * .09) + 's');
            }
            box.append(piece);
        }
    }
    let renderedSnapshot = null, sections = [], celebrationId = null;
    function render() {
        const view = state.view();
        const paused = !!view.prayer || !!view.current;
        el('content').hidden = paused;
        el('prayer').hidden = !view.prayer;
        el('celebration').hidden = !!view.prayer || !view.current;
        el('fullscreen').hidden = !!document.fullscreenElement || !!view.prayer;
        if (view.prayer) el('prayerText').textContent = 'حان وقت صلاة ' + view.prayer;
        if (view.current) {
            const event = view.current;
            el('celeName').textContent = event.name;
            protectName(el('celeName'));
            el('celeAdded').textContent = '+ ' + ar(event.added) + ' نقطة';
            el('celeTotal').textContent = 'المجموع: ' + ar(event.total) + ' نقطة';
            el('celeRank').textContent = event.rank == null ? '' : 'الترتيب: ' + ar(event.rank);
            el('celeRank').hidden = event.rank == null;
        }
        if (view.current && !view.prayer && celebrationId !== view.current.id) burst();
        celebrationId = view.prayer ? null : view.current?.id || null;
        if (renderedSnapshot !== view.snapshot) {
            renderedSnapshot = view.snapshot;
            el('slides').replaceChildren(); el('dots').replaceChildren(); sections = [];
            view.slides.forEach((slide, index) => {
                const section = node('section', 'slide'), heading = node('div', 'slide-title'), badge = node('span', 'slide-icon');
                badge.append(icon(slide.kind)); heading.append(badge, node('h2', '', slide.title.replace(/^\S+\s/u, ''))); section.append(heading);
                const body = node('div', slide.kind === 'leaders' ? 'board' : 'cards');
                if (slide.kind === 'leaders') {
                    // ترتيب عمودي: نصف القائمة مقرّباً لأعلى يميناً، ثم الباقون يساراً.
                    body.style.gridTemplateRows = `repeat(${Math.ceil(slide.items.length / 2)}, 1fr)`;
                    body.style.setProperty?.('--board-rows', Math.ceil(slide.items.length / 2));
                    slide.items.forEach(item => {
                        const row = node('div', 'leader' + (item.rank <= 3 ? ' top' + item.rank : ''));
                        row.append(node('b', 'rank', ar(item.rank)), node('span', 'name', item.name), node('b', 'points', ar(item.points)));
                        protectName(row.children[1]);
                        body.append(row);
                    });
                } else slide.items.forEach(item => {
                    const card = node('div', 'card'), cardBody = node('div', 'card-body');
                    if (slide.kind === 'risingStars') cardBody.append(node('h3', 'kname', item.name), node('p', 'muted', 'يتقدّم على نفسه هذا الأسبوع'));
                    else {
                        card.append(node('p', 'stage', item.stage));
                        item.names.forEach(name => cardBody.append(node('h3', 'kname', name)));
                    }
                    Array.from(cardBody.children).filter(child => child.className === 'kname').forEach(protectName);
                    card.append(cardBody);
                    body.append(card);
                });
                section.append(body); el('slides').append(section); sections.push(section);
                const dot = node('span', 'dot'); dot.setAttribute('aria-label', 'شريحة ' + (index + 1)); el('dots').append(dot);
            });
        }
        el('neutral').hidden = view.slides.length > 0;
        sections.forEach((section, index) => {
            section.classList.toggle('active', index === view.slide);
            section.setAttribute('aria-hidden', String(index !== view.slide));
            el('dots').children[index].classList.toggle('on', index === view.slide);
        });
        const boardDate = view.snapshot?.boardDate;
        el('resultsDate').textContent = boardDate && view.slides.length && boardDate !== riyadhDate()
            ? 'نتائج يوم ' + new Intl.DateTimeFormat('ar-SA', { timeZone: 'Asia/Riyadh', weekday: 'long' }).format(new Date(boardDate + 'T12:00:00+03:00')) + ' ' + ar(boardDate.slice(8) + '-' + boardDate.slice(5, 7)) : '';
        el('resultsDate').hidden = !el('resultsDate').textContent;
        el('tv').classList.toggle('has-date', !!el('resultsDate').textContent);
        fitNames();
    }
    const state = createTvState({ changed: render });
    let prayerKey = '', periods = [], latestPrayer = {};
    function checkPrayer() {
        const now = new Date(), prayer = latestPrayer;
        const key = riyadhDate(now) + ':' + (prayer.maghribMinutes ?? 20) + ':' + (prayer.ishaMinutes ?? 30);
        if (key !== prayerKey) { periods = prayerPeriods(adhan, riyadhDate(now), prayer); prayerKey = key; }
        state.setPrayer(activePrayer(periods, now));
        el('clock').textContent = new Intl.DateTimeFormat('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh', hour: 'numeric', minute: '2-digit' }).format(now);
        render();
    }
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('almahra-tv') : null;
    if (channel) channel.onmessage = ({ data }) => {
        // افحص الصلاة قبل استقبال الاحتفال حتى لو كان المتصفح قد أخّر المؤقت.
        checkPrayer();
        if (data?.type === 'snapshot') latestPrayer = data.prayer || {};
        state.receive(data); checkPrayer();
    };
    const hello = () => channel?.postMessage({ type: 'hello' });
    el('fullscreen').onclick = async () => { try { await document.documentElement.requestFullscreen(); } catch (_) { /* يمكن إعادة المحاولة بالزر. */ } };
    document.addEventListener('fullscreenchange', render);
    document.addEventListener('visibilitychange', () => { checkPrayer(); state.checkConnection(); hello(); });
    let idleTimer;
    function wake() {
        el('tv').classList.toggle('idle', false); clearTimeout(idleTimer);
        idleTimer = setTimeout(() => el('tv').classList.toggle('idle', true), 3000);
    }
    document.addEventListener('mousemove', wake); wake();
    if (typeof window !== 'undefined') window.addEventListener('resize', fitScreen);
    document.fonts?.ready.then(fitNames);
    fitScreen();
    checkPrayer(); hello();
    setInterval(checkPrayer, 20000);
    setInterval(() => state.checkConnection(), 1000);
    setInterval(() => state.advance(), 15000);
    // المصافحة الدورية تعيد الربط إذا أُعيد تحميل نافذة المشرف.
    setInterval(hello, 30000);
}
