"use client";

import { useEffect } from "react";
import { useRpcClient } from "@/lib/EffectRuntime";
import { registerAnalyticsTools } from "./analyticsTools";
import { registerCapAiTools } from "./capAiTools";
import { registerCommentTools } from "./commentTools";
import { type LibraryRpc, registerLibraryTools } from "./libraryTools";
import { registerLoomTools } from "./loomTools";
import { registerSettingsTools } from "./settingsTools";
import { registerSharingTools } from "./sharingTools";
import { registerTeamsTools } from "./teamsTools";
import { registerTranscriptTools } from "./transcriptTools";
import {
	MUTATING,
	READ_ONLY,
	registerWebMcpTool,
	withWebMcpGroup,
} from "./webmcp.service";

/**
 * Registers Cap's WebMCP tools on the signed-in dashboard tab. Mounted once by
 * <WebMcpProvider/> inside the (org) layout.
 *
 * Phase 0: two trivial tools that prove the document.modelContext pipe works
 * end-to-end with chrome-devtools-mcp. Phase 1 adds the grouped dashboard tools
 * (library, sharing, transcripts, teams, …) in sibling files.
 */
export function useCapWebMcp() {
	const rpc = useRpcClient() as unknown as LibraryRpc;

	useEffect(() => {
		const unregister: Array<() => void> = [];

		withWebMcpGroup("Navigation & orientation", "global", () => {
			unregister.push(
				registerWebMcpTool({
					name: "get_current_view",
					description:
						"Where the user is right now in the Cap dashboard: the URL path, the " +
						"page title, and the full URL. Call this first to orient yourself.",
					annotations: READ_ONLY,
					execute: () => ({
						path: window.location.pathname,
						url: window.location.href,
						title: document.title,
					}),
				}),
			);

			unregister.push(
				registerWebMcpTool<{ path: string }>({
					name: "navigate_to",
					description:
						"Navigate the tab the user is looking at to a path within the Cap " +
						"dashboard (for example '/dashboard/caps' or '/dashboard/settings'). " +
						"Pass an app-relative path beginning with '/'.",
					annotations: MUTATING,
					inputSchema: {
						type: "object",
						properties: {
							path: {
								type: "string",
								description: "App-relative path beginning with '/'.",
							},
						},
						required: ["path"],
					},
					execute: ({ path }) => {
						const target = String(path ?? "").trim();
						if (!target.startsWith("/")) {
							throw new Error(
								`path must be app-relative and begin with '/'. Got "${target}".`,
							);
						}
						window.location.assign(target);
						return { navigatedTo: target };
					},
				}),
			);
		});

		withWebMcpGroup("Library", "global", () => {
			unregister.push(...registerLibraryTools({ rpc }));
		});

		withWebMcpGroup("Sharing", "global", () => {
			unregister.push(...registerSharingTools());
		});

		withWebMcpGroup("Transcripts & captions", "global", () => {
			unregister.push(...registerTranscriptTools());
		});

		withWebMcpGroup("Comments", "global", () => {
			unregister.push(...registerCommentTools());
		});

		withWebMcpGroup("Analytics", "global", () => {
			unregister.push(...registerAnalyticsTools());
		});

		withWebMcpGroup("Teams & members", "global", () => {
			unregister.push(...registerTeamsTools());
		});

		withWebMcpGroup("Cap AI", "global", () => {
			unregister.push(...registerCapAiTools());
		});

		withWebMcpGroup("Loom import", "global", () => {
			unregister.push(...registerLoomTools());
		});

		withWebMcpGroup("Settings & account", "global", () => {
			unregister.push(...registerSettingsTools());
		});

		return () => {
			for (const fn of unregister.splice(0)) fn();
		};
	}, [rpc]);
}
