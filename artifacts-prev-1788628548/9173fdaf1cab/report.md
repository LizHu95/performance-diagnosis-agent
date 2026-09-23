# 性能诊断报告

- 状态：SUCCESS
- 任务：switch-session
- URL：https://example.com/chat
- 生成时间：2026-09-05T17:14:34.030Z
- 综合置信度：0.86

## 总结
- Confirmed 交互问题：交互卡顿
- Confirmed 交互问题：交互卡顿
- Confirmed 内存问题：内存持续增长风险
- Confirmed 内存问题：内存持续增长风险

## 交互：交互卡顿
- 等级：Confirmed
- 置信度：0.91
- 结论：切换会话后主线程出现明显阻塞，交互响应存在卡顿风险。

### 证据
- 交互后出现 486ms Long Task，说明主线程存在明显阻塞。
- artifact：/Users/bytedance/Documents/privacy/code/performance-diagnosis/artifacts/9173fdaf1cab/run-01/run-01-interaction-trace.json
- 脚本执行耗时 321ms，说明同步 JavaScript 很可能是阻塞来源。
- artifact：/Users/bytedance/Documents/privacy/code/performance-diagnosis/artifacts/9173fdaf1cab/run-01/run-01-interaction-trace.json

### 下一步建议
- 优先检查切换会话路径上的同步数据处理逻辑。
- 拆分大计算任务，避免在单次交互中集中完成。
- 结合 console 提示进一步定位具体阻塞路径。

## 交互：交互卡顿
- 等级：Confirmed
- 置信度：0.91
- 结论：切换会话后主线程出现明显阻塞，交互响应存在卡顿风险。

### 证据
- 交互后出现 486ms Long Task，说明主线程存在明显阻塞。
- artifact：/Users/bytedance/Documents/privacy/code/performance-diagnosis/artifacts/9173fdaf1cab/run-02/run-02-interaction-trace.json
- 脚本执行耗时 321ms，说明同步 JavaScript 很可能是阻塞来源。
- artifact：/Users/bytedance/Documents/privacy/code/performance-diagnosis/artifacts/9173fdaf1cab/run-02/run-02-interaction-trace.json

### 下一步建议
- 优先检查切换会话路径上的同步数据处理逻辑。
- 拆分大计算任务，避免在单次交互中集中完成。
- 结合 console 提示进一步定位具体阻塞路径。

## 内存：内存持续增长风险
- 等级：Confirmed
- 置信度：0.82
- 结论：多轮操作后堆内存和 Detached DOM 指标偏高，存在疑似泄漏风险。

### 证据
- Heap 使用量达到 148MB，存在持续增长风险。
- artifact：/Users/bytedance/Documents/privacy/code/performance-diagnosis/artifacts/9173fdaf1cab/run-01/run-01-memory-heap.json
- Detached DOM 节点数达到 18，存在未释放节点风险。
- artifact：/Users/bytedance/Documents/privacy/code/performance-diagnosis/artifacts/9173fdaf1cab/run-01/run-01-memory-heap.json

### 下一步建议
- 检查会话切换后是否有 DOM 节点、缓存或事件监听未被释放。
- 重点关注消息列表、会话缓存和闭包持有对象的生命周期。

## 内存：内存持续增长风险
- 等级：Confirmed
- 置信度：0.82
- 结论：多轮操作后堆内存和 Detached DOM 指标偏高，存在疑似泄漏风险。

### 证据
- Heap 使用量达到 148MB，存在持续增长风险。
- artifact：/Users/bytedance/Documents/privacy/code/performance-diagnosis/artifacts/9173fdaf1cab/run-02/run-02-memory-heap.json
- Detached DOM 节点数达到 18，存在未释放节点风险。
- artifact：/Users/bytedance/Documents/privacy/code/performance-diagnosis/artifacts/9173fdaf1cab/run-02/run-02-memory-heap.json

### 下一步建议
- 检查会话切换后是否有 DOM 节点、缓存或事件监听未被释放。
- 重点关注消息列表、会话缓存和闭包持有对象的生命周期。

## 限制说明
- 当前结果基于黑盒实验，不保证稳定映射到原始业务源码。
- 第一版以规则分析为主，尚未接入 source-aware 归因链路。

## 建议动作
- 优先检查切换会话路径上的同步数据处理逻辑。
- 拆分大计算任务，避免在单次交互中集中完成。
- 结合 console 提示进一步定位具体阻塞路径。
- 检查会话切换后是否有 DOM 节点、缓存或事件监听未被释放。
- 重点关注消息列表、会话缓存和闭包持有对象的生命周期。
