// 目次の「いま見ているところ」に印をつける。JavaScript が動かなくても、ページはそのまま読める
(() => {
  'use strict';
  const links = [...document.querySelectorAll('.topbar__nav a')];
  const targets = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  if (!('IntersectionObserver' in window) || !targets.length) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      for (const a of links) {
        if (a.getAttribute('href') === '#' + e.target.id) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      }
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  targets.forEach((t) => io.observe(t));
})();

// ---- 聴く：一度に1曲だけ。JavaScript が動かないときは、ふつうの再生バーがそのまま使える ----
(() => {
  'use strict';
  const items = [...document.querySelectorAll('[data-track]')];
  if (!items.length) return;
  document.documentElement.classList.add('has-player');
  const fmt = (t) => (Number.isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : '0:00');
  const all = [];
  for (const li of items) {
    const audio = li.querySelector('audio');
    const body = li.querySelector('.track__body');
    audio.controls = false;
    const title = li.querySelector('.track__title').textContent;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'track__btn';
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', `「${title}」を再生`);
    btn.innerHTML = '<span class="track__icon" aria-hidden="true"></span>';
    li.insertBefore(btn, body);
    const seek = document.createElement('input');
    seek.type = 'range';
    seek.className = 'track__seek';
    seek.min = '0'; seek.max = '1000'; seek.value = '0';
    seek.setAttribute('aria-label', `「${title}」の再生位置`);
    const time = document.createElement('span');
    time.className = 'track__time';
    time.textContent = '0:00';
    const msg = document.createElement('p');
    msg.className = 'track__error';
    msg.hidden = true;
    body.append(seek, time, msg);
    const setFill = () => { const v = audio.duration ? audio.currentTime / audio.duration : 0; seek.value = String(Math.round(v * 1000)); li.style.setProperty('--played', String(v)); time.textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration)}`; };
    const mark = (on) => { li.classList.toggle('is-playing', on); btn.setAttribute('aria-pressed', String(on)); btn.setAttribute('aria-label', `「${title}」を${on ? '一時停止' : '再生'}`); };
    btn.addEventListener('click', async () => {
      if (!audio.paused) { audio.pause(); return; }
      for (const o of all) if (o !== audio) o.pause();
      msg.hidden = true;
      try { await audio.play(); } catch { msg.textContent = '再生できませんでした。ネットにつながっているか、確かめてください。'; msg.hidden = false; }
    });
    audio.addEventListener('play', () => { for (const o of all) if (o !== audio) o.pause(); mark(true); });
    audio.addEventListener('pause', () => mark(false));
    audio.addEventListener('ended', () => { audio.currentTime = 0; mark(false); setFill(); });
    audio.addEventListener('timeupdate', setFill);
    audio.addEventListener('loadedmetadata', setFill);
    audio.addEventListener('error', () => { msg.textContent = '再生できませんでした。ネットにつながっているか、確かめてください。'; msg.hidden = false; mark(false); });
    seek.addEventListener('input', () => { if (audio.duration) audio.currentTime = (Number(seek.value) / 1000) * audio.duration; });
    all.push(audio);
  }
})();

// ---- 動画：押したときだけ YouTube を読みこむ（ページを開いただけでは、YouTube には何も送らない） ----
(() => {
  'use strict';
  for (const box of document.querySelectorAll('[data-yt]')) {
    const link = box.querySelector('.yt__btn');
    if (!link) continue;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const f = document.createElement('iframe');
      f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(box.dataset.yt)}?autoplay=1&rel=0`;
      f.title = link.getAttribute('aria-label') || '動画';
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.allowFullscreen = true;
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      f.className = 'yt__frame';
      box.classList.add('is-loaded');
      box.replaceChildren(f);
      f.focus();
    });
  }
})();

