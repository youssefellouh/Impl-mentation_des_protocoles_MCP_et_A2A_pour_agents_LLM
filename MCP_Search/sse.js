import "dotenv/config";
import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer() {
  const server = new McpServer({
    name: "serp-search-mcp-sse",
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

const app = express();
app.use(express.json());

const clients = new Set();

app.get("/sse", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const clientId = `${Date.now()}-${Math.random()}`;
  clients.add({ id: clientId, res });

  res.write(`event: connected\ndata: ${JSON.stringify({ type: "connected", clientId })}\n\n`);

  req.on("close", () => {
    for (const client of clients) {
      if (client.id === clientId) {
        clients.delete(client);
        break;
      }
    }
  });
});

app.post("/mcp/messages", async (req, res) => {
  const payload = req.body ?? {};

  if (payload.method === "tools/call") {
    const server = createServer();
    const toolName = payload.params?.name;
    const args = payload.params?.arguments ?? {};

    try {
      const result = await server.callTool?.(toolName, args);

      for (const client of clients) {
        client.res.write(
          `event: tool_result\ndata: ${JSON.stringify({
            type: "tool_result",
            tool: toolName,
            result,
          })}\n\n`,
        );
      }

      res.json({ ok: true, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      for (const client of clients) {
        client.res.write(
          `event: tool_error\ndata: ${JSON.stringify({
            type: "tool_error",
            tool: toolName,
            error: message,
          })}\n\n`,
        );
      }

      res.status(500).json({ ok: false, error: message });
    }
    return;
  }

  for (const client of clients) {
    client.res.write(
      `event: message\ndata: ${JSON.stringify({ type: "message", payload })}\n\n`,
    );
  }

  res.json({ ok: true, received: payload });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, transport: "sse" });
});

const PORT = 3003;
app.listen(PORT, () => {
  console.log(`[MCP SSE demo] listening on http://localhost:${PORT}/sse`);
});
