import { useCallback } from 'react';
import { useAppFeedback } from '../contexts/FeedbackContext';

interface UnsavedChangesGuardOptions {
  isDirty: boolean;
  onDiscard: () => void;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export function useUnsavedChangesGuard({
  isDirty,
  onDiscard,
  title = '변경사항을 버릴까요?',
  message = '저장하지 않은 변경사항이 있습니다. 닫으면 이번에 입력한 내용이 사라집니다.',
  confirmLabel = '변경 버리기',
  cancelLabel = '계속 편집',
}: UnsavedChangesGuardOptions) {
  const { confirmAction } = useAppFeedback();

  return useCallback(async () => {
    if (!isDirty) {
      onDiscard();
      return true;
    }

    const approved = await confirmAction({
      title,
      message,
      confirmLabel,
      cancelLabel,
      tone: 'warning',
    });
    if (!approved) return false;

    onDiscard();
    return true;
  }, [cancelLabel, confirmAction, confirmLabel, isDirty, message, onDiscard, title]);
}
