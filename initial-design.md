# 基于 LangGraph.js 与 Chrome DevTools MCP 的线上 Web 黑盒性能诊断 Agent 初步设计方案

## 问题定义

目标是构建一个面向真实线上 Web 页面的黑盒性能诊断 Agent。输入页面 URL、复现步骤和实验配置后，Agent 自动驱动 Chrome 执行场景，采集 Trace、Heap、Network、Console 等运行时证据，对加载慢、交互卡顿和内存增长问题进行分类、取证和解释，并生成可复核的诊断报告。

这个项目的价值不在于“自动打开浏览器”，而在于把浏览器底层观测能力组织成一套可重复、可解释、可扩展的诊断流程：

- 通过自适应实验逐步缩小问题范围。
- 通过运行时证据而非经验猜测给出结论。
- 在黑盒模式下确认问题存在、归类问题类型、缩小排查范围。
- 在具备 Source Map 或源码上下文时升级为更强的 source-aware 分析。

## 产品定位

建议的英文名称：

`Web Performance Diagnosis Agent`

更完整的项目描述：

`A Web black-box performance diagnosis agent built with LangGraph.js and Chrome DevTools MCP, using adaptive experiments, runtime evidence, and heap/trace analysis to help engineers investigate loading, interaction, and memory issues.`

## Goals

- 支持对已授权访问的线上 Web 页面执行黑盒性能诊断。
- 支持输入 URL、场景、运行次数、环境配置并自动执行实验。
- 输出加载、交互、内存三类问题的诊断结论、证据、置信度和下一步建议。
- 保存完整的诊断 artifacts，便于复核、复现和评测。
- 用 LangGraph.js 构建可扩展的诊断状态机，而不是一串一次性脚本。

## Non-Goals

- 第一版不承诺精准定位到原始业务源码。
- 第一版不做自动修改代码或自动提交修复。
- 第一版不做通用 React 全量重渲染诊断平台。
- 第一版不做多 Agent 协作。
- 第一版不做生产环境“全自动万能诊断”。
- 第一版不依赖本地仓库作为必选输入。

## 核心原则

- 黑盒优先：MVP 不要求源码，不把源码定位当作前提。
- 证据优先：结论必须有 Trace、Heap、Network、Console 中的至少一种可复核证据支撑。
- 实验可重复：所有诊断都应以结构化场景输入驱动，可重复执行。
- 状态与执行分离：固定实验逻辑和 Agent 决策逻辑分层设计。
- 结果可落盘：所有中间结果和最终报告都应可保存、可比较。

## System Model

### 用户输入

- 目标页面 URL
- 场景说明与复现步骤
- 诊断重点
- 运行次数
- 网络和 CPU 等实验环境
- 可选的登录说明或预置准备动作

### 系统输出

- Markdown 诊断报告
- 结构化 metrics JSON
- Performance trace 文件
- Heap snapshot 文件
- 网络请求摘要
- 截图与关键时刻状态快照

### 数据语义分层

- Raw data
  - Chrome DevTools MCP 返回的原始 trace insight、heap diff、request、console message
- Derived metrics
  - Long Task 时长、Heap 基线变化、Detached DOM 数量、LCP/INP/CLS 等指标
- Evidence
  - 用于支撑结论的结构化证据条目，例如“切换会话后出现 486ms Long Task”
- Findings
  - 对问题类型的归类与解释，例如“高置信度交互卡顿”
- Report
  - 面向工程师阅读的最终输出
- Control data
  - 运行配置、环境配置、feature flags、重试次数、置信度阈值

## 用户工作流

### CLI 启动

第一版建议采用 CLI 作为主入口：

```bash
perf-agent diagnose \
  --task ./tasks/chat-switch.md
```

CLI 内部流程：

1. 读取 `task.md`
2. 提取其中的 YAML 配置块
3. 使用 `zod` 做 schema 校验
4. 转为内部 `DiagnosisTask`
5. 构建 LangGraph 执行图
6. 调用 Chrome DevTools MCP 执行实验
7. 输出报告与 artifacts

### 输入模板建议

建议采用“Markdown 外壳 + YAML 配置块”的混合输入方式，兼顾可读性与可解析性。

示例：

````md
# Diagnosis Task

目标：分析聊天页切换会话时的卡顿和内存增长问题。

