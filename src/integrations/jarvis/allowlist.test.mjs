import test from 'node:test';
import assert from 'node:assert/strict';
import { CITY_POIS } from '../../locations.js';
import {
  JARVIS_ACTIONS,
  JARVIS_LAYER_IDS,
  JARVIS_LOCATION_IDS,
  listJarvisActions,
} from './allowlist.js';

test('JARVIS_LOCATION_IDS tracks the real preset locations, nothing invented', () => {
  assert.deepEqual([...JARVIS_LOCATION_IDS].sort(), Object.keys(CITY_POIS).sort());
});

test('JARVIS_LAYER_IDS is limited to aircraft, satellites, and earthquakes', () => {
  assert.deepEqual([...JARVIS_LAYER_IDS].sort(), [
    'earthquakes',
    'flights',
    'satellites',
  ]);
});

test('listJarvisActions exposes exactly the allowlisted action names', () => {
  const names = listJarvisActions()
    .map((action) => action.name)
    .sort();
  assert.deepEqual(names, [
    'fly_to_location',
    'open_globe',
    'reset_view',
    'set_layer_visibility',
  ]);
});

test('open_globe and reset_view both map to the real zoom_to_globe action', () => {
  assert.equal(JARVIS_ACTIONS.open_globe.gevAction, 'zoom_to_globe');
  assert.equal(JARVIS_ACTIONS.reset_view.gevAction, 'zoom_to_globe');
});

test('set_layer_visibility.validate accepts only allowlisted layers', () => {
  const { validate } = JARVIS_ACTIONS.set_layer_visibility;
  assert.deepEqual(validate({ layerId: 'flights', enabled: true }), {
    layerId: 'flights',
    enabled: true,
  });
  assert.throws(() => validate({ layerId: 'military', enabled: true }), /not allowlisted/);
  assert.throws(() => validate({ layerId: 'flights', enabled: 'yes' }), /boolean/);
});

test('fly_to_location.validate rejects anything but a known preset id', () => {
  const { validate } = JARVIS_ACTIONS.fly_to_location;
  assert.deepEqual(validate({ locationId: 'nyc' }), { locationId: 'nyc' });
  assert.deepEqual(validate({ locationId: 'NYC' }), { locationId: 'nyc' });
  assert.throws(
    () => validate({ locationId: 'area-51' }),
    /not allowlisted/,
  );
  assert.throws(
    () => validate({ query: 'somewhere off-menu' }),
    /not allowlisted/,
  );
});

test('fly_to_location.validate passes through only the safe optional fields', () => {
  const { validate } = JARVIS_ACTIONS.fly_to_location;
  assert.deepEqual(validate({ locationId: 'sf', waitForArrival: true, rangeM: 5000 }), {
    locationId: 'sf',
    waitForArrival: true,
    rangeM: 5000,
  });
  // Unrecognized/unsanitary fields (e.g. an injected script) are dropped, not forwarded.
  const sanitized = validate({ locationId: 'sf', script: 'alert(1)' });
  assert.deepEqual(sanitized, { locationId: 'sf' });
});

test('open_globe.validate ignores any supplied arguments', () => {
  assert.deepEqual(JARVIS_ACTIONS.open_globe.validate({ anything: 'ignored' }), {});
});
