'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(process.argv[2] || '.');
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.js')) files.push(full);
  }
}
walk(root);
files.sort();
const errors = [];
for (const file of files) {
  try {
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: path.relative(root, file) });
  } catch (error) {
    errors.push(`${path.relative(root, file)}: ${error && (error.stack || error.message) || error}`);
  }
}
process.stdout.write(JSON.stringify({ checked: files.length, errors }));
process.exit(errors.length ? 1 : 0);
