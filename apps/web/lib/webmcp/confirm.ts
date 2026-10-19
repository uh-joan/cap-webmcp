import type { WebMcpConfirmHandler } from "./webmcp.service";

/**
 * Confirmation gate for the web dashboard: shows a native browser dialog before
 * a consequential ("confirm") tool runs, and throws if the user declines so the
 * tool does not execute. Wired via setWebMcpConfirmHandler in useCapWebMcp.
 */
export const webConfirmHandler: WebMcpConfirmHandler = (tool) => {
	const ok =
		typeof window !== "undefined" &&
		window.confirm(`${tool.description}\n\nRequested by an AI agent. Proceed?`);
	if (!ok) throw new Error("The user declined this action.");
};
