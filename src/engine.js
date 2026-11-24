// Pure, dependency-free logic shared by the browser UI, the serverless API and the tests.

/** AQI categories (US EPA style). `max` is the inclusive upper bound. */
export const BANDS = Object.freeze([
  { max: 50, label: 'Good', color: '#9be08a', advice: 'Air is fine for normal activity.' },
  { max: 100, label: 'Moderate', color: '#ffe066', advice: 'Sensitive people should ease off heavy outdoor exercise.' },
  { max: 150, label: 'Unhealthy for sensitive groups', color: '#ffb347', advice: 'Children, older adults and people with lung or heart conditions should limit time outdoors.' },
  { max: 200, label: 'Unhealthy', color: '#ff8a65', advice: 'Everyone may feel effects. Cut outdoor exertion and clean your indoor air.' },
  { max: 300, label: 'Very unhealthy', color: '#d97ad9', advice: 'Health warning: stay indoors where possible and use filtration.' },
  { max: 999, label: 'Hazardous', color: '#c0392b', advice: 'Emergency conditions: avoid outdoor exposure and protect your indoor space.' },
]);

export const CHOICES = Object.freeze({
  commute: ['Own car', 'Two-wheeler', 'Bus / metro', 'Walk / cycle', 'Work from home'],
  cook: ['LPG / gas', 'Electric / induction', 'Wood / biomass / coal'],
  heat: ['None / blankets', 'Electric heater', 'Wood / coal / waste burning', 'Central / gas'],
  home: ['Apartment, closed windows possible', 'Leaky / older house', 'Near main road'],
});

export const WHO = Object.freeze({
  children: 'Young children',
  elders: 'Older adults',
  pregnancy: 'Pregnancy',
  condition: 'Asthma / heart / lung condition',
  outdoor: 'Outdoor workers',
});

export const HAVE = Object.freeze({
  purifier: 'Air purifier (HEPA)',
  mask: 'N95 / FFP2 masks',
  plants: 'Indoor plants',
  balcony: 'Balcony or terrace',
});

/** Rough multiplicative effect of each habit on daily fine-particle exposure. */
export const ACTIONS = Object.freeze([
  { id: 'mask', label: 'Fitted N95 outdoors', factor: 0.25, why: 'A well-fitted N95/FFP2 blocks most fine particles; surgical or cloth masks do much less.' },
  { id: 'purifier', label: 'HEPA purifier in the bedroom', factor: 0.6, why: 'A right-sized HEPA unit with doors closed can cut indoor PM2.5 by roughly half or more.' },
  { id: 'timing', label: 'Outdoor trips mid-day, not at rush hour', factor: 0.8, why: 'Smog often peaks early morning and evening; shifting trips can lower exposure by around 20%.' },
  { id: 'seal', label: 'Seal gaps, ventilate off-peak', factor: 0.8, why: 'Closing windows at peak hours and sealing leaks slows smog entering your home.' },
  { id: 'transit', label: 'Transit instead of own car', factor: 0.9, why: 'In-car air on busy roads can be as dirty as outside, and transit removes your own emissions from the street.' },
  { id: 'clean', label: 'Clean fuel for cooking and heating', factor: 0.75, why: 'Smoke from biomass and coal is one of the largest indoor PM2.5 sources in many homes.' },
]);

/** @param {number} aqi @returns {typeof BANDS[number]} */
export function bandFor(aqi) {
  return BANDS.find((b) => aqi <= b.max) ?? BANDS[BANDS.length - 1];
}

const pick = (list, value) => (list.includes(value) ? value : list[0]);
const pickMany = (allowed, value) =>
  Array.isArray(value) ? [...new Set(value.filter((v) => Object.hasOwn(allowed, v)))] : [];

/**
 * Validate and sanitise untrusted input. Used on the client AND the server.
 * @returns {{profile: object, errors: string[]}}
 */
