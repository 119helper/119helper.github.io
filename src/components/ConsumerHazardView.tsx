import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchConsumerHazardDataset,
  type ConsumerHazardDataset,
  type HazardItem,
} from '../services/consumerHazardApi';
import { getStaleAt } from '../services/apiClient';
import {
  buildConsumerHazardInsights,
  filterConsumerHazards,
  hazardAge,
  hazardItemLabel,
  type HazardPreset,
  type HazardRank,
} from '../utils/consumerHazardInsights';
import {
  buildIncidentHazardSuggestion,
  resolveIncidentHazardSuggestion,
  type IncidentHazardContext,
} from '../utils/incidentHazardSearch';
import StaleBadge from './StaleBadge';

const PRESETS: { id: HazardPreset; label: string; icon: string }[] = [
  { id: 'all', label: '전체', icon: 'dataset' },
  { id: 'fall', label: '낙상·추락', icon: 'falling' },
  { id: 'burn', label: '화상·고온', icon: 'local_fire_department' },
  { id: 'poison', label: '중독·흡입', icon: 'masks' },
  { id: 'cut-crush', label: '베임·끼임', icon: 'personal_injury' },
  { id: 'child', label: '어린이', icon: 'child_care' },
  { id: 'senior', label: '고령자', icon: 'elderly' },
];

function displayValue(value: string, fallback = '정보 없음'): string {
  return !value || value === '-' || value === '해당없음' || value === '미상' ? fallback : value;
}

function formatDate(value: string): string {
  if (!value) return '-';
  return value.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1.$2.$3');
}

function personLabel(item: HazardItem): string {
  const age = hazardAge(item);
  const gender = displayValue(item.gender, '성별 미상');
  return `${age === null ? '연령 미상' : `${age}세`} · ${gender}`;
}

function SummaryCard({ icon, label, value, detail, tone = 'primary' }: {
  icon: string;
  label: string;
  value: string;
  detail: string;
  tone?: 'primary' | 'orange' | 'green' | 'purple';
}) {
  const tones = {
    primary: 'bg-primary/10 text-primary',
    orange: 'bg-orange-500/10 text-orange-700 dark:text-orange-300',
    green: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    purple: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  };

  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="whitespace-nowrap text-xs font-bold tracking-wide text-on-surface-variant">{label}</p>
        <span className={`material-symbols-outlined rounded-lg p-2 text-xl ${tones[tone]}`}>{icon}</span>
      </div>
      <p className="mt-3 truncate text-xl font-extrabold text-on-surface" title={value}>{value}</p>
      <p className="mt-1 text-xs text-on-surface-variant">{detail}</p>
    </div>
  );
}

