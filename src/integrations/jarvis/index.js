// Public entry point for the optional JARVIS control adapter.
// See JARVIS_INTEGRATION.md for the integration design and security model.
export { createJarvisControlAdapter } from './adapter.js';
export { installJarvisBridge } from './bridge.js';
export {
  JARVIS_ACTIONS,
  JARVIS_LAYER_IDS,
  JARVIS_LOCATION_IDS,
  listJarvisActions,
} from './allowlist.js';
