"use client";

import { useCapWebMcp } from "@/lib/webmcp/useCapWebMcp";

/**
 * Mounts Cap's WebMCP tools on the signed-in dashboard. Renders nothing.
 * Placed inside the (org) layout so the tools exist whenever a signed-in
 * dashboard page is open.
 */
export function WebMcpProvider() {
	useCapWebMcp();
	return null;
}
