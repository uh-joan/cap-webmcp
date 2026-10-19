#!/usr/bin/env node

/**
 * End-to-end test of the WebMCP desktop bridge relay.
 *
 *   agent (real MCP client)  <--stdio-->  bridge (server.mjs)  <--WS-->  fake webview
 *
 * Proves the full chain: a webview-side WS client announces tools, they appear
 * over MCP, an MCP tool call is relayed to the webview, executed, and the result
 * round-trips back. Exits 0 on success, 1 on failure.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { WebSocket } from "ws";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.CAP_WEBMCP_E2E_PORT ?? 8791); // isolated free port
const TOKEN = "e2e-token";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fail = (msg) => {
	console.error(`FAIL: ${msg}`);
	process.exit(1);
};

// --- 1. Start the agent side: spawn the real bridge over stdio. -------------
const transport = new StdioClientTransport({
	command: "bun",
	args: [join(here, "server.mjs")],
	env: {
		...process.env,
		CAP_WEBMCP_WS_PORT: String(PORT),
		CAP_WEBMCP_TOKEN: TOKEN,
	},
});
const client = new Client({ name: "e2e-agent", version: "0.0.0" });
await client.connect(transport);
console.log("[e2e] agent connected to bridge over stdio");

// --- 2. Start the webview side: connect to the bridge WS, announce tools. ---
const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
await new Promise((resolve, reject) => {
	ws.once("open", resolve);
	ws.once("error", reject);
});
ws.send(JSON.stringify({ type: "hello", token: TOKEN }));
ws.send(
	JSON.stringify({
		type: "announce",
		tools: [
			{
				name: "echo",
				description: "Echo the message back.",
				inputSchema: {
					type: "object",
					properties: { msg: { type: "string" } },
					required: ["msg"],
				},
			},
			{
				name: "add",
				description: "Add two numbers.",
				inputSchema: {
					type: "object",
					properties: { a: { type: "number" }, b: { type: "number" } },
					required: ["a", "b"],
				},
			},
		],
	}),
);

// The webview executes calls the bridge relays to it.
ws.on("message", (raw) => {
	const m = JSON.parse(String(raw));
	if (m.type !== "call") return;
	let result;
	if (m.name === "echo") result = JSON.stringify({ echoed: m.args.msg });
	else if (m.name === "add")
		result = JSON.stringify({ sum: m.args.a + m.args.b });
	else {
		ws.send(
			JSON.stringify({ type: "result", id: m.id, ok: false, error: "unknown" }),
		);
		return;
	}
	ws.send(JSON.stringify({ type: "result", id: m.id, ok: true, result }));
});
console.log("[e2e] webview connected and announced 2 tools");

// Give the bridge a moment to process the announce + notify list_changed.
await sleep(300);

// --- 3. Agent: list the tools the webview announced. ------------------------
const { tools } = await client.listTools();
const names = tools.map((t) => t.name).sort();
console.log(`[e2e] agent listTools -> [${names.join(", ")}]`);
if (names.join(",") !== "add,echo")
	fail(`expected tools [add, echo], got [${names.join(", ")}]`);

// --- 4. Agent: call each tool, verify the result round-trips. ----------------
const echoRes = await client.callTool({
	name: "echo",
	arguments: { msg: "hi" },
});
const echoText = echoRes.content?.[0]?.text;
console.log(`[e2e] call echo -> ${echoText}`);
if (JSON.parse(echoText).echoed !== "hi")
	fail(`echo round-trip wrong: ${echoText}`);

const addRes = await client.callTool({
	name: "add",
	arguments: { a: 2, b: 40 },
});
const addText = addRes.content?.[0]?.text;
console.log(`[e2e] call add -> ${addText}`);
if (JSON.parse(addText).sum !== 42) fail(`add round-trip wrong: ${addText}`);

// --- 5. Error path: a tool call when no webview is connected. ----------------
ws.close();
await sleep(200);
const offline = await client.callTool({
	name: "echo",
	arguments: { msg: "x" },
});
console.log(`[e2e] call with webview offline -> isError=${offline.isError}`);
if (!offline.isError) fail("expected isError when the webview is disconnected");

console.log(
	"PASS: bridge relay works end-to-end (announce, list, call, result, offline).",
);
await client.close();
process.exit(0);
