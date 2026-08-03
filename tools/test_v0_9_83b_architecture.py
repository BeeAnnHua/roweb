from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
index = (ROOT / 'index.html').read_text(encoding='utf-8')
player = (ROOT / 'js/player.js').read_text(encoding='utf-8')
game = (ROOT / 'js/game.js').read_text(encoding='utf-8')
runtime = (ROOT / 'js/character_slots_runtime.js').read_text(encoding='utf-8')
css = (ROOT / 'css/style.css').read_text(encoding='utf-8')
background = ROOT / 'images/ui/character_select_background.webp'

checks = {
    'four-slot-overlay': 'id="characterSlotGrid"' in index and 'DEFAULT_SLOT_LIMIT = 4' in runtime,
    'runtime-before-player': index.index('character_slots_runtime.js') < index.index('player.js'),
    'dynamic-save-key': 'CharacterSlotsRuntime?.getActiveSaveKey' in player,
    'dynamic-idb-key': 'CharacterSlotsRuntime?.getActiveIndexedDbId' in player,
    'account-character-identity': all(token in runtime for token in ['accountId', 'characterId', 'slotIndex', 'revision']),
    'legacy-local-migration': 'migrateLegacySaveIfNeeded' in runtime,
    'legacy-idb-migration': 'migrateLegacyIndexedDbIfNeeded' in runtime,
    'async-idb-migration-reloads-save-key': 'player.js 已在本次頁面以 pending save key 載入' in runtime,
    'cloud-adapter-contract': 'registerCloudAdapter' in runtime and 'syncAccountToCloud' in runtime,
    'game-waits-selector': 'ensureActiveCharacterSelection' in game,
    'return-to-selector': 'returnToCharacterSelection()' in index,
    'responsive-layout': '@media (max-width: 560px)' in css and 'character-slot-grid' in css,
    'login-background': background.is_file() and 'character_select_background.webp' in css and 'rel="preload"' in index,
    'current-character-portrait': all(token in runtime for token in ['portraitSrc', 'characterAtlas', 'playerPortrait', 'portraitForSlot']),
    'location-summary': 'character-slot-location' in runtime and 'formatLocation' in runtime,
    'version': 'V0.9.83B' in index and '0.9.83B' in player and '0.9.83B' in game,
}
failed = [name for name, ok in checks.items() if not ok]
if failed:
    raise SystemExit('FAILED: ' + ', '.join(failed))
print(f'V0.9.83B architecture checks: {len(checks)}/{len(checks)} PASS')
