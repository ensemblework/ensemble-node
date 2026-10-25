import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { ConnectorLogo } from "../components/connector-logo";
import { ToolIcon } from "../components/tool-icon";
import manifest from "../public/connectors/manifest.json";
import { connectorInitials, connectorLogo, toolConnectorId } from "./connector-logos";

// Snapshot of Ensemble's supported catalog IDs, not a second list of available integrations.
const CATALOG_IDS = `
  google_workspace microsoft_365 notion linear github slack atlassian trello asana todoist clickup monday airtable
  granola zoom fireflies fathom tldv krisp jamie otter read_ai avoma gong grain fellow supernormal meetgeek bluedot tactiq wispr_flow loom
  docusign canva miro webflow sentry stripe supabase huggingface zapier figma dropbox box hubspot intercom vercel cloudflare grafana aws aws_account azure_devops
  calendly caldotcom evernote readwise guru gamma pitch pipedrive attio close customerio whatsapp posthog mixpanel amplitude quickbooks paypal greenhouse ashby
  gitlab shortcut basecamp productboard netlify railway heroku neon planetscale prisma postman context7 jam resend datadog incidentio hex egnyte clay apollo
  square ramp brex mercury paddle deel klaviyo typeform wix exa perplexity tavily firecrawl render smartsheet wrike salesforce zendesk front discord xero zotero
`.trim().split(/\s+/);

test("every branded catalog connector and its MCP tools resolve to a local vendor logo", () => {
  assert.equal(new Set(CATALOG_IDS).size, 113);
  for (const id of CATALOG_IDS) {
    const logo = connectorLogo(id);
    assert.ok(logo, `Missing catalog logo: ${id}`);
    assert.equal(connectorLogo(toolConnectorId(`mcp_${id}_search`)!)?.src, logo.src, id);
  }
  assert.equal(connectorLogo("csv"), null);
  assert.equal(connectorLogo("google_workspace")?.src, "/connectors/google.svg");
  assert.equal(connectorLogo("microsoft_365")?.key, "microsoft");
  assert.equal(connectorLogo("atlassian")?.key, "jira");
  assert.equal(connectorLogo("aws_account")?.key, "aws");
  assert.equal(connectorLogo("read_ai")?.key, "readai");
  assert.equal(connectorLogo("wispr_flow")?.src, "/connectors/wisprflow.webp");
  assert.equal(connectorLogo("Google Workspace")?.src, connectorLogo("google")?.src);
  assert.equal(connectorLogo("Microsoft 365")?.src, connectorLogo("microsoft")?.src);
  assert.equal(connectorLogo("Azure DevOps")?.src, connectorLogo("azure_devops")?.src);
});

