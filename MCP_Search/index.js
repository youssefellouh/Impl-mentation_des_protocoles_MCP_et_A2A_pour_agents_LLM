// Standalone MCP server — runs persistently on port 3002 over Streamable HTTP transport.
// Start with: node index.js  (or: npm run dev)

import "dotenv/config";
import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

function createServer() {
  const server = new McpServer({ name: "serp-search-mcp", version: "1.0.0" });

  server.tool(
    "web_search",
    "Search the web using SerpAPI (Google). Use this to find current information on any topic.",
    { query: z.string().describe("The search query") },
    async ({ query }) => {
      console.log(`[MCP server] web_search called with: "${query}"`);

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
      console.log(`[MCP server] image_search called with: "${query}"`);

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

  return server;
}

const app = express();
app.use(express.json());

// Per-request stateless handler: each POST creates a fresh Server + Transport.
app.post("/mcp", async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);

  await transport.handleRequest(req, res, req.body);
  res.on("close", () => {
    server.close().catch(() => undefined);
  });
});

app.get("/mcp", (_req, res) =>
  res.status(405).json({ error: "Method not allowed" }),
);
app.delete("/mcp", (_req, res) =>
  res.status(405).json({ error: "Method not allowed" }),
);

const PORT = 3002;
app.listen(PORT, () => {
  console.log(
    `[MCP server] serp-search-mcp listening on http://localhost:${PORT}/mcp`,
  );
});
