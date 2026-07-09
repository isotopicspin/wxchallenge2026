/**
 * server/index.js — Express API server for Community Advisor.
 *
 * GET  /api/products          → list configured products
 * POST /api/scan              → scrape threads for selected products
 * POST /api/draft-answer      → generate a draft reply for one thread
 * POST /api/analyse-themes    → cluster threads into themes
 */
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const { scanGroup }     = require('./scraper');
const { draftAnswer }   = require('./drafter');
const { analyseThemes } = require('./analyser');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

const groups = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../config/groups.json'), 'utf8')
);

// Flatten all products from all categories for easy lookup
const allProducts = groups.categories.flatMap(c => c.products);

// ── GET /api/products ──────────────────────────────────────────────────────
// Returns the full category structure for the UI to render
app.get('/api/products', (_req, res) => {
  res.json(groups.categories.map(c => ({
    id:       c.id,
    name:     c.name,
    pillar:   c.pillar,
    products: c.products.map(({ id, name }) => ({ id, name })),
  })));
});

// ── POST /api/scan ─────────────────────────────────────────────────────────
app.post('/api/scan', async (req, res) => {
  const { productIds = [], limit = 10 } = req.body;
  if (!productIds.length) return res.status(400).json({ error: 'No productIds provided' });
  const selected = allProducts.filter(p => productIds.includes(p.id));
  if (!selected.length) return res.status(400).json({ error: 'No matching products found' });
  try {
    const results = await Promise.all(
      selected.map(p => scanGroup(p.communityKey, p.name, limit))
    );
    res.json({
      threads:    results.flatMap(r => r.open),  // unanswered/open — for report tab
      allThreads: results.flatMap(r => r.all),   // every thread — for analytics
      scannedAt:  new Date().toISOString(),
    });
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/draft-answer ─────────────────────────────────────────────────
app.post('/api/draft-answer', async (req, res) => {
  const { thread } = req.body;
  if (!thread?.title) return res.status(400).json({ error: 'thread.title is required' });
  try {
    const draft = await draftAnswer(thread);
    res.json({ draft });
  } catch (err) {
    console.error('Draft error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/analyse-themes ───────────────────────────────────────────────
app.post('/api/analyse-themes', async (req, res) => {
  const { threads = [] } = req.body;
  if (!threads.length) return res.status(400).json({ error: 'No threads provided' });
  try {
    const themes = await analyseThemes(threads);
    res.json({ themes });
  } catch (err) {
    console.error('Analyse error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Fallback → SPA
app.get('/{*path}', (_req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

app.listen(PORT, () =>
  console.log(`Community Advisor running → http://localhost:${PORT}`)
);
