import manifest from "../public/connectors/manifest.json";

type LogoAsset = { name: string; file: string; fit: string; source: string };
const ASSETS: Readonly<Record<string, LogoAsset>> = manifest;

const ALIASES: Readonly<Record<string, string>> = {
  googleworkspace: "google",
  microsoft365: "microsoft",
  office365: "microsoft",
  microsoftteams: "teams",
  awsaccount: "aws",
  amazonwebservices: "aws",
  atlassian: "jira",
  mondaydotcom: "monday",
  githubissues: "github",
};

export function connectorLogo(id: string) {
  const flat = id.toLowerCase().replace(/[^a-z0-9]/g, "");
  const key = Object.hasOwn(ALIASES, flat) ? ALIASES[flat]! : flat;
  if (!Object.hasOwn(ASSETS, key)) return null;
  const asset = ASSETS[key]!;
  return { key, name: asset.name, src: `/connectors/${asset.file}`, padded: asset.fit === "pad" };
}

export function connectorInitials(name: string): string {
  const words = name.match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.slice(0, 2).map((word) => Array.from(word)[0]!.toUpperCase()).join("") || "?";
}

// Native tool names come from Ensemble's assistant/tools/google, microsoft, zoom, docusign and jira.
const NATIVE_TOOLS: Readonly<Record<string, string>> = {
  gmail: "gmail",
  calendar: "googlecalendar",
  drive: "googledrive",
  docs: "google",
  sheets: "google",
  slides: "google",
  outlook: "outlook",
  teams: "teams",
  onedrive: "onedrive",
  word: "microsoft",
  excel: "microsoft",
  powerpoint: "microsoft",
  zoom: "zoom",
  docusign: "docusign",
  jira: "jira",
};

export function toolConnectorId(name: string): string | null {
  if (name.startsWith("mcp_")) {
    const serverAndTool = name.slice(4);
    // Custom MCP slugs are <name>_<four-digit hash>, not a trusted brand identity.
    if (/^[a-z0-9_-]{1,12}_[a-f0-9]{4}_/.test(serverAndTool)) return "mcp";
    const server = /^(google_workspace|microsoft_365|aws_account|azure_devops|read_ai|wispr_flow)_/.exec(serverAndTool)?.[1] ?? serverAndTool.split("_")[0]!;
    return connectorLogo(server) ? server : "mcp";
  }
  const prefix = name.split("_")[0]!;
  return Object.hasOwn(NATIVE_TOOLS, prefix) ? NATIVE_TOOLS[prefix]! : null;
}

export const CONNECTOR_TRADEMARK_NOTICE =
  "Product names, logos and brands belong to their respective owners and identify the services you can connect. Ensemble is not affiliated with or endorsed by them.";
