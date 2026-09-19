// 민방위 대피시설 동기화가 불완전한 수집 결과로 기존 파일을 덮어쓰지 않도록 막는 검사.

export const MAX_CITY_SHRINK_RATIO = 0.1;

/** 원본 totalCount만큼 실제로 받았는지 확인한다. 빈 페이지 하나로 100곳이 빠지는 것을 막는다. */
export function assertCompleteFetch({ totalCount, receivedCount }) {
  if (!Number.isFinite(totalCount) || totalCount <= 0) {
    throw new Error(`민방위대피시설 원본 totalCount가 비정상입니다(${totalCount}). 기존 파일을 보존합니다.`);
  }
  if (receivedCount < totalCount) {
    throw new Error(
      `민방위대피시설 원본 ${totalCount}건 중 ${receivedCount}건만 수신해 기존 파일을 보존합니다.`,
    );
  }
}

/**
 * 커밋된 도시별 건수와 비교해 급감한 도시를 찾는다.
 * 공식 축소를 확인한 경우에만 allowShrink로 통과시킨다.
 */
export function assertNoCityShrink(previousCities, nextCities, { allowShrink = false, maxShrinkRatio = MAX_CITY_SHRINK_RATIO } = {}) {
  if (allowShrink || !previousCities) return;

  const shrunk = Object.entries(previousCities)
    .filter(([, previous]) => Number.isFinite(previous) && previous > 0)
    .map(([city, previous]) => ({ city, previous, next: nextCities[city] ?? 0 }))
    .filter(({ previous, next }) => next < Math.floor(previous * (1 - maxShrinkRatio)));

  if (shrunk.length > 0) {
    const detail = shrunk.map(({ city, previous, next }) => `${city} ${previous}→${next}`).join(', ');
    throw new Error(
      `민방위대피시설이 급감해 기존 파일을 보존합니다: ${detail}. `
      + '공식 축소를 확인했다면 CIVIL_ALLOW_SHRINK=1로 다시 실행하세요.',
    );
  }
}
