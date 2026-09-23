import path from "node:path";

import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import type { StructuredToolInterface } from "@langchain/core/tools";

import type { AssertType, ScenarioStep, StartAssertion, Target } from "../task/schema.js";
import { ensureDir, writeJsonFile, writeTextFile } from "../utils/fs.js";
import type {
  BrowserCollectContext,
  BrowserMode,
  BrowserObservation,
  BrowserSession,
  BrowserSessionFactory,
  CollectedArtifact,
  CollectionPayload,
} from "./types.js";

type McpChromeFactoryOptions = {
  command?: string;
  args?: string[];
  headless?: boolean;
  isolated?: boolean;
  executablePath?: string;
  browserUrl?: string;
  autoConnect?: boolean;
};

type MockBrowserState = {
  url: string;
  activeConversation: string;
  typedValues: Record<string, string>;
};

export class MockChromeSessionFactory implements BrowserSessionFactory {
  async createSession(options: {
    taskId: string;
    outputDir: string;
    mode: BrowserMode;
  }): Promise<BrowserSession> {
    await ensureDir(options.outputDir);
    return new MockChromeSession(options.outputDir);
  }
}

class MockChromeSession implements BrowserSession {
  private readonly state: MockBrowserState = {
    url: "",
    activeConversation: "会话A",
    typedValues: {},
  };

  constructor(private readonly outputDir: string) {}

  async open(url: string): Promise<void> {
    this.state.url = url;
    await this.writeObservation("open");
  }

  async assert(assertion: StartAssertion | { type: AssertType; target?: Target; value?: string }): Promise<void> {
    const observation = await this.observe();
    if (!matchesAssertion(observation, assertion)) {
      throw new Error(`断言失败：${describeAssertion(assertion)}`);
    }
  }

  async executeStep(step: ScenarioStep): Promise<void> {
    switch (step.action) {
      case "click": {
        const text = step.target.text ?? step.target.name ?? step.target.selector ?? "unknown";
        if (text.includes("会话A")) {
          this.state.activeConversation = "会话A";
        }
        if (text.includes("会话B")) {
          this.state.activeConversation = "会话B";
        }
        break;
      }
      case "input": {
        const key = step.target.selector ?? step.target.name ?? step.target.text ?? "input";
        this.state.typedValues[key] = step.value;
        break;
      }
      case "wait":
        break;
      case "scroll":
        break;
      case "press":
        break;
      case "collect":
        break;
      case "assert":
        await this.assert(step);
        break;
      default:
        break;
    }

    await this.writeObservation(step.action);
  }

  async collect(payload: CollectionPayload, context: BrowserCollectContext): Promise<CollectedArtifact[]> {
    const artifacts: CollectedArtifact[] = [];

    for (const type of payload.requested) {
      if (type === "screenshot") {
        const screenshotPath = path.join(
          this.outputDir,
          `${payload.runId}-${payload.category}-${context.phase}-screenshot.txt`,
        );
        await writeTextFile(
          screenshotPath,
          `Mock screenshot placeholder for ${payload.category} during ${payload.runId} (${context.phase}). Active conversation: ${this.state.activeConversation}\n`,
        );
        artifacts.push({
          category: payload.category,
          type,
          path: screenshotPath,
          summary: `Captured mock screenshot for ${payload.category}.`,
        });
        continue;
      }

      const filePath = path.join(this.outputDir, `${payload.runId}-${payload.category}-${context.phase}-${type}.json`);
      const data = createMockCollectionData(type, payload, this.state.activeConversation, context);
      await writeJsonFile(filePath, data);
      artifacts.push({
        category: payload.category,
        type,
        path: filePath,
        summary: `Collected mock ${type} artifact for ${payload.category}.`,
        data,
      });
    }

    return artifacts;
  }

  async observe(): Promise<BrowserObservation> {
    const texts = [
      "新建会话",
      "会话A",
      "会话B",
      this.state.activeConversation,
      ...Object.values(this.state.typedValues),
    ];

    return {
      url: this.state.url,
      title: "Mock Chat Page",
      visibleTexts: Array.from(new Set(texts)),
      availableTargets: ["button:新建会话", "text:会话A", "text:会话B"],
    };
  }

  async close(): Promise<void> {
    return;
  }

  private async writeObservation(action: string): Promise<void> {
    const filePath = path.join(this.outputDir, `observation-${action}.json`);
    await writeJsonFile(filePath, {
      action,
      observation: await this.observe(),
      state: this.state,
    });
  }
}

