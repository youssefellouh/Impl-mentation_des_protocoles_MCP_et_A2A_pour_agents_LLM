import "dotenv/config";
import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";

const PORT = 3013;

const remoteSearchAgent = {
  name: "Search Agent",
  description:
    "Searches the web for travel information including attractions, hotels, and flight options using real-time data.",
  agentCard: "http://localhost:3010/.well-known/agent.json",
  endpoint: "http://localhost:3010",
};

const AGENT_URLS = {
  search: remoteSearchAgent.endpoint,
  budget: "http://localhost:3011",
  itinerary: "http://localhost:3012",
};

const AGENT_CARD = {
  name: "TripPlannerAgent",
  description:
    "Creates a complete travel itinerary by combining web research, budget planning, and daily itinerary generation.",
  version: "1.0.0",
  url: `http://localhost:${PORT}/api/a2a/stream`,
  capabilities: {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: false,
  },
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["text/plain"],
  skills: [
    {
      id: "plan-trip",
      name: "Trip Planning",
      description:
        "Researches a destination, estimates the trip budget, and creates a detailed day-by-day itinerary.",
      examples: [
        "Plan a 7-day trip to Tokyo for two people with a budget of $3000",
        "Create an itinerary for a family vacation in Rome",
      ],
      inputModes: ["text/plain"],
      outputModes: ["text/plain"],
      tags: ["travel", "research", "budget", "itinerary"],
    },
  ],
};

async function fetchAgentCard(agentCardUrl) {
  const res = await fetch(agentCardUrl);
  if (!res.ok)
    throw new Error(
      `Failed to fetch agent card from ${agentCardUrl}: ${res.status}`,
    );
  return res.json();
}

async function sendTask(agentUrl, taskId, text) {
  const rpcId = `rpc-${randomUUID()}`;
  const res = await fetch(agentUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tasks/send",
      params: {
        id: taskId,
        message: {
          role: "user",
          parts: [{ type: "text", text }],
        },
      },
      id: rpcId,
    }),
  });

  if (!res.ok) throw new Error(`Agent at ${agentUrl} returned ${res.status}`);

  const body = await res.json();
  if (body.error) throw new Error(body.error.message);

  return body.result?.artifacts?.[0]?.parts?.[0]?.text ?? "";
}

// ── Prompts ────────────────────────────────────────────────────────────────

function buildSearchPrompt({ destination }) {
  return `Find top tourist attractions, recommended hotels, and flight options for ${destination}. Include estimated prices.`;
}

function buildBudgetPrompt({ destination, dayCount, budgetAmt, peopleCount }) {
  return `You are a travel budget planning expert. Create a detailed budget breakdown for the following trip:

Destination: ${destination}
Duration: ${dayCount} days
Total Budget: $${budgetAmt}
Number of travelers: ${peopleCount}

Provide a clear breakdown of estimated costs per person per day for:
- Accommodation
- Food & dining
- Local transportation
- Activities & entrance fees
- Miscellaneous expenses

Then summarize the total estimated cost vs the budget, and note if the budget is sufficient or not.
Be specific with dollar amounts.`;
}

function buildItineraryPrompt({
  destination,
  dayCount,
  budgetAmt,
  peopleCount,
  searchResults,
  budgetBreakdown,
}) {
  return `You are an expert travel itinerary planner. Create a detailed day-by-day itinerary based on the following information:

**Trip Details:**
- Destination: ${destination}
- Duration: ${dayCount} days
- Total Budget: $${budgetAmt}
- Number of travelers: ${peopleCount}

**Research Findings:**
${searchResults}

**Budget Breakdown:**
${budgetBreakdown}

Return ONLY valid JSON (no markdown, no code fences) with this exact structure:
{
  "title": "Trip to [Destination]",
  "overview": "1-2 sentence trip summary",
  "accommodation": {
    "name": "Recommended hotel/hostel name",
    "pricePerNight": "$XX",
    "notes": "Why this is recommended"
  },
  "days": [
    {
      "day": 1,
      "title": "Short theme for the day",
      "morning": { "activity": "What to do", "location": "Where", "cost": "$XX" },
      "afternoon": { "activity": "What to do", "location": "Where", "cost": "$XX" },
      "evening": { "activity": "What to do", "location": "Where", "cost": "$XX" }
    }
  ],
  "budget": {
    "accommodation": 0,
    "food": 0,
    "transport": 0,
    "activities": 0,
    "misc": 0,
    "total": 0,
    "perPerson": 0,
    "verdict": "Under budget / Over budget by $XX"
  },
  "transportTips": ["tip1", "tip2", "tip3"],
  "diningTips": ["tip1", "tip2", "tip3"],
  "travelTips": ["tip1", "tip2", "tip3"]
}

Budget values must be numbers (no $ sign). Include exactly ${dayCount} days. Be specific with real place names and realistic costs.`;
}

