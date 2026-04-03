import { useState, useEffect, useCallback } from 'react';
import { fetchFireDamage, type FireDamageItem } from '../services/apiClient';

/* ─── 색상 팔레트 ─── */
const PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#ec4899', '#f43f5e', '#64748b', '#84cc16',
];

/* ─── 시도 목록 ─── */
const SIDO_LIST = [
  '전체', '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
];

/* ─── 유틸 ─── */
function num(v: any): number { return parseInt(v) || 0; }

function formatDate(raw: string): string {
  if (!raw || raw.length < 8) return raw || '-';
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

function formatAmount(amt: number): string {
  if (amt >= 100000) return `${(amt / 1000).toFixed(0)}백만원`;
  if (amt >= 1000) return `${(amt / 1000).toFixed(1)}백만원`;
  if (amt > 0) return `${amt}천원`;
  return '-';
}

/* ─── 빈 상태 ─── */
function EmptyState({ icon, text, sub }: { icon: string; text: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant/40">
      <span className="material-symbols-outlined text-4xl mb-3">{icon}</span>
      <p className="text-sm font-medium">{text}</p>
      {sub && <p className="text-[10px] mt-1 max-w-sm text-center">{sub}</p>}
    </div>
  );
}

/* ─── 요약 카드 ─── */
function StatCard({ icon, iconColor, label, value, sub }: {
  icon: string; iconColor: string; label: string; value: string | number; sub?: string;
}) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 relative overflow-hidden group">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">{label}</p>
        <span className={`material-symbols-outlined text-xl ${iconColor} group-hover:scale-110 transition-transform`}>{icon}</span>
      </div>
      <p className="text-2xl font-extrabold text-on-surface mt-2 font-headline tabular-nums">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {sub && <p className="text-[10px] text-on-surface-variant mt-0.5">{sub}</p>}
    </div>
  );
}

/* ─── 스켈레톤 ─── */
function TableSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="flex gap-3">
          <div className="w-20 h-5 bg-surface-container rounded" />
          <div className="flex-1 h-5 bg-surface-container rounded" style={{ width: `${90 - i * 8}%` }} />
          <div className="w-16 h-5 bg-surface-container rounded" />
          <div className="w-12 h-5 bg-surface-container rounded" />
          <div className="w-16 h-5 bg-surface-container rounded" />
        </div>
      ))}
    </div>
  );
}

