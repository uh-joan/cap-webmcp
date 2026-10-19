import type { Organisation } from "@cap/web-domain";
import {
	listOrganizationMembersForAgent,
	listOrganizationsForAgent,
} from "@/actions/organization/agent-teams";
import { removeOrganizationInvite } from "@/actions/organization/remove-invite";
import { removeOrganizationMember } from "@/actions/organization/remove-member";
import { sendOrganizationInvites } from "@/actions/organization/send-invites";
import { updateOrganizationDetails } from "@/actions/organization/update-details";
import { updateOrganizationMemberRole } from "@/actions/organization/update-member-role";
import {
	CONFIRM,
	MUTATING,
	READ_ONLY,
	registerWebMcpTool,
} from "./webmcp.service";

const asOrgId = (id: unknown): Organisation.OrganisationId => {
	const value = String(id ?? "").trim();
	if (!value) throw new Error("organizationId must not be empty.");
	return value as Organisation.OrganisationId;
};

/** Surface a server action's `{ success: false, error }` as a thrown error. */
const throwIfFailed = (result: unknown, fallback: string) => {
	const r = result as { success?: boolean; error?: string } | undefined;
	if (r && r.success === false) throw new Error(r.error ?? fallback);
};

/**
 * Teams tools: inspect and manage the signed-in user's organizations, their
 * members, pending invites, and roles. Ids come from list_organizations and
 * list_organization_members.
 */
export function registerTeamsTools(): Array<() => void> {
	const unregister: Array<() => void> = [];

	unregister.push(
		registerWebMcpTool({
			name: "list_organizations",
			description:
				"List the organizations the signed-in user belongs to, with each one's " +
				"id, name, the user's role, and which is active. Use the ids with the " +
				"other teams tools.",
			annotations: READ_ONLY,
			execute: () => listOrganizationsForAgent(),
		}),
	);

	unregister.push(
		registerWebMcpTool<{ organizationId: string }>({
			name: "list_organization_members",
			description:
				"List an organization's members (with member ids and roles) and its " +
				"pending invites (with invite ids). Use the ids with remove_member, " +
				"update_member_role, and remove_invite.",
			annotations: READ_ONLY,
			inputSchema: {
				type: "object",
				properties: {
					organizationId: {
						type: "string",
						description: "Organization id from list_organizations.",
					},
				},
				required: ["organizationId"],
			},
			execute: ({ organizationId }) =>
				listOrganizationMembersForAgent(String(organizationId ?? "").trim()),
		}),
	);

	unregister.push(
		registerWebMcpTool<{
			organizationId: string;
			name?: string;
			allowedEmailDomain?: string;
		}>({
			name: "update_organization",
			description:
				"Update an organization's name and/or its allowed email domain.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					organizationId: {
						type: "string",
						description: "Organization id from list_organizations.",
					},
					name: { type: "string", description: "New organization name." },
					allowedEmailDomain: {
						type: "string",
						description: "Restrict membership to this email domain.",
					},
				},
				required: ["organizationId"],
			},
			execute: async ({ organizationId, name, allowedEmailDomain }) => {
				const result = await updateOrganizationDetails({
					organizationId: asOrgId(organizationId),
					organizationName: name ?? undefined,
					allowedEmailDomain: allowedEmailDomain ?? undefined,
				});
				throwIfFailed(result, "Failed to update organization");
				return { organizationId };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{
			organizationId: string;
			emails: string[];
			role?: string;
		}>({
			name: "invite_members",
			description:
				"Invite people to an organization by email. This SENDS invitation " +
				"emails on the user's behalf. `role` defaults to 'member'.",
			annotations: CONFIRM,
			inputSchema: {
				type: "object",
				properties: {
					organizationId: {
						type: "string",
						description: "Organization id from list_organizations.",
					},
					emails: {
						type: "array",
						items: { type: "string" },
						description: "Email addresses to invite.",
					},
					role: {
						type: "string",
						description: "Role for the invited members (default 'member').",
					},
				},
				required: ["organizationId", "emails"],
			},
			execute: async ({ organizationId, emails, role }) => {
				const list = (emails ?? [])
					.map((e) => String(e ?? "").trim())
					.filter(Boolean);
				if (list.length === 0) throw new Error("emails must not be empty.");
				const result = await sendOrganizationInvites(
					list,
					asOrgId(organizationId),
					role ?? "member",
				);
				throwIfFailed(result, "Failed to send invites");
				return { organizationId, invited: list };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ organizationId: string; inviteId: string }>({
			name: "remove_invite",
			description: "Cancel a pending organization invite.",
			annotations: CONFIRM,
			inputSchema: {
				type: "object",
				properties: {
					organizationId: {
						type: "string",
						description: "Organization id from list_organizations.",
					},
					inviteId: {
						type: "string",
						description: "Invite id from list_organization_members.",
					},
				},
				required: ["organizationId", "inviteId"],
			},
			execute: async ({ organizationId, inviteId }) => {
				const id = String(inviteId ?? "").trim();
				if (!id) throw new Error("inviteId must not be empty.");
				const result = await removeOrganizationInvite(
					id,
					asOrgId(organizationId),
				);
				throwIfFailed(result, "Failed to remove invite");
				return { organizationId, removedInvite: id };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ organizationId: string; memberId: string }>({
			name: "remove_member",
			description: "Remove a member from an organization.",
			annotations: CONFIRM,
			inputSchema: {
				type: "object",
				properties: {
					organizationId: {
						type: "string",
						description: "Organization id from list_organizations.",
					},
					memberId: {
						type: "string",
						description: "Member id from list_organization_members.",
					},
				},
				required: ["organizationId", "memberId"],
			},
			execute: async ({ organizationId, memberId }) => {
				const id = String(memberId ?? "").trim();
				if (!id) throw new Error("memberId must not be empty.");
				const result = await removeOrganizationMember(
					id,
					asOrgId(organizationId),
				);
				throwIfFailed(result, "Failed to remove member");
				return { organizationId, removedMember: id };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{
			organizationId: string;
			memberId: string;
			role: string;
		}>({
			name: "update_member_role",
			description:
				"Change an organization member's role (for example 'member' or " +
				"'owner'/'admin' depending on the plan).",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					organizationId: {
						type: "string",
						description: "Organization id from list_organizations.",
					},
					memberId: {
						type: "string",
						description: "Member id from list_organization_members.",
					},
					role: { type: "string", description: "The new role to assign." },
				},
				required: ["organizationId", "memberId", "role"],
			},
			execute: async ({ organizationId, memberId, role }) => {
				const id = String(memberId ?? "").trim();
				const nextRole = String(role ?? "").trim();
				if (!id) throw new Error("memberId must not be empty.");
				if (!nextRole) throw new Error("role must not be empty.");
				const result = await updateOrganizationMemberRole(
					id,
					asOrgId(organizationId),
					nextRole,
				);
				throwIfFailed(result, "Failed to update member role");
				return { organizationId, memberId: id, role: nextRole };
			},
		}),
	);

	return unregister;
}
