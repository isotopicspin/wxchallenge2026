/**
 * app.js — Community Advisor frontend.
 * Vanilla JS, no framework, talks to the Express API.
 */

const API = '';  // same-origin

const THEME_COLOURS = [
  '#0043ce','#6929c4','#009d9a','#198038','#b28600',
  '#da1e28','#ff832b','#0072c3',
];

// ── State ─────────────────────────────────────────────────────────────────
let openThreads  = [];   // unanswered/open — shown in report tab
let allThreads   = [];   // every thread incl. answered — used for analytics
let allThemes    = [];
let selectedIds  = new Set();
let classifying  = false; // true while /api/classify is in-flight

// ── DOM refs ──────────────────────────────────────────────────────────────
const productGrid      = document.getElementById('product-grid');
const btnScan          = document.getElementById('btn-scan');
const scanStatus       = document.getElementById('scan-status');
const viewSelector     = document.getElementById('view-selector');
const viewResults      = document.getElementById('view-results');
const tabCount         = document.getElementById('tab-count');
const threadsList      = document.getElementById('threads-list');
const filterInput      = document.getElementById('filter-input');
const btnNewScan       = document.getElementById('btn-new-scan');
const btnAnalyse       = document.getElementById('btn-analyse');
const analyseStatus    = document.getElementById('analyse-status');
const analyticsContent = document.getElementById('analytics-content');
const zeroSection      = document.getElementById('zero-reply-section');
const zeroCount        = document.getElementById('zero-count');
const zeroList         = document.getElementById('zero-reply-list');

// ── Boot ──────────────────────────────────────────────────────────────────
(async () => {
  try {
    const res        = await fetch(`${API}/api/products`);
    const categories = await res.json();
    renderProducts(categories);
  } catch (e) {
    productGrid.innerHTML = `<div class="ca-error">Could not load products: ${e.message}</div>`;
  }
})();

