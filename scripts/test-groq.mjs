import 'dotenv/config';

const url = (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1') + '/chat/completions';
if (!process.env.GROQ_API_KEY) {
  console.error('GROQ_API_KEY not set. Run `npm run write-env` or add it to .env.local');
  process.exit(1);
}

const prompt = process.argv.slice(2).join(' ') || 'Say hello';

console.log('Sending prompt to GROQ:', prompt.substring(0, 80));

const res = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
  },
  body: JSON.stringify({ model: process.env.BITB_LLM_MODEL || 'llama-3.1-70b-instruct', messages: [{ role: 'user', content: prompt }] }),
});

const data = await res.text();
console.log('Response:', data);
