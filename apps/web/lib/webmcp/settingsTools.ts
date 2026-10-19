import { markAsRead } from "@/actions/notifications/mark-as-read";
import { updatePreferences } from "@/actions/notifications/update-preferences";
import { MUTATING, READ_ONLY, registerWebMcpTool } from "./webmcp.service";

/**
 * Settings & account tools: the signed-in user's display name and notification
 * preferences.
 */
export function registerSettingsTools(): Array<() => void> {
	const unregister: Array<() => void> = [];

	unregister.push(
		registerWebMcpTool<{ firstName: string; lastName?: string }>({
			name: "update_user_name",
			description: "Update the signed-in user's display name.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					firstName: { type: "string", description: "First name." },
					lastName: { type: "string", description: "Last name (optional)." },
				},
				required: ["firstName"],
			},
			execute: async ({ firstName, lastName }) => {
				const first = String(firstName ?? "").trim();
				if (!first) throw new Error("firstName must not be empty.");
				const response = await fetch("/api/settings/user/name", {
					method: "POST",
					credentials: "same-origin",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ firstName: first, lastName: lastName ?? "" }),
				});
				if (!response.ok) {
					const body = await response.json().catch(() => null);
					throw new Error(
						body?.error || `Failed to update name (${response.status})`,
					);
				}
				return { firstName: first, lastName: lastName ?? "" };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool({
			name: "get_notification_preferences",
			description:
				"Get the signed-in user's notification preferences (which notifications " +
				"are paused).",
			annotations: READ_ONLY,
			execute: async () => {
				const response = await fetch("/api/notifications/preferences", {
					credentials: "same-origin",
				});
				if (!response.ok) {
					const body = await response.json().catch(() => null);
					throw new Error(
						body?.error ||
							`Failed to load notification preferences (${response.status})`,
					);
				}
				return response.json();
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{
			pauseComments: boolean;
			pauseReplies: boolean;
			pauseViews: boolean;
			pauseReactions: boolean;
			pauseAnonViews?: boolean;
		}>({
			name: "set_notification_preferences",
			description:
				"Set the signed-in user's notification preferences. Each flag pauses " +
				"that kind of notification when true. Read current values first with " +
				"get_notification_preferences.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					pauseComments: { type: "boolean" },
					pauseReplies: { type: "boolean" },
					pauseViews: { type: "boolean" },
					pauseReactions: { type: "boolean" },
					pauseAnonViews: { type: "boolean" },
				},
				required: [
					"pauseComments",
					"pauseReplies",
					"pauseViews",
					"pauseReactions",
				],
			},
			execute: async ({
				pauseComments,
				pauseReplies,
				pauseViews,
				pauseReactions,
				pauseAnonViews,
			}) => {
				await updatePreferences({
					notifications: {
						pauseComments: Boolean(pauseComments),
						pauseReplies: Boolean(pauseReplies),
						pauseViews: Boolean(pauseViews),
						pauseReactions: Boolean(pauseReactions),
						pauseAnonViews:
							pauseAnonViews === undefined
								? undefined
								: Boolean(pauseAnonViews),
					},
				});
				return { updated: true };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ notificationId?: string }>({
			name: "mark_notifications_read",
			description:
				"Mark one notification as read by id, or all of the user's " +
				"notifications when no id is given.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					notificationId: {
						type: "string",
						description: "Notification id, or omit to mark all as read.",
					},
				},
			},
			execute: async ({ notificationId }) => {
				const id = notificationId ? String(notificationId).trim() : undefined;
				await markAsRead(id);
				return { markedRead: id ?? "all" };
			},
		}),
	);

	return unregister;
}
