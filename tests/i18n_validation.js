'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dictionarySource = fs.readFileSync(path.join(root, 'assets/js/i18n.js'), 'utf8');
const enMarker = dictionarySource.indexOf('\n    en: {');
if (enMarker < 0) throw new Error('English dictionary block not found');

function keysFrom(source) {
  return [...source.matchAll(/^\s*'([^']+)'\s*:/gm)].map((match) => match[1]);
}

function duplicates(keys) {
  const seen = new Set();
  const repeated = new Set();
  keys.forEach((key) => {
    if (seen.has(key)) repeated.add(key);
    seen.add(key);
  });
  return [...repeated];
}

function fail(message, values) {
  const detail = values && values.length ? `: ${values.join(', ')}` : '';
  throw new Error(`${message}${detail}`);
}

const idKeys = keysFrom(dictionarySource.slice(0, enMarker));
const enKeys = keysFrom(dictionarySource.slice(enMarker));
const idSet = new Set(idKeys);
const enSet = new Set(enKeys);

const duplicateId = duplicates(idKeys);
const duplicateEn = duplicates(enKeys);
const missingInEn = idKeys.filter((key) => !enSet.has(key));
const missingInId = enKeys.filter((key) => !idSet.has(key));

if (duplicateId.length) fail('Duplicate Indonesian keys', duplicateId);
if (duplicateEn.length) fail('Duplicate English keys', duplicateEn);
if (missingInEn.length) fail('Keys missing in English', missingInEn);
if (missingInId.length) fail('Keys missing in Indonesian', missingInId);

const uiFiles = [
  'index.php',
  'login.php',
  'assets/js/app.js',
  'assets/js/app-update.js',
];
const uiSource = uiFiles
  .map((file) => fs.readFileSync(path.join(root, file), 'utf8'))
  .join('\n');
const usedKeys = new Set(
  [...uiSource.matchAll(/(?:data-i18n(?:-title|-aria|-placeholder)?=["']|\bt\(\s*["'])([A-Za-z0-9_.-]+)/g)]
    .map((match) => match[1]),
);
const undefinedKeys = [...usedKeys].filter((key) => !idSet.has(key) || !enSet.has(key));
if (undefinedKeys.length) fail('Undefined UI translation keys', undefinedKeys);

if (/[âÃÂ�]/.test(uiSource)) {
  throw new Error('Mojibake marker found in UI source');
}

console.log(`i18n validation: OK (${idKeys.length} synchronized keys, ${usedKeys.size} used keys)`);
