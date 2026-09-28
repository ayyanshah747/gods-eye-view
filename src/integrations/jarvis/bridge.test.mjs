import test from 'node:test';
import assert from 'node:assert/strict';
import { installJarvisBridge } from './bridge.js';

const sceneStub = () => ({
  runAction: async (name) => ({ ok: true, action: name }),
});

test('installJarvisBridge is a no-op when window does not exist', () => {
  const hadWindow = Object.hasOwn(globalThis, 'window');
  const priorWindow = globalThis.window;
  delete globalThis.window;
  try {
    const result = installJarvisBridge(sceneStub(), { defer: () => {} });
    assert.equal(result, null);
  } finally {
    if (hadWindow) globalThis.window = priorWindow;
  }
});

test('installJarvisBridge stays off by default (flag unset)', () => {
  globalThis.window = {};
  try {
    const result = installJarvisBridge(sceneStub(), { defer: () => {} });
    assert.equal(result, null);
    assert.equal('__gevJarvisControl' in globalThis.window, false);
  } finally {
    delete globalThis.window;
  }
});

test('installJarvisBridge stays off when the flag is falsy or the wrong type', () => {
  for (const flag of [false, 0, 'true', undefined, null]) {
    globalThis.window = { __GEV_JARVIS_BRIDGE_ENABLED__: flag };
    try {
      const result = installJarvisBridge(sceneStub(), { defer: () => {} });
      assert.equal(result, null, `flag ${JSON.stringify(flag)} must not enable the bridge`);
    } finally {
      delete globalThis.window;
    }
  }
});

test('installJarvisBridge attaches window.__gevJarvisControl only when explicitly enabled', () => {
  globalThis.window = { __GEV_JARVIS_BRIDGE_ENABLED__: true };
  try {
    const control = installJarvisBridge(sceneStub(), { defer: () => {} });
    assert.ok(control);
    assert.equal(globalThis.window.__gevJarvisControl, control);
    assert.equal(typeof control.invoke, 'function');
    assert.equal(typeof control.listActions, 'function');
  } finally {
    delete globalThis.window;
  }
});

test('installJarvisBridge registers cleanup that removes the attached control', () => {
  globalThis.window = { __GEV_JARVIS_BRIDGE_ENABLED__: true };
  try {
    let cleanup;
    const control = installJarvisBridge(sceneStub(), {
      defer: (fn) => {
        cleanup = fn;
      },
    });
    assert.equal(globalThis.window.__gevJarvisControl, control);
    cleanup();
    assert.equal('__gevJarvisControl' in globalThis.window, false);
  } finally {
    delete globalThis.window;
  }
});
