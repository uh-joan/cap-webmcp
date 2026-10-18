import {
	registerDesktopPermissionTools,
	registerDesktopTools,
} from "./desktopTools";
import { installModelContextShim } from "./modelContextShim";
import { withWebMcpGroup } from "./webmcp.service";

let started = false;

/**
 * Installs the WKWebView `document.modelContext` shim and registers the desktop
 * recorder tools on it. Safe to call once per webview; the shim connects to the
 * local WebMCP bridge when it is running and retries quietly otherwise.
 */
export function initCapWebMcp() {
	if (started) return;
	started = true;
	installModelContextShim();
	withWebMcpGroup("Desktop recorder", "global", () => {
		registerDesktopTools();
	});
	withWebMcpGroup("Permissions", "global", () => {
		registerDesktopPermissionTools();
	});
}
