# RO_WEB V0.9.33a Debug Audit Report

## Summary
- Runtime item count: 102
- Item index count: 102
- Shop count: 13
- Monster count: 10

## Checks
- JSON syntax: PASS
- JS syntax: PASS
- item_index missing entries: 0
- item_index extra entries: 0
- shop missing itemId: 0
- monster drop missing itemId: 0
- missing item images: 0
- unknown item types: 0

## Debug Fixes in 0.9.33a
- Normalized currently used weapon subCategory values: `1hSword` / `2hSword` -> `sword`, `2hAxe` -> `axe`, capitalized weapon categories -> lowercase canonical values.
- Preserved `handed` for one-handed / two-handed weapon logic.
- Strengthened tooltip type display so old and new weapon category names do not fall back incorrectly.
- Regenerated `data_bundle.js` after data cleanup.

## Details
- Missing index: []
- Extra index: []
- Shop missing itemId: []
- Drop missing itemId: []
- Missing images: []
- Unknown item types: []
