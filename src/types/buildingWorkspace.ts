import type { BuildingRegisterInfo } from '../services/buildingApi';

export interface FireObjectAccom {
  bldNm?: string;
  ctprvn?: string;
  signgu?: string;
  bjdong?: string;
  rdnmadr?: string;
  lnmadr?: string;
  flrCo?: string;
  useAprDe?: string;
  spclObjNm?: string;
  rn?: string;
  [key: string]: unknown;
}

export interface FireObjectFireSys {
  bldNm?: string;
  ctprvn?: string;
  signgu?: string;
  rdnmadr?: string;
  lnmadr?: string;
  sprinklerInstlYn?: string;
  outdoorHydrantInstlYn?: string;
  indoorHydrantInstlYn?: string;
  autoFirAlrmInstlYn?: string;
  flrCo?: string;
  [key: string]: unknown;
}

export type FireReferenceStatus = 'idle' | 'success' | 'empty' | 'partial' | 'error';

export interface BuildingWorkspaceState {
  address: string;
  errorMsg: string;
  warningMsg: string;
  bldgInfo: (BuildingRegisterInfo & { searchedAddress?: string; queryAddress?: string }) | null;
  hasSearched: boolean;
  fireAccom: FireObjectAccom[];
  fireSys: FireObjectFireSys[];
  fireSido: string;
  fireStatus: FireReferenceStatus;
  fireError: string;
}

export const createBuildingWorkspaceState = (initialAddress = ''): BuildingWorkspaceState => ({
  address: initialAddress.trim(),
  errorMsg: '',
  warningMsg: '',
  bldgInfo: null,
  hasSearched: false,
  fireAccom: [],
  fireSys: [],
  fireSido: '',
  fireStatus: 'idle',
  fireError: '',
});
