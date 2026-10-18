/**
 * Registers WebMCP tools onto `document.modelContext`, the browser API an agent
 * in the tab connects to (W3C Web Machine Learning CG draft; Chrome 149+ behind
 * chrome://flags/#enable-webmcp-testing, driven by
 * `chrome-devtools-mcp --categoryExperimentalWebmcp`).
 *
 * Tools are queued until the API exists, because an extension or shim may inject
 * it after load. A tool is unregistered by aborting the signal it was registered
 * with.
 *
 * Ported from the n8n-webmcp fork; de-coupled from Vue so it is plain,
 * framework-agnostic TS usable from React (apps/web) and SolidStart (apps/desktop).
 */

export type WebMcpToolAnnotations = {
	readOnlyHint?: boolean;
	untrustedContentHint?: boolean;
	consequentialHint?: boolean;
};

/** Where a tool is available. In Cap web everything is `global`. */
export type WebMcpScope = "global" | "dashboard" | "editor";
/** What a tool does, for the UI badge: reads, writes (undoable), or confirms. */
export type WebMcpKind = "read" | "write" | "confirm";

export type WebMcpCatalogEntry = {
	name: string;
	description: string;
	group: string;
	scope: WebMcpScope;
	kind: WebMcpKind;
};

export type WebMcpTool<Args = Record<string, unknown>> = {
	name: string;
	description: string;
	inputSchema?: object;
	annotations?: WebMcpToolAnnotations;
	execute: (args: Args, options: { signal?: AbortSignal }) => unknown;
};

type ModelContext = {
	registerTool: (
		tool: {
			name: string;
			description: string;
			inputSchema?: object;
			annotations?: WebMcpToolAnnotations;
			execute: (
				args: object,
				options: { signal?: AbortSignal },
			) => Promise<string>;
		},
		options?: { signal?: AbortSignal },
	) => Promise<void> | void;
};

type Registered = {
	tool: WebMcpTool<never>;
	controller: AbortController | null;
	/** True after the browser accepted the registration. */
	attached: boolean;
	group: string;
	scope: WebMcpScope;
};

export const READ_ONLY: WebMcpToolAnnotations = { readOnlyHint: true };
export const MUTATING: WebMcpToolAnnotations = { readOnlyHint: false };
export const CONFIRM: WebMcpToolAnnotations = {
	readOnlyHint: false,
	consequentialHint: true,
};
export const UNTRUSTED: WebMcpToolAnnotations = {
	readOnlyHint: true,
	untrustedContentHint: true,
};

const DETECT_INTERVAL_MS = 1000;

const registry = new Map<string, Registered>();
let detectTimer: ReturnType<typeof setInterval> | undefined;

/** Subscribers notified whenever the catalog changes (for an Agent-Enabled widget). */
const catalogListeners = new Set<(entries: WebMcpCatalogEntry[]) => void>();

/** Group/scope stamped onto tools registered inside the current withWebMcpGroup call. */
let activeGroup: { group: string; scope: WebMcpScope } | null = null;

export function getWebMcpCatalog(): WebMcpCatalogEntry[] {
	return [...registry.values()].map((entry) => ({
		name: entry.tool.name,
		description: entry.tool.description,
		group: entry.group,
		scope: entry.scope,
		kind: kindOf(entry.tool.annotations),
	}));
}

export function subscribeWebMcpCatalog(
	listener: (entries: WebMcpCatalogEntry[]) => void,
): () => void {
	catalogListeners.add(listener);
	listener(getWebMcpCatalog());
	return () => catalogListeners.delete(listener);
}

/**
 * Tag every tool registered synchronously inside `fn` with a group name and
 * scope, for the Agent-Enabled widget. Wrap each register* call with it.
 */
export function withWebMcpGroup<T>(
	group: string,
	scope: WebMcpScope,
	fn: () => T,
): T {
	const previous = activeGroup;
	activeGroup = { group, scope };
	try {
		return fn();
	} finally {
		activeGroup = previous;
	}
}

function kindOf(annotations?: WebMcpToolAnnotations): WebMcpKind {
	if (annotations?.consequentialHint) return "confirm";
	if (annotations?.readOnlyHint === false) return "write";
	return "read";
}

function refreshCatalog() {
	const entries = getWebMcpCatalog();
	for (const listener of catalogListeners) listener(entries);
}

function getModelContext(): ModelContext | undefined {
	if (typeof document === "undefined") return undefined;
	return (document as Document & { modelContext?: ModelContext }).modelContext;
}

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function attach(entry: Registered) {
	const modelContext = getModelContext();
	if (!modelContext || entry.controller) return;

	const controller = new AbortController();
	entry.controller = controller;
	const { tool } = entry;

	void Promise.resolve(
		modelContext.registerTool(
			{
				name: tool.name,
				description: tool.description,
				inputSchema: tool.inputSchema ?? { type: "object", properties: {} },
				annotations: tool.annotations,
				execute: async (args, options) => {
					try {
						return JSON.stringify(await tool.execute(args as never, options));
					} catch (error) {
						// Returned, not thrown, so the agent can read the message and correct itself.
						return JSON.stringify({ error: toErrorMessage(error) });
					}
				},
			},
			{ signal: controller.signal },
		),
	)
		.then(() => {
			entry.attached = entry.controller === controller;
		})
		.catch((error) => {
			entry.controller = null;
			console.warn(
				`[webmcp] Could not register tool "${tool.name}": ${toErrorMessage(error)}`,
			);
		});
}

function ensureDetection() {
	if (detectTimer || getModelContext() || typeof document === "undefined")
		return;

	detectTimer = setInterval(() => {
		if (!getModelContext()) return;
		clearInterval(detectTimer);
		detectTimer = undefined;
		for (const entry of registry.values()) attach(entry);
	}, DETECT_INTERVAL_MS);
}

/** Register a tool. Safe to call before the API exists. Returns an unregister function. */
export function registerWebMcpTool<Args = Record<string, unknown>>(
	tool: WebMcpTool<Args>,
): () => void {
	registry.get(tool.name)?.controller?.abort();

	const entry: Registered = {
		tool: tool as WebMcpTool<never>,
		controller: null,
		attached: false,
		group: activeGroup?.group ?? "Other",
		scope: activeGroup?.scope ?? "global",
	};
	registry.set(tool.name, entry);
	attach(entry);
	ensureDetection();
	refreshCatalog();

	return () => {
		if (registry.get(tool.name) !== entry) return;
		entry.controller?.abort();
		registry.delete(tool.name);
		refreshCatalog();
	};
}

export function isWebMcpToolRegistered(name: string): boolean {
	return registry.get(name)?.attached === true;
}

export function isWebMcpSupported(): boolean {
	return getModelContext() !== undefined;
}