export class McpChromeSessionFactory implements BrowserSessionFactory {
  constructor(private readonly options: McpChromeFactoryOptions = {}) {}

  async createSession(options: {
    taskId: string;
    outputDir: string;
    mode: BrowserMode;
  }): Promise<BrowserSession> {
    await ensureDir(options.outputDir);
    const client = new MultiServerMCPClient({
      useStandardContentBlocks: true,
      onConnectionError: "throw",
      mcpServers: {
        chrome: {
          transport: "stdio",
          command: this.options.command ?? "npx",
          args: buildMcpArgs(this.options),
        },
      },
    });

    const tools = await client.getTools();
    return new McpChromeSession(client, tools, options.outputDir);
  }
}

export function createBrowserSessionFactory(
  mode: BrowserMode,
  options: McpChromeFactoryOptions = {},
): BrowserSessionFactory {
  if (mode === "mcp") {
    return new McpChromeSessionFactory(options);
  }
  return new MockChromeSessionFactory();
}

class McpChromeSession implements BrowserSession {
  private readonly tools: Record<string, StructuredToolInterface>;
  private currentUrl = "";
  private pageId?: number;
  private lastSnapshotRaw = "";
  private lastObservation: BrowserObservation = {
    url: "",
    title: "",
    visibleTexts: [],
    availableTargets: [],
  };

  constructor(
    private readonly client: MultiServerMCPClient,
    tools: StructuredToolInterface[],
    private readonly outputDir: string,
  ) {
    this.tools = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
  }

  async open(url: string): Promise<void> {
    const response = await this.invokeTool("new_page", { url });
    this.currentUrl = url;
    this.pageId = extractSelectedPageId(response);
    await this.refreshObservation();
    await this.writeObservation("open");
  }

  async assert(assertion: StartAssertion | { type: AssertType; target?: Target; value?: string }): Promise<void> {
    const observation = await this.observe();
    if (!matchesAssertion(observation, assertion)) {
      throw new Error(`断言失败：${describeAssertion(assertion)}`);
    }
  }

  async executeStep(step: ScenarioStep): Promise<void> {
    switch (step.action) {
      case "click": {
        const uid = await this.resolveTargetUid(step.target);
        await this.invokeTool("click", { uid });
        break;
      }
      case "input": {
        const uid = await this.resolveTargetUid(step.target);
        await this.invokeTool("click", { uid });
        if (step.clearFirst) {
          await this.invokeTool("press_key", { key: "Control+A" });
          await this.invokeTool("press_key", { key: "Backspace" });
        }
        await this.invokeTool("type_text", { text: step.value });
        break;
      }
      case "wait": {
        if (step.for === "text-visible" && step.value) {
          await this.invokeTool("wait_for", { text: [step.value], timeout: step.timeout });
        } else if (step.timeout) {
          await new Promise((resolve) => setTimeout(resolve, step.timeout));
        }
        break;
      }
      case "scroll": {
        const distance = step.direction === "down" ? 800 * step.amount : -800 * step.amount;
        await this.invokeTool("evaluate_script", {
          function: "() => { window.scrollBy(0, 800); return window.scrollY; }",
        });
        if (distance < 0) {
          await this.invokeTool("evaluate_script", {
            function: "() => { window.scrollBy(0, -1600); return window.scrollY; }",
          });
        }
        break;
      }
      case "press":
        await this.invokeTool("press_key", { key: step.key });
        break;
      case "collect":
        break;
      case "assert":
        await this.assert(step);
        break;
      default:
        break;
    }

    await this.refreshObservation();
    await this.writeObservation(step.action);
  }