// ── Product selector — categorised by pillar ──────────────────────────────
function renderProducts(categories) {
  // Group categories by pillar
  const pillars = {};
  categories.forEach(cat => {
    if (!pillars[cat.pillar]) pillars[cat.pillar] = [];
    pillars[cat.pillar].push(cat);
  });

  productGrid.innerHTML = Object.entries(pillars).map(([pillar, cats]) => `
    <div class="ca-pillar">
      <div class="ca-pillar__header">${escHtml(pillar)}</div>
      <div class="ca-pillar__body">
        ${cats.map(cat => `
          <div class="ca-category">
            <div class="ca-category__name">${escHtml(cat.name)}</div>
            <div class="ca-category__products">
              ${cat.products.length ? cat.products.map(p => `
                <div class="ca-product-card" data-id="${p.id}" role="checkbox" aria-checked="false" tabindex="0">
                  <div class="ca-product-card__check"></div>
                  <span class="ca-product-card__name">${escHtml(p.name)}</span>
                </div>
              `).join('') : `<span class="ca-category__empty">Community links coming soon</span>`}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  productGrid.querySelectorAll('.ca-product-card').forEach(card => {
    card.addEventListener('click', () => toggleProduct(card));
    card.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') toggleProduct(card); });
  });
}

function toggleProduct(card) {
  const id = card.dataset.id;
  if (selectedIds.has(id)) { selectedIds.delete(id); card.classList.remove('selected'); card.setAttribute('aria-checked','false'); }
  else                      { selectedIds.add(id);    card.classList.add('selected');    card.setAttribute('aria-checked','true'); }
  btnScan.disabled = selectedIds.size === 0;
}

// ── Scan ──────────────────────────────────────────────────────────────────
btnScan.addEventListener('click', async () => {
  btnScan.disabled = true;
  scanStatus.textContent = 'Scanning communities…';
  try {
    const res  = await fetch(`${API}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productIds: [...selectedIds], limit: 15 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);

    openThreads = data.threads;
    allThreads  = data.allThreads;
    allThemes   = [];
    scanStatus.textContent = '';
    showResults();
    // Fire classification in the background — badges appear once it resolves
    classifyOpenThreads();
  } catch (e) {
    scanStatus.textContent = `Error: ${e.message}`;
    btnScan.disabled = false;
  }
});

function showResults() {
  viewSelector.classList.add('ca-hidden');
  viewResults.classList.remove('ca-hidden');
  tabCount.textContent = openThreads.length;
  renderZeroReplies(openThreads);
  renderThreads(openThreads);
  analyticsContent.innerHTML = '';
  analyseStatus.textContent = '';
}

function renderZeroReplies(threads) {
  const zeros = threads.filter(t => t.replies === 0);
  if (!zeros.length) { zeroSection.classList.add('ca-hidden'); return; }
  zeroSection.classList.remove('ca-hidden');
  zeroCount.textContent = zeros.length;
  zeroList.innerHTML = zeros.map((t, i) => `
    <div class="ca-zero-item" id="zero-item-${i}">
      <div class="ca-zero-item__top ca-zero-item__header">
        <span class="ca-zero-item__product">${escHtml(t.product)}</span>
        <div class="ca-zero-item__title">
          <a href="${escHtml(t.url)}" target="_blank" rel="noopener">${escHtml(t.title)}</a>
          ${classifyBadgesHtml(t)}
        </div>
        ${t.daysAgo != null ? `<span class="ca-zero-item__days ${t.daysAgo >= 14 ? 'ca-zero-item__days--urgent' : ''}">${t.daysAgo}d unanswered</span>` : ''}
        <svg class="ca-thread__chevron" viewBox="0 0 16 16"><path d="M8 11L3 5h10z" fill="currentColor"/></svg>
      </div>
      <div class="ca-zero-item__body ca-hidden">
        <div class="ca-thread__question">${t.body ? escHtml(t.body.slice(0, 800)) + (t.body.length > 800 ? '…' : '') : 'Original author added no additional detail.'}</div>
        <div class="ca-draft-box">
          <div class="ca-draft-box__label">Suggested Reply (watsonx.ai)</div>
          <div class="ca-draft-box__actions">
            <button class="ca-btn ca-btn--primary btn-zero-draft" data-index="${i}" style="height:32px;font-size:0.8rem">Generate Response</button>
            <button class="ca-btn ca-btn--ghost btn-zero-copy ca-hidden" data-index="${i}" style="height:32px;font-size:0.8rem">Copy</button>
          </div>
          <div class="zero-draft-status-${i}"></div>
          <textarea class="ca-draft-content ca-hidden zero-draft-area-${i}" rows="6"></textarea>
        </div>
      </div>
    </div>
  `).join('');

  // Expand/collapse on header click
  zeroList.querySelectorAll('.ca-zero-item__header').forEach(header => {
    header.addEventListener('click', e => {
      if (e.target.closest('a')) return;
      const item = header.closest('.ca-zero-item');
      const body = item.querySelector('.ca-zero-item__body');
      const isOpen = item.classList.toggle('open');
      body.classList.toggle('ca-hidden', !isOpen);
    });
  });

  // Wire up generate buttons
  zeroList.querySelectorAll('.btn-zero-draft').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      generateZeroDraft(parseInt(btn.dataset.index), zeros);
    });
  });
  // Wire up copy buttons
  zeroList.querySelectorAll('.btn-zero-copy').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const area = document.querySelector(`.zero-draft-area-${btn.dataset.index}`);
      if (area) { navigator.clipboard.writeText(area.value); btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy', 2000); }
    });
  });
}

async function generateZeroDraft(index, zeros) {
  const thread    = zeros[index];
  const statusEl  = document.querySelector(`.zero-draft-status-${index}`);
  const areaEl    = document.querySelector(`.zero-draft-area-${index}`);
  const copyBtn   = document.querySelector(`.btn-zero-copy[data-index="${index}"]`);
  const draftBtn  = document.querySelector(`.btn-zero-draft[data-index="${index}"]`);

  draftBtn.disabled = true;
  statusEl.innerHTML = '<span class="ca-draft-spinner">Generating with watsonx.ai…</span>';
  areaEl.classList.add('ca-hidden');

  try {
    const res  = await fetch(`${API}/api/draft-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    statusEl.innerHTML = '';
    areaEl.value = data.draft;
    areaEl.classList.remove('ca-hidden');
    copyBtn.classList.remove('ca-hidden');
    draftBtn.textContent = 'Regenerate';
    draftBtn.disabled = false;
  } catch (e) {
    statusEl.innerHTML = `<span class="ca-error">${e.message}</span>`;
    draftBtn.disabled = false;
  }
}

// ── New scan ──────────────────────────────────────────────────────────────
btnNewScan.addEventListener('click', () => {
  viewResults.classList.add('ca-hidden');
  viewSelector.classList.remove('ca-hidden');
  btnScan.disabled = selectedIds.size === 0;
  scanStatus.textContent = '';
});

// ── Tabs ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.ca-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.ca-tab').forEach(t => t.classList.remove('ca-tab--active'));
    tab.classList.add('ca-tab--active');
    const target = tab.dataset.tab;
    document.getElementById('tab-threads').classList.toggle('ca-hidden',   target !== 'threads');
    document.getElementById('tab-analytics').classList.toggle('ca-hidden', target !== 'analytics');
  });
});

// ── Filter ────────────────────────────────────────────────────────────────
filterInput.addEventListener('input', () => {
  const q = filterInput.value.toLowerCase();
  const filtered = openThreads.filter(t =>
    t.title.toLowerCase().includes(q) || (t.product || '').toLowerCase().includes(q)
  );
  renderZeroReplies(filtered);
  renderThreads(filtered);
});

