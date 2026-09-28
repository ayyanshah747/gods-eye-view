# JARVIS integration (optional)

This document describes an **optional, off-by-default** control surface that
lets a separate, locally-hosted assistant ("JARVIS" — a Python/FastAPI +
Electron + OmniRoute application that is **not part of this repository**)
drive a small, allowlisted set of God's Eye View actions in a running
browser tab.

Nothing described here is enabled unless you explicitly turn it on. With no
opt-in flag set, this build behaves exactly like upstream God's Eye View —
same UI, same voice agent, same layers, no extra code paths taken at
runtime.

> **Status:** this repository ships the browser-side control surface only —
> the allowlist, the adapter, and the opt-in attachment point. It does
> **not** ship a JARVIS host, a network listener, or a transport. Wiring an
> actual local JARVIS installation up to this surface is future work that
> has to happen on the JARVIS side (see [What this repo does **not**
> do](#what-this-repo-does-not-do) and [Connecting a future local JARVIS
> host](#connecting-a-future-local-jarvis-host)).

## Why this design

God's Eye View already has a real, validated, in-app action dispatcher:
`runGevAction`, built by `createGevActionRunner` in
[`src/voice/gevActions.js`](src/voice/gevActions.js). It's the same function
the shipped voice agent calls when you ask it (by voice) to reset the view,
toggle a layer, or fly somewhere. It already:

- validates every action's arguments,
- knows how to talk to the Cesium viewer, the style manager, and the data
  layer manager, and
- is exported from the package (`gods-eye-view/voice/actions`) as a stable,
  documented module.

Rather than inventing a second, parallel way to move the camera or toggle a
layer, the JARVIS adapter in `src/integrations/jarvis/` is a thin,
**closed allowlist** wrapper around that exact same dispatcher. It cannot
do anything the voice agent couldn't already do, and it can do much less:
only the four actions below.

## Supported actions

These are the **only** actions JARVIS (or anything else using this adapter)
can invoke. The full allowlist lives in
[`src/integrations/jarvis/allowlist.js`](src/integrations/jarvis/allowlist.js).

| Action                  | Real GEV action        | Arguments                                                                 | What it does                                                                                   |
| ------------------------ | ----------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `open_globe`             | `zoom_to_globe`          | none                                                                        | Resets the camera to the default whole-Earth globe view.                                       |
| `reset_view`             | `zoom_to_globe`          | none                                                                        | Alias of `open_globe`.                                                                          |
| `set_layer_visibility`   | `set_layer_visibility`   | `layerId`: one of `flights`, `satellites`, `earthquakes`; `enabled`: boolean | Turns the aircraft, satellite, or earthquake layer on or off.                                   |
| `fly_to_location`        | `fly_to_location`        | `locationId`: one of `austin`, `sf`, `nyc`, `tokyo`, `london`, `paris`, `dubai`, `dc`; optional `waitForArrival`, `rangeM` | Flies the camera to one of the built-in preset cities. |

Everything else the real voice agent can do (free-text search, arbitrary
latitude/longitude, scene playback, CCTV, radio, cockpit mode, annotations,
map-stack switching, and so on) is **intentionally not exposed**. Extending
this list is a deliberate, reviewable code change to
`src/integrations/jarvis/allowlist.js` — not a runtime configuration option.

### Why only these three layers, and only preset locations

- `flights` (OpenSky, keyless anonymous mode, with an adsb.lol fallback),
  `satellites` (CelesTrak TLEs), and `earthquakes` (USGS) all work with
  **no API key and no paid tier** — see [`DATA_SOURCES.md`](DATA_SOURCES.md).
  This keeps the JARVIS control surface usable on a fresh checkout with
  zero configuration.
- `fly_to_location` only accepts the built-in `locationId` presets, not the
  real action's free-text `query` or arbitrary `latitude`/`longitude`. A
  fixed, small enum is trivial to reason about and audit; free-text search
  or raw coordinates would let a compromised or buggy JARVIS host drive the
  camera anywhere with no allowlist to check against.

## What this adapter is

`src/integrations/jarvis/`:

- **`allowlist.js`** — the closed list of action names, their argument
  validators, the allowed layer ids, and the allowed location ids (derived
  directly from `src/locations.js`'s real `CITY_POIS`, so it can never list
  a location that doesn't actually exist).
- **`adapter.js`** — `createJarvisControlAdapter(...)`, which builds (or
  accepts) a `runGevAction`-style function and exposes exactly two methods:
  `listActions()` and `invoke(actionName, args)`. `invoke` rejects anything
  not on the allowlist, validates arguments before they ever reach the real
  action, and returns a structured `{ ok, ... }` result — it never throws
  for a bad request, and it never evaluates a string as code.
- **`bridge.js`** — `installJarvisBridge(scene, { defer })`, the **only**
  place this adapter touches global state. It is a no-op unless
  `window.__GEV_JARVIS_BRIDGE_ENABLED__ === true` was set *before* the app
  booted. When enabled, it attaches the adapter to
  `window.__gevJarvisControl` and logs a one-line console notice naming the
  allowlisted actions, so the bridge being active is never silent.
- **`index.js`** — the barrel export for the three modules above.

`src/app/tools.js` (where the existing `window.__godsEyeView` debug handle
is assembled) calls `installJarvisBridge(debug, { defer })` right after that
handle is built. That is the adapter's only integration point with the rest
of the application — two lines, additive, and inert by default.

## What this repo does **not** do

To keep the scope honest and match the constraints this integration was
built under:

- **It does not launch, install, or control the God's Eye View process
  itself.** "Opening the globe" (`open_globe`) resets the camera in an
  *already-running* page. Starting the Electron/browser process that shows
  that page is the local JARVIS host's job, not something a web page can do
  to itself.
- **It does not open a network listener, HTTP endpoint, or WebSocket
  server.** There is no unauthenticated (or authenticated) control endpoint
  anywhere in this change. `window.__gevJarvisControl` is an in-page
  JavaScript object; something has to already be able to run code in that
  page (see the next section) to call it.
- **It does not add an "run arbitrary JavaScript" or `eval`-style escape
  hatch.** `invoke()` only ever dispatches one of the four named,
  schema-validated actions above.
- **It does not touch the microphone or the OpenAI Realtime voice agent.**
  The adapter builds its own `runGevAction` instance
  (`createGevActionRunner`) independent of the one the voice agent uses, and
  nothing in `bridge.js` or `adapter.js` imports from `src/voice/session*`,
  `src/voice/realtime*`, or anything that starts a voice session. Enabling
  the JARVIS bridge does not start, arm, or auto-activate the mic.
- **It does not require any paid API key.** All three allowlisted layers,
  and the preset-location camera flights, work against the same free,
  keyless data sources the app already uses out of the box.
- **It has not been tested against a real Windows JARVIS installation.**
  This session has no access to a local JARVIS checkout, Electron
  shell, or Windows machine — see [Remaining work](#remaining-work-that-needs-local-windows-testing).

## Connecting a future local JARVIS host

This repo intentionally stops at "a safe, named, in-page function you can
call." Wiring a real local JARVIS process up to it is future work, and the
right transport depends on how JARVIS actually renders/embeds the page:

1. **If JARVIS's Electron shell embeds this app directly** (e.g. a
   `BrowserView`/`BrowserWindow` pointed at the God's Eye View build), the
   natural bridge is an Electron **preload script** with `contextBridge`,
   loaded only in that window, that:
   - sets `window.__GEV_JARVIS_BRIDGE_ENABLED__ = true` before the page's own
     scripts run, and
   - exposes a narrow IPC channel (e.g. `jarvisControl.invoke(action, args)`)
     that forwards to `window.__gevJarvisControl.invoke(...)` inside that
     renderer and relays the result back over IPC to the FastAPI/Python
     side (via Electron's main process).
   This keeps the trust boundary where Electron already expects it: the
   FastAPI host talks to its own Electron main process over a channel it
   controls, not to an open port.
2. **If JARVIS instead drives an independent Chromium/Electron window over
   the Chrome DevTools Protocol (CDP)** — the same approach the repo's own
   Puppeteer QA scripts under `scripts/qa-*.mjs` already use to script the
   page for testing — the local FastAPI host would launch or attach to that
   window with `window.__GEV_JARVIS_BRIDGE_ENABLED__` set (e.g. via
   `Page.addScriptToEvaluateOnNewDocument`), then call
   `window.__gevJarvisControl.invoke(action, args)` through
   `Runtime.callFunctionOn`/`Runtime.evaluate` on that same, already-open
   page. CDP itself is a local, loopback-only protocol — it is JARVIS's
   responsibility to bind it to `localhost` only and never expose it beyond
   the machine.

Either way, the suggested JSON contract between the local FastAPI host and
whatever process makes the actual JS call is a plain request/response pair
mirroring `invoke()`'s own shape:

```jsonc
// Request (FastAPI -> bridge process)
{ "action": "set_layer_visibility", "args": { "layerId": "flights", "enabled": true } }

// Response (bridge process -> FastAPI), always this shape, never a stack trace or raw JS error
{ "ok": true, "action": "set_layer_visibility", "layerId": "flights", "enabled": true, "requestedAction": "set_layer_visibility" }

// or, for a rejected/invalid request:
{ "ok": false, "action": "set_layer_visibility", "error": "Layer \"military\" is not allowlisted for JARVIS control. Allowed: flights, satellites, earthquakes" }
```

`invoke()` already returns exactly this shape (see `adapter.js`), so a
future FastAPI host can pass its own request body straight through to
`invoke(action, args)` and return the result straight back — no
translation layer is required on this side of the boundary.

## Runtime security summary

- **Off by default.** No code path in this change runs unless
  `window.__GEV_JARVIS_BRIDGE_ENABLED__ === true` is set by the embedding
  host before boot. A normal `npm run dev` / `npm run build` / `npm run
  preview` of this fork behaves exactly like upstream.
- **Closed allowlist, checked twice.** `invoke()` rejects any action name
  not in `JARVIS_ACTIONS`, and each action's own `validate()` rejects
  malformed or out-of-range arguments before the real `runGevAction` is
  ever called. There is no default-allow path.
- **No code execution surface.** No `eval`, no `new Function`, no
  "run this script" action. The only inputs accepted are an action name (a
  fixed string) and a small object of primitive arguments, each checked
  against the allowlist's own validator.
- **No network exposure shipped here.** This repo adds an in-page object,
  not a server. Any network or IPC transport is added, secured, and
  authenticated entirely on the local JARVIS host's side, per
  [Connecting a future local JARVIS host](#connecting-a-future-local-jarvis-host).
- **No credentials introduced.** No new environment variables, API keys, or
  secrets were added anywhere in this change (see `.env.example`, unchanged).
- **Voice/mic isolation.** The adapter never imports from, constructs, or
  starts anything under `src/voice/session*.js`, `src/voice/realtime*.js`,
  or the voice UI in `src/voice/control.js`. Enabling the bridge cannot
  turn on the microphone or the OpenAI Realtime agent as a side effect.
- **License/attribution unchanged.** No third-party code, data, or assets
  were added; the existing MIT license (`LICENSE`) and the data attribution
  in `DATA_SOURCES.md` are untouched.

## Installation / requirements

- No new dependencies were added to `package.json` — the adapter only
  imports existing modules from this repository (`src/voice/gevActions.js`,
  `src/locations.js`).
- No new environment variables or API keys are required. The three
  allowlisted layers (`flights`, `satellites`, `earthquakes`) and the preset
  `fly_to_location` cities all work with the app's default, keyless data
  sources.
- To exercise the bridge locally in a plain browser (without any JARVIS
  host), set the flag before the app's module scripts run — for example, by
  adding `<script>window.__GEV_JARVIS_BRIDGE_ENABLED__ = true;</script>`
  before the app's own `<script type="module">` tag in a local copy of
  `index.html`, or by calling it from the address bar/devtools before a hard
  reload. Then, from the same page's devtools console:

  ```js
  window.__gevJarvisControl.listActions();
  await window.__gevJarvisControl.invoke('set_layer_visibility', { layerId: 'earthquakes', enabled: true });
  await window.__gevJarvisControl.invoke('fly_to_location', { locationId: 'tokyo' });
  await window.__gevJarvisControl.invoke('open_globe');
  ```

  This is a convenience for local testing and integration development, not
  a recommended production configuration — see the transport options above
  for how a real JARVIS host should set the flag instead of editing
  `index.html`.

## Limitations

- Cannot launch, stop, or otherwise manage the God's Eye View process
  itself (see [What this repo does not do](#what-this-repo-does-not-do)).
- Cannot fly to an arbitrary place — only the eight built-in preset cities.
- Cannot toggle any layer other than `flights`, `satellites`, or
  `earthquakes`, even though the real app supports many more (military,
  traffic, CCTV, vessels, radio, etc.). Extending the list is a deliberate
  source change, not a runtime option, so each addition gets reviewed.
- Ships no transport of its own — see
  [Connecting a future local JARVIS host](#connecting-a-future-local-jarvis-host).
  Until that transport exists on the JARVIS side, `window.__gevJarvisControl`
  is only reachable by code already running inside the same browser page.

## Remaining work that needs local Windows testing

This work was done in a cloud environment with **no access to the real
Windows JARVIS installation, its Python/FastAPI source, its Electron shell,
or `C:\Users\ayyan\jarvis`**. Nothing above claims that integration was
tested end-to-end. Before relying on this in production, the local JARVIS
side still needs to:

1. Implement the actual transport (Electron preload/IPC, or a CDP client)
   described above, on real Windows hardware, against the real Electron
   shell.
2. Verify `window.__GEV_JARVIS_BRIDGE_ENABLED__` can be set before this
   app's scripts run in whatever embedding JARVIS actually uses.
3. Confirm the FastAPI host can reach that transport locally (loopback
   only) and round-trip a few `invoke()` calls end-to-end.
4. Decide, on the JARVIS side, how a user grants/revokes JARVIS's ability to
   control God's Eye View (this repo does not implement any such consent UI
   — it only refuses to do anything until explicitly opted in).
