/**
 * drafter.js — generates a suggested community reply via watsonx.ai.
 */
const { generate } = require('./watsonx');

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

Draft a concise reply to this forum question.
<|assistant|>`;

  return generate(prompt, { maxTokens: 700, temperature: 0 });
}

module.exports = { draftAnswer };
