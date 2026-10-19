import { createSignal, For, onCleanup, Show } from "solid-js";
import { subscribeBridgeConnection } from "./modelContextShim";
import {
	subscribeWebMcpCatalog,
	type WebMcpCatalogEntry,
	type WebMcpKind,
} from "./webmcp.service";

const KIND_COLOR: Record<WebMcpKind, string> = {
	read: "#6b7280",
	write: "#2563eb",
	confirm: "#d97706",
};

/**
 * A small collapsible panel showing which WebMCP tools the desktop app exposes
 * and whether the local bridge is connected (i.e. an external agent can drive
 * them). Mounted only on the main window.
 */
export function WebMcpWidget() {
	const [entries, setEntries] = createSignal<WebMcpCatalogEntry[]>([]);
	const [connected, setConnected] = createSignal(false);
	const [open, setOpen] = createSignal(false);

	const unsubCatalog = subscribeWebMcpCatalog(setEntries);
	const unsubConn = subscribeBridgeConnection(setConnected);
	onCleanup(() => {
		unsubCatalog();
		unsubConn();
	});

	const groups = () => {
		const byGroup = new Map<string, WebMcpCatalogEntry[]>();
		for (const entry of entries()) {
			const list = byGroup.get(entry.group) ?? [];
			list.push(entry);
			byGroup.set(entry.group, list);
		}
		return [...byGroup.entries()].sort((a, b) => a[0].localeCompare(b[0]));
	};

	return (
		<Show when={entries().length > 0}>
			<div
				style={{
					position: "fixed",
					bottom: "12px",
					right: "12px",
					"z-index": "2147483000",
					"font-family": "ui-sans-serif, system-ui, -apple-system, sans-serif",
					"font-size": "12px",
				}}
			>
				<Show when={open()}>
					<div
						style={{
							width: "300px",
							"max-height": "55vh",
							"overflow-y": "auto",
							"margin-bottom": "8px",
							"border-radius": "12px",
							background: "#0b0f1a",
							color: "#e5e7eb",
							border: "1px solid #1f2937",
							"box-shadow": "0 10px 30px rgba(0,0,0,0.35)",
							padding: "12px",
						}}
					>
						<div
							style={{
								display: "flex",
								"justify-content": "space-between",
								"align-items": "center",
								"margin-bottom": "8px",
							}}
						>
							<strong style={{ "font-size": "13px" }}>WebMCP tools</strong>
							<span style={{ color: "#9ca3af" }}>{entries().length} total</span>
						</div>
						<div style={{ color: "#9ca3af", "margin-bottom": "10px" }}>
							Bridge: {connected() ? "connected" : "waiting"}
						</div>
						<For each={groups()}>
							{([group, tools]) => (
								<div style={{ "margin-bottom": "10px" }}>
									<div
										style={{
											color: "#9ca3af",
											"text-transform": "uppercase",
											"letter-spacing": "0.4px",
											"font-size": "10px",
											"margin-bottom": "4px",
										}}
									>
										{group} ({tools.length})
									</div>
									<For each={tools}>
										{(tool) => (
											<div
												title={tool.description}
												style={{
													display: "flex",
													"align-items": "center",
													gap: "6px",
													padding: "2px 0",
												}}
											>
												<span
													style={{
														width: "6px",
														height: "6px",
														"border-radius": "3px",
														background: KIND_COLOR[tool.kind],
														flex: "0 0 auto",
													}}
												/>
												<code>{tool.name}</code>
											</div>
										)}
									</For>
								</div>
							)}
						</For>
					</div>
				</Show>
				<button
					type="button"
					onClick={() => setOpen(!open())}
					style={{
						display: "flex",
						"align-items": "center",
						gap: "8px",
						padding: "8px 12px",
						"border-radius": "999px",
						background: "#0b0f1a",
						color: "#e5e7eb",
						border: "1px solid #1f2937",
						"box-shadow": "0 6px 18px rgba(0,0,0,0.3)",
						cursor: "pointer",
					}}
				>
					<span
						style={{
							width: "8px",
							height: "8px",
							"border-radius": "4px",
							background: connected() ? "#22c55e" : "#6b7280",
						}}
					/>
					<span>Agent · {entries().length} tools</span>
				</button>
			</div>
		</Show>
	);
}
