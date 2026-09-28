// JARVIS control adapter — optional, allowlisted external control surface.
//
// This module exists so a *future*, separately-hosted JARVIS integration
// (local Python/FastAPI + Electron, described in JARVIS_INTEGRATION.md)
// has a single, narrow, auditable entry point into a running God's Eye
// View page: `invoke(actionName, args)`.
//
// Design constraints (see JARVIS_INTEGRATION.md for the full rationale):
//   - Only the actions in `JARVIS_ACTIONS` (allowlist.js) can be reached.
//     There is no "run arbitrary JS" or "eval" escape hatch anywhere here.
//   - Every action is implemented by the same `runGevAction` dispatcher
//     the shipped voice agent uses (src/voice/gevActions.js) — nothing is
//     reimplemented or guessed.
//   - This module never touches the microphone or the OpenAI Realtime
//     voice session. It is completely independent of src/voice/session*.
//   - Nothing here opens a network listener. Wiring this adapter up to an
//     actual transport (a local WebSocket, CDP, an Electron IPC channel,
//     ...) is the embedding host's responsibility — see bridge.js for the
//     one opt-in, in-page attachment point this repo ships.
import { createGevActionRunner } from '../../voice/gevActions.js';
import { JARVIS_ACTIONS, listJarvisActions } from './allowlist.js';

/**
 * Build a JARVIS control adapter over a running application's scene.
 *
 * @param {object} deps
 * @param {object} deps.viewer Cesium viewer instance.
 * @param {object} deps.styleManager Application style/controls manager.
 * @param {object} deps.dataManager Application data/layers manager.
 * @param {object|null} [deps.sceneDirector] Optional scene playback director.
 * @param {object|null} [deps.annotations] Optional annotation engine.
 * @param {Function|null} [deps.runAction] Pre-built `runGevAction`-style
 *   function (as returned by `createGevActionRunner`). When omitted, one is
 *   built from the other dependencies — this is the normal path for a
 *   standalone JARVIS adapter that must not share state with the voice
 *   agent's own runner instance.
 */
export function createJarvisControlAdapter({
  viewer,
  styleManager,
  dataManager,
  sceneDirector = null,
  annotations = null,
  runAction = null,
} = {}) {
  if (typeof runAction !== 'function') {
    if (!viewer || !styleManager || !dataManager) {
      throw new Error(
        'createJarvisControlAdapter requires { viewer, styleManager, ' +
          'dataManager } (or a pre-built runAction)',
      );
    }
    runAction = createGevActionRunner({
      viewer,
      styleManager,
      dataManager,
      sceneDirector,
      annotations,
    });
  }

  async function invoke(actionName, rawArgs = {}) {
    const name = String(actionName || '').trim();
    const entry = JARVIS_ACTIONS[name];
    if (!entry) {
      return {
        ok: false,
        action: name || null,
        error: `Action "${actionName}" is not allowlisted for JARVIS control`,
      };
    }
    let args;
    try {
      args = entry.validate(
        rawArgs && typeof rawArgs === 'object' ? rawArgs : {},
      );
    } catch (error) {
      return {
        ok: false,
        action: name,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    try {
      const result = await runAction(entry.gevAction, args);
      return { ...result, requestedAction: name };
    } catch (error) {
      return {
        ok: false,
        action: name,
        requestedAction: name,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return {
    version: 1,
    listActions: listJarvisActions,
    invoke,
  };
}