// ── Thread list ───────────────────────────────────────────────────────────
function renderThreads(threads) {
  // Exclude zero-reply threads — they are shown in the highlight section above
  const nonZero = threads.filter(t => t.replies > 0);
  if (!nonZero.length) {
    threadsList.innerHTML = '<div class="ca-empty">No threads found.</div>';
    return;
  }
  threadsList.innerHTML = nonZero.map((t, i) => {
    const replyLabel = t.replies === 0 ? '0 replies' : `${t.replies} replies`;
    const badgeClass = t.replies === 0 ? 'ca-thread__badge--zero' : t.replies < 3 ? 'ca-thread__badge--low' : 'ca-thread__badge--mid';
    return `
    <div class="ca-thread" data-index="${i}" id="thread-${i}">
      <div class="ca-thread__header">
        <span class="ca-thread__badge ${badgeClass}">${replyLabel}</span>
        <div class="ca-thread__meta">
          <div class="ca-thread__title">
            <span class="ca-thread__product-tag">${escHtml(t.product)}</span>
            <a href="${escHtml(t.url)}" target="_blank" rel="noopener">${escHtml(t.title)}</a>
          </div>
          ${classifyBadgesHtml(t)}
          <div class="ca-thread__info">
            ${t.age ? `Posted ${escHtml(t.age)}` : ''}${t.author ? ` by ${escHtml(t.author)}` : ''}${(t.age || t.author) ? ' · ' : ''}${t.unanswered ? '🔴 Unanswered' : '🟡 Open (no accepted answer)'}
          </div>
        </div>
        <svg class="ca-thread__chevron" viewBox="0 0 16 16"><path d="M8 11L3 5h10z" fill="currentColor"/></svg>
      </div>
      <div class="ca-thread__body ca-hidden">
        <div class="ca-thread__question">${t.body ? escHtml(t.body.slice(0, 800)) + (t.body.length > 800 ? '…' : '') : 'Original author added no additional detail.'}</div>
        <div class="ca-draft-box">
          <div class="ca-draft-box__label">Suggested Reply (watsonx.ai)</div>
          <div class="ca-draft-box__actions">
            <button class="ca-btn ca-btn--primary btn-draft" data-index="${i}">Generate Draft</button>
            <button class="ca-btn ca-btn--ghost btn-copy ca-hidden" data-index="${i}">Copy</button>
          </div>
          <div class="draft-status-${i}"></div>
          <textarea class="ca-draft-content ca-hidden draft-area-${i}" rows="8"></textarea>
        </div>
      </div>
    </div>`;
  }).join('');

  // Expand/collapse
  threadsList.querySelectorAll('.ca-thread__header').forEach(h => {
    h.addEventListener('click', e => {
      if (e.target.closest('a')) return;
      const card = h.closest('.ca-thread');
      const body = card.querySelector('.ca-thread__body');
      const isOpen = card.classList.toggle('open');
      body.classList.toggle('ca-hidden', !isOpen);
    });
  });

  // Draft buttons
  threadsList.querySelectorAll('.btn-draft').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      generateDraft(parseInt(btn.dataset.index), threads);
    });
  });

  // Copy buttons
  threadsList.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const area = document.querySelector(`.draft-area-${btn.dataset.index}`);
      if (area) { navigator.clipboard.writeText(area.value); btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy', 2000); }
    });
  });
}

async function generateDraft(index, threads) {
  const thread = threads[index];
  const statusEl = document.querySelector(`.draft-status-${index}`);
  const areaEl   = document.querySelector(`.draft-area-${index}`);
  const copyBtn  = document.querySelector(`.btn-copy[data-index="${index}"]`);
  const draftBtn = document.querySelector(`.btn-draft[data-index="${index}"]`);

  draftBtn.disabled = true;
  statusEl.innerHTML = '<span class="ca-draft-spinner">Generating with watsonx.ai…</span>';
  areaEl.classList.add('ca-hidden');

  try {
    const res  = await fetch(`${API}/api/draft-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    statusEl.innerHTML = '';
    areaEl.value = data.draft;
    areaEl.classList.remove('ca-hidden');
    copyBtn.classList.remove('ca-hidden');
    draftBtn.textContent = 'Regenerate';
    draftBtn.disabled = false;
  } catch (e) {
    statusEl.innerHTML = `<span class="ca-error">${e.message}</span>`;
    draftBtn.disabled = false;
  }
}

// ── Theme analytics ───────────────────────────────────────────────────────
btnAnalyse.addEventListener('click', async () => {
  if (!allThreads.length) return;
  btnAnalyse.disabled = true;
  analyseStatus.textContent = 'Analysing with watsonx.ai…';
  try {
    const res  = await fetch(`${API}/api/analyse-themes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threads: allThreads }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    allThemes = data.themes;
    analyseStatus.textContent = '';
    renderAnalytics(allThemes);
    btnAnalyse.disabled = false;
  } catch (e) {
    analyseStatus.textContent = `Error: ${e.message}`;
    btnAnalyse.disabled = false;
  }
});

