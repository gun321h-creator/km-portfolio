#!/usr/bin/env bash
# One-click deploy wrapper — runs the PowerShell sync from git-bash.
# Lets you type `./sync.sh` at a `!` prompt instead of the long `powershell -File ...`.
#
#   ./sync.sh                   # default timestamped commit
#   ./sync.sh "fix hero copy"   # custom commit message
#
# Delegates everything (mirror + commit + push) to sync.ps1.
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# powershell.exe needs a Windows path (C:\...), not a git-bash /c/... path.
PS1_PATH="$(cygpath -w "$DIR/sync.ps1")"
exec powershell -NoProfile -File "$PS1_PATH" "$@"