  async collect(payload: CollectionPayload, context: BrowserCollectContext): Promise<CollectedArtifact[]> {
    const artifacts: CollectedArtifact[] = [];

    for (const type of payload.requested) {
      if (type === "screenshot") {
        const screenshotPath = path.join(
          this.outputDir,
          `${payload.runId}-${payload.category}-${context.phase}-screenshot.jpeg`,
        );
        await this.invokeTool("take_screenshot", {
          filePath: screenshotPath,
          format: "jpeg",
          fullPage: true,
        });
        artifacts.push({
          category: payload.category,
          type,
          path: screenshotPath,
          summary: `Captured screenshot for ${payload.category} (${context.phase}).`,
        });
        continue;
      }

      if (type === "console") {
        const output = await this.invokeTool("list_console_messages", {});
        const filePath = path.join(this.outputDir, `${payload.runId}-${payload.category}-${context.phase}-console.json`);
        const data = {
          collectedAt: new Date().toISOString(),
          runId: payload.runId,
          category: payload.category,
          phase: context.phase,
          raw: output,
        };
        await writeJsonFile(filePath, data);
        artifacts.push({
          category: payload.category,
          type,
          path: filePath,
          summary: `Collected console messages for ${payload.category} (${context.phase}).`,
          data,
        });
        continue;
      }

      if (type === "network") {
        const output = await this.invokeTool("list_network_requests", {});
        const filePath = path.join(this.outputDir, `${payload.runId}-${payload.category}-${context.phase}-network.json`);
        const data = {
          collectedAt: new Date().toISOString(),
          runId: payload.runId,
          category: payload.category,
          phase: context.phase,
          raw: output,
        };
        await writeJsonFile(filePath, data);
        artifacts.push({
          category: payload.category,
          type,
          path: filePath,
          summary: `Collected network requests for ${payload.category} (${context.phase}).`,
          data,
        });
        continue;
      }

      if (type === "heap") {
        const heapSnapshotPath = path.join(this.outputDir, `${payload.runId}-${payload.category}-${context.phase}.heapsnapshot`);
        await this.invokeTool("take_heapsnapshot", { filePath: heapSnapshotPath });
        const summaryPath = path.join(
          this.outputDir,
          `${payload.runId}-${payload.category}-${context.phase}-heap-summary.json`,
        );
        const data = await this.buildHeapData(payload, context, heapSnapshotPath);
        await writeJsonFile(summaryPath, data);
        artifacts.push({
          category: payload.category,
          type,
          path: summaryPath,
          summary: `Collected heap snapshot for ${payload.category} (${context.phase}).`,
          data,
        });
        continue;
      }

      if (type === "trace") {
        if (context.phase === "before") {
          const statePath = path.join(this.outputDir, `${payload.runId}-${payload.category}-${context.phase}-trace-state.json`);
          await this.invokeTool("performance_start_trace", {
            autoStop: false,
            reload: false,
          });
          const data = {
            collectedAt: new Date().toISOString(),
            runId: payload.runId,
            category: payload.category,
            phase: context.phase,
            status: "started",
          };
          await writeJsonFile(statePath, data);
          artifacts.push({
            category: payload.category,
            type,
            path: statePath,
            summary: `Started performance trace for ${payload.category}.`,
            data,
          });
          continue;
        }

        const traceFilePath = path.join(this.outputDir, `${payload.runId}-${payload.category}-${context.phase}-trace.json`);
        const output = await this.invokeTool("performance_stop_trace", { filePath: traceFilePath });
        const summaryPath = path.join(
          this.outputDir,
          `${payload.runId}-${payload.category}-${context.phase}-trace-summary.json`,
        );
        const data = {
          collectedAt: new Date().toISOString(),
          runId: payload.runId,
          category: payload.category,
          phase: context.phase,
          raw: output,
          traceFilePath,
        };
        await writeJsonFile(summaryPath, data);
        artifacts.push({
          category: payload.category,
          type,
          path: summaryPath,
          summary: `Stopped performance trace for ${payload.category}.`,
          data,
        });
      }
    }

    return artifacts;
  }

