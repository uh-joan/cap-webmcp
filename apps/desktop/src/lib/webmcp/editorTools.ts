import { Channel } from "@tauri-apps/api/core";
import {
	commands,
	type ExportCompression,
	type ExportSettings,
	type FramesRendered,
	type ProjectConfiguration,
} from "../../utils/tauri";
import { MUTATING, READ_ONLY, registerWebMcpTool } from "./webmcp.service";

const COMPRESSIONS: ExportCompression[] = [
	"Maximum",
	"Social",
	"Web",
	"Potato",
];

type ExportFormat = "Mp4" | "Gif" | "Mov";
const FORMATS: ExportFormat[] = ["Mp4", "Gif", "Mov"];

/**
 * Studio editor + export tools. Reads/edits the open editor project and renders
 * it to a video. Project config is passed through as-is: read it with
 * get_default_project_config or get_editor_meta, modify, then set_project_config.
 */
export function registerEditorTools(): Array<() => void> {
	const unregister: Array<() => void> = [];

	unregister.push(
		registerWebMcpTool({
			name: "get_editor_project_path",
			description: "Get the path of the project currently open in the editor.",
			annotations: READ_ONLY,
			execute: () => commands.getEditorProjectPath(),
		}),
	);

	unregister.push(
		registerWebMcpTool({
			name: "get_editor_meta",
			description:
				"Get the metadata of the recording open in the editor (name, platform, " +
				"sharing/upload state).",
			annotations: READ_ONLY,
			execute: () => commands.getEditorMeta(),
		}),
	);

	unregister.push(
		registerWebMcpTool({
			name: "get_default_project_config",
			description:
				"Get a default Studio project configuration, as a starting point for " +
				"set_project_config.",
			annotations: READ_ONLY,
			execute: () => commands.getDefaultProjectConfig(),
		}),
	);

	unregister.push(
		registerWebMcpTool({
			name: "generate_zoom_segments",
			description:
				"Generate zoom segments from the recording's click track (does not save " +
				"them; include them in a set_project_config call to apply).",
			annotations: READ_ONLY,
			execute: () => commands.generateZoomSegmentsFromClicks(),
		}),
	);

	unregister.push(
		registerWebMcpTool<{ config: ProjectConfiguration }>({
			name: "set_project_config",
			description:
				"Persist the full Studio project configuration for the open editor " +
				"(backgrounds, zooms, trims, captions, etc.). Pass a complete config " +
				"object obtained from get_default_project_config or get_editor_meta and " +
				"modified.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					config: {
						type: "object",
						description: "A complete ProjectConfiguration object.",
					},
				},
				required: ["config"],
			},
			execute: async ({ config }) => {
				if (!config || typeof config !== "object")
					throw new Error("config must be a ProjectConfiguration object.");
				await commands.setProjectConfig(config);
				return { saved: true };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ projectPath: string }>({
			name: "open_editor_for_recording",
			description:
				"Open the Studio editor for a recording by its project path (from " +
				"list_recordings).",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					projectPath: {
						type: "string",
						description: "Recording project path from list_recordings.",
					},
				},
				required: ["projectPath"],
			},
			execute: async ({ projectPath }) => {
				const path = String(projectPath ?? "").trim();
				if (!path) throw new Error("projectPath must not be empty.");
				await commands.openEditorRecordingMain(path);
				return { opened: path };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{
			projectPath?: string;
			format?: ExportFormat;
			fps?: number;
			width?: number;
			height?: number;
			compression?: ExportCompression;
		}>({
			name: "export_video",
			description:
				"Render and export the editor project to a file in its project folder. " +
				"`format` is 'Mp4' (default), 'Gif', or 'Mov'. Defaults: the open editor " +
				"project, 30fps, 1920x1080; `compression` (Mp4 only) defaults to 'Web'. " +
				"Returns the exported file path. This can take a while for long recordings.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					projectPath: {
						type: "string",
						description: "Project path (default: the open editor project).",
					},
					format: {
						type: "string",
						enum: [...FORMATS],
						description: "Output format (default 'Mp4').",
					},
					fps: { type: "integer", minimum: 1, maximum: 120 },
					width: { type: "integer", minimum: 1 },
					height: { type: "integer", minimum: 1 },
					compression: {
						type: "string",
						enum: [...COMPRESSIONS],
						description: "Export quality, Mp4 only (default 'Web').",
					},
				},
			},
			execute: async ({
				projectPath,
				format,
				fps,
				width,
				height,
				compression,
			}) => {
				const path =
					String(projectPath ?? "").trim() ||
					(await commands.getEditorProjectPath());
				const fmt: ExportFormat = FORMATS.includes(format as ExportFormat)
					? (format as ExportFormat)
					: "Mp4";
				const resolution_base = {
					x: typeof width === "number" ? width : 1920,
					y: typeof height === "number" ? height : 1080,
				};
				const outFps = typeof fps === "number" ? fps : 30;
				let settings: ExportSettings;
				if (fmt === "Gif") {
					settings = {
						format: "Gif",
						fps: outFps,
						resolution_base,
						quality: null,
					};
				} else if (fmt === "Mov") {
					settings = { format: "Mov", fps: outFps, resolution_base };
				} else {
					settings = {
						format: "Mp4",
						fps: outFps,
						resolution_base,
						compression:
							compression && COMPRESSIONS.includes(compression)
								? compression
								: "Web",
						custom_bpp: null,
					};
				}
				const progress = new Channel<FramesRendered>();
				const output = await commands.exportVideo(path, progress, settings);
				return { path: output, format: fmt };
			},
		}),
	);

	return unregister;
}
