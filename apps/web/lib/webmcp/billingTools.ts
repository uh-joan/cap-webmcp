import type { Organisation } from "@cap/web-domain";
import { getSubscriptionDetails } from "@/actions/organization/get-subscription-details";
import { manageBilling } from "@/actions/organization/manage-billing";
import { READ_ONLY, registerWebMcpTool } from "./webmcp.service";

const asOrgId = (id: unknown): Organisation.OrganisationId => {
	const value = String(id ?? "").trim();
	if (!value) throw new Error("orgId must not be empty.");
	return value as Organisation.OrganisationId;
};

/**
 * Billing tools — read-only. Purchases (subscribe, change seats, buy a BAA or
 * credits) are intentionally NOT exposed as tools: the agent surfaces the
 * subscription, usage, and the Stripe portal link, and the user completes any
 * purchase themselves.
 */
export function registerBillingTools(): Array<() => void> {
	const unregister: Array<() => void> = [];

	unregister.push(
		registerWebMcpTool<{ orgId: string }>({
			name: "get_subscription",
			description:
				"Get an organization's subscription details (plan, status, seats). " +
				"Returns null if there is no subscription.",
			annotations: READ_ONLY,
			inputSchema: {
				type: "object",
				properties: {
					orgId: {
						type: "string",
						description: "Organization id from list_organizations.",
					},
				},
				required: ["orgId"],
			},
			execute: ({ orgId }) => getSubscriptionDetails(asOrgId(orgId)),
		}),
	);

	unregister.push(
		registerWebMcpTool({
			name: "get_billing_usage",
			description:
				"Get the signed-in user's active organization billing usage (for " +
				"example recordings or minutes against plan limits).",
			annotations: READ_ONLY,
			execute: async () => {
				const response = await fetch("/api/settings/billing/usage", {
					credentials: "same-origin",
				});
				if (!response.ok) {
					const body = await response.json().catch(() => null);
					throw new Error(
						body?.error || `Failed to load billing usage (${response.status})`,
					);
				}
				return response.json();
			},
		}),
	);

	unregister.push(
		registerWebMcpTool({
			name: "get_billing_portal_url",
			description:
				"Get a link to the Stripe billing portal where the user can manage their " +
				"subscription and payment methods. Returns the URL for the user to open; " +
				"it does not make any purchase.",
			annotations: READ_ONLY,
			execute: async () => {
				const url = await manageBilling();
				return { url };
			},
		}),
	);

	return unregister;
}
