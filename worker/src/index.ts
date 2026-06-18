/**
 * 119 Helper API Gateway ??Cloudflare Worker
 * 
 * 모든 ?? API ?출???리하??API ?? ?버 측에?보??니??
 * ?론?엔??SPA)????Worker??/api/* ?드?인?만 ?출?니??
 */

import { handleOptions, jsonResponse, errorResponse, isOriginAllowed, isAppTokenValid, checkRateLimitDistributed, rateLimitResponse, corsHeaders, applyCors, type RateLimitBinding } from './middleware/cors';
import { handleClientLog } from './routes/clientLog';
import { handleWeather } from './routes/weather';
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

export interface Env {
  KMA_API_KEY: string;
  ER_API_KEY: string;
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
  /** 심층 방어용 공유 앱 토큰. 설정 시 X-App-Token 헤더와 일치해야 함. 미설정 시 검사 생략. */
  APP_ACCESS_TOKEN?: string;
  /** Cloudflare 네이티브 Rate Limiting 바인딩. 미설정 시 in-memory 폴백. */
  RATE_LIMITER?: RateLimitBinding;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Preflight
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    // 허용된 Origin만 통과 (브라우저 강제 헤더 — 1차 방어)
    if (!isOriginAllowed(request)) {
      return new Response('Forbidden', { status: 403 });
    }

    // 공유 앱 토큰 검사 (Origin 위조 대비 심층 방어). APP_ACCESS_TOKEN 미설정 시 생략.
    if (!isAppTokenValid(request, env.APP_ACCESS_TOKEN)) {
      return new Response('Forbidden', { status: 403 });
    }

