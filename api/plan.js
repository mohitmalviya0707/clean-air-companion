// Vercel serverless function. Env: ANTHROPIC_API_KEY (required), ANTHROPIC_MODEL, ALLOWED_ORIGIN (optional).
import { parseProfile } from '../src/engine.js';
import { buildPrompt } from '../src/prompt.js';
import { validateAiPlan, extractJson } from '../src/validate.js';

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
export const buckets = new Map();

function limited(ip, now = Date.now()) {
  const hits = (buckets.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  buckets.set(ip, hits);
  if (buckets.size > 5000) buckets.clear(); // bound memory
  return hits.length > MAX_PER_WINDOW;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (process.env.ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AI is not configured' });

  const ip = String(req.headers?.['x-forwarded-for'] ?? 'unknown').split(',')[0].trim();
  if (limited(ip)) return res.status(429).json({ error: 'Too many requests, try again in a minute' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const { profile, errors } = parseProfile(body?.profile);
  if (errors.length) return res.status(400).json({ error: errors[0] });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        max_tokens: 1500,
        messages: [{ role: 'user', content: buildPrompt(profile) }],
      }),
    });
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    const data = await r.json();
    const text = (data.content ?? []).map((c) => c.text ?? '').join('');
    const plan = validateAiPlan(extractJson(text));
    if (!plan) return res.status(502).json({ error: 'AI returned an unusable plan' });
    return res.status(200).json(plan);
  } catch {
    return res.status(502).json({ error: 'AI request failed' }); // never leak upstream details
  } finally {
    clearTimeout(timer);
  }
}
