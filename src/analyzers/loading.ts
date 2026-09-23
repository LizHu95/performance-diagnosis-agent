import type { CollectedArtifact } from "../mcp/types.js";
import type { Evidence, Finding, Metric } from "../graph/state.js";
import { createEntityId } from "../utils/id.js";

export function analyzeLoading(runId: string, artifacts: CollectedArtifact[]): {
  metrics: Metric[];
  evidence: Evidence[];
  findings: Finding[];
} {
  const trace = pickAfterArtifact(artifacts, "trace");
  const network = pickAfterArtifact(artifacts, "network");
  if (!trace?.data) {
    return { metrics: [], evidence: [], findings: [] };
  }

  const lcp = asNumber(trace.data.lcp);
  const ttfb = network?.data ? firstRequestDuration(network.data.requests) : undefined;
  const traceRaw = asString(trace.data.raw);
  const networkRaw = network?.data ? asString(network.data.raw) : undefined;
  const traceUrl = traceRaw ? parseTraceUrl(traceRaw) : undefined;
  const networkRequestCount = networkRaw ? parseNetworkRequestCount(networkRaw) : undefined;

  const metrics: Metric[] = [];
  const evidence: Evidence[] = [];
  const findings: Finding[] = [];
  const loadingEvidenceIds: string[] = [];

  if (lcp !== undefined) {
    metrics.push({
      id: createEntityId("metric", runId, "loading", "lcp"),
      name: "LCP",
      category: "loading",
      value: lcp,
      unit: "ms",
      runId,
    });

    if (lcp >= 2500) {
      const evidenceId = createEntityId("evidence", runId, "loading", "lcp");
      evidence.push({
        id: evidenceId,
        runId,
        category: "loading",
        severity: "high",
        source: "trace",
        summary: `LCP 达到 ${lcp}ms，超过首屏体验阈值。`,
        value: lcp,
        thresholdRef: "LCP >= 2500ms",
        artifactRefs: [trace.path],
        timestamp: new Date().toISOString(),
      });
      loadingEvidenceIds.push(evidenceId);

      findings.push({
        id: createEntityId("finding", runId, "loading", "slow-load"),
        category: "loading",
        title: "首屏加载偏慢",
        summary: "页面首屏指标偏高，存在首屏加载性能风险。",
        level: "Suspected",
        confidence: 0.68,
        evidenceIds: [evidenceId],
        recommendations: [
          "优先检查关键资源体积和阻塞链路。",
          "确认首屏主线程是否存在较长的脚本执行时间。",
        ],
      });
    }
  }

  if (ttfb !== undefined) {
    metrics.push({
      id: createEntityId("metric", runId, "loading", "ttfb"),
      name: "TTFB",
      category: "loading",
      value: ttfb,
      unit: "ms",
      runId,
    });
  }

  if (traceRaw && traceUrl) {
    const evidenceId = createEntityId("evidence", runId, "loading", "trace-summary");
    evidence.push({
      id: evidenceId,
      runId,
      category: "loading",
      severity: "low",
      source: "trace",
      summary: `已采集真实加载 trace，目标页面为 ${traceUrl}。`,
      value: traceUrl,
      thresholdRef: "Trace collected",
      artifactRefs: [trace.path],
      timestamp: new Date().toISOString(),
    });
    loadingEvidenceIds.push(evidenceId);
  }

  if (networkRequestCount !== undefined) {
    const evidenceId = createEntityId("evidence", runId, "loading", "network-summary");
    evidence.push({
      id: evidenceId,
      runId,
      category: "loading",
      severity: "low",
      source: "network",
      summary: `已采集网络请求摘要，本轮共记录 ${networkRequestCount} 条请求。`,
      value: networkRequestCount,
      thresholdRef: "Network summary collected",
      artifactRefs: network ? [network.path] : [],
      timestamp: new Date().toISOString(),
    });
    loadingEvidenceIds.push(evidenceId);
  }

  if (loadingEvidenceIds.length > 0 && findings.length === 0) {
    findings.push({
      id: createEntityId("finding", runId, "loading", "trace-collected"),
      category: "loading",
      title: "已完成加载链路采样",
      summary: "已完成真实页面加载 trace 和网络摘要采样，但当前规则尚未判定为明确加载异常。",
      level: "Risk",
      confidence: 0.42,
      evidenceIds: loadingEvidenceIds,
      recommendations: [
        "进一步补充真实 trace insight 解析，提取 LCP、主线程忙时段和阻塞资源信息。",
        "在目标业务页面上运行同一 task，以便获得更有代表性的加载证据。",
      ],
    });
  }

  return { metrics, evidence, findings };
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function firstRequestDuration(requests: unknown): number | undefined {
  if (!Array.isArray(requests) || requests.length === 0) {
    return undefined;
  }

  const first = requests[0];
  if (!first || typeof first !== "object" || !("durationMs" in first)) {
    return undefined;
  }

  return typeof first.durationMs === "number" ? first.durationMs : undefined;
}

function parseTraceUrl(raw: string): string | undefined {
  const match = raw.match(/URL:\s*(.+)/);
  return match?.[1]?.trim();
}

function parseNetworkRequestCount(raw: string): number | undefined {
  const match = raw.match(/Showing\s+\d+-\d+\s+of\s+(\d+)/);
  if (!match?.[1]) {
    return undefined;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
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
