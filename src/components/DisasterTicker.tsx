import React, { useEffect, useState } from 'react';
import { fetchDisasterMsgs } from '../services/disasterMsgApi';
import type { DisasterMsg } from '../services/disasterMsgApi';
import { normalizeGwangjuDisplayText } from '../services/administrativeRegions';

const getLocationLabel = (msg: DisasterMsg) => {
  const raw = msg.location_name || '';
  const first = raw.split(',')[0]?.trim();
  return first ? normalizeGwangjuDisplayText(first) : '전국';
};

const truncate = (value: string, max = 120) => {
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max)}…` : value;
};

const DisasterTicker: React.FC = () => {
  const [messages, setMessages] = useState<DisasterMsg[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadMessages = async () => {
      try {
        const msgs = await fetchDisasterMsgs();

        if (!isMounted) return;

        const latest = [...msgs]
          .sort((a, b) => {
            const da = new Date(a.create_date || '').getTime();
            const db = new Date(b.create_date || '').getTime();
            if (Number.isNaN(da)) return 1;
            if (Number.isNaN(db)) return -1;
            return db - da;
          })
          .slice(0, 5);

        setMessages(latest);
      } catch (error) {
        console.warn('[DisasterTicker] failed:', error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadMessages();

    const interval = window.setInterval(loadMessages, 3 * 60 * 1000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);

  if (loading || messages.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-error/10 border-l-4 border-error p-3 mb-6 rounded-xl shadow-sm"
    >
      <div className="flex items-start">
        <div className="flex-shrink-0 flex items-center h-full pt-1">
          <span className="material-symbols-outlined text-error mr-2">
            warning
          </span>
          <span className="font-bold text-error text-sm whitespace-nowrap">
            재난/안전 알림
          </span>
        </div>

        <div className="ml-3 flex-1 overflow-hidden">
          <div className="animate-ticker whitespace-nowrap">
            {messages.map((msg, idx) => (
              <span
                key={msg.md101_sn || idx}
                className="inline-block mr-8 text-sm text-on-surface"
                title={msg.msg}
              >
                <span className="font-semibold">[{getLocationLabel(msg)}]</span>{' '}
                {truncate(msg.msg)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DisasterTicker;
