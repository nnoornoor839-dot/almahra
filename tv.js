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
    const ar = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
    const el = id => document.getElementById(id);
    const node = (tag, className, text) => {
        const result = document.createElement(tag); result.className = className;
        if (text !== undefined) result.textContent = text;
        return result;
    };
    let renderedSnapshot = null, sections = [];
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
            el('celeAdded').textContent = '+ ' + ar(event.added) + ' نقطة';
            el('celeTotal').textContent = 'المجموع: ' + ar(event.total) + ' نقطة';
            el('celeRank').textContent = event.rank == null ? '' : 'الترتيب: ' + ar(event.rank);
        }
        if (renderedSnapshot !== view.snapshot) {
            renderedSnapshot = view.snapshot;
            el('slides').replaceChildren(); el('dots').replaceChildren(); sections = [];
            view.slides.forEach((slide, index) => {
                const section = node('section', 'slide'); section.append(node('h2', '', slide.title));
                const body = node('div', slide.kind === 'leaders' ? 'board' : 'cards');
                if (slide.kind === 'leaders') {
                    // ترتيب عمودي: نصف القائمة مقرّباً لأعلى يميناً، ثم الباقون يساراً.
                    body.style.gridTemplateRows = `repeat(${Math.ceil(slide.items.length / 2)}, 1fr)`;
                    slide.items.forEach(item => {
                        const row = node('div', 'leader');
                        row.append(node('b', 'rank', ar(item.rank)), node('span', 'name', item.name), node('b', 'points', ar(item.points)));
                        body.append(row);
                    });
                } else slide.items.forEach(item => {
                    const card = node('div', 'card');
                    if (slide.kind === 'risingStars') card.append(node('h3', '', item.name), node('p', 'muted', 'يتقدّم على نفسه هذا الأسبوع'));
                    else {
                        card.append(node('p', 'muted', item.stage));
                        item.names.forEach(name => card.append(node('h3', '', name)));
                    }
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
    }
    const state = createTvState({ changed: render });
    let prayerKey = '', periods = [], latestPrayer = {};
    function checkPrayer() {
        const now = new Date(), prayer = latestPrayer;
        const key = riyadhDate(now) + ':' + (prayer.maghribMinutes ?? 20) + ':' + (prayer.ishaMinutes ?? 30);
        if (key !== prayerKey) { periods = prayerPeriods(adhan, riyadhDate(now), prayer); prayerKey = key; }
        state.setPrayer(activePrayer(periods, now));
        el('clock').textContent = new Intl.DateTimeFormat('ar-SA', { timeZone: 'Asia/Riyadh', hour: 'numeric', minute: '2-digit' }).format(now);
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
    checkPrayer(); hello();
    setInterval(checkPrayer, 20000);
    setInterval(() => state.checkConnection(), 1000);
    setInterval(() => state.advance(), 15000);
    // المصافحة الدورية تعيد الربط إذا أُعيد تحميل نافذة المشرف.
    setInterval(hello, 30000);
}
