// JARVIS control adapter — opt-in, in-page attachment.
//
// By default this does nothing at all: the application boots exactly as it
// does upstream, with no JARVIS surface attached. A host embedding this
// build (or a developer testing the integration locally) opts in by
// setting `window.__GEV_JARVIS_BRIDGE_ENABLED__ = true` *before* the app
// script runs. That is the only way `window.__gevJarvisControl` appears.
//
// This never starts a network listener and never runs arbitrary script —
// it only exposes `createJarvisControlAdapter`'s `listActions`/`invoke`
// pair (see adapter.js + allowlist.js) on `window` so a local, trusted
// automation host (e.g. driving the page over the Chrome DevTools
// Protocol) can call it directly.
import { createJarvisControlAdapter } from './adapter.js';

/**
 * Attach the JARVIS control surface to `window`, but only when explicitly
 * opted into. Returns the installed control object, or `null` when the
 * bridge was not enabled (the normal, default case).
 *
 * @param {object} scene The same `{ viewer, styleManager, dataManager,
 *   sceneDirector, annotations }` shape already assembled for
 *   `window.__godsEyeView` in src/app/tools.js.
 * @param {object} [lifecycle]
 * @param {(cleanup: () => void) => void} [lifecycle.defer] Application
 *   teardown hook, matching the `defer` used elsewhere in src/app/tools.js.
 */
export function installJarvisBridge(scene, { defer } = {}) {
  if (
    typeof window === 'undefined' ||
    window.__GEV_JARVIS_BRIDGE_ENABLED__ !== true
  ) {
    return null;
  }
  const control = createJarvisControlAdapter(scene);
  window.__gevJarvisControl = control;
  console.info(
    '[gods-eye-view] JARVIS control bridge enabled (opt-in). ' +
      `Allowlisted actions: ${control
        .listActions()
        .map((a) => a.name)
        .join(', ')}.`,
  );
  defer?.(() => {
    if (window.__gevJarvisControl === control) delete window.__gevJarvisControl;
  });
  return control;
}
