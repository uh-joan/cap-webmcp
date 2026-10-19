"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { comments, videos } from "@cap/database/schema";
import { Video } from "@cap/web-domain";
import { asc, eq } from "drizzle-orm";

/**
 * Owner-gated list of a cap's comments for WebMCP dashboard tools. There is no
 * existing list-comments server action (comments render server-side on the
 * share page), and the add/delete tools need comment ids, so this provides them
 * for caps the signed-in user owns.
 */
export async function listCommentsForAgent(videoId: string) {
	const user = await getCurrentUser();
	if (!user) throw new Error("Not signed in");
	if (!/^[A-Za-z0-9_-]{5,128}$/.test(videoId))
		throw new Error("Invalid cap id");
	const id = Video.VideoId.make(videoId);

	const [video] = await db()
		.select({ ownerId: videos.ownerId })
		.from(videos)
		.where(eq(videos.id, id))
		.limit(1);
	if (!video || video.ownerId !== user.id) throw new Error("Unauthorized");

	const rows = await db()
		.select({
			id: comments.id,
			type: comments.type,
			content: comments.content,
			timestamp: comments.timestamp,
			authorId: comments.authorId,
			parentCommentId: comments.parentCommentId,
			createdAt: comments.createdAt,
		})
		.from(comments)
		.where(eq(comments.videoId, id))
		.orderBy(asc(comments.createdAt))
		.limit(500);

	return rows.map((row) => ({
		id: row.id,
		type: row.type,
		content: row.content,
		timestamp: row.timestamp,
		authorId: row.authorId,
		parentCommentId: row.parentCommentId,
		createdAt: row.createdAt.toISOString(),
	}));
}