test("all mapped assets exist, are small local images and retain provenance, not placeholders", () => {
  for (const [key, asset] of Object.entries(manifest)) {
    assert.match(asset.file, /^[a-z0-9]+\.(svg|webp)$/);
    assert.ok(["pad", "fill"].includes(asset.fit), key);
    assert.ok(asset.name && asset.source, key);
    assert.doesNotMatch(asset.source, /placeholder/i, key);
    const path = new URL(`../public/connectors/${asset.file}`, import.meta.url);
    const bytes = readFileSync(path);
    assert.ok(bytes.length > 50 && statSync(path).size < 50_000, key);
    if (asset.file.endsWith(".svg")) {
      assert.match(bytes.toString(), /<svg[\s>]/);
      assert.match(bytes.toString(), /viewBox=/);
      assert.doesNotMatch(bytes.toString(), /<script|<foreignObject|(?:href|src)=["']https?:/i, key);
    } else {
      assert.equal(bytes.subarray(0, 4).toString(), "RIFF", key);
      assert.equal(bytes.subarray(8, 12).toString(), "WEBP", key);
    }
  }
});

test("native tools share the correct service logos, and non-connector tools stay generic", () => {
  for (const [name, id] of [
    ["gmail_read", "gmail"], ["calendar_create_event", "googlecalendar"], ["drive_read_file", "googledrive"],
    ["docs_create", "google"], ["sheets_create", "google"], ["slides_create", "google"],
    ["outlook_calendar_list_events", "outlook"], ["teams_read_chat", "teams"], ["onedrive_read_file", "onedrive"],
    ["word_create", "microsoft"], ["excel_read_range", "microsoft"], ["powerpoint_create", "microsoft"],
    ["zoom_get_transcript", "zoom"], ["docusign_get_envelope", "docusign"], ["jira_get_issue", "jira"],
  ]) {
    assert.equal(toolConnectorId(name!), id);
  }
  for (const name of ["hub_create_task", "hub_assign_to_agent", "apps_search", "code_search", "unknown_tool", "toString"]) {
    assert.equal(toolConnectorId(name), null, name);
  }
  for (const name of ["mcp_github_a1b2_search", "mcp_wispr_flow_dead_search", "mcp_my_server_f00d_read", "mcp_unknown_search"]) {
    assert.equal(toolConnectorId(name), "mcp", name);
  }
  for (const name of ["mcp_github_a1b2_search", "mcp_unknown_search"]) {
    const html = renderToStaticMarkup(createElement(ToolIcon, { name }));
    assert.match(html, /aria-label="Custom connector"/);
    assert.doesNotMatch(html, /<img/);
  }
});

test("logos have accessible names, fixed geometry, contained marks and a neutral theme-safe tile", () => {
  for (const size of [16, 24, 36]) {
    const html = renderToStaticMarkup(createElement(ConnectorLogo, { id: "github", size }));
    assert.match(html, /role="img" aria-label="GitHub"/);
    assert.match(html, new RegExp(`width:${size}px;height:${size}px`));
    assert.match(html, /shrink-0/);
    assert.match(html, /bg-white/);
    assert.match(html, /object-fit:contain/);
    assert.match(html, /alt=""/);
  }
  const decorative = renderToStaticMarkup(createElement(ConnectorLogo, { id: "google_workspace", name: "Google Workspace", decorative: true }));
  assert.match(decorative, /<span aria-hidden="true"/);
  assert.doesNotMatch(decorative, /role="img"|aria-label=/);
  const tool = renderToStaticMarkup(createElement(ToolIcon, { name: "mcp_wispr_flow_search" }));
  assert.match(tool, /aria-label="Wispr Flow"/);
  assert.match(tool, /src="\/connectors\/wisprflow.webp"/);
});

test("unknown and custom identities have usable accessible fallbacks, never a guessed vendor mark", () => {
  assert.equal(connectorLogo("unknown"), null);
  assert.equal(connectorLogo("custom-github"), null);
  assert.equal(connectorLogo("__proto__"), null);
  assert.equal(connectorInitials("Acme Tools"), "AT");
  assert.equal(connectorInitials("研究 ノート"), "研ノ");
  assert.equal(connectorInitials(""), "?");
  for (const [id, name] of [["unlisted", "Acme Tools"], ["custom-github", "GitHub"], ["", ""]]) {
    const html = renderToStaticMarkup(createElement(ConnectorLogo, { id: id!, name }));
    assert.match(html, /role="img" aria-label="[^"]+"/);
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /width:36px;height:36px/);
  }
  for (const id of ["csv", "mcp", "custom"]) {
    const html = renderToStaticMarkup(createElement(ConnectorLogo, { id }));
    assert.match(html, /role="img" aria-label=/);
    assert.match(html, /<svg/);
    assert.doesNotMatch(html, /<img/);
  }
  const custom = renderToStaticMarkup(createElement(ConnectorLogo, { id: "custom", name: "GitHub" }));
  assert.match(custom, /role="img" aria-label="GitHub"/);
  assert.match(custom, /<svg/);
  assert.doesNotMatch(custom, /<img/);
});
