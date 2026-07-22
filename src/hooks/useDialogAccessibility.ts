import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const openDialogStack: HTMLElement[] = [];

/**
 * 모달/모바일 드로어의 키보드 포커스를 내부에 유지하고 닫힌 뒤 원래 위치로 돌려보낸다.
 */
export function useDialogAccessibility<T extends HTMLElement>(
  isOpen: boolean,
  onClose: () => void,
  returnFocusRef?: RefObject<HTMLElement | null>,
) {
  const dialogRef = useRef<T>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const dialog = dialogRef.current;
    if (dialog) openDialogStack.push(dialog);

    const explicitReturnFocus = returnFocusRef?.current ?? null;
    previousFocusRef.current = explicitReturnFocus ?? (
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    );

    const focusInitialControl = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;

      const preferred = dialog.querySelector<HTMLElement>('[data-dialog-initial-focus]');
      const firstFocusable = dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (preferred ?? firstFocusable ?? dialog).focus({ preventScroll: true });
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog || openDialogStack[openDialogStack.length - 1] !== dialog) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter(element => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true');

      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusInitialControl);
      document.removeEventListener('keydown', handleKeyDown);
      const wasTopDialog = openDialogStack[openDialogStack.length - 1] === dialog;
      const stackIndex = dialog ? openDialogStack.lastIndexOf(dialog) : -1;
      if (stackIndex >= 0) openDialogStack.splice(stackIndex, 1);
      const returnFocus = explicitReturnFocus ?? previousFocusRef.current;
      if (wasTopDialog && returnFocus?.isConnected && !returnFocus.closest('[inert]')) {
        returnFocus.focus({ preventScroll: true });
      }
    };
  }, [isOpen, returnFocusRef]);

  return dialogRef;
}
