import { useEffect, useRef, useState } from 'react';
import { fetchNewsThumbnail } from '../services/newsApi';

interface NewsThumbnailProps {
  src?: string;
  isHero: boolean;
  gradient: string;
  icon: string;
}

export default function NewsThumbnail({
  src,
  isHero,
  gradient,
  icon,
}: NewsThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [objectUrl, setObjectUrl] = useState('');
  const [failed, setFailed] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(isHero);

  useEffect(() => {
    setShouldLoad(isHero);
    if (!src || isHero) return;

    if (typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }

    const target = containerRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      setShouldLoad(true);
      observer.disconnect();
    }, { rootMargin: '320px 0px' });

    observer.observe(target);
    return () => observer.disconnect();
  }, [isHero, src]);

  useEffect(() => {
    const controller = new AbortController();
    let createdObjectUrl = '';

    setObjectUrl('');
    setFailed(false);

    if (src && shouldLoad) {
      void fetchNewsThumbnail(src, controller.signal)
        .then(blob => {
          if (controller.signal.aborted) return;
          createdObjectUrl = URL.createObjectURL(blob);
          setObjectUrl(createdObjectUrl);
        })
        .catch(error => {
          if (controller.signal.aborted) return;
          console.warn('[NewsThumbnail] failed:', error);
          setFailed(true);
        });
    }

    return () => {
      controller.abort();
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };
  }, [shouldLoad, src]);

  const showImage = Boolean(objectUrl) && !failed;

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={`
        relative z-10 overflow-hidden bg-gradient-to-br ${gradient} shrink-0 flex items-center justify-center
        ${isHero
          ? 'w-full md:w-1/2 h-64 md:h-auto border-b md:border-b-0 md:border-r border-outline-variant/20'
          : 'w-full h-48 sm:h-44 border-b border-outline-variant/20'}
      `}
    >
      <span
        className={`material-symbols-outlined text-white/80 text-[72px] transition-opacity duration-300 ${showImage ? 'opacity-0' : 'opacity-100'}`}
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        {icon}
      </span>

      {showImage && (
        <img
          src={objectUrl}
          alt=""
          loading={isHero ? 'eager' : 'lazy'}
          fetchPriority={isHero ? 'high' : 'auto'}
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
          onError={() => setFailed(true)}
        />
      )}

      {isHero && showImage && (
        <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-surface-container-lowest to-transparent hidden md:block" />
      )}
    </div>
  );
}
