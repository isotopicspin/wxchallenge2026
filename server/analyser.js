/**
 * analyser.js — clusters threads into themes via watsonx.ai,
 * with a keyword-frequency fallback when not configured.
 */
const { generate, isConfigured } = require('./watsonx');

async function analyseThemes(threads) {
  if (!isConfigured) return keywordFallback(threads);

  const titles = threads
    .map((t, i) => `${i + 1}. [${t.product}] ${t.title}`)
    .join('\n');

  const prompt = `You are a data analyst reviewing IBM community forum threads.

Identify the top recurring themes across these thread titles. Return ONLY a valid JSON array — no other text.

THREADS:
${titles}

Each theme object must have: "theme" (string), "description" (string), "threadNumbers" (1-based number[]).
Identify 4–8 themes.

JSON ARRAY:`;

  try {
    const raw = await generate(prompt, { maxTokens: 600, temperature: 0.1 });
    const jsonMatch = raw.match(/\[[\s\S]+\]/);
    if (!jsonMatch) throw new Error('No JSON array in response');
    const themes = JSON.parse(jsonMatch[0]);
    return themes.map(t => ({
      theme:       t.theme,
      description: t.description,
      count:       t.threadNumbers.length,
      threads:     t.threadNumbers.map(n => threads[n - 1]).filter(Boolean),
    }));
  } catch (err) {
    console.error('Theme analysis failed, using keyword fallback:', err.message);
    return keywordFallback(threads);
  }
}

function keywordFallback(threads) {
  const keywords = [
    'error', 'upgrade', 'install', 'permission', 'api', 'performance',
    'ssl', 'authentication', 'report', 'formula', 'cube', 'dimension',
    'security', 'export', 'import', 'connection', 'timeout', 'language',
    'font', 'rest', 'namespace', 'planning', 'cognos',
  ];
  const groups = {};
  for (const kw of keywords) {
    const matched = threads.filter(t =>
      (t.title + ' ' + (t.body || '')).toLowerCase().includes(kw)
    );
    if (matched.length > 0) {
      groups[kw] = {
        theme:       kw.charAt(0).toUpperCase() + kw.slice(1),
        description: `Threads related to "${kw}"`,
        count:       matched.length,
        threads:     matched,
      };
    }
  }
  return Object.values(groups).sort((a, b) => b.count - a.count).slice(0, 8);
}

module.exports = { analyseThemes };
