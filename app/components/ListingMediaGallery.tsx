'use client';

import { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { useSwipe } from '@/lib/hooks/useSwipe';

const PLACEHOLDER = '/images/listing-placeholder.svg';

type MediaTab = 'photos' | 'floorplan' | 'video' | '3d';

interface MediaImage {
  /** Full-size image — used for the main viewer and the fullscreen lightbox. */
  url: string;
  /** Small image — used for the thumbnail strip. Falls back to `url`. */
  thumbUrl?: string;
  caption?: string;
  order?: number;
  isPrimary?: boolean;
}

interface ListingMediaGalleryProps {
  images: MediaImage[];
  floorPlanUrl?: string | null;
  videoUrl?: string | null;
  virtualTourUrl?: string | null;
  alt: string;
  badges?: React.ReactNode;
}

export default function ListingMediaGallery({
  images,
  floorPlanUrl,
  videoUrl,
  virtualTourUrl,
  alt,
  badges,
}: ListingMediaGalleryProps) {
  const [activeTab, setActiveTab] = useState<MediaTab>('photos');
  const [photoIdx, setPhotoIdx] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const [retryCount, setRetryCount] = useState<Record<number, number>>({});

  const sortedImages = [...images].sort((a, b) => (a.order || 0) - (b.order || 0));
  const hasImages = sortedImages.length > 0;
  const currentImage = sortedImages[photoIdx] || sortedImages[0];

  const tabs: { key: MediaTab; label: string; available: boolean; icon: JSX.Element }[] = [
    {
      key: 'photos', label: `Photos (${sortedImages.length})`, available: hasImages,
      icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    },
    {
      key: 'floorplan', label: 'Floor Plan', available: !!floorPlanUrl,
      icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" /></svg>,
    },
    {
      key: 'video', label: 'Video', available: !!videoUrl,
      icon: <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>,
    },
    {
      key: '3d', label: '3D Tour', available: !!virtualTourUrl,
      icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" /></svg>,
    },
  ];

  const availableTabs = tabs.filter(t => t.available);

  const prevPhoto = useCallback(() => {
    setPhotoIdx(i => i === 0 ? sortedImages.length - 1 : i - 1);
  }, [sortedImages.length]);

  const nextPhoto = useCallback(() => {
    setPhotoIdx(i => i === sortedImages.length - 1 ? 0 : i + 1);
  }, [sortedImages.length]);

  const swipe = useSwipe(nextPhoto, prevPhoto);

  const handleImageError = useCallback((idx: number) => {
    const attempts = retryCount[idx] || 0;
    if (attempts < 2) {
      // Retry after a short delay — Trestle throttling is transient
      setRetryCount(prev => ({ ...prev, [idx]: attempts + 1 }));
    } else {
      setFailed(prev => new Set(prev).add(idx));
    }
  }, [retryCount]);

  // Keyboard navigation for lightbox (Escape, ArrowLeft, ArrowRight)
  useEffect(() => {
    if (!fullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
      else if (e.key === 'ArrowLeft') prevPhoto();
      else if (e.key === 'ArrowRight') nextPhoto();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [fullscreen, prevPhoto, nextPhoto]);

  const showPlaceholder = !hasImages || (failed.size === sortedImages.length);

  return (
    <section className="bg-stone-100">
      <div className="max-w-[1600px] mx-auto">
        {/* Tab bar */}
        {availableTabs.length > 1 && (
          <div className="flex items-center gap-1 px-4 py-2 bg-white/80 backdrop-blur-sm border-b border-black/5">
            {availableTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] md:text-[13px] font-medium transition-all ${
                  activeTab === tab.key
                    ? 'bg-brand-dark text-white'
                    : 'text-brand-dark/85 hover:bg-black/5'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Photo gallery */}
        {activeTab === 'photos' && (
          <div className="relative">
            {/* Taller aspect ratio = less cropping = sharper photos */}
            <div
              className="relative aspect-[4/3] md:aspect-[3/2] touch-pan-y"
              onTouchStart={swipe.onTouchStart}
              onTouchMove={swipe.onTouchMove}
              onTouchEnd={swipe.onTouchEnd}
            >
              {showPlaceholder ? (
                <Image
                  src={PLACEHOLDER}
                  alt={alt}
                  fill
                  className="object-contain p-8"
                  priority
                />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={`${photoIdx}-${retryCount[photoIdx] || 0}`}
                  src={failed.has(photoIdx) ? PLACEHOLDER : currentImage.url}
                  alt={currentImage.caption || alt}
                  loading="eager"
                  decoding="sync"
                  fetchPriority="high"
                  onError={() => handleImageError(photoIdx)}
                  onClick={() => setFullscreen(true)}
                  className="absolute inset-0 w-full h-full object-cover cursor-zoom-in"
                />
              )}

              {/* Single small badge — top left */}
              {badges}

              {/* Photo counter — small pill, top right */}
              {sortedImages.length > 1 && (
                <span className="absolute top-3 right-3 bg-black/50 backdrop-blur-sm text-white text-[11px] px-2 py-1 rounded-lg z-10">
                  {photoIdx + 1}/{sortedImages.length}
                </span>
              )}

              {/* Navigation arrows — small on mobile, larger on desktop */}
              {sortedImages.length > 1 && (
                <>
                  <button
                    onClick={prevPhoto}
                    className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 w-8 h-8 md:w-10 md:h-10 rounded-full bg-black/40 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/60 transition z-20"
                    aria-label="Previous photo"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <button
                    onClick={nextPhoto}
                    className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 w-8 h-8 md:w-10 md:h-10 rounded-full bg-black/40 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/60 transition z-20"
                    aria-label="Next photo"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                </>
              )}

              {/* Dot indicators on mobile only */}
              {sortedImages.length > 1 && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 z-10 md:hidden">
                  {sortedImages.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setPhotoIdx(i)}
                      className={`rounded-full transition-all ${i === photoIdx ? 'bg-white w-4 h-1.5' : 'bg-white/50 w-1.5 h-1.5'}`}
                      aria-label={`Photo ${i + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Thumbnail strip — desktop only */}
            {sortedImages.length > 1 && (
              <div className="hidden md:flex gap-1.5 px-4 py-3 overflow-x-auto bg-white/80 backdrop-blur-sm">
                {sortedImages.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setPhotoIdx(i)}
                    className={`relative flex-shrink-0 w-[88px] h-[60px] rounded-lg overflow-hidden transition-all ${
                      i === photoIdx
                        ? 'ring-2 ring-brand-gold opacity-100'
                        : 'opacity-60 hover:opacity-90'
                    }`}
                    aria-label={img.caption || `Photo ${i + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      key={`thumb-${i}-${retryCount[i] || 0}`}
                      src={failed.has(i) ? PLACEHOLDER : (img.thumbUrl || img.url)}
                      alt={img.caption || `Photo ${i + 1}`}
                      className="absolute inset-0 w-full h-full object-cover"
                      loading="lazy"
                      onError={() => handleImageError(i)}
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Caption below photo on mobile, not overlaid */}
            {currentImage?.caption && (
              <div className="md:hidden px-4 py-2 bg-white/80 text-brand-dark/85 text-[12px] font-light">
                {currentImage.caption}
              </div>
            )}
          </div>
        )}

        {/* Floor plan */}
        {activeTab === 'floorplan' && floorPlanUrl && (
          <div className="relative aspect-[4/3] md:aspect-[3/2] lg:aspect-[16/9] bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={floorPlanUrl}
              alt="Floor Plan"
              className="absolute inset-0 w-full h-full object-contain p-4"
              loading="eager"
            />
          </div>
        )}

        {/* Video — iframe for embeds (YouTube/Vimeo), <video> for direct files */}
        {activeTab === 'video' && videoUrl && (
          <div className="relative aspect-[4/3] md:aspect-[16/9] bg-black">
            {/youtube\.com|youtu\.be|vimeo\.com|wistia\.com/.test(videoUrl) ? (
              <iframe
                src={videoUrl}
                className="absolute inset-0 w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title="Video Tour"
              />
            ) : (
              <video
                src={videoUrl}
                className="absolute inset-0 w-full h-full object-contain"
                controls
                playsInline
                preload="metadata"
                title="Video Tour"
              />
            )}
          </div>
        )}

        {/* 3D Tour */}
        {activeTab === '3d' && virtualTourUrl && (
          <div className="relative aspect-[4/3] md:aspect-[16/9] bg-black">
            <iframe
              src={virtualTourUrl}
              className="absolute inset-0 w-full h-full"
              allow="fullscreen; xr-spatial-tracking"
              allowFullScreen
              title="3D Virtual Tour"
            />
          </div>
        )}
      </div>

      {/* Fullscreen Lightbox */}
      {fullscreen && !showPlaceholder && (
        <div
          className="fixed inset-0 z-50 bg-black flex items-center justify-center"
          onClick={() => setFullscreen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`Photo ${photoIdx + 1} of ${sortedImages.length}`}
        >
          {/* Close button */}
          <button
            onClick={() => setFullscreen(false)}
            className="absolute top-4 right-4 z-50 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm text-white flex items-center justify-center hover:bg-white/20 transition"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Counter */}
          <span className="absolute top-4 left-4 text-white/70 text-sm z-50">
            {photoIdx + 1} / {sortedImages.length}
          </span>

          {/* Photo — full resolution, no cropping */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentImage.url}
            alt={currentImage.caption || alt}
            className="max-w-[95vw] max-h-[92vh] object-contain select-none"
            decoding="sync"
            fetchPriority="high"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Nav arrows */}
          {sortedImages.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); prevPhoto(); }}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm text-white flex items-center justify-center hover:bg-white/20 transition z-50"
                aria-label="Previous"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); nextPhoto(); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm text-white flex items-center justify-center hover:bg-white/20 transition z-50"
                aria-label="Next"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
