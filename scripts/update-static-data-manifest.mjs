import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'public', 'data');
const MANIFEST_PATH = path.join(DATA_DIR, 'manifest.json');

const DATE_KEYS = [
  'DAT_UPDT_PNT',
  'LAST_MDFCN_PNT',
  'DATA_UPDT_DT',
  'UPDATED_AT',
  'updateDate',
  'referenceDate',
  'baseDate',
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function toIsoDate(value) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();

  const ymd = text.match(/^(\d{4})[-./]?(\d{2})[-./]?(\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function inferSourceDate(items) {
  const dates = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    for (const key of DATE_KEYS) {
      const date = toIsoDate(item[key]);
      if (date) dates.push(date);
    }
  }
  return dates.sort().at(-1) || null;
}

function readArray(fileName) {
  const value = readJson(path.join(DATA_DIR, fileName));
  return Array.isArray(value) ? value : [];
}

const manifest = readJson(MANIFEST_PATH);
manifest.datasets = manifest.datasets || {};

const generatedAt = new Date().toISOString().slice(0, 10);
manifest.generatedAt = generatedAt;

const civilItems = readArray('civil.json');
manifest.datasets.civil = {
  label: '민방위 대피시설',
  path: '/data/civil.json',
  sourceUrl: 'https://www.safekorea.go.kr',
  sourceDate: process.env.CIVIL_SOURCE_DATE || inferSourceDate(civilItems),
  generatedAt: manifest.datasets.civil?.generatedAt || generatedAt,
  maxAgeDays: 90,
  total: civilItems.length,
};

const tsunamiItems = readArray('tsunami.json');
manifest.datasets.tsunami = {
  label: '지진해일 대피소',
  path: '/data/tsunami.json',
  sourceUrl: 'https://www.safekorea.go.kr',
  sourceDate: process.env.TSUNAMI_SOURCE_DATE || manifest.datasets.tsunami?.sourceDate || null,
  generatedAt: manifest.datasets.tsunami?.generatedAt || generatedAt,
  maxAgeDays: 180,
  total: tsunamiItems.length,
};

writeJson(MANIFEST_PATH, manifest);

console.log(`civil sourceDate=${manifest.datasets.civil.sourceDate ?? 'null'} total=${civilItems.length}`);
console.log(`tsunami sourceDate=${manifest.datasets.tsunami.sourceDate ?? 'null'} total=${tsunamiItems.length}`);
