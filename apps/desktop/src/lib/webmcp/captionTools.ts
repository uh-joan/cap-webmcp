import {
	type CaptionData,
	commands,
	type TranscriptionEngine,
} from "../../utils/tauri";
import { requireConfirm } from "./confirm";
import {
	CONFIRM,
	MUTATING,
	READ_ONLY,
	registerWebMcpTool,
	UNTRUSTED,
} from "./webmcp.service";

const ENGINES: TranscriptionEngine[] = ["Whisper", "Parakeet"];

/**
 * Captions / transcription tools. Transcribe a recording's audio with a local
 * Whisper or Parakeet model, read/write caption data, export SRT, and manage the
 * downloaded models. Transcript reads are untrusted (machine-generated from audio).
 */
export function registerCaptionTools(): Array<() => void> {
	const unregister: Array<() => void> = [];

	unregister.push(
		registerWebMcpTool<{ videoId: string }>({
			name: "load_captions",
			description:
				"Load the saved captions (segments + styling) for a recording, or null " +
				"if none exist.",
			annotations: UNTRUSTED,
			inputSchema: {
				type: "object",
				properties: {
					videoId: { type: "string", description: "Recording / video id." },
				},
				required: ["videoId"],
			},
			execute: ({ videoId }) =>
				commands.loadCaptions(String(videoId ?? "").trim()),
		}),
	);

	unregister.push(
		registerWebMcpTool<{ videoId: string; captions: CaptionData }>({
			name: "save_captions",
			description:
				"Save caption data (segments + settings) for a recording. Pass a full " +
				"CaptionData object, typically from transcribe_audio or load_captions.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					videoId: { type: "string", description: "Recording / video id." },
					captions: {
						type: "object",
						description: "A complete CaptionData object.",
					},
				},
				required: ["videoId", "captions"],
			},
			execute: async ({ videoId, captions }) => {
				if (!captions || typeof captions !== "object")
					throw new Error("captions must be a CaptionData object.");
				await commands.saveCaptions(String(videoId ?? "").trim(), captions);
				return { saved: true };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ videoId: string }>({
			name: "export_captions_srt",
			description:
				"Export a recording's captions as an SRT file. Returns the SRT path, or " +
				"null if there are no captions.",
			annotations: READ_ONLY,
			inputSchema: {
				type: "object",
				properties: {
					videoId: { type: "string", description: "Recording / video id." },
				},
				required: ["videoId"],
			},
			execute: ({ videoId }) =>
				commands.exportCaptionsSrt(String(videoId ?? "").trim()),
		}),
	);

	unregister.push(
		registerWebMcpTool<{
			videoPath: string;
			modelPath: string;
			language: string;
			engine: TranscriptionEngine;
		}>({
			name: "transcribe_audio",
			description:
				"Transcribe a recording's audio into captions using a local model. " +
				"`engine` is 'Whisper' or 'Parakeet'; `modelPath` is the downloaded " +
				"model path (see download/check tools); `language` is a code like 'en'.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					videoPath: {
						type: "string",
						description: "Path to the recording's audio/video.",
					},
					modelPath: {
						type: "string",
						description: "Path to the downloaded model.",
					},
					language: {
						type: "string",
						description: "Language code, e.g. 'en'.",
					},
					engine: {
						type: "string",
						enum: [...ENGINES],
						description: "Transcription engine.",
					},
				},
				required: ["videoPath", "modelPath", "language", "engine"],
			},
			execute: ({ videoPath, modelPath, language, engine }) => {
				if (!ENGINES.includes(engine))
					throw new Error(`engine must be one of: ${ENGINES.join(", ")}.`);
				return commands.transcribeAudio(
					String(videoPath ?? "").trim(),
					String(modelPath ?? "").trim(),
					String(language ?? "").trim() || "en",
					engine,
				);
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ targetPath: string }>({
			name: "get_caption_model_status",
			description:
				"Get the download status/progress of a transcription model at a path.",
			annotations: READ_ONLY,
			inputSchema: {
				type: "object",
				properties: {
					targetPath: { type: "string", description: "Model file/dir path." },
				},
				required: ["targetPath"],
			},
			execute: ({ targetPath }) =>
				commands.getModelDownloadStatus(String(targetPath ?? "").trim()),
		}),
	);

	unregister.push(
		registerWebMcpTool<{ modelPath: string }>({
			name: "check_whisper_model",
			description: "Check whether a Whisper model exists at a path.",
			annotations: READ_ONLY,
			inputSchema: {
				type: "object",
				properties: {
					modelPath: {
						type: "string",
						description: "Whisper model file path.",
					},
				},
				required: ["modelPath"],
			},
			execute: ({ modelPath }) =>
				commands.checkModelExists(String(modelPath ?? "").trim()),
		}),
	);

	unregister.push(
		registerWebMcpTool<{ modelDir: string }>({
			name: "check_parakeet_model",
			description: "Check whether a Parakeet model exists in a directory.",
			annotations: READ_ONLY,
			inputSchema: {
				type: "object",
				properties: {
					modelDir: {
						type: "string",
						description: "Parakeet model directory.",
					},
				},
				required: ["modelDir"],
			},
			execute: ({ modelDir }) =>
				commands.checkParakeetModelExists(String(modelDir ?? "").trim()),
		}),
	);

	unregister.push(
		registerWebMcpTool<{ modelName: string; outputPath: string }>({
			name: "download_whisper_model",
			description:
				"Download a Whisper model by name to an output path (for transcription).",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					modelName: { type: "string", description: "Whisper model name." },
					outputPath: {
						type: "string",
						description: "Where to save the model.",
					},
				},
				required: ["modelName", "outputPath"],
			},
			execute: async ({ modelName, outputPath }) => {
				await commands.downloadWhisperModel(
					String(modelName ?? "").trim(),
					String(outputPath ?? "").trim(),
				);
				return { downloaded: String(modelName ?? "").trim() };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ outputDir: string }>({
			name: "download_parakeet_model",
			description: "Download the Parakeet model into an output directory.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					outputDir: {
						type: "string",
						description: "Directory to save the model.",
					},
				},
				required: ["outputDir"],
			},
			execute: async ({ outputDir }) => {
				await commands.downloadParakeetModel(String(outputDir ?? "").trim());
				return { downloaded: true };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ modelPath: string }>({
			name: "delete_whisper_model",
			description: "Delete a downloaded Whisper model file.",
			annotations: CONFIRM,
			inputSchema: {
				type: "object",
				properties: {
					modelPath: {
						type: "string",
						description: "Whisper model file path.",
					},
				},
				required: ["modelPath"],
			},
			execute: async ({ modelPath }) => {
				await requireConfirm("Delete this downloaded Whisper model?");
				await commands.deleteWhisperModel(String(modelPath ?? "").trim());
				return { deleted: String(modelPath ?? "").trim() };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ modelDir: string }>({
			name: "delete_parakeet_model",
			description: "Delete a downloaded Parakeet model directory.",
			annotations: CONFIRM,
			inputSchema: {
				type: "object",
				properties: {
					modelDir: {
						type: "string",
						description: "Parakeet model directory.",
					},
				},
				required: ["modelDir"],
			},
			execute: async ({ modelDir }) => {
				await requireConfirm("Delete this downloaded Parakeet model?");
				await commands.deleteParakeetModel(String(modelDir ?? "").trim());
				return { deleted: String(modelDir ?? "").trim() };
			},
		}),
	);

	return unregister;
}
