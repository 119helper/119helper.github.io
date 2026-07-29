import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'public', 'data');
const MANIFEST_PATH = path.join(DATA_DIR, 'manifest.json');
const TSUNAMI_SOURCE_URL = 'https://www.safetydata.go.kr/disaster-data/view?dataSn=1340';
const TSUNAMI_SOURCE_DATE_LABEL = '안전데이터 원본 갱신일';
const TSUNAMI_SOURCE_DATE_SOURCE = '재난안전데이터공유플랫폼 상세 메타데이터 updtymd';

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

const generatedAt = new Date().toISOString();
manifest.generatedAt = generatedAt;

const civilDirectory = path.join(DATA_DIR, 'civil');
const civilFiles = fs.existsSync(civilDirectory)
  ? fs.readdirSync(civilDirectory).filter(fileName => fileName.endsWith('.json'))
  : [];
const civilCities = Object.fromEntries(civilFiles.map(fileName => [
  path.basename(fileName, '.json'),
  readJson(path.join(civilDirectory, fileName)).length,
]));
const civilItems = readPartitionedArrays('civil');
const previousCivil = manifest.datasets.civil || {};
const civilSourceDateOverride = process.env.CIVIL_SOURCE_DATE || '';
manifest.datasets.civil = {
  ...previousCivil,
  label: '민방위 대피시설',
  path: '/data/civil/{city}.json',
  sourceUrl: previousCivil.sourceUrl || 'https://www.data.go.kr/data/15155067/openapi.do',
  sourceDate: civilSourceDateOverride || inferSourceDate(civilItems) || previousCivil.sourceDate || null,
  sourceDateSource: civilSourceDateOverride
    ? 'workflow manual override'
    : previousCivil.sourceDateSource || '원본 행 날짜 필드 최신값',
  generatedAt,
  maxAgeDays: previousCivil.maxAgeDays || 14,
  coverageScope: previousCivil.coverageScope || 'supported-cities',
  supportedCityCount: Object.keys(civilCities).length,
  completenessStatus: previousCivil.completenessStatus || 'scoped',
  total: civilItems.length,
  cities: civilCities,
};

const tsunamiItems = readArray('tsunami.json');
const previousTsunami = manifest.datasets.tsunami || {};
const tsunamiSourceDateOverride = process.env.TSUNAMI_SOURCE_DATE || '';
const tsunamiSourceDate = tsunamiSourceDateOverride || previousTsunami.sourceDate || null;
const tsunamiRegionCounts = Object.fromEntries(
  [...tsunamiItems.reduce((counts, item) => {
    const region = String(item.SHNT_PLACE_DTL_POSITION || item.RN_DTL_ADRES || '지역 미상')
      .trim()
      .split(/\s+/)[0] || '지역 미상';
    counts.set(region, (counts.get(region) || 0) + 1);
    return counts;
  }, new Map())].sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'ko')),
);
const tsunamiActiveTotal = tsunamiItems.filter(item => item.USE_AT !== 'N').length;
const tsunamiRawTotal = Number(previousTsunami.rawTotal) >= tsunamiItems.length
  ? Number(previousTsunami.rawTotal)
  : tsunamiItems.length;
const announcedTotal = Number(previousTsunami.announcedTotal);
const countDelta = Number.isFinite(announcedTotal)
  ? tsunamiItems.length - announcedTotal
  : undefined;
manifest.datasets.tsunami = {
  ...previousTsunami,
  label: '지진해일 대피소',
  path: '/data/tsunami.json',
  sourceUrl: TSUNAMI_SOURCE_URL,
  sourceDate: tsunamiSourceDate,
  generatedAt,
  maxAgeDays: previousTsunami.maxAgeDays || 90,
  coverageScope: 'covered-regions-official-api',
  completenessStatus: countDelta === 0 ? 'complete' : 'upstream-mismatch',
  total: tsunamiItems.length,
  rawTotal: tsunamiRawTotal,
  uniqueTotal: tsunamiItems.length,
  activeTotal: tsunamiActiveTotal,
  duplicateCount: tsunamiRawTotal - tsunamiItems.length,
  regionCounts: tsunamiRegionCounts,
  countDelta,
  reconciliationStatus: countDelta === 0 ? 'matched' : 'upstream-mismatch',
};
if (tsunamiSourceDate) {
  manifest.datasets.tsunami.sourceDateLabel = previousTsunami.sourceDateLabel || TSUNAMI_SOURCE_DATE_LABEL;
  manifest.datasets.tsunami.sourceDateSource = tsunamiSourceDateOverride
    ? 'workflow manual override'
    : previousTsunami.sourceDateSource || TSUNAMI_SOURCE_DATE_SOURCE;
}

writeJson(MANIFEST_PATH, manifest);

console.log(`civil sourceDate=${manifest.datasets.civil.sourceDate ?? 'null'} total=${civilItems.length}`);
console.log(`tsunami sourceDate=${manifest.datasets.tsunami.sourceDate ?? 'null'} total=${tsunamiItems.length}`);
