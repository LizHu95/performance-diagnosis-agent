import path from "node:path";

import type { BrowserCollectContext, CollectedArtifact, BrowserSessionFactory } from "../mcp/types.js";
import type { DiagnosisState, RunSummary, RuntimeIssue } from "../graph/state.js";
import { createRunId } from "../utils/id.js";
import { ensureDir } from "../utils/fs.js";

export type ScenarioRunResult = {
  state: DiagnosisState;
  sessionArtifacts: Map<string, CollectedArtifact[]>;
};

export async function runScenarioPlan(
  state: DiagnosisState,
  browserFactory: BrowserSessionFactory,
  mode: "mock" | "mcp",
): Promise<ScenarioRunResult> {
  const nextState: DiagnosisState = {
    ...state,
    runHistory: [...state.runHistory],
    issues: [...state.issues],
    artifacts: {
      ...state.artifacts,
      traceFiles: [...state.artifacts.traceFiles],
      heapFiles: [...state.artifacts.heapFiles],
      screenshots: [...state.artifacts.screenshots],
      networkFiles: [...state.artifacts.networkFiles],
      consoleFiles: [...state.artifacts.consoleFiles],
    },
  };

  const sessionArtifacts = new Map<string, CollectedArtifact[]>();

  for (let index = 0; index < nextState.task.runs; index += 1) {
    const runId = createRunId(index);
    const runDir = path.join(nextState.artifacts.rootDir, runId);
    await ensureDir(runDir);

    const runSummary: RunSummary = {
      runId,
      startedAt: new Date().toISOString(),
      status: "PENDING",
      stepNames: nextState.task.scenario.steps.map((step) => step.action),
      artifacts: [],
      issues: [],
    };
    nextState.runHistory.push(runSummary);

    const session = await browserFactory.createSession({
      taskId: nextState.taskId,
      outputDir: runDir,
      mode,
    });

    try {
      await session.open(nextState.task.url);

      for (const step of nextState.task.prepare) {
        await session.executeStep(step);
      }

      for (const assertion of nextState.task.startAssertions) {
        await session.assert(assertion);
      }

      const beforeArtifacts = await collectArtifactsForRun(nextState, runId, session, {
        phase: "before",
        scenarioName: nextState.task.scenario.name,
      });
      runSummary.artifacts.push(...beforeArtifacts.map((item) => item.path));
      mergeArtifacts(nextState, beforeArtifacts);

      for (const step of nextState.task.scenario.steps) {
        if (step.action === "collect") {
          const checkpointArtifacts = await session.collect(
            {
              runId,
              category: selectCollectCategory(step.types, nextState.task.analysis.categories),
              requested: step.types,
            },
            {
              phase: "checkpoint",
              scenarioName: nextState.task.scenario.name,
              label: step.label,
            },
          );
          runSummary.artifacts.push(...checkpointArtifacts.map((item) => item.path));
          mergeArtifacts(nextState, checkpointArtifacts);
          const existing = sessionArtifacts.get(runId) ?? [];
          sessionArtifacts.set(runId, [...existing, ...checkpointArtifacts]);
          continue;
        }

        await session.executeStep(step);
      }

      const afterArtifacts = await collectArtifactsForRun(nextState, runId, session, {
        phase: "after",
        scenarioName: nextState.task.scenario.name,
      });
      const collected = [...beforeArtifacts, ...afterArtifacts];
      sessionArtifacts.set(runId, collected);
      runSummary.artifacts.push(...afterArtifacts.map((item) => item.path));
      mergeArtifacts(nextState, afterArtifacts);
      runSummary.status = "SUCCESS";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const issue = classifyRunError(message);
      nextState.issues.push(issue);
      runSummary.issues.push(message);
      runSummary.status = issue.recoverable ? "PARTIAL_SUCCESS" : "FAILED";

      if (!issue.recoverable) {
        nextState.resultStatus = "FAILED";
        runSummary.endedAt = new Date().toISOString();
        await session.close();
        return { state: nextState, sessionArtifacts };
      }
    } finally {
      runSummary.endedAt = new Date().toISOString();
      await session.close();
    }
  }

  return { state: nextState, sessionArtifacts };
}

async function collectArtifactsForRun(
  state: DiagnosisState,
  runId: string,
  session: Awaited<ReturnType<BrowserSessionFactory["createSession"]>>,
  context: BrowserCollectContext,
): Promise<CollectedArtifact[]> {
  const collected: CollectedArtifact[] = [];

  for (const category of state.task.analysis.categories) {
    const requested = state.collectedTypes.filter((type) => shouldCollectForCategory(type, category));
    const artifacts = await session.collect(
      {
        runId,
        category,
        requested,
      },
      context,
    );
    collected.push(...artifacts);
  }

  return collected;
}

function mergeArtifacts(state: DiagnosisState, artifacts: CollectedArtifact[]): void {
  for (const artifact of artifacts) {
    if (artifact.type === "trace") {
      state.artifacts.traceFiles.push(artifact.path);
    }
    if (artifact.type === "heap") {
      state.artifacts.heapFiles.push(artifact.path);
    }
    if (artifact.type === "screenshot") {
      state.artifacts.screenshots.push(artifact.path);
    }
    if (artifact.type === "network") {
      state.artifacts.networkFiles.push(artifact.path);
    }
    if (artifact.type === "console") {
      state.artifacts.consoleFiles.push(artifact.path);
    }
  }
}

function classifyRunError(message: string): RuntimeIssue {
  if (message.includes("断言失败")) {
    return {
      code: "START_ASSERTION_FAILED",
      message,
      recoverable: false,
    };
  }

  return {
    code: "SCENARIO_STEP_FAILED",
    message,
    recoverable: false,
  };
}

function shouldCollectForCategory(
  type: CollectedArtifact["type"],
  category: DiagnosisState["task"]["analysis"]["categories"][number],
): boolean {
  if (category === "loading") {
    return type === "trace" || type === "network" || type === "screenshot";
  }
  if (category === "interaction") {
    return type === "trace" || type === "console" || type === "screenshot";
  }
  if (category === "memory") {
    return type === "heap" || type === "console" || type === "screenshot";
  }
  return false;
}

function selectCollectCategory(
  types: CollectedArtifact["type"][],
  categories: DiagnosisState["task"]["analysis"]["categories"],
): DiagnosisState["task"]["analysis"]["categories"][number] {
  if (types.includes("heap") && categories.includes("memory")) {
    return "memory";
  }
  if (types.includes("trace") && categories.includes("interaction")) {
    return "interaction";
  }
  if (types.includes("trace") && categories.includes("loading")) {
    return "loading";
  }
  return categories[0];
}
