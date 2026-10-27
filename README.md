# WorkBuddy Auto Theme

> **项目已停止更新。** WorkBuddy 官方已提供「System（跟随系统）」外观选项；在已验证的 5.9.2 中可直接使用。本项目保留给不愿升级、仍在使用 **5.8.3 或更早版本**的用户参考和使用。补丁仅在 5.8.3 上完成过真机验证，更早版本未经验证；只有主题文件通过工具的完整性校验时才能安装。

[English](README.en.md) · [下载](https://github.com/chillboy67/workbuddy-auto-theme/releases) · [实现原理](docs/DESIGN.md) · [恢复指南](docs/RECOVERY.md)

让 macOS 版 WorkBuddy 随系统自动切换原生浅色和深色。

> **WorkBuddy 5.9.2 用户：无需安装本补丁。** 在 WorkBuddy 左下角账户菜单 → 外观（Appearance）中选择 **System（跟随系统）**；在 macOS「系统设置 → 外观」中选择「自动」。2026-10-27 已在一台 Mac 上实际切换系统深色、浅色，观察到 WorkBuddy 外观设置界面随之切换。请勿把 5.8.3 的备份覆盖到新版应用。更多信息见 [5.9.2 说明](docs/WORKBUDDY-5.9.2.md)。

只做这一件事：修复自动模式被启动时的固定主题覆盖，以及切换后部分控件仍保留旧配色的问题。保留 WorkBuddy 原生界面，不添加皮肤、壁纸或额外面板。

**无第三方运行依赖，无常驻进程，无开机启动项。** 安装、验证和卸载时临时使用本机 CDP；结束后退出调试实例，再以普通模式启动 WorkBuddy。

> **使用前请了解：本工具会修改 WorkBuddy 应用包内的一个 JavaScript 资源，使原有代码签名的资源校验失效。** 不会重签名、移除隔离标记或关闭 macOS 安全检查。应用更新可能覆盖补丁，系统也可能拒绝启动修改后的应用。请保留原版备份；如遇启动问题，按[恢复指南](docs/RECOVERY.md)恢复或安装官方原版。

## 支持范围

| 项目 | 要求 |
| --- | --- |
| 系统 | macOS；Windows / Linux 不支持 |
| 客户端 | 自动查找主题模块；只有 SHA-256 与已验证文件完全匹配才可打补丁（已在 5.8.3 验证） |
| Node.js | **22.13 或更新版本** |
| 外观 | WorkBuddy 原生浅色 / 深色；自定义皮肤不支持 |
| 安装位置 | 默认 `/Applications/WorkBuddy.app`，可用 `--app` 指定 |

工具按应用包内容自动定位模块，不依赖固定文件名或版本号。它检查 Bundle ID、ASAR 元数据、文件长度和 SHA-256；无法确认文件身份就停止。对检测到原生跟随系统迹象的版本，只提供设置引导；静态检查不能证明当前选项已开启。该检测只扫描有限大小的已打包 JavaScript，未来版本若改变实现，可能无法识别，届时需重新适配。

**此项目仍为预发布。** 核心补丁已在 macOS / WorkBuddy 5.8.3 真机验证；通用安装工具另有自动化测试，尚未完成所有机器、权限和异常退出场景的实机验收。详见[验证记录](docs/VALIDATION.md)。

## 快速开始

先安装官方 WorkBuddy 并登录账号。若当前使用自定义皮肤，先在 WorkBuddy 的外观设置中选择原生浅色或深色。

下载 [Release](https://github.com/chillboy67/workbuddy-auto-theme/releases) 的项目 ZIP 并解压，或者：

```sh
git clone https://github.com/chillboy67/workbuddy-auto-theme.git
cd workbuddy-auto-theme
```

无需执行 `npm install`。

### 1. 检查兼容性

```sh
node bin/workbuddy-auto-theme.mjs status
```

`status` 只读取应用文件和本工具的备份记录，不重启应用，也不宣称已验证正在运行的页面状态。

### 2. 安装并开启自动跟随

保存好 WorkBuddy 当前工作，然后执行：

```sh
node bin/workbuddy-auto-theme.mjs install
```

工具会要求输入 `yes` 确认重启及修改已签名资源，再完成备份、补丁和自动模式配置。非交互终端中，确认已保存工作并接受上述影响后使用：

```sh
node bin/workbuddy-auto-theme.mjs install --yes
```

也可在 Finder 中双击 `安装.command`。如系统拒绝打开下载的脚本，请使用上面的终端命令，不需要关闭系统安全检查。

安装期间会退出并重新打开 WorkBuddy，当前任务可能中断；工具不会强制结束进程。通常会重启两次：进入临时调试模式一次，完成后回到普通模式一次。

### 3. 开启 macOS 自动外观

系统设置 → 外观 → 自动。

WorkBuddy 跟随的是系统实际配色，不是工具自己的定时器。也可以手动切换系统浅色、深色，WorkBuddy 应随之变化。工具不会替你更改系统外观设置。

## 验证

保存工作后运行：

```sh
node bin/workbuddy-auto-theme.mjs verify --yes
```

验证会临时重启 WorkBuddy，通过 CDP 模拟页面的深、浅配色媒体信号，检查主题、控件元数据和页面重载后的自动状态；随后清除模拟信号并回到普通启动模式。**这不是直接切换 macOS 外观的测试**，真实系统切换请按上一节手动确认。

## 卸载 / 恢复

```sh
node bin/workbuddy-auto-theme.mjs uninstall
```

或者双击 `卸载.command`。工具会恢复安装前保存的外观设置和原版主题模块，然后正常重启应用。恢复前会校验当前应用与备份；遇到应用更新、未知修改或备份损坏会停止，避免覆盖新版。

备份默认保存在本机：

```text
~/Library/Application Support/WorkBuddy Auto Theme/
├── original.js       原版主题模块，不上传
├── state.json        版本、路径及哈希记录
└── appearance.json   安装前的相关外观设置，不上传
```

卸载保留备份。请不要把这些文件提交到 GitHub。手动恢复、安装中断、更新及锁文件处理见[恢复指南](docs/RECOVERY.md)。

## 已使用早期手动补丁？

若 `status` 显示 `patched`，但备份为 `absent`，表示应用已打过同一补丁，但尚未由本工具管理。需要提供已有原版备份：

```sh
node bin/workbuddy-auto-theme.mjs install \
  --original-backup "/path/to/original-theme.js"
```

只有原版备份哈希完全匹配才会接管。不会把已打补丁的文件误当作原版备份。接管时的设置快照记录的是接管前状态，不会猜测更早的设置。

## 可选参数

```sh
node bin/workbuddy-auto-theme.mjs status --json
node bin/workbuddy-auto-theme.mjs install --app "/path/to/WorkBuddy.app"
node bin/workbuddy-auto-theme.mjs install --state-dir "/path/to/local-backup" --port 9334
node bin/workbuddy-auto-theme.mjs --help
```

使用自定义备份目录后，后续命令也需要传相同的 `--state-dir`。端口仅绑定 `127.0.0.1`；已占用时停止，不会连接或关闭其他进程。

## 为什么需要补丁

当前受支持的客户端内已有自动主题能力，但存在两处冲突：

1. 启动快照及主题同步会重新应用固定浅色 / 深色，覆盖 `auto`。
2. 系统配色监听器只更新主题值，没有同步重算 VS Code 控件的配色元数据。

补丁让本地自动模式优先，并在系统配色变化时调用完整主题切换路径。安装后日常运行依赖的是 WorkBuddy 自身的媒体监听器，不需要后台脚本轮询。

ASAR 头部保留了该外部资源的长度。补丁会缩短主题模块中的诊断文案，并用尾部空格补齐，保持 **10,592 字节**；不改 `app.asar` 或其元数据。完整原理和具体取舍见[设计说明](docs/DESIGN.md)。

## 开发与测试

```sh
npm test
npm run check
```

测试覆盖双向配色、固定主题覆盖、长度保持、未知哈希拒绝、备份损坏、符号链接、并发锁、CDP 超时和验证清理。CI 在 macOS / Linux、Node.js 22 / 24 上运行合成测试；Linux CI 通过不代表支持 Linux 客户端。

可使用自己本机的原版文件额外验证真实补丁和临时应用目录中的安装 / 恢复：

```sh
WORKBUDDY_TEST_ORIGINAL="/path/to/original-theme-file.js" npm test
```

测试不会修改 `/Applications/WorkBuddy.app`。原版文件不会被拷贝进项目或发布包。

## 项目结构

```text
bin/       命令行入口
src/       补丁、文件校验、CDP、外观配置及平台操作
test/      自动化测试；不包含官方应用源码
scripts/   语法检查工具
docs/      设计、验证与恢复记录
```

独立社区工具，与 WorkBuddy 官方无隶属或授权关系。项目自身代码采用 [MIT](LICENSE) 许可；不分发 WorkBuddy 应用包、原版主题模块或用户配置。
