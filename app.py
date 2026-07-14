import subprocess
import os
import sys
import tarfile
import urllib.request
import shutil

# ── Configuration ──────────────────────────────────────────────────────────
NODE_VERSION = "20.18.0"
NODE_DIR = os.path.expanduser("~/node")
NODE_BIN = os.path.join(NODE_DIR, "bin")
BACKEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
TESSDATA_DIR = os.path.join(BACKEND_DIR, "tessdata")
TESSDATA_URL = "https://github.com/naptha/tessdata/blob/gh-pages/4.0.0_best/eng.traineddata.gz?raw=true"

def install_node():
    """Download and extract Node.js portable binary (no sudo needed)."""
    if os.path.exists(os.path.join(NODE_BIN, "node")):
        print(f"[Setup] Node.js already installed at {NODE_DIR}")
        return

    print(f"[Setup] Downloading Node.js v{NODE_VERSION}...")
    url = f"https://nodejs.org/dist/v{NODE_VERSION}/node-v{NODE_VERSION}-linux-x64.tar.xz"
    archive_path = "/tmp/node.tar.xz"

    urllib.request.urlretrieve(url, archive_path)
    os.makedirs(NODE_DIR, exist_ok=True)

    print("[Setup] Extracting Node.js...")
    subprocess.run(
        ["tar", "-xJf", archive_path, "-C", NODE_DIR, "--strip-components=1"],
        check=True,
    )
    os.remove(archive_path)
    print(f"[Setup] Node.js v{NODE_VERSION} installed at {NODE_DIR}")


def download_tessdata():
    """Download eng.traineddata for Tesseract OCR if not present."""
    os.makedirs(TESSDATA_DIR, exist_ok=True)
    traineddata_path = os.path.join(TESSDATA_DIR, "eng.traineddata")
    gz_path = os.path.join(TESSDATA_DIR, "eng.traineddata.gz")

    if os.path.exists(traineddata_path):
        print("[Setup] Tesseract eng.traineddata already present")
        return

    print("[Setup] Downloading Tesseract eng.traineddata...")
    try:
        urllib.request.urlretrieve(TESSDATA_URL, gz_path)
        subprocess.run(["gunzip", "-f", gz_path], check=True)
        print("[Setup] Tesseract data downloaded and decompressed")
    except Exception as e:
        print(f"[Setup] ⚠ Tessdata download failed (OCR will use CDN fallback): {e}")


def install_deps():
    """Run npm install in the backend directory."""
    print("[Setup] Installing npm dependencies...")
    subprocess.run(
        ["npm", "install", "--omit=dev"],
        cwd=BACKEND_DIR,
        env={**os.environ, "PATH": f"{NODE_BIN}:{os.environ['PATH']}"},
        check=True,
    )
    print("[Setup] npm dependencies installed")


def start_server():
    """Start the Node.js Express server (blocks forever)."""
    print("[Setup] Starting ExpiryAlert AI backend on port 7860...")
    env = {
        **os.environ,
        "PATH": f"{NODE_BIN}:{os.environ['PATH']}",
        "PORT": "7860",
        "NODE_ENV": "production",
    }
    # exec replaces this process with node — clean signal handling
    os.execve(
        os.path.join(NODE_BIN, "node"),
        ["node", "server.js"],
        {**env},
    )


if __name__ == "__main__":
    install_node()
    download_tessdata()
    install_deps()
    start_server()
