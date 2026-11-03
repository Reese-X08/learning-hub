'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('update-manifest.json 和当前代码保持一致', () => {
  const root = path.resolve(__dirname, '..');
  const output = execFileSync(process.execPath, [path.join(root, 'tools', 'build-update-manifest.js'), '--check'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.match(output, /已是最新/);
});
