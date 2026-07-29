/**
 * 119 Helper API Gateway ??Cloudflare Worker
 * 
 * 모든 ?? API ?출???리하??API ?? ?버 측에?보??니??
 * ?론?엔??SPA)????Worker??/api/* ?드?인?만 ?출?니??
 */

import { handleOptions, jsonResponse, errorResponse, isOriginAllowed, isAppTokenRequired, isAppTokenValid, checkRateLimitDistributed, rateLimitResponse, applyCors, type RateLimitBinding } from './middleware/cors';
import { handleClientLog } from './routes/clientLog';
import { handleWeather } from './routes/weather';
import { handleWeatherAlerts } from './routes/weatherAlerts';
import { handleAir } from './routes/air';
import { handleER } from './routes/er';
import { handleBuilding } from './routes/building';
import { handleFireWater } from './routes/firewater';
import { handleHoliday } from './routes/holiday';
import { handleMultiUse } from './routes/multiuse';
import { handleShelter } from './routes/shelter';
import { handleEmergencyStats } from './routes/emergencyStats';
import { handleEmergencyInfo } from './routes/emergencyInfo';
import { handleFireInfo } from './routes/fireInfo';
import { handleAnnualFireStats } from './routes/annualFireStats';
import { handleFireObject } from './routes/fireObject';
import { handleFireDamage } from './routes/fireDamage';
import { handleCivilShelter } from './routes/civilShelter';
import { handleEquipment } from './routes/equipment';

import { newsHandler, prefetchNews } from './routes/news';
import { handleWildfire } from './routes/wildfire';
import { handleForestFireRisk } from './routes/forestFireRisk';
import { handleTsunamiShelter } from './routes/tsunamiShelter';
import { handleLaw } from './routes/law';
import { handleDisasterMsg } from './routes/disaster';
import { handleConsumerHazard } from './routes/consumerHazard';
import { handleAmbulance } from './routes/ambulance';
import { handleAed } from './routes/aed';
import { handleDamDischarge } from './routes/damDischarge';
import { readLastKnownGood, saveLastKnownGood } from './referenceCache';

export interface Env {
  KMA_API_KEY: string;
  ER_API_KEY: string;
  /** data.go.kr 계정 공용 키. 미설정 시 기존 ER_API_KEY를 함께 사용한다. */
  PUBLIC_DATA_API_KEY?: string;
  DAM_DISCHARGE_ENABLED?: string;
  AIR_API_KEY: string;
  BUILDING_API_KEY: string;
  FIRE_WATER_API_KEY: string;
  HOLIDAY_API_KEY: string;
  MULTI_USE_API_KEY: string;
  SHELTER_API_KEY: string;
  EMERGENCY_API_KEY: string;
  FIRE_INFO_API_KEY: string;
  ANNUAL_FIRE_API_KEY: string;
  FIRE_OBJECT_API_KEY: string;
  FIRE_DAMAGE_API_KEY: string;
  WILDFIRE_API_KEY: string;
  CIVIL_SHELTER_API_KEY: string;
  FOREST_FIRE_API_KEY: string;
  TSUNAMI_SHELTER_API_KEY: string;
  DISASTER_API_KEY: string;
  EQUIPMENT_API_KEY: string;
  CONSUMER_HAZARD_API_KEY: string;
  AMBULANCE_API_KEY: string;
  ENVIRONMENT: string;
  NAVER_CLIENT_ID?: string;
  NAVER_CLIENT_SECRET?: string;
  NEWS_CACHE: KVNamespace;
  /** 심층 방어용 공유 앱 토큰. 운영 환경에서는 필수이며 X-App-Token 헤더와 일치해야 함. */
  APP_ACCESS_TOKEN?: string;
  /** Cloudflare 네이티브 Rate Limiting 바인딩. 미설정 시 in-memory 폴백. */
  RATE_LIMITER?: RateLimitBinding;
}

