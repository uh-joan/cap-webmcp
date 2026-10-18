import {
	commands,
	type OSPermission,
	type RecordingMode,
	type ScreenCaptureTarget,
} from "../../utils/tauri";
import {
	CONFIRM,
	MUTATING,
	READ_ONLY,
	registerWebMcpTool,
} from "./webmcp.service";

const RECORDING_MODES: RecordingMode[] = ["studio", "instant", "screenshot"];
const OS_PERMISSIONS: OSPermission[] = [
	"screenRecording",
	"camera",
	"microphone",
	"accessibility",
];

/** Build a Tauri ScreenCaptureTarget from a simple tool argument. */
function toCaptureTarget(target: {
	type: string;
	id?: string;
}): ScreenCaptureTarget {
	switch (target.type) {
		case "display":
			if (!target.id)
				throw new Error("A display id is required (from list_screens).");
			return { variant: "display", id: target.id };
		case "window":
			if (!target.id)
				throw new Error("A window id is required (from list_windows).");
			return { variant: "window", id: target.id };
		case "cameraOnly":
			return { variant: "cameraOnly" };
		default:
			throw new Error(
				`target.type must be 'display', 'window', or 'cameraOnly'. Got "${target.type}".`,
			);
	}
}

const CAPTURE_TARGET_SCHEMA = {
	type: "object",
	properties: {
		type: {
			type: "string",
			enum: ["display", "window", "cameraOnly"],
			description: "What to capture.",
		},
		id: {
			type: "string",
			description:
				"Display id (from list_screens) or window id (from list_windows). " +
				"Omit for 'cameraOnly'.",
		},
	},
	required: ["type"],
} as const;

/**
 * Desktop recorder tools, exposed through the WKWebView modelContext shim. Each
 * calls the generated Tauri `commands`, so the agent drives the real app.
 *
 * Covers state, source/device discovery and selection, mode, and the full
 * recording lifecycle (start/stop/pause/resume/restart/delete) plus screenshots.
 * The Studio editor and export tools are a separate group, added next.
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

	unregister.push(
		registerWebMcpTool<{
			target: { type: string; id?: string };
			mode?: RecordingMode;
			captureSystemAudio?: boolean;
		}>({
			name: "start_recording",
			description:
				"Start a recording of a display, window, or camera-only. Get display " +
				"ids from list_screens and window ids from list_windows. `mode` is " +
				"'studio' (default) or 'instant'. Select camera/mic first with " +
				"select_camera / select_mic if you want them included.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					target: CAPTURE_TARGET_SCHEMA,
					mode: {
						type: "string",
						enum: ["studio", "instant"],
						description: "Recording mode (default 'studio').",
					},
					captureSystemAudio: {
						type: "boolean",
						description: "Also capture system audio.",
					},
				},
				required: ["target"],
			},
			execute: async ({ target, mode, captureSystemAudio }) => {
				const result = await commands.startRecording({
					capture_target: toCaptureTarget(target),
					mode: mode === "instant" ? "instant" : "studio",
					capture_system_audio: Boolean(captureSystemAudio),
				});
				return { started: true, result };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool({
			name: "restart_recording",
			description: "Discard the current recording and start it over.",
			annotations: CONFIRM,
			execute: async () => {
				const result = await commands.restartRecording();
				return { restarted: true, result };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool({
			name: "delete_recording",
			description:
				"Delete the in-progress recording and discard its captured data. This " +
				"cannot be undone.",
			annotations: CONFIRM,
			execute: async () => {
				await commands.deleteRecording();
				return { deleted: true };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ target: { type: string; id?: string } }>({
			name: "take_screenshot",
			description:
				"Capture a still screenshot of a display or window. Returns the saved " +
				"file path.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: { target: CAPTURE_TARGET_SCHEMA },
				required: ["target"],
			},
			execute: async ({ target }) => {
				const path = await commands.takeScreenshot(toCaptureTarget(target));
				return { path };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ deviceId?: string | null }>({
			name: "select_camera",
			description:
				"Select the camera to include in recordings by its device id (from " +
				"list_cameras), or pass null / omit to turn the camera off.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					deviceId: {
						type: ["string", "null"],
						description: "Camera device id, or null to disable the camera.",
					},
				},
			},
			execute: async ({ deviceId }) => {
				const id = deviceId ? String(deviceId).trim() : "";
				await commands.setCameraInput(id ? { DeviceID: id } : null, null);
				return { camera: id || null };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ label?: string | null }>({
			name: "select_mic",
			description:
				"Select the microphone to record by its label (from list_audio_devices), " +
				"or pass null / omit to turn the microphone off.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					label: {
						type: ["string", "null"],
						description: "Microphone label, or null to disable the mic.",
					},
				},
			},
			execute: async ({ label }) => {
				const value = label ? String(label).trim() : "";
				await commands.setMicInput(value || null);
				return { mic: value || null };
			},
		}),
	);

	return unregister;
}

/**
 * OS permission tools: check and request the screen-recording, camera,
 * microphone, and accessibility grants the recorder needs.
 */
export function registerDesktopPermissionTools(): Array<() => void> {
	const unregister: Array<() => void> = [];

	unregister.push(
		registerWebMcpTool({
			name: "check_permissions",
			description:
				"Check the OS permissions Cap needs (screen recording, camera, " +
				"microphone, accessibility) and whether each is granted.",
			annotations: READ_ONLY,
			execute: () => commands.doPermissionsCheck(false),
		}),
	);

	unregister.push(
		registerWebMcpTool<{ permission: OSPermission }>({
			name: "request_permission",
			description:
				"Prompt the OS to grant one permission: 'screenRecording', 'camera', " +
				"'microphone', or 'accessibility'.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					permission: {
						type: "string",
						enum: [...OS_PERMISSIONS],
						description: "The permission to request.",
					},
				},
				required: ["permission"],
			},
			execute: async ({ permission }) => {
				if (!OS_PERMISSIONS.includes(permission))
					throw new Error(
						`permission must be one of: ${OS_PERMISSIONS.join(", ")}.`,
					);
				await commands.requestPermission(permission);
				return { requested: permission };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ permission: OSPermission }>({
			name: "open_permission_settings",
			description:
				"Open the OS settings pane for one permission so the user can grant it " +
				"manually.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					permission: {
						type: "string",
						enum: [...OS_PERMISSIONS],
						description: "The permission whose settings to open.",
					},
				},
				required: ["permission"],
			},
			execute: async ({ permission }) => {
				if (!OS_PERMISSIONS.includes(permission))
					throw new Error(
						`permission must be one of: ${OS_PERMISSIONS.join(", ")}.`,
					);
				await commands.openPermissionSettings(permission);
				return { opened: permission };
			},
		}),
	);

	return unregister;
}
