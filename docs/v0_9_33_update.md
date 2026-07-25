# RO_WEB V0.9.33 Update

## Item Database Migration

- Migrated current runtime items into the new categorized database structure.
- Added six-town shop data from the previous V0.9.40 shop foundation without importing full 29k rAthena items.
- Kept common tool shop arrow-free.
- Added six representative weapon shops and six representative armor shops.
- Added `materials_1/materials_2` and `cards_1/cards_2` split files in advance.
- Added `ITEM_PLACEMENT_MAP.md` as the single rule file for future item placement.
- Updated item docs and audit report.
- Kept `data/items.json` as compatibility source for current UI/runtime.

## QA

- JSON syntax checked.
- Shop item references checked.
- Monster drops checked.
- Image paths checked.
- Unknown item type check passed.
