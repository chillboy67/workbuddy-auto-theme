# 恢复与常见问题

## status 显示 patched，但备份 absent

应用含早期相同补丁，但当前备份目录没有本工具的状态记录。用 `install --original-backup "/path/to/original.js"` 接管，或用早期工具及其原版备份恢复。不要将 patched 文件当作 original。

## 不支持的版本或哈希

停止安装。不要改版本检查、复制旧资源进新版应用，或关闭签名及系统安全检查来强行运行。请等待明确支持该版本的补丁。

## EACCES / EPERM

工具不能写入应用包或备份目录。检查目录是否由当前用户管理，是否安装在只读磁盘镜像内。不要盲目用 `sudo` 运行整套工具。可以将官方应用正常安装到自己可写的 Applications 位置，并用 `--app` 指向它。

## 端口 9333 已占用

可用 `--port 9334`。工具不会接管占用端口的进程，也不会结束其他应用。

## 活动自定义皮肤

在 WorkBuddy 外观设置中先选择原生浅色或深色，再重新安装。自动模式不支持和独立皮肤共存。

## 运行中断 / operation.lock 遗留

1. 先检查是否仍有本工具的命令在运行。不要在另一个安装或恢复操作未结束时删除锁。
2. 正常退出 WorkBuddy，确保临时调试实例已关闭。
3. 确定没有本工具进程后，只移除备份目录下的 `operation.lock/pid` 文件和空的 `operation.lock` 目录。不要删除 `original.js`、`state.json`、`appearance.json`。
4. 重试安装或卸载。若备份记录不完整，先按下一节恢复原版文件。

这是互斥锁，不会自动依据 PID 清理，以免 PID 复用时误判。

## 应用无法启动时手动恢复原版模块

先正常退出 WorkBuddy。下面的命令只恢复已知原版资源，不需要启动应用；路径是默认值，使用自定义安装或备份位置时请相应调整。

```sh
node --input-type=module <<'JS'
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {sha256, PROFILE} from './src/patch.mjs';
import {inspectApp, validateBackup, restoreOriginal} from './src/files.mjs';
// 在项目根目录执行。inspectApp 同时检查 ASAR 元数据和目标文件身份。
const app='/Applications/WorkBuddy.app';
const state=path.join(os.homedir(),'Library/Application Support/WorkBuddy Auto Theme');
const info=inspectApp(app,PROFILE.version);
validateBackup(info,state);
if(sha256(fs.readFileSync(info.target))!==PROFILE.patchedHash &&
   sha256(fs.readFileSync(info.target))!==PROFILE.originalHash)throw Error('目标文件已改变，停止恢复');
restoreOriginal(info,state);
console.log('原版模块已恢复，请正常打开 WorkBuddy。');
JS
```

这不会清理页面的自动模式标记，但恢复后的原版模块不读取本项目的标记。安装前的主题偏好可能仍需在 WorkBuddy 外观设置中重新选择。若要恢复保存的偏好，可在应用能正常打开后重新执行 `uninstall`。

没有完整可信备份、文件已被新版本替换，或官方应用仍无法启动时，请安装官方原版。不要重新签名、移除 quarantine 或关闭 Gatekeeper 来绕过启动问题。

## 恢复签名校验

恢复原版字节后，可以运行：

```sh
codesign --verify --deep --strict /Applications/WorkBuddy.app
```

本工具只负责其主题模块的修改；如果其他文件也被改动，恢复此模块不保证整个应用的签名校验成功。

## 更新后自动跟随消失

应用更新可能覆盖补丁。先执行 `status`。不要直接把旧备份覆盖到新版本；本工具会拒绝这种恢复。保留旧备份，等待新版适配。
