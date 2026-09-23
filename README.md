# Web Performance Diagnosis Agent

一个基于 TypeScript、LangGraph.js 和可插拔 Chrome 采集层的 Web 黑盒性能诊断 Agent。

当前版本已经打通了从 `task.md` 输入到诊断报告、结构化指标和 artifacts 落盘的主链路：

- CLI 入口
- Markdown + YAML 任务解析
- `DiagnosisTask` schema 校验
- LangGraph 诊断状态图
- 场景执行器
- 交互 / 内存 / 加载分析器
- Markdown 报告与 JSON 指标输出
- 可插拔浏览器适配层

默认运行在 `mock` 模式下，方便先验证整个 agent 的工程链路。后续可在 `src/mcp/` 中接入真实 Chrome DevTools MCP 会话。

## 快速开始

安装依赖：

```bash
npm install
```

运行示例任务：

```bash
npm run diagnose -- --task ./tasks/sample-chat-switch.md
```

构建项目：

```bash
npm run build
```

类型检查：

```bash
npm run check
```

## CLI

```bash
perf-agent diagnose --task ./tasks/sample-chat-switch.md
```

可选参数：

- `--artifacts-dir <path>`：artifacts 输出目录，默认 `./artifacts`
- `--mode <mock|mcp>`：浏览器模式，默认 `mock`

## 目录结构

```text
src/
  cli/                CLI 入口
  graph/              LangGraph 状态图与状态定义
  mcp/                浏览器会话接口与 Chrome 适配层
  scenario/           场景执行器
  analyzers/          规则分析器
  report/             报告与 JSON 输出
  task/               task schema 与 markdown 解析
  utils/              通用工具
tasks/                示例任务
artifacts/            诊断输出
```

## 当前实现范围

当前版本已经支持：

- `DiagnosisTask` 默认字段和自动 collect 推导
- `click`、`input`、`wait`、`scroll`、`press`、`assert` 六类 DSL 动作
- `element-visible`、`element-exists`、`text-visible`、`url-contains` 四类断言
- `SUCCESS`、`PARTIAL_SUCCESS`、`FAILED` 三态结果
- `report.md`、`metrics.json`、`run-summary.json` 和按 run 落盘的 artifacts

当前版本仍然是 MVP：

- 默认 `mock` 采集器用于验证链路，不是最终 Chrome 实采能力
- 规则分析器目前以阈值和 mock 数据为主
- 尚未接入 source-aware 分析或真实 DevTools MCP 工具调用

## 下一步建议

- 在 `src/mcp/` 中增加真实 Chrome DevTools MCP session factory
- 将 `mock` 数据替换为真实 trace / heap / network / console 采样
- 增加 rerun 调整策略与更细粒度的 evidence 聚合
- 补充更多 task 模板和 demo 评测集
