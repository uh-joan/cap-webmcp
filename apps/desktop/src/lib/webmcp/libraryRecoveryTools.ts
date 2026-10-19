import { commands } from "../../utils/tauri";
import {
	CONFIRM,
	MUTATING,
	READ_ONLY,
	registerWebMcpTool,
} from "./webmcp.service";

/**
 * Library & recovery tools: browse saved recordings and screenshots, and find /
 * recover / discard recordings left incomplete by a crash.
 */
export function registerLibraryRecoveryTools(): Array<() => void> {
	const unregister: Array<() => void> = [];

	unregister.push(
		registerWebMcpTool({
			name: "list_recordings",
			description:
				"List the user's saved recordings as [path, metadata] entries. The " +
				"path is the project path used by open_editor_for_recording.",
			annotations: READ_ONLY,
			execute: () => commands.listRecordings(),
		}),
	);

	unregister.push(
		registerWebMcpTool({
			name: "list_screenshots",
			description:
				"List the user's saved screenshots as [path, metadata] entries.",
			annotations: READ_ONLY,
			execute: () => commands.listScreenshots(),
		}),
	);

	unregister.push(
		registerWebMcpTool({
			name: "find_incomplete_recordings",
			description:
				"Find recordings left incomplete by a crash or unexpected exit, which " +
				"can be recovered or discarded.",
			annotations: READ_ONLY,
			execute: () => commands.findIncompleteRecordings(),
		}),
	);

	unregister.push(
		registerWebMcpTool<{ projectPath: string }>({
			name: "recover_recording",
			description:
				"Recover an incomplete recording by its project path (from " +
				"find_incomplete_recordings). Returns the recovered project path.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					projectPath: {
						type: "string",
						description: "Project path from find_incomplete_recordings.",
					},
				},
				required: ["projectPath"],
			},
			execute: async ({ projectPath }) => {
				const path = String(projectPath ?? "").trim();
				if (!path) throw new Error("projectPath must not be empty.");
				const recovered = await commands.recoverRecording(path);
				return { recovered };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ projectPath: string }>({
			name: "discard_incomplete_recording",
			description:
				"Permanently discard an incomplete recording by its project path. This " +
				"cannot be undone.",
			annotations: CONFIRM,
			inputSchema: {
				type: "object",
				properties: {
					projectPath: {
						type: "string",
						description: "Project path from find_incomplete_recordings.",
					},
				},
				required: ["projectPath"],
			},
			execute: async ({ projectPath }) => {
				const path = String(projectPath ?? "").trim();
				if (!path) throw new Error("projectPath must not be empty.");
				await commands.discardIncompleteRecording(path);
				return { discarded: path };
			},
		}),
	);

	return unregister;
}