## Notes
- 需要先登录
- 优先关注交互卡顿，其次关注内存

## Config
```yaml
url: https://example.com/chat
runs: 10
mode: auto

environment:
  device: desktop
  network: fast-4g
  cpuSlowdown: 4

analysis:
  categories:
    - interaction
    - memory
  collect:
    - trace
    - heap
    - network
    - console

scenario:
  name: switch-session
  steps:
    - action: click
      target: 会话A
    - action: wait
      timeout: 1000
    - action: click
      target: 会话B
    - action: wait
      timeout: 1000
```
````

## 技术选型

建议技术栈：

- TypeScript
- LangGraph.js
- `@langchain/mcp-adapters`
- Chrome DevTools MCP
- Commander.js
- Zod
- Markdown 报告生成

选择 `TypeScript + LangGraph.js` 的原因：

- 与浏览器、CDP、前端构建产物、Source Map 生态更贴近。
- 更适合和 Chrome DevTools MCP 直接集成。
- 后续若增加源码分析、前端工程联动或可视化页面，整体链路更统一。

## 总体架构

```text
CLI / Task Loader
        |
        v
Task Parser + Zod Validation
        |
        v
LangGraph Diagnosis Graph
        |
        +--> Scenario Runner
        |
        +--> Chrome MCP Tool Layer
        |       |
        |       +--> Performance Trace
        |       +--> Heap Snapshot
        |       +--> Network
        |       +--> Console
        |
        +--> Analyzer Layer
        |       |
        |       +--> Loading Analyzer
        |       +--> Interaction Analyzer
        |       +--> Memory Analyzer
        |       +--> Confidence Evaluator
        |
        +--> Artifact Store
        |
        +--> Report Generator
```

## LangGraph 设计

### 核心思路

不要让模型自由决定所有浏览器行为，也不要让模型自己做复杂数值计算。推荐采用“两层架构”：

- 固定实验层
  - 负责执行步骤、采集数据、保存 artifacts、保证实验可重复。
- Agent 决策层
  - 负责分类问题、决定下一步分析、判断证据是否充分、生成结论和建议。

### 建议的图结构

```text
prepare_page
  ↓
run_baseline
  ↓
classify_problem
  ├── analyze_loading
  ├── analyze_interaction
  ├── analyze_memory
  └── analyze_network
          ↓
evaluate_evidence
  ├── evidence_enough -> generate_report
  └── evidence_weak   -> rerun_with_adjustment -> evaluate_evidence
```

### DiagnosisState 草案

```ts
type DiagnosisState = {
  task: DiagnosisTask;

  metrics: Metric[];
  performanceFindings: PerformanceFinding[];
  memoryFindings: MemoryFinding[];
  networkFindings: NetworkFinding[];
  evidence: Evidence[];

  suspectedCategories: Array<"loading" | "interaction" | "memory" | "network">;
  confidence: number;
  nextAction?: string;

  artifacts: {
    traceFiles: string[];
    heapFiles: string[];
    screenshots: string[];
    metricsFile?: string;
  };

  runHistory: RunSummary[];
  report?: DiagnosisReport;
};
```

## 诊断流程设计

### 1. Prepare Page

- 初始化 Chrome 会话
- 打开目标页面
- 根据任务执行必要准备动作
- 确认页面处于可执行场景的起始状态

### 2. Run Baseline

- 记录首轮基础指标
- 可选预热 1 次
- 建立页面加载、交互、内存的基线

### 3. Classify Problem

根据用户目标和 baseline 初筛结果，决定优先分析方向：

- 加载慢
- 交互卡顿
- 内存增长
- 网络异常

### 4. Analyze Loading

主要关注：

- LCP
- INP
- CLS
- TTFB
- 阻塞资源
- 主线程繁忙区间
- 大资源与第三方资源影响

### 5. Analyze Interaction

主要关注：

- Long Task 数量和时长
- Script / Style / Layout / Paint 各阶段耗时
- 是否存在同步计算热点
- 是否有交互后明显的主线程阻塞

### 6. Analyze Memory

主要关注：

- Heap 基线是否持续上升
- Heap Snapshot 对比后的增长对象
- Detached DOM 是否增加
- Retainers 与 Retaining Path
- 是否存在 Event Handler、Context、Array、Closure 异常保留

### 7. Evaluate Evidence

根据证据充分性决定是否继续实验：

