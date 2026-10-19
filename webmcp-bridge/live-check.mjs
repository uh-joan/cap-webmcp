#!/usr/bin/env node

/**
 * Live check against the real Cap desktop app.
 *
 *   agent (this)  <--stdio-->  bridge (server.mjs on :8787)  <--WS-->  real app webview
 *
 * Spawns the bridge on the default port the webview shim connects to, waits for
 * the running app to announce its tools, then calls get_recording_state (a safe
 * read) and prints the real Tauri command result. Exits 0 on success.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DEADLINE_MS = 90_000;

const transport = new StdioClientTransport({
	command: "bun",
	args: [join(here, "server.mjs")],
	env: { ...process.env },
});
const client = new Client({ name: "cap-live-check", version: "0.0.0" });
await client.connect(transport);
console.log("[live] agent connected to bridge; waiting for the app webview…");

const start = Date.now();
let names = [];
while (Date.now() - start < DEADLINE_MS) {
	const { tools } = await client.listTools().catch(() => ({ tools: [] }));
	names = tools.map((t) => t.name);
	if (names.includes("get_recording_state")) break;
	await sleep(1500);
}

if (!names.includes("get_recording_state")) {
	console.error(
		`FAIL: the app did not connect/announce within ${DEADLINE_MS / 1000}s. ` +
			`Seen tools: [${names.join(", ")}]`,
	);
	await client.close();
	process.exit(1);
}

console.log(
	`[live] app announced ${names.length} tools, e.g. ${names.slice(0, 8).join(", ")}…`,
);

const res = await client.callTool({
	name: "get_recording_state",
	arguments: {},
});
const text = res.content?.[0]?.text;
console.log(`[live] get_recording_state -> ${text}`);
console.log(
	"PASS: a real Tauri command round-tripped through the bridge from the live app.",
);
await client.close();
process.exit(0);