function RankingPanel({ icon, title, rows, emptyText }: {
  icon: string;
  title: string;
  rows: HazardRank[];
  emptyText: string;
}) {
  const max = rows[0]?.count ?? 1;
  return (
    <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5">
      <h3 className="flex items-center gap-2 font-bold text-on-surface">
        <span className="material-symbols-outlined text-lg text-orange-700 dark:text-orange-300">{icon}</span>
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-on-surface-variant">{emptyText}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.slice(0, 5).map((row, index) => (
            <div key={row.name}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-on-surface">
                  <span className="mr-2 text-xs font-bold text-on-surface-variant">{index + 1}</span>
                  {row.name}
                </span>
                <span className="shrink-0 tabular-nums text-on-surface-variant">
                  {row.count.toLocaleString()}건 · {(row.ratio * 100).toFixed(1)}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-container">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-600 to-amber-400 transition-all duration-500"
                  style={{ width: `${Math.max(4, (row.count / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PatternBrief({ count, cause, place, part, symptom }: {
  count: number;
  cause?: HazardRank;
  place?: HazardRank;
  part?: HazardRank;
  symptom?: HazardRank;
}) {
  if (count === 0) return null;
  const facts = [
    cause && `원인은 ‘${cause.name}’`,
    place && `장소는 ‘${place.name}’`,
    part && `신체 부위는 ‘${part.name}’`,
    symptom && `증상은 ‘${symptom.name}’`,
  ].filter(Boolean);

  return (
    <div className="rounded-2xl border border-orange-500/25 bg-orange-500/5 p-5">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined rounded-xl bg-orange-500/10 p-2 text-orange-700 dark:text-orange-300">crisis_alert</span>
        <div>
          <p className="font-bold text-on-surface">현재 조건에서 확인되는 사고 패턴</p>
          <p className="mt-1 text-sm leading-6 text-on-surface-variant">
            검색된 실제 접수 사례 {count.toLocaleString()}건에서는 {facts.join(', ')} 가장 많이 기록됐습니다.
          </p>
          <p className="mt-2 text-xs text-on-surface-variant">
            접수자료의 빈도 요약이며 발생 가능성 예측이나 응급처치 지침은 아닙니다.
          </p>
        </div>
      </div>
    </div>
  );
}

function HazardCaseCard({ item }: { item: HazardItem }) {
  return (
    <article className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5 transition-colors hover:border-orange-500/35">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="inline-flex rounded-md bg-orange-500/10 px-2.5 py-1 text-xs font-bold text-orange-700 dark:text-orange-300">
            {displayValue(item.occurrencePlace, '장소 미상')}
          </span>
          <h4 className="mt-3 text-lg font-bold leading-snug text-on-surface">{hazardItemLabel(item)}</h4>
          <p className="mt-1 truncate text-xs text-on-surface-variant">
            {displayValue(item.itemMajor, '분류 미상')} › {displayValue(item.itemMiddle, '분류 미상')}
          </p>
        </div>
        <time className="shrink-0 text-xs tabular-nums text-on-surface-variant" dateTime={item.receiveDay}>
          접수 {formatDate(item.receiveDay)}
        </time>
      </div>

      <dl className="mt-4 grid grid-cols-[1.5rem_1fr] gap-x-2 gap-y-2 text-sm">
        <dt><span className="material-symbols-outlined text-lg text-orange-700 dark:text-orange-300">warning</span></dt>
        <dd className="font-semibold text-on-surface">{displayValue(item.injuryReason)}</dd>
        <dt><span className="material-symbols-outlined text-lg text-on-surface-variant">healing</span></dt>
        <dd className="text-on-surface">
          {displayValue(item.injurySymptoms)}
          {displayValue(item.injuryPart, '') && ` · ${displayValue(item.injuryPart, '')}`}
        </dd>
        <dt><span className="material-symbols-outlined text-lg text-on-surface-variant">person</span></dt>
        <dd className="text-on-surface-variant">{personLabel(item)}</dd>
      </dl>
    </article>
  );
}

function LoadingState() {
  return (
    <div className="space-y-5" aria-label="생활안전 사고 인사이트 로딩 중">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map(index => <div key={index} className="h-32 animate-pulse rounded-2xl bg-surface-container" />)}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-2xl bg-surface-container" />
        <div className="h-72 animate-pulse rounded-2xl bg-surface-container" />
      </div>
    </div>
  );
}

export default function ConsumerHazardView({ incidentContext = null }: {
  incidentContext?: IncidentHazardContext | null;
}) {
  const [dataset, setDataset] = useState<ConsumerHazardDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staleAt, setStaleAt] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [preset, setPreset] = useState<HazardPreset>('all');
  const [visibleCount, setVisibleCount] = useState(12);
  const lastAppliedIncidentId = useRef('');

  const incidentSuggestion = useMemo(
    () => buildIncidentHazardSuggestion(incidentContext),
    [incidentContext],
  );
  const resolvedIncidentSuggestion = useMemo(
    () => resolveIncidentHazardSuggestion(incidentSuggestion, dataset?.items ?? []),
    [dataset?.items, incidentSuggestion],
  );

  const loadData = useCallback(async (forceRefresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchConsumerHazardDataset(forceRefresh);
      setDataset(data);
      setStaleAt(getStaleAt(data));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '위해정보 API를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(false); }, [loadData]);
  useEffect(() => { setVisibleCount(12); }, [query, preset]);
  useEffect(() => {
    if (!dataset || !resolvedIncidentSuggestion || lastAppliedIncidentId.current === resolvedIncidentSuggestion.incidentId) return;
    lastAppliedIncidentId.current = resolvedIncidentSuggestion.incidentId;
    setQuery(resolvedIncidentSuggestion.query);
    setPreset(resolvedIncidentSuggestion.preset);
  }, [dataset, resolvedIncidentSuggestion]);

  const filtered = useMemo(
    () => filterConsumerHazards(dataset?.items ?? [], query, preset),
    [dataset?.items, query, preset],
  );
  const overallInsights = useMemo(
    () => buildConsumerHazardInsights(dataset?.items ?? []),
    [dataset?.items],
  );
  const filteredInsights = useMemo(() => buildConsumerHazardInsights(filtered), [filtered]);
  const shownItems = filtered.slice(0, visibleCount);
  const incidentFiltersActive = Boolean(
    resolvedIncidentSuggestion
    && query === resolvedIncidentSuggestion.query
    && preset === resolvedIncidentSuggestion.preset,
  );
  const incidentSearchBroadened = Boolean(
    incidentSuggestion
    && resolvedIncidentSuggestion
    && incidentSuggestion.query !== resolvedIncidentSuggestion.query,
  );
  const analyzedRatio = dataset?.totalCount
    ? Math.min(100, (dataset.loadedCount / dataset.totalCount) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-outline-variant/20 pb-5">
        <div>
          <h2 className="ui-page-title">
            <span className="material-symbols-outlined text-orange-700 dark:text-orange-300">health_and_safety</span>
            생활안전 사고 인사이트
            <StaleBadge at={staleAt} />
          </h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            한국소비자원 실제 접수 사례에서 현장·예방활동에 참고할 사고 패턴을 찾습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadData(true)}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-orange-700 disabled:opacity-50"
        >
          <span className={`material-symbols-outlined text-lg ${loading ? 'animate-spin' : ''}`}>refresh</span>
          새로고침
        </button>
      </header>

      <div role="note" className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-on-surface-variant">
        <span className="material-symbols-outlined text-lg text-amber-700 dark:text-amber-300">schedule</span>
        <strong className="text-on-surface">실시간 출동정보가 아닙니다.</strong>
        <span>접수·공개된 위해 사례의 분석 자료입니다.</span>
        {dataset?.latestReceiveDay && <span>· 확인된 최신 접수일 {formatDate(dataset.latestReceiveDay)}</span>}
        {dataset && <span>· 전체 {dataset.totalCount.toLocaleString()}건 중 {dataset.loadedCount.toLocaleString()}건 분석</span>}
        <a href={dataset?.sourceUrl ?? 'https://www.data.go.kr/data/15142643/openapi.do'} target="_blank" rel="noreferrer" className="font-bold text-primary hover:underline">
          공식 원자료
        </a>
      </div>

      {dataset?.partial && (
        <div role="status" className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-200">
          일부 페이지({dataset.failedPages.join(', ')})를 불러오지 못해 확보된 {dataset.loadedCount.toLocaleString()}건만 분석합니다.
        </div>
      )}

      {error && (
        <div role="alert" className="flex flex-col justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300 sm:flex-row sm:items-center">
          <span>한국소비자원 위해정보를 불러오지 못했습니다. {error}</span>
          <button type="button" onClick={() => void loadData(true)} disabled={loading} className="shrink-0 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
            다시 시도
          </button>
        </div>
      )}

      {loading && !dataset ? <LoadingState /> : dataset ? (
        <>
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <SummaryCard
              icon="event_available"
              label="공개자료 기준"
              value={formatDate(dataset.latestReceiveDay)}
              detail={`${formatDate(dataset.earliestReceiveDay)}부터 확인된 표본`}
              tone="orange"
            />
            <SummaryCard
              icon="dataset"
              label="분석한 접수 사례"
              value={`${dataset.loadedCount.toLocaleString()}건`}
              detail={`전체의 ${analyzedRatio.toFixed(1)}% · ${dataset.loadedPages}개 페이지`}
              tone="primary"
            />
            <SummaryCard
              icon="warning"
              label="주요 사고 원인"
              value={overallInsights.topCauses[0]?.name ?? '분류 없음'}
              detail={overallInsights.topCauses[0] ? `${overallInsights.topCauses[0].count.toLocaleString()}건에서 확인` : '확인 가능한 원인 없음'}
              tone="green"
            />
            <SummaryCard
              icon="groups"
              label="가장 많은 연령군"
              value={overallInsights.ageGroups[0]?.name ?? '연령 정보 없음'}
              detail={overallInsights.ageGroups[0] ? `${overallInsights.ageGroups[0].count.toLocaleString()}건 · 표본 기준` : '확인 가능한 연령 없음'}
              tone="purple"
            />
          </section>

          <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5">
            {incidentSuggestion && incidentContext && (
              <div className="mb-5 rounded-xl border border-primary/25 bg-primary/5 p-4">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-xs font-extrabold text-primary">
                      <span className="material-symbols-outlined text-lg">emergency_home</span>
                      진행 중 사건과 연결됨
                    </p>
                    <p className="mt-2 truncate font-extrabold text-on-surface">{incidentContext.title}</p>
                    {incidentContext.address && (
                      <p className="mt-1 truncate text-xs text-on-surface-variant">{incidentContext.address}</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {incidentSuggestion.labels.map(label => (
                        <span key={label} className="rounded-full bg-surface-container px-2.5 py-1 text-xs font-bold text-on-surface-variant">
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setQuery(resolvedIncidentSuggestion?.query ?? incidentSuggestion.query);
                        setPreset(resolvedIncidentSuggestion?.preset ?? incidentSuggestion.preset);
                      }}
                      className="rounded-lg bg-primary px-3 py-2 text-xs font-extrabold text-on-primary hover:bg-primary/90"
                    >
                      {incidentFiltersActive ? '사건 조건 적용됨' : '사건 조건 적용'}
                    </button>
                    {incidentFiltersActive && (
                      <button
                        type="button"
                        onClick={() => { setQuery(''); setPreset('all'); }}
                        className="rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-2 text-xs font-extrabold text-on-surface hover:bg-surface-container-high"
                      >
                        전체 보기
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-3 text-xs text-on-surface-variant">
                  {incidentSearchBroadened
                    ? `정확히 일치하는 표본이 없어 ‘${resolvedIncidentSuggestion?.query || PRESETS.find(item => item.id === resolvedIncidentSuggestion?.preset)?.label}’ 범위까지 자동으로 넓혔습니다. `
                    : '출동 제목·메모에서 찾은 조건을 자동 적용했습니다. '}
                  실제 현장 판단과는 별개의 과거 접수 사례 검색입니다.
                </p>
              </div>
            )}
            <label htmlFor="hazard-search" className="text-sm font-bold text-on-surface">유사 사고 검색</label>
            <div className="relative mt-2">
              <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
              <input
                id="hazard-search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="예: 욕실 고령자, 전기포트 화상, 유모차 추락"
                className="w-full border border-outline-variant/30 bg-surface-container py-3 pl-11 pr-11 text-on-surface outline-none transition-colors focus:border-orange-500"
              />
              {query && (
                <button type="button" aria-label="검색어 지우기" data-compact-control onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-on-surface-variant hover:bg-surface-container-high">
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              )}
            </div>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="사고 유형 빠른 필터">
              {PRESETS.map(item => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={preset === item.id}
                  onClick={() => setPreset(item.id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-semibold transition-colors ${
                    preset === item.id
                      ? 'border-orange-600 bg-orange-600 text-white'
                      : 'border-outline-variant/30 bg-surface-container text-on-surface hover:border-orange-500/50'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          </section>

          <PatternBrief
            count={filtered.length}
            cause={filteredInsights.topCauses[0]}
            place={filteredInsights.topPlaces[0]}
            part={filteredInsights.topParts[0]}
            symptom={filteredInsights.topSymptoms[0]}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RankingPanel icon="warning" title="위해 원인" rows={filteredInsights.topCauses} emptyText="원인 정보가 없습니다." />
            <RankingPanel icon="home_pin" title="발생 장소" rows={filteredInsights.topPlaces} emptyText="장소 정보가 없습니다." />
            <RankingPanel icon="category" title="관련 품목·시설" rows={filteredInsights.topItems} emptyText="품목 정보가 없습니다." />
            <RankingPanel icon="personal_injury" title="위해 부위" rows={filteredInsights.topParts} emptyText="부위 정보가 없습니다." />
          </div>

          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="ui-section-title">
                  <span className="material-symbols-outlined">fact_check</span>
                  실제 접수 사례
                </h3>
                <p className="mt-1 text-sm text-on-surface-variant">
                  현재 조건 {filtered.length.toLocaleString()}건 · 한 사람이 아닌 접수번호 기준 사례입니다.
                </p>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-outline-variant/30 bg-surface-container-lowest py-16 text-center text-on-surface-variant">
                <span className="material-symbols-outlined mb-2 text-4xl">search_off</span>
                <p className="font-bold text-on-surface">일치하는 접수 사례가 없습니다</p>
                <p className="mt-1 text-sm">검색어를 줄이거나 다른 사고 유형을 선택해 주세요.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {shownItems.map(item => <HazardCaseCard key={item.id} item={item} />)}
                </div>
                {shownItems.length < filtered.length && (
                  <div className="mt-5 text-center">
                    <button type="button" onClick={() => setVisibleCount(count => count + 12)} className="rounded-xl border border-outline-variant/30 bg-surface-container px-5 py-2.5 text-sm font-bold text-on-surface hover:border-orange-500/50">
                      사례 12건 더 보기 ({shownItems.length.toLocaleString()} / {filtered.length.toLocaleString()})
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      ) : !error ? (
        <div className="rounded-2xl border border-dashed border-outline-variant/30 py-16 text-center text-on-surface-variant">조회 결과가 없습니다.</div>
      ) : null}
    </div>
  );
}
