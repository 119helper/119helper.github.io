import { apiFetch } from './apiClient';
import { z } from 'zod';

export interface DisasterMsg {
  create_date: string;
  location_id: string; // e.g., "116,117,118..."
  location_name: string; // e.g., "전라북도 군산시,전라북도 김제시..."
  md101_sn: string;
  msg: string;
  send_platform: string; // e.g., "cbs"
  msgType?: string; // e.g., "긴급", "안전" (Extracted or mapped if possible, currently we might have to infer it)
}

const disasterMsgSchema = z.object({
  create_date: z.string().catch(''),
  location_id: z.string().catch(''),
  location_name: z.string().catch(''),
  md101_sn: z.string().catch(''),
  msg: z.string().catch(''),
  send_platform: z.string().catch(''),
  msgType: z.string().optional(),
}).passthrough();

const disasterResponseSchema = z.array(disasterMsgSchema);

export const fetchDisasterMsgs = async (): Promise<DisasterMsg[]> => {
  try {
    // 재난문자는 시의성이 생명 — 1시간 넘은 폴백 캐시는 사용하지 않는다.
    return await apiFetch<DisasterMsg[]>('/api/disaster-msg', undefined, {
      schema: disasterResponseSchema,
      maxStaleMs: 1000 * 60 * 60,
    });
  } catch (error) {
    console.error('Error fetching disaster messages:', error);
    return [];
  }
};