- 如果证据足够，直接生成报告
- 如果证据不足，增加轮次或调整实验条件后再跑一轮

### 8. Generate Report

输出人类可读报告和结构化指标：

- 问题摘要
- 证据列表
- 置信度
- 限制说明
- 下一步排查建议

## 证据模型

建议把结论分为三级，而不是所有问题都直接称为“泄漏”或“根因”。

### 结论等级

- Confirmed
  - 同时具备运行时证据和较强的归因证据
- Suspected
  - 存在明显异常，但归因链尚不完整
- Risk
  - 发现危险模式或边缘异常，但尚未稳定复现

### Evidence 结构建议

```ts
type Evidence = {
  id: string;
  category: "loading" | "interaction" | "memory" | "network";
  severity: "high" | "medium" | "low";
  summary: string;
  source: "trace" | "heap" | "network" | "console" | "derived";
  value?: number | string;
  artifactRefs?: string[];
};
```

## 报告格式建议

建议输出 `reports/diagnosis.md`，结构如下：

```md
# 性能诊断报告

## 总结
- 发现 1 个高置信度交互卡顿问题
- 发现 1 个疑似内存增长问题

## 问题一：交互卡顿
- 等级：Confirmed
- 触发操作：切换会话
- 结论：主线程出现明显同步阻塞

### 运行时证据
- 切换会话后出现 486ms Long Task
- Script Evaluation 占用 321ms
- Recalculate Style 占用 82ms

### 判断
- 主要瓶颈为 JavaScript 同步执行，同时伴随样式计算开销

### 下一步建议
- 关注切换会话路径上的数据处理与 DOM 更新

## 问题二：内存增长
- 等级：Suspected
- 结论：该场景下存在持续内存增长

### 运行时证据
- 10 轮执行后 Heap 基线持续上升
- Detached DOM 节点数量增加

### 限制
- 当前为黑盒模式，无法稳定映射到原始组件文件
```

## 目录设计建议

```text
performance-diagnosis/
├── src/
│   ├── cli/
│   │   └── diagnose.ts
│   ├── graph/
│   │   ├── state.ts
│   │   ├── builder.ts
│   │   └── nodes/
│   │       ├── prepare-page.ts
│   │       ├── run-baseline.ts
│   │       ├── classify-problem.ts
│   │       ├── analyze-loading.ts
│   │       ├── analyze-interaction.ts
│   │       ├── analyze-memory.ts
│   │       ├── evaluate-evidence.ts
│   │       └── generate-report.ts
│   ├── mcp/
│   │   ├── chrome-client.ts
│   │   └── tools.ts
│   ├── scenario/
│   │   ├── schema.ts
│   │   ├── runner.ts
│   │   └── actions.ts
│   ├── analyzers/
│   │   ├── loading.ts
│   │   ├── interaction.ts
│   │   ├── memory.ts
│   │   └── confidence.ts
│   ├── evidence/
│   │   ├── types.ts
│   │   ├── collector.ts
│   │   └── artifacts.ts
│   ├── report/
│   │   ├── markdown.ts
│   │   └── json.ts
│   ├── task/
│   │   ├── schema.ts
│   │   └── parse-task-md.ts
│   └── utils/
├── tasks/
├── reports/
└── package.json
```

## MVP 范围

### 第一版必须跑通

- 读取 `task.md`
- 解析结构化配置
- 打开页面并执行场景
- 录制和分析加载/交互 trace
- 支持 before/after Heap Snapshot 对比
- 输出 Markdown 报告和 artifacts

### 第一版建议优先支持的问题

- 加载慢
- Long Task 导致的交互卡顿
- Detached DOM 和对象持续增长
- 事件监听或缓存持有导致的疑似内存泄漏

### 第一版暂不支持

- 自动定位所有 React 重渲染
- 自动修改代码
- 自动提交 patch
- 多页面联合诊断
- 多 Agent 协作

## 指标与评测

### Success Metrics

- 可以稳定完成 1 个完整诊断任务
- 输出报告中包含可复核的证据引用
- 对典型问题能够正确分类

### Guardrail Metrics

- 实验失败率
- 页面操作失败率
- artifacts 丢失率
- 报告中“无证据结论”比例

### MVP 评测建议

建议自建 demo 站点，至少准备两类问题：

- 人为制造交互 Long Task
- 人为制造 Detached DOM 或事件监听泄漏

