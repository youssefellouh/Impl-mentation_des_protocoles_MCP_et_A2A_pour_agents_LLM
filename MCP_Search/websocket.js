import "dotenv/config";
import { WebSocketServer } from "ws";
import http from "node:http";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer() {
  const server = new McpServer({
    name: "serp-search-mcp-ws",
    version: "1.0.0",
  });

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

  return server;
}

const serverHttp = http.createServer();
const wss = new WebSocketServer({ server: serverHttp });

wss.on("connection", async (ws) => {
  console.log("[MCP WebSocket] client connected");

  ws.on("message", async (message) => {
    try {
      const payload = JSON.parse(message.toString());

      if (payload.method === "tools/call") {
        const server = createServer();
        const toolName = payload.params?.name;
        const args = payload.params?.arguments ?? {};
        try {
          const result = await server.callTool?.(toolName, args);
          ws.send(
            JSON.stringify({
              jsonrpc: "2.0",
              id: payload.id ?? null,
              result,
            }),
          );
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          ws.send(
            JSON.stringify({
              jsonrpc: "2.0",
              id: payload.id ?? null,
              error: { code: -32603, message: msg },
            }),
          );
        }
        return;
      }

      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: payload.id ?? null,
          result: { received: payload },
        }),
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32700, message: `Invalid JSON: ${msg}` },
        }),
      );
    }
  });
});

const PORT = 3004;
serverHttp.listen(PORT, () => {
  console.log(`[MCP WebSocket demo] listening on ws://localhost:${PORT}`);
});
