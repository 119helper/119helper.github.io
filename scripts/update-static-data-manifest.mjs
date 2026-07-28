import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'public', 'data');
const MANIFEST_PATH = path.join(DATA_DIR, 'manifest.json');
const TSUNAMI_SOURCE_URL = 'https://www.data.go.kr/data/15138870/openapi.do';
const TSUNAMI_SOURCE_DATE_LABEL = 'API 수정일';
const TSUNAMI_SOURCE_DATE_SOURCE = '공공데이터포털 행정안전부_지진해일 긴급대피장소 수정일';

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

function readPartitionedArrays(directoryName) {
  const directory = path.join(DATA_DIR, directoryName);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter(fileName => fileName.endsWith('.json'))
    .flatMap(fileName => readJson(path.join(directory, fileName)))
    .filter(item => item && typeof item === 'object');
}

const manifest = readJson(MANIFEST_PATH);
manifest.datasets = manifest.datasets || {};

const generatedAt = new Date().toISOString().slice(0, 10);
manifest.generatedAt = generatedAt;

const civilItems = readPartitionedArrays('civil');
const previousCivil = manifest.datasets.civil || {};
manifest.datasets.civil = {
  ...previousCivil,
  label: '민방위 대피시설',
  path: '/data/civil/{city}.json',
  sourceUrl: previousCivil.sourceUrl || 'https://www.data.go.kr/data/15155067/openapi.do',
  sourceDate: process.env.CIVIL_SOURCE_DATE || inferSourceDate(civilItems) || previousCivil.sourceDate || null,
  generatedAt: previousCivil.generatedAt || generatedAt,
  maxAgeDays: previousCivil.maxAgeDays || 14,
  total: civilItems.length,
};

const tsunamiItems = readArray('tsunami.json');
const previousTsunami = manifest.datasets.tsunami || {};
const tsunamiSourceDate = process.env.TSUNAMI_SOURCE_DATE || previousTsunami.sourceDate || null;
manifest.datasets.tsunami = {
  label: '지진해일 대피소',
  path: '/data/tsunami.json',
  sourceUrl: TSUNAMI_SOURCE_URL,
  sourceDate: tsunamiSourceDate,
  generatedAt: previousTsunami.generatedAt || generatedAt,
  maxAgeDays: 180,
  total: tsunamiItems.length,
};
if (tsunamiSourceDate) {
  manifest.datasets.tsunami.sourceDateLabel = previousTsunami.sourceDateLabel || TSUNAMI_SOURCE_DATE_LABEL;
  manifest.datasets.tsunami.sourceDateSource = previousTsunami.sourceDateSource || TSUNAMI_SOURCE_DATE_SOURCE;
}

writeJson(MANIFEST_PATH, manifest);

console.log(`civil sourceDate=${manifest.datasets.civil.sourceDate ?? 'null'} total=${civilItems.length}`);
console.log(`tsunami sourceDate=${manifest.datasets.tsunami.sourceDate ?? 'null'} total=${tsunamiItems.length}`);
