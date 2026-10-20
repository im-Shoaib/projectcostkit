#!/usr/bin/env node
/*
 * Rebuilds the whole site from content/.
 *   node build.js            build with today's date (your local time zone)
 *   node build.js 2026-11-03 build as if it were that date (for checking scheduled posts)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const builder = require('./admin/builder.js');
const icons = require('./admin/icons.js');
const marked = require('./admin/vendor/marked.min.js');

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { throw new Error('Could not read ' + path.relative(ROOT, file) + ': ' + e.message); }
}
function readDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => readJson(path.join(dir, f)));
}

function main() {
  let now = new Date();
  const arg = process.argv[2];
  if (arg && /^\d{4}-\d{2}-\d{2}$/.test(arg)) {
    const [y, m, d] = arg.split('-').map(Number);
    now = new Date(y, m - 1, d, 12, 0, 0);
  }
  const site = readJson(path.join(ROOT, 'content/site.json'));
  const posts = readDir(path.join(ROOT, 'content/posts'));
  const pages = readDir(path.join(ROOT, 'content/pages'));
  const css = fs.readFileSync(path.join(ROOT, 'assets/css/style.css'), 'utf8');

  const out = builder.build({ site, posts, pages, css, marked, now, icons });

  const manifestFile = path.join(ROOT, 'content/.build.json');
  const previous = fs.existsSync(manifestFile) ? readJson(manifestFile).files || [] : [];
  const current = Object.keys(out.files).sort();

  let written = 0;
  for (const rel of current) {
    const file = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const data = out.files[rel];
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === data) continue;
    fs.writeFileSync(file, data);
    written++;
  }
  let removed = 0;
  for (const rel of previous) {
    if (out.files[rel] !== undefined) continue;
    const file = path.join(ROOT, rel);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      removed++;
      let dir = path.dirname(file);
      while (dir !== ROOT && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) { fs.rmdirSync(dir); dir = path.dirname(dir); }
    }
  }
  const manifest = JSON.stringify({ files: current }, null, 1) + '\n';
  if (!fs.existsSync(manifestFile) || fs.readFileSync(manifestFile, 'utf8') !== manifest) fs.writeFileSync(manifestFile, manifest);

  console.log('Built ' + out.live.length + ' live articles (' + out.skipped.length + ' scheduled or draft). ' + current.length + ' files, ' + written + ' changed, ' + removed + ' removed.');
  if (out.warnings.length) console.log('Warnings:\n  - ' + out.warnings.join('\n  - '));
}

main();
