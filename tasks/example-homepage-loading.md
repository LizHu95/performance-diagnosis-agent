# Diagnosis Task

目标：分析示例站点首页的加载性能，验证 Chrome DevTools MCP 模式下的真实诊断链路。

## Notes
- 该任务适合 `--mode mcp`
- 聚焦首页加载链路，不依赖登录态

## Config
```yaml
url: https://example.com
runs: 1

environment:
  device: desktop
  network: no-throttling
  cpuSlowdown: 1

analysis:
  categories:
    - loading

startAssertions:
  - type: text-visible
    value: Example Domain

scenario:
  name: homepage-load
  steps:
    - action: wait
      timeout: 1000

    - action: assert
      type: text-visible
      value: Example Domain
```
