import "dotenv/config";
import express from "express";
import cors from "cors";
import { ChatOllama } from "@langchain/ollama";

const PORT = 3012;

const AGENT_CARD = {
  name: "Itinerary Agent",
  description: "Synthesizes search results and budget breakdowns into a detailed day-by-day travel itinerary.",
  version: "1.0.0",
  url: `http://localhost:${PORT}`,
  capabilities: { streaming: false, pushNotifications: false },
  skills: [
    {
      id: "travel-itinerary",
      name: "Itinerary Synthesis",
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

  console.log(`[itinerary-agent] Task ${taskId}: ${text.slice(0, 80)}...`);

  try {
    const model = new ChatOllama({ model: "qwen3.5:2b", temperature: 0.3, think: false });
    const response = await model.invoke(text);
    const result = response.content || "";

    console.log(`[itinerary-agent] Task ${taskId} completed (${result.length} chars)`);

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
    console.error(`[itinerary-agent] Error:`, err);
    res.status(500).json({
      jsonrpc: "2.0",
      error: { code: -32603, message: err.message },
      id,
    });
  }
});

app.listen(PORT, () => console.log(`[itinerary-agent] Listening on port ${PORT}`));
