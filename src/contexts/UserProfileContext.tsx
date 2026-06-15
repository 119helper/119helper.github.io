/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useCallback, type ReactNode } from 'react';
import { useLocalStorageState } from '../hooks/useLocalStorageState';

export type DutyRole = '' | 'fire' | 'ems' | 'rescue';

export interface UserProfile {
  name: string;     // 이름
  rank: string;     // 계급 (소방사, 소방장 등)
  station: string;  // 소속 (○○소방서 ○○센터)
  team: string;     // 근무팀/반 (선택)
  role: DutyRole;   // 주임무 — 활동 보고서 기본 프리셋에 사용
  phone: string;    // 비상연락 (선택)
}

export const EMPTY_PROFILE: UserProfile = {
  name: '',
  rank: '',
  station: '',
  team: '',
  role: '',
  phone: '',
};

// 소방 공무원 계급 (낮은→높은). 선택 안 함 포함.
export const FIRE_RANKS = [
  '소방사시보',
  '소방사',
  '소방교',
  '소방장',
  '소방위',
  '소방경',
  '소방령',
  '소방정',
] as const;

export const DUTY_ROLES: { id: DutyRole; label: string }[] = [
  { id: 'fire', label: '화재진압' },
  { id: 'ems', label: '구급' },
  { id: 'rescue', label: '구조' },
];

const STORAGE_KEY = '119helper-profile';

interface UserProfileContextValue {
  profile: UserProfile;
  updateProfile: (patch: Partial<UserProfile>) => void;
  /** 화면 표시용 이름 (미입력 시 '소방관') */
  displayName: string;
  /** 계급·소속·팀을 합친 부제 (미입력 시 '사용자') */
  subtitle: string;
  /** 보고서 작성자 표기 (예: '소방교 홍길동 / ○○센터'), 미입력 시 '' */
  authorLine: string;
  /** 프로필에 의미 있는 값이 하나라도 입력됐는지 */
  hasProfile: boolean;
}

const UserProfileContext = createContext<UserProfileContextValue | undefined>(undefined);

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useLocalStorageState<UserProfile>(STORAGE_KEY, EMPTY_PROFILE);

  const updateProfile = useCallback(
    (patch: Partial<UserProfile>) => setProfile(prev => ({ ...prev, ...patch })),
    [setProfile],
  );

  const displayName = profile.name.trim() || '소방관';
  const subtitle = [profile.rank, profile.station, profile.team].filter(s => s && s.trim()).join(' · ') || '사용자';
  const authorLine = profile.name.trim()
    ? `${[profile.rank, profile.name].filter(Boolean).join(' ').trim()}${profile.station ? ` / ${profile.station}` : ''}`
    : '';
  const hasProfile = Object.values(profile).some(v => typeof v === 'string' && v.trim() !== '');

  return (
    <UserProfileContext.Provider value={{ profile, updateProfile, displayName, subtitle, authorLine, hasProfile }}>
      {children}
    </UserProfileContext.Provider>
  );
}

export function useUserProfile() {
  const ctx = useContext(UserProfileContext);
  if (ctx === undefined) {
    throw new Error('useUserProfile must be used within a UserProfileProvider');
  }
  return ctx;
}