function renderAnalytics(themes) {
  if (!themes.length) { analyticsContent.innerHTML = '<div class="ca-empty">No themes found.</div>'; return; }
  const maxCount = Math.max(...themes.map(t => t.count));

  const barRows = themes.map((t, i) => {
    const pct = Math.round((t.count / maxCount) * 100);
    const col = THEME_COLOURS[i % THEME_COLOURS.length];
    return `
      <div class="ca-bar-chart__row">
        <div class="ca-bar-chart__label" title="${escHtml(t.theme)}">${escHtml(t.theme)}</div>
        <div class="ca-bar-chart__track">
          <div class="ca-bar-chart__fill" style="width:${pct}%;background:${col}">
            <span class="ca-bar-chart__val">${t.count}</span>
          </div>
        </div>
      </div>`;
  }).join('');

  const cards = themes.map((t, i) => {
    const col = THEME_COLOURS[i % THEME_COLOURS.length];
    const pct = Math.round((t.count / maxCount) * 100);
    const threadLinks = (t.threads || []).slice(0, 4).map(th =>
      `<a class="ca-theme-card__thread-link" href="${escHtml(th.url)}" target="_blank">${escHtml(th.title)}</a>`
    ).join('');
    return `
      <div class="ca-theme-card">
        <div class="ca-theme-card__header">
          <div class="ca-theme-card__dot" style="background:${col}"></div>
          <span class="ca-theme-card__name">${escHtml(t.theme)}</span>
        </div>
        <p class="ca-theme-card__desc">${escHtml(t.description)}</p>
        <div class="ca-theme-card__bar-wrap">
          <div class="ca-theme-card__bar" style="width:${pct}%;background:${col}"></div>
        </div>
        <div class="ca-theme-card__count">${t.count} thread${t.count !== 1 ? 's' : ''}</div>
        <div class="ca-theme-card__threads">${threadLinks}</div>
      </div>`;
  }).join('');

  analyticsContent.innerHTML = `
    <div class="ca-bar-chart">${barRows}</div>
    <div class="ca-themes-grid">${cards}</div>
  `;
}

// ── Classification ────────────────────────────────────────────────────────
async function classifyOpenThreads() {
  if (!openThreads.length) return;
  classifying = true;

  // Show a brief loading hint in the thread info rows
  document.querySelectorAll('.ca-classify-loading').forEach(el => {
    el.textContent = 'Classifying…';
  });

  try {
    const res  = await fetch(`${API}/api/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threads: openThreads }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);

    // Merge classification back into openThreads (matched by url)
    const byUrl = {};
    data.threads.forEach(t => { byUrl[t.url] = t.classification; });
    openThreads.forEach(t => {
      if (byUrl[t.url]) t.classification = byUrl[t.url];
    });

    // Re-render both thread lists so the badges appear
    const q = filterInput.value.toLowerCase();
    const visible = q
      ? openThreads.filter(t => t.title.toLowerCase().includes(q) || (t.product || '').toLowerCase().includes(q))
      : openThreads;
    renderZeroReplies(visible);
    renderThreads(visible);
  } catch (e) {
    console.warn('Classification failed:', e.message);
  } finally {
    classifying = false;
  }
}

/**
 * Render the two classification badges (quality + response type) for a thread.
 * Returns empty string while classification is still loading.
 */
function classifyBadgesHtml(thread) {
  if (!thread.classification) {
    return classifying ? '<div class="ca-classify-loading">Classifying…</div>' : '';
  }
  const c  = thread.classification;
  const qm = c.qualityMeta  || {};
  const rm = c.responseMeta || {};

  // Use light text for yellow (light background colour)
  const qLight = (qm.colour === '#f1c21b') ? ' ca-classify-badge--light' : '';
  const rLight = '';

  const rationaleLine = c.rationale && !c.rationale.includes('heuristic')
    ? `<div class="ca-classify-rationale">${escHtml(c.rationale)}</div>`
    : '';

  return `
    <div class="ca-classify-row">
      <span class="ca-classify-badge${qLight}" style="background:${escHtml(qm.colour || '#8d8d8d')}" title="${escHtml(qm.hint || '')}">
        <span class="ca-classify-badge__dot"></span>${escHtml(qm.label || c.quality)}
      </span>
      <span class="ca-classify-badge${rLight}" style="background:${escHtml(rm.colour || '#8d8d8d')}" title="${escHtml(rm.hint || '')}">
        <span class="ca-classify-badge__dot"></span>${escHtml(rm.label || c.responseType)}
      </span>
    </div>
    ${rationaleLine}`;
}

// ── Utils ─────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