    // 분산 Rate Limiting (네이티브 바인딩 우선, 없으면 in-memory 폴백)
    const rateCheck = await checkRateLimitDistributed(request, env.RATE_LIMITER);
    if (!rateCheck.allowed) {
      return rateLimitResponse(request);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // 클라이언트 오류 텔레메트리 수집 (POST). 관측성 확보용.
    if (request.method === 'POST' && path === '/api/client-log') {
      return await handleClientLog(request);
    }

    // 그 외에는 GET만 허용
    if (request.method !== 'GET') {
      return errorResponse('Method not allowed', request, 405);
    }

    try {
      const cacheUrl = new URL(url.toString());
      cacheUrl.searchParams.delete('_t'); // 브라우저 캐시버스터 파라미터 무시

      // 전역 엣지 캐시 버전 — 과거에 빈 배열/에러 응답이 정상처럼 캐싱된 것을 일괄 무효화
      cacheUrl.searchParams.set('_ev', '2');

      if (path.startsWith('/api/fire-annual/')) {
        cacheUrl.searchParams.set('_cv', '3'); // 기존 캐시 버전 관리용
      }

      const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
      const cache = caches.default;

      // 1. 공용 캐시(Edge Cache) ?중 ?? ?인
      const cached = await cache.match(cacheKey);
      if (cached) {
        const res = new Response(cached.body, cached);
        const cors = corsHeaders(request);
        for (const [k, v] of Object.entries(cors)) {
          res.headers.set(k, String(v));
        }
        return res;
      }

      // 2. 캐시가 ?으??본 API ?출
      let result: { data: unknown, cacheTtl: number } | null = null;
      let isNews = false;
      let newsResponse: Response | null = null;

      if (path === '/api/health') result = { data: { status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() }, cacheTtl: 0 };
      else if (path.startsWith('/api/weather/')) result = await handleWeather(path, url, env.KMA_API_KEY);
      else if (path === '/api/air') result = await handleAir(url, env.AIR_API_KEY);
      else if (path.startsWith('/api/er/')) result = await handleER(path, url, env.ER_API_KEY);
      else if (path === '/api/building') result = await handleBuilding(url, env.BUILDING_API_KEY);
      else if (path.startsWith('/api/fire-object/')) result = await handleFireObject(path, url, env.FIRE_OBJECT_API_KEY);
      else if (path === '/api/firewater') result = await handleFireWater(url, env.FIRE_WATER_API_KEY);
      else if (path === '/api/holiday') result = await handleHoliday(url, env.HOLIDAY_API_KEY);
      else if (path === '/api/multiuse') result = await handleMultiUse(url, env.MULTI_USE_API_KEY);
      else if (path === '/api/shelter') result = await handleShelter(url, env.SHELTER_API_KEY);
      else if (path === '/api/civil-shelter') result = await handleCivilShelter(url, undefined); // Ignore old open api key
      else if (path.startsWith('/api/emergency/stats/')) result = await handleEmergencyStats(path, url, env.EMERGENCY_API_KEY);
      else if (path.startsWith('/api/emergency/info/')) result = await handleEmergencyInfo(path, url, env.EMERGENCY_API_KEY);
      else if (path.startsWith('/api/fire/')) result = await handleFireInfo(path, url, env.FIRE_INFO_API_KEY);
      else if (path === '/api/fire-damage') result = await handleFireDamage(url, env.FIRE_DAMAGE_API_KEY);
      else if (path.startsWith('/api/fire-annual/')) result = await handleAnnualFireStats(path, url, env.ANNUAL_FIRE_API_KEY);
      else if (path.startsWith('/api/equipment/')) {
        return applyCors(await handleEquipment(request, env), request);
      }
      else if (path === '/api/wildfire') result = await handleWildfire(url, env.WILDFIRE_API_KEY);
      else if (path === '/api/forest-fire-risk') result = await handleForestFireRisk(url, env.FOREST_FIRE_API_KEY);
      else if (path === '/api/tsunami-shelter') result = await handleTsunamiShelter(url, env.TSUNAMI_SHELTER_API_KEY);
      else if (path === '/api/disaster-msg') result = await handleDisasterMsg(url, env.DISASTER_API_KEY);
      else if (path === '/api/consumer-hazard') result = await handleConsumerHazard(url, env.CONSUMER_HAZARD_API_KEY);
      else if (path === '/api/ambulance') result = await handleAmbulance(url, env.AMBULANCE_API_KEY);
      else if (path.startsWith('/api/law')) {
        return applyCors(await handleLaw(request), request);
      }
      else if (path === '/api/news') {
        isNews = true;
        newsResponse = await newsHandler(request, env);
      } else {
        return errorResponse(`Not found: ${path}`, request, 404);
      }

      // 3. 응답 생성 및 캐시 저장
      let response: Response;

      if (isNews && newsResponse) {
        response = newsResponse;
        if (response.status === 200) {
          const cacheableResponse = response.clone();
          cacheableResponse.headers.set('Cache-Control', 'public, max-age=3600');
          await cache.put(cacheKey, cacheableResponse);
        }
      } else if (result) {
        response = jsonResponse(result.data, request, 200, result.cacheTtl);
        
        // ?상 ?답(?이????error ?성 ?음)???만 Edge ?경??캐싱
        const isErrorData = result.data && typeof result.data === 'object' && 'error' in result.data;
        if (result.cacheTtl > 0 && !isErrorData) {
          const cacheableResponse = response.clone();
          cacheableResponse.headers.set('Cache-Control', `public, max-age=${result.cacheTtl}`);
          await cache.put(cacheKey, cacheableResponse);
        }
      } else {
        return errorResponse('No data returned from API', request, 500);
      }

      // 보조 CORS ?더 ?용
      const finalRes = new Response(response.body, response);
      const cors = corsHeaders(request);
      for (const [k, v] of Object.entries(cors)) {
        finalRes.headers.set(k, String(v));
      }
      return finalRes;

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      console.error(`[119-helper-api] ${path} error:`, message);
      // API ??관???러 메시지 ??
      const safeMessage = message.includes('authKey') || message.includes('serviceKey')
        ? 'API 인증 오류. 관리자에게 문의하세요'
        : message;
      return errorResponse(safeMessage, request, 502);
    }
  },
  
  // Cron Trigger 핸들러
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // 백그라운드 프리패치 작업을 이벤트 수명주기 내에서 실행
    ctx.waitUntil(prefetchNews(env));
  }
};
