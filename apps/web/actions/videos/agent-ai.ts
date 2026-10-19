"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { videos } from "@cap/database/schema";
import { Video } from "@cap/web-domain";
import { eq } from "drizzle-orm";

/**
 * Owner-gated read of a cap's AI-generated content (summary + chapters) and its
 * generation status, from videos.metadata. Used by the Cap AI WebMCP tools,
 * including to supply the optimistic-lock `expected` value when editing.
 */
export async function getAiContentForAgent(videoId: string) {
	const user = await getCurrentUser();
	if (!user) throw new Error("Not signed in");
	if (!/^[A-Za-z0-9_-]{5,128}$/.test(videoId))
		throw new Error("Invalid cap id");
	const id = Video.VideoId.make(videoId);

	const [video] = await db()
		.select({ metadata: videos.metadata, ownerId: videos.ownerId })
		.from(videos)
		.where(eq(videos.id, id))
		.limit(1);
	if (!video || video.ownerId !== user.id) throw new Error("Unauthorized");

	const metadata = video.metadata ?? {};
	return {
		summary: metadata.summary ?? "",
		chapters: metadata.chapters ?? [],
		generationStatus: metadata.aiGenerationStatus ?? null,
	};
}
