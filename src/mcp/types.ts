import type { AssertType, CollectType, ScenarioStep, StartAssertion, Target } from "../task/schema.js";

export type CollectionPayload = {
  runId: string;
  category: "loading" | "interaction" | "memory";
  requested: CollectType[];
};

export type BrowserMode = "mock" | "mcp";

export type CollectedArtifact = {
  category: "loading" | "interaction" | "memory";
  type: CollectType;
  path: string;
  summary: string;
  data?: Record<string, unknown>;
};

export type BrowserObservation = {
  url: string;
  title: string;
  visibleTexts: string[];
  availableTargets: string[];
};

export type BrowserCollectContext = {
  phase: "before" | "after" | "checkpoint";
  scenarioName: string;
  label?: string;
};

export interface BrowserSession {
  open(url: string): Promise<void>;
  assert(assertion: StartAssertion | { type: AssertType; target?: Target; value?: string }): Promise<void>;
  executeStep(step: ScenarioStep): Promise<void>;
  collect(payload: CollectionPayload, context: BrowserCollectContext): Promise<CollectedArtifact[]>;
  observe(): Promise<BrowserObservation>;
  close(): Promise<void>;
}

export interface BrowserSessionFactory {
  createSession(options: {
    taskId: string;
    outputDir: string;
    mode: BrowserMode;
  }): Promise<BrowserSession>;
}
