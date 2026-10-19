# Exploration & future work: truly driving the Cap desktop UI

Status: exploration. Date: 2026-10-19.

The desktop WebMCP tools today call the generated Tauri **commands** (the Rust
backend) directly. That performs the real action, but it bypasses the
SolidStart UI's own state, so on-screen controls can diverge from what the agent
did. This doc explains why, maps what reflects vs. what doesn't, and lays out how
to make the agent *drive the UI* the way `n8n-webmcp` does (tools call the same
stores/composables the UI uses, so the screen updates live).

## 1. Current architecture

```
Agent ─▶ cap-desktop-webmcp (bridge) ─▶ WKWebView modelContext shim
      ─▶ desktopTools.ts  ─▶ commands.*  (Tauri invoke) ─▶ Rust backend
```

The UI, separately:

```
Solid components ─▶ createOptionsQuery() store  (recording mode, target, camera,
                    mic, org…) ─ persisted to localStorage "recording-options-query-2",
                    synced across windows via the `storage` event
                 ─▶ TanStack Query (devices, current recording, …)
                 ─▶ events.*.listen  (backend → UI push: devicesUpdated,
                    requestSetTargetMode, recording lifecycle, progress…)
```

So there are **two state layers**: the backend (what the tools drive) and the
frontend store (what the controls render from). They only stay in sync where the
backend pushes an event the UI already listens to.

## 2. What reflects today vs. what diverges

| Agent action (tool) | Backed by | Shows in UI? | Why |
|---|---|---|---|
| `start_recording` / `stop_recording` / pause / resume | `commands.*Recording` | **Yes** | Recording lifecycle emits events + opens/closes windows the UI reacts to |
| `get_recording_state`, `list_screens/windows/cameras` | read commands | n/a | Read-only |
| `set_recording_mode` | `commands.setRecordingMode` (backend) | **No** | The mode pill reads `createOptionsQuery().mode` (store), which the tool never touches |
| `select_camera` / `select_mic` | `set_camera_input` / `set_mic_input` | **Partial** | Device feeds change; the picker's selected-label UI reads the store |
| `take_screenshot`, `export_video` | export/screenshot commands | Mostly n/a | Produce files; progress is event-driven |
| editor tools (`set_project_config`, zoom…) | editor commands | **Varies** | The editor window has its own stores; some reads re-fetch, some don't |

The headline example: `set_recording_mode` really changes the backend, but the
⚡/🎬/🖼️ pill doesn't move because it's bound to the store, not the backend.

## 3. The seam

`src/utils/queries.ts → createOptionsQuery()` is the linchpin for the recorder
window:

- A Solid `createStore` holding `captureTarget`, `mode`, `micName`, `cameraID`,
  `targetMode`, `organizationId`, `captureSystemAudio`, …
- Persisted to `localStorage["recording-options-query-2"]`.
- A `window "storage"` listener re-hydrates the store when another window writes
  that key (cross-window sync).

Other seams:
- `events.requestSetTargetMode` — the backend can already ask the UI to change
  target mode; listened to in `new-main` and `target-select-overlay`.
- `events.devicesUpdated` — device list refreshes.
- TanStack Query keys for current recording / devices — invalidating them
  re-renders.

## 4. Options for "truly drive the UI"

### Option A — register tools inside the Solid tree (recommended; the n8n model)
Move recorder/editor tool registration out of the framework-agnostic
`initCapWebMcp()` and into a Solid component that already holds the UI's state,
so tools call the **same setters/composables the UI uses**:

- `set_recording_mode` → `setOptions("mode", mode)` (pill moves, persists, and
  the normal store→backend flow runs) instead of `commands.setRecordingMode`.
- `select_camera` / `select_mic` → `setOptions("cameraID"/"micName", …)` so the
  picker label updates, and the UI's existing effect pushes it to the backend.
- `start_recording` → call the UI's own start handler (reads `rawOptions`, opens
  the right windows) rather than raw `commands.startRecording`.

Mechanics: the tool `execute`s run outside components, so expose a **module-level
registry of UI actions** that the recorder root populates on mount
(`setRecorderUiApi({ setOptions, startRecording, … })`) and clears on cleanup;
the tools call through it, falling back to the raw command when the UI isn't
mounted (e.g. a background/overlay window). This keeps `webmcp.service.ts`
framework-agnostic while the *recorder* tool group becomes UI-aware.

### Option B — write the store's localStorage key + notify
Tools write `localStorage["recording-options-query-2"]` and trigger a re-hydrate.
Lighter, but: the `storage` event does **not** fire in the same window that
wrote it, so you'd need the store to also listen on a custom event the tool
dispatches; and it only covers store-shaped state, not imperative actions
(start/stop/export). Useful as a fallback, not the primary path.

### Option C — backend emits UI events
For actions with an existing event (e.g. `requestSetTargetMode`), have the
command emit it so the UI updates. Clean where the event exists, but most
options changes have no such event, so this can't cover the surface alone.

### Recommended: hybrid
- **Store-shaped state** (mode, target, camera, mic, org, system-audio) → Option
  A via `setOptions`.
- **Imperative actions** (start/stop/pause/restart/screenshot/export) → Option A
  via the UI's own handlers so the exact same windows/flows run.
- Keep raw-command fallbacks for windows where the recorder UI isn't mounted.

## 5. Challenges & open questions

- **Tools run outside components.** Need the module-level UI-action registry,
  populated per-window on mount. Which window "owns" an action when several are
  open (main vs. overlay vs. editor)?
- **Multi-window state.** Options sync via localStorage across windows, but the
  editor and overlays have separate stores; editor tools would need their own
  registry from the editor root.
- **Backend/store divergence must be deliberate.** Some commands already run
  from store effects; calling both the store setter *and* the command could
  double-fire. Map each tool to exactly one path.
- **Confirm dialogs** already live in the UI (Tauri dialog) — good; keep them.
- **Framework coupling.** `webmcp.service.ts` stays generic; only the
  desktop tool *files* gain a dependency on the Solid UI API registry.
- **Testing.** This is visual: drive each tool and assert the control moved
  (screenshots / the running app), not just that the backend changed.

## 6. Phased plan

1. **UI-action registry** — `recorderUiApi` module + `setRecorderUiApi()` wired
   from the `new-main` root (`createOptionsQuery`, start/stop handlers, device
   queries), cleared on unmount.
2. **Rewire the recorder group** — `set_recording_mode`, `select_camera`,
   `select_mic`, source selection, `start_recording`/`stop_recording` to go
   through the registry; keep command fallbacks.
3. **Visual verification** — drive each via the bridge against the running app;
   confirm pills/labels/windows update.
4. **Editor registry** — repeat for the editor window (project config, zoom,
   captions, playback) from the editor root.
5. **Docs** — note per-tool which path it uses and the fallback behavior.

## 7. Effort & payoff

Medium. The registry + recorder rewiring is a focused change in the desktop tool
files plus a small hook in `new-main` (and later the editor). Payoff is the
"wow" behavior: the agent visibly operates Cap — pills move, pickers update,
windows open — matching the n8n-webmcp experience, and keeping the UI honest
about what the agent did.

## Appendix — key files
- `apps/desktop/src/utils/queries.ts` — `createOptionsQuery` (the options store)
- `apps/desktop/src/routes/(window-chrome)/new-main/` — recorder root + controls
- `apps/desktop/src/utils/tauri.ts` — generated `commands` + `events`
- `apps/desktop/src/lib/webmcp/desktopTools.ts`, `editorTools.ts` — tool groups
- `apps/desktop/src/lib/webmcp/index.ts` — `initCapWebMcp` (registration entry)
