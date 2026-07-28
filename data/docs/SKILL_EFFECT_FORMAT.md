# RO_WEB Skill Effect Format

- Image: `images/skill_effects/{SkillID}.png`
- Animation JSON: `data/skill_effects/{SkillID}.json`
- Do not load official SPR/ACT in RO_WEB.
- Effect JSON stores atlas animation and normalized image origin only.
- World position is decided at cast time: mouse ground point for manual play, AI-selected target/group center for auto battle.
