#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
node bin/workbuddy-auto-theme.mjs uninstall
read -r -p '按回车关闭。'
