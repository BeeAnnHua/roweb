from pathlib import Path
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
manifest_path = ROOT / 'assets/characters/manifest.generated.json'
background_path = ROOT / 'images/ui/character_select_background.webp'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
characters = manifest.get('characters', {})

errors = []
for key, row in characters.items():
    idle = str(row.get('idle_image') or '')
    if not idle:
        errors.append(f'{key}: missing idle_image')
        continue
    path = ROOT / idle
    if not path.is_file():
        errors.append(f'{key}: missing {idle}')
    gender = str(row.get('gender') or '')
    suffix = f'_{gender}'
    if not key.endswith(suffix):
        errors.append(f'{key}: key does not end with {suffix}')
        continue
    folder = key[:-len(suffix)]
    derived = f'assets/characters/{folder}/{gender}/idle.png'
    if derived != idle:
        errors.append(f'{key}: runtime-derived portrait {derived} != manifest {idle}')

if not background_path.is_file():
    errors.append('character select background missing')
else:
    with Image.open(background_path) as image:
        if image.format != 'WEBP':
            errors.append(f'background format is {image.format}, expected WEBP')
        if image.size != (1920, 1080):
            errors.append(f'background size is {image.size}, expected 1920x1080')

if errors:
    raise SystemExit('FAILED:\n' + '\n'.join(errors))
print(f'V0.9.83B portrait/background checks: {len(characters)}/{len(characters)} portraits + background PASS')
