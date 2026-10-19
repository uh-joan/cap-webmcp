import type { Space, Video } from "@cap/web-domain";
import { shareCap } from "@/actions/caps/share";
import { updateVideoCallToAction } from "@/actions/videos/call-to-action";
import {
	removeVideoPassword,
	setVideoPassword,
} from "@/actions/videos/password";
import {
	getVideoViewerGrants,
	inviteVideoViewer,
	revokeVideoViewer,
} from "@/actions/videos/viewer-invites";
import {
	CONFIRM,
	MUTATING,
	READ_ONLY,
	registerWebMcpTool,
} from "./webmcp.service";

const asVideoId = (id: unknown): Video.VideoId => {
	const value = String(id ?? "").trim();
	if (!value) throw new Error("capId must not be empty.");
	return value as Video.VideoId;
};

/**
 * Sharing tools: control who can see a cap and how its share page behaves —
 * share to spaces / make public, password-protect, per-viewer invites, and the
 * call-to-action on the share page. All are session-based server actions.
 */
export function registerSharingTools(): Array<() => void> {
	const unregister: Array<() => void> = [];

	unregister.push(
		registerWebMcpTool<{
			capId: string;
			spaceIds?: string[];
			public?: boolean;
		}>({
			name: "share_cap",
			description:
				"Share a cap to spaces or organizations, and/or make it public. " +
				"`spaceIds` are space or organization ids the user belongs to; omit or " +
				"pass an empty array to change only the public flag.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					capId: { type: "string", description: "Cap id from list_caps." },
					spaceIds: {
						type: "array",
						items: { type: "string" },
						description: "Space or organization ids to share to.",
					},
					public: {
						type: "boolean",
						description: "Whether the cap is publicly viewable via its link.",
					},
				},
				required: ["capId"],
			},
			execute: async ({ capId, spaceIds, public: isPublic }) => {
				const result = await shareCap({
					capId: asVideoId(capId),
					spaceIds: (spaceIds ?? []) as Space.SpaceIdOrOrganisationId[],
					public: isPublic,
				});
				if (!result.success) throw new Error(result.error ?? "Failed to share");
				return { capId, spaceIds: spaceIds ?? [], public: isPublic ?? null };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ capId: string; password: string }>({
			name: "set_cap_password",
			description:
				"Set (or replace) the password required to view a cap's share page.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					capId: { type: "string", description: "Cap id from list_caps." },
					password: {
						type: "string",
						description: "The share-page password to set.",
					},
				},
				required: ["capId", "password"],
			},
			execute: async ({ capId, password }) => {
				if (!password || typeof password !== "string")
					throw new Error("password must be a non-empty string.");
				const result = await setVideoPassword(asVideoId(capId), password);
				if (!result.success)
					throw new Error(result.error ?? "Failed to set password");
				return { capId, passwordSet: true };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ capId: string }>({
			name: "remove_cap_password",
			description:
				"Remove the password from a cap's share page, so anyone with the link " +
				"can view it again. This lowers the cap's protection.",
			annotations: CONFIRM,
			inputSchema: {
				type: "object",
				properties: {
					capId: { type: "string", description: "Cap id from list_caps." },
				},
				required: ["capId"],
			},
			execute: async ({ capId }) => {
				const result = await removeVideoPassword(asVideoId(capId));
				if (!result.success)
					throw new Error(result.error ?? "Failed to remove password");
				return { capId, passwordRemoved: true };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ capId: string }>({
			name: "list_viewer_invites",
			description:
				"List the email addresses currently invited to view a cap (active, " +
				"non-revoked grants).",
			annotations: READ_ONLY,
			inputSchema: {
				type: "object",
				properties: {
					capId: { type: "string", description: "Cap id from list_caps." },
				},
				required: ["capId"],
			},
			execute: async ({ capId }) => {
				const grants = await getVideoViewerGrants(asVideoId(capId));
				return { capId, emails: grants.map((g) => g.email) };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ capId: string; email: string }>({
			name: "invite_viewer",
			description:
				"Invite someone to view a cap by email. This SENDS an invitation email " +
				"to that address on the user's behalf.",
			annotations: CONFIRM,
			inputSchema: {
				type: "object",
				properties: {
					capId: { type: "string", description: "Cap id from list_caps." },
					email: { type: "string", description: "Invitee email address." },
				},
				required: ["capId", "email"],
			},
			execute: async ({ capId, email }) => {
				const result = await inviteVideoViewer(
					asVideoId(capId),
					String(email ?? "").trim(),
				);
				if (!result.success)
					throw new Error(result.error ?? "Failed to invite viewer");
				return { capId, invited: String(email ?? "").trim() };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ capId: string; email: string }>({
			name: "revoke_viewer",
			description: "Revoke a previously invited viewer's access to a cap.",
			annotations: CONFIRM,
			inputSchema: {
				type: "object",
				properties: {
					capId: { type: "string", description: "Cap id from list_caps." },
					email: {
						type: "string",
						description:
							"Email of the viewer to revoke (from list_viewer_invites).",
					},
				},
				required: ["capId", "email"],
			},
			execute: async ({ capId, email }) => {
				const result = await revokeVideoViewer(
					asVideoId(capId),
					String(email ?? "").trim(),
				);
				if (!result.success) throw new Error("Failed to revoke viewer");
				return { capId, revoked: String(email ?? "").trim() };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{
			capId: string;
			label?: string;
			url?: string;
			headline?: string;
			color?: string;
			showWhilePlaying?: boolean;
			clear?: boolean;
		}>({
			name: "set_call_to_action",
			description:
				"Set or clear the call-to-action button shown on a cap's share page. " +
				"Pass `clear: true` to remove it; otherwise `label` and `url` are " +
				"required. Requires a Pro plan.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					capId: { type: "string", description: "Cap id from list_caps." },
					label: { type: "string", description: "Button text." },
					url: { type: "string", description: "Button link URL." },
					headline: { type: "string", description: "Optional headline text." },
					color: { type: "string", description: "Optional button color." },
					showWhilePlaying: {
						type: "boolean",
						description: "Show the CTA while the video is playing.",
					},
					clear: {
						type: "boolean",
						description: "Remove the call-to-action instead of setting it.",
					},
				},
				required: ["capId"],
			},
			execute: async ({
				capId,
				label,
				url,
				headline,
				color,
				showWhilePlaying,
				clear,
			}) => {
				if (clear) {
					const result = await updateVideoCallToAction(asVideoId(capId), null);
					if (!result.success) {
						if (result.upgradeRequired)
							throw new Error(
								"A Pro plan is required to edit the call-to-action.",
							);
						throw new Error("Failed to clear the call-to-action.");
					}
					return { capId, callToAction: null };
				}
				if (!label || !url)
					throw new Error("label and url are required unless clear is true.");
				const result = await updateVideoCallToAction(asVideoId(capId), {
					label,
					url,
					headline: headline ?? null,
					color: color ?? null,
					showWhilePlaying,
				});
				if (!result.success) {
					if (result.upgradeRequired)
						throw new Error(
							"A Pro plan is required to edit the call-to-action.",
						);
					throw new Error("Invalid call-to-action input.");
				}
				return { capId, callToAction: result.callToAction };
			},
		}),
	);

	return unregister;
}
