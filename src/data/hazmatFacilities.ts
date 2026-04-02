// 위험물제조소 설치현황 — 경상북도 (KOSIS 통계)
// 자동 API 없음 → 정적 JSON (KOSIS에서 수동 갱신 필요)
// 출처: 「경상북도기본통계」 경상북도 (예방안전과)
// 최종 갱신: 2025-05-30 (2023년 기준 데이터)
// KOSIS URL: https://kosis.kr/statHtml/statHtml.do?orgId=216&tblId=DT_21603_P001027&conn_path=I3

export interface HazmatFacilityStats {
  fireDept: string;       // 소방서명
  total: number;          // 총계
  manufacturing: number;  // 제조소
  handling: {
    subtotal: number;     // 주요취급소 소계
    gasStation: number;   // 주유
    sales: number;        // 판매
    transfer: number;     // 이송
    general: number;      // 일반
  };
  storage: {
    subtotal: number;     // 저장소 소계
    indoor: number;       // 옥내
    outdoorTank: number;  // 옥외탱크
    indoorTank: number;   // 옥내탱크
    underground: number;  // 지하탱크
    simple: number;       // 간이탱크
    mobile: number;       // 이동탱크
    outdoor: number;      // 옥외
    rock: number;         // 암반탱크
  };
}

export const HAZMAT_FACILITY_DATA: HazmatFacilityStats[] = [
  { fireDept: '합계', total: 9546, manufacturing: 163, handling: { subtotal: 2381, gasStation: 1497, sales: 11, transfer: 1, general: 872 }, storage: { subtotal: 7002, indoor: 602, outdoorTank: 1942, indoorTank: 996, underground: 529, simple: 0, mobile: 2574, outdoor: 359, rock: 0 } },
  { fireDept: '포항북부소방서', total: 305, manufacturing: 0, handling: { subtotal: 127, gasStation: 89, sales: 2, transfer: 0, general: 36 }, storage: { subtotal: 178, indoor: 11, outdoorTank: 15, indoorTank: 27, underground: 13, simple: 0, mobile: 96, outdoor: 16, rock: 0 } },
  { fireDept: '포항남부소방서', total: 1343, manufacturing: 23, handling: { subtotal: 256, gasStation: 114, sales: 6, transfer: 1, general: 135 }, storage: { subtotal: 1064, indoor: 57, outdoorTank: 488, indoorTank: 174, underground: 49, simple: 0, mobile: 197, outdoor: 99, rock: 0 } },
  { fireDept: '경주소방서', total: 1047, manufacturing: 27, handling: { subtotal: 259, gasStation: 173, sales: 0, transfer: 0, general: 86 }, storage: { subtotal: 761, indoor: 64, outdoorTank: 267, indoorTank: 97, underground: 60, simple: 0, mobile: 219, outdoor: 54, rock: 0 } },
  { fireDept: '김천소방서', total: 608, manufacturing: 14, handling: { subtotal: 154, gasStation: 85, sales: 0, transfer: 0, general: 69 }, storage: { subtotal: 440, indoor: 68, outdoorTank: 160, indoorTank: 48, underground: 40, simple: 0, mobile: 108, outdoor: 16, rock: 0 } },
  { fireDept: '안동소방서', total: 447, manufacturing: 0, handling: { subtotal: 138, gasStation: 97, sales: 0, transfer: 0, general: 41 }, storage: { subtotal: 309, indoor: 8, outdoorTank: 37, indoorTank: 71, underground: 33, simple: 0, mobile: 157, outdoor: 3, rock: 0 } },
  { fireDept: '구미소방서', total: 1053, manufacturing: 22, handling: { subtotal: 286, gasStation: 117, sales: 2, transfer: 0, general: 167 }, storage: { subtotal: 745, indoor: 148, outdoorTank: 292, indoorTank: 102, underground: 56, simple: 0, mobile: 114, outdoor: 33, rock: 0 } },
  { fireDept: '영주소방서', total: 265, manufacturing: 1, handling: { subtotal: 87, gasStation: 58, sales: 0, transfer: 0, general: 29 }, storage: { subtotal: 177, indoor: 3, outdoorTank: 23, indoorTank: 56, underground: 16, simple: 0, mobile: 70, outdoor: 9, rock: 0 } },
  { fireDept: '영천소방서', total: 795, manufacturing: 23, handling: { subtotal: 141, gasStation: 103, sales: 0, transfer: 0, general: 38 }, storage: { subtotal: 631, indoor: 46, outdoorTank: 145, indoorTank: 40, underground: 21, simple: 0, mobile: 355, outdoor: 24, rock: 0 } },
  { fireDept: '상주소방서', total: 282, manufacturing: 0, handling: { subtotal: 96, gasStation: 72, sales: 0, transfer: 0, general: 24 }, storage: { subtotal: 186, indoor: 7, outdoorTank: 10, indoorTank: 32, underground: 23, simple: 0, mobile: 111, outdoor: 3, rock: 0 } },
  { fireDept: '문경소방서', total: 220, manufacturing: 1, handling: { subtotal: 82, gasStation: 54, sales: 0, transfer: 0, general: 28 }, storage: { subtotal: 137, indoor: 11, outdoorTank: 9, indoorTank: 20, underground: 22, simple: 0, mobile: 74, outdoor: 1, rock: 0 } },
  { fireDept: '경산소방서', total: 874, manufacturing: 16, handling: { subtotal: 162, gasStation: 108, sales: 0, transfer: 0, general: 54 }, storage: { subtotal: 696, indoor: 53, outdoorTank: 146, indoorTank: 63, underground: 52, simple: 0, mobile: 357, outdoor: 25, rock: 0 } },
  { fireDept: '의성소방서', total: 215, manufacturing: 2, handling: { subtotal: 67, gasStation: 48, sales: 0, transfer: 0, general: 19 }, storage: { subtotal: 146, indoor: 3, outdoorTank: 19, indoorTank: 19, underground: 16, simple: 0, mobile: 84, outdoor: 5, rock: 0 } },
  { fireDept: '청송소방서', total: 118, manufacturing: 0, handling: { subtotal: 36, gasStation: 28, sales: 0, transfer: 0, general: 8 }, storage: { subtotal: 82, indoor: 0, outdoorTank: 2, indoorTank: 25, underground: 11, simple: 0, mobile: 43, outdoor: 1, rock: 0 } },
  { fireDept: '영덕소방서', total: 166, manufacturing: 0, handling: { subtotal: 42, gasStation: 34, sales: 0, transfer: 0, general: 8 }, storage: { subtotal: 124, indoor: 0, outdoorTank: 33, indoorTank: 19, underground: 19, simple: 0, mobile: 52, outdoor: 1, rock: 0 } },
  { fireDept: '청도소방서', total: 136, manufacturing: 2, handling: { subtotal: 39, gasStation: 33, sales: 0, transfer: 0, general: 6 }, storage: { subtotal: 95, indoor: 3, outdoorTank: 8, indoorTank: 19, underground: 8, simple: 0, mobile: 55, outdoor: 2, rock: 0 } },
  { fireDept: '고령소방서', total: 211, manufacturing: 8, handling: { subtotal: 49, gasStation: 36, sales: 0, transfer: 0, general: 13 }, storage: { subtotal: 154, indoor: 21, outdoorTank: 25, indoorTank: 28, underground: 15, simple: 0, mobile: 47, outdoor: 18, rock: 0 } },
  { fireDept: '성주소방서', total: 267, manufacturing: 7, handling: { subtotal: 53, gasStation: 39, sales: 0, transfer: 0, general: 14 }, storage: { subtotal: 207, indoor: 19, outdoorTank: 15, indoorTank: 29, underground: 16, simple: 0, mobile: 114, outdoor: 14, rock: 0 } },
  { fireDept: '칠곡소방서', total: 570, manufacturing: 16, handling: { subtotal: 137, gasStation: 95, sales: 1, transfer: 0, general: 41 }, storage: { subtotal: 417, indoor: 74, outdoorTank: 125, indoorTank: 47, underground: 32, simple: 0, mobile: 110, outdoor: 29, rock: 0 } },
  { fireDept: '예천소방서', total: 223, manufacturing: 0, handling: { subtotal: 48, gasStation: 39, sales: 0, transfer: 0, general: 9 }, storage: { subtotal: 175, indoor: 1, outdoorTank: 64, indoorTank: 15, underground: 12, simple: 0, mobile: 82, outdoor: 1, rock: 0 } },
  { fireDept: '봉화소방서', total: 112, manufacturing: 1, handling: { subtotal: 39, gasStation: 33, sales: 0, transfer: 0, general: 6 }, storage: { subtotal: 72, indoor: 1, outdoorTank: 13, indoorTank: 5, underground: 1, simple: 0, mobile: 51, outdoor: 1, rock: 0 } },
  { fireDept: '울진소방서', total: 289, manufacturing: 0, handling: { subtotal: 83, gasStation: 42, sales: 0, transfer: 0, general: 41 }, storage: { subtotal: 206, indoor: 4, outdoorTank: 46, indoorTank: 60, underground: 14, simple: 0, mobile: 78, outdoor: 4, rock: 0 } },
];

// 데이터 갱신일 (마지막으로 KOSIS에서 다운로드한 날짜)
export const HAZMAT_DATA_INFO = {
  source: 'KOSIS 경상북도기본통계 (예방안전과)',
  dataYear: 2023,
  lastDownloaded: '2026-04-02',
  kosisUrl: 'https://kosis.kr/statHtml/statHtml.do?orgId=216&tblId=DT_21603_P001027&conn_path=I3',
  note: '자동 API 미제공. KOSIS에서 수동 다운로드 필요. 통상 연 1회(5~6월) 갱신.',
};
