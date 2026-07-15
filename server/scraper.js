/**
 * scraper.js
 * Fetches threads from IBM Community groups using Puppeteer (headless browser)
 * because the thread table is JavaScript-rendered and not available in static HTML.
 *
 * Uses the digestviewer page which renders the full thread table including
 * answered status. Paginates to collect more threads for analytics.
 */

const puppeteer = require('puppeteer');
const fetch     = require('node-fetch');

const BASE = 'https://community.ibm.com';

let _browser = null;

async function getBrowser() {
  if (_browser) {
    try {
      // Check the browser is still alive; this throws if the connection is closed
      await _browser.version();
    } catch {
      _browser = null;
    }
  }
  if (!_browser) {
    _browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return _browser;
}

/**
 * Convert an age string like "3 days ago" / "14 hours ago" to a numeric days value.
 * Used both server-side and injected into the browser context.
 */
function parseDaysAgo(ageStr) {
  if (!ageStr) return null;
  const m = ageStr.match(/(\d+)\s+(hour|day|month|year)/i);
  if (!m) return null;
  const n    = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  if (unit === 'hour')  return Math.max(1, Math.round(n / 24));
  if (unit === 'day')   return n;
  if (unit === 'month') return n * 30;
  if (unit === 'year')  return n * 365;
  return null;
}

/**
 * Scrape one page of the digest viewer and return thread rows.
 */
async function scrapePage(communityKey, pageIndex = 1) {
  const browser = await getBrowser();
  const page    = await browser.newPage();

  try {
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    await page.setCacheEnabled(false);

    // Cache buster avoids getting a stale digest page after the app has been running a while.
    const url = `${BASE}/community/user/groups/community-home/digestviewer?communitykey=${communityKey}&pageindex=${pageIndex}&_=${Date.now()}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for actual discussion/question links rather than generic table rows.
    await page.waitForSelector(
      'a[href*="/discussion/"], a[href*="/question/"], a[href*="/thread/"]',
      { timeout: 20000 }
    ).catch(() => {});

    await new Promise(r => setTimeout(r, 1500));

    return await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('tr').forEach(row => {
        const link = row.querySelector(
          'a[href*="/discussion/"], a[href*="/question/"], a[href*="/thread/"]'
        );
        if (!link) return;
        const title = link.textContent.trim();
        if (!title || title.length < 5) return;
        const url      = link.href.split('#')[0];
        const answered = row.textContent.includes('Answered');
        // Reply count is the number that appears immediately before the age string.
        // Anchoring to the age avoids picking up years (e.g. "2026") from the title.
        const replyCountMatch = row.textContent.match(/\b(\d{1,4})\s+(?:\d+\s+(?:hour|day|month|year)|\d{2}\/\d{2}\/\d{2})/i);
        const replies = replyCountMatch ? parseInt(replyCountMatch[1], 10) : 0;
        const text = row.textContent;

        // Date can appear as "11 days ago" OR "04/21/26" (MM/DD/YY)
        const relMatch  = text.match(/(\d+)\s+(hour|day|month|year)s?\s+ago/i);
        const dateMatch = text.match(/\b(\d{2})\/(\d{2})\/(\d{2,4})\b/);
        // Author appears as "by Firstname Lastname"
        const authorMatch = text.match(/\bby\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
        const author = authorMatch ? authorMatch[1] : null;

        let ageStr  = null;
        let daysAgo = null;

        if (relMatch) {
          ageStr = relMatch[0];
          const v = parseInt(relMatch[1], 10);
          const u = relMatch[2].toLowerCase();
          if (u === 'hour')  daysAgo = Math.max(1, Math.round(v / 24));
          if (u === 'day')   daysAgo = v;
          if (u === 'month') daysAgo = v * 30;
          if (u === 'year')  daysAgo = v * 365;
        } else if (dateMatch) {
          // Parse MM/DD/YY or MM/DD/YYYY
          const month = parseInt(dateMatch[1], 10) - 1;
          const day   = parseInt(dateMatch[2], 10);
          let   year  = parseInt(dateMatch[3], 10);
          if (year < 100) year += 2000;
          const posted = new Date(year, month, day);
          daysAgo = Math.floor((Date.now() - posted.getTime()) / 86400000);
          ageStr  = `${daysAgo} days ago`;
        }

        results.push({ title, url, answered, unanswered: !answered, replies, age: ageStr, daysAgo, author });
      });
      return results;
    });
  } finally {
    await page.close();
  }
}

/**
 * Fetch threads across multiple digest pages.
 * Returns all unique threads found (up to maxPages * ~10 threads).
 */
async function fetchThreadList(communityKey, maxPages = 3) {
  const seen    = new Set();
  const threads = [];

  for (let p = 1; p <= maxPages; p++) {
    try {
      const rows = await scrapePage(communityKey, p);
      if (!rows.length) break;  // no more pages
      let newOnThisPage = 0;
      for (const row of rows) {
        if (!seen.has(row.url)) {
          seen.add(row.url);
          threads.push(row);
          newOnThisPage++;
        }
      }
      if (newOnThisPage === 0) break;  // stop if page returned only duplicates
    } catch (err) {
      console.error(`Page ${p} scrape error:`, err.message);
      break;
    }
  }

  return threads;
}

/**
 * Fetch the full body text of a single thread page.
 */
async function fetchThreadBody(threadUrl) {
  try {
    const res = await fetch(threadUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return '';
    const html = await res.text();

    function htmlToText(h) {
      return h
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|pre|section|article)>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    const bodyMatch = html.match(/posted[\s\S]{0,300}?<div[^>]*>\s*([\s\S]{100,4000}?)<\/div>\s*<\/div>/);
    if (bodyMatch) return htmlToText(bodyMatch[1]).slice(0, 3000);
    const fallback = html.match(/<p[^>]*>([\s\S]{80,3000}?)<\/p>/);
    return fallback ? htmlToText(fallback[1]).slice(0, 3000) : '';
  } catch {
    return '';
  }
}

/**
 * Full scan: returns { open, all, excluded }
 *   open     — unanswered/open threads enriched with body text (for report tab + draft answers)
 *   all      — every non-excluded thread (for theme analytics)
 *   excluded — threads whose title matched an exclusion phrase, shown in their own UI section
 * @param {string[]} exclusions - phrases to match against thread titles (case-insensitive)
 */
async function scanGroup(communityKey, productName, limit = 10, exclusions = []) {
  const threads = await fetchThreadList(communityKey, 5);

  // Partition into kept vs excluded
  const lowerExclusions = exclusions.map(e => e.toLowerCase());
  const filtered  = lowerExclusions.length
    ? threads.filter(t =>  !lowerExclusions.some(ex => t.title.toLowerCase().includes(ex)))
    : threads;
  const excluded  = lowerExclusions.length
    ? threads.filter(t =>   lowerExclusions.some(ex => t.title.toLowerCase().includes(ex)))
    : [];

  console.log(`[${productName}] scraped ${threads.length} threads (${filtered.filter(t => !t.answered).length} open, ${filtered.filter(t => t.answered).length} answered${excluded.length ? `, ${excluded.length} excluded` : ''})`);

  const open = filtered.filter(t => !t.answered).slice(0, limit);
  const enriched = await Promise.all(open.map(async t => ({
    ...t,
    product: productName,
    body: await fetchThreadBody(t.url),
  })));

  const all = filtered.map(t => ({ ...t, product: productName }));
  return { open: enriched, all, excluded: excluded.map(t => ({ ...t, product: productName })) };
}

module.exports = { scanGroup, fetchThreadList, fetchThreadBody };

// Made with Bob
