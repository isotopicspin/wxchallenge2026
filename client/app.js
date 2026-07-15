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
let openThreads     = [];   // unanswered/open — shown in report tab
let allThreads      = [];   // every thread incl. answered — used for analytics
let excludedThreads = [];   // threads hidden by exclusion rules — shown in own section
let allThemes       = [];
let selectedIds     = new Set();
let classifying     = false; // true while /api/classify is in-flight

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
const excludedSection  = document.getElementById('excluded-section');
const excludedCount    = document.getElementById('excluded-count');
const excludedList     = document.getElementById('excluded-list');

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

    openThreads     = data.threads;
    allThreads      = data.allThreads;
    excludedThreads = data.excludedThreads || [];
    allThemes       = [];
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
  renderExcluded(excludedThreads);
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
        <svg class="ca-thread__chevron ca-thread__chevron--last" viewBox="0 0 16 16"><path d="M8 11L3 5h10z" fill="currentColor"/></svg>
        <label class="ca-thread__exclude-label ca-thread__exclude-label--right" title="Move to excluded list">
          <input type="checkbox" class="ca-excl-zero-checkbox" data-index="${i}" />
          <span class="ca-excl-checkbox__box"></span>
          <span class="ca-excl-label-text">Exclude</span>
        </label>
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

  // Exclude checkboxes
  zeroList.querySelectorAll('.ca-excl-zero-checkbox').forEach(cb => {
    cb.addEventListener('change', e => {
      e.stopPropagation();
      cb.checked = false;  // revert tick until confirmed
      const thread = zeros[parseInt(cb.dataset.index)];
      showConfirmModal({
        heading:      'Move to excluded list?',
        text:         'Are you sure you want to move this thread to the excluded list? It will no longer appear in the main unanswered threads.',
        confirmLabel: 'Move to excluded',
        thread,
        onConfirm:    () => excludeThread(thread),
      });
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
  areaEl.value = '';
  areaEl.classList.add('ca-hidden');
  copyBtn.classList.add('ca-hidden');

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
    renderSources(data.sources || [], statusEl.parentElement);
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
  // Excluded section is not filtered — always shows the full exclusion list
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
        <svg class="ca-thread__chevron ca-thread__chevron--last" viewBox="0 0 16 16"><path d="M8 11L3 5h10z" fill="currentColor"/></svg>
        <label class="ca-thread__exclude-label ca-thread__exclude-label--right" title="Move to excluded list">
          <input type="checkbox" class="ca-excl-thread-checkbox" data-index="${i}" />
          <span class="ca-excl-checkbox__box"></span>
          <span class="ca-excl-label-text">Exclude</span>
        </label>
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

  // Exclude checkboxes
  threadsList.querySelectorAll('.ca-excl-thread-checkbox').forEach(cb => {
    cb.addEventListener('change', e => {
      e.stopPropagation();
      cb.checked = false;  // revert tick until confirmed
      const idx    = parseInt(cb.dataset.index);
      const thread = nonZero[idx];
      showConfirmModal({
        heading:      'Move to excluded list?',
        text:         'Are you sure you want to move this thread to the excluded list? It will no longer appear in the main unanswered threads.',
        confirmLabel: 'Move to excluded',
        thread,
        onConfirm:    () => excludeThread(thread),
      });
    });
  });

  // Draft buttons
  threadsList.querySelectorAll('.btn-draft').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      generateDraft(parseInt(btn.dataset.index), nonZero);
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
  areaEl.value = '';
  areaEl.classList.add('ca-hidden');
  copyBtn.classList.add('ca-hidden');

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
    renderSources(data.sources || [], statusEl.parentElement);
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

/**
 * Moves a thread from openThreads into excludedThreads and re-renders both lists.
 * @param {{ url: string }} thread
 */
function excludeThread(thread) {
  openThreads     = openThreads.filter(t => t.url !== thread.url);
  if (!excludedThreads.find(t => t.url === thread.url)) {
    excludedThreads.push(thread);
  }
  reRenderAllLists();
}

// ── Excluded threads section ──────────────────────────────────────────────
/**
 * Renders the "Excluded by filter rules" section below the thread list.
 * Each item has a checkbox — ticking it reinstates that thread into the main
 * open-threads list so it can receive a draft reply.
 */
function renderExcluded(threads) {
  if (!threads.length) { excludedSection.classList.add('ca-hidden'); return; }
  excludedSection.classList.remove('ca-hidden');
  excludedCount.textContent = threads.length;
  excludedList.innerHTML = threads.map((t, i) => `
    <div class="ca-excluded-item" id="excl-item-${i}">
      <span class="ca-excluded-item__product">${escHtml(t.product)}</span>
      <a class="ca-excluded-item__title" href="${escHtml(t.url)}" target="_blank" rel="noopener">${escHtml(t.title)}</a>
      ${t.daysAgo != null ? `<span class="ca-excluded-item__age">${t.daysAgo}d ago</span>` : ''}
      <span class="ca-excluded-item__status">${t.answered ? 'Answered' : 'Unanswered'}</span>
      <label class="ca-excluded-item__reinstate" title="Move to main thread list">
        <input type="checkbox" class="ca-excl-checkbox" data-index="${i}" />
        <span class="ca-excl-checkbox__box"></span>
      </label>
    </div>
  `).join('');

  // Wire up checkboxes — show confirmation modal with two destination choices
  excludedList.querySelectorAll('.ca-excl-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      cb.checked = false;  // revert tick until confirmed
      const idx    = parseInt(cb.dataset.index);
      const thread = excludedThreads[idx];
      showConfirmModal({
        heading:       'Reinstate thread',
        text:          'Where would you like to move this thread?',
        confirm2Label: 'Move to Unanswered',
        onConfirm2:    () => reinstateThread(idx, 'unanswered'),
        confirmLabel:  'Move to Answered',
        onConfirm:     () => reinstateThread(idx, 'answered'),
        thread,
      });
    });
  });
}

/**
 * Moves a thread from excludedThreads back into openThreads.
 * @param {number} idx - index into excludedThreads
 * @param {'unanswered'|'answered'} destination - which section to place the thread in.
 *   'unanswered' forces replies=0 (zero-reply highlight); 'answered' forces replies=1 (green section).
 */
function reinstateThread(idx, destination) {
  const thread = { ...excludedThreads[idx] };
  // Override replies so render functions route to the correct section
  thread.replies = destination === 'unanswered' ? 0 : Math.max(thread.replies || 0, 1);
  excludedThreads = excludedThreads.filter((_, i) => i !== idx);
  if (!openThreads.find(t => t.url === thread.url)) {
    openThreads.push(thread);
  }
  reRenderAllLists();
}

// ── Sources panel ─────────────────────────────────────────────────────────
/**
 * Inserts (or replaces) a sources panel inside the given draft-box container.
 * Does nothing when the sources array is empty.
 *
 * @param {Array<{ title: string, url: string, type: string }>} sources
 * @param {HTMLElement} draftBoxEl - the .ca-draft-box element to inject into
 */
function renderSources(sources, draftBoxEl) {
  // Remove any previous sources panel in this box
  const existing = draftBoxEl.querySelector('.ca-sources-panel');
  if (existing) existing.remove();
  if (!sources.length) return;

  const ICONS = { docs: '📄', community: '💬', other: '🔗' };

  const panel = document.createElement('div');
  panel.className = 'ca-sources-panel';
  panel.innerHTML = `
    <div class="ca-sources-panel__label">Sources &amp; References</div>
    <ul class="ca-sources-panel__list">
      ${sources.map(s => `
        <li class="ca-sources-panel__item">
          <span class="ca-sources-panel__icon">${ICONS[s.type] || ICONS.other}</span>
          <a class="ca-sources-panel__link" href="${escHtml(s.url)}" target="_blank" rel="noopener">
            ${escHtml(s.title)}
          </a>
          <span class="ca-sources-panel__type">${escHtml(s.type || 'ref')}</span>
        </li>
      `).join('')}
    </ul>
  `;
  draftBoxEl.appendChild(panel);
}

/**
 * Re-renders zero-reply section, main thread list, and excluded section
 * using the current state of openThreads and excludedThreads.
 * Respects the active filter input value.
 */
function reRenderAllLists() {
  const q = filterInput.value.toLowerCase();
  const filtered = openThreads.filter(t =>
    t.title.toLowerCase().includes(q) || (t.product || '').toLowerCase().includes(q)
  );
  tabCount.textContent = openThreads.length;
  renderZeroReplies(filtered);
  renderThreads(filtered);
  renderExcluded(excludedThreads);
}

// ── Confirmation modal ────────────────────────────────────────────────────
/**
 * Shows a shared confirmation modal for moving a thread in either direction.
 * Pass `confirm2Label` + `onConfirm2` to show a second action button (e.g. two reinstate destinations).
 *
 * @param {{ heading: string, text: string, confirmLabel: string, thread: object, onConfirm: Function, confirm2Label?: string, onConfirm2?: Function }} opts
 */
function showConfirmModal({ heading, text, confirmLabel, thread, onConfirm, confirm2Label, onConfirm2 }) {
  const overlay = document.getElementById('ca-modal-overlay');
  document.getElementById('ca-modal-heading').textContent        = heading;
  document.getElementById('ca-modal-text').textContent           = text;
  document.getElementById('ca-modal-thread-title').textContent   = thread.title;
  document.getElementById('ca-modal-thread-product').textContent = thread.product || '';
  overlay.classList.remove('ca-hidden');

  const btnConfirm  = document.getElementById('ca-modal-confirm');
  const btnConfirm2 = document.getElementById('ca-modal-confirm2');
  const btnCancel   = document.getElementById('ca-modal-cancel');

  // Clone to remove stale listeners from previous invocations
  const newConfirm  = btnConfirm.cloneNode(true);
  const newConfirm2 = btnConfirm2.cloneNode(true);
  const newCancel   = btnCancel.cloneNode(true);

  newConfirm.textContent = confirmLabel;
  btnConfirm.replaceWith(newConfirm);
  btnCancel.replaceWith(newCancel);

  // Show/hide second confirm button
  if (confirm2Label && onConfirm2) {
    newConfirm2.textContent = confirm2Label;
    newConfirm2.classList.remove('ca-hidden');
    newConfirm2.addEventListener('click', () => { close(); onConfirm2(); });
  } else {
    newConfirm2.classList.add('ca-hidden');
  }
  btnConfirm2.replaceWith(newConfirm2);

  function close() { overlay.classList.add('ca-hidden'); }

  newConfirm.addEventListener('click', () => { close(); onConfirm(); });
  newCancel.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); }, { once: true });
}

// ── Utils ─────────────────────────────────────────────────────────────────
/**
 * Escapes a string for safe insertion into HTML.
 * Prevents XSS when rendering untrusted content from the API.
 */
function escHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Made with Bob
