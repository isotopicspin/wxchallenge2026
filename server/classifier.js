/**
 * classifier.js — rates each unanswered thread on two axes:
 *
 *   quality      — how clear / well-formed is the original question?
 *                  values: "clear" | "vague" | "incomplete"
 *
 *   responseType — what kind of effort does replying require?
 *                  values: "quick-answer" | "needs-investigation"
 *                        | "needs-clarification" | "out-of-scope"
 *
 * When watsonx.ai is configured a single prompt is used per thread.
 * When it is not configured a lightweight keyword heuristic is used instead.
 */
const { generate, isConfigured } = require('./watsonx');

// ── Label maps ────────────────────────────────────────────────────────────────

const QUALITY_META = {
  'clear':      { label: 'Clear question',   colour: '#24a148', hint: 'The question is specific and well-formed.' },
  'vague':      { label: 'Vague question',   colour: '#f1c21b', hint: 'The question lacks detail or context.' },
  'incomplete': { label: 'Incomplete',        colour: '#da1e28', hint: 'Critical information is missing.' },
};

const RESPONSE_META = {
  'quick-answer':        { label: 'Quick answer',        colour: '#0043ce', hint: 'Can be answered with a short, direct reply.' },
  'needs-investigation': { label: 'Needs investigation', colour: '#6929c4', hint: 'Requires research or log analysis.' },
  'needs-clarification': { label: 'Needs clarification', colour: '#ff832b', hint: 'Ask the poster for more details before answering.' },
  'out-of-scope':        { label: 'Out of scope',        colour: '#8d8d8d', hint: 'Not a product support question (e.g. off-topic).' },
};

const QUALITY_VALUES   = Object.keys(QUALITY_META);
const RESPONSE_VALUES  = Object.keys(RESPONSE_META);

// ── watsonx classifier ────────────────────────────────────────────────────────

async function classifyWithWatsonx(thread) {
  const prompt = `You are a Customer Success Manager triaging IBM Community forum threads.

Classify the following unanswered thread on TWO dimensions.

THREAD TITLE: ${thread.title}
THREAD BODY:
${thread.body || '(no body — base classification on the title only)'}

DIMENSION 1 — question quality. Choose exactly one:
  clear       — the question is specific, well-formed and has sufficient context
  vague       — the question is unclear, ambiguous or lacks important context
  incomplete  — critical information (e.g. version, error message, config) is missing

DIMENSION 2 — response type needed. Choose exactly one:
  quick-answer        — a short, direct reply will suffice
  needs-investigation — thorough research, log analysis or testing is required
  needs-clarification — the CSM should ask the poster for more details first
  out-of-scope        — not an IBM product support question (e.g. off-topic, spam)

Return ONLY a JSON object with keys "quality", "responseType", and "rationale" (one sentence).
Example: {"quality":"vague","responseType":"needs-clarification","rationale":"The user mentions an error but does not include the error message or version."}

JSON:`;

  try {
    const raw = await generate(prompt, { maxTokens: 120, temperature: 0.1 });
    const match = raw.match(/\{[\s\S]+\}/);
    if (!match) throw new Error('No JSON object in response');
    const parsed = JSON.parse(match[0]);

    const quality      = QUALITY_VALUES.includes(parsed.quality)      ? parsed.quality      : 'vague';
    const responseType = RESPONSE_VALUES.includes(parsed.responseType) ? parsed.responseType : 'needs-investigation';
    const rationale    = typeof parsed.rationale === 'string' ? parsed.rationale.slice(0, 200) : '';

    return {
      quality,
      qualityMeta:  QUALITY_META[quality],
      responseType,
      responseMeta: RESPONSE_META[responseType],
      rationale,
    };
  } catch (err) {
    console.warn(`[classifier] watsonx classification failed for "${thread.title}": ${err.message}`);
    return heuristicClassify(thread);
  }
}

// ── Heuristic fallback ────────────────────────────────────────────────────────

const INCOMPLETE_SIGNALS  = ['error', 'not working', 'issue', 'problem', 'fails', 'failed', 'broken', 'crash'];
const CLARIFICATION_HINTS = ['how do i', 'how to', 'is it possible', 'can i', 'what is', 'where is', 'when does'];
const OOS_SIGNALS         = ['for sale', 'hiring', 'discount', 'pricing', 'competitor'];
const INVESTIGATION_HINTS = ['performance', 'slow', 'latency', 'memory', 'cpu', 'deadlock', 'upgrade', 'migrate', 'integration'];

function heuristicClassify(thread) {
  const text = `${thread.title} ${thread.body || ''}`.toLowerCase();
  const hasBody = !!(thread.body && thread.body.trim().length > 40);

  // Quality
  let quality = 'clear';
  if (INCOMPLETE_SIGNALS.some(s => text.includes(s)) && !hasBody) {
    quality = 'incomplete';
  } else if (!hasBody || text.split(' ').length < 12) {
    quality = 'vague';
  }

  // Response type
  let responseType = 'quick-answer';
  if (OOS_SIGNALS.some(s => text.includes(s))) {
    responseType = 'out-of-scope';
  } else if ((quality === 'incomplete' || CLARIFICATION_HINTS.some(s => text.includes(s))) && !hasBody) {
    responseType = 'needs-clarification';
  } else if (INVESTIGATION_HINTS.some(s => text.includes(s))) {
    responseType = 'needs-investigation';
  }

  return {
    quality,
    qualityMeta:  QUALITY_META[quality],
    responseType,
    responseMeta: RESPONSE_META[responseType],
    rationale:    '(heuristic — watsonx.ai not configured)',
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Classify a single thread. Returns:
 * {
 *   quality:      'clear' | 'vague' | 'incomplete',
 *   qualityMeta:  { label, colour, hint },
 *   responseType: 'quick-answer' | 'needs-investigation' | 'needs-clarification' | 'out-of-scope',
 *   responseMeta: { label, colour, hint },
 *   rationale:    string,
 * }
 */
async function classifyThread(thread) {
  if (!isConfigured) return heuristicClassify(thread);
  return classifyWithWatsonx(thread);
}

/**
 * Classify a batch of threads. Returns the same array with a `classification`
 * property added to each thread object.
 */
async function classifyThreads(threads) {
  return Promise.all(
    threads.map(async t => ({
      ...t,
      classification: await classifyThread(t),
    }))
  );
}

module.exports = { classifyThread, classifyThreads, QUALITY_META, RESPONSE_META };
