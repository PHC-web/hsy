#!/usr/bin/env bash
# 本机一键部署 zfqy-web H5 到 175.178.164.14
# 流程：校验本地构建产物 → rsync 同步到 /data/hsy-nginx/www → docker restart hsy
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${DEPLOY_ENV_FILE:-$ROOT/scripts/deploy.env}"
DIST_DIR="${DEPLOY_DIST_DIR:-$ROOT/unpackage/dist/build/web}"

SSH_HOST="${SSH_HOST:-175.178.164.14}"
SSH_USER="${SSH_USER:-}"
SSH_PORT="${SSH_PORT:-22}"
SSH_KEY="${SSH_KEY:-}"
REMOTE_WWW="${REMOTE_WWW:-/data/hsy-nginx/www}"
DOCKER_CONTAINER="${DOCKER_CONTAINER:-hsy}"
DOCKER_SUDO="${DOCKER_SUDO:-0}"
RSYNC_DELETE="${RSYNC_DELETE:-1}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
fi

# env 文件加载后再允许环境变量覆盖
SSH_HOST="${SSH_HOST:-175.178.164.14}"
SSH_PORT="${SSH_PORT:-22}"
REMOTE_WWW="${REMOTE_WWW:-/data/hsy-nginx/www}"
DOCKER_CONTAINER="${DOCKER_CONTAINER:-hsy}"
DOCKER_SUDO="${DOCKER_SUDO:-0}"
RSYNC_DELETE="${RSYNC_DELETE:-1}"

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    red "缺少命令：$1"
    exit 1
  fi
}

need ssh
need rsync

if [[ -z "${SSH_USER:-}" ]]; then
  red "未设置 SSH_USER。"
  yellow "请复制 scripts/deploy.env.example 为 scripts/deploy.env，填写 SSH 用户名（以及可选的私钥路径）。"
  exit 1
fi

if [[ ! -d "$DIST_DIR" ]]; then
  red "找不到构建目录：$DIST_DIR"
  yellow "请先用 HBuilderX 发行 Web（产物应在 unpackage/dist/build/web）。"
  exit 1
fi

if [[ ! -f "$DIST_DIR/index.html" ]]; then
  red "构建目录里没有 index.html：$DIST_DIR"
  yellow "请确认已在 HBuilderX 中完成 Web 发行，且上传的是目录内文件，不是空目录。"
  exit 1
fi

SSH_OPTS=(-p "$SSH_PORT" -o StrictHostKeyChecking=accept-new)
RSYNC_SSH="ssh -p $SSH_PORT -o StrictHostKeyChecking=accept-new"
if [[ -n "$SSH_KEY" ]]; then
  SSH_KEY="${SSH_KEY/#\~/$HOME}"
  if [[ ! -f "$SSH_KEY" ]]; then
    red "私钥不存在：$SSH_KEY"
    exit 1
  fi
  SSH_OPTS+=(-i "$SSH_KEY")
  RSYNC_SSH="ssh -p $SSH_PORT -i $SSH_KEY -o StrictHostKeyChecking=accept-new"
fi

REMOTE="${SSH_USER}@${SSH_HOST}"
RSYNC_FLAGS=(-az --human-readable --progress)
if [[ "$RSYNC_DELETE" == "1" ]]; then
  RSYNC_FLAGS+=(--delete --exclude '.git')
fi

DOCKER_BIN="docker"
if [[ "$DOCKER_SUDO" == "1" ]]; then
  DOCKER_BIN="sudo docker"
fi

green "==> 检查 SSH：$REMOTE"
ssh "${SSH_OPTS[@]}" "$REMOTE" "test -d '$REMOTE_WWW' && echo ok" >/dev/null

green "==> 同步 $DIST_DIR/  →  $REMOTE:$REMOTE_WWW/"
# 源路径末尾斜杠：只同步目录内容，不把 web 这一层目录本身拷上去
rsync "${RSYNC_FLAGS[@]}" -e "$RSYNC_SSH" "$DIST_DIR/" "$REMOTE:$REMOTE_WWW/"

green "==> 重启容器：$DOCKER_CONTAINER"
ssh "${SSH_OPTS[@]}" "$REMOTE" "$DOCKER_BIN restart '$DOCKER_CONTAINER'"

green "==> 部署完成：http://${SSH_HOST}/"
