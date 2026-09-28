import test from 'node:test';
import assert from 'node:assert/strict';
import { createJarvisControlAdapter } from './adapter.js';

/** A fake runGevAction that records calls and echoes back a fixed result. */
function fakeRunner(script = {}) {
  const calls = [];
  const runAction = async (name, args) => {
    calls.push({ name, args });
    if (script[name]) return script[name](args);
    return { ok: true, action: name };
  };
  return { runAction, calls };
}

test('invoke rejects any action not on the allowlist, without calling the runner', async () => {
  const { runAction, calls } = fakeRunner();
  const adapter = createJarvisControlAdapter({ runAction });

  const result = await adapter.invoke('run_arbitrary_script', { code: 'alert(1)' });

  assert.equal(result.ok, false);
  assert.match(result.error, /not allowlisted/);
  assert.equal(calls.length, 0);
});

test('invoke rejects invalid arguments before reaching the real GEV action', async () => {
  const { runAction, calls } = fakeRunner();
  const adapter = createJarvisControlAdapter({ runAction });

  const result = await adapter.invoke('set_layer_visibility', {
    layerId: 'military',
    enabled: true,
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /not allowlisted/);
  assert.equal(calls.length, 0);
});

test('invoke forwards a validated, allowlisted action to the real runner', async () => {
  const { runAction, calls } = fakeRunner({
    set_layer_visibility: (args) => ({ ok: true, action: 'set_layer_visibility', ...args }),
  });
  const adapter = createJarvisControlAdapter({ runAction });

  const result = await adapter.invoke('set_layer_visibility', {
    layerId: 'satellites',
    enabled: true,
    extraneousField: 'dropped',
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'set_layer_visibility');
  assert.deepEqual(calls[0].args, { layerId: 'satellites', enabled: true });
  assert.equal(result.ok, true);
  assert.equal(result.requestedAction, 'set_layer_visibility');
});

test('open_globe and reset_view both dispatch the real zoom_to_globe action', async () => {
  const { runAction, calls } = fakeRunner({
    zoom_to_globe: () => ({ ok: true, action: 'zoom_to_globe', heightKm: 20000 }),
  });
  const adapter = createJarvisControlAdapter({ runAction });

  const opened = await adapter.invoke('open_globe');
  const reset = await adapter.invoke('reset_view');

  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((c) => c.name), ['zoom_to_globe', 'zoom_to_globe']);
  assert.equal(opened.ok, true);
  assert.equal(reset.ok, true);
});

test('fly_to_location only ever forwards a known preset locationId', async () => {
  const { runAction, calls } = fakeRunner({
    fly_to_location: (args) => ({ ok: true, action: 'fly_to_location', ...args }),
  });
  const adapter = createJarvisControlAdapter({ runAction });

  const result = await adapter.invoke('fly_to_location', { locationId: 'tokyo' });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, { locationId: 'tokyo' });
  assert.equal(result.ok, true);

  const rejected = await adapter.invoke('fly_to_location', { query: 'a secret base' });
  assert.equal(rejected.ok, false);
  assert.equal(calls.length, 1); // still one — the bad request never reached the runner
});

test('invoke turns a thrown error from the real action into a structured failure', async () => {
  const { runAction } = fakeRunner({
    zoom_to_globe: () => {
      throw new Error('viewer not ready');
    },
  });
  const adapter = createJarvisControlAdapter({ runAction });

  const result = await adapter.invoke('open_globe');

  assert.equal(result.ok, false);
  assert.equal(result.error, 'viewer not ready');
  assert.equal(result.requestedAction, 'open_globe');
});

test('createJarvisControlAdapter requires either scene deps or a prebuilt runner', () => {
  assert.throws(() => createJarvisControlAdapter({}), /requires/);
});

test('listActions reports the same allowlisted names the validator enforces', () => {
  const { runAction } = fakeRunner();
  const adapter = createJarvisControlAdapter({ runAction });
  const names = adapter.listActions().map((a) => a.name);
  assert.ok(names.includes('open_globe'));
  assert.ok(names.includes('set_layer_visibility'));
  assert.ok(names.includes('fly_to_location'));
  assert.ok(!names.includes('control_scene'));
  assert.ok(!names.includes('annotate_map'));
});
