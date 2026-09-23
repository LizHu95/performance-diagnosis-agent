import { createHash } from "node:crypto";

export function createTaskId(taskPath: string, url: string): string {
  return createHash("sha1").update(`${taskPath}:${url}`).digest("hex").slice(0, 12);
}

export function createRunId(index: number): string {
  return `run-${String(index + 1).padStart(2, "0")}`;
}

export function createEntityId(prefix: string, ...parts: Array<string | number | undefined>): string {
  const normalized = parts.filter((part) => part !== undefined).join(":");
  const suffix = createHash("sha1").update(normalized).digest("hex").slice(0, 10);
  return `${prefix}-${suffix}`;
}
