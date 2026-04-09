/**
 * 법제처 Open API 서비스
 * Worker 프록시(/api/law/*)를 통해 법령 검색 및 본문 조회
 */

const API_BASE = import.meta.env.DEV
  ? 'http://localhost:8787'
  : (import.meta.env.VITE_API_BASE || 'https://119-helper-api.teemozipsa.workers.dev');

// ── 검색 결과 타입 ──
export interface LawSearchItem {
  법령일련번호: string;   // 고유 MST
  현행연혁코드: string;
  법령명한글: string;
  법령약칭명: string;
  법령ID: string;
  공포일자: string;
  공포번호: string;
  제개정구분명: string;
  소관부처명: string;
  법령구분명: string;     // 법률, 대통령령, 총리령, 부령
  시행일자: string;
  자법타법여부: string;
  법령상세링크: string;
}

export interface LawSearchResponse {
  LawSearch?: {
    totalCnt: string;
    page: string;
    law?: LawSearchItem | LawSearchItem[];
  };
  // 에러 경우
  result?: string;
  msg?: string;
}

// ── 본문 조회 타입 ──
export interface LawArticle {
  조문번호: string;
  조문여부: string;
  조문제목?: string;
  조문시행일자?: string;
  조문내용?: string;
  항?: LawParagraph | LawParagraph[];
}

export interface LawParagraph {
  항번호: string;
  항내용?: string;
  호?: LawSubItem | LawSubItem[];
}

export interface LawSubItem {
  호번호: string;
  호내용?: string;
}

export interface LawDetailResponse {
  법령?: {
    기본정보?: {
      법령명_한글?: string;
      법령명_약칭?: string;
      법령ID?: string;
      공포일자?: string;
      공포번호?: string;
      시행일자?: string;
      소관부처명?: string;
      법령구분명?: string;
      제개정구분명?: string;
      법령일련번호?: string;
    };
    조문?: {
      조문단위?: LawArticle | LawArticle[];
    };
    부칙?: any;
  };
  // 에러
  result?: string;
  msg?: string;
}

// ── API 함수 ──

const searchCache = new Map<string, { data: LawSearchResponse; ts: number }>();
const detailCache = new Map<string, { data: LawDetailResponse; ts: number }>();

/** 법령 검색 (키워드) */
export async function searchLaw(
  query: string,
  page = 1,
  display = 20
): Promise<{ items: LawSearchItem[]; totalCnt: number }> {
  const cacheKey = `${query}|${page}|${display}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 3600_000) {
    return parseSearchResponse(cached.data);
  }

  const params = new URLSearchParams({
    query,
    page: String(page),
    display: String(display),
  });

  const res = await fetch(`${API_BASE}/api/law/search?${params}`);
  if (!res.ok) throw new Error(`Law search error ${res.status}`);

  const data: LawSearchResponse = await res.json();

  // 에러 응답 체크
  if (data.result) {
    throw new Error(data.msg || data.result);
  }

  searchCache.set(cacheKey, { data, ts: Date.now() });
  return parseSearchResponse(data);
}

function parseSearchResponse(data: LawSearchResponse): { items: LawSearchItem[]; totalCnt: number } {
  if (!data.LawSearch) return { items: [], totalCnt: 0 };

  const totalCnt = parseInt(data.LawSearch.totalCnt || '0');
  const raw = data.LawSearch.law;

  if (!raw) return { items: [], totalCnt };
  const items = Array.isArray(raw) ? raw : [raw];

  return { items, totalCnt };
}

/** 법령 본문 조회 (MST) */
export async function getLawDetail(mst: string): Promise<LawDetailResponse> {
  const cached = detailCache.get(mst);
  if (cached && Date.now() - cached.ts < 86400_000) {
    return cached.data;
  }

  const params = new URLSearchParams({ id: mst });
  const res = await fetch(`${API_BASE}/api/law/detail?${params}`);
  if (!res.ok) throw new Error(`Law detail error ${res.status}`);

  const text = await res.text();

  // JSON인지 확인
  let data: LawDetailResponse;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('법령 본문을 파싱할 수 없습니다 (비-JSON 응답)');
  }

  if (data.result) {
    throw new Error(data.msg || data.result);
  }

  detailCache.set(mst, { data, ts: Date.now() });
  return data;
}

// ── 소방 관련 빠른 검색 키워드 ──
export const FIRE_LAW_PRESETS = [
  { label: '소방기본법', query: '소방기본법' },
  { label: '소방시설법', query: '소방시설 설치 및 관리에 관한 법률' },
  { label: '화재예방법', query: '화재의 예방 및 안전관리에 관한 법률' },
  { label: '위험물법', query: '위험물안전관리법' },
  { label: '다중이용업소법', query: '다중이용업소의 안전관리에 관한 특별법' },
  { label: '119구조구급법', query: '119구조·구급에 관한 법률' },
  { label: '의용소방대법', query: '의용소방대 설치 및 운영에 관한 법률' },
  { label: '소방공무원법', query: '소방공무원법' },
] as const;
