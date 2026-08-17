#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const failures = [];
const checks = [];

function pass(label) { checks.push(label); }
function fail(label, detail) { failures.push(`${label}: ${detail}`); }
function read(relativePath) { return fs.readFileSync(path.join(root, relativePath), "utf8"); }
function expectIncludes(relativePath, needles) {
  const text = read(relativePath);
  for (const needle of needles) {
    if (!text.includes(needle)) fail(relativePath, `missing ${JSON.stringify(needle)}`);
  }
  if (!failures.some(item => item.startsWith(`${relativePath}:`))) pass(`${relativePath} guards`);
}

function walkJson(directory) {
  const stack = [directory];
  let count = 0;
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes:true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
        count += 1;
        try { JSON.parse(fs.readFileSync(full, "utf8").replace(/^\uFEFF/, "")); }
        catch (error) { fail(path.relative(root, full), error.message); }
      }
    }
  }
  if (!failures.some(item => item.includes(".json:"))) pass(`all JSON parsed (${count})`);
  return count;
}

const effectDirectory = path.join(root, "assets", "skill_effects", "v92", "data");
const effectFiles = fs.readdirSync(effectDirectory).filter(name => name.endsWith(".effect.json"));
for (const file of effectFiles) {
  const text = fs.readFileSync(path.join(effectDirectory, file), "utf8");
  if (/\b(?:Infinity|NaN)\b/.test(text)) fail(file, "contains a non-JSON numeric token");
}
if (!failures.some(item => item.includes("non-JSON numeric token"))) pass(`effect numbers finite (${effectFiles.length})`);

walkJson(root);

for (const relativePath of ["js/player.js", "js/skill_engine.js", "js/skill_effect_runtime_v92.js", "js/game.js"]) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, relativePath)], { encoding:"utf8" });
  if (result.status !== 0) fail(relativePath, String(result.stderr || result.stdout || "syntax check failed").trim());
  else pass(`${relativePath} syntax`);
}

expectIncludes("index.html", [
  "彼岸花仙境 V0.9.88B11",
  "./js/player.js?v=0.9.88B11",
  "./js/skill_engine.js?v=0.9.88B11",
  "./js/skill_effect_runtime_v92.js?v=0.9.88B11",
  "./js/game.js?v=0.9.88B11"
]);
expectIncludes("js/player.js", [
  'const RO_WEB_SAVE_APP_VERSION = "0.9.88B11"',
  "SAVE_FINAL_LIFECYCLE_DEDUP_MS",
  "mainOk && backupDue",
  "forceBackup:true",
  "RO_WEB_LAST_FINAL_LIFECYCLE_FLUSH_AT"
]);
expectIncludes("js/skill_engine.js", [
  "const caster = player",
  "source:caster",
  "defeatMonster(target)"
]);
expectIncludes("js/skill_effect_runtime_v92.js", [
  "Number.isFinite(number)",
  "Number.isFinite(animationDelta)"
]);
expectIncludes("js/game.js", ['const RO_WEB_VERSION = "0.9.88B11"']);

const saveWriteTest = spawnSync(process.execPath, [path.join(root, "tools", "test_v0_9_88b11_save_write_reduction.js")], { encoding:"utf8" });
if (saveWriteTest.status !== 0) {
  fail("save write reduction runtime", String(saveWriteTest.stderr || saveWriteTest.stdout || "runtime test failed").trim());
} else {
  pass("save write reduction runtime");
}

if (failures.length) {
  console.error(`RO_WEB V0.9.88B11 health check failed (${failures.length})`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log(`RO_WEB V0.9.88B11 health check passed (${checks.length} checks)`);
checks.forEach(item => console.log(`- ${item}`));
