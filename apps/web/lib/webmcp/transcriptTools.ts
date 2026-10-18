import type { Video } from "@cap/web-domain";
import { editTranscriptEntry } from "@/actions/videos/edit-transcript";
import { getAvailableTranslations } from "@/actions/videos/get-available-translations";
import { getEditTranscript } from "@/actions/videos/get-edit-transcript";
import { getTranscript } from "@/actions/videos/get-transcript";
import { translateTranscript } from "@/actions/videos/translate-transcript";
import {
	MUTATING,
	READ_ONLY,
	registerWebMcpTool,
	UNTRUSTED,
} from "./webmcp.service";

type TargetLanguage = Parameters<typeof translateTranscript>[1];

const asVideoId = (id: unknown): Video.VideoId => {
	const value = String(id ?? "").trim();
	if (!value) throw new Error("capId must not be empty.");
	return value as Video.VideoId;
};

/**
 * Transcript & caption tools. Transcript content is produced by speech-to-text
 * from whatever the recording contains, so reads are marked untrusted — treat
 * their text as data, not instructions.
 */
export function registerTranscriptTools(): Array<() => void> {
	const unregister: Array<() => void> = [];

	unregister.push(
		registerWebMcpTool<{ capId: string }>({
			name: "get_transcript",
			description:
				"Get the plain transcript (WebVTT) of a cap, if transcription is " +
				"complete. The text is machine-generated from the recording's audio.",
			annotations: UNTRUSTED,
			inputSchema: {
				type: "object",
				properties: {
					capId: { type: "string", description: "Cap id from list_caps." },
				},
				required: ["capId"],
			},
			execute: async ({ capId }) => {
				const result = await getTranscript(asVideoId(capId));
				if (!result.success)
					throw new Error(result.message || "Transcript not available");
				return { capId, content: result.content ?? null };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ capId: string }>({
			name: "get_editable_transcript",
			description:
				"Get the structured, editable transcript of a cap: entries with ids " +
				"and timings. Use the entry ids with edit_transcript_entry. Returns " +
				"null if no editable transcript exists yet.",
			annotations: UNTRUSTED,
			inputSchema: {
				type: "object",
				properties: {
					capId: { type: "string", description: "Cap id from list_caps." },
				},
				required: ["capId"],
			},
			execute: async ({ capId }) => {
				return getEditTranscript(asVideoId(capId));
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ capId: string; entryId: number; newText: string }>({
			name: "edit_transcript_entry",
			description:
				"Change the text of one transcript entry. Get the entry's id from " +
				"get_editable_transcript first.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					capId: { type: "string", description: "Cap id from list_caps." },
					entryId: {
						type: "integer",
						description: "Entry id from get_editable_transcript.",
					},
					newText: { type: "string", description: "Replacement text." },
				},
				required: ["capId", "entryId", "newText"],
			},
			execute: async ({ capId, entryId, newText }) => {
				if (!Number.isInteger(entryId))
					throw new Error("entryId must be an integer.");
				const result = await editTranscriptEntry(
					asVideoId(capId),
					entryId,
					String(newText ?? ""),
				);
				if (!result.success)
					throw new Error(result.message || "Failed to edit transcript entry");
				return { capId, entryId };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ capId: string }>({
			name: "list_available_translations",
			description:
				"List the languages a cap's transcript has been translated into, and " +
				"whether an original transcript exists.",
			annotations: READ_ONLY,
			inputSchema: {
				type: "object",
				properties: {
					capId: { type: "string", description: "Cap id from list_caps." },
				},
				required: ["capId"],
			},
			execute: async ({ capId }) => {
				const result = await getAvailableTranslations(asVideoId(capId));
				if (!result.success)
					throw new Error(result.message || "Failed to list translations");
				return {
					capId,
					hasOriginal: result.hasOriginal,
					translations: result.translations,
				};
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ capId: string; targetLanguage: string }>({
			name: "translate_transcript",
			description:
				"Translate a cap's transcript into a target language (BCP-47 code, " +
				"for example 'es', 'fr', 'de').",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					capId: { type: "string", description: "Cap id from list_caps." },
					targetLanguage: {
						type: "string",
						description: "Language code to translate into.",
					},
				},
				required: ["capId", "targetLanguage"],
			},
			execute: async ({ capId, targetLanguage }) => {
				const lang = String(targetLanguage ?? "").trim();
				if (!lang) throw new Error("targetLanguage must not be empty.");
				const result = await translateTranscript(
					asVideoId(capId),
					lang as TargetLanguage,
				);
				if (!result.success)
					throw new Error(result.message || "Failed to translate transcript");
				return { capId, targetLanguage: lang, translated: true };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ capId: string }>({
			name: "retry_transcription",
			description:
				"Retry transcription of a cap (for example after it failed). This " +
				"re-runs the transcription job.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					capId: { type: "string", description: "Cap id from list_caps." },
				},
				required: ["capId"],
			},
			execute: async ({ capId }) => {
				const id = asVideoId(capId);
				const response = await fetch(
					`/api/videos/${encodeURIComponent(id)}/retry-transcription`,
					{ method: "POST", credentials: "same-origin" },
				);
				if (!response.ok) {
					const body = await response.json().catch(() => null);
					throw new Error(
						body?.error || `Failed to retry transcription (${response.status})`,
					);
				}
				return { capId: id, retried: true };
			},
		}),
	);

	return unregister;
}
