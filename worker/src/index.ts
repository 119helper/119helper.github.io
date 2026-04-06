/**
 * 119 Helper API Gateway ??Cloudflare Worker
 * 
 * Î™®Îì† ?∏Î? API ?∏Ï∂ú???ÄÎ¶¨Ìïò??API ?§Î? ?úÎ≤Ñ Ï∏°ÏóêÎß?Î≥¥Í??©Îãà??
 * ?ÑÎ°†?∏Ïóî??SPA)????Worker??/api/* ?îÎìú?¨Ïù∏?∏Îßå ?∏Ï∂ú?©Îãà??
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
import { handleWildfire } from './routes/wildfire';
import { handleTsunamiShelter } from './routes/tsunamiShelter';

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
  WILDFIRE_API_KEY: string;
  TSUNAMI_SHELTER_API_KEY: string;
  ENVIRONMENT: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Preflight
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    // ?îí ÎπÑÍ≥µÍ∞?API ???àÏö©??OriginÎß??µÍ≥º
    if (!isOriginAllowed(request)) {
      return new Response('Forbidden', { status: 403 });
    }

    // ?õ°Ô∏?Rate Limiting (Î∂ÑÎãπ 60??
    const rateCheck = checkRateLimit(request);
    if (!rateCheck.allowed) {
      return rateLimitResponse(request);
    }

    // GETÎß??àÏö©
    if (request.method !== 'GET') {
      return errorResponse('Method not allowed', request, 405);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      const cacheUrl = new URL(url.toString());
      cacheUrl.searchParams.delete('_t'); // Î∏åÎùº?∞Ï? Ï∫êÏãúÎ≤ÑÏä§???åÎùºÎØ∏ÌÑ∞ Î¨¥Ïãú
      
      if (path.startsWith('/api/fire-annual/')) {
        cacheUrl.searchParams.set('_cv', '3'); // Í∏∞Ï°¥ Ï∫êÏãú Î≤ÑÏ†Ñ Í¥ÄÎ¶??†Ï?
      }

      const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
      const cache = caches.default;

      // 1. Í≥µÏö© Ï∫êÏãú(Edge Cache) ?ÅÏ§ë ?¨Î? ?ïÏù∏
      const cached = await cache.match(cacheKey);
      if (cached) {
        const res = new Response(cached.body, cached);
        const cors = corsHeaders(request);
        for (const [k, v] of Object.entries(cors)) {
          res.headers.set(k, String(v));
        }
        return res;
      }

      // 2. Ï∫êÏãúÍ∞Ä ?ÜÏúºÎ©??êÎ≥∏ API ?∏Ï∂ú
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
      else if (path === '/api/civil-shelter') result = await handleCivilShelter(url, undefined); // Ignore old open api key
      else if (path.startsWith('/api/emergency/stats/')) result = await handleEmergencyStats(path, url, env.EMERGENCY_API_KEY);
      else if (path.startsWith('/api/emergency/info/')) result = await handleEmergencyInfo(path, url, env.EMERGENCY_API_KEY);
      else if (path.startsWith('/api/fire/')) result = await handleFireInfo(path, url, env.FIRE_INFO_API_KEY);
      else if (path === '/api/fire-damage') result = await handleFireDamage(url, env.FIRE_DAMAGE_API_KEY);
      else if (path.startsWith('/api/fire-annual/')) result = await handleAnnualFireStats(path, url, env.ANNUAL_FIRE_API_KEY);
      else if (path === '/api/temp-civil-fetch') {


      }
      else if (path === '/api/wildfire') result = await handleWildfire(url, env.WILDFIRE_API_KEY);
      else if (path === '/api/tsunami-shelter') result = await handleTsunamiShelter(url, env.TSUNAMI_SHELTER_API_KEY);
      else if (path === '/api/news') {
        isNews = true;
        newsResponse = await newsHandler(request, env);
      } else {
        return errorResponse(`Not found: ${path}`, request, 404);
      }

      // 3. ?ëÎãµ ?ùÏÑ± Î∞?Ï∫êÏãú ?Ä??
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
        
        // ?ïÏÉÅ ?ëÎãµ(?∞Ïù¥????error ?çÏÑ± ?ÜÏùå)???åÎßå Edge ?òÍ≤Ω??Ï∫êÏã±
        const isErrorData = result.data && typeof result.data === 'object' && 'error' in result.data;
        if (result.cacheTtl > 0 && !isErrorData) {
          const cacheableResponse = response.clone();
          cacheableResponse.headers.set('Cache-Control', `public, max-age=${result.cacheTtl}`);
          await cache.put(cacheKey, cacheableResponse);
        }
      } else {
        return errorResponse('No data returned from API', request, 500);
      }

      // Î≥¥Ï°∞ CORS ?§Îçî ?ÅÏö©
      const finalRes = new Response(response.body, response);
      const cors = corsHeaders(request);
      for (const [k, v] of Object.entries(cors)) {
        finalRes.headers.set(k, String(v));
      }
      return finalRes;

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      console.error(`[119-helper-api] ${path} error:`, message);
      // API ??Í¥Ä???êÎü¨ Î©îÏãúÏßÄ ?®Í?
      const safeMessage = message.includes('authKey') || message.includes('serviceKey')
        ? 'API ?∏Ï¶ù ?§Î•ò. Í¥ÄÎ¶¨Ïûê?êÍ≤å Î¨∏Ïùò?òÏÑ∏??'
        : message;
      return errorResponse(safeMessage, request, 502);
    }
  },
};
