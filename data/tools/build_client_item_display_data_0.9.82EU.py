#!/usr/bin/env python3
from pathlib import Path
import json, re

ROOT = Path(__file__).resolve().parents[1]
TABLE_DIR = ROOT / 'client_tables'
ITEMINFO = Path('/mnt/data/itemInfo_UTF8.lub')
OUT = ROOT / 'data' / 'client_item_display_data.json'


def decode_line(raw: bytes):
    for enc in ('cp950', 'big5', 'cp949', 'utf-8-sig'):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            pass
    return raw.decode('cp950', errors='replace')


def parse_hash_table(path: Path, value_optional=True):
    result = {}
    for raw in path.read_bytes().splitlines():
        if not raw.strip():
            continue
        text = decode_line(raw).strip('\ufeff\r\n')
        parts = text.split('#')
        if not parts or not parts[0].strip().isdigit():
            continue
        item_id = str(int(parts[0].strip()))
        value = parts[1].strip() if len(parts) > 1 else ''
        result[item_id] = value
    return result


def lua_unquote(token: str):
    token = token.strip()
    if not (token.startswith('"') and token.endswith('"')):
        return token
    try:
        return json.loads(token)
    except Exception:
        body = token[1:-1]
        return bytes(body, 'utf-8').decode('unicode_escape', errors='replace')


def split_lua_strings(block: str):
    return [lua_unquote(m.group(0)) for m in re.finditer(r'"(?:\\.|[^"\\])*"', block, re.S)]


def extract_item_entries(source: str, wanted_ids: set[str]):
    entries = {}
    line_re = re.compile(r'^\s*\[(\d+)\]\s*=\s*\{', re.M)
    for match in line_re.finditer(source):
        item_id = match.group(1)
        if item_id not in wanted_ids:
            continue
        start = match.start()
        i = match.end() - 1
        depth = 0
        in_string = False
        escaped = False
        end = None
        while i < len(source):
            ch = source[i]
            if in_string:
                if escaped:
                    escaped = False
                elif ch == '\\':
                    escaped = True
                elif ch == '"':
                    in_string = False
            else:
                if ch == '"':
                    in_string = True
                elif ch == '{':
                    depth += 1
                elif ch == '}':
                    depth -= 1
                    if depth == 0:
                        end = i + 1
                        break
            i += 1
        if end is None:
            continue
        block = source[start:end]
        name_m = re.search(r'(?<!un)identifiedDisplayName\s*=\s*("(?:\\.|[^"\\])*")', block, re.S)
        resource_m = re.search(r'(?<!un)identifiedResourceName\s*=\s*("(?:\\.|[^"\\])*")', block, re.S)
        desc_m = re.search(r'(?<!un)identifiedDescriptionName\s*=\s*\{(.*?)\}\s*,?\s*(?:slotCount|ClassNum)', block, re.S)
        slot_m = re.search(r'slotCount\s*=\s*(\d+)', block)
        entries[item_id] = {
            'id': int(item_id),
            'name': lua_unquote(name_m.group(1)) if name_m else f'物品 {item_id}',
            'resourceName': lua_unquote(resource_m.group(1)) if resource_m else '',
            'description': split_lua_strings(desc_m.group(1)) if desc_m else [],
            'slotCount': int(slot_m.group(1)) if slot_m else 0,
        }
    return entries

prefix = parse_hash_table(TABLE_DIR / 'cardprefixnametable.txt')
postfix_rows = parse_hash_table(TABLE_DIR / 'cardpostfixnametable.txt')
card_alias = parse_hash_table(TABLE_DIR / 'carditemnametable.txt')
illustration = parse_hash_table(TABLE_DIR / 'num2cardillustnametable.txt')

msg_text = (TABLE_DIR / 'msgstringtable.txt').read_bytes().decode('cp950', errors='replace')
msg_lines = [line.rstrip('#\r\n') for line in msg_text.splitlines()]
duplicates = {}
for count, needle in ((2, '兩倍卡片'), (3, '三倍卡片'), (4, '四倍卡片')):
    found = next((line for line in msg_lines if line == needle), needle)
    duplicates[str(count)] = found.replace('卡片', '')

wanted_ids = set(prefix) | set(postfix_rows) | set(card_alias) | set(illustration)
source = ITEMINFO.read_text(encoding='utf-8-sig', errors='replace')
card_info = extract_item_entries(source, wanted_ids)

# Empty alias rows mean the client uses itemInfo's card name. Keep only real aliases.
card_alias = {k: v for k, v in card_alias.items() if v}
postfix_ids = sorted([int(k) for k in postfix_rows])

payload = {
    'schema': 'ro_web_client_item_display_v1',
    'version': '0.9.82EV',
    'source': {
        'itemInfo': 'itemInfo_UTF8.lub (2026-06 client set)',
        'cardPrefix': 'cardprefixnametable.txt',
        'cardPostfix': 'cardpostfixnametable.txt',
        'cardItemName': 'carditemnametable.txt',
        'duplicateLabels': 'msgstringtable.txt',
        'cardIllustration': 'num2cardillustnametable.txt'
    },
    'duplicateCardPrefixes': duplicates,
    'cardPrefixNames': prefix,
    'cardPostfixIds': postfix_ids,
    'cardItemAliases': card_alias,
    'cardIllustrationResources': illustration,
    'cardInfo': card_info,
    'rules': {
        'nameOrder': ['refine', 'card_or_enchant_title', 'base_name', 'slot_count'],
        'slotCountMeaning': 'itemInfo slotCount; total native card slots, not inserted-card count',
        'postfixRule': 'IDs listed in cardpostfixnametable render their client card title after the base equipment name',
        'duplicateRule': '2/3/4 identical card IDs collapse to the client duplicate prefix before the card title'
    }
}
OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'out': str(OUT), 'prefixes': len(prefix), 'postfixIds': len(postfix_ids), 'cardInfo': len(card_info), 'bytes': OUT.stat().st_size}, ensure_ascii=False))
