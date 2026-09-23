# Diagnosis Task

目标：复现橙蕉任务列表从列表页进入详情页再关闭详情返回列表后的内存变化，重点关注页面切换前后堆内存是否持续抬升。

## Notes
- 该任务默认用于 `--mode mcp`
- 组内轮次复用同一个任务列表页，不重新开新列表页
- 只关闭新打开的任务详情标签，不使用 `history.back()`，也不使用浏览器后退按钮
- 固定筛选条件为：业务线=商家成长，运营人员=cuiwei.1026@bytedance.com，计划=全部计划

## Config
```yaml
url: https://ecop.bytedance.net/growthPlatform/taskListV2?cjSiteCode=St12512160000001
runs: 2

environment:
  device: desktop
  network: no-throttling
  cpuSlowdown: 1

analysis:
  categories:
    - memory
    - interaction

startAssertions:
  - type: url-contains
    value: taskListV2

scenario:
  name: orange-tasklist-memory-loop
  steps:
    - action: wait
      timeout: 3000

    - action: click
      target:
        role: button
        name: 业务线

    - action: click
      target:
        text: 商家成长

    - action: click
      target:
        role: button
        name: 运营人员

    - action: click
      target:
        text: cuiwei.1026@bytedance.com

    - action: click
      target:
        role: button
        name: 计划

    - action: click
      target:
        text: 全部计划

    - action: wait
      timeout: 5000

    - action: assert
      type: text-visible
      value: 详情

    - action: collect
      label: list-before-detail
      types:
        - heap
        - screenshot

    - action: click
      target:
        text: 详情

    - action: wait
      timeout: 5000

    - action: assert
      type: text-visible
      value: 任务详情

    - action: wait
      timeout: 5000

    - action: collect
      label: detail-opened
      types:
        - heap
        - screenshot

    - action: click
      target:
        text: 关闭

    - action: wait
      timeout: 3000

    - action: assert
      type: text-visible
      value: 详情

    - action: collect
      label: list-after-close
      types:
        - heap
        - screenshot
```
