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
