"use client";

import { useCapWebMcp } from "@/lib/webmcp/useCapWebMcp";
import { WebMcpWidget } from "./WebMcpWidget";

/**
 * Mounts Cap's WebMCP tools on the signed-in dashboard and renders the
 * Agent-Enabled catalog widget. Placed inside the (org) layout so the tools
 * exist whenever a signed-in dashboard page is open.
 */
export function WebMcpProvider() {
	useCapWebMcp();
	return <WebMcpWidget />;
}