async function cachePutBestEffort(cache: Cache, request: Request, response: Response): Promise<void> {
  try {
    await cache.put(request, response);
  } catch (error) {
    console.warn('[Worker cache] put failed', error);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Preflight
    if (request.method === 'OPTIONS') {
      return handleOptions(request, env.ENVIRONMENT);
    }

    // 허용된 Origin만 통과 (브라우저 강제 헤더 — 1차 방어)
    if (!isOriginAllowed(request, env.ENVIRONMENT)) {
      return new Response('Forbidden', { status: 403 });
    }

    // 운영 환경에서는 공유 앱 토큰 누락을 설정 오류로 취급한다.
    if (isAppTokenRequired(env.ENVIRONMENT) && !env.APP_ACCESS_TOKEN?.trim()) {
      return errorResponse('APP_ACCESS_TOKEN is not configured for production', request, 500, env.ENVIRONMENT);
    }

    // 공유 앱 토큰 검사 (Origin 위조 대비 심층 방어). 로컬/테스트 미설정 시 생략.
    if (!isAppTokenValid(request, env.APP_ACCESS_TOKEN)) {
      return new Response('Forbidden', { status: 403 });
    }

    // 분산 Rate Limiting (네이티브 바인딩 우선, 없으면 in-memory 폴백)
    const rateCheck = await checkRateLimitDistributed(request, env.RATE_LIMITER);
    if (!rateCheck.allowed) {
      return rateLimitResponse(request, env.ENVIRONMENT);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // 클라이언트 오류 텔레메트리 수집 (POST). 관측성 확보용.
    if (request.method === 'POST' && path === '/api/client-log') {
      return await handleClientLog(request);
    }

    // 그 외에는 GET만 허용
    if (request.method !== 'GET') {
      return errorResponse('Method not allowed', request, 405, env.ENVIRONMENT);
    }

    try {
      const cacheUrl = new URL(url.toString());
      cacheUrl.searchParams.delete('_t'); // 브라우저 캐시버스터 파라미터 무시

      // 전역 엣지 캐시 버전 — 과거에 빈 배열/에러 응답이 정상처럼 캐싱된 것을 일괄 무효화
      cacheUrl.searchParams.set('_ev', '2');

      if (path.startsWith('/api/fire-annual/')) {
        cacheUrl.searchParams.set('_cv', '3'); // 기존 캐시 버전 관리용
      }
      if (path === '/api/dam-discharge') {
        cacheUrl.searchParams.set('_cv', '1'); // 승인 대기 응답 캐시 무효화
      }
      if (path === '/api/multiuse') {
        cacheUrl.searchParams.set('_cv', '1'); // 정적 전용 응답에서 승인 API 우선 조회로 전환
      }
      if (path === '/api/er/list') {
        cacheUrl.searchParams.set('_cv', '1'); // 기관 목록 50건 제한 응답 무효화
      }
      if (path.startsWith('/api/emergency/')) {
        cacheUrl.searchParams.set('_cv', '1'); // 본부명·응답 필드·상세조회 파라미터 교정 전 캐시 무효화
      }

      const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
      const cache = caches.default;

      // 1. 공용 캐시(Edge Cache) ?중 ?? ?인
      const cached = await cache.match(cacheKey);
      if (cached) {
        return applyCors(cached, request, env.ENVIRONMENT);
      }

      // 2. 캐시가 ?으??본 API ?출
      let result: { data: unknown, cacheTtl: number } | null = null;
      let isNews = false;
      let newsResponse: Response | null = null;

      if (path === '/api/health') result = { data: { status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() }, cacheTtl: 0 };
      else if (path === '/api/weather-alerts') result = await handleWeatherAlerts(url, env.KMA_API_KEY);
      else if (path.startsWith('/api/weather/')) result = await handleWeather(path, url, env.KMA_API_KEY);
      else if (path === '/api/air') result = await handleAir(url, env.AIR_API_KEY);
      else if (path.startsWith('/api/er/')) result = await handleER(path, url, env.ER_API_KEY);
      else if (path === '/api/aed/nearby') result = await handleAed(url, env.PUBLIC_DATA_API_KEY || env.ER_API_KEY);
      else if (path === '/api/dam-discharge') result = await handleDamDischarge(
        url,
        env.PUBLIC_DATA_API_KEY || env.ER_API_KEY,
        env.DAM_DISCHARGE_ENABLED === 'true',
      );
      else if (path === '/api/building') result = await handleBuilding(url, env.BUILDING_API_KEY);
      else if (path.startsWith('/api/fire-object/')) result = await handleFireObject(path, url, env.FIRE_OBJECT_API_KEY);
      else if (path === '/api/firewater') result = await handleFireWater(url, env.FIRE_WATER_API_KEY);
      else if (path === '/api/holiday') result = await handleHoliday(url, env.HOLIDAY_API_KEY);
      else if (path === '/api/multiuse') result = await handleMultiUse(url, env.MULTI_USE_API_KEY);
      else if (path === '/api/shelter') result = await handleShelter(url, env.SHELTER_API_KEY);
      else if (path === '/api/civil-shelter') result = await handleCivilShelter(url, env.CIVIL_SHELTER_API_KEY);
      else if (path.startsWith('/api/emergency/stats/')) result = await handleEmergencyStats(path, url, env.EMERGENCY_API_KEY);
      else if (path.startsWith('/api/emergency/info/')) result = await handleEmergencyInfo(path, url, env.EMERGENCY_API_KEY);
      else if (path.startsWith('/api/fire/')) result = await handleFireInfo(path, url, env.FIRE_INFO_API_KEY);
      else if (path === '/api/fire-damage') result = await handleFireDamage(url, env.FIRE_DAMAGE_API_KEY);
      else if (path.startsWith('/api/fire-annual/')) result = await handleAnnualFireStats(path, url, env.ANNUAL_FIRE_API_KEY);
      else if (path.startsWith('/api/equipment/')) {
        return applyCors(await handleEquipment(request, env), request, env.ENVIRONMENT);
      }
      else if (path === '/api/wildfire') result = await handleWildfire(url, env.WILDFIRE_API_KEY);
      else if (path === '/api/forest-fire-risk') result = await handleForestFireRisk(url, env.FOREST_FIRE_API_KEY);
      else if (path === '/api/tsunami-shelter') result = await handleTsunamiShelter(url, env.TSUNAMI_SHELTER_API_KEY);
      else if (path === '/api/disaster-msg') result = await handleDisasterMsg(url, env.DISASTER_API_KEY);
      else if (path === '/api/consumer-hazard') result = await handleConsumerHazard(url, env.CONSUMER_HAZARD_API_KEY);
      else if (path === '/api/ambulance') result = await handleAmbulance(url, env.AMBULANCE_API_KEY);
      else if (path.startsWith('/api/law')) {
        return applyCors(await handleLaw(request), request, env.ENVIRONMENT);
      }
      else if (path === '/api/news') {
        isNews = true;
        newsResponse = await newsHandler(request, env);
      } else {
        return errorResponse(`Not found: ${path}`, request, 404, env.ENVIRONMENT);
      }

      // 3. 응답 생성 및 캐시 저장
      let response: Response;

      if (isNews && newsResponse) {
        response = newsResponse;
        if (response.status === 200) {
          const cacheableResponse = response.clone();
          cacheableResponse.headers.set('Cache-Control', 'public, max-age=3600');
          ctx.waitUntil(cachePutBestEffort(cache, cacheKey, cacheableResponse));
        }
      } else if (result) {
        ctx.waitUntil(saveLastKnownGood(env.NEWS_CACHE, url, result.data));
        response = jsonResponse(result.data, request, 200, result.cacheTtl, env.ENVIRONMENT);
        
        // ?상 ?답(?이????error ?성 ?음)???만 Edge ?경??캐싱
        const isErrorData = result.data && typeof result.data === 'object' && 'error' in result.data;
        if (result.cacheTtl > 0 && !isErrorData) {
          const cacheableResponse = response.clone();
          cacheableResponse.headers.set('Cache-Control', `public, max-age=${result.cacheTtl}`);
          ctx.waitUntil(cachePutBestEffort(cache, cacheKey, cacheableResponse));
        }
      } else {
        return errorResponse('No data returned from API', request, 500, env.ENVIRONMENT);
      }

      // 보조 응답 정책 적용
      return applyCors(response, request, env.ENVIRONMENT);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      console.error(`[119-helper-api] ${path} error:`, message);
      const fallback = await readLastKnownGood(env.NEWS_CACHE, url);
      if (fallback) {
        console.warn(`[119-helper-api] ${path} serving last-known-good data from ${new Date(fallback.cachedAt).toISOString()}`);
        const staleResponse = jsonResponse(fallback.data, request, 200, 0, env.ENVIRONMENT);
        staleResponse.headers.set('X-119-Data-Stale', 'true');
        staleResponse.headers.set('X-119-Data-Cached-At', new Date(fallback.cachedAt).toISOString());
        staleResponse.headers.set('Warning', '110 119-helper-api "Response is stale"');
        return applyCors(staleResponse, request, env.ENVIRONMENT);
      }
      // API ??관???러 메시지 ??
      const safeMessage = message.includes('authKey') || message.includes('serviceKey')
        ? 'API 인증 오류. 관리자에게 문의하세요'
        : message;
      return errorResponse(safeMessage, request, 502, env.ENVIRONMENT);
    }
  },
  
  // Cron Trigger 핸들러
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // 백그라운드 프리패치 작업을 이벤트 수명주기 내에서 실행
    ctx.waitUntil(prefetchNews(env));
  }
};
