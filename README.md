> **Languages:** 中文 · [English](README.en.md)

<div align="center">

<img src="icon.svg" width="76" alt="DSH Think Expand">

# DSH Think Expand

### 让过程在产生的那一刻就摊开

![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)![DSH 适配](https://img.shields.io/badge/DSH-0.2.2--rc.3%20%E5%B7%B2%E9%AA%8C%E8%AF%81-4E9BF1)![Platform](https://img.shields.io/badge/Platform-Web-8b7cf6)![Version](https://img.shields.io/badge/Version-1.4.0-2f9e6e)![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

**思考 · 工具 · 命令 · 上下文注入 —— 运行中展开，结束后折叠**

> **当前版本 `1.4.0`** · 已在 **DSH `0.2.2-rc.3`** 的 Web 界面上验证可用。
> 不接管渲染，只驱动上游自己的展开控件——所以升级 DSH 后通常无需改插件。

</div>

DSH 默认把过程行收成一行摘要，运行中你也只能看到「正在思考…」。这个插件让过程在产生的那一刻就摊开在你眼前，跑完再收回去——像看一个人真的在干活，而不是等一份结论。

![暗色主题下的过程块](docs/screenshots/transcript-dark.png)

![浅色主题下的过程块](docs/screenshots/transcript-light.png)

## ✨ 特性

- **🧠 运行中展开，结束后折叠** — 过程行进入 `running` 就打开，落到 `ok` / `error` / `stopped` 就收起。你手动展开过的行不会被自动折叠。
- **🎛️ 四档全局折叠规则** — 运行时展开 / 全部展开 / 全部折叠 / 不干预。
- **🧩 每块单独覆盖** — 全局选「全部展开」，也可以只让思考块展开、工具块保持折叠。每块五档：跟随全局 / 展开 / 折叠 / 运行时 / 不干预。
- **🌗 暗色与浅色两套配色** — 界面切主题时自动套用对应的一套；也可以锁定只用其中一套。两套各自存颜色、底色浓度、字号、字体。
- **🎨 十二类块可分别配色** — 思考、工具、命令卡、上下文注入、压缩标记、过程组、轮次尾部、用户气泡、运行状态、队列、待办、引导消息。
- **📐 样式参数可调** — 左侧色条宽度、圆角、上下/右/左内边距、运行态底色浓度、字号、字体族。
- **⚡ 改动立即生效** — 配置存在浏览器 `localStorage`，不用重启 Host，不用重装插件。
- **🔍 内置诊断** — 设置页底部实时显示插件在页面上实际看到的行数、可展开数、已展开数，出问题时不用猜。

![设置页](docs/screenshots/settings.png)

## 📦 安装

插件以 DSH bundle 的形式发布，需要 DSH 的 Web 界面（`dsh.client.platform` 为 `web`）。

### 用 plugin_manager 安装

```text
plugin_manager install_bundle target=<本仓库的绝对路径>
```

安装后 profile 的 `package.json` 会多一条 `link:` 依赖，`dsh.profile.bundles` 末尾追加本插件。

### 手动安装

1. 把仓库放到任意目录，例如 `~/dsh-plugins/dsh-think-expand`。
2. 在 profile 的 `package.json` 里加依赖：

   ```json
   {
     "dependencies": {
       "@local/dsh-think-expand": "link:~/dsh-plugins/dsh-think-expand"
     }
   }
   ```

3. 在 `dsh.profile.bundles` 末尾追加 `"@local/dsh-think-expand"`。
4. 重启 DSH。

### 重载

改完 `client.js` 后，浏览器端模块不会自动热更新（除非同时跑着 `pnpm run dev:web`）。重载方式：

```text
plugin_manager set_plugin target=include:dsh-think-expand enabled=false
plugin_manager set_plugin target=include:dsh-think-expand enabled=true
```

然后**刷新页面**。

## 🖱️ 使用

打开 设置 → **过程块样式**。

| 区块 | 内容 |
| --- | --- |
| 配色方案 | 跟随界面 / 暗色 / 浅色。决定下面编辑的是哪一套色板 |
| 折叠规则 | 全局四档，常驻显示 |
| 过程块 | 思考、工具、命令卡、上下文注入、压缩标记、过程组 |
| 其他块 | 轮次尾部、用户气泡、运行状态、队列、待办、引导消息 |
| 通用 | 字体族、运行态浓度、色条宽度、圆角、三向内边距 |
| 预览 | 当前色板下所有启用块的实际效果 |
| 诊断 | 实时行数统计与插件版本 |

每个块卡片上有：色点与十六进制值、启用开关、展开策略胶囊、颜色选择器、底色浓度滑块、字号。

## ⚙️ 配置结构

`localStorage` 键：`dsh-think-expand:config`

```jsonc
{
  "foldMode": "auto",          // auto | expand | collapse | off
  "schemeMode": "auto",        // auto | dark | light
  "modes": {                   // 每块覆盖，inherit 表示跟随 foldMode
    "think": "inherit",
    "tool": "auto"
  },
  "schemes": {
    "dark": {
      "common": { "liveBg": 13, "barWidth": 3, "radius": 8, "padBlock": 7, "padInline": 12, "padLeft": 14, "fontFamily": "" },
      "blocks": { "think": { "color": "#8b7cf6", "bg": 7, "on": true, "fontSize": 0 } }
    },
    "light": { "common": {}, "blocks": {} }
  }
}
```

旧版单套配置会在读取时自动迁移：顶层 `common` / `blocks` 复制进两套，`blocks[key].fold` 迁移成顶层 `modes[key]`。

## 🔬 工作原理

DSH 的 Chat 与 Tool 包自己持有展开状态，并且明确不对外暴露「默认展开」的设置项（`dsh-client-ui-chat/README.zh.md`：「扩展不替换思考预览或展开策略。」）。所以这个插件不接管渲染，而是**观察已经渲染出来的行，点击它们自己的展开控件**。

它依赖的 DOM 契约（来自上游源码）：

| 选择器 | 来源 | 含义 |
| --- | --- | --- |
| `[data-variant="think"]` + `data-state` | `ReasoningRow.tsx` | 思考行，`running` / `ok` |
| `[data-tool]` + `data-state` | `ToolRow.tsx` | 工具行，`preparing` / `running` / `ok` / `error` / `stopped` |
| `[data-disclosure-header]` 父节点的 `data-open` | `DisclosureRow` | 展开状态，**唯一不依赖 `expandable` 的信号** |
| `[data-disclosure-row][aria-expanded]` | `DisclosureRow` | 展开控件，`expandable` 为假时整个属性不存在 |
| `[data-context-injection-body]` | `ContextInjectionRow.tsx` | 上下文注入正文 |
| `[data-compaction-disclosure]` | `CompactionItem.tsx` | 压缩标记 |
| `[data-turn-process]` | `TurnProcessNodeView.tsx` | 过程组节点 |

驱动逻辑有三条硬约束，都是踩过的坑：

1. **每 `(行, data-state, 意图)` 只点一次。** 展开控件的 `open` 是 `expanded && expandable`，行还不能展开时点完仍然报告「关闭」；如果校验失败就重试，第二次点击会把刚置位的 `expanded` 点回去，来回抖动。
2. **找不到控件时不记录「已处理」。** 工具行在 `preparing` 阶段 `expandable` 为假，`aria-expanded`、`role="button"`、`onClick` 全都不存在。此时放弃并等下一帧，等行自己长到 `running` 再点。
3. **展开后补滚到底。** 在尾部上方展开一行会让内容变高，浏览器的 scroll anchoring 把视口顶离底部，DSH 的 `ScrollFollow` 会把这当成「读者自己滚了」而停止跟随。插件在点击后 60 / 220 / 520ms 三个时间点把 `scrollTop` 拉回底部，一旦收到 `wheel` / `touchmove` 立刻取消。

## ⚠️ 已知限制

- 只支持 Web 界面；桌面端与 TUI 不走这条渲染路径。
- 依赖上表的 DOM 属性。上游改属性名会让插件失效——诊断卡片会显示「工具行 > 0 但工具可展开 = 0」这类信号。
- 无法让「上游认为不可展开」的行展开。例如 `read-family-row.tsx` 直接传 `bodyRaw={null}`，这类行只有卡片内容，没有原始参数。
- 配置存在浏览器本地，换浏览器或清站点数据会回到默认值。

## 🛠️ 开发

```bash
# 重新生成 README 截图（需要 Pillow 与 Windows 中文字体）
python docs/make-shots.py
```

`client.js` 是浏览器端模块，通过 `window.__ModuleLoader__.load({ id, factory })` 注册；`index.js` 是 Host 端入口，本插件不需要 Host 侧逻辑，`apply()` 为空。

## 📄 协议

[MIT](LICENSE) © 2026 cstcood

DeepSeek Harness 为 DeepSeek 官方开源项目（MIT），本插件与之无隶属关系。
