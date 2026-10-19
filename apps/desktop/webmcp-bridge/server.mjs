#!/usr/bin/env node
/**
 * WebMCP desktop bridge.
 *
 * Bridges an external MCP client (the agent, via stdio from .mcp.json) to the
 * Cap desktop app's WKWebView, which cannot expose WebMCP to chrome-devtools-mcp
 * directly. The webview installs a `document.modelContext` shim
 * (src/lib/webmcp/modelContextShim.ts) that connects here over a localhost
 * WebSocket and relays tool registrations and executions.
 *
 *   agent  <--stdio MCP-->  this bridge  <--localhost WS-->  Cap webview shim
 *
 * Tools live in the webview and call Tauri commands, so the agent drives the
 * real desktop recorder. Loopback-only; a shared token guards the WS.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.CAP_WEBMCP_WS_PORT ?? 8787);
const TOKEN = process.env.CAP_WEBMCP_TOKEN ?? "cap-webmcp-dev";
const CALL_TIMEOUT_MS = Number(process.env.CAP_WEBMCP_CALL_TIMEOUT_MS ?? 60000);
/** How long tools/list waits for a first announce when nothing is cached. */
const LIST_WAIT_MS = Number(process.env.CAP_WEBMCP_LIST_WAIT_MS ?? 8000);
/**
 * Where the last-announced tool catalog is cached. MCP clients fetch tools/list
 * once at connect, before the app's webview has announced, so without this the
 * list would be empty until a reconnect. Caching lets tools/list return the
 * known tools immediately; calls still error clearly if the app is not open.
 */
const CACHE_FILE = join(tmpdir(), `cap-webmcp-tools.${PORT}.json`);

function loadCachedTools() {
	try {
		const parsed = JSON.parse(readFileSync(CACHE_FILE, "utf8"));
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function saveCachedTools(tools) {
	try {
		writeFileSync(CACHE_FILE, JSON.stringify(tools));
	} catch {
		// Best-effort; a missing cache just means a cold next start.
	}
}

/** The most recently connected, authenticated webview socket. */
let webview = null;
/** Latest tool schemas announced by the webview (seeded from the cache). */
let currentTools = loadCachedTools();
/** Resolvers waiting for the first announce (for a cold tools/list). */
const announceWaiters = new Set();
/** In-flight tool calls, keyed by request id. */
const pending = new Map();
let nextId = 1;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function resolveAnnounceWaiters() {
	for (const resolve of announceWaiters) resolve();
	announceWaiters.clear();
}

async function waitForTools(timeoutMs) {
	if (currentTools.length > 0) return;
	await Promise.race([
		new Promise((resolve) => announceWaiters.add(resolve)),
		sleep(timeoutMs),
	]);
}

const server = new Server(
	{ name: "cap-desktop-webmcp", version: "0.1.0" },
	{ capabilities: { tools: { listChanged: true } } },
);

function notifyToolsChanged() {
	server
		.notification({ method: "notifications/tools/list_changed" })
		.catch(() => {});
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
	// On a cold start with no cache, briefly wait for the app to announce so the
	// client's one-shot tools/list is populated instead of empty.
	await waitForTools(LIST_WAIT_MS);
	return {
		tools: currentTools.map((tool) => ({
			name: tool.name,
			description: tool.description,
			inputSchema: tool.inputSchema ?? { type: "object", properties: {} },
			annotations: tool.annotations,
		})),
	};
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const { name, arguments: args } = request.params;
	if (!webview || webview.readyState !== webview.OPEN) {
		return {
			isError: true,
			content: [
				{
					type: "text",
					text: "The Cap desktop app is not connected. Open the app and try again.",
				},
			],
		};
	}

	const id = String(nextId++);
	const resultText = await new Promise((resolve) => {
		const timer = setTimeout(() => {
			pending.delete(id);
			resolve(
				JSON.stringify({
					error: `Tool "${name}" timed out after ${CALL_TIMEOUT_MS}ms`,
				}),
			);
		}, CALL_TIMEOUT_MS);
		pending.set(id, { resolve, timer });
		webview.send(JSON.stringify({ type: "call", id, name, args: args ?? {} }));
	});

	// The webview sends back a JSON string; pass it through as text content.
	let isError = false;
	try {
		const parsed = JSON.parse(resultText);
		isError = parsed && typeof parsed === "object" && "error" in parsed;
	} catch {
		// Non-JSON is fine; treat as a plain text result.
	}
	return { isError, content: [{ type: "text", text: resultText }] };
});

function handleWsMessage(ws, raw) {
	let message;
	try {
		message = JSON.parse(String(raw));
	} catch {
		return;
	}

	if (message.type === "hello") {
		if (message.token !== TOKEN) {
			ws.close(1008, "bad token");
			return;
		}
		webview = ws;
		return;
	}

	// Ignore anything from an unauthenticated socket.
	if (ws !== webview) return;

	if (message.type === "announce" && Array.isArray(message.tools)) {
		currentTools = message.tools;
		saveCachedTools(currentTools);
		resolveAnnounceWaiters();
		notifyToolsChanged();
	} else if (message.type === "result" && message.id) {
		const entry = pending.get(message.id);
		if (!entry) return;
		clearTimeout(entry.timer);
		pending.delete(message.id);
		entry.resolve(
			message.ok
				? (message.result ?? "null")
				: JSON.stringify({ error: message.error ?? "Tool failed" }),
		);
	}
}

function startWebSocketServer() {
	const wss = new WebSocketServer({ host: "127.0.0.1", port: PORT });
	wss.on("connection", (ws) => {
		ws.on("message", (raw) => handleWsMessage(ws, raw));
		ws.on("close", () => {
			if (ws === webview) {
				webview = null;
				// Keep the last-known tools listed so the client UI still shows them;
				// CallTool returns a clear "app not connected" error while it is closed.
			}
		});
		ws.on("error", () => {});
	});
	wss.on("error", (error) => {
		process.stderr.write(`[cap-webmcp-bridge] ws error: ${error.message}\n`);
	});
	process.stderr.write(
		`[cap-webmcp-bridge] WebSocket listening on ws://127.0.0.1:${PORT}\n`,
	);
}

async function main() {
	startWebSocketServer();
	await server.connect(new StdioServerTransport());
}

main().catch((error) => {
	process.stderr.write(
		`[cap-webmcp-bridge] fatal: ${error?.message ?? error}\n`,
	);
	process.exit(1);
});
