/**
 * drafter.js — generates a suggested community reply via watsonx.ai.
 */
const { generate } = require('./watsonx');

async function draftAnswer(thread) {
  const prompt = `You are an expert IBM ${thread.product} technical support engineer and community advocate.

A customer has posted the following unanswered question in the IBM Community forum.

QUESTION TITLE: ${thread.title}

QUESTION BODY:
${thread.body || '(No body text available — base your answer on the title only)'}

Write a helpful, accurate, and friendly community forum reply. Requirements:
- Directly address the question with actionable guidance
- Be technically precise; include TI script snippets, REST API calls, or config steps where relevant
- Reference relevant IBM documentation or community posts if you know them
- Keep to 3–5 paragraphs, community-appropriate tone
- End with an invitation for follow-up questions

DRAFT REPLY:`;

  return generate(prompt, { maxTokens: 700, temperature: 0.3 });
}

module.exports = { draftAnswer };
