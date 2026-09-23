import type { Finding } from "../graph/state.js";

export function calculateOverallConfidence(findings: Finding[]): number {
  if (findings.length === 0) {
    return 0;
  }

  const total = findings.reduce((sum, finding) => sum + finding.confidence, 0);
  return Number((total / findings.length).toFixed(2));
}
