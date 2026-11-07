# 寻光日记

无负担地记录日常，从原文中发现有依据的兴趣、恢复与探索线索。
不要求文采，不把记录数量当成长评分，不强行解释成积极结果。

## 当前状态

- 主应用：根目录代码，默认 http://127.0.0.1:4174/；包含本机 Copilot 桥接。
- 已确定设计：`output/seeking-light/`，默认 http://127.0.0.1:4175/；采用“原文与旁注”。
- 设计体验稿只展示虚构示例 Findings，尚未接入真实模型；不是主应用替换。
- 两个页面的浏览器存储独立，迁移尚未实现。不要直接覆盖或清空旧记录。
- 本机 Copilot 是本地调用入口，不是离线模型，也不是公开多用户服务。

## 开发与验证

需要 Node.js 20 或更新版本；现有应用不需要安装 npm 依赖。

```sh
npm start
npm run start:prototype
npm test
```

两种启动命令分别运行。端口已占用时，以 `PORT` 指定其他端口。
自动测试不调用真实 Copilot；其中接口测试需要允许监听本机测试端口。
真实模型测试另见 `COPILOT.md`，会使用账号额度，默认不运行。
自动检查不能代替真实浏览器、手机和用户试用验收。

## 项目边界

本目录是共享工作区，Git 只追踪 `.gitignore` 白名单中的寻光日记文件。
家庭学习文件、临时输出、截图、用户数据、凭证和日志不进入版本库。
新文件需明确加入白名单；不要为方便使用 `git add -f` 绕过保护。
当前代码已推送到 GitHub 的 xiaocliuAI/seeking-light；没有发布应用。
网页验收任务已建成 issues，尚未启动自动执行 Agent。

## 开发依据

- `output/seeking-light/design-contract.md`：固定设计与体验边界。
- `output/seeking-light/test-report.md`：体验稿测试结果及缺口。
- `product-plan.md`：早期功能规划，视觉和输入方式以最新设计约定为准。
- `COPILOT.md`：本机模型连接与隐私边界。
- `docs/development.md`：下一阶段任务及 Agent team 协作方式。
- `docs/web-test-plan.md`：网页测试前置条件、最短验收路径和 Agent 执行门槛。
