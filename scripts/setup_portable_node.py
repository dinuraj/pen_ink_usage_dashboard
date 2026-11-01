"""Downloads official portable Node.js LTS (win-arm64 / win-x64) into .tools/node for building the Vite SPA."""

from __future__ import annotations

import platform
import shutil
import urllib.request
import zipfile
from pathlib import Path

NODE_VERSION = "v22.14.0"
ROOT = Path(__file__).resolve().parent.parent
TOOLS_DIR = ROOT / ".tools"
NODE_TARGET = TOOLS_DIR / "node"


def ensure_portable_node() -> Path:
    node_exe = NODE_TARGET / "node.exe"
    if node_exe.exists():
        print(f"Portable Node already ready at {node_exe}")
        return node_exe

    arch = "arm64" if "arm" in platform.machine().lower() else "x64"
    archive_stem = f"node-{NODE_VERSION}-win-{arch}"
    url = f"https://nodejs.org/dist/{NODE_VERSION}/{archive_stem}.zip"
    TOOLS_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = TOOLS_DIR / f"{archive_stem}.zip"

    print(f"Downloading {url} ...")
    urllib.request.urlretrieve(url, zip_path)

    print("Extracting portable Node.js...")
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(TOOLS_DIR)

    extracted = TOOLS_DIR / archive_stem
    if NODE_TARGET.exists():
        shutil.rmtree(NODE_TARGET)
    extracted.rename(NODE_TARGET)
    zip_path.unlink(missing_ok=True)
    print(f"Ready: {node_exe}")
    return node_exe


if __name__ == "__main__":
    ensure_portable_node()