// ── Orchestration phases ───────────────────────────────────────────────────

async function discoverAgents(sendEvent) {
  sendEvent({
    type: "phase",
    phase: "discovery",
    message: "Discovering agents via agent cards...",
  });

  const [searchCard, budgetCard, itineraryCard] = await Promise.all([
    fetchAgentCard(remoteSearchAgent.agentCard),
    fetchAgentCard(`${AGENT_URLS.budget}/.well-known/agent.json`),
    fetchAgentCard(`${AGENT_URLS.itinerary}/.well-known/agent.json`),
  ]);

  sendEvent({
    type: "agent_discovered",
    agentName: "search",
    card: searchCard,
  });
  sendEvent({
    type: "agent_discovered",
    agentName: "budget",
    card: budgetCard,
  });
  sendEvent({
    type: "agent_discovered",
    agentName: "itinerary",
    card: itineraryCard,
  });
}

async function runParallelTasks(tripParams, sendEvent) {
  sendEvent({
    type: "phase",
    phase: "parallel",
    message: "Dispatching parallel tasks to search and budget agents...",
  });

  const searchTaskId = `task-${randomUUID()}`;
  const budgetTaskId = `task-${randomUUID()}`;

  sendEvent({
    type: "task_sent",
    agentName: "search",
    taskId: searchTaskId,
    status: "working",
  });
  sendEvent({
    type: "task_sent",
    agentName: "budget",
    taskId: budgetTaskId,
    status: "working",
  });

  const [searchResults, budgetBreakdown] = await Promise.all([
    sendTask(
      AGENT_URLS.search,
      searchTaskId,
      buildSearchPrompt(tripParams),
    ).then((result) => {
      sendEvent({
        type: "task_done",
        agentName: "search",
        taskId: searchTaskId,
        status: "completed",
      });
      return result;
    }),
    sendTask(
      AGENT_URLS.budget,
      budgetTaskId,
      buildBudgetPrompt(tripParams),
    ).then((result) => {
      sendEvent({
        type: "task_done",
        agentName: "budget",
        taskId: budgetTaskId,
        status: "completed",
      });
      return result;
    }),
  ]);

  return { searchResults, budgetBreakdown };
}

async function runSynthesis(tripParams, sendEvent) {
  sendEvent({
    type: "phase",
    phase: "synthesis",
    message: "Synthesizing itinerary from search and budget data...",
  });

  const itineraryTaskId = `task-${randomUUID()}`;

  sendEvent({
    type: "task_sent",
    agentName: "itinerary",
    taskId: itineraryTaskId,
    status: "working",
  });

  const raw = await sendTask(
    AGENT_URLS.itinerary,
    itineraryTaskId,
    buildItineraryPrompt(tripParams),
  );

  sendEvent({
    type: "task_done",
    agentName: "itinerary",
    taskId: itineraryTaskId,
    status: "completed",
  });

  // Parse JSON from the itinerary agent response
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  let itinerary;
  try {
    itinerary = JSON.parse(cleaned);
  } catch {
    console.error("[orchestrator] Failed to parse itinerary JSON, raw:", cleaned.slice(0, 200));
    itinerary = cleaned;
  }

  return itinerary;
}

// ── SSE endpoint ───────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

app.get("/.well-known/agent.json", (_req, res) => {
  res.json(AGENT_CARD);
});

app.get("/api/a2a/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let closed = false;
  req.on("close", () => {
    closed = true;
  });
  const sendEvent = (data) => {
    if (!closed) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const { destination, days, budget, people } = req.query;

  if (!destination) {
    sendEvent({ type: "error", message: "destination is required" });
    res.end();
    return;
  }

  const tripParams = {
    destination,
    dayCount: parseInt(days, 10) || 7,
    budgetAmt: parseInt(budget, 10) || 2000,
    peopleCount: parseInt(people, 10) || 2,
  };

  try {
    await discoverAgents(sendEvent);

    const { searchResults, budgetBreakdown } = await runParallelTasks(
      tripParams,
      sendEvent,
    );

    const itinerary = await runSynthesis(
      { ...tripParams, searchResults, budgetBreakdown },
      sendEvent,
    );

    sendEvent({ type: "result", itinerary });
  } catch (err) {
    console.error("[orchestrator] Error:", err);
    sendEvent({ type: "error", message: err.message });
  } finally {
    res.end();
  }
});

app.listen(PORT, () => console.log(`[orchestrator] Listening on port ${PORT}`));
