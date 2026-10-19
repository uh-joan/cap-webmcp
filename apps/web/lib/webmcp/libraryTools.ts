import type { Video } from "@cap/web-domain";
import type { Effect } from "effect";
import { getCapForAgent, listCapsForAgent } from "@/actions/videos/agent-list";
import { editDate } from "@/actions/videos/edit-date";
import { editTitle } from "@/actions/videos/edit-title";
import { EffectRuntime } from "@/lib/EffectRuntime";
import {
	CONFIRM,
	MUTATING,
	READ_ONLY,
	registerWebMcpTool,
} from "./webmcp.service";

/** The subset of the RPC client the library tools use. */
export type LibraryRpc = {
	VideoDelete: (id: Video.VideoId) => Effect.Effect<void, unknown, never>;
	VideoDuplicate: (id: Video.VideoId) => Effect.Effect<unknown, unknown, never>;
};

const asVideoId = (id: unknown): Video.VideoId => {
	const value = String(id ?? "").trim();
	if (!value) throw new Error("capId must not be empty.");
	return value as Video.VideoId;
};

/**
 * Library tools: list/get/rename/re-date/duplicate/delete the signed-in user's
 * caps. Reads go through session-based server actions; delete/duplicate reuse
 * the typed RPC client the dashboard already uses.
 */
export function registerLibraryTools(deps: {
	rpc: LibraryRpc;
}): Array<() => void> {
	const { rpc } = deps;
	const unregister: Array<() => void> = [];

	unregister.push(
		registerWebMcpTool<{ search?: string; limit?: number }>({
			name: "list_caps",
			description:
				"List the signed-in user's recordings (caps), most recently updated " +
				"first, optionally filtered by a title keyword. Returns ids for the " +
				"other cap tools.",
			annotations: READ_ONLY,
			inputSchema: {
				type: "object",
				properties: {
					search: {
						type: "string",
						description: "Keyword to match on the cap title.",
					},
					limit: {
						type: "integer",
						minimum: 1,
						maximum: 50,
						description: "Max results (default 20).",
					},
				},
			},
			execute: ({ search, limit }) => listCapsForAgent({ search, limit }),
		}),
	);

	unregister.push(
		registerWebMcpTool<{ capId: string }>({
			name: "get_cap",
			description:
				"Get one of the signed-in user's caps by id: title, duration, created/" +
				"updated times, and transcription status. Returns null if not found or " +
				"not owned by the user.",
			annotations: READ_ONLY,
			inputSchema: {
				type: "object",
				properties: {
					capId: { type: "string", description: "Cap id from list_caps." },
				},
				required: ["capId"],
			},
			execute: ({ capId }) => getCapForAgent(String(capId ?? "").trim()),
		}),
	);

	unregister.push(
		registerWebMcpTool<{ capId: string; title: string }>({
			name: "rename_cap",
			description: "Rename one of the signed-in user's caps.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					capId: { type: "string", description: "Cap id from list_caps." },
					title: { type: "string", description: "New title." },
				},
				required: ["capId", "title"],
			},
			execute: async ({ capId, title }) => {
				const name = String(title ?? "").trim();
				if (!name) throw new Error("title must not be empty.");
				await editTitle(asVideoId(capId), name);
				return { capId, title: name };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ capId: string; date: string }>({
			name: "edit_cap_date",
			description:
				"Change the recorded date of a cap. `date` is an ISO-8601 date-time " +
				"string (for example '2026-01-15T10:30:00.000Z').",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					capId: { type: "string", description: "Cap id from list_caps." },
					date: { type: "string", description: "ISO-8601 date-time." },
				},
				required: ["capId", "date"],
			},
			execute: async ({ capId, date }) => {
				const value = String(date ?? "").trim();
				if (Number.isNaN(Date.parse(value)))
					throw new Error("date must be a valid ISO-8601 date-time string.");
				await editDate(asVideoId(capId), value);
				return { capId, date: value };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ capId: string }>({
			name: "duplicate_cap",
			description:
				"Duplicate one of the signed-in user's caps. Returns the new cap.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					capId: { type: "string", description: "Cap id from list_caps." },
				},
				required: ["capId"],
			},
			execute: async ({ capId }) => {
				const result = await EffectRuntime.runPromise(
					rpc.VideoDuplicate(asVideoId(capId)),
				);
				return { duplicatedFrom: capId, result };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ capId: string }>({
			name: "delete_cap",
			description:
				"Permanently delete one of the signed-in user's caps. This cannot be " +
				"undone.",
			annotations: CONFIRM,
			inputSchema: {
				type: "object",
				properties: {
					capId: { type: "string", description: "Cap id from list_caps." },
				},
				required: ["capId"],
			},
			execute: async ({ capId }) => {
				await EffectRuntime.runPromise(rpc.VideoDelete(asVideoId(capId)));
				return { deleted: capId };
			},
		}),
	);

	return unregister;
}