// 第2版：演出は独立して追加。読み込み前・JSなしではすべて表示する。
(() => {
  'use strict';
  const root = document.documentElement;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const header = document.querySelector('.topbar');
  const nav = document.querySelector('.topbar__nav');
  const syncHeader = () => root.style.setProperty('--bar-height', `${header.offsetHeight}px`);
  syncHeader();
  if ('ResizeObserver' in window) new ResizeObserver(syncHeader).observe(header);
  const centerCurrent = () => {
    const current = nav.querySelector('[aria-current="true"]');
    if (current && nav.scrollWidth > nav.clientWidth) {
      const item = current.getBoundingClientRect();
      const box = nav.getBoundingClientRect();
      nav.scrollTo({ left: nav.scrollLeft + item.left - box.left - (box.width - item.width) / 2, behavior: motion.matches ? 'auto' : 'smooth' });
    }
  };
  new MutationObserver(centerCurrent).observe(nav, { attributes: true, subtree: true, attributeFilter: ['aria-current'] });
  if (!('IntersectionObserver' in window)) return;
  let cleanup = () => {};
  function setup() {
    cleanup();
    if (motion.matches) return;
    const frames = new Set();
    const finalNumbers = new Map();
    const progress = document.createElement('div');
    progress.className = 'read-progress';
    progress.setAttribute('aria-hidden', 'true');
    document.body.append(progress);
    const lists = [...document.querySelectorAll('.journey__list')];
    let scheduled = false;
    const frame = (callback) => {
      const id = requestAnimationFrame((time) => { frames.delete(id); callback(time); });
      frames.add(id);
    };
    const update = () => {
      scheduled = false;
      const total = document.body.scrollHeight - innerHeight;
      progress.style.setProperty('--read', String(total > 0 ? Math.min(1, Math.max(0, scrollY / total)) : 0));
      for (const list of lists) {
        const rect = list.getBoundingClientRect();
        if (!rect.height) continue;
        const passed = innerHeight * .68 - rect.top;
        list.style.setProperty('--journey', String(Math.min(1, Math.max(0, passed / rect.height))));
        for (const item of list.children) item.classList.toggle('is-passed', item.getBoundingClientRect().top < innerHeight * .68);
      }
    };
    const schedule = () => { if (!scheduled) { scheduled = true; frame(update); } };
    const count = (el) => {
      const text = el.firstChild;
      if (!text || text.nodeType !== Node.TEXT_NODE || !/^(約)?\d[\d,]*$/.test(text.textContent.trim())) return;
      const original = text.textContent;
      const prefix = original.startsWith('約') ? '約' : '';
      const value = Number(original.replace(/[約,]/g, ''));
      finalNumbers.set(text, original);
      el.setAttribute('aria-label', el.textContent);
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / 900);
        const n = Math.round(value * (1 - Math.pow(1 - t, 3)));
        text.textContent = t === 1 ? original : prefix + (original.includes(',') ? n.toLocaleString('en-US') : String(n));
        if (t < 1) frame(tick);
      };
      frame(tick);
    };
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        el.classList.remove('is-waiting');
        if (el.matches('.numbers__n')) count(el);
        if (el.matches('.sky__scroll')) {
          el.querySelectorAll('.sky__line').forEach((line) => {
            const length = line.getTotalLength();
            line.style.setProperty('--line-length', length);
            line.style.strokeDasharray = length;
            line.classList.add('is-drawn');
          });
        }
        io.unobserve(el);
      }
    }, { threshold: .08 });
    const reveal = [...document.querySelectorAll('.sec-head,.prose p,.profile,.bundle,.journey__item,.motto__text,.work,.now__item,.book,.pub,.charge__block,.channel,.layer,.closing__in')];
    root.classList.add('js');
    for (const el of reveal) {
      el.classList.add('reveal');
      // 既に見えている内容やアンカー到着先は隠さない。
      if (el.getBoundingClientRect().top >= innerHeight && !el.matches(':target') && !el.contains(document.activeElement)) el.classList.add('is-waiting');
      io.observe(el);
    }
    document.querySelectorAll('.numbers__n,.sky__scroll').forEach((el) => io.observe(el));
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', schedule);
    document.querySelectorAll('.prelude').forEach((el) => el.addEventListener('toggle', schedule));
    const resize = 'ResizeObserver' in window ? new ResizeObserver(schedule) : null;
    resize?.observe(document.body);
    update();
    cleanup = () => {
      io.disconnect(); resize?.disconnect();
      frames.forEach(cancelAnimationFrame);
      removeEventListener('scroll', schedule); removeEventListener('resize', schedule);
      document.querySelectorAll('.prelude').forEach((el) => el.removeEventListener('toggle', schedule));
      reveal.forEach((el) => el.classList.remove('is-waiting'));
      finalNumbers.forEach((value, node) => { node.textContent = value; });
      lists.forEach((list) => { list.style.removeProperty('--journey'); [...list.children].forEach((item) => item.classList.remove('is-passed')); });
      document.querySelectorAll('.is-drawn').forEach((line) => line.classList.remove('is-drawn'));
      root.classList.remove('js'); progress.remove();
    };
  }
  setup();
  motion.addEventListener('change', setup);
})();

// ---- 星図：スマホでは横にずらして見る。はじめは、いちばん新しい作品（右端）が見える位置から ----
(() => {
  'use strict';
  const sc = document.querySelector('.sky__scroll');
  if (!sc) return;
  const toNewest = () => { if (sc.scrollWidth > sc.clientWidth + 8) sc.scrollLeft = sc.scrollWidth - sc.clientWidth; };
  toNewest();
  window.addEventListener('load', toNewest, { once: true });
})();
