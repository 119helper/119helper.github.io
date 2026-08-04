import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';

export interface ResponsiveTabItem<T extends string> {
  id: T;
  label: string;
  icon?: string;
}

interface ResponsiveTabsProps<T extends string> {
  items: readonly ResponsiveTabItem<T>[];
  activeId: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  className?: string;
}

/**
 * 좁은 화면에서는 한 줄 스크롤, 넓은 화면에서는 자연스러운 탭 행으로 동작합니다.
 * 가장자리 그라데이션과 화살표로 숨겨진 항목이 있음을 명확히 보여 줍니다.
 */
export default function ResponsiveTabs<T extends string>({
  items,
  activeId,
  onChange,
  ariaLabel,
  className = '',
}: ResponsiveTabsProps<T>) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef(new Map<T, HTMLButtonElement>());
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false });

  const updateScrollEdges = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    setScrollEdges({
      left: scroller.scrollLeft > 2,
      right: scroller.scrollLeft < maxScrollLeft - 2,
    });
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    updateScrollEdges();
    const frame = window.requestAnimationFrame(updateScrollEdges);
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateScrollEdges);
    resizeObserver?.observe(scroller);
    window.addEventListener('resize', updateScrollEdges);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateScrollEdges);
    };
  }, [items, updateScrollEdges]);

  useEffect(() => {
    const activeButton = buttonRefs.current.get(activeId);
    activeButton?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    const frame = window.requestAnimationFrame(updateScrollEdges);
    return () => window.cancelAnimationFrame(frame);
  }, [activeId, updateScrollEdges]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % items.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + items.length) % items.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = items.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const next = items[nextIndex];
    onChange(next.id);
    buttonRefs.current.get(next.id)?.focus();
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`relative overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container-lowest ${className}`}
    >
      <div
        ref={scrollerRef}
        onScroll={updateScrollEdges}
        className="scrollbar-hide flex snap-x snap-mandatory gap-2 overflow-x-auto p-1.5 scroll-smooth"
      >
        {items.map((item, index) => {
          const selected = activeId === item.id;
          return (
            <button
              key={item.id}
              ref={node => {
                if (node) buttonRefs.current.set(item.id, node);
                else buttonRefs.current.delete(item.id);
              }}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(item.id)}
              onKeyDown={event => handleKeyDown(event, index)}
              className={`flex min-h-11 shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-primary/35 ${
                selected
                  ? 'bg-primary text-on-primary shadow-md shadow-primary/20'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              }`}
            >
              {item.icon && (
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-lg"
                  style={selected ? { fontVariationSettings: "'FILL' 1" } : undefined}
                >
                  {item.icon}
                </span>
              )}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {scrollEdges.left && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 flex w-9 items-center bg-gradient-to-r from-surface-container-lowest via-surface-container-lowest/90 to-transparent pl-0.5 text-on-surface-variant"
        >
          <span className="material-symbols-outlined text-base">chevron_left</span>
        </span>
      )}
      {scrollEdges.right && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-end bg-gradient-to-l from-surface-container-lowest via-surface-container-lowest/90 to-transparent pr-0.5 text-on-surface-variant"
        >
          <span className="material-symbols-outlined text-base">chevron_right</span>
        </span>
      )}
    </div>
  );
}
