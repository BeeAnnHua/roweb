#!/usr/bin/env python3
"""RO_WEB 0.9.82GC card rarity correction.

Classify each card from its canonical monster family instead of treating every
special/event clone that happens to drop the same card as authoritative.
"""
from __future__ import annotations
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CARD_FILES = [ROOT/'data/items/cards_1.json', ROOT/'data/items/cards_2.json']
RUNTIME_FILE = ROOT/'data/card_runtime/card_effects.json'
INDEX_FILE = ROOT/'data/items/item_index.json'


def tokens(value: str) -> set[str]:
    return {part for part in re.split(r'[^A-Z0-9]+', str(value or '').upper()) if part and part != 'CARD'}


def classify(record: dict) -> tuple[str, list[dict]]:
    base_name = re.sub(r'_CARD$', '', str(record.get('aegisName') or ''), flags=re.I).upper()
    sources = list(record.get('dropSources') or [])
    exact = [row for row in sources if str(row.get('monsterAegisName') or '').upper() == base_name]
    if exact:
        selected = exact
    else:
        base_tokens = tokens(base_name)
        selected = []
        for row in sources:
            source_tokens = tokens(row.get('monsterAegisName') or '')
            if base_tokens and (base_tokens.issubset(source_tokens) or source_tokens.issubset(base_tokens)):
                selected.append(row)
        if not selected:
            selected = sources

    if any(bool(row.get('isMvp')) for row in selected):
        return 'mvp', selected
    if any(bool(row.get('isBoss')) for row in selected):
        return 'boss', selected
    return 'normal', selected


def apply_record(record: dict) -> tuple[str, str]:
    old = str(record.get('cardVisualTier') or ('mvp' if record.get('isMvpCard') else 'normal'))
    tier, selected = classify(record)
    card_id = int(record.get('id') or record.get('officialId') or 0)
    record['isMvpCard'] = tier == 'mvp'
    record['isBossCard'] = tier in {'boss', 'mvp'}
    record['cardVisualTier'] = tier
    # Preserve the explicit original Poring-card file requested by the project owner.
    record['icon'] = 'images/items/4001.webp' if card_id == 4001 else f'images/items/card_{tier}.webp'
    record['cardTierSourceMonsterIds'] = [int(row.get('monsterId') or 0) for row in selected]
    return old, tier


def load_cards() -> dict[str, dict]:
    cards: dict[str, dict] = {}
    for path in CARD_FILES:
        cards.update(json.loads(path.read_text(encoding='utf-8')))
    return cards


def write_cards(cards: dict[str, dict]) -> None:
    keys = sorted(cards, key=lambda value: int(value))
    split = 800
    CARD_FILES[0].write_text(json.dumps({k: cards[k] for k in keys[:split]}, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    CARD_FILES[1].write_text(json.dumps({k: cards[k] for k in keys[split:]}, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    RUNTIME_FILE.write_text(json.dumps(cards, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

    index = json.loads(INDEX_FILE.read_text(encoding='utf-8'))
    compact_fields = (
        'id','officialId','name','type','category','subCategory','cardTarget','description','icon',
        'slotCount','slots','buyPrice','sellPrice','isMvpCard','isBossCard','cardVisualTier','dataSource'
    )
    for key, record in cards.items():
        index[key] = {field: record[field] for field in compact_fields if field in record}
    INDEX_FILE.write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


def main() -> None:
    cards = load_cards()
    changes = []
    before = Counter()
    after = Counter()
    for key, record in cards.items():
        old, new = apply_record(record)
        before[old] += 1
        after[new] += 1
        if old != new:
            changes.append({'id': int(key), 'name': record.get('name'), 'from': old, 'to': new})
    write_cards(cards)
    report = {
        'version': '0.9.82GC',
        'cardCount': len(cards),
        'before': dict(before),
        'after': dict(after),
        'corrected': changes,
        'poringCardIcon': cards['4001']['icon'],
        'anophelesCard': {k: cards['4344'].get(k) for k in ('name','isMvpCard','isBossCard','cardVisualTier','icon','cardTierSourceMonsterIds')}
    }
    (ROOT/'CARD_RARITY_FIX_REPORT_0.9.82GC.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