  async observe(): Promise<BrowserObservation> {
    await this.refreshObservation();
    return this.lastObservation;
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  private async resolveTargetUid(target: Target): Promise<string> {
    await this.refreshObservation();
    const nodes = parseSnapshotNodes(this.lastSnapshotRaw);
    const found = findSnapshotNode(nodes, target);
    if (!found) {
      throw new Error(`未找到目标元素：${describeTarget(target)}`);
    }
    return found.uid;
  }

  private async refreshObservation(): Promise<void> {
    const snapshot = stringifyToolOutput(await this.invokeTool("take_snapshot", {}));
    this.lastSnapshotRaw = snapshot;
    this.lastObservation = parseObservation(snapshot, this.currentUrl);
  }

  private async buildHeapData(
    payload: CollectionPayload,
    context: BrowserCollectContext,
    currentFilePath: string,
  ): Promise<Record<string, unknown>> {
    if (context.phase === "before") {
      return {
        collectedAt: new Date().toISOString(),
        runId: payload.runId,
        category: payload.category,
        phase: context.phase,
        heapSnapshotPath: currentFilePath,
      };
    }

    const baseFilePath = path.join(this.outputDir, `${payload.runId}-${payload.category}-before.heapsnapshot`);
    try {
      const output = await this.invokeTool("compare_heapsnapshots", {
        baseFilePath,
        currentFilePath,
      });
      return {
        collectedAt: new Date().toISOString(),
        runId: payload.runId,
        category: payload.category,
        phase: context.phase,
        baseFilePath,
        currentFilePath,
        raw: output,
      };
    } catch {
      return {
        collectedAt: new Date().toISOString(),
        runId: payload.runId,
        category: payload.category,
        phase: context.phase,
        currentFilePath,
      };
    }
  }

  private async invokeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools[name];
    if (!tool) {
      throw new Error(`Chrome DevTools MCP tool not found: ${name}`);
    }
    const payload = this.pageId && toolSupportsPageId(name) ? { ...args, pageId: this.pageId } : args;
    return tool.invoke(payload);
  }

  private async writeObservation(action: string): Promise<void> {
    const filePath = path.join(this.outputDir, `observation-${action}.json`);
    await writeJsonFile(filePath, {
      action,
      observation: this.lastObservation,
      snapshot: this.lastSnapshotRaw,
    });
  }
}

function matchesAssertion(
  observation: BrowserObservation,
  assertion: StartAssertion | { type: AssertType; target?: Target; value?: string },
): boolean {
  switch (assertion.type) {
    case "element-visible":
    case "element-exists": {
      const target = assertion.target;
      if (!target) {
        return false;
      }
      const candidate =
        target.selector ?? (target.role && target.name ? `${target.role}:${target.name}` : undefined) ?? target.text;
      if (!candidate) {
        return false;
      }
      return observation.availableTargets.some((item) => item.includes(candidate)) || observation.visibleTexts.includes(candidate);
    }
    case "text-visible":
      return assertion.value ? observation.visibleTexts.includes(assertion.value) : false;
    case "url-contains":
      return assertion.value ? observation.url.includes(assertion.value) : false;
    default:
      return false;
  }
}

function describeAssertion(assertion: StartAssertion | { type: AssertType; target?: Target; value?: string }): string {
  if (assertion.value) {
    return `${assertion.type}(${assertion.value})`;
  }

  if (assertion.target?.selector) {
    return `${assertion.type}(${assertion.target.selector})`;
  }

  if (assertion.target?.role && assertion.target?.name) {
    return `${assertion.type}(${assertion.target.role}:${assertion.target.name})`;
  }

  if (assertion.target?.text) {
    return `${assertion.type}(${assertion.target.text})`;
  }

  return assertion.type;
}

function createMockCollectionData(
  type: CollectionPayload["requested"][number],
  payload: CollectionPayload,
  activeConversation: string,
  context: BrowserCollectContext,
) {
  const now = new Date().toISOString();

  if (type === "trace") {
    return {
      collectedAt: now,
      runId: payload.runId,
      category: payload.category,
      phase: context.phase,
      lcp: payload.category === "loading" ? 2850 : undefined,
      inp: payload.category === "interaction" ? 264 : undefined,
      longTaskMs: payload.category === "interaction" && context.phase === "after" ? 486 : 0,
      mainThreadBusyMs: payload.category === "interaction" && context.phase === "after" ? 540 : 320,
      scriptMs: payload.category === "interaction" && context.phase === "after" ? 321 : 120,
      activeConversation,
    };
  }

  if (type === "heap") {
    return {
      collectedAt: now,
      runId: payload.runId,
      category: payload.category,
      phase: context.phase,
      heapUsedMb: context.phase === "after" && activeConversation === "会话B" ? 148 : 132,
      detachedDomNodes: context.phase === "after" && activeConversation === "会话B" ? 18 : 7,
      suspiciousRetainers: ["ChatMessageList", "SessionCache"],
    };
  }

  if (type === "network") {
    return {
      collectedAt: now,
      runId: payload.runId,
      category: payload.category,
      phase: context.phase,
      requests: [
        { url: "/api/chat/list", durationMs: 210, status: 200 },
        { url: "/api/chat/session", durationMs: 380, status: 200 },
      ],
      blockingResources: ["/static/chat-app.js"],
    };
  }

  if (type === "console") {
    return {
      collectedAt: now,
      runId: payload.runId,
      category: payload.category,
      phase: context.phase,
      messages: [
        { level: "warning", text: "Large synchronous update detected in switchSession" },
        { level: "info", text: `Active conversation: ${activeConversation}` },
      ],
    };
  }

  return {
    collectedAt: now,
    runId: payload.runId,
    category: payload.category,
    phase: context.phase,
    note: `Mock artifact for ${type}`,
  };
}

