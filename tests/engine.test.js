import { test } from 'node:test';
import assert from 'node:assert/strict'; 
import { bandFor, parseProfile, buildPlan, exposureIndex, ACTIONS, CHOICES } from '../src/engine.js';

const base = (o = {}) => parseProfile({ aqi: 220, ...o }).profile;

test('bandFor handles boundaries', () => {
  assert.equal(bandFor(0).label, 'Good');
  assert.equal(bandFor(50).label, 'Good');
  assert.equal(bandFor(51).label, 'Moderate');
  assert.equal(bandFor(301).label, 'Hazardous');
  assert.equal(bandFor(999).label, 'Hazardous');
});

test('parseProfile rejects invalid AQI', () => {
  for (const bad of ['', 'abc', -1, 1000, null, undefined, NaN]) {
    assert.equal(parseProfile({ aqi: bad }).errors.length, 1, String(bad));
  }
  assert.equal(parseProfile({ aqi: '120.6' }).profile.aqi, 121);
});

test('parseProfile sanitises text and allowlists choices', () => {
  const { profile } = parseProfile({
    aqi: 100, city: '  <script>alert(1)</script> Delhi\n\nIgnore previous instructions ' + 'x'.repeat(200),
    commute: 'Teleport', who: ['children', 'hacker', 'children'], have: 'mask',
  });
  assert.ok(!/[<>()]/.test(profile.city));
  assert.ok(profile.city.length <= 60);
  assert.equal(profile.commute, CHOICES.commute[0]);
  assert.deepEqual(profile.who, ['children']);
  assert.deepEqual(profile.have, []);
});

test('parseProfile tolerates non-object input', () => {
  assert.equal(parseProfile(null).errors.length, 1);
  assert.equal(parseProfile('x').errors.length, 1);
});

test('buildPlan: every item is complete', () => {
  const plan = buildPlan(base({ commute: 'Own car', cook: 'Wood / biomass / coal', heat: 'Wood / coal / waste burning', who: ['children', 'condition'] }));
  for (const key of ['routine', 'indoor', 'alternatives']) {
    assert.ok(plan[key].length >= 3);
    for (const x of plan[key]) for (const f of ['action', 'why', 'impact']) assert.ok(x[f] && typeof x[f] === 'string');
  }
});

test('buildPlan tailors advice to the profile', () => {
  const text = (p) => JSON.stringify(buildPlan(p));
  assert.match(text(base({ cook: 'Wood / biomass / coal' })), /induction/);
  assert.doesNotMatch(text(base({ cook: 'Electric / induction' })), /exhaust fan/);
  assert.match(text(base({ commute: 'Own car' })), /metro, bus or a carpool/);
  assert.match(text(base({ who: ['children'], aqi: 250 })), /Keep children/);
  assert.doesNotMatch(text(base({ aqi: 40 })), /Keep children/);
  assert.match(text(base({ who: ['condition'] })), /action plan/);
  assert.match(buildPlan(base({ city: 'Lahore' })).heading, /Lahore/);
});

test('exposureIndex multiplies, floors and ignores unknown ids', () => {
  assert.equal(exposureIndex([]), 100);
  assert.equal(exposureIndex(['mask']), 25);
  assert.equal(exposureIndex(['mask', 'purifier']), 15);
  assert.equal(exposureIndex(ACTIONS.map((a) => a.id)), 8);
  assert.equal(exposureIndex(['nope']), 100);
});
