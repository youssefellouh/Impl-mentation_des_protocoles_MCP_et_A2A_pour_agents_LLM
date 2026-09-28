import "dotenv/config";
import express from "express";
import cors from "cors";
import { ChatOllama } from "@langchain/ollama";
import { createAgent } from "langchain";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";

const PORT = 3010;

const AGENT_CARD = {
  name: "Search Agent",
  description: "Searches the web for travel information including attractions, hotels, and flight options using real-time data.",
  version: "1.0.0",
  url: `http://localhost:${PORT}`,
  capabilities: { streaming: false, pushNotifications: false },
  skills: [
    {
      id: "travel-search",
      name: "Travel Research",
      inputModes: ["text"],
      outputModes: ["text"],
    },
  ],
};

const app = express();
app.use(cors());
app.use(express.json());

app.get("/.well-known/agent.json", (_req, res) => {
  res.json(AGENT_CARD);
});

app.post("/", async (req, res) => {
  const { jsonrpc, method, params, id } = req.body;

  if (jsonrpc !== "2.0" || method !== "tasks/send") {
    return res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32600, message: "Invalid Request" },
      id: id ?? null,
    });
  }

  const taskId = params?.id ?? `task-${Date.now()}`;
  const text = params?.message?.parts?.[0]?.text ?? "";

  console.log(`[search-agent] Task ${taskId}: ${text.slice(0, 80)}...`);

  let mcpClient = null;
  try {
    const model = new ChatOllama({ model: "qwen3.5:2b", temperature: 0, think: false });

    mcpClient = new MultiServerMCPClient({
      mcpServers: {
        "serp-search": {
          transport: "http",
          url: "http://localhost:3002/mcp",
        },
      },
    });

    const tools = await mcpClient.getTools();
    console.log(`[search-agent] MCP tools: ${tools.map((t) => t.name).join(", ")}`);

    const agent = createAgent({
      model,
      tools,
      systemPrompt: `You are a travel research agent. Use the web_search tool to find travel information. Always call the tool to get current information.`,
    });

    const response = await agent.invoke({
      messages: [{ role: "user", content: text }],
    });

    const lastMessage = response.messages[response.messages.length - 1];
    const result = lastMessage?.content || "";

    console.log(`[search-agent] Task ${taskId} completed (${result.length} chars)`);

    res.json({
      jsonrpc: "2.0",
      result: {
        id: taskId,
        status: { state: "completed" },
        artifacts: [
          {
            name: "result",
            parts: [{ type: "text", text: result }],
          },
        ],
      },
      id,
    });
  } catch (err) {
    console.error(`[search-agent] Error:`, err);
    res.status(500).json({
      jsonrpc: "2.0",
      error: { code: -32603, message: err.message },
      id,
    });
  } finally {
    if (mcpClient) {
      await mcpClient.close().catch(() => undefined);
    }
  }
});

app.listen(PORT, () => console.log(`[search-agent] Listening on port ${PORT}`));
