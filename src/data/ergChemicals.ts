// ERG (Emergency Response Guidebook) 기반 유해화학물질 데이터베이스
// 소방관이 현장에서 자주 접하는 30종 위험물질

export interface ChemicalData {
  unInfo: string;
  name: string;
  nameEn: string;
  guide: number | string;   // ERG 가이드 번호 (131P 같은 문자열 포함 가능)
  isolationSmall: number;  // 소량 초기이격 (m)
  protectionSmall: number; // 소량 풍하향 방호 (m)
  isolationLarge: number;  // 대량 초기이격 (m)
  protectionLarge: number; // 대량 풍하향 방호 (m)
  hazardClass: string;     // 위험물 유별
  color?: string;          // 테마 색상
}

export const ERG_CHEMICALS: Record<string, ChemicalData> = {
  // ═══════ 독성 가스 ═══════
  'UN1005': { unInfo: 'UN1005', name: '암모니아 (무수)', nameEn: 'Ammonia, anhydrous', guide: 125, isolationSmall: 30, protectionSmall: 100, isolationLarge: 300, protectionLarge: 2300, hazardClass: '2.3 (독성가스)' },
  'UN1017': { unInfo: 'UN1017', name: '염소', nameEn: 'Chlorine', guide: 124, isolationSmall: 30, protectionSmall: 200, isolationLarge: 300, protectionLarge: 3000, hazardClass: '2.3 (독성가스)' },
  'UN1076': { unInfo: 'UN1076', name: '포스겐', nameEn: 'Phosgene', guide: 125, isolationSmall: 60, protectionSmall: 600, isolationLarge: 600, protectionLarge: 6000, hazardClass: '2.3 (독성가스)' },
  'UN1023': { unInfo: 'UN1023', name: '석탄가스', nameEn: 'Coal gas', guide: 119, isolationSmall: 30, protectionSmall: 100, isolationLarge: 200, protectionLarge: 1000, hazardClass: '2.3 (독성가스)' },
  'UN1064': { unInfo: 'UN1064', name: '메틸메르캅탄', nameEn: 'Methyl mercaptan', guide: 117, isolationSmall: 60, protectionSmall: 200, isolationLarge: 300, protectionLarge: 1500, hazardClass: '2.3 (독성가스)' },
  'UN1092': { unInfo: 'UN1092', name: '아크롤레인', nameEn: 'Acrolein, stabilized', guide: '131P', isolationSmall: 60, protectionSmall: 300, isolationLarge: 600, protectionLarge: 3000, hazardClass: '6.1 (독물)' },
  
  // ═══════ 산/부식성 가스 ═══════
  'UN1052': { unInfo: 'UN1052', name: '불화수소 (무수)', nameEn: 'Hydrogen fluoride, anhydrous', guide: 125, isolationSmall: 30, protectionSmall: 100, isolationLarge: 600, protectionLarge: 4400, hazardClass: '8 (부식성)' },
  'UN1048': { unInfo: 'UN1048', name: '브롬화수소 (무수)', nameEn: 'Hydrogen bromide, anhydrous', guide: 125, isolationSmall: 30, protectionSmall: 200, isolationLarge: 150, protectionLarge: 1100, hazardClass: '2.3 (독성가스)' },
  'UN1050': { unInfo: 'UN1050', name: '염화수소 (무수)', nameEn: 'Hydrogen chloride, anhydrous', guide: 125, isolationSmall: 30, protectionSmall: 100, isolationLarge: 300, protectionLarge: 1600, hazardClass: '2.3 (독성가스)' },
  'UN1831': { unInfo: 'UN1831', name: '발연황산', nameEn: 'Sulfuric acid, fuming', guide: 137, isolationSmall: 30, protectionSmall: 100, isolationLarge: 200, protectionLarge: 800, hazardClass: '8 (부식성)' },
  'UN1829': { unInfo: 'UN1829', name: '삼산화황', nameEn: 'Sulfur trioxide, stabilized', guide: 137, isolationSmall: 30, protectionSmall: 100, isolationLarge: 200, protectionLarge: 1100, hazardClass: '8 (부식성)' },
  
  // ═══════ 인화성 가스/액체 ═══════
  'UN1075': { unInfo: 'UN1075', name: 'LPG (액화석유가스)', nameEn: 'Petroleum gases, liquefied', guide: 115, isolationSmall: 30, protectionSmall: 100, isolationLarge: 800, protectionLarge: 800, hazardClass: '2.1 (인화성가스)' },
  'UN1971': { unInfo: 'UN1971', name: '천연가스 (메탄)', nameEn: 'Natural gas, compressed', guide: 115, isolationSmall: 30, protectionSmall: 100, isolationLarge: 300, protectionLarge: 500, hazardClass: '2.1 (인화성가스)' },
  'UN1203': { unInfo: 'UN1203', name: '가솔린 (휘발유)', nameEn: 'Gasoline', guide: 128, isolationSmall: 30, protectionSmall: 100, isolationLarge: 300, protectionLarge: 300, hazardClass: '3 (인화성액체)' },
  'UN1170': { unInfo: 'UN1170', name: '에탄올 (에틸알코올)', nameEn: 'Ethanol', guide: 127, isolationSmall: 30, protectionSmall: 100, isolationLarge: 200, protectionLarge: 200, hazardClass: '3 (인화성액체)' },
  'UN1267': { unInfo: 'UN1267', name: '석유 원유', nameEn: 'Petroleum crude oil', guide: 128, isolationSmall: 30, protectionSmall: 100, isolationLarge: 300, protectionLarge: 300, hazardClass: '3 (인화성액체)' },
  'UN1038': { unInfo: 'UN1038', name: '에틸렌', nameEn: 'Ethylene, refrigerated liquid', guide: 115, isolationSmall: 30, protectionSmall: 100, isolationLarge: 600, protectionLarge: 600, hazardClass: '2.1 (인화성가스)' },
  'UN1993': { unInfo: 'UN1993', name: '인화성 액체 (NOS)', nameEn: 'Flammable liquid, n.o.s.', guide: 128, isolationSmall: 30, protectionSmall: 100, isolationLarge: 300, protectionLarge: 300, hazardClass: '3 (인화성액체)' },
  
  // ═══════ 산화성/폭발성 ═══════
  'UN1942': { unInfo: 'UN1942', name: '질산암모늄', nameEn: 'Ammonium nitrate', guide: 140, isolationSmall: 30, protectionSmall: 100, isolationLarge: 800, protectionLarge: 800, hazardClass: '5.1 (산화성)' },
  'UN0081': { unInfo: 'UN0081', name: '폭발물 (1.1D)', nameEn: 'Explosive, blasting, Type A', guide: 112, isolationSmall: 500, protectionSmall: 1000, isolationLarge: 1500, protectionLarge: 3000, hazardClass: '1.1 (폭발물)' },
  
  // ═══════ 유독물 ═══════
  'UN1092B': { unInfo: 'UN1092', name: '아크릴로니트릴', nameEn: 'Acrylonitrile, stabilized', guide: '131P', isolationSmall: 60, protectionSmall: 300, isolationLarge: 300, protectionLarge: 1700, hazardClass: '3 (인화성+독성)' },
  'UN1098': { unInfo: 'UN1098', name: '알릴알코올', nameEn: 'Allyl alcohol', guide: 131, isolationSmall: 60, protectionSmall: 200, isolationLarge: 300, protectionLarge: 1000, hazardClass: '6.1 (독물)' },
  'UN2811': { unInfo: 'UN2811', name: '독성 고체 (유기)', nameEn: 'Toxic solid, organic, n.o.s.', guide: 154, isolationSmall: 25, protectionSmall: 100, isolationLarge: 150, protectionLarge: 500, hazardClass: '6.1 (독물)' },
  
  // ═══════ 방사성/기타 ═══════
  'UN2908': { unInfo: 'UN2908', name: '방사성물질 (면제)', nameEn: 'Radioactive material, excepted', guide: 161, isolationSmall: 25, protectionSmall: 100, isolationLarge: 100, protectionLarge: 300, hazardClass: '7 (방사성)' },
  'UN1680': { unInfo: 'UN1680', name: '시안화칼륨', nameEn: 'Potassium cyanide', guide: 157, isolationSmall: 25, protectionSmall: 100, isolationLarge: 200, protectionLarge: 600, hazardClass: '6.1 (독물)' },
  'UN1613': { unInfo: 'UN1613', name: '시안화수소산', nameEn: 'Hydrocyanic acid, aqueous', guide: 117, isolationSmall: 60, protectionSmall: 300, isolationLarge: 600, protectionLarge: 3900, hazardClass: '6.1 (독물)' },
  'UN2188': { unInfo: 'UN2188', name: '아르신 (비소화수소)', nameEn: 'Arsine', guide: 119, isolationSmall: 60, protectionSmall: 300, isolationLarge: 600, protectionLarge: 3500, hazardClass: '2.3 (독성가스)' },
  'UN1062': { unInfo: 'UN1062', name: '메틸브로마이드', nameEn: 'Methyl bromide', guide: 123, isolationSmall: 60, protectionSmall: 200, isolationLarge: 200, protectionLarge: 1100, hazardClass: '2.3 (독성가스)' },
  'UN1040': { unInfo: 'UN1040', name: '에틸렌옥사이드', nameEn: 'Ethylene oxide', guide: '119P', isolationSmall: 60, protectionSmall: 300, isolationLarge: 600, protectionLarge: 3000, hazardClass: '2.3 (인화+독성)' },
  'UN1079': { unInfo: 'UN1079', name: '이산화황', nameEn: 'Sulfur dioxide', guide: 125, isolationSmall: 30, protectionSmall: 100, isolationLarge: 300, protectionLarge: 1600, hazardClass: '2.3 (독성가스)' },
};

// 위험물 유별로 그룹화
export const HAZARD_GROUPS = [
  { label: '독성 가스', color: '#ef4444', uns: ['UN1005', 'UN1017', 'UN1076', 'UN1023', 'UN1064'] },
  { label: '산/부식성', color: '#f97316', uns: ['UN1052', 'UN1048', 'UN1050', 'UN1831', 'UN1829'] },
  { label: '인화성', color: '#eab308', uns: ['UN1075', 'UN1971', 'UN1203', 'UN1170', 'UN1267', 'UN1038', 'UN1993'] },
  { label: '산화/폭발', color: '#a855f7', uns: ['UN1942', 'UN0081'] },
  { label: '독물/유독', color: '#ec4899', uns: ['UN1098', 'UN2811', 'UN1680', 'UN1613', 'UN2188', 'UN1062', 'UN1040', 'UN1079'] },
  { label: '방사성', color: '#06b6d4', uns: ['UN2908'] },
];
