import type { CollectedArtifact } from "../mcp/types.js";
import type { Evidence, Finding, Metric } from "../graph/state.js";
import { createEntityId } from "../utils/id.js";

export function analyzeInteraction(runId: string, artifacts: CollectedArtifact[]): {
  metrics: Metric[];
  evidence: Evidence[];
  findings: Finding[];
} {
  const trace = pickAfterArtifact(artifacts, "trace");
  const consoleArtifact = pickAfterArtifact(artifacts, "console");
  if (!trace?.data) {
    return { metrics: [], evidence: [], findings: [] };
  }

  const longTaskMs = asNumber(trace.data.longTaskMs);
  const inp = asNumber(trace.data.inp);
  const scriptMs = asNumber(trace.data.scriptMs);

  const metrics: Metric[] = [];
  const evidence: Evidence[] = [];
  const findings: Finding[] = [];

  if (inp !== undefined) {
    metrics.push({
      id: createEntityId("metric", runId, "interaction", "inp"),
      name: "INP",
      category: "interaction",
      value: inp,
      unit: "ms",
      runId,
    });
  }

  if (longTaskMs !== undefined) {
    metrics.push({
      id: createEntityId("metric", runId, "interaction", "long-task"),
      name: "Long Task",
      category: "interaction",
      value: longTaskMs,
      unit: "ms",
      runId,
    });
  }

  if (longTaskMs !== undefined && longTaskMs >= 200) {
    const evidenceId = createEntityId("evidence", runId, "interaction", "long-task");
    evidence.push({
      id: evidenceId,
      runId,
      category: "interaction",
      severity: "high",
      source: "trace",
      summary: `交互后出现 ${longTaskMs}ms Long Task，说明主线程存在明显阻塞。`,
      value: longTaskMs,
      thresholdRef: "Long Task >= 200ms",
      artifactRefs: [trace.path],
      timestamp: new Date().toISOString(),
    });

    if (scriptMs !== undefined) {
      const scriptEvidenceId = createEntityId("evidence", runId, "interaction", "script");
      evidence.push({
        id: scriptEvidenceId,
        runId,
        category: "interaction",
        severity: "medium",
        source: "derived",
        summary: `脚本执行耗时 ${scriptMs}ms，说明同步 JavaScript 很可能是阻塞来源。`,
        value: scriptMs,
        thresholdRef: "Script time >= 150ms",
        artifactRefs: [trace.path],
        timestamp: new Date().toISOString(),
      });

      const consoleRef = consoleArtifact ? [consoleArtifact.path] : [];
      findings.push({
        id: createEntityId("finding", runId, "interaction", "main-thread-blocking"),
        category: "interaction",
        title: "交互卡顿",
        summary: "切换会话后主线程出现明显阻塞，交互响应存在卡顿风险。",
        level: "Confirmed",
        confidence: 0.91,
        evidenceIds: [evidenceId, scriptEvidenceId],
        recommendations: [
          "优先检查切换会话路径上的同步数据处理逻辑。",
          "拆分大计算任务，避免在单次交互中集中完成。",
          consoleRef.length > 0 ? "结合 console 提示进一步定位具体阻塞路径。" : "补充 console 采样，确认阻塞时的上下文。",
        ],
      });
    }
  }

  return { metrics, evidence, findings };
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function pickAfterArtifact(
  artifacts: CollectedArtifact[],
  type: CollectedArtifact["type"],
): CollectedArtifact | undefined {
  return (
    artifacts.find(
      (artifact) => artifact.type === type && typeof artifact.data?.phase === "string" && artifact.data.phase === "after",
    ) ?? artifacts.find((artifact) => artifact.type === type)
  );
}
