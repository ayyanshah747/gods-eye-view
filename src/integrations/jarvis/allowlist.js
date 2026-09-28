// JARVIS control adapter — action allowlist.
//
// This is intentionally a small, closed subset of the real GEV actions
// implemented in `src/voice/gevActions.js` (the same dispatcher the
// in-app voice agent uses). Nothing here invents new scene behavior —
// every entry maps to an existing, already-shipped `runGevAction` name.
//
// Keeping the list here (rather than inline in the adapter) makes the
// allowed surface auditable in one place and easy to diff in review.

import { CITY_POIS } from '../../locations.js';

/** Preset location ids the real `fly_to_location` action accepts. */
export const JARVIS_LOCATION_IDS = Object.freeze(Object.keys(CITY_POIS));

/**
 * Data layers JARVIS is allowed to toggle. This is deliberately a subset
 * of every layer `set_layer_visibility` supports upstream — aircraft
 * (`flights`), `satellites`, and `earthquakes` only, per the integration
 * brief. Extending this list is a reviewable, explicit change.
 */
export const JARVIS_LAYER_IDS = Object.freeze([
  'flights',
  'satellites',
  'earthquakes',
]);

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * One entry per allowlisted JARVIS action.
 *
 * `gevAction` is the real action name passed to `runGevAction`. `validate`
 * receives the raw request args and must return a plain object of
 * sanitized args to forward, or throw a descriptive `Error` — it never
 * evaluates code and never accepts free-form scripts or expressions.
 */
export const JARVIS_ACTIONS = Object.freeze({
  open_globe: {
    gevAction: 'zoom_to_globe',
    description:
      'Reset the camera to the default whole-Earth globe view. (The web ' +
      'app must already be running — this does not launch a process.)',
    validate: () => ({}),
  },
  reset_view: {
    gevAction: 'zoom_to_globe',
    description: 'Alias of open_globe: resets the camera to the globe view.',
    validate: () => ({}),
  },
  set_layer_visibility: {
    gevAction: 'set_layer_visibility',
    description:
      'Enable or disable one allowlisted data layer (aircraft, satellites, ' +
      'or earthquakes).',
    validate: (args) => {
      const layerId = String(args?.layerId || '').trim();
      if (!JARVIS_LAYER_IDS.includes(layerId)) {
        throw new Error(
          `Layer "${args?.layerId}" is not allowlisted for JARVIS control. ` +
            `Allowed: ${JARVIS_LAYER_IDS.join(', ')}`,
        );
      }
      if (typeof args?.enabled !== 'boolean') {
        throw new Error('set_layer_visibility requires a boolean "enabled"');
      }
      return { layerId, enabled: args.enabled };
    },
  },
  fly_to_location: {
    gevAction: 'fly_to_location',
    description:
      'Fly the camera to one of the built-in preset locations. Free-text ' +
      'search and arbitrary coordinates are intentionally not exposed.',
    validate: (args) => {
      const locationId = String(args?.locationId || '')
        .trim()
        .toLowerCase();
      if (!JARVIS_LOCATION_IDS.includes(locationId)) {
        throw new Error(
          `Location "${args?.locationId}" is not allowlisted for JARVIS ` +
            `control. Allowed: ${JARVIS_LOCATION_IDS.join(', ')}`,
        );
      }
      const out = { locationId };
      if (args?.waitForArrival === true) out.waitForArrival = true;
      if (isFiniteNumber(args?.rangeM)) out.rangeM = args.rangeM;
      return out;
    },
  },
});

export function listJarvisActions() {
  return Object.entries(JARVIS_ACTIONS).map(([name, entry]) => ({
    name,
    description: entry.description,
  }));
}
