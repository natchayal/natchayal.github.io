document.getElementById('year').textContent = new Date().getFullYear();

(() => {
  const lastUpdatedEl = document.getElementById('last-updated');
  if (!lastUpdatedEl) return;
  const modified = new Date(document.lastModified);
  if (isNaN(modified.getTime())) return;
  lastUpdatedEl.textContent = modified.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
})();

(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.querySelector('.ripple-canvas');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');

  const CELL = 9;
  const DAMPING = 0.965;
  const MAX_ALPHA = 0.06;
  const STEP_EVERY_N_FRAMES = 2;

  const buffer = document.createElement('canvas');
  const bctx = buffer.getContext('2d');

  let bufWidth = 0;
  let bufHeight = 0;
  let current = null;
  let previous = null;
  let imageData = null;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    bufWidth = Math.max(2, Math.ceil(canvas.width / CELL));
    bufHeight = Math.max(2, Math.ceil(canvas.height / CELL));
    current = new Float32Array(bufWidth * bufHeight);
    previous = new Float32Array(bufWidth * bufHeight);
    buffer.width = bufWidth;
    buffer.height = bufHeight;
    imageData = bctx.createImageData(bufWidth, bufHeight);
  }
  window.addEventListener('resize', resize);
  resize();

  function disturb(x, y) {
    const gx = Math.round(x / CELL);
    const gy = Math.round(y / CELL);
    const amplitude = 1.1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const px = gx + dx;
        const py = gy + dy;
        if (px > 0 && px < bufWidth - 1 && py > 0 && py < bufHeight - 1) {
          const falloff = dx === 0 && dy === 0 ? 1 : 0.3;
          current[py * bufWidth + px] += amplitude * falloff;
        }
      }
    }
  }

  let lastX = null;
  let lastY = null;
  const MIN_DISTANCE = 26;

  function handleMove(x, y) {
    if (lastX === null || Math.hypot(x - lastX, y - lastY) > MIN_DISTANCE) {
      disturb(x, y);
      lastX = x;
      lastY = y;
    }
  }

  window.addEventListener('mousemove', (e) => handleMove(e.clientX, e.clientY));
  window.addEventListener(
    'touchmove',
    (e) => {
      const touch = e.touches[0];
      if (touch) handleMove(touch.clientX, touch.clientY);
    },
    { passive: true }
  );

  function step() {
    for (let y = 1; y < bufHeight - 1; y++) {
      const row = y * bufWidth;
      const rowUp = row - bufWidth;
      const rowDown = row + bufWidth;
      for (let x = 1; x < bufWidth - 1; x++) {
        const i = row + x;
        previous[i] =
          ((current[i - 1] + current[i + 1] + current[rowUp + x] + current[rowDown + x]) / 2 - previous[i]) *
          DAMPING;
      }
    }
    const tmp = current;
    current = previous;
    previous = tmp;
  }

  function render() {
    const data = imageData.data;
    for (let i = 0; i < current.length; i++) {
      const alpha = Math.min(MAX_ALPHA, Math.abs(current[i]) * 0.05);
      const o = i * 4;
      data[o] = 0;
      data[o + 1] = 60;
      data[o + 2] = 185;
      data[o + 3] = Math.round(alpha * 255);
    }
    bctx.putImageData(imageData, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(buffer, 0, 0, bufWidth, bufHeight, 0, 0, canvas.width, canvas.height);
  }

  let frameCount = 0;

  function tick() {
    frameCount++;
    if (frameCount % STEP_EVERY_N_FRAMES === 0) {
      step();
    }
    render();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();

(() => {
  const input = document.getElementById('site-search');
  const results = document.getElementById('search-results');
  if (!input || !results) return;

  const PAGES = {
    'index.html': 'Overview',
    'about.html': 'About',
    'projects.html': 'Projects',
    'publications.html': 'Publications',
    'experience.html': 'Experience',
    'skills-awards.html': 'Skills & Awards',
    'teaching.html': 'Teaching',
    'gallery.html': 'Gallery',
    'contact.html': 'Contact',
  };

  let indexEntries = [];
  let indexReady = false;
  let lastQuery = '';

  function normalize(str) {
    return str.replace(/\s+/g, ' ').trim();
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function buildIndex() {
    const parser = new DOMParser();
    const entries = [];

    await Promise.all(
      Object.keys(PAGES).map(async (page) => {
        try {
          const res = await fetch(page);
          if (!res.ok) return;
          const html = await res.text();
          const doc = parser.parseFromString(html, 'text/html');
          const main = doc.querySelector('main');
          if (!main) return;

          const blocks = main.querySelectorAll('section.section[id], .papers-group[id]');
          blocks.forEach((block) => {
            const id = block.getAttribute('id');
            const heading = block.querySelector('h2, h3');
            const eyebrow = block.querySelector('.eyebrow');
            const title = normalize((heading && heading.textContent) || (eyebrow && eyebrow.textContent) || id);
            const text = normalize(block.textContent || '');
            if (!text) return;
            entries.push({
              title,
              page,
              pageLabel: PAGES[page],
              hash: '#' + id,
              text,
              textLower: text.toLowerCase(),
              titleLower: title.toLowerCase(),
            });
          });
        } catch (e) {
          // Skip pages that fail to fetch (e.g. opened via file:// without a server)
        }
      })
    );

    indexEntries = entries;
    indexReady = true;
    if (lastQuery) render(search(lastQuery));
  }

  function snippet(entry, word) {
    const i = entry.textLower.indexOf(word);
    if (i === -1) return entry.text.slice(0, 90) + (entry.text.length > 90 ? '…' : '');
    const start = Math.max(0, i - 40);
    const end = Math.min(entry.text.length, i + word.length + 50);
    return (start > 0 ? '…' : '') + entry.text.slice(start, end) + (end < entry.text.length ? '…' : '');
  }

  function search(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const words = q.split(/\s+/).filter((w) => w.length >= 2);
    if (!words.length) return [];

    const scored = [];
    indexEntries.forEach((entry) => {
      let score = 0;
      let matchedWord = words[0];

      if (entry.titleLower.includes(q)) score += 100;
      if (entry.textLower.includes(q)) score += 20;

      words.forEach((w) => {
        if (entry.titleLower.includes(w)) score += 10;
        if (entry.textLower.includes(w)) {
          score += 3;
          matchedWord = w;
        }
      });

      if (score > 0) scored.push({ entry, score, matchedWord });
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 10).map((s) => ({
      title: s.entry.title,
      pageLabel: s.entry.pageLabel,
      page: s.entry.page,
      hash: s.entry.hash,
      preview: snippet(s.entry, s.matchedWord),
    }));
  }

  function render(matches) {
    if (!indexReady) {
      results.innerHTML = '<div class="search-empty">Indexing…</div>';
      results.hidden = false;
      return;
    }
    if (!matches.length) {
      results.innerHTML = '<div class="search-empty">No matches</div>';
      results.hidden = false;
      return;
    }
    results.innerHTML = matches
      .map(
        (m) =>
          `<a class="search-result" href="${m.page}${m.hash}">${escapeHtml(m.title)}<span>${escapeHtml(m.pageLabel)} — ${escapeHtml(m.preview)}</span></a>`
      )
      .join('');
    results.hidden = false;
  }

  input.addEventListener('input', () => {
    const q = input.value;
    lastQuery = q;
    if (!q.trim()) {
      results.hidden = true;
      results.innerHTML = '';
      return;
    }
    render(indexReady ? search(q) : []);
  });

  input.addEventListener('focus', () => {
    if (input.value.trim()) render(indexReady ? search(input.value) : []);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = results.querySelector('.search-result');
      if (first) window.location.href = first.getAttribute('href');
    } else if (e.key === 'Escape') {
      input.value = '';
      lastQuery = '';
      results.hidden = true;
      results.innerHTML = '';
      input.blur();
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box')) {
      results.hidden = true;
    }
  });

  buildIndex();
})();

(() => {
  const items = Array.from(document.querySelectorAll('.side-toc-item'));
  if (!items.length) return;

  const sections = items
    .map((item) => {
      const id = item.getAttribute('href').slice(1);
      return { item, el: document.getElementById(id) };
    })
    .filter((s) => s.el);
  if (!sections.length) return;

  function setActive(el) {
    const match = sections.find((s) => s.el === el);
    if (!match) return;
    items.forEach((i) => i.classList.remove('is-active'));
    match.item.classList.add('is-active');
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActive(entry.target);
      });
    },
    { rootMargin: '-40% 0px -50% 0px', threshold: 0 }
  );

  sections.forEach((s) => observer.observe(s.el));
  setActive(sections[0].el);
})();
