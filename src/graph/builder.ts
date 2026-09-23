import path from "node:path";

import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import { calculateOverallConfidence } from "../analyzers/confidence.js";
import { analyzeInteraction } from "../analyzers/interaction.js";
import { analyzeLoading } from "../analyzers/loading.js";
import { analyzeMemory } from "../analyzers/memory.js";
import { buildMetricsJson } from "../report/json.js";
import { buildDiagnosisReport, renderMarkdownReport } from "../report/markdown.js";
import type { DiagnosisState, Evidence, Finding, Metric } from "./state.js";
import { writeJsonFile, writeTextFile } from "../utils/fs.js";
import type { BrowserSessionFactory, CollectedArtifact } from "../mcp/types.js";
import { runScenarioPlan } from "../scenario/runner.js";

type GraphContext = {
  browserFactory: BrowserSessionFactory;
  mode: "mock" | "mcp";
};

const stateAnnotation = Annotation.Root({
  state: Annotation<DiagnosisState>(),
  sessionArtifacts: Annotation<Map<string, CollectedArtifact[]>>({
    reducer: (_left, right) => right,
    default: () => new Map<string, CollectedArtifact[]>(),
  }),
});

export async function runDiagnosisGraph(
  initialState: DiagnosisState,
  context: GraphContext,
): Promise<DiagnosisState> {
  const graph = new StateGraph(stateAnnotation)
    .addNode("prepare_page", async ({ state }) => ({ state }))
    .addNode("run_baseline", async ({ state }) => {
      const result = await runScenarioPlan(state, context.browserFactory, context.mode);
      return { state: result.state, sessionArtifacts: result.sessionArtifacts };
    })
    .addNode("classify_problem", async (input) => {
      const nextState: DiagnosisState = {
        ...input.state,
        suspectedCategories: [...input.state.task.analysis.categories],
      };
      return { ...input, state: nextState };
    })
    .addNode("analyze_loading", async (input) => {
      return {
        ...input,
        state: mergeAnalysis(input.state, input.sessionArtifacts, "loading", analyzeLoading),
      };
    })
    .addNode("analyze_interaction", async (input) => {
      return {
        ...input,
        state: mergeAnalysis(input.state, input.sessionArtifacts, "interaction", analyzeInteraction),
      };
    })
    .addNode("analyze_memory", async (input) => {
      return {
        ...input,
        state: mergeAnalysis(input.state, input.sessionArtifacts, "memory", analyzeMemory),
      };
    })
    .addNode("evaluate_evidence", async (input) => {
      const findings = input.state.findings;
      const confidence = calculateOverallConfidence(findings);
      const resultStatus =
        findings.length > 0
          ? input.state.issues.length > 0
            ? "PARTIAL_SUCCESS"
            : "SUCCESS"
          : input.state.issues.length > 0
            ? "FAILED"
            : "PARTIAL_SUCCESS";

      return {
        ...input,
        state: {
          ...input.state,
          confidence,
          resultStatus,
        },
      };
    })
    .addNode("generate_report", async (input) => {
      const report = buildDiagnosisReport(input.state);
      const finalState: DiagnosisState = {
        ...input.state,
        report,
      };

      const reportFile = path.join(finalState.artifacts.rootDir, "report.md");
      const metricsFile = path.join(finalState.artifacts.rootDir, "metrics.json");
      const runSummaryFile = path.join(finalState.artifacts.rootDir, "run-summary.json");

      await writeTextFile(reportFile, renderMarkdownReport(finalState));
      await writeJsonFile(metricsFile, buildMetricsJson(finalState));
      await writeJsonFile(runSummaryFile, finalState.runHistory);

      return {
        ...input,
        state: {
          ...finalState,
          artifacts: {
            ...finalState.artifacts,
            reportFile,
            metricsFile,
            runSummaryFile,
          },
        },
      };
    })
    .addEdge(START, "prepare_page")
    .addEdge("prepare_page", "run_baseline")
    .addEdge("run_baseline", "classify_problem")
    .addEdge("classify_problem", "analyze_loading")
    .addEdge("analyze_loading", "analyze_interaction")
    .addEdge("analyze_interaction", "analyze_memory")
    .addEdge("analyze_memory", "evaluate_evidence")
    .addEdge("evaluate_evidence", "generate_report")
    .addEdge("generate_report", END)
    .compile();

  const result = await graph.invoke({ state: initialState });
  return result.state;
}

function mergeAnalysis(
  state: DiagnosisState,
  sessionArtifacts: Map<string, CollectedArtifact[]>,
  category: "loading" | "interaction" | "memory",
  analyzer: (runId: string, artifacts: CollectedArtifact[]) => {
    metrics: Metric[];
    evidence: Evidence[];
    findings: Finding[];
  },
): DiagnosisState {
  if (!state.task.analysis.categories.includes(category)) {
    return state;
  }

  const metrics = [...state.metrics];
  const evidence = [...state.evidence];
  const findings = [...state.findings];

  for (const [runId, artifacts] of sessionArtifacts.entries()) {
    const relevantArtifacts = artifacts.filter((artifact) => artifact.category === category);
    const result = analyzer(runId, relevantArtifacts);
    metrics.push(...result.metrics);
    evidence.push(...result.evidence);
    findings.push(...result.findings);
  }

  return {
    ...state,
    metrics,
    evidence,
    findings,
  };
}
