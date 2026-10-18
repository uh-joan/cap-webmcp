"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import {
	organizationInvites,
	organizationMembers,
	organizations,
	users,
} from "@cap/database/schema";
import { Organisation } from "@cap/web-domain";
import { and, eq } from "drizzle-orm";

/**
 * Owner/member-gated reads of the signed-in user's organizations, members, and
 * pending invites, so WebMCP teams tools can discover the ids the write actions
 * need (organizationId, memberId, inviteId). The dashboard loads this data in
 * server components, so there is no existing client-callable list action.
 */

export async function listOrganizationsForAgent() {
	const user = await getCurrentUser();
	if (!user) throw new Error("Not signed in");

	const rows = await db()
		.select({
			id: organizations.id,
			name: organizations.name,
			ownerId: organizations.ownerId,
			role: organizationMembers.role,
		})
		.from(organizationMembers)
		.innerJoin(
			organizations,
			eq(organizationMembers.organizationId, organizations.id),
		)
		.where(eq(organizationMembers.userId, user.id));

	return {
		activeOrganizationId: user.activeOrganizationId ?? null,
		organizations: rows.map((row) => ({
			id: row.id,
			name: row.name,
			role: row.role,
			isOwner: row.ownerId === user.id,
			isActive: row.id === user.activeOrganizationId,
		})),
	};
}

async function requireMembership(organizationId: Organisation.OrganisationId) {
	const user = await getCurrentUser();
	if (!user) throw new Error("Not signed in");
	const [membership] = await db()
		.select({ id: organizationMembers.id })
		.from(organizationMembers)
		.where(
			and(
				eq(organizationMembers.organizationId, organizationId),
				eq(organizationMembers.userId, user.id),
			),
		)
		.limit(1);
	if (!membership) throw new Error("Unauthorized");
	return user;
}

export async function listOrganizationMembersForAgent(orgId: string) {
	const organizationId = Organisation.OrganisationId.make(orgId);
	await requireMembership(organizationId);

	const members = await db()
		.select({
			memberId: organizationMembers.id,
			userId: organizationMembers.userId,
			role: organizationMembers.role,
			name: users.name,
			email: users.email,
		})
		.from(organizationMembers)
		.innerJoin(users, eq(organizationMembers.userId, users.id))
		.where(eq(organizationMembers.organizationId, organizationId));

	const invites = await db()
		.select({
			inviteId: organizationInvites.id,
			email: organizationInvites.invitedEmail,
			role: organizationInvites.role,
			status: organizationInvites.status,
		})
		.from(organizationInvites)
		.where(eq(organizationInvites.organizationId, organizationId));

	return {
		organizationId,
		members,
		pendingInvites: invites.filter((invite) => invite.status === "pending"),
	};
}
