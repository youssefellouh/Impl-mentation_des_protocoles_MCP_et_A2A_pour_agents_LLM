// Standalone MCP server — stdio transport.
// The client spawns this as a child process and communicates via stdin/stdout.
// Note: do NOT use console.log here — stdout is reserved for MCP messages.

import "dotenv/config";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({ name: "serp-search-mcp", version: "1.0.0" });

server.tool(
  "web_search",
  "Search the web using SerpAPI (Google). Use this to find current information on any topic.",
  { query: z.string().describe("The search query") },
  async ({ query }) => {
    const apiKey = process.env.SERPAPI_API_KEY;
    if (!apiKey) {
      throw new Error("SERPAPI_API_KEY is not set in MCP server environment");
    }

    const params = new URLSearchParams({
      q: query,
      api_key: apiKey,
      engine: "google",
      num: "5",
    });
    const res = await fetch(`https://serpapi.com/search.json?${params}`);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`SerpAPI error ${res.status}: ${text}`);
    }

    const data = await res.json();
    const results = (data.organic_results ?? [])
      .map((r) => `**${r.title}**\n${r.link}\n${r.snippet ?? ""}`)
      .join("\n\n---\n\n");

    return {
      content: [{ type: "text", text: results || "No results found." }],
    };
  },
);

server.tool(
  "image_search",
  "Search for images using SerpAPI (Google Images). Use this to find images on any topic.",
  { query: z.string().describe("The image search query") },
  async ({ query }) => {
    const apiKey = process.env.SERPAPI_API_KEY;
    if (!apiKey) {
      throw new Error("SERPAPI_API_KEY is not set in MCP server environment");
    }

    const params = new URLSearchParams({
      q: query,
      api_key: apiKey,
      engine: "google_images",
      num: "5",
    });
    const res = await fetch(`https://serpapi.com/search.json?${params}`);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`SerpAPI error ${res.status}: ${text}`);
    }

    const data = await res.json();
    const results = (data.images_results ?? [])
      .slice(0, 5)
      .map((r) => `![${r.title ?? "Image"}](${r.original})${r.source ? `\n_Source: ${r.source}_` : ""}`)
      .join("\n\n---\n\n");

    return {
      content: [{ type: "text", text: results || "No image results found." }],
    };
  },
);

// One persistent transport for the lifetime of the process.
const transport = new StdioServerTransport();
await server.connect(transport);
