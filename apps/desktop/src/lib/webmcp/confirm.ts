import { confirm } from "@tauri-apps/plugin-dialog";

/**
 * Shows a native confirmation dialog before a destructive agent action and
 * throws if the user declines, so the tool does not run. Call this at the start
 * of every `confirm`-annotated (consequentialHint) desktop tool, so the human
 * always sees and approves far-reaching actions an agent requests.
 */
export async function requireConfirm(action: string): Promise<void> {
	const ok = await confirm(`${action}\n\nRequested by an AI agent.`, {
		title: "Confirm agent action",
		kind: "warning",
	});
	if (!ok) throw new Error("The user declined this action.");
}
