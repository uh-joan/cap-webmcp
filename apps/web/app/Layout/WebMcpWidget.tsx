"use client";

import { useEffect, useMemo, useState } from "react";
import {
	getWebMcpCatalog,
	isWebMcpSupported,
	subscribeWebMcpCatalog,
	type WebMcpCatalogEntry,
	type WebMcpKind,
} from "@/lib/webmcp/webmcp.service";

const KIND_COLOR: Record<WebMcpKind, string> = {
	read: "#6b7280",
	write: "#2563eb",
	confirm: "#d97706",
};

/**
 * A small, collapsible panel showing which WebMCP tools are registered on this
 * page and whether a WebMCP-capable agent runtime is present. Lets the user see
 * exactly what an agent in the tab can do. Rendered by <WebMcpProvider/>.
 */
export function WebMcpWidget() {
	const [entries, setEntries] = useState<WebMcpCatalogEntry[]>(() =>
		getWebMcpCatalog(),
	);
	const [open, setOpen] = useState(false);
	const [supported, setSupported] = useState(false);

	useEffect(() => subscribeWebMcpCatalog(setEntries), []);
	useEffect(() => {
		const tick = () => setSupported(isWebMcpSupported());
		tick();
		const id = setInterval(tick, 2000);
		return () => clearInterval(id);
	}, []);

	const groups = useMemo(() => {
		const byGroup = new Map<string, WebMcpCatalogEntry[]>();
		for (const entry of entries) {
			const list = byGroup.get(entry.group) ?? [];
			list.push(entry);
			byGroup.set(entry.group, list);
		}
		return [...byGroup.entries()].sort((a, b) => a[0].localeCompare(b[0]));
	}, [entries]);

	if (entries.length === 0) return null;

	return (
		<div
			style={{
				position: "fixed",
				bottom: 16,
				right: 16,
				zIndex: 2147483000,
				fontFamily:
					"ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
				fontSize: 12,
			}}
		>
			{open && (
				<div
					style={{
						width: 320,
						maxHeight: "60vh",
						overflowY: "auto",
						marginBottom: 8,
						borderRadius: 12,
						background: "#0b0f1a",
						color: "#e5e7eb",
						border: "1px solid #1f2937",
						boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
						padding: 12,
					}}
				>
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							marginBottom: 8,
						}}
					>
						<strong style={{ fontSize: 13 }}>WebMCP tools</strong>
						<span style={{ color: "#9ca3af" }}>{entries.length} total</span>
					</div>
					<div style={{ color: "#9ca3af", marginBottom: 10 }}>
						Agent runtime: {supported ? "connected" : "not detected"} · read /{" "}
						<span style={{ color: KIND_COLOR.write }}>write</span> /{" "}
						<span style={{ color: KIND_COLOR.confirm }}>confirm</span>
					</div>
					{groups.map(([group, tools]) => (
						<div key={group} style={{ marginBottom: 10 }}>
							<div
								style={{
									color: "#9ca3af",
									textTransform: "uppercase",
									letterSpacing: 0.4,
									fontSize: 10,
									marginBottom: 4,
								}}
							>
								{group} ({tools.length})
							</div>
							{tools.map((tool) => (
								<div
									key={tool.name}
									style={{
										display: "flex",
										alignItems: "center",
										gap: 6,
										padding: "2px 0",
									}}
									title={tool.description}
								>
									<span
										aria-hidden
										style={{
											width: 6,
											height: 6,
											borderRadius: 3,
											background: KIND_COLOR[tool.kind],
											flex: "0 0 auto",
										}}
									/>
									<code style={{ color: "#e5e7eb" }}>{tool.name}</code>
								</div>
							))}
						</div>
					))}
				</div>
			)}
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					padding: "8px 12px",
					borderRadius: 999,
					background: "#0b0f1a",
					color: "#e5e7eb",
					border: "1px solid #1f2937",
					boxShadow: "0 6px 18px rgba(0,0,0,0.3)",
					cursor: "pointer",
				}}
				aria-expanded={open}
			>
				<span
					aria-hidden
					style={{
						width: 8,
						height: 8,
						borderRadius: 4,
						background: supported ? "#22c55e" : "#6b7280",
					}}
				/>
				<span>Agent · {entries.length} tools</span>
			</button>
		</div>
	);
}
