import { useEffect, useRef, useState } from 'react';
import { fetchNewsThumbnail } from '../services/newsApi';

function revokeObjectUrlOnce(objectUrl: string, revokedObjectUrls: Set<string>) {
  if (!objectUrl || revokedObjectUrls.has(objectUrl)) return;
  URL.revokeObjectURL(objectUrl);
  revokedObjectUrls.add(objectUrl);
}

interface NewsThumbnailProps {
  src?: string;
  isHero: boolean;
}

export default function NewsThumbnail({
  src,
  isHero,
}: NewsThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const revokedObjectUrlsRef = useRef(new Set<string>());
  const [objectUrl, setObjectUrl] = useState('');
  const [failed, setFailed] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(isHero);
  const [portrait, setPortrait] = useState(false);

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
    const revokedObjectUrls = revokedObjectUrlsRef.current;

    setObjectUrl('');
    setFailed(false);
    setPortrait(false);

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
      revokeObjectUrlOnce(createdObjectUrl, revokedObjectUrls);
    };
  }, [shouldLoad, src]);

  const showImage = Boolean(objectUrl) && !failed;
  if (!src || failed) return null;

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={`
        relative z-10 overflow-hidden bg-surface-container-high shrink-0 flex items-center justify-center
        ${isHero
          ? 'w-full aspect-video 2xl:w-1/2 2xl:aspect-auto 2xl:h-auto border-b 2xl:border-b-0 2xl:border-r border-outline-variant/20'
          : 'w-full aspect-video border-b border-outline-variant/20'}
      `}
    >
      {!showImage && (
        <div
          data-testid="news-thumbnail-loading"
          className="absolute inset-0 overflow-hidden bg-surface-container-high"
        >
          <div className="absolute inset-0 animate-pulse motion-reduce:animate-none bg-gradient-to-r from-transparent via-on-surface/5 to-transparent" />
          <span
            className="material-symbols-outlined absolute inset-0 flex items-center justify-center text-on-surface-variant/20"
            style={{ fontVariationSettings: "'FILL' 1", fontSize: '48px' }}
          >
            image
          </span>
        </div>
      )}

      {showImage && (
        <img
          src={objectUrl}
          alt=""
          loading={isHero ? 'eager' : 'lazy'}
          fetchPriority={isHero ? 'high' : 'auto'}
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
          style={{ objectPosition: portrait ? 'center 20%' : 'center' }}
          onLoad={event => {
            const image = event.currentTarget;
            setPortrait(image.naturalHeight > image.naturalWidth * 1.1);
          }}
          onError={() => {
            revokeObjectUrlOnce(objectUrl, revokedObjectUrlsRef.current);
            setObjectUrl('');
            setFailed(true);
          }}
        />
      )}

      {isHero && showImage && (
        <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-surface-container-lowest to-transparent hidden 2xl:block" />
      )}
    </div>
  );
}
