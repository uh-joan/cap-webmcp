# WebMCP control for Cap

This fork adds a **WebMCP** control layer so an AI agent can drive Cap — the web
dashboard and the desktop recorder/editor — through typed tools, the same way
the [`n8n-webmcp`](https://github.com/uh-joan/n8n) fork works. Tools are
registered on `document.modelContext`; every action is visible on screen,
reuses the same code the UI uses, keeps secrets out of the agent, and gates
destructive/publish/email actions behind a confirmation.

Full design and the tool inventory: [`docs/webmcp-tools-plan.md`](docs/webmcp-tools-plan.md).

## Two surfaces

| Surface | Runtime | How the agent connects |
|---|---|---|
| **Web** (`apps/web`) | Chrome | `document.modelContext` natively (needs Chrome's WebMCP flag) + `chrome-devtools-mcp` |
| **Desktop** (`apps/desktop`) | Tauri WKWebView | a local **bridge** (WKWebView can't be reached by `chrome-devtools-mcp`) |

```
Web:     agent ── chrome-devtools-mcp ──> Chrome tab (document.modelContext) ──> RPC / server actions
Desktop: agent ── stdio MCP ──> webmcp-bridge ── localhost WS ──> WKWebView shim ──> Tauri commands
```

The shared registry lives in `lib/webmcp/webmcp.service.ts` (one copy per app,
kept in sync). Tool groups are the sibling `*Tools.ts` files.

---

## Desktop

### Run

```bash
bun run dev:desktop
```

The webview installs a `document.modelContext` shim
(`apps/desktop/src/lib/webmcp/modelContextShim.ts`) that connects to the local
bridge over a loopback WebSocket and re-announces tools on (re)connect. On the
**main window** a small "Agent · N tools" panel shows the registered tools and
whether the bridge is connected.

### Drive it with an agent

The bridge is registered in [`.mcp.json`](.mcp.json) as `cap-desktop-webmcp`:

```json
{ "command": "bun", "args": ["webmcp-bridge/server.mjs"] }
```

An MCP client (e.g. Claude Code) that loads `.mcp.json` spawns the bridge over
stdio; the bridge runs the WS server on `127.0.0.1:8787` (token-gated). Once the
desktop app is running, its shim connects and the desktop tools become callable
as `cap-desktop-webmcp` MCP tools — `start_recording`, `list_screens`,
`get_recording_state`, `export_video`, `transcribe_audio`, etc.

Env overrides: `CAP_WEBMCP_WS_PORT`, `CAP_WEBMCP_TOKEN`.

### Tool groups

Desktop recorder · Permissions · Studio editor & export · Library & recovery ·
Captions. Destructive tools (`delete_recording`, model deletes, …) pop a native
Tauri confirm dialog before running.

### Verify the bridge

```bash
bun webmcp-bridge/e2e-test.mjs    # relay unit test (no app needed)
bun webmcp-bridge/live-check.mjs  # drives the running app, calls get_recording_state
```

---

## Web

### Run

```bash
bun run dev:web
```

> **Note:** if the dev server 500s with a Turbopack `next/font/google` error
> ("queries have exactly one entry"), run the web app with webpack instead:
> ```bash
> cd apps/web && bun run dev --webpack
> ```
> (Next 16 uses Turbopack by default; `--webpack` opts out.)

The dashboard (`apps/web/app/(org)/…`) mounts `WebMcpProvider`, which registers
the tools and renders the Agent-Enabled widget (bottom-right).

### Drive it with an agent

WebMCP's `document.modelContext` is a Chrome-only API behind
`chrome://flags/#enable-webmcp-testing` (Chrome 149+). With it on, point
`chrome-devtools-mcp --categoryExperimentalWebmcp` at the signed-in dashboard
tab; `list_webmcp_tools` shows the Cap tools and `execute_webmcp_tool` runs them.

### Tool groups

Library · Sharing · Transcripts & captions · Comments · Analytics ·
Teams & members · Cap AI · Loom import · Settings & account · Storage ·
Billing (read). Destructive tools prompt via `window.confirm`.

---

## Safety model

- **confirm** (consequential) tools require an on-screen confirmation; declining
  throws and the tool does not run.
- **untrusted** reads (transcripts, comments) are flagged so their text is
  treated as data, not instructions.
- Intentionally **not** exposed as tools (user-only): entering S3 credentials,
  Google Drive OAuth connect, and all billing purchases.

## Where the code lives

- `apps/web/lib/webmcp/` — service, hook, tool groups, web confirm handler
- `apps/web/app/Layout/WebMcpProvider.tsx`, `WebMcpWidget.tsx`
- `apps/desktop/src/lib/webmcp/` — service, shim, tool groups, widget, confirm
- `webmcp-bridge/` — bridge server + e2e/live test harnesses
- `.mcp.json` — MCP servers (`chrome-devtools`, `cap-desktop-webmcp`)
