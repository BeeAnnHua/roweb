#!/usr/bin/env python3
"""Compatibility wrapper: V0.9.83 is superseded by V0.9.83A."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name("build_data_bundle_v0_9_83a.py")), run_name="__main__")
