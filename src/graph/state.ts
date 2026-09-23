import type { Category, CollectType, DiagnosisTask } from "../task/schema.js";

export type Severity = "high" | "medium" | "low";
export type SourceType = "trace" | "heap" | "network" | "console" | "derived";
export type FindingLevel = "Confirmed" | "Suspected" | "Risk";
export type TaskResultStatus = "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";

export type Metric = {
  id: string;
  name: string;
  category: Category;
  value: number;
  unit: string;
  runId: string;
  stepId?: string;
};

export type Evidence = {
  id: string;
  runId: string;
  stepId?: string;
  category: Category;
  severity: Severity;
  source: SourceType;
  summary: string;
  value?: number | string;
  thresholdRef?: string;
  artifactRefs: string[];
  timestamp: string;
};

export type Finding = {
  id: string;
  category: Category;
  title: string;
  summary: string;
  level: FindingLevel;
  confidence: number;
  evidenceIds: string[];
  recommendations: string[];
};

export type RunSummary = {
  runId: string;
  startedAt: string;
  endedAt?: string;
  status: "PENDING" | "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";
  stepNames: string[];
  artifacts: string[];
  issues: string[];
};

export type DiagnosisReport = {
  status: TaskResultStatus;
  generatedAt: string;
  summary: string[];
  findings: Finding[];
  limitations: string[];
  nextSteps: string[];
};

export type ArtifactManifest = {
  taskId: string;
  rootDir: string;
  reportFile?: string;
  metricsFile?: string;
  runSummaryFile?: string;
  traceFiles: string[];
  heapFiles: string[];
  screenshots: string[];
  networkFiles: string[];
  consoleFiles: string[];
};

export type RuntimeIssue = {
  code:
    | "PAGE_PREPARE_FAILED"
    | "START_ASSERTION_FAILED"
    | "SCENARIO_STEP_FAILED"
    | "COLLECTION_FAILED"
    | "ANALYSIS_FAILED";
  message: string;
  recoverable: boolean;
};

export type DiagnosisState = {
  task: DiagnosisTask;
  taskPath: string;
  taskId: string;
  metrics: Metric[];
  findings: Finding[];
  evidence: Evidence[];
  suspectedCategories: Category[];
  confidence: number;
  nextAction?: string;
  artifacts: ArtifactManifest;
  runHistory: RunSummary[];
  report?: DiagnosisReport;
  issues: RuntimeIssue[];
  resultStatus: TaskResultStatus;
  collectedTypes: CollectType[];
};

export function createInitialState(input: {
  task: DiagnosisTask;
  taskPath: string;
  taskId: string;
  artifactRootDir: string;
}): DiagnosisState {
  return {
    task: input.task,
    taskPath: input.taskPath,
    taskId: input.taskId,
    metrics: [],
    findings: [],
    evidence: [],
    suspectedCategories: [...input.task.analysis.categories],
    confidence: 0,
    artifacts: {
      taskId: input.taskId,
      rootDir: input.artifactRootDir,
      traceFiles: [],
      heapFiles: [],
      screenshots: [],
      networkFiles: [],
      consoleFiles: [],
    },
    runHistory: [],
    issues: [],
    resultStatus: "FAILED",
    collectedTypes: [...input.task.analysis.collect],
  };
}
