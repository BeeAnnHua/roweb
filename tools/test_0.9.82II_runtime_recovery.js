'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');const ROOT=path.resolve(__dirname,'..');
function extractFunction(src,name){const start=src.indexOf(`function ${name}(`);if(start<0)throw new Error(`missing ${name}`);let brace=src.indexOf('{',start),depth=0;for(let i=brace;i<src.length;i++){if(src[i]==='{')depth++;else if(src[i]==='}'&&!--depth)return src.slice(start,i+1)}throw new Error('unclosed')}
(async()=>{const checks=[];const add=(n,v)=>checks.push([n,!!v]);
 const battle=fs.readFileSync(path.join(ROOT,'js/battle.js'),'utf8');
 global.autoBattleRunning=true;global.autoBattleTimer=null;global.autoBattleNextDueAt=0;global.autoBattleScheduleGeneration=0;global.AUTO_BATTLE_MIN_SCHEDULE_MS=8;global.tickCount=0;global.runAutoBattleControllerTick=()=>{global.tickCount++;if(global.tickCount===1)throw new Error('synthetic status render interruption')};global.getAutoBattleNextDelayMs=()=>8;
 vm.runInThisContext(extractFunction(battle,'scheduleAutoBattleTick'));
 scheduleAutoBattleTick(8);await new Promise(r=>setTimeout(r,55));autoBattleRunning=false;if(autoBattleTimer)clearTimeout(autoBattleTimer);
 add('scheduler_recovers_after_throw',tickCount>=2);add('scheduler_has_finally',/finally\s*\{/.test(extractFunction(battle,'scheduleAutoBattleTick')));add('status_recovery_export',battle.includes('window.recoverAutoBattleScheduler = recoverAutoBattleScheduler'));
 const world=fs.readFileSync(path.join(ROOT,'js/world_monster_test_runtime.js'),'utf8');const attackFn=extractFunction(world,'worldMonsterAttackPlayer');add('startup_no_automatic_retaliation',!attackFn.includes('requestManualRetaliationAgainstMonster('));add('manual_click_preserved',world.includes('startManualMonsterAttack(entity, { immediate: true })'));
 const skill=fs.readFileSync(path.join(ROOT,'js/skill_engine.js'),'utf8');global.window=global;global.skillsData={runtimeProfiles:{'2214':{skillId:2214,skillKey:'WL_CHAINLIGHTNING',handler:'chain_magic',runtimeProfile:{handler:'chain_magic'}}},skillIndex:{'2214':{key:'WL_CHAINLIGHTNING'}}};
 for(const fn of ['rebuildRuntimeProfileKeyIndex','resolveSkillRuntimeProfileRow','getSkillRuntimeProfile'])vm.runInThisContext(extractFunction(skill,fn));
 add('chain_by_official_id',getSkillRuntimeProfile({officialId:2214})?.handler==='chain_magic');add('chain_by_skill_key',getSkillRuntimeProfile({id:999999,key:'WL_CHAINLIGHTNING'})?.handler==='chain_magic');add('chain_bonus_key_alias',getSkillRuntimeProfile({id:999998,skillKey:'WL_CHAINLIGHTNING_ATK'})?.handler==='chain_magic');add('chain_numeric_id',getSkillRuntimeProfile(2214)?.handler==='chain_magic');
 const failed=checks.filter(x=>!x[1]);console.log(JSON.stringify({pass:!failed.length,checks:Object.fromEntries(checks),failed:failed.map(x=>x[0])},null,2));process.exit(failed.length?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
