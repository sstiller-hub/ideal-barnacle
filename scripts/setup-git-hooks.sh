#!/bin/sh
set -e
git config core.hooksPath .githooks
chmod +x .githooks/pre-push
echo "Git hooks installed (core.hooksPath=.githooks)"