每类问题至少准备：

- 有问题版本
- 修复后版本

用于验证：

- Agent 能否发现问题
- Agent 修复后复测时是否能识别改善

## 风险与边界

- 黑盒模式下无法稳定映射到原始源码，这是能力边界，不应过度承诺。
- Heap 分析成本较高，需要控制快照时机与执行轮次。
- 若页面强依赖登录态、验证码或复杂权限流，自动化稳定性会下降。
- 大量实验可能对线上服务造成额外压力，需要限制默认运行次数。
- 报告中应避免泄露 Cookie、Token、用户隐私或业务敏感数据。

## 推荐决策

为了让 MVP 尽快从“方向正确”进入“可以开工”，建议先采用以下默认决策。

### DiagnosisTask 默认定义

- 第一版 `DiagnosisTask` 的必填字段建议为：`url`、`scenario.name`、`scenario.steps`、`analysis.categories`。
- 第一版 `DiagnosisTask` 的选填字段建议为：`runs`、`environment.device`、`environment.network`、`environment.cpuSlowdown`、`analysis.collect`、`prepare`、`startAssertions`、`notes`。
- 建议默认值为：`runs: 2`、`environment.device: desktop`、`environment.network: no-throttling`、`environment.cpuSlowdown: 1`。
- `analysis.collect` 不建议完全由用户手动维护，默认应按分析类别自动推导。
- 若启用 `memory` 分析，则 `runs` 至少应为 `2`，不足时直接报配置不满足要求。

### MVP 目标收敛

- 第一版只聚焦 `loading`、`interaction`、`memory` 三类问题。
- `network` 不作为独立问题类型，而是作为 supporting evidence 服务于前三类诊断。
- MVP 成功标准定义为：给定一个可访问页面和一份合法任务后，Agent 能完成场景执行并输出一份包含至少 1 条可复核 evidence 引用的诊断报告。
- 第一版不要求“必须发现问题”，重点是稳定完成黑盒诊断链路。

### 用户输入与执行边界

- 默认复用用户当前浏览器会话，不在任务文件中存储账号密码。
- 若遇到验证码、登录失效或复杂权限流，Agent 暂停并提示用户手动处理后继续。
- 第一版场景 DSL 只支持少量稳定动作：`click`、`input`、`wait`、`scroll`、`press`、`assert`。
- `target` 应采用结构化对象表示，第一版只支持三种定位方式：`selector`、`role/name`、`text`。
- 当同一个步骤同时提供多种定位方式时，固定优先级为：`selector > role/name > text`。
- `assert` 第一版只支持四类检查：`element-visible`、`element-exists`、`text-visible`、`url-contains`。
- `assert` 失败时默认中止当前任务，并在最终报告中记录失败断言与上下文。
- `target` 优先要求用户提供稳定文本、role/name 或明确选择器，暂不把自然语言元素理解作为 MVP 能力。

### 实验与 rerun 策略

- 默认最大执行轮次为 `3`。
- 第 1 轮用于建立基础观测结果，第 2 轮用于复现重点问题，第 3 轮仅在证据波动较大或证据不足时触发。
- 不允许模型自由决定无限加轮次，所有 rerun 必须受显式上限控制。
- `run_baseline` 在实现上应按分析类别拆分实验模板，而不是强行共用一套采样逻辑。

### 输出与脱敏策略

- artifacts 建议采用 `artifacts/<task-id>/<run-id>/` 目录结构，每次诊断单独存放，不覆盖旧结果。
- 第一版固定产出 `report.md`、`metrics.json`、`run-summary.json` 和关键步骤截图。
- `trace` 仅在 `loading` 或 `interaction` 分析启用时采集。
- `heap snapshot` 仅在 `memory` 分析启用时采集。
- 默认不落盘 Cookie、Authorization、Token 等敏感请求头，不保存完整 response body，只保留必要的网络摘要。
- 报告正文中不直接回显敏感标识符、用户隐私数据或业务密钥信息。

### 判定与分级规则