/* ─── 지역별 집계 바 차트 ─── */
function RegionBarChart({ data }: { data: { name: string; count: number; damage: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="space-y-1.5">
      {data.slice(0, 15).map((d, i) => {
        const pct = (d.count / max) * 100;
        return (
          <div key={d.name} className="flex items-center gap-2">
            <span className="text-[11px] text-on-surface-variant w-24 text-right truncate">{d.name}</span>
            <div className="flex-1 h-5 bg-surface-container rounded overflow-hidden relative">
              <div className="h-full rounded transition-all duration-700 ease-out"
                style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${PALETTE[i % PALETTE.length]}aa, ${PALETTE[i % PALETTE.length]})` }} />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-on-surface">
                {d.count.toLocaleString()}건
              </span>
            </div>
            <span className="text-[10px] text-on-surface-variant w-20 text-right tabular-nums">
              {formatAmount(d.damage)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════ 메인 컴포넌트 ═══════ */
export default function FireDamageView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<FireDamageItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedSido, setSelectedSido] = useState('전체');
  const PAGE_SIZE = 50;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {
        pageNo: String(page),
        numOfRows: String(PAGE_SIZE),
      };
      if (selectedSido !== '전체') {
        params.lawAddrName = selectedSido;
      }
      const res = await fetchFireDamage(params);
      if (res.error) {
        setError(res.error);
        setItems([]);
        setTotalCount(0);
      } else {
        setItems(res.items || []);
        setTotalCount(res.totalCount || 0);
      }
    } catch (e: any) {
      setError(e?.message || '데이터 조회 실패');
      setItems([]);
    }
    setLoading(false);
  }, [page, selectedSido]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 집계 계산
  const summary = items.reduce(
    (acc, it) => ({
      fires: acc.fires + 1,
      deaths: acc.deaths + num(it.deadPercnt),
      injuries: acc.injuries + num(it.injrdprPercnt),
      damage: acc.damage + num(it.prptDmgSbttAmt),
    }),
    { fires: 0, deaths: 0, injuries: 0, damage: 0 }
  );

  // 지역별 집계 (법정동 → 시도/구군 추출)
  const regionMap = new Map<string, { count: number; damage: number }>();
  items.forEach(it => {
    const addr = it.lawAddrName || '기타';
    const parts = addr.split(' ');
    const region = parts.length >= 2 ? `${parts[0]} ${parts[1]}` : parts[0];
    const prev = regionMap.get(region) || { count: 0, damage: 0 };
    regionMap.set(region, { count: prev.count + 1, damage: prev.damage + num(it.prptDmgSbttAmt) });
  });
  const regionData = Array.from(regionMap.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.count - a.count);

  // 소방서별 집계
  const stationMap = new Map<string, number>();
  items.forEach(it => {
    const stn = it.gutFsttOgidNm || '미상';
    stationMap.set(stn, (stationMap.get(stn) || 0) + 1);
  });
  const stationData = Array.from(stationMap.entries())
    .map(([name, count]) => ({ name, count, damage: 0 }))
    .sort((a, b) => b.count - a.count);

  const maxPage = Math.ceil(totalCount / PAGE_SIZE) || 1;

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-on-surface font-headline">🗺️ 지역별 화재피해</h2>
          <p className="text-sm text-on-surface-variant mt-1">소방청 화재 조사 완료 건별 데이터 · 2019~2023</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedSido}
            onChange={e => { setSelectedSido(e.target.value); setPage(1); }}
            className="bg-surface-container border border-outline-variant/20 text-on-surface px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
          >
            {SIDO_LIST.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={fetchData} disabled={loading}
            className="bg-error/10 text-error px-4 py-2 rounded-lg text-sm font-bold hover:bg-error/20 transition-colors flex items-center gap-2 disabled:opacity-50">
            <span className={`material-symbols-outlined text-lg ${loading ? 'animate-spin' : ''}`}>refresh</span>
            새로고침
          </button>
        </div>
      </div>

      {/* 요약 카드 */}
      {!loading && !error && items.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon="local_fire_department" iconColor="text-red-400" label="화재 건수" value={totalCount} sub={`현재 페이지: ${items.length}건`} />
          <StatCard icon="skull" iconColor="text-red-600" label="사망자" value={summary.deaths} sub="현재 페이지 기준" />
          <StatCard icon="personal_injury" iconColor="text-orange-400" label="부상자" value={summary.injuries} sub="현재 페이지 기준" />
          <StatCard icon="payments" iconColor="text-amber-400" label="재산 피해"
            value={formatAmount(summary.damage)} sub="천원 단위 합계" />
        </div>
      )}

      {/* API 에러 */}
      {!loading && error && (
        <div className="bg-error-container/30 border border-error/30 rounded-xl p-6 text-center">
          <span className="material-symbols-outlined text-5xl text-error/60 mb-3 block">cloud_off</span>
          <h3 className="text-lg font-bold text-on-surface mb-2">화재피해 API 연결 실패</h3>
          <p className="text-sm text-error/80 max-w-lg mx-auto mb-1">{error}</p>
          <p className="text-xs text-on-surface-variant max-w-lg mx-auto mb-4">
            API 키 승인 직후에는 활성화까지 1~2시간이 소요될 수 있습니다.<br />
            잠시 후 다시 시도해주세요.
          </p>
          <button onClick={fetchData}
            className="bg-error/15 text-error px-5 py-2 rounded-lg text-sm font-bold hover:bg-error/25 transition-colors inline-flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">refresh</span>
            다시 시도
          </button>
        </div>
      )}

      {/* 로딩 */}
      {loading && <TableSkeleton />}

      {/* 데이터 없음 */}
      {!loading && !error && items.length === 0 && (
        <EmptyState icon="search_off" text="조회된 화재 데이터가 없습니다"
          sub="API 키가 방금 승인되었다면 활성화까지 1~2시간이 필요합니다. 필터 조건을 변경하거나 잠시 후 다시 시도해주세요." />
      )}

      {/* 차트 영역 2열 */}
      {!loading && items.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 지역별 화재 */}
          <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
            <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-red-400">location_on</span>
              지역별 화재 현황
            </h3>
            <RegionBarChart data={regionData} />
          </section>

          {/* 소방서별 출동 */}
          <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
            <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-blue-400">fire_truck</span>
              소방서별 출동 현황
            </h3>
            <RegionBarChart data={stationData} />
          </section>
        </div>
      )}

      {/* 상세 테이블 */}
      {!loading && items.length > 0 && (
        <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
          <div className="p-6 border-b border-outline-variant/10 flex items-center justify-between">
            <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-orange-400">table_rows</span>
              개별 화재 건 목록
            </h3>
            <p className="text-xs text-on-surface-variant tabular-nums">
              전체 {totalCount.toLocaleString()}건 · 페이지 {page}/{maxPage}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-container/50">
                  <th className="px-5 py-3 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">발생일자</th>
                  <th className="px-3 py-3 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">주소</th>
                  <th className="px-3 py-3 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">출동소방서</th>
                  <th className="px-3 py-3 text-right text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">사망</th>
                  <th className="px-3 py-3 text-right text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">부상</th>
                  <th className="px-5 py-3 text-right text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">재산피해</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {items.map((it, i) => (
                  <tr key={i} className="hover:bg-surface-container/30 transition-colors">
                    <td className="px-5 py-3 text-sm tabular-nums text-on-surface">{formatDate(it.ocrnYmdhh)}</td>
                    <td className="px-3 py-3 text-sm text-on-surface max-w-[240px] truncate">{it.lawAddrName || '-'}</td>
                    <td className="px-3 py-3 text-sm text-on-surface-variant">{it.gutFsttOgidNm || '-'}</td>
                    <td className="px-3 py-3 text-right text-sm tabular-nums">
                      {num(it.deadPercnt) > 0
                        ? <span className="text-red-400 font-bold">{it.deadPercnt}</span>
                        : <span className="text-on-surface-variant/40">-</span>}
                    </td>
                    <td className="px-3 py-3 text-right text-sm tabular-nums">
                      {num(it.injrdprPercnt) > 0
                        ? <span className="text-orange-400 font-medium">{it.injrdprPercnt}</span>
                        : <span className="text-on-surface-variant/40">-</span>}
                    </td>
                    <td className="px-5 py-3 text-right text-sm tabular-nums text-on-surface-variant">
                      {num(it.prptDmgSbttAmt) > 0 ? formatAmount(num(it.prptDmgSbttAmt)) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          {maxPage > 1 && (
            <div className="p-4 border-t border-outline-variant/10 flex items-center justify-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="px-3 py-1.5 rounded-lg text-sm font-bold bg-surface-container hover:bg-surface-container-high disabled:opacity-30 transition-colors">
                ← 이전
              </button>
              <span className="text-sm text-on-surface-variant tabular-nums px-3">
                {page} / {maxPage}
              </span>
              <button onClick={() => setPage(p => Math.min(maxPage, p + 1))} disabled={page >= maxPage}
                className="px-3 py-1.5 rounded-lg text-sm font-bold bg-surface-container hover:bg-surface-container-high disabled:opacity-30 transition-colors">
                다음 →
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
