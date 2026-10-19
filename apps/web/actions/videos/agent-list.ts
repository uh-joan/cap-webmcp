"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { organizations, videos } from "@cap/database/schema";
import { Video } from "@cap/web-domain";
import { and, desc, eq, isNull, like } from "drizzle-orm";

/**
 * Session-based list/get of the signed-in user's own caps, for WebMCP dashboard
 * tools. `lib/mcp-data.ts` covers the same ground but is `server-only` and keyed
 * by an explicit userId for the bearer-auth MCP server, so it can't be called
 * from the dashboard client. These actions use the session user instead.
 */

const MAX_LIST = 50;

export async function listCapsForAgent(input: {
	search?: string;
	limit?: number;
}) {
	const user = await getCurrentUser();
	if (!user) throw new Error("Not signed in");

	const search = input.search?.trim();
	if (search && search.length > 80)
		throw new Error("search must be 80 characters or less");
	const limit = Math.min(Math.max(input.limit ?? 20, 1), MAX_LIST);

	const rows = await db()
		.select({
			id: videos.id,
			name: videos.name,
			duration: videos.duration,
			createdAt: videos.createdAt,
			updatedAt: videos.updatedAt,
			transcriptionStatus: videos.transcriptionStatus,
		})
		.from(videos)
		.innerJoin(organizations, eq(videos.orgId, organizations.id))
		.where(
			and(
				eq(videos.ownerId, user.id),
				isNull(organizations.tombstoneAt),
				search ? like(videos.name, `%${search}%`) : undefined,
			),
		)
		.orderBy(desc(videos.updatedAt), desc(videos.id))
		.limit(limit);

	return {
		total: rows.length,
		caps: rows.map((row) => ({
			id: row.id,
			title: row.name,
			durationSeconds: row.duration,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString(),
			transcriptionStatus: row.transcriptionStatus,
		})),
	};
}

export async function getCapForAgent(id: string) {
	const user = await getCurrentUser();
	if (!user) throw new Error("Not signed in");
	if (!/^[A-Za-z0-9_-]{5,128}$/.test(id)) throw new Error("Invalid cap id");

	const [row] = await db()
		.select({
			id: videos.id,
			name: videos.name,
			duration: videos.duration,
			createdAt: videos.createdAt,
			updatedAt: videos.updatedAt,
			transcriptionStatus: videos.transcriptionStatus,
		})
		.from(videos)
		.innerJoin(organizations, eq(videos.orgId, organizations.id))
		.where(
			and(
				eq(videos.id, Video.VideoId.make(id)),
				eq(videos.ownerId, user.id),
				isNull(organizations.tombstoneAt),
			),
		)
		.limit(1);

	if (!row) return null;
	return {
		id: row.id,
		title: row.name,
		durationSeconds: row.duration,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		transcriptionStatus: row.transcriptionStatus,
	};
}
