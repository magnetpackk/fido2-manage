# Token2 密钥管理器：Windows 简体中文版

本项目是 [token2/fido2-manage](https://github.com/token2/fido2-manage) 的 Windows 客户端汉化 Fork。
上游基线：`e7b39ee750db539d4f060ca0dbef54504a6ea214`（0.2.2）。

## 下载与使用

在本仓库 Releases 下载 `token2-key-manager-windows-x64-zh-CN.zip`，完整解压后运行
`token2-key-manager.exe`。适用于 Windows 10/11 x64，需要系统 WebView2 运行环境。
保留 exe 同目录的 DLL 文件。此版本未进行发布者代码签名。

汉化覆盖 Windows 图形界面、操作提示和常见错误；命令行、JSON、设备协议不变。
第三方返回的未知诊断信息保留原文，便于排错。Linux 和 macOS 继续使用上游英文资源。
PIN、PUK、重置和删除操作的含义与上游一致，进行真实写入前请阅读确认提示。

## 汉化结构

- `token2-piv-gui/ui/`：上游英文资源，保持原样。
- `locales/zh-CN.json`：英文原文到简体中文的词表，含模板字符串的静态片段。
- `locales/display-zh-CN.json`：后端返回信息的显示翻译，不改返回数据和错误判断。
- `locales/windows-patches.json`：需要上下文才能安全翻译的少量显示位置。
- `locales/upstream-ui.json`：人工审核过的前端 SHA-256 基线，忽略 CRLF/LF 差异。
- `scripts/localize-windows.mjs`：使用 Acorn 解析 JavaScript，生成 `ui-windows/`；生成文件不提交。
- `tauri.windows.conf.json`：只有 Windows 引用生成的中文资源。

## 构建

除上游要求的 Visual Studio C++、CMake、Git 和 Rust MSVC 外，需安装 Node.js 20 或更新版本。
在仓库根目录执行：

```powershell
npm ci --ignore-scripts
npm run localize
npm run check:localization
.\build-all.ps1
```

Windows 的 Rust build.rs 会在编译时生成中文资源；直接执行 Cargo 构建也会检查译文基线。
也可从本仓库 Actions 手动运行 **Build Windows zh-CN**，下载 ZIP 和 SHA-256 校验值。
界面汉化不要求运行硬件测试，工作流继续使用上游关闭硬件测试的构建选项。

## 跟随上游更新

1. `git fetch upstream`，在更新分支合并选定上游版本，处理冲突。
2. `git diff <上次基线>..<新基线> -- token2-piv-gui/ui token2-piv-gui/src-tauri`，检查文案和 Windows 构建变更。
3. 补充或修改独立词表；调整失效的上下文补丁。译文键或补丁失效时构建会报错。
4. 人工审阅新增界面文字后，更新前端哈希基线，并更新本文档中的上游提交号。
5. 执行 `npm run localize` 和 `npm run check:localization`，构建 Windows 包，只复测受影响页面。

源文件哈希变化时构建会停止，避免上游新增或调整界面后静默漏译。
保持英文源文件不变可以减少合并冲突；原文未变化的译文可以继续复用。

## 许可

保留上游版权与许可证。上游声明使用 BSD 2-Clause；附带组件继续遵循各自许可证，详见程序“关于”页面。
本 Fork 的汉化与构建脚本同样按 BSD 2-Clause 发布。汉化维护：magnetpackk。
