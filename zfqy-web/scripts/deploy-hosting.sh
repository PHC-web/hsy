#!/usr/bin/env bash
# 把 H5 构建产物上传到 uniCloud 前端网页托管（阿里云）。
# 依赖本机已安装并登录的 HBuilderX，上传通道与控制台「前端网页托管」相同。
#
# 用法：
#   1. HBuilderX 发行到 Web，产物在 unpackage/dist/build/web
#   2. 在 scripts/deploy.env 填写 UNICLOUD_SPACE（云空间名称或 spaceId）
#   3. 保持 HBuilderX 处于打开且已登录
#   4. ./scripts/deploy-hosting.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${DEPLOY_ENV_FILE:-$ROOT/scripts/deploy.env}"
DIST_DIR="${DEPLOY_DIST_DIR:-$ROOT/unpackage/dist/build/web}"

HBUILDERX_CLI="${HBUILDERX_CLI:-/Applications/HBuilderX.app/Contents/MacOS/cli}"
UNICLOUD_SPACE="${UNICLOUD_SPACE:-}"
UNICLOUD_PROVIDER="${UNICLOUD_PROVIDER:-aliyun}"
UNICLOUD_PREFIX="${UNICLOUD_PREFIX:-/}"
HX_PROJECT="${HX_PROJECT:-zfqy-web}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
fi

HBUILDERX_CLI="${HBUILDERX_CLI:-/Applications/HBuilderX.app/Contents/MacOS/cli}"
UNICLOUD_PROVIDER="${UNICLOUD_PROVIDER:-aliyun}"
UNICLOUD_PREFIX="${UNICLOUD_PREFIX:-/}"
HX_PROJECT="${HX_PROJECT:-zfqy-web}"

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

if [[ ! -x "$HBUILDERX_CLI" ]]; then
  red "找不到 HBuilderX CLI：$HBUILDERX_CLI"
  yellow "正式版默认路径：/Applications/HBuilderX.app/Contents/MacOS/cli"
  yellow "Alpha 版：/Applications/HBuilderX-Alpha.app/Contents/MacOS/cli"
  yellow "也可在 scripts/deploy.env 里设置 HBUILDERX_CLI。"
  exit 1
fi

if [[ -z "${UNICLOUD_SPACE:-}" ]]; then
  red "未设置 UNICLOUD_SPACE。"
  yellow "请在 scripts/deploy.env 增加一行，例如："
  yellow "  UNICLOUD_SPACE=你的云空间名称或spaceId"
  yellow "查看当前项目关联的云空间（需先打开并登录 HBuilderX）："
  yellow "  \"$HBUILDERX_CLI\" cloud functions --list space --prj \"$HX_PROJECT\" --provider $UNICLOUD_PROVIDER"
  exit 1
fi

if [[ ! -d "$DIST_DIR" ]]; then
  red "找不到构建目录：$DIST_DIR"
  yellow "请先用 HBuilderX「发行 → 网站-PC Web或手机H5」，产物应在 unpackage/dist/build/web。"
  exit 1
fi

if [[ ! -f "$DIST_DIR/index.html" ]]; then
  red "构建目录里没有 index.html：$DIST_DIR"
  exit 1
fi

green "==> 上传到 uniCloud 前端网页托管"
green "    空间：$UNICLOUD_SPACE"
green "    目录：$DIST_DIR"
green "    前缀：$UNICLOUD_PREFIX"
yellow "    请保持 HBuilderX 已打开并登录。云端已有同名文件会被本地文件覆盖。"

"$HBUILDERX_CLI" hosting deploy \
  --provider "$UNICLOUD_PROVIDER" \
  --space "$UNICLOUD_SPACE" \
  --source "$DIST_DIR" \
  --prefix "$UNICLOUD_PREFIX"

green "==> 上传命令已结束。到 uniCloud 控制台「前端网页托管」确认文件时间，并用托管域名访问。"
