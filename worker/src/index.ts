/**
 * 119 Helper API Gateway — Cloudflare Worker
 * 
 * 모든 외부 API 호출을 대리하여 API 키를 서버 측에만 보관합니다.
 * 프론트엔드(SPA)는 이 Worker의 /api/* 엔드포인트만 호출합니다.
 */

import { handleOptions, jsonResponse, errorResponse, isOriginAllowed, checkRateLimit, rateLimitResponse, corsHeaders } from './middleware/cors';
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
import { newsHandler } from './routes/news';

export interface Env {
  KMA_API_KEY: string;
  ER_API_KEY: string;
  AIR_API_KEY: string;
  BUILDING_API_KEY: string;
  FIRE_WATER_API_KEY: string;
  HOLIDAY_API_KEY: string;
  KAKAO_MAP_KEY: string;
  MULTI_USE_API_KEY: string;
  SHELTER_API_KEY: string;
  EMERGENCY_API_KEY: string;
  FIRE_INFO_API_KEY: string;
  ANNUAL_FIRE_API_KEY: string;
  FIRE_OBJECT_API_KEY: string;
  FIRE_DAMAGE_API_KEY: string;
  ENVIRONMENT: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Preflight
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    // 🔒 비공개 API — 허용된 Origin만 통과
    if (!isOriginAllowed(request)) {
      return new Response('Forbidden', { status: 403 });
    }

    // 🛡️ Rate Limiting (분당 60회)
    const rateCheck = checkRateLimit(request);
    if (!rateCheck.allowed) {
      return rateLimitResponse(request);
    }

    // GET만 허용
    if (request.method !== 'GET') {
      return errorResponse('Method not allowed', request, 405);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      const cacheUrl = new URL(url.toString());
      cacheUrl.searchParams.delete('_t'); // 브라우저 캐시버스트 파라미터 무시
      
      if (path.startsWith('/api/fire-annual/')) {
        cacheUrl.searchParams.set('_cv', '3'); // 기존 캐시 버전 관리 유지
      }

      const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
      const cache = caches.default;

      // 1. 공용 캐시(Edge Cache) 적중 여부 확인
      const cached = await cache.match(cacheKey);
      if (cached) {
        const res = new Response(cached.body, cached);
        const cors = corsHeaders(request);
        for (const [k, v] of Object.entries(cors)) {
          res.headers.set(k, String(v));
        }
        return res;
      }

      // 2. 캐시가 없으면 원본 API 호출
      let result: { data: any, cacheTtl: number } | null = null;
      let isNews = false;
      let newsResponse: Response | null = null;

      if (path === '/api/health') result = { data: { status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() }, cacheTtl: 0 };
      else if (path === '/api/config') result = { data: { kakaoMapKey: env.KAKAO_MAP_KEY || '' }, cacheTtl: 3600 };
      else if (path.startsWith('/api/weather/')) result = await handleWeather(path, url, env.KMA_API_KEY);
      else if (path === '/api/air') result = await handleAir(url, env.AIR_API_KEY);
      else if (path.startsWith('/api/er/')) result = await handleER(path, url, env.ER_API_KEY);
      else if (path === '/api/building') result = await handleBuilding(url, env.BUILDING_API_KEY);
      else if (path.startsWith('/api/fire-object/')) result = await handleFireObject(path, url, env.FIRE_OBJECT_API_KEY);
      else if (path === '/api/firewater') result = await handleFireWater(url, env.FIRE_WATER_API_KEY);
      else if (path === '/api/holiday') result = await handleHoliday(url, env.HOLIDAY_API_KEY);
      else if (path === '/api/multiuse') result = await handleMultiUse(url, env.MULTI_USE_API_KEY);
      else if (path === '/api/shelter') result = await handleShelter(url, env.SHELTER_API_KEY);
      else if (path === '/api/civil-shelter') result = await handleCivilShelter(url, env.SHELTER_API_KEY);
      else if (path.startsWith('/api/emergency/stats/')) result = await handleEmergencyStats(path, url, env.EMERGENCY_API_KEY);
      else if (path.startsWith('/api/emergency/info/')) result = await handleEmergencyInfo(path, url, env.EMERGENCY_API_KEY);
      else if (path.startsWith('/api/fire/')) result = await handleFireInfo(path, url, env.FIRE_INFO_API_KEY);
      else if (path === '/api/fire-damage') result = await handleFireDamage(url, env.FIRE_DAMAGE_API_KEY);
      else if (path.startsWith('/api/fire-annual/')) result = await handleAnnualFireStats(path, url, env.ANNUAL_FIRE_API_KEY);
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
        
        // 정상 응답(데이터 내 error 속성 없음)일 때만 Edge 환경에 캐싱
        const isErrorData = result.data && typeof result.data === 'object' && 'error' in result.data;
        if (result.cacheTtl > 0 && !isErrorData) {
          const cacheableResponse = response.clone();
          cacheableResponse.headers.set('Cache-Control', `public, max-age=${result.cacheTtl}`);
          await cache.put(cacheKey, cacheableResponse);
        }
      } else {
        return errorResponse('No data returned from API', request, 500);
      }

      // 보조 CORS 헤더 적용
      const finalRes = new Response(response.body, response);
      const cors = corsHeaders(request);
      for (const [k, v] of Object.entries(cors)) {
        finalRes.headers.set(k, String(v));
      }
      return finalRes;

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      console.error(`[119-helper-api] ${path} error:`, message);
      // API 키 관련 에러 메시지 숨김
      const safeMessage = message.includes('authKey') || message.includes('serviceKey')
        ? 'API 인증 오류. 관리자에게 문의하세요.'
        : message;
      return errorResponse(safeMessage, request, 502);
    }
  },
};
