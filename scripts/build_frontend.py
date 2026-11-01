"""Installs frontend npm dependencies and builds the production Vite + React + Tailwind bundle."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = ROOT / "frontend"
NODE_DIR = ROOT / ".tools" / "node"
NODE_EXE = NODE_DIR / "node.exe"
NPM_CLI = NODE_DIR / "node_modules" / "npm" / "bin" / "npm-cli.js"


def main() -> None:
    if not NODE_EXE.exists():
        raise SystemExit(f"Portable Node not found at {NODE_EXE}")

    env = os.environ.copy()
    env["PATH"] = f"{NODE_DIR};{env.get('PATH', '')}"
    env["npm_config_cache"] = str(ROOT / ".tools" / "npm-cache")

    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    if mode in ("install", "all"):
        print("Running npm install in frontend/ ...")
        subprocess.run([str(NODE_EXE), str(NPM_CLI), "install", "--no-audit", "--no-fund"], cwd=str(FRONTEND_DIR), env=env, check=True)

    if mode in ("build", "all"):
        print("Running vite build in frontend/ ...")
        subprocess.run([str(NODE_EXE), str(NPM_CLI), "run", "build"], cwd=str(FRONTEND_DIR), env=env, check=True)

    print("Frontend build complete! Output in frontend/dist/")


if __name__ == "__main__":
    main()
