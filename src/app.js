import { CHOICES, WHO, HAVE, ACTIONS, parseProfile, buildPlan, exposureIndex } from './engine.js';
import { validateAiPlan } from './validate.js';

const $ = (id) => document.getElementById(id);
const AI_TIMEOUT_MS = 30_000;

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text; // textContent only: never innerHTML
  return node;
}

function fillSelect(id, options) {
  $(id).replaceChildren(...options.map((o) => Object.assign(make('option'), { value: o, textContent: o })));
}

function fillChips(id, entries, onChange) {
  $(id).replaceChildren(...entries.map(([value, label]) => {
    const box = Object.assign(make('input'), { type: 'checkbox', value });
    if (onChange) box.addEventListener('change', onChange);
    const l = make('label');
    l.append(box, make('span', '', label));
    return l;
  }));
}

const checked = (id) => [...$(id).querySelectorAll('input:checked')].map((i) => i.value);

function readProfile() {
  return parseProfile({
    city: $('city').value, aqi: $('aqi').value,
    commute: $('commute').value, cook: $('cook').value, heat: $('heat').value, home: $('home').value,
    who: checked('who'), have: checked('have'),
  });
}

function renderList(id, items) {
  $(id).replaceChildren(...items.map((x) => {
    const li = make('li');
    li.append(make('b', '', x.action), make('span', 'why', x.why));
    if (x.impact) li.append(document.createElement('br'), make('span', 'impact', `Impact: ${x.impact}`));
    return li;
  }));
}

function renderPlan(plan, { focus = true } = {}) {
  const badge = $('badge');
  badge.textContent = plan.aqi ?? '';
  if (plan.band) badge.style.background = plan.band.color;
  $('level').textContent = plan.heading;
  $('lead').textContent = plan.lead;
  renderList('routine', plan.routine);
  renderList('indoor', plan.indoor);
  renderList('alt', plan.alternatives);
  $('out').hidden = false;
  if (focus) $('result-h').focus({ preventScroll: false });
}

function updateImpact() {
  const ids = checked('whatif');
  const idx = exposureIndex(ids);
  $('fill').style.width = `${idx}%`;
  $('meter').setAttribute('aria-valuenow', String(idx));
  $('idx').textContent = ids.length
    ? `Exposure index ≈ ${idx}, about ${100 - idx}% lower than doing nothing`
    : 'Exposure index = 100 (baseline)';
  $('whyList').textContent = ACTIONS.filter((a) => ids.includes(a.id)).map((a) => a.why).join(' ');
}

let current = null;

function submit(event) {
  event.preventDefault();
  const { profile, errors } = readProfile();
  const aqi = $('aqi');
  if (errors.length) aqi.setAttribute('aria-invalid', 'true'); else aqi.removeAttribute('aria-invalid');
  $('aqi-err').textContent = errors[0] ?? '';
  if (errors.length) { aqi.focus(); return; }
  $('status').textContent = '';
  current = buildPlan(profile);
  renderPlan(current);
}

async function personalise() {
  const { profile, errors } = readProfile();
  if (errors.length) { submit(new Event('submit')); return; }
  const base = buildPlan(profile);
  current = base;
  renderPlan(base, { focus: false });
  const btn = $('ai');
  const status = $('status');
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  status.textContent = 'Personalising with AI…';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch(btn.dataset.endpoint, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const plan = validateAiPlan(await res.json());
    if (!plan) throw new Error('invalid');
    renderPlan({ ...base, lead: plan.lead || base.lead, routine: plan.routine, indoor: plan.indoor, alternatives: plan.alternatives });
    status.textContent = 'Personalised plan ready.';
  } catch {
    status.textContent = 'AI is unavailable right now. The built-in plan is shown instead.';
  } finally {
    clearTimeout(timer);
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
  }
}

for (const key of Object.keys(CHOICES)) fillSelect(key, CHOICES[key]);
fillChips('who', Object.entries(WHO));
fillChips('have', Object.entries(HAVE));
fillChips('whatif', ACTIONS.map((a) => [a.id, a.label]), updateImpact);
$('form').addEventListener('submit', submit);
$('ai').addEventListener('click', personalise);
updateImpact();
