import type { DiagnosisReport, DiagnosisState, Finding } from "../graph/state.js";

export function buildDiagnosisReport(state: DiagnosisState): DiagnosisReport {
  const findings = dedupeFindings(state.findings);
  const limitations = buildLimitations(state);
  const nextSteps = Array.from(new Set(findings.flatMap((finding) => finding.recommendations)));
  const summary =
    findings.length > 0
      ? findings.map((finding) => `${finding.level} ${translateCategory(finding.category)}问题：${finding.title}`)
      : ["本次运行未形成足够证据，建议检查场景设计、采样配置或页面稳定性。"];

  return {
    status: state.resultStatus,
    generatedAt: new Date().toISOString(),
    summary,
    findings,
    limitations,
    nextSteps,
  };
}

export function renderMarkdownReport(state: DiagnosisState): string {
  const report = state.report ?? buildDiagnosisReport(state);
  const lines: string[] = [];

  lines.push("# 性能诊断报告");
  lines.push("");
  lines.push(`- 状态：${report.status}`);
  lines.push(`- 任务：${state.task.scenario.name}`);
  lines.push(`- URL：${state.task.url}`);
  lines.push(`- 生成时间：${report.generatedAt}`);
  lines.push(`- 综合置信度：${state.confidence}`);
  lines.push("");
  lines.push("## 总结");
  for (const item of report.summary) {
    lines.push(`- ${item}`);
  }

  for (const finding of report.findings) {
    lines.push("");
    lines.push(`## ${translateCategory(finding.category)}：${finding.title}`);
    lines.push(`- 等级：${finding.level}`);
    lines.push(`- 置信度：${finding.confidence}`);
    lines.push(`- 结论：${finding.summary}`);
    lines.push("");
    lines.push("### 证据");

    const relatedEvidence = state.evidence.filter((evidence) => finding.evidenceIds.includes(evidence.id));
    for (const evidence of relatedEvidence) {
      lines.push(`- ${evidence.summary}`);
      if (evidence.artifactRefs.length > 0) {
        lines.push(`- artifact：${evidence.artifactRefs.join(", ")}`);
      }
    }

    lines.push("");
    lines.push("### 下一步建议");
    for (const recommendation of finding.recommendations) {
      lines.push(`- ${recommendation}`);
    }
  }

  lines.push("");
  lines.push("## 限制说明");
  for (const limitation of report.limitations) {
    lines.push(`- ${limitation}`);
  }

  if (report.nextSteps.length > 0) {
    lines.push("");
    lines.push("## 建议动作");
    for (const step of report.nextSteps) {
      lines.push(`- ${step}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function buildLimitations(state: DiagnosisState): string[] {
  const limitations = [
    "当前结果基于黑盒实验，不保证稳定映射到原始业务源码。",
    "第一版以规则分析为主，尚未接入 source-aware 归因链路。",
  ];

  if (state.issues.length > 0) {
    limitations.push(...state.issues.map((issue) => issue.message));
  }

  return Array.from(new Set(limitations));
}

function dedupeFindings(findings: Finding[]): Finding[] {
  const merged = new Map<string, Finding>();

  for (const finding of findings) {
    const key = `${finding.category}:${finding.title}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...finding, evidenceIds: [...finding.evidenceIds], recommendations: [...finding.recommendations] });
      continue;
    }

    existing.confidence = Math.max(existing.confidence, finding.confidence);
    existing.level = strongerLevel(existing.level, finding.level);
    existing.evidenceIds = Array.from(new Set([...existing.evidenceIds, ...finding.evidenceIds]));
    existing.recommendations = Array.from(new Set([...existing.recommendations, ...finding.recommendations]));
  }

  return Array.from(merged.values());
}

function strongerLevel(left: Finding["level"], right: Finding["level"]): Finding["level"] {
  const order: Array<Finding["level"]> = ["Risk", "Suspected", "Confirmed"];
  return order.indexOf(left) >= order.indexOf(right) ? left : right;
}

function translateCategory(category: Finding["category"]): string {
  if (category === "loading") {
    return "加载";
  }
  if (category === "interaction") {
    return "交互";
  }
  return "内存";
}
