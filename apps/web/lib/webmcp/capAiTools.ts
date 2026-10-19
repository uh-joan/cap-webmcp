import type { Video } from "@cap/web-domain";
import { getAiContentForAgent } from "@/actions/videos/agent-ai";
import { editAiContent } from "@/actions/videos/edit-ai-content";
import { MUTATING, registerWebMcpTool, UNTRUSTED } from "./webmcp.service";

const asCapId = (id: unknown): string => {
	const value = String(id ?? "").trim();
	if (!value) throw new Error("capId must not be empty.");
	return value;
};

type Chapter = { title: string; start: number };

/**
 * Cap AI tools: generate, read, and edit a cap's AI summary and chapters.
 * AI content is model-generated from the recording, so reads are untrusted.
 */
export function registerCapAiTools(): Array<() => void> {
	const unregister: Array<() => void> = [];

	unregister.push(
		registerWebMcpTool<{ capId: string }>({
			name: "get_ai_content",
			description:
				"Get a cap's AI-generated summary, chapters, and generation status.",
			annotations: UNTRUSTED,
			inputSchema: {
				type: "object",
				properties: {
					capId: { type: "string", description: "Cap id from list_caps." },
				},
				required: ["capId"],
			},
			execute: async ({ capId }) => {
				const content = await getAiContentForAgent(asCapId(capId));
				return { capId, ...content };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ capId: string }>({
			name: "generate_ai",
			description:
				"Trigger AI generation (summary, chapters, title) for a cap. Requires " +
				"an eligible plan; generation runs asynchronously.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					capId: { type: "string", description: "Cap id from list_caps." },
				},
				required: ["capId"],
			},
			execute: async ({ capId }) => {
				const id = asCapId(capId);
				const response = await fetch(
					`/api/video/ai?videoId=${encodeURIComponent(id)}`,
					{ credentials: "same-origin" },
				);
				if (!response.ok) {
					const body = await response.json().catch(() => null);
					throw new Error(
						body?.error || `Failed to start AI generation (${response.status})`,
					);
				}
				return { capId: id, started: true };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ capId: string }>({
			name: "retry_ai",
			description:
				"Retry AI generation for a cap (for example after it failed).",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					capId: { type: "string", description: "Cap id from list_caps." },
				},
				required: ["capId"],
			},
			execute: async ({ capId }) => {
				const id = asCapId(capId);
				const response = await fetch(
					`/api/videos/${encodeURIComponent(id)}/retry-ai`,
					{ method: "POST", credentials: "same-origin" },
				);
				if (!response.ok) {
					const body = await response.json().catch(() => null);
					throw new Error(
						body?.error || `Failed to retry AI generation (${response.status})`,
					);
				}
				return { capId: id, retried: true };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{
			capId: string;
			summary?: string;
			chapters?: Chapter[];
		}>({
			name: "edit_ai_content",
			description:
				"Edit a cap's AI summary and/or chapters. Only the fields you pass are " +
				"changed; the rest are kept. `chapters` is an array of { title, start } " +
				"(start is seconds). Current content is read first to guard against " +
				"overwriting concurrent edits.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					capId: { type: "string", description: "Cap id from list_caps." },
					summary: { type: "string", description: "New summary text." },
					chapters: {
						type: "array",
						description: "Replacement chapters.",
						items: {
							type: "object",
							properties: {
								title: { type: "string" },
								start: {
									type: "number",
									description: "Chapter start time in seconds.",
								},
							},
							required: ["title", "start"],
						},
					},
				},
				required: ["capId"],
			},
			execute: async ({ capId, summary, chapters }) => {
				const id = asCapId(capId);
				if (summary === undefined && chapters === undefined)
					throw new Error("Pass summary and/or chapters to change.");
				const current = await getAiContentForAgent(id);
				const expected = {
					summary: current.summary,
					chapters: current.chapters,
				};
				const value = {
					summary: typeof summary === "string" ? summary : current.summary,
					chapters: Array.isArray(chapters) ? chapters : current.chapters,
				};
				const result = await editAiContent(id as Video.VideoId, {
					value,
					expected,
				});
				if (!result.success)
					throw new Error(result.message || "Failed to edit AI content");
				return { capId: id, updated: true };
			},
		}),
	);

	return unregister;
}
