require('dotenv').config();
const axios = require('axios');

const key = process.env.OPENROUTER_API_KEY;
console.log('OpenRouter key present:', key ? '[OK] ' + key.slice(0, 20) + '...' : '[MISSING]');

if (!key) {
  console.error('No API key found in .env');
  process.exit(1);
}

const model = process.env.LLM_MODEL || 'qwen/qwen-2.5-72b-instruct';
console.log('Model:', model);
console.log('Calling OpenRouter...');

axios.post('https://openrouter.ai/api/v1/chat/completions', {
  model,
  messages: [{ role: 'user', content: 'Reply with raw JSON only: {"status":"ok","model":"working"}' }],
  temperature: 0.1,
  response_format: { type: 'json_object' },
}, {
  headers: {
    Authorization: 'Bearer ' + key,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'http://localhost:5173',
    'X-Title': 'ExpiryAlert AI',
  },
  timeout: 15000,
}).then(r => {
  const msg = r.data.choices[0].message.content;
  console.log('[OK] AI response:', msg);
  console.log('   Model used :', r.data.model);
  console.log('   Tokens used:', r.data.usage?.total_tokens);
}).catch(e => {
  const err = e.response?.data || e.message;
  console.error('[ERROR] AI error:', JSON.stringify(err, null, 2));
  process.exit(1);
});
