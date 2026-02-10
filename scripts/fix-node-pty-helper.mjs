#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

function makeExecutableIfNeeded(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const stat = fs.statSync(filePath);
  const mode = stat.mode & 0o777;
  if ((mode & 0o111) !== 0) {
    return;
  }

  const nextMode = mode | 0o755;
  fs.chmodSync(filePath, nextMode);
  console.log(`[fix-node-pty] set executable bit: ${filePath}`);
}

function candidatePaths(nodePtyRoot) {
  const pairs = [
    ['prebuilds', 'darwin-arm64', 'spawn-helper'],
    ['prebuilds', 'darwin-x64', 'spawn-helper'],
    ['build', 'Release', 'spawn-helper'],
    ['build', 'Debug', 'spawn-helper']
  ];

  return pairs.map((parts) => path.join(nodePtyRoot, ...parts));
}

try {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve('node-pty/package.json');
  const nodePtyRoot = path.dirname(pkgPath);

  for (const filePath of candidatePaths(nodePtyRoot)) {
    makeExecutableIfNeeded(filePath);
  }
} catch (error) {
  console.warn(`[fix-node-pty] skipped: ${String(error)}`);
}
