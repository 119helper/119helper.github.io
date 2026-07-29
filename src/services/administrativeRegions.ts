/**
 * 2026-07-01 행정구역 개편 호환 계층.
 *
 * 앱의 `gwangju`는 통합 특별시 전체가 아니라 종전 광주광역시 생활권(5개 구)을 뜻한다.
 * 공공 API가 새 시도명으로 광주·전남 전체를 반환하더라도 이 경계를 유지해야 한다.
 *
 * 인천은 시도명은 유지됐지만 구가 개편됐다. 새 구 이름과 과거 스냅샷의 옛 구 이름을
 * 모두 유효한 행정구로 취급하되, 주소에 구가 없는 도로명(예: "굴포로")을 구로 오인하지 않는다.
 */

/**
 * 공급자 요청에는 2026-07-01 이후 공식 시도명을 사용하되, 이 앱의 `gwangju`는
 * 종전 광주 5개 구만 가리킨다. 화면에는 통합 시도 전체로 오해할 수 있는 명칭을
 * 노출하지 않고 익숙한 광주광역시 권역명으로 표시한다.
 */
export const GWANGJU_LEGACY_NAME = '광주광역시';
export const GWANGJU_CURRENT_NAME = '전남광주통합특별시';
export const GWANGJU_DISPLAY_NAME = GWANGJU_LEGACY_NAME;

export const FORMER_GWANGJU_DISTRICTS = [
  '동구',
  '서구',
  '남구',
  '북구',
  '광산구',
] as const;

export const INCHEON_CURRENT_DISTRICTS = [
  '강화군',
  '계양구',
  '검단구',
  '남동구',
  '미추홀구',
  '부평구',
  '서해구',
  '연수구',
  '영종구',
  '옹진군',
  '제물포구',
] as const;

export const INCHEON_LEGACY_DISTRICTS = ['중구', '동구', '서구'] as const;

const GWANGJU_DISTRICT_SET = new Set<string>(FORMER_GWANGJU_DISTRICTS);
const GWANGJU_DISTRICT_PATTERN = FORMER_GWANGJU_DISTRICTS.join('|');

export const CITY_TO_CURRENT_PROVINCE: Record<string, string> = {
  seoul: '서울특별시',
  busan: '부산광역시',
  daegu: '대구광역시',
  incheon: '인천광역시',
  gwangju: GWANGJU_CURRENT_NAME,
  daejeon: '대전광역시',
  ulsan: '울산광역시',
  sejong: '세종특별자치시',
  jeju: '제주특별자치도',
};

/** 체크인된 과거 스냅샷의 실제 디렉터리/시도명. */
export const CITY_TO_STATIC_PROVINCE: Record<string, string> = {
  ...CITY_TO_CURRENT_PROVINCE,
  gwangju: GWANGJU_LEGACY_NAME,
};

/** 사용자에게 보여 주는 지역명. 공급자 조회용 CITY_TO_CURRENT_PROVINCE와 분리한다. */
export const CITY_TO_DISPLAY_PROVINCE: Record<string, string> = {
  ...CITY_TO_CURRENT_PROVINCE,
  gwangju: GWANGJU_DISPLAY_NAME,
};

function compactWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}
function firstTwoTokens(value: string): [string, string] {
  const [province = '', district = ''] = compactWhitespace(value).split(' ');
  return [province, district];
}

export function isFormerGwangjuAddress(value: string): boolean {
  const [province, district] = firstTwoTokens(value);
  if (!GWANGJU_DISTRICT_SET.has(district)) return false;
  return province === GWANGJU_LEGACY_NAME
    || province === GWANGJU_CURRENT_NAME
    || province === '광주';
}

/**
 * 광주 5개 구에 속한다고 확인된 문자열을 화면 표시용으로 정리한다.
 * scopedToFormerGwangju=true는 주소로 관할을 이미 확인한 기관명에도 쓸 수 있다.
 */
export function normalizeGwangjuDisplayText(
  value: string,
  scopedToFormerGwangju = false,
): string {
  let normalized = compactWhitespace(value);
  if (!normalized) return '';

  const isScoped = scopedToFormerGwangju
    || normalized === GWANGJU_CURRENT_NAME
    || isFormerGwangjuAddress(normalized);
  if (!isScoped) return normalized;

  normalized = normalized.replace(
    new RegExp(`^${GWANGJU_LEGACY_NAME}\\s+(${GWANGJU_DISTRICT_PATTERN})\\s+${GWANGJU_CURRENT_NAME}\\s+\\1\\s+`),
    `${GWANGJU_DISPLAY_NAME} $1 `,
  );
  normalized = normalized.replace(
    new RegExp(`^${GWANGJU_CURRENT_NAME}\\s+(${GWANGJU_DISTRICT_PATTERN})\\s+${GWANGJU_LEGACY_NAME}\\s+\\1\\s+`),
    `${GWANGJU_DISPLAY_NAME} $1 `,
  );
  normalized = normalized.replaceAll(GWANGJU_CURRENT_NAME, GWANGJU_DISPLAY_NAME);
  return compactWhitespace(normalized);
}

/**
 * 공급자 전환 중 관측된 중복 주소를 정리하고 광주 권역 표시명으로 반환한다.
 * 예: "광주광역시 서구 전남광주통합특별시 서구 내방로 111"
 */
export function normalizeLiveGwangjuAddress(value: string): string {
  return normalizeGwangjuDisplayText(value);
}

export function isAddressInAppCity(city: string, value: string): boolean {
  const address = compactWhitespace(value);
  if (!address) return false;
  if (city === 'gwangju') return isFormerGwangjuAddress(address);

  const province = CITY_TO_CURRENT_PROVINCE[city];
  return Boolean(province && (address === province || address.startsWith(`${province} `)));
}

export function recordMatchesAppCity(city: string, ...values: Array<string | null | undefined>): boolean {
  return values.some(value => Boolean(value && isAddressInAppCity(city, value)));
}

/**
 * 주소에서 실제 구/군 토큰만 뽑는다. 구/군이 생략된 도로명은 "기타"로 남긴다.
 */
export function districtFromAddress(value: string, city?: string): string {
  const tokens = compactWhitespace(value).split(' ').filter(Boolean);
  if (tokens.length < 2) return '기타';

  const province = tokens[0];
  const startIndex = province.endsWith('시') || province.endsWith('도') ? 1 : 0;
  const candidate = tokens.slice(startIndex).find(token =>
    token.length <= 12
    && (token.endsWith('구') || token.endsWith('군') || (city === 'jeju' && token.endsWith('시')))
  );
  return candidate || '기타';
}

/**
 * 재난문자 location_name은 쉼표로 여러 관할을 담는다.
 * 통합 특별시 산하 전남 시·군 문자를 종전 광주 알림으로 오인하지 않는다.
 */
export function disasterLocationMatchesCity(city: string, locationName: string): boolean {
  const locations = locationName.split(',').map(compactWhitespace).filter(Boolean);
  if (locations.some(location => location === '전국' || location.includes('전국'))) return true;
  if (city !== 'gwangju') {
    const shortName = CITY_TO_CURRENT_PROVINCE[city]?.replace(/(특별자치시|특별자치도|특별시|광역시)$/, '');
    return locations.some(location =>
      isAddressInAppCity(city, location)
      || Boolean(shortName && (location === shortName || location.startsWith(`${shortName} `)))
    );
  }

  return locations.some(location => {
    if (location === '광주' || location === GWANGJU_LEGACY_NAME || location === GWANGJU_CURRENT_NAME) return true;
    return isFormerGwangjuAddress(location);
  });
}
