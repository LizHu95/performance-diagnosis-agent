import type { DiagnosisState } from "../graph/state.js";

export function buildMetricsJson(state: DiagnosisState): Record<string, unknown> {
  return {
    taskId: state.taskId,
    taskPath: state.taskPath,
    url: state.task.url,
    scenario: state.task.scenario.name,
    confidence: state.confidence,
    status: state.resultStatus,
    metrics: state.metrics,
    evidence: state.evidence,
    findings: state.findings,
    runHistory: state.runHistory,
  };
}
