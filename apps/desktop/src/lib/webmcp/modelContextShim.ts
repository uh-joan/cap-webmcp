/**
 * Installs a `document.modelContext` shim in the Tauri WKWebView, backed by a
 * WebSocket to the local WebMCP bridge (apps/desktop/webmcp-bridge/server.mjs).
 *
 * Why this exists: WebMCP's real `document.modelContext` is a Chrome-only API,
 * and `chrome-devtools-mcp` attaches over CDP, which cannot see Tauri's WKWebView.
 * So the app provides its own `modelContext`: tools register exactly as they
 * would in Chrome (via webmcp.service.ts), and this shim relays their schemas
 * and executes them on behalf of an external agent connected to the bridge.
 *
 * Protocol (JSON over WS):
 *   shim → bridge  { type: "hello", token }
 *   shim → bridge  { type: "announce", tools: [{ name, description, inputSchema, annotations }] }
 *   bridge → shim  { type: "call", id, name, args }
 *   shim → bridge  { type: "result", id, ok, result? , error? }   // result is a JSON string
 */

type ToolAnnotations = {
	readOnlyHint?: boolean;
	untrustedContentHint?: boolean;
	consequentialHint?: boolean;
};

type RegisteredTool = {
	name: string;
	description: string;
	inputSchema?: object;
	annotations?: ToolAnnotations;
	execute: (
		args: object,
		options: { signal?: AbortSignal },
	) => Promise<string> | string;
};

type ModelContext = {
	registerTool: (
		tool: RegisteredTool,
		options?: { signal?: AbortSignal },
	) => void;
};

const DEFAULT_WS_URL = "ws://127.0.0.1:8787";
const DEFAULT_TOKEN = "cap-webmcp-dev";
const RECONNECT_MS = 2000;
const ANNOUNCE_DEBOUNCE_MS = 100;

type ShimGlobals = {
	__CAP_WEBMCP_WS__?: string;
	__CAP_WEBMCP_TOKEN__?: string;
	__capWebMcpShimInstalled__?: boolean;
};

let installed = false;

/** Whether the shim's WebSocket to the bridge is currently open. */
let shimConnected = false;
const connectionListeners = new Set<(connected: boolean) => void>();

export function isBridgeConnected(): boolean {
	return shimConnected;
}

/** Subscribe to bridge connection changes. Fires immediately with the current state. */
export function subscribeBridgeConnection(
	listener: (connected: boolean) => void,
): () => void {
	connectionListeners.add(listener);
	listener(shimConnected);
	return () => connectionListeners.delete(listener);
}

function setBridgeConnected(value: boolean) {
	if (shimConnected === value) return;
	shimConnected = value;
	for (const listener of connectionListeners) listener(shimConnected);
}

export function installModelContextShim() {
	if (typeof document === "undefined") return;
	const globals = window as unknown as ShimGlobals;
	if (installed || globals.__capWebMcpShimInstalled__) return;
	// If a real modelContext already exists (e.g. a WebMCP-capable runtime),
	// leave it alone — tools will attach to it directly.
	if ((document as Document & { modelContext?: unknown }).modelContext) return;

	installed = true;
	globals.__capWebMcpShimInstalled__ = true;

	const tools = new Map<string, RegisteredTool>();
	const controllers = new Map<string, AbortController>();
	let socket: WebSocket | null = null;
	let announceTimer: ReturnType<typeof setTimeout> | undefined;
	let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

	const wsUrl = globals.__CAP_WEBMCP_WS__ ?? DEFAULT_WS_URL;
	const token = globals.__CAP_WEBMCP_TOKEN__ ?? DEFAULT_TOKEN;

	const send = (message: unknown) => {
		if (socket && socket.readyState === WebSocket.OPEN) {
			socket.send(JSON.stringify(message));
		}
	};

	const announce = () => {
		send({
			type: "announce",
			tools: [...tools.values()].map((tool) => ({
				name: tool.name,
				description: tool.description,
				inputSchema: tool.inputSchema ?? { type: "object", properties: {} },
				annotations: tool.annotations,
			})),
		});
	};

	const scheduleAnnounce = () => {
		if (announceTimer) clearTimeout(announceTimer);
		announceTimer = setTimeout(announce, ANNOUNCE_DEBOUNCE_MS);
	};

	const handleCall = async (id: string, name: string, args: object) => {
		const tool = tools.get(name);
		if (!tool) {
			send({ type: "result", id, ok: false, error: `Unknown tool "${name}"` });
			return;
		}
		const controller = new AbortController();
		controllers.set(id, controller);
		try {
			const result = await tool.execute(args ?? {}, {
				signal: controller.signal,
			});
			send({ type: "result", id, ok: true, result });
		} catch (error) {
			send({
				type: "result",
				id,
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			});
		} finally {
			controllers.delete(id);
		}
	};

	const connect = () => {
		try {
			socket = new WebSocket(wsUrl);
		} catch {
			scheduleReconnect();
			return;
		}

		socket.addEventListener("open", () => {
			setBridgeConnected(true);
			send({ type: "hello", token });
			announce();
		});

		socket.addEventListener("message", (event) => {
			let message: { type?: string; id?: string; name?: string; args?: object };
			try {
				message = JSON.parse(String(event.data));
			} catch {
				return;
			}
			if (message.type === "call" && message.id && message.name) {
				void handleCall(message.id, message.name, message.args ?? {});
			} else if (message.type === "cancel" && message.id) {
				controllers.get(message.id)?.abort();
			}
		});

		socket.addEventListener("close", scheduleReconnect);
		socket.addEventListener("error", () => socket?.close());
	};

	function scheduleReconnect() {
		setBridgeConnected(false);
		socket = null;
		if (reconnectTimer) return;
		reconnectTimer = setTimeout(() => {
			reconnectTimer = undefined;
			connect();
		}, RECONNECT_MS);
	}

	const modelContext: ModelContext = {
		registerTool: (tool, options) => {
			tools.set(tool.name, tool);
			if (options?.signal) {
				options.signal.addEventListener("abort", () => {
					tools.delete(tool.name);
					scheduleAnnounce();
				});
			}
			scheduleAnnounce();
		},
	};

	Object.defineProperty(document, "modelContext", {
		value: modelContext,
		configurable: true,
		writable: false,
	});

	connect();
}
