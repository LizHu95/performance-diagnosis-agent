import type { CollectedArtifact } from "../mcp/types.js";
import type { Evidence, Finding, Metric } from "../graph/state.js";
import { createEntityId } from "../utils/id.js";

export function analyzeMemory(runId: string, artifacts: CollectedArtifact[]): {
  metrics: Metric[];
  evidence: Evidence[];
  findings: Finding[];
} {
  const heap = pickAfterArtifact(artifacts, "heap");
  if (!heap?.data) {
    return { metrics: [], evidence: [], findings: [] };
  }

  const heapUsedMb = asNumber(heap.data.heapUsedMb);
  const detachedDomNodes = asNumber(heap.data.detachedDomNodes);

  const metrics: Metric[] = [];
  const evidence: Evidence[] = [];
  const findings: Finding[] = [];

  if (heapUsedMb !== undefined) {
    metrics.push({
      id: createEntityId("metric", runId, "memory", "heap-used"),
      name: "Heap Used",
      category: "memory",
      value: heapUsedMb,
      unit: "MB",
      runId,
    });
  }

  if (detachedDomNodes !== undefined) {
    metrics.push({
      id: createEntityId("metric", runId, "memory", "detached-dom"),
      name: "Detached DOM Nodes",
      category: "memory",
      value: detachedDomNodes,
      unit: "count",
      runId,
    });
  }

  if (heapUsedMb !== undefined && heapUsedMb >= 140) {
    const evidenceId = createEntityId("evidence", runId, "memory", "heap-growth");
    evidence.push({
      id: evidenceId,
      runId,
      category: "memory",
      severity: "medium",
      source: "heap",
      summary: `Heap 使用量达到 ${heapUsedMb}MB，存在持续增长风险。`,
      value: heapUsedMb,
      thresholdRef: "Heap Used >= 140MB",
      artifactRefs: [heap.path],
      timestamp: new Date().toISOString(),
    });

    const evidenceIds = [evidenceId];

    if (detachedDomNodes !== undefined && detachedDomNodes >= 10) {
      const detachedEvidenceId = createEntityId("evidence", runId, "memory", "detached-dom");
      evidence.push({
        id: detachedEvidenceId,
        runId,
        category: "memory",
        severity: "medium",
        source: "heap",
        summary: `Detached DOM 节点数达到 ${detachedDomNodes}，存在未释放节点风险。`,
        value: detachedDomNodes,
        thresholdRef: "Detached DOM >= 10",
        artifactRefs: [heap.path],
        timestamp: new Date().toISOString(),
      });
      evidenceIds.push(detachedEvidenceId);
    }

    findings.push({
      id: createEntityId("finding", runId, "memory", "growth-risk"),
      category: "memory",
      title: "内存持续增长风险",
      summary: "多轮操作后堆内存和 Detached DOM 指标偏高，存在疑似泄漏风险。",
      level: evidenceIds.length >= 2 ? "Confirmed" : "Suspected",
      confidence: evidenceIds.length >= 2 ? 0.82 : 0.67,
      evidenceIds,
      recommendations: [
        "检查会话切换后是否有 DOM 节点、缓存或事件监听未被释放。",
        "重点关注消息列表、会话缓存和闭包持有对象的生命周期。",
      ],
    });
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
