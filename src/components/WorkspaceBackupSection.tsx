import { useRef, useState } from 'react';
import { createWorkspaceBackup, MAX_BACKUP_BYTES, parseWorkspaceBackup, restoreWorkspaceBackup, type WorkspaceBackup } from '../services/workspaceBackup';
import { useAppFeedback } from '../contexts/FeedbackContext';

export default function WorkspaceBackupSection({ disabled = false }: { disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState<WorkspaceBackup | null>(null);
  const [message, setMessage] = useState('');
  const { confirmAction } = useAppFeedback();
  const exportBackup = async () => {
    if (!await confirmAction({ title: '업무자료 백업', message: '파일에는 메모, 일정, 대상물 연락처·사진, 종료된 출동과 환자 기록이 포함됩니다. 암호화되지 않은 파일이므로 안전한 곳에 보관하세요.', confirmLabel: '백업 파일 저장', tone: 'warning' })) return;
    setBusy(true);
    try {
      const bundle = await createWorkspaceBackup();
      const url = URL.createObjectURL(new Blob([JSON.stringify(bundle)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = `119-helper-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('백업 파일을 만들었습니다. 브라우저의 다운로드 목록을 확인하세요.');
    } catch (error) { setMessage(error instanceof Error ? error.message : '백업 실패'); }
    finally { setBusy(false); }
  };
  const readBackup = async (file: File) => {
    setBusy(true); setBackup(null); setMessage('');
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('25MB 이하의 백업을 선택하세요.');
      setBackup(parseWorkspaceBackup(await file.text()));
    } catch { setMessage('백업 형식·버전·사진을 확인할 수 없습니다. 올바른 백업 파일을 선택하세요.'); }
    finally { setBusy(false); }
  };
  const restore = async () => {
    if (!backup || !await confirmAction({ title: '업무자료 복원', message: '기존 자료는 유지하고 없는 자료만 추가합니다. 종료 출동에는 현재 자동 삭제 기간이 적용됩니다. 저장 공간 부족 시 일부만 반영될 수 있으며 결과를 안내합니다.', confirmLabel: '자료 추가' })) return;
    setBusy(true);
    try { setMessage(await restoreWorkspaceBackup(backup)); setBackup(null); }
    catch (error) { setMessage(error instanceof Error ? error.message : '복원 실패'); }
    finally { setBusy(false); }
  };
  return <section aria-label="업무자료 백업과 복원" className="space-y-3 rounded-xl border border-outline-variant/20 p-4">
    <h3 className="font-bold text-on-surface">업무자료 백업·복원</h3>
    <p className="text-xs leading-5 text-on-surface-variant">메모·일정·대상물과 사진·종료된 출동을 파일로 보관합니다. 진행 중인 출동과 잠금 설정은 포함하지 않습니다. 최대 25MB.</p>
    {disabled && <p className="text-xs text-on-surface-variant">공용 기기 모드를 해제하고 설정을 저장한 후 이용하세요.</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={disabled || busy} className="min-h-11 rounded-lg bg-primary px-3 text-sm font-bold text-on-primary disabled:opacity-50" onClick={() => void exportBackup()}>백업 파일 저장</button>
      <button type="button" disabled={disabled || busy} className="min-h-11 rounded-lg bg-surface-container-high px-3 text-sm font-bold text-on-surface disabled:opacity-50" onClick={() => input.current?.click()}>백업 파일 선택</button>
      <input ref={input} type="file" accept=".json,application/json" aria-label="업무자료 백업 파일" className="hidden" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void readBackup(file); }} />
    </div>
    {backup && <div className="space-y-2 text-sm text-on-surface">
      <p>복원 미리보기: 메모 {backup.notes.length}개 · 일정 {backup.schedules.length}개 · 대상물 {backup.preplans.plans.length}개 · 종료 출동 {backup.incidents.length}개</p>
      <button type="button" disabled={busy || disabled} className="min-h-11 rounded-lg bg-primary px-3 font-bold text-on-primary disabled:opacity-50" onClick={() => void restore()}>기존 자료를 유지하고 복원</button>
    </div>}
    {message && <p role="status" className="text-sm leading-5 text-on-surface">{message}</p>}
  </section>;
}