function buildMcpArgs(options: McpChromeFactoryOptions): string[] {
  const args: string[] = [
    "-y",
    "chrome-devtools-mcp@1.7.0",
    "--no-usage-statistics",
    "--no-performance-crux",
    "--allow-unrestricted-paths",
    "--memory-debugging",
    "--screenshot-format=jpeg",
    "--screenshot-quality=60",
    "--screenshot-max-width=1600",
    "--screenshot-max-height=1200",
  ];

  if (options.headless ?? true) {
    args.push("--headless");
  }
  if (options.isolated ?? true) {
    args.push("--isolated");
  }
  if (options.executablePath) {
    args.push(`--executable-path=${options.executablePath}`);
  }
  if (options.browserUrl) {
    args.push(`--browser-url=${options.browserUrl}`);
  }
  if (options.autoConnect) {
    args.push("--auto-connect");
  }
  if (options.args) {
    args.push(...options.args);
  }

  return args;
}

function stringifyToolOutput(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function parseObservation(snapshotRaw: string, fallbackUrl: string): BrowserObservation {
  const nodes = parseSnapshotNodes(snapshotRaw);
  const rootLine = snapshotRaw.split("\n").find((line) => line.includes("RootWebArea")) ?? "";
  const titleMatch = rootLine.match(/RootWebArea \"([^\"]+)\"/);
  const urlMatch = rootLine.match(/url=\"([^\"]+)\"/);

  return {
    url: urlMatch?.[1] ?? fallbackUrl,
    title: titleMatch?.[1] ?? "",
    visibleTexts: Array.from(new Set(nodes.map((node) => node.name).filter(Boolean))),
    availableTargets: nodes.map((node) => `${node.role}:${node.name}`),
  };
}

function parseSnapshotNodes(snapshotRaw: string): Array<{ uid: string; role: string; name: string }> {
  return snapshotRaw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("uid="))
    .map((line) => {
      const withoutUid = line.replace(/^uid=[^ ]+\s+/, "");
      const uidMatch = line.match(/^uid=([^ ]+)/);
      const nameMatch = withoutUid.match(/\"([^\"]*)\"/);
      const role = withoutUid.split("\"")[0]?.trim() ?? "";
      const uid = uidMatch?.[1];
      if (!uid) {
        return null;
      }
      return {
        uid,
        role,
        name: nameMatch?.[1] ?? "",
      };
    })
    .filter((value): value is { uid: string; role: string; name: string } => Boolean(value));
}

function findSnapshotNode(
  nodes: Array<{ uid: string; role: string; name: string }>,
  target: Target,
): { uid: string; role: string; name: string } | undefined {
  if (target.selector) {
    return undefined;
  }

  if (target.role && target.name) {
    const expectedRole = normalizeRole(target.role);
    const expectedName = target.name;
    return nodes.find((node) => normalizeRole(node.role) === expectedRole && node.name.trim() === expectedName.trim());
  }

  if (target.text) {
    return nodes.find((node) => node.name.includes(target.text ?? ""));
  }

  return undefined;
}

function normalizeRole(role: string): string {
  return role.replace(/\s+/g, "").toLowerCase();
}

function describeTarget(target: Target): string {
  if (target.selector) {
    return `selector=${target.selector}`;
  }
  if (target.role && target.name) {
    return `role=${target.role}, name=${target.name}`;
  }
  if (target.text) {
    return `text=${target.text}`;
  }
  return "unknown-target";
}

function extractSelectedPageId(output: unknown): number | undefined {
  const text = stringifyToolOutput(output);
  const selectedLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.includes("[selected]"));
  const match = selectedLine?.match(/^(\d+):/);
  return match ? Number(match[1]) : undefined;
}

function toolSupportsPageId(name: string): boolean {
  return [
    "click",
    "close_page",
    "navigate_page",
    "press_key",
    "resize_page",
    "select_page",
    "wait_for",
  ].includes(name);
}
