import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import crypto from "node:crypto";
import { runRetrievalAgent } from "./retrievalAgent.js";
import { runItineraryAgent } from "./itineraryAgent.js";
import { runSafetyAgent } from "./safetyAgent.js";
import { runPackingAgent } from "./packingAgent.js";
import { logAgentSpan } from "./agentRunsLog.js";

// State channel names must differ from node names — LangGraph.js throws
// "X is already being used as a state attribute... cannot also be used as
// a node name" otherwise (verified directly against @langchain/langgraph@1.4.7).
const OrchestratorState = Annotation.Root({
  input: Annotation(),
  runId: Annotation(),
  retrievalResult: Annotation(),
  itineraryResult: Annotation(),
  safetyResult: Annotation(),
  packingResult: Annotation(),
});

// Span logging must never affect agent result attribution or escape a node —
// a failure here is a logging problem, not a trip-planning problem.
async function safeLogSpan(logSpanFn, spanData) {
  try {
    await logSpanFn(spanData);
  } catch {
    // Intentionally swallowed — see comment above.
  }
}

function buildGraph(deps) {
  const logSpanFn = deps.logAgentSpanFn ?? logAgentSpan;

  return new StateGraph(OrchestratorState)
    .addNode("retrieval", async (state) => {
      const start = Date.now();
      try {
        const result = await runRetrievalAgent(state.input, deps);
        await safeLogSpan(logSpanFn, { runId: state.runId, childAgent: "retrieval", status: "ok", latencyMs: Date.now() - start });
        return { retrievalResult: result };
      } catch (error) {
        await safeLogSpan(logSpanFn, { runId: state.runId, childAgent: "retrieval", status: "error", latencyMs: Date.now() - start });
        return { retrievalResult: { error: error.message } };
      }
    })
    .addNode("itinerary", async (state) => {
      const start = Date.now();
      if (state.retrievalResult?.error) {
        await safeLogSpan(logSpanFn, { runId: state.runId, childAgent: "itinerary", status: "skipped", latencyMs: 0 });
        return { itineraryResult: { status: "unavailable", reason: "retrieval failed" } };
      }
      try {
        const result = await runItineraryAgent(state.input, state.retrievalResult, deps);
        await safeLogSpan(logSpanFn, { runId: state.runId, childAgent: "itinerary", status: "ok", latencyMs: Date.now() - start });
        return { itineraryResult: result };
      } catch (error) {
        await safeLogSpan(logSpanFn, { runId: state.runId, childAgent: "itinerary", status: "error", latencyMs: Date.now() - start });
        return { itineraryResult: { status: "unavailable", reason: error.message } };
      }
    })
    .addNode("safety", async (state) => {
      const start = Date.now();
      if (state.retrievalResult?.error) {
        await safeLogSpan(logSpanFn, { runId: state.runId, childAgent: "safety", status: "skipped", latencyMs: 0 });
        return { safetyResult: { status: "unavailable", reason: "retrieval failed" } };
      }
      try {
        const result = await runSafetyAgent(state.input, state.retrievalResult, deps);
        await safeLogSpan(logSpanFn, {
          runId: state.runId,
          childAgent: "safety",
          status: "ok",
          latencyMs: Date.now() - start,
          edgeSummary: result.edgeSummary,
        });
        return { safetyResult: result };
      } catch (error) {
        await safeLogSpan(logSpanFn, { runId: state.runId, childAgent: "safety", status: "error", latencyMs: Date.now() - start });
        return { safetyResult: { status: "unavailable", reason: error.message } };
      }
    })
    .addNode("packing", async (state) => {
      const start = Date.now();
      // packingAgent only depends on retrieval's output (weather) — see
      // packingAgent.js's own doc comment — so it only skips when retrieval
      // itself failed, not when itinerary/safety failed.
      if (state.retrievalResult?.error) {
        await safeLogSpan(logSpanFn, { runId: state.runId, childAgent: "packing", status: "skipped", latencyMs: 0 });
        return { packingResult: { status: "unavailable", reason: "retrieval failed" } };
      }
      try {
        const result = await runPackingAgent(state.input, state.retrievalResult, deps);
        await safeLogSpan(logSpanFn, { runId: state.runId, childAgent: "packing", status: "ok", latencyMs: Date.now() - start });
        return { packingResult: result };
      } catch (error) {
        await safeLogSpan(logSpanFn, { runId: state.runId, childAgent: "packing", status: "error", latencyMs: Date.now() - start });
        return { packingResult: { status: "unavailable", reason: error.message } };
      }
    })
    .addEdge(START, "retrieval")
    .addEdge("retrieval", "itinerary")
    .addEdge("retrieval", "safety")
    .addEdge("itinerary", "packing")
    .addEdge("safety", "packing")
    .addEdge("packing", END)
    .compile();
}

const TIMEOUT_MS = 30000;

export async function runOrchestrator(input, deps = {}) {
  const runId = crypto.randomUUID();
  const graph = buildGraph(deps);
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;

  // Track the timer handle so we can clear it once the race settles — an
  // uncleared setTimeout keeps a dangling 30s timer alive on every call even
  // when graph.invoke() resolves normally, which delays event-loop drain
  // (observed adding ~30s of real wall-clock time per test-file run) and
  // leaks timers under load in production.
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`plan_trip timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    const finalState = await Promise.race([graph.invoke({ input, runId }), timeout]);

    return {
      runId,
      destination: input.destination,
      trip: finalState.itineraryResult?.tripPlan ?? null,
      scheduledItinerary: finalState.itineraryResult?.scheduledItinerary ?? null,
      packingList: finalState.packingResult?.packingList ?? null,
      safety: finalState.safetyResult ?? null,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