export function parseProfile(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const errors = [];
  const aqiOk = typeof r.aqi === 'number' || (typeof r.aqi === 'string' && r.aqi.trim() !== '');
  const aqiNum = aqiOk ? Number(r.aqi) : NaN;
  if (!Number.isFinite(aqiNum) || aqiNum < 0 || aqiNum > 999) errors.push('AQI must be a number from 0 to 999.');
  const city = String(r.city ?? '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} ,.'’-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return {
    errors,
    profile: {
      city,
      aqi: errors.length ? 0 : Math.round(aqiNum),
      commute: pick(CHOICES.commute, r.commute),
      cook: pick(CHOICES.cook, r.cook),
      heat: pick(CHOICES.heat, r.heat),
      home: pick(CHOICES.home, r.home),
      who: pickMany(WHO, r.who),
      have: pickMany(HAVE, r.have),
    },
  };
}

/** Relative daily exposure index (100 = doing nothing). Unknown ids are ignored. */
export function exposureIndex(ids) {
  const known = new Set(ids);
  const idx = ACTIONS.filter((a) => known.has(a.id)).reduce((acc, a) => acc * a.factor, 100);
  return Math.max(8, Math.round(idx));
}

const item = (action, why, impact) => ({ action, why, impact });

/** Build the rule-based plan (works offline, no AI needed). */
export function buildPlan(p) {
  const band = bandFor(p.aqi);
  const vulnerable = p.who.length > 0;
  const has = (k) => p.have.includes(k);
  const routine = [];
  const indoor = [];
  const alternatives = [];

  routine.push(item(
    p.aqi > 150 ? 'Move errands, walks and school sport to mid-afternoon' : 'Keep outdoor exercise to mid-day when air mixes best',
    'Smog is trapped near the ground on cold, still mornings and evenings, so those hours are usually worst.',
    '~20% lower daily exposure'));
  if (p.aqi > 150) {
    routine.push(item(
      vulnerable ? 'Keep children and vulnerable family members indoors today; swap park time for indoor play' : 'Swap hard outdoor workouts for indoor ones',
      'Children breathe faster for their size, and heavy breathing pulls more particles deep into the lungs.',
      'Removes the largest single source of intake'));
  }
  if (p.aqi > 100) {
    routine.push(item(
      has('mask') ? 'Wear your N95 on every outdoor trip and check it seals around nose and chin' : 'Get N95/FFP2 masks for the family (child sizes exist)',
      'Only filtering respirators stop fine particles. Fit matters more than price.',
      'Up to ~75% fewer particles inhaled while worn'));
  }
  if (p.commute === 'Own car') routine.push(item('Replace two car trips a week with metro, bus or a carpool, and combine errands', 'Traffic is a major smog source and you breathe it inside the car too.', 'Roughly 2 kg less CO₂ per 10 km avoided, plus less local PM'));
  if (p.commute === 'Two-wheeler') routine.push(item('Wear an N95 under the helmet and avoid the busiest corridors', 'Riders sit at tailpipe height.', 'Large drop in inhaled particles'));
  if (p.commute === 'Walk / cycle') routine.push(item('Use back streets and parks instead of main roads; skip the commute workout above AQI 200', 'Even 100 m from a major road, pollution can drop noticeably.', '~15–30% less exposure per trip'));
  if (p.who.includes('condition') || p.who.includes('pregnancy')) routine.push(item('Keep prescribed medication and your doctor’s action plan handy, and ask which AQI level should trigger precautions', 'Fine particles can aggravate lung and heart conditions.', 'Earlier, safer response to symptoms'));

  indoor.push(item('Close windows at the worst hours and air the home briefly when AQI dips, often mid-afternoon', 'Outdoor smog infiltrates through open windows within minutes.', 'Slows indoor build-up'));
  indoor.push(item(
    has('purifier') ? 'Run the purifier in the room where people spend most time, doors closed, on a medium-high setting' : 'Get one HEPA purifier sized for the bedroom, or build a DIY box-fan filter (MERV 13 filter on a box fan)',
    'Filtration is the most effective single step for cleaner indoor air.',
    'Indoor PM2.5 down roughly 50–70%'));
  indoor.push(item('Damp-mop and use a HEPA vacuum instead of dry sweeping or dusting', 'Dry cleaning re-suspends settled particles.', 'Less recirculated dust'));
  if (p.cook !== 'Electric / induction') indoor.push(item('Use the chimney or exhaust fan every time you cook', 'Cooking adds its own particles and NO₂ on top of smog.', 'Removes a major indoor source'));
  if (p.home !== 'Apartment, closed windows possible') indoor.push(item('Seal door and window gaps with weatherstrip tape; lay a rolled towel at door bases on bad nights', 'Leaky homes let outdoor air in constantly.', '~20% slower infiltration'));
  if (has('balcony')) indoor.push(item('Keep balcony doors shut and move exercise or yoga indoors on smog days', 'The balcony shares the same polluted air as the street.', 'Avoids needless exposure'));
  indoor.push(item(has('plants') ? 'Enjoy your plants, but don’t rely on them to clean the air' : 'Skip incense, candles and sprays on smog days', 'Plants do little for PM2.5 in practice, while incense and candles add fine particles.', 'Avoids self-made pollution'));

  if (p.heat === 'Wood / coal / waste burning') alternatives.push(item('Replace open burning with an efficient electric heater, layered clothing and insulated curtains; share a warm space with neighbours', 'Winter biomass and waste burning adds to the smog everyone breathes.', 'Cuts a main winter PM2.5 source'));
  if (p.cook === 'Wood / biomass / coal') alternatives.push(item('Move toward LPG or induction and look for local clean-cooking subsidies', 'Biomass smoke reaches very high indoor levels, especially for women and children.', 'Can lower kitchen PM2.5 by 80%+'));
  alternatives.push(item('Take public transport or cycle on low-AQI days and keep the car for essential trips', 'Cleaner mobility lowers both smog and carbon emissions.', '~0.2 kg CO₂ saved per km vs. a solo car'));
  alternatives.push(item('Start a street or building pledge: no leaf or waste burning, engines off when waiting, shared school-run rides', 'Small community rules lower the whole neighbourhood’s baseline.', 'Benefits everyone, children first'));
  alternatives.push(item('Report open burning and dust sources to your municipal helpline, and track AQI from an official or sensor network', 'Local data guides the day’s routine and supports enforcement.', 'Community-level impact'));

  const place = p.city ? ` in ${p.city}` : '';
  return { aqi: p.aqi, band, heading: `${band.label}${place}`, lead: band.advice, routine, indoor, alternatives };
}
