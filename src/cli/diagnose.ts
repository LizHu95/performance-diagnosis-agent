#!/usr/bin/env node

import path from "node:path";
import process from "node:process";

import { Command } from "commander";

import { runDiagnosisGraph } from "../graph/builder.js";
import { createInitialState } from "../graph/state.js";
import { createBrowserSessionFactory } from "../mcp/chrome-client.js";
import { parseTaskMarkdown } from "../task/parse-task-md.js";
import { ensureDir } from "../utils/fs.js";
import { createTaskId } from "../utils/id.js";

const program = new Command();

program
  .name("perf-agent")
  .description("Web black-box performance diagnosis agent")
  .version("0.1.0");

program
  .command("diagnose")
  .requiredOption("--task <path>", "Path to the diagnosis task markdown file")
  .option("--artifacts-dir <path>", "Base output directory for diagnosis artifacts", "./artifacts")
  .option("--mode <mode>", "Browser mode: mock or mcp", "mock")
  .option("--browser-url <url>", "Connect MCP mode to an existing Chrome remote debugging endpoint")
  .option("--chrome-executable <path>", "Custom Chrome executable path for MCP mode")
  .option("--auto-connect", "Ask chrome-devtools-mcp to auto connect to a running Chrome instance", false)
  .action(async (options) => {
    try {
      const taskPath = path.resolve(process.cwd(), options.task);
      const artifactsBaseDir = path.resolve(process.cwd(), options.artifactsDir);
      const mode = normalizeMode(options.mode);

      const parsed = await parseTaskMarkdown(taskPath);
      const taskId = createTaskId(taskPath, parsed.task.url);
      const artifactRootDir = path.join(artifactsBaseDir, taskId);
      await ensureDir(artifactRootDir);

      const initialState = createInitialState({
        task: parsed.task,
        taskPath,
        taskId,
        artifactRootDir,
      });

      const finalState = await runDiagnosisGraph(initialState, {
        browserFactory: createBrowserSessionFactory(mode, {
          browserUrl: options.browserUrl,
          executablePath: options.chromeExecutable,
          autoConnect: options.autoConnect,
        }),
        mode,
      });

      const reportFile = finalState.artifacts.reportFile ?? path.join(artifactRootDir, "report.md");
      const metricsFile = finalState.artifacts.metricsFile ?? path.join(artifactRootDir, "metrics.json");

      console.log(`Diagnosis finished with status: ${finalState.resultStatus}`);
      console.log(`Task ID: ${taskId}`);
      console.log(`Artifacts: ${artifactRootDir}`);
      console.log(`Report: ${reportFile}`);
      console.log(`Metrics: ${metricsFile}`);

      if (finalState.issues.length > 0) {
        console.log("Issues:");
        for (const issue of finalState.issues) {
          console.log(`- [${issue.code}] ${issue.message}`);
        }
      }

      process.exitCode = finalState.resultStatus === "FAILED" ? 1 : 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Diagnosis failed: ${message}`);
      process.exitCode = 2;
    }
  });

await program.parseAsync(process.argv);

function normalizeMode(mode: string): "mock" | "mcp" {
  if (mode === "mock" || mode === "mcp") {
    return mode;
  }

  throw new Error(`Unsupported mode: ${mode}. Expected 'mock' or 'mcp'.`);
}
