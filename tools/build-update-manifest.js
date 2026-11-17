'use strict';

/**
 * 生成 update-manifest.json：应用内自更新只下载清单里列出的、和本地哈希不同的文件。
 *
 *   node tools/build-update-manifest.js          # 写清单
 *   node tools/build-update-manifest.js --check  # 只检查清单是否最新（CI/本地校验）
 *
 * 文本文件统一按 LF 计算哈希，和 lib/self-update.js 的规则保持一致，
 * 这样 Windows 的 CRLF 检出不会和 GitHub 上的 LF 文件对不上。
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { validateRelativePath } = require('../lib/self-update.js');

const root = path.resolve(__dirname, '..');
const outputFile = path.join(root, 'update-manifest.json');
const TEXT_FILE = /\.(?:js|json|html|css|webmanifest|svg|txt|ps1)$/i;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;

function normalize(buffer, relative) {
  if (!TEXT_FILE.test(relative)) return buffer;
  return Buffer.from(buffer.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
}

function addFile(files, relative) {
  const rel = relative.replace(/\\/g, '/');
  if (rel === 'lib/restart-helper.js') return;
  if (!validateRelativePath(rel)) throw new Error(`这个文件不允许自动更新：${rel}`);

  const abs = path.join(root, ...rel.split('/'));
  const stat = fs.statSync(abs);
  if (!stat.isFile()) return;

  const buffer = normalize(fs.readFileSync(abs), rel);
  if (buffer.length > MAX_FILE_BYTES) throw new Error(`文件太大：${rel}`);
  files.push({
    path: rel,
    size: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  });
}

function walk(files, dirRelative) {
  const abs = path.join(root, ...dirRelative.split('/'));
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const rel = `${dirRelative}/${entry.name}`;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) walk(files, rel);
    else if (entry.isFile()) addFile(files, rel);
  }
}

function build() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const files = [];

  for (const rel of ['server.js', 'package.json', 'version.json', 'updater.ps1']) addFile(files, rel);
  walk(files, 'lib');
  walk(files, 'public');

  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_TOTAL_BYTES) throw new Error('清单总大小超过限制');

  return {
    format: 1,
    version: pkg.version,
    files,
  };
}

const manifest = build();
const text = `${JSON.stringify(manifest, null, 2)}\n`;

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = fs.readFileSync(outputFile, 'utf8').replace(/\r\n/g, '\n');
  } catch {
    console.error('缺少 update-manifest.json，请先运行 node tools/build-update-manifest.js');
    process.exit(1);
  }
  if (current !== text) {
    console.error('update-manifest.json 和当前文件不一致，请重新生成并提交');
    process.exit(1);
  }
  console.log(`update-manifest.json 已是最新（${manifest.files.length} 个文件）`);
} else {
  fs.writeFileSync(outputFile, text, 'utf8');
  const kb = Math.round(Buffer.byteLength(text, 'utf8') / 1024);
  console.log(`已生成 update-manifest.json：v${manifest.version}，${manifest.files.length} 个文件，清单 ${kb} KB`);
}
