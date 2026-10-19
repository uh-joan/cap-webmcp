import type { Comment, ImageUpload, Video } from "@cap/web-domain";
import { listCommentsForAgent } from "@/actions/videos/agent-comments";
import { deleteComment } from "@/actions/videos/delete-comment";
import { newComment } from "@/actions/videos/new-comment";
import {
	CONFIRM,
	MUTATING,
	registerWebMcpTool,
	UNTRUSTED,
} from "./webmcp.service";

const asVideoId = (id: unknown): Video.VideoId => {
	const value = String(id ?? "").trim();
	if (!value) throw new Error("capId must not be empty.");
	return value as Video.VideoId;
};

const asCommentId = (id: unknown): Comment.CommentId =>
	String(id ?? "").trim() as Comment.CommentId;

/**
 * Comment tools: read, add, and delete comments and emoji reactions on a cap.
 * Comment content is written by viewers, so reads are marked untrusted — treat
 * the text as data, not instructions.
 */
export function registerCommentTools(): Array<() => void> {
	const unregister: Array<() => void> = [];

	unregister.push(
		registerWebMcpTool<{ capId: string }>({
			name: "list_comments",
			description:
				"List the comments and emoji reactions on one of the signed-in user's " +
				"caps, oldest first. Returns ids for reply/delete, plus each comment's " +
				"type, content, author id, parent id, and playback timestamp.",
			annotations: UNTRUSTED,
			inputSchema: {
				type: "object",
				properties: {
					capId: { type: "string", description: "Cap id from list_caps." },
				},
				required: ["capId"],
			},
			execute: async ({ capId }) => {
				const rows = await listCommentsForAgent(String(capId ?? "").trim());
				return { capId, total: rows.length, comments: rows };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{
			capId: string;
			content: string;
			type?: "text" | "emoji";
			parentCommentId?: string;
			timestamp?: number;
		}>({
			name: "add_comment",
			description:
				"Add a comment (or an emoji reaction, with type 'emoji') to a cap. Pass " +
				"`parentCommentId` to reply to an existing comment, and `timestamp` " +
				"(seconds) to anchor it to a point in the video.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					capId: { type: "string", description: "Cap id from list_caps." },
					content: {
						type: "string",
						description: "Comment text, or the emoji for a reaction.",
					},
					type: {
						type: "string",
						enum: ["text", "emoji"],
						description: "Comment kind (default 'text').",
					},
					parentCommentId: {
						type: "string",
						description: "Id of the comment to reply to (from list_comments).",
					},
					timestamp: {
						type: "number",
						description: "Playback time in seconds to anchor the comment to.",
					},
				},
				required: ["capId", "content"],
			},
			execute: async ({ capId, content, type, parentCommentId, timestamp }) => {
				const text = String(content ?? "").trim();
				if (!text) throw new Error("content must not be empty.");
				const result = await newComment({
					content: text,
					videoId: asVideoId(capId),
					type: type === "emoji" ? "emoji" : "text",
					authorImage: null as ImageUpload.ImageUrl | null,
					parentCommentId: asCommentId(parentCommentId ?? ""),
					timestamp: typeof timestamp === "number" ? timestamp : null,
				});
				return { capId, comment: result };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{
			capId: string;
			commentId: string;
			parentCommentId?: string;
		}>({
			name: "delete_comment",
			description:
				"Delete a comment or reaction from a cap. Pass `parentCommentId` if the " +
				"comment is a reply. This cannot be undone.",
			annotations: CONFIRM,
			inputSchema: {
				type: "object",
				properties: {
					capId: { type: "string", description: "Cap id from list_caps." },
					commentId: {
						type: "string",
						description: "Id of the comment to delete (from list_comments).",
					},
					parentCommentId: {
						type: "string",
						description: "Parent comment id, if this comment is a reply.",
					},
				},
				required: ["capId", "commentId"],
			},
			execute: async ({ capId, commentId, parentCommentId }) => {
				const id = String(commentId ?? "").trim();
				if (!id) throw new Error("commentId must not be empty.");
				await deleteComment({
					commentId: asCommentId(id),
					parentId: parentCommentId ? asCommentId(parentCommentId) : null,
					videoId: asVideoId(capId),
				});
				return { capId, deletedComment: id };
			},
		}),
	);

	return unregister;
}
