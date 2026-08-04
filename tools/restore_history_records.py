#!/usr/bin/env python3
"""Restore historical root audit files from the compact archive when legacy tools need them."""
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "RO_WEB_HISTORY_RECORDS_THROUGH_V0.9.83C.zip"

def main() -> int:
    if not ARCHIVE.is_file():
        raise SystemExit(f"Archive not found: {ARCHIVE}")
    restored = 0
    with zipfile.ZipFile(ARCHIVE) as zf:
        for info in zf.infolist():
            if info.is_dir() or info.filename == "INDEX.txt":
                continue
            target = ROOT / Path(info.filename).name
            target.write_bytes(zf.read(info))
            restored += 1
    print(f"Restored {restored} historical records to {ROOT}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
