import type { Organisation } from "@cap/web-domain";
import {
	disconnectOrganizationGoogleDrive,
	getOrganizationStorageSettings,
	listOrganizationGoogleDriveFolders,
	removeOrganizationS3Config,
	setOrganizationStorageProvider,
} from "@/actions/organization/storage";
import {
	CONFIRM,
	MUTATING,
	READ_ONLY,
	registerWebMcpTool,
} from "./webmcp.service";

const asOrgId = (id: unknown): Organisation.OrganisationId => {
	const value = String(id ?? "").trim();
	if (!value) throw new Error("orgId must not be empty.");
	return value as Organisation.OrganisationId;
};

/**
 * Storage config tools: inspect and manage an organization's storage provider.
 *
 * Deliberately NOT exposed as tools: saving/testing custom S3 config (would
 * require the agent to enter S3 access/secret keys) and connecting Google Drive
 * (an OAuth grant). Those must be done by the user directly. This group covers
 * the safe surface: reads, provider selection, and removing/disconnecting.
 */
export function registerStorageTools(): Array<() => void> {
	const unregister: Array<() => void> = [];

	unregister.push(
		registerWebMcpTool<{ orgId: string }>({
			name: "get_storage_settings",
			description:
				"Get an organization's storage settings: the active provider and " +
				"whether a custom S3 bucket or Google Drive is configured.",
			annotations: READ_ONLY,
			inputSchema: {
				type: "object",
				properties: {
					orgId: {
						type: "string",
						description: "Organization id from list_organizations.",
					},
				},
				required: ["orgId"],
			},
			execute: ({ orgId }) => getOrganizationStorageSettings(asOrgId(orgId)),
		}),
	);

	unregister.push(
		registerWebMcpTool<{ orgId: string; provider: "s3" | "googleDrive" }>({
			name: "set_storage_provider",
			description:
				"Choose which configured provider an organization stores recordings in: " +
				"'s3' or 'googleDrive'. The provider must already be configured.",
			annotations: MUTATING,
			inputSchema: {
				type: "object",
				properties: {
					orgId: {
						type: "string",
						description: "Organization id from list_organizations.",
					},
					provider: {
						type: "string",
						enum: ["s3", "googleDrive"],
						description: "The storage provider to activate.",
					},
				},
				required: ["orgId", "provider"],
			},
			execute: async ({ orgId, provider }) => {
				if (provider !== "s3" && provider !== "googleDrive")
					throw new Error("provider must be 's3' or 'googleDrive'.");
				await setOrganizationStorageProvider({
					organizationId: asOrgId(orgId),
					provider,
				});
				return { orgId, provider };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ orgId: string }>({
			name: "remove_s3_config",
			description:
				"Remove an organization's custom S3 configuration, reverting storage to " +
				"the default. Existing recordings are not moved.",
			annotations: CONFIRM,
			inputSchema: {
				type: "object",
				properties: {
					orgId: {
						type: "string",
						description: "Organization id from list_organizations.",
					},
				},
				required: ["orgId"],
			},
			execute: async ({ orgId }) => {
				await removeOrganizationS3Config(asOrgId(orgId));
				return { orgId, removedS3Config: true };
			},
		}),
	);

	unregister.push(
		registerWebMcpTool<{ orgId: string; parentId?: string }>({
			name: "list_google_drive_folders",
			description:
				"List folders in the organization's connected Google Drive, under " +
				"`parentId` (defaults to the Drive root).",
			annotations: READ_ONLY,
			inputSchema: {
				type: "object",
				properties: {
					orgId: {
						type: "string",
						description: "Organization id from list_organizations.",
					},
					parentId: {
						type: "string",
						description: "Parent folder id (default 'root').",
					},
				},
				required: ["orgId"],
			},
			execute: ({ orgId, parentId }) =>
				listOrganizationGoogleDriveFolders({
					organizationId: asOrgId(orgId),
					parentId: parentId ? String(parentId).trim() : undefined,
				}),
		}),
	);

	unregister.push(
		registerWebMcpTool<{ orgId: string }>({
			name: "disconnect_google_drive",
			description: "Disconnect the organization's Google Drive integration.",
			annotations: CONFIRM,
			inputSchema: {
				type: "object",
				properties: {
					orgId: {
						type: "string",
						description: "Organization id from list_organizations.",
					},
				},
				required: ["orgId"],
			},
			execute: async ({ orgId }) => {
				await disconnectOrganizationGoogleDrive(asOrgId(orgId));
				return { orgId, googleDriveDisconnected: true };
			},
		}),
	);

	return unregister;
}
