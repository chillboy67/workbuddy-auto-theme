#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo '需要 Node.js 22.13 或更新版本。安装后重试。'
  read -r -p '按回车关闭。'
  exit 1
fi
node bin/workbuddy-auto-theme.mjs install
read -r -p '按回车关闭。'
