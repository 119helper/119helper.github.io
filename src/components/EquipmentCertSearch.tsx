import { useState, useEffect } from 'react';
import { ShieldCheck, Search, AlertCircle, FireExtinguisher, Truck, Loader2 } from 'lucide-react';
import { 
  fetchEquipmentCerts, 
  fetchExtinguisherCerts
} from '../services/equipmentApi';
import type { EquipmentCert, ExtinguisherCert } from '../services/equipmentApi';
import DonutChart from './charts/DonutChart';

type TabMode = 'VEHICLE' | 'EXTINGUISHER';

// 장비 코드 매핑 리스트
const EQUIPMENT_TYPES = [
  { code: 'ALL', name: '전체' },
  { code: '23201', name: '구조차' },
  { code: '24501', name: '소방펌프차' },
  { code: '24601', name: '소방물탱크차' },
  { code: '24701', name: '소방화학차' },
  { code: '24801', name: '소방사다리차(고가)' },
];

export default function EquipmentCertSearch() {
  const [activeTab, setActiveTab] = useState<TabMode>('VEHICLE');
  
  // 상태: 차량/장비 인증 검색 파라미터
  const [vehGdsCd, setVehGdsCd] = useState<string>('ALL');
  const [vehYear, setVehYear] = useState<number>(new Date().getFullYear());
  
  // 상태: 소화기 검색 파라미터
  const [extYear, setExtYear] = useState<string>(new Date().getFullYear().toString());
  const [extNo, setExtNo] = useState<string>('0001');

  // 데이터 상태
  const [vehData, setVehData] = useState<EquipmentCert[]>([]);
  const [extData, setExtData] = useState<ExtinguisherCert[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 초기 렌더링시 차량 전체 로드
  useEffect(() => {
    if (activeTab === 'VEHICLE') {
      handleSearchVehicle();
    }
  }, []);

  const handleSearchVehicle = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const fromAprv = `${vehYear}0101`;
      const toAprv = `${vehYear}1231`;
      const data = await fetchEquipmentCerts(fromAprv, toAprv, vehGdsCd !== 'ALL' ? vehGdsCd : undefined);
      setVehData(data.items);
    } catch (err: any) {
      handleApiError(err);
      setVehData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchExtinguisher = async () => {
    if (!extYear || !extNo) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchExtinguisherCerts(extYear, extNo);
      setExtData(data.items);
    } catch (err: any) {
      handleApiError(err);
      setExtData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleApiError = (err: any) => {
    const msg = err.message || '';
    if (msg.includes('INVALID_REQUEST_PARAMETER_ERROR') || msg.includes('API 접근이 거부되었습니다')) {
      setErrorMsg('API 키 승인 대기 중이거나 잘못된 요청입니다. (어제 발급받으신 경우, 공공데이터 포털 동기화에 최대 24시간이 소요될 수 있습니다.)');
    } else {
      setErrorMsg(msg);
    }
  };

  // 장비 통계 계산용 (제조업체별 비율 등)
  const getVehChartData = () => {
    if (!vehData.length) return [];
    const counts = vehData.reduce((acc, curr) => {
      acc[curr.cmpyNm] = (acc[curr.cmpyNm] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5); // 최대 5개 업체만
  };

  return (
    <div className="flex h-full flex-col bg-background text-on-background">
      <div className="flex items-center justify-between border-b border-outline-variant p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-primary" />
          <h1 className="text-xl font-bold">장비 및 소화기 인증 조회</h1>
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className="flex border-b border-outline-variant px-4 pt-2">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 flex items-center gap-2 ${
            activeTab === 'VEHICLE'
              ? 'border-primary text-primary'
              : 'border-transparent text-on-surface-variant'
          }`}
          onClick={() => setActiveTab('VEHICLE')}
        >
          <Truck size={18} /> 차량/장비 인증 조회
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 flex items-center gap-2 ${
            activeTab === 'EXTINGUISHER'
              ? 'border-primary text-primary'
              : 'border-transparent text-on-surface-variant'
          }`}
          onClick={() => setActiveTab('EXTINGUISHER')}
        >
          <FireExtinguisher size={18} /> 소화기 정비 조회
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        
        {/* Error 방어 노출 */}
        {errorMsg && (
          <div className="bg-error/10 border border-error/50 rounded-lg p-4 flex gap-3 text-error">
            <AlertCircle className="shrink-0" />
            <div>
              <p className="font-bold">조회 중 오류가 발생했습니다.</p>
              <p className="text-sm mt-1">{errorMsg}</p>
            </div>
          </div>
        )}

        {activeTab === 'VEHICLE' ? (
          <>
            {/* 차량/장비 검색 패널 */}
            <div className="bg-surface-variant rounded-xl p-4 flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">장비유형</label>
                <select
                  value={vehGdsCd}
                  onChange={(e) => setVehGdsCd(e.target.value)}
                  className="bg-surface text-on-surface border border-outline rounded-lg px-3 py-2 outline-none focus:border-primary"
                >
                  {EQUIPMENT_TYPES.map(eq => (
                    <option key={eq.code} value={eq.code}>{eq.name}</option>
                  ))}
                </select>
              </div>
              <div>
                 <label className="block text-xs font-medium text-on-surface-variant mb-1">인증연도</label>
                 <input 
                   type="number" 
                   value={vehYear}
                   onChange={e => setVehYear(Number(e.target.value))}
                   className="w-24 bg-surface text-on-surface border border-outline rounded-lg px-3 py-2 outline-none focus:border-primary"
                 />
              </div>
              <button
                onClick={handleSearchVehicle}
                disabled={loading}
                className="bg-primary text-on-primary px-6 py-2 rounded-lg font-medium hover:bg-primary/90 flex items-center gap-2 transition-colors disabled:opacity-50 h-[42px]"
              >
                {loading ? <Loader2 className="animate-spin" size={18}/> : <Search size={18} />} 조회
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* 목록 */}
              <div className="lg:col-span-2 space-y-4">
                <h3 className="font-medium text-lg">인증 결과 ({vehData.length}건)</h3>
                {!loading && vehData.length === 0 && !errorMsg ? (
                  <div className="bg-surface-variant rounded-xl p-8 text-center text-on-surface-variant">
                    해당 연도/유형의 인증된 장비 내역이 없습니다.
                  </div>
                ) : (
                  <div className="bg-surface-variant rounded-xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[600px]">
                        <thead>
                          <tr className="bg-surface-variant/50 text-on-surface-variant text-sm border-b border-outline-variant">
                            <th className="px-4 py-3 font-medium">장비명</th>
                            <th className="px-4 py-3 font-medium">인증번호</th>
                            <th className="px-4 py-3 font-medium">인증일자</th>
                            <th className="px-4 py-3 font-medium">업체명</th>
                          </tr>
                        </thead>
                        <tbody className="text-sm">
                          {vehData.map((item, idx) => (
                            <tr key={idx} className="border-b border-outline-variant/30 hover:bg-surface-variant/30 transition-colors">
                              <td className="px-4 py-3 font-medium">{item.gdsNm}</td>
                              <td className="px-4 py-3 text-primary">{item.feqpmCtfcnNo}</td>
                              <td className="px-4 py-3">{item.ctfcnYmd}</td>
                              <td className="px-4 py-3">{item.cmpyNm}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              
              {/* 차트 */}
              <div className="space-y-4">
                <h3 className="font-medium text-lg">주요 업체 비율</h3>
                <div className="bg-surface-variant rounded-xl p-4 min-h-[300px]">
                   {vehData.length > 0 ? (
                      <DonutChart data={getVehChartData()} size={250} innerRadius={60} />
                   ) : (
                      <div className="flex h-full items-center justify-center text-on-surface-variant text-sm">
                        데이터가 없습니다.
                      </div>
                   )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* 소화기 검색 패널 */}
            <div className="bg-surface-variant rounded-xl p-4 flex flex-wrap gap-4 items-end">
              <div>
                 <label className="block text-xs font-medium text-on-surface-variant mb-1">정비연도 입력</label>
                 <input 
                   type="text" 
                   value={extYear}
                   placeholder="예: 2020"
                   onChange={e => setExtYear(e.target.value)}
                   className="w-28 bg-surface text-on-surface border border-outline rounded-lg px-3 py-2 outline-none focus:border-primary placeholder:text-on-surface-variant/50"
                 />
              </div>
              <div>
                 <label className="block text-xs font-medium text-on-surface-variant mb-1">정비번호 입력</label>
                 <input 
                   type="text" 
                   value={extNo}
                   placeholder="예: 0001"
                   onChange={e => setExtNo(e.target.value)}
                   className="w-32 bg-surface text-on-surface border border-outline rounded-lg px-3 py-2 outline-none focus:border-primary placeholder:text-on-surface-variant/50"
                 />
              </div>
              <button
                onClick={handleSearchExtinguisher}
                disabled={loading || !extYear || !extNo}
                className="bg-primary text-on-primary px-6 py-2 rounded-lg font-medium hover:bg-primary/90 flex items-center gap-2 transition-colors disabled:opacity-50 h-[42px]"
              >
                {loading ? <Loader2 className="animate-spin" size={18}/> : <Search size={18} />} 조회
              </button>
            </div>

            {/* 소화기 검색 결과 */}
            <div className="space-y-4">
               <h3 className="font-medium text-lg">정비현황 결과 ({extData.length}건)</h3>
               {!loading && extData.length === 0 && !errorMsg ? (
                 <div className="bg-surface-variant rounded-xl p-8 text-center text-on-surface-variant">
                    결과가 없습니다. 연도와 정비번호를 확인해주세요.
                 </div>
               ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {extData.map((item, idx) => (
                    <div key={idx} className="bg-surface rounded-xl p-5 border border-outline-variant shadow-sm hover:border-primary transition-colors">
                       <div className="flex justify-between items-start mb-3">
                         <div className="font-bold text-lg">{item.exsrImpmCmpyNm}</div>
                         <div className="text-xs bg-primary/20 text-primary px-2 py-1 rounded-md mb-2">
                           {item.exagQtyCn}kg
                         </div>
                       </div>
                       
                       <div className="space-y-2 text-sm text-on-surface-variant">
                          <div className="flex justify-between border-b border-outline-variant pb-1">
                            <span>정비/승인일자</span>
                            <span className="text-on-surface">{item.exsrImpmYmd} / {item.exsrImpmAprvYmd}</span>
                          </div>
                          <div className="flex justify-between border-b border-outline-variant pb-1">
                            <span>정비년-번호</span>
                            <span className="text-on-surface">{item.exsrImpmYrNo}</span>
                          </div>
                          <div className="flex justify-between pb-1">
                            <span className="font-medium">합격표시번호</span>
                            <span className="font-bold text-primary">{item.psmrkPrfcNo}</span>
                          </div>
                       </div>
                    </div>
                  ))}
                </div>
               )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
