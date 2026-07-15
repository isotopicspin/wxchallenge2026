/**
 * watsonx.js — IBM watsonx.ai text generation client.
 * Reads credentials from config/watsonx.json.
 * Returns a stub message when credentials are not yet configured.
 */
const fetch = require('node-fetch');
const path  = require('path');
const fs    = require('fs');

let config = {};
try {
  config = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../config/watsonx.json'), 'utf8')
  );
} catch {
  // credentials file absent — app starts in offline/demo mode
}
const isConfigured = !!(config.apiKey && config.projectId);

let _iamToken  = null;
let _iamExpiry = 0;

async function getIAMToken() {
  if (_iamToken && Date.now() < _iamExpiry) return _iamToken;
  const res = await fetch('https://iam.cloud.ibm.com/identity/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${encodeURIComponent(config.apiKey)}`,
  });
  if (!res.ok) throw new Error(`IAM error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  _iamToken  = data.access_token;
  _iamExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return _iamToken;
}

async function generate(prompt, { maxTokens = 800, temperature = 0.3 } = {}) {
  if (!isConfigured) {
    return '[watsonx.ai not yet configured — add your credentials to config/watsonx.json]';
  }
  const token = await getIAMToken();

  // greedy decoding ignores temperature — use 'sample' only when temperature > 0
  const decoding_method = temperature > 0 ? 'sample' : 'greedy';
  const samplingParams  = temperature > 0 ? { temperature, repetition_penalty: 1.1 } : {};

  const res = await fetch(
    `${config.url}/ml/v1/text/generation?version=2023-05-29`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        model_id:   config.modelId,
        project_id: config.projectId,
        input:      prompt,
        parameters: { decoding_method, max_new_tokens: maxTokens, ...samplingParams },
      }),
    }
  );
  if (!res.ok) throw new Error(`watsonx error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.results?.[0]?.generated_text?.trim() ?? '';
}

module.exports = { generate, isConfigured };
