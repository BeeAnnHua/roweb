#!/usr/bin/env python3
"""Keep only item images referenced by the active RO_WEB item database/runtime."""
from __future__ import annotations
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / 'images/items'
MANIFEST = ROOT / 'data/items/database_manifest.json'
ICON_RE = re.compile(r'images/items/([^"\'\\)\s?#]+\.webp)', re.I)
ALWAYS_KEEP = {'4001.webp', 'card_normal.webp', 'card_boss.webp', 'card_mvp.webp'}


def walk_icons(value, output: set[str]) -> None:
    if isinstance(value, dict):
        icon = value.get('icon')
        if isinstance(icon, str) and icon.startswith('images/items/'):
            output.add(Path(icon.split('?', 1)[0]).name)
        for nested in value.values():
            walk_icons(nested, output)
    elif isinstance(value, list):
        for nested in value:
            walk_icons(nested, output)


def active_item_paths() -> list[Path]:
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    paths = [ROOT / rel for rel in manifest.get('allDataPaths', [])]
    paths.extend([
        ROOT/'data/items/item_index.json',
        ROOT/'data/card_runtime/card_effects.json',
        ROOT/'data/card_runtime/item_groups.json',
        ROOT/'data/shops.json',
        ROOT/'data/player_default.json',
    ])
    unique = []
    seen = set()
    for path in paths:
        if path not in seen and path.is_file():
            unique.append(path); seen.add(path)
    return unique


def collect_needed() -> tuple[set[str], list[str]]:
    needed = set(ALWAYS_KEEP)
    scanned = []
    for path in active_item_paths():
        scanned.append(str(path.relative_to(ROOT)))
        try:
            walk_icons(json.loads(path.read_text(encoding='utf-8')), needed)
        except Exception as exc:
            raise RuntimeError(f'Cannot parse active item data {path}: {exc}') from exc

    # Static runtime references not represented by an item record.
    source_paths = [ROOT/'index.html']
    source_paths.extend((ROOT/'css').rglob('*.css'))
    source_paths.extend(path for path in (ROOT/'js').rglob('*.js') if path.name != 'data_bundle.js' and '.pre_gc' not in path.name)
    for path in source_paths:
        text = path.read_text(encoding='utf-8', errors='ignore')
        needed.update(match.group(1) for match in ICON_RE.finditer(text) if not any(token in match.group(1) for token in ('$','{','}')))
    return needed, scanned


def main() -> None:
    needed, scanned = collect_needed()
    existing = {path.name: path for path in ICON_DIR.glob('*.webp')}
    missing = sorted(name for name in needed if name not in existing)
    if missing:
        raise SystemExit(f'Missing referenced item icons before prune: {missing[:30]}')

    before_count = len(existing)
    before_bytes = sum(path.stat().st_size for path in existing.values())
    deleted = []
    for name, path in existing.items():
        if name not in needed:
            deleted.append(name)
            path.unlink()
    remaining = {path.name: path for path in ICON_DIR.glob('*.webp')}
    after_bytes = sum(path.stat().st_size for path in remaining.values())
    unreferenced = sorted(set(remaining) - needed)
    missing_after = sorted(needed - set(remaining))
    report = {
        'version': '0.9.82GC',
        'activeDataFilesScanned': len(scanned),
        'before': {'count': before_count, 'bytes': before_bytes},
        'after': {'count': len(remaining), 'bytes': after_bytes},
        'deleted': {'count': len(deleted), 'bytesSaved': before_bytes-after_bytes},
        'neededIconCount': len(needed),
        'missingReferences': missing_after,
        'unreferencedRemaining': unreferenced,
        'preservedPoringCard': '4001.webp' in remaining,
        'sharedCardIcons': sorted(name for name in remaining if name.startswith('card_')),
        'scannedPaths': scanned,
    }
    (ROOT/'ITEM_ICON_PRUNE_REPORT_0.9.82GC.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    (ROOT/'ITEM_ICON_PRUNE_DELETED_0.9.82GC.txt').write_text('\n'.join(sorted(deleted))+'\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
