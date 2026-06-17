/**
 * 인앱 알림 시스템 훅
 *
 * App.tsx에서 분리. 알림 목록 상태와 추가/읽음/비우기 동작을 캡슐화한다.
 * - 같은 커스텀 id가 이미 있으면 무시(중복 방지)
 * - id 없는 알림은 동일 title+message면 무시
 * - 최대 50개 보관 (오래된 것 자동 폐기)
 */

import { useCallback, useState } from 'react';

export interface Notification {
  id: string;
  icon: string;
  iconColor: string;
  title: string;
  message: string;
  timestamp: Date;
  isNew: boolean;
}

const MAX_NOTIFICATIONS = 50;

/** 알림 타임스탬프를 상대 시간 문자열로 변환 */
export function formatTimeAgo(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

export interface UseNotificationsResult {
  notifications: Notification[];
  /** 알림 추가. id를 주면 그 id로 중복 제거, 없으면 title+message로 중복 제거 */
  addNotification: (
    id: string | undefined,
    icon: string,
    iconColor: string,
    title: string,
    message: string,
  ) => void;
  /** 모든 알림을 읽음 처리 (isNew=false) */
  markAllRead: () => void;
  /** 알림 전체 비우기 */
  clearAll: () => void;
}

export function useNotifications(): UseNotificationsResult {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback<UseNotificationsResult['addNotification']>(
    (id, icon, iconColor, title, message) => {
      setNotifications(prev => {
        // 중복 제거: 커스텀 id가 이미 있거나, id 없는데 동일 title+message가 있으면 무시
        if (id && prev.some(n => n.id === id)) return prev;
        if (!id && prev.some(n => n.title === title && n.message === message)) return prev;

        const newNoti: Notification = {
          id: id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          icon, iconColor, title, message,
          timestamp: new Date(),
          isNew: true,
        };
        return [newNoti, ...prev].slice(0, MAX_NOTIFICATIONS);
      });
    },
    [],
  );

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, isNew: false })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return { notifications, addNotification, markAllRead, clearAll };
}
