import type { Folder, Organisation, Space } from "@cap/web-domain";
import {
	getLoomImportFolders,
	importFromLoom,
	importFromLoomCsv,
	type LoomCsvImportRow,
} from "@/actions/loom";
import { MUTATING, READ_ONLY, registerWebMcpTool } from "./webmcp.service";

const asOrgId = (id: unknown): Organisation.OrganisationId => {
	const value = String(id ?? "").trim();
	if (!value) throw new Error("orgId must not be empty.");
	return value as Organisation.OrganisationId;
};

/**
 * Loom import tools: list destination folders and import Loom videos into Cap,
 * one at a time or in bulk from a CSV. `orgId` comes from list_organizations.
 */
export function registerLoomTools(): Array<() => void> {
	const unregister: Array<() => void> = [];

	unregister.push(
		registerWebMcpTool<{ orgId: string; spaceId?: string }>({
			name: "list_loom_import_folders",
			description:
				"List the folders a Loom import can be placed into for an organization " +
				"(optionally scoped to a space). Returns folder ids for import_from_loom.",
			annotations: READ_ONLY,
			inputSchema: {
				type: "object",
				properties: {
					orgId: {
						type: "string",
						description: "Organization id from list_organizations.",
					},
					spaceId: {
						type: "string",
						description: "Optional space id to scope to.",
					},
				},
				required: ["orgId"],
			},
			execute: ({ orgId, spaceId }) =>
				getLoomImportFolders({
					orgId: asOrgId(orgId),
					spaceId: spaceId
						? (String(spaceId).trim() as Space.SpaceIdOrOrganisationId)
						: undefined,
				}),
		}),
	);

	unregister.push(
		registerWebMcpTool<{
			loomUrl: string;
			orgId: string;
			folderId?: string;
			spaceId?: string;
		}>({
			name: "import_from_loom",
			description:
				"Import a single Loom video into Cap by its Loom URL, into the given " +
				"organization and optionally a folder or space.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					loomUrl: { type: "string", description: "The Loom video URL." },
					orgId: {
						type: "string",
						description: "Organization id from list_organizations.",
					},
					folderId: {
						type: "string",
						description: "Folder id from list_loom_import_folders.",
					},
					spaceId: { type: "string", description: "Optional space id." },
				},
				required: ["loomUrl", "orgId"],
			},
			execute: async ({ loomUrl, orgId, folderId, spaceId }) => {
				const url = String(loomUrl ?? "").trim();
				if (!url) throw new Error("loomUrl must not be empty.");
				const result = await importFromLoom({
					loomUrl: url,
					orgId: asOrgId(orgId),
					folderId: folderId
						? (String(folderId).trim() as Folder.FolderId)
						: undefined,
					spaceId: spaceId
						? (String(spaceId).trim() as Space.SpaceIdOrOrganisationId)
						: undefined,
				});
				if (!result.success)
					throw new Error(result.error || "Failed to import from Loom");
				return result;
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{
			orgId: string;
			rows: Array<{
				rowNumber?: number;
				loomUrl: string;
				userEmail: string;
				spaceName?: string;
			}>;
		}>({
			name: "import_from_loom_csv",
			description:
				"Bulk-import Loom videos into an organization. Each row needs a loomUrl " +
				"and the userEmail to attribute the import to, and may name a space.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					orgId: {
						type: "string",
						description: "Organization id from list_organizations.",
					},
					rows: {
						type: "array",
						description: "The Loom videos to import.",
						items: {
							type: "object",
							properties: {
								loomUrl: { type: "string" },
								userEmail: {
									type: "string",
									description: "Email to attribute this import to.",
								},
								spaceName: {
									type: "string",
									description: "Optional space name to import into.",
								},
							},
							required: ["loomUrl", "userEmail"],
						},
					},
				},
				required: ["orgId", "rows"],
			},
			execute: async ({ orgId, rows }) => {
				const list: LoomCsvImportRow[] = (rows ?? []).map((row, index) => ({
					rowNumber: row.rowNumber ?? index + 1,
					loomUrl: String(row.loomUrl ?? "").trim(),
					userEmail: String(row.userEmail ?? "").trim(),
					spaceName: row.spaceName ? String(row.spaceName).trim() : undefined,
				}));
				if (list.length === 0) throw new Error("rows must not be empty.");
				const result = await importFromLoomCsv({
					rows: list,
					orgId: asOrgId(orgId),
				});
				if (!result.success) throw new Error("Failed to import from Loom CSV");
				return result;
			},
		}),
	);

	return unregister;
}
