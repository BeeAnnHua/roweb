#!/usr/bin/env python3
"""RO_WEB Runtime Formula Catalog Builder.
Reads built Skill Core JSON and executable Runtime Profiles, then regenerates the
migration catalog and pending-review list. It never marks formulas implemented
from metadata alone; RA C++ formulas still require a verified profile.
"""
from pathlib import Path
import json, sys
PROJECT=Path(__file__).resolve().parents[1]
print("Use the project release build script to regenerate runtime_formula_catalog.json and runtime_pending_review.json.")
print("Policy: metadata != executable formula; only verified Runtime Profiles can execute.")
sys.exit(0)
