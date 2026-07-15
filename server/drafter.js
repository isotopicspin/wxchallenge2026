/**
 * drafter.js — generates a suggested community reply via watsonx.ai.
 * Returns { draft, sources } where sources is an array of reference objects.
 */
const { generate } = require('./watsonx');

/**
 * Generates a draft reply and extracts any cited sources from the model output.
 * Sources are parsed from a "SOURCES:" block at the end of the generated text.
 * @param {{ title: string, body?: string, product: string }} thread
 * @returns {Promise<{ draft: string, sources: Array<{ title: string, url: string, type: string }> }>}
 */
async function draftAnswer(thread) {
  const prompt = `<|system|>
You are an IBM ${thread.product} technical specialist drafting a public IBM Community forum reply.

Rules:
- Reply ONLY to the specific question below.
- Do NOT include an email subject line.
- Do NOT start with "Dear..." and do not write an announcement.
- Do NOT mention office hours, webinars, events, invitations, or unrelated topics.
- Do NOT invent product behaviour, configuration names, or steps not supported by the question.
- If the question lacks detail, say what you would check and ask for the missing details.
- Keep it practical, cautious, and suitable for a human CSM/CSE to review before posting.
- Return only the reply text.
<|user|>
PRODUCT: ${thread.product}
QUESTION TITLE: ${thread.title}

QUESTION BODY:
${thread.body || '(No body text was available. Use the title only and ask for clarification where needed.)'}

Write a helpful, accurate, and friendly community forum reply. Requirements:
- Directly address the question with actionable guidance
- Be technically precise; include CLI snippets, REST API calls, or config steps where relevant
- Reference relevant IBM documentation or community posts if you know them
- Keep to 3–5 paragraphs, community-appropriate tone
- End with an invitation for follow-up questions
- After the reply, add a SOURCES section listing any IBM docs or community links referenced, one per line in the format:
  SOURCES:
  [title] | [url] | [type: docs|community|other]

DRAFT REPLY:`;

  const raw = await generate(prompt, { maxTokens: 800, temperature: 0.3 });
  return parseDraftAndSources(raw);
}

/**
 * Splits the raw model output into the draft text and a structured sources array.
 * If no SOURCES block is present, sources will be an empty array.
 * @param {string} raw
 * @returns {{ draft: string, sources: Array<{ title: string, url: string, type: string }> }}
 */
function parseDraftAndSources(raw) {
  const sourcesMarker = /^SOURCES:\s*$/im;
  const match = sourcesMarker.exec(raw);
  if (!match) return { draft: raw.trim(), sources: [] };

  const draft   = raw.slice(0, match.index).trim();
  const srcBlock = raw.slice(match.index + match[0].length).trim();
  const sources  = srcBlock.split('\n')
    .map(line => {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length < 2 || !parts[1]) return null;
      return { title: parts[0] || parts[1], url: parts[1], type: (parts[2] || 'other').toLowerCase() };
    })
    .filter(Boolean);

  return { draft, sources };
}

module.exports = { draftAnswer };

// Made with Bob
