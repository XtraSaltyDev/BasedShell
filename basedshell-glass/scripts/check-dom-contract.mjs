import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`[check:dom-contract] Unable to read ${filePath}:`, error);
    process.exit(1);
  }
}

function extractRequiredSelectors(sourceText) {
  const selectorRegex = /assertDom\([^,]+,\s*['"](#[-A-Za-z0-9_]+)['"]\)/g;
  const selectors = new Set();
  let match = selectorRegex.exec(sourceText);
  while (match) {
    const selector = match[1];
    if (selector) {
      selectors.add(selector);
    }
    match = selectorRegex.exec(sourceText);
  }

  return selectors;
}

function extractIds(sourceText) {
  const idRegex = /\sid=['"]([-A-Za-z0-9_]+)['"]/g;
  const ids = new Set();
  const counts = new Map();

  let match = idRegex.exec(sourceText);
  while (match) {
    const id = match[1];
    if (id) {
      ids.add(id);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    match = idRegex.exec(sourceText);
  }

  const duplicates = [...counts.entries()]
    .filter((entry) => entry[1] > 1)
    .map((entry) => `${entry[0]} (x${entry[1]})`)
    .sort();

  return { ids, duplicates };
}

const root = process.cwd();
const mainFile = path.join(root, 'src', 'renderer', 'main.ts');
const htmlFile = path.join(root, 'src', 'renderer', 'index.html');

const mainSource = readText(mainFile);
const htmlSource = readText(htmlFile);

const requiredSelectors = extractRequiredSelectors(mainSource);
const { ids: htmlIds, duplicates } = extractIds(htmlSource);

const missing = [...requiredSelectors]
  .map((selector) => selector.slice(1))
  .filter((id) => !htmlIds.has(id))
  .sort();

if (duplicates.length > 0) {
  console.error('[check:dom-contract] Duplicate HTML ids detected in src/renderer/index.html:');
  for (const entry of duplicates) {
    console.error(`  - ${entry}`);
  }
  process.exit(1);
}

if (missing.length > 0) {
  console.error('[check:dom-contract] Renderer DOM contract mismatch found.');
  console.error('main.ts requires these ids via assertDom, but index.html is missing them:');
  for (const id of missing) {
    console.error(`  - ${id}`);
  }
  process.exit(1);
}

console.log(
  `[check:dom-contract] OK (${requiredSelectors.size} required selectors validated against ${htmlIds.size} HTML ids).`
);
