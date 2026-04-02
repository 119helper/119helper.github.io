/**
 * 119 Helper API Gateway — Cloudflare Worker
 * 
 * 모든 외부 API 호출을 대리하여 API 키를 서버 측에만 보관합니다.
 * 프론트엔드(SPA)는 이 Worker의 /api/* 엔드포인트만 호출합니다.
 */

import { handleOptions, jsonResponse, errorResponse, isOriginAllowed } from './middleware/cors';
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

    // GET만 허용
    if (request.method !== 'GET') {
      return errorResponse('Method not allowed', request, 405);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // ═══════ 헬스체크 ═══════
      if (path === '/api/health') {
        return jsonResponse({
          status: 'ok',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          environment: env.ENVIRONMENT,
          keys: {
            kma: !!env.KMA_API_KEY,
            er: !!env.ER_API_KEY,
            air: !!env.AIR_API_KEY,
            building: !!env.BUILDING_API_KEY,
            fireWater: !!env.FIRE_WATER_API_KEY,
            holiday: !!env.HOLIDAY_API_KEY,
            kakaoMap: !!env.KAKAO_MAP_KEY,
            multiUse: !!env.MULTI_USE_API_KEY,
            emergency: !!env.EMERGENCY_API_KEY,
            fireInfo: !!env.FIRE_INFO_API_KEY,
            annualFire: !!env.ANNUAL_FIRE_API_KEY,
          }
        }, request);
      }

      // ═══════ 카카오맵 키 (프론트에서 SDK 로드용) ═══════
      if (path === '/api/config') {
        return jsonResponse({
          kakaoMapKey: env.KAKAO_MAP_KEY || '',
        }, request, 200, 3600);
      }

      // ═══════ 날씨 ═══════
      if (path.startsWith('/api/weather/')) {
        const result = await handleWeather(path, url, env.KMA_API_KEY);
        return jsonResponse(result.data, request, 200, result.cacheTtl);
      }

      // ═══════ 대기질 ═══════
      if (path === '/api/air') {
        const result = await handleAir(url, env.AIR_API_KEY);
        return jsonResponse(result.data, request, 200, result.cacheTtl);
      }

      // ═══════ 응급실 ═══════
      if (path.startsWith('/api/er/')) {
        const result = await handleER(path, url, env.ER_API_KEY);
        return jsonResponse(result.data, request, 200, result.cacheTtl);
      }

      // ═══════ 건축물대장 ═══════
      if (path === '/api/building') {
        const result = await handleBuilding(url, env.BUILDING_API_KEY);
        return jsonResponse(result.data, request, 200, result.cacheTtl);
      }

      // ═══════ 소방용수 ═══════
      if (path === '/api/firewater') {
        const result = await handleFireWater(url, env.FIRE_WATER_API_KEY);
        return jsonResponse(result.data, request, 200, result.cacheTtl);
      }

      // ═══════ 공휴일 ═══════
      if (path === '/api/holiday') {
        const result = await handleHoliday(url, env.HOLIDAY_API_KEY);
        return jsonResponse(result.data, request, 200, result.cacheTtl);
      }

      // ═══════ 다중이용업소 ═══════
      if (path === '/api/multiuse') {
        const result = await handleMultiUse(url, env.MULTI_USE_API_KEY);
        return jsonResponse(result.data, request, 200, result.cacheTtl);
      }

      // ═══════ 대피소 (지진해일) ═══════
      if (path === '/api/shelter') {
        const result = await handleShelter(url, env.SHELTER_API_KEY);
        return jsonResponse(result.data, request, 200, result.cacheTtl);
      }

      // ═══════ 구급통계 ═══════
      if (path.startsWith('/api/emergency/stats/')) {
        const result = await handleEmergencyStats(path, url, env.EMERGENCY_API_KEY);
        return jsonResponse(result.data, request, 200, result.cacheTtl);
      }

      // ═══════ 구급정보 ═══════
      if (path.startsWith('/api/emergency/info/')) {
        const result = await handleEmergencyInfo(path, url, env.EMERGENCY_API_KEY);
        return jsonResponse(result.data, request, 200, result.cacheTtl);
      }

      // ═══════ 화재정보 ═══════
      if (path.startsWith('/api/fire/')) {
        const result = await handleFireInfo(path, url, env.FIRE_INFO_API_KEY);
        return jsonResponse(result.data, request, 200, result.cacheTtl);
      }

      // ═══════ 연간화재통계 (Cache API 적용) ═══════
      if (path.startsWith('/api/fire-annual/')) {
        const cache = caches.default;
        const cacheUrl = new URL(url.toString());
        cacheUrl.searchParams.set('_cv', '3'); // cache version - bump to invalidate
        const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
        const cached = await cache.match(cacheKey);
        if (cached) return cached;

        const result = await handleAnnualFireStats(path, url, env.ANNUAL_FIRE_API_KEY);
        const response = jsonResponse(result.data, request, 200, result.cacheTtl);
        // 24시간 엣지 캐시
        response.headers.set('Cache-Control', 'public, max-age=86400');
        await cache.put(cacheKey, response.clone());
        return response;
      }

      // 404
      return errorResponse(`Not found: ${path}`, request, 404);

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
