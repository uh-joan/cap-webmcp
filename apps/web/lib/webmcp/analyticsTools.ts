import { getVideoAnalytics } from "@/actions/videos/get-analytics";
import { READ_ONLY, registerWebMcpTool } from "./webmcp.service";

const DASHBOARD_RANGES = ["24h", "7d", "30d", "lifetime"] as const;
type DashboardRange = (typeof DASHBOARD_RANGES)[number];

const asCapId = (id: unknown): string => {
	const value = String(id ?? "").trim();
	if (!value) throw new Error("capId must not be empty.");
	return value;
};

/**
 * Analytics tools: per-cap view counts and the org dashboard analytics. Both
 * read-only.
 */
export function registerAnalyticsTools(): Array<() => void> {
	const unregister: Array<() => void> = [];

	unregister.push(
		registerWebMcpTool<{ capId: string; rangeDays?: number }>({
			name: "get_cap_analytics",
			description:
				"Get the view count for one of the signed-in user's caps, optionally " +
				"over the last `rangeDays` days (1-90, default 90).",
			annotations: READ_ONLY,
			inputSchema: {
				type: "object",
				properties: {
					capId: { type: "string", description: "Cap id from list_caps." },
					rangeDays: {
						type: "integer",
						minimum: 1,
						maximum: 90,
						description: "Window in days to count views over.",
					},
				},
				required: ["capId"],
			},
			execute: async ({ capId, rangeDays }) => {
				const result = await getVideoAnalytics(asCapId(capId), {
					rangeDays: typeof rangeDays === "number" ? rangeDays : undefined,
				});
				return { capId, views: result.count };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{
			range?: DashboardRange;
			capId?: string;
			spaceId?: string;
		}>({
			name: "get_dashboard_analytics",
			description:
				"Get aggregated analytics for the active organization's dashboard. " +
				"`range` is one of 24h, 7d (default), 30d, lifetime. Optionally scope " +
				"to a single cap or space.",
			annotations: READ_ONLY,
			inputSchema: {
				type: "object",
				properties: {
					range: {
						type: "string",
						enum: [...DASHBOARD_RANGES],
						description: "Time range (default 7d).",
					},
					capId: { type: "string", description: "Scope to one cap." },
					spaceId: { type: "string", description: "Scope to one space." },
				},
			},
			execute: async ({ range, capId, spaceId }) => {
				const params = new URLSearchParams();
				params.set(
					"range",
					range && DASHBOARD_RANGES.includes(range) ? range : "7d",
				);
				if (capId) params.set("capId", String(capId).trim());
				if (spaceId) params.set("spaceId", String(spaceId).trim());
				const response = await fetch(
					`/api/dashboard/analytics?${params.toString()}`,
					{ credentials: "same-origin" },
				);
				if (!response.ok) {
					const body = await response.json().catch(() => null);
					throw new Error(
						body?.error || `Failed to load analytics (${response.status})`,
					);
				}
				const body = await response.json();
				return body.data ?? body;
			},
		}),
	);

	return unregister;
}
