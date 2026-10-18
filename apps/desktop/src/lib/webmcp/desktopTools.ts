import { commands, type RecordingMode } from "../../utils/tauri";
import { MUTATING, READ_ONLY, registerWebMcpTool } from "./webmcp.service";

const RECORDING_MODES: RecordingMode[] = ["studio", "instant", "screenshot"];

/**
 * Desktop recorder tools, exposed through the WKWebView modelContext shim. Each
 * calls the generated Tauri `commands`, so the agent drives the real app.
 *
 * First increment: state, source discovery, mode, and simple lifecycle controls.
 * start_recording (which needs a full StartRecordingInputs target) comes next.
 */
export function registerDesktopTools(): Array<() => void> {
	const unregister: Array<() => void> = [];

	unregister.push(
		registerWebMcpTool({
			name: "get_recording_state",
			description:
				"Get the current desktop recording state (what is being recorded, or " +
				"null if idle).",
			annotations: READ_ONLY,
			execute: () => commands.getCurrentRecording(),
		}),
	);

	unregister.push(
		registerWebMcpTool({
			name: "list_screens",
			description: "List the displays available to record.",
			annotations: READ_ONLY,
			execute: () => commands.listCaptureDisplays(),
		}),
	);

	unregister.push(
		registerWebMcpTool({
			name: "list_windows",
			description: "List the windows available to record.",
			annotations: READ_ONLY,
			execute: () => commands.listCaptureWindows(),
		}),
	);

	unregister.push(
		registerWebMcpTool({
			name: "list_cameras",
			description: "List the cameras available for the recording.",
			annotations: READ_ONLY,
			execute: () => commands.listCameras(),
		}),
	);

	unregister.push(
		registerWebMcpTool({
			name: "list_audio_devices",
			description: "List the microphones / audio input devices available.",
			annotations: READ_ONLY,
			execute: () => commands.listAudioDevices(),
		}),
	);

	unregister.push(
		registerWebMcpTool<{ mode: RecordingMode }>({
			name: "set_recording_mode",
			description:
				"Set the recording mode: 'studio' (record locally, then edit), " +
				"'instant' (upload while recording), or 'screenshot'.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					mode: {
						type: "string",
						enum: [...RECORDING_MODES],
						description: "The recording mode to switch to.",
					},
				},
				required: ["mode"],
			},
			execute: async ({ mode }) => {
				if (!RECORDING_MODES.includes(mode))
					throw new Error(
						`mode must be one of: ${RECORDING_MODES.join(", ")}.`,
					);
				await commands.setRecordingMode(mode);
				return { mode };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool({
			name: "stop_recording",
			description: "Stop the current recording.",
			annotations: MUTATING,
			execute: async () => {
				await commands.stopRecording();
				return { stopped: true };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool({
			name: "pause_recording",
			description: "Pause the current recording.",
			annotations: MUTATING,
			execute: async () => {
				await commands.pauseRecording();
				return { paused: true };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool({
			name: "resume_recording",
			description: "Resume a paused recording.",
			annotations: MUTATING,
			execute: async () => {
				await commands.resumeRecording();
				return { resumed: true };
			},
		}),
	);

	return unregister;
}
