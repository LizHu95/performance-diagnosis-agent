import { readFile } from "node:fs/promises";

import YAML from "yaml";
import { z } from "zod";

import { diagnosisTaskSchema, type DiagnosisTask } from "./schema.js";

const configBlockPattern = /##\s+Config\s*```ya?ml\s*([\s\S]*?)```/i;
const notesSectionPattern = /##\s+Notes\s*([\s\S]*?)(?:\n##\s+|$)/i;

export type ParsedTaskDocument = {
  task: DiagnosisTask;
  rawMarkdown: string;
  configSource: string;
};

export async function parseTaskMarkdown(filePath: string): Promise<ParsedTaskDocument> {
  const rawMarkdown = await readFile(filePath, "utf8");
  const configMatch = rawMarkdown.match(configBlockPattern);

  if (!configMatch?.[1]) {
    throw new Error("未找到 `## Config` YAML 配置块。");
  }

  const configSource = configMatch[1].trim();
  const notes = extractNotes(rawMarkdown);

  let parsedYaml: unknown;
  try {
    parsedYaml = YAML.parse(configSource);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`YAML 解析失败：${message}`);
  }

  const enrichedConfig =
    parsedYaml && typeof parsedYaml === "object"
      ? {
          ...(parsedYaml as Record<string, unknown>),
          notes:
            Array.isArray((parsedYaml as Record<string, unknown>).notes) &&
            (parsedYaml as Record<string, unknown>).notes !== undefined
              ? (parsedYaml as Record<string, unknown>).notes
              : notes,
        }
      : parsedYaml;

  try {
    const task = diagnosisTaskSchema.parse(enrichedConfig);
    return { task, rawMarkdown, configSource };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues
        .map((issue) => `- ${issue.path.join(".") || "<root>"}: ${issue.message}`)
        .join("\n");
      throw new Error(`任务配置校验失败：\n${issues}`);
    }
    throw error;
  }
}

function extractNotes(markdown: string): string[] {
  const notesMatch = markdown.match(notesSectionPattern);
  if (!notesMatch?.[1]) {
    return [];
  }

  return notesMatch[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}