- `loading` 只关注 `TTFB`、`LCP`、`CLS`、关键资源阻塞和首屏主线程繁忙区间。
- `interaction` 只关注交互后的 `INP`、Long Task、主线程阻塞和脚本/样式/布局耗时分布。
- `memory` 第一版统一表述为“持续增长”或“疑似泄漏风险”，避免在证据不足时直接宣称“内存泄漏”。
- `memory` 主要关注多轮后 Heap 基线变化、before/after snapshot 差异、Detached DOM 和可疑 retainers。
- `network` 只作为 supporting evidence 出现，不单独形成诊断类别。
- `Confirmed` 表示异常可稳定复现，且至少有两类证据互相支撑。
- `Suspected` 表示异常明显，但证据链尚不完整或复现稳定性不足。
- `Risk` 表示发现了边缘异常或危险模式，但当前样本量不足。
- `confidence` 应优先采用规则化评分，综合复现次数、证据种类、波动大小和阈值命中情况计算，而不是直接由模型主观给分。

### Evidence 与运行结果结构

- `Evidence` 结构建议至少包含：`id`、`runId`、`stepId`、`category`、`severity`、`source`、`summary`、`value`、`thresholdRef`、`artifactRefs`、`timestamp`。
- `RunSummary` 建议至少记录：执行轮次、开始时间、结束时间、成功或失败状态、触发的步骤、采集到的 artifact 列表和主要异常。
- 这样可以保证后续的复核、评测、结果对比和报告引用有稳定主键与上下文。

### 部分失败与降级策略

- 第一版建议把任务结果分为：`SUCCESS`、`PARTIAL_SUCCESS`、`FAILED`。
- `SUCCESS` 表示场景执行成功，且最终至少产出 1 条可复核 evidence。
- `PARTIAL_SUCCESS` 表示场景执行成功，但部分采集或分析失败，仍然能够输出带限制说明的报告。
- `FAILED` 表示页面打不开、起始断言失败或核心场景无法执行，无法形成有效诊断。
- CLI exit code 建议为：`0` 表示 `SUCCESS` 或 `PARTIAL_SUCCESS`，`1` 表示 `FAILED`，`2` 表示任务文件非法或参数错误。

### 实施优先级建议

- 第一优先级是打通 `task parser -> scenario runner -> report` 的最小链路，证明任务输入可以稳定驱动页面。
- 第二优先级是优先完成 `interaction` 分析链路，因为它最适合展示黑盒诊断能力。
- 第三优先级是补齐基础 `loading` 指标分析。
- 第四优先级再引入 `heap snapshot` 对比与内存证据模型，因为这部分成本更高、稳定性更差。

## 推荐实施顺序

### Phase 1

- 搭建 CLI
- 设计 `task.md` 模板
- 解析 YAML 配置块

### Phase 2

- 接入 Chrome DevTools MCP
- 打通页面打开、场景执行、trace 采集

### Phase 3

- 增加交互卡顿分析
- 增加加载性能分析

### Phase 4

- 增加 Heap Snapshot 对比
- 增加内存证据模型

### Phase 5

- 增加自适应 rerun
- 增加置信度评估
- 完善报告模板

## 结论

这个项目最合理的 MVP 形态是一个以 CLI 启动、以 Markdown 任务模板作为输入、以 LangGraph.js 作为诊断状态机、以 Chrome DevTools MCP 作为运行时观测底座的黑盒 Web 性能诊断 Agent。

第一版的关键不在于“找到所有根因”，而在于建立一条可信的工程链路：

- 结构化输入
- 可重复实验
- 运行时取证
- 问题分类
- 证据评估
- 报告输出

只要这条链路打通，这个项目就已经具备很强的展示价值和继续演进的基础。

## DiagnosisTask YAML 示例

下面给出一版更贴近第一版实现约束的任务示例：

````md
# Diagnosis Task

目标：分析聊天页切换会话后的交互卡顿与内存增长情况。

## Notes
- 默认复用当前浏览器登录态
- 优先关注切换会话后的响应延迟

## Config
```yaml
url: https://example.com/chat
runs: 2

environment:
  device: desktop
  network: no-throttling
  cpuSlowdown: 1

analysis:
  categories:
    - interaction
    - memory

startAssertions:
  - type: element-visible
    target:
      role: button
      name: 新建会话

scenario:
  name: switch-session
  steps:
    - action: click
      target:
        text: 会话A

    - action: wait
      timeout: 1000

    - action: assert
      type: text-visible
      value: 会话A

    - action: click
      target:
        text: 会话B

    - action: wait
      timeout: 1000

    - action: assert
      type: text-visible
      value: 会话B
```
````
