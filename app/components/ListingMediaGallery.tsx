'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { MediaImage } from '@/lib/types/listing';

const PLACEHOLDER = '/images/listing-placeholder.svg';

type MediaTab = 'photos' | 'floorplan' | 'tour3d' | 'video';

interface ListingMediaGalleryProps {
  images: MediaImage[];
  floorPlanUrl: string | null;
  virtualTourUrl: string | null;
  videoUrl: string | null;
  alt: string;
  children?: React.ReactNode;
}

function CameraIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
    </svg>
  );
}

function FloorPlanIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
    </svg>
  );
}

function Tour3DIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  );
}

export default function ListingMediaGallery({
  images,
  floorPlanUrl,
  virtualTourUrl,
  videoUrl,
  alt,
  children,
}: ListingMediaGalleryProps) {
  const [activeTab, setActiveTab] = useState<MediaTab>('photos');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imgFailed, setImgFailed] = useState<Set<number>>(new Set());

  const hasPhotos = images.length > 0;
  const hasFloorPlan = !!floorPlanUrl;
  const hasTour3D = !!virtualTourUrl;
  const hasVideo = !!videoUrl;

  const tabs: { id: MediaTab; label: string; icon: React.ReactNode; available: boolean }[] = [
    { id: 'photos', label: 'Photos', icon: <CameraIcon />, available: hasPhotos },
    { id: 'floorplan', label: 'Floor Plan', icon: <FloorPlanIcon />, available: hasFloorPlan },
    { id: 'tour3d', label: '3D Tour', icon: <Tour3DIcon />, available: hasTour3D },
    { id: 'video', label: 'Video', icon: <VideoIcon />, available: hasVideo },
  ];

  const sortedImages = [...images].sort((a, b) => a.order - b.order);
  const currentImage = sortedImages[currentIndex];

  const goNext = () => {
    if (currentIndex < sortedImages.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const showPlaceholder = !hasPhotos || imgFailed.has(currentIndex);

  return (
    <section className="bg-gray-100">
      <div className="max-w-7xl mx-auto">
        {/* Tab bar */}
        <div className="flex items-center gap-1 px-4 pt-2 pb-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                if (tab.available) setActiveTab(tab.id);
              }}
              disabled={!tab.available}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : tab.available
                  ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/60'
                  : 'text-gray-300 cursor-not-allowed'
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
              {tab.id === 'photos' && hasPhotos && (
                <span className="text-[10px] text-gray-400 ml-0.5">{images.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Content area */}
        <div className="relative bg-white">
          {/* Photos tab */}
          {activeTab === 'photos' && (
            <div className="relative aspect-[16/9] md:aspect-[21/9]">
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
                  src={currentImage.url}
                  alt={currentImage.caption || alt}
                  loading={currentIndex === 0 ? 'eager' : 'lazy'}
                  decoding={currentIndex === 0 ? 'sync' : 'async'}
                  onError={() => setImgFailed((prev) => new Set(prev).add(currentIndex))}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}

              {/* Nav arrows */}
              {sortedImages.length > 1 && !showPlaceholder && (
                <>
                  {currentIndex > 0 && (
                    <button
                      onClick={goPrev}
                      className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-sm text-gray-800 hover:bg-white shadow-md transition-colors"
                      aria-label="Previous photo"
                    >
                      <ChevronLeftIcon />
                    </button>
                  )}
                  {currentIndex < sortedImages.length - 1 && (
                    <button
                      onClick={goNext}
                      className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-sm text-gray-800 hover:bg-white shadow-md transition-colors"
                      aria-label="Next photo"
                    >
                      <ChevronRightIcon />
                    </button>
                  )}
                </>
              )}

              {/* Counter + caption */}
              {sortedImages.length > 1 && !showPlaceholder && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3">
                  <span className="bg-black/50 backdrop-blur-sm text-white text-xs font-medium px-3 py-1.5 rounded-full">
                    {currentIndex + 1} / {sortedImages.length}
                  </span>
                  {currentImage.caption && (
                    <span className="bg-black/50 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full max-w-[200px] truncate">
                      {currentImage.caption}
                    </span>
                  )}
                </div>
              )}

              {/* Badges (Exclusive, Price Reduced, etc.) */}
              {children}
            </div>
          )}

          {/* Thumbnails strip */}
          {activeTab === 'photos' && sortedImages.length > 1 && (
            <div className="flex gap-1.5 px-4 py-3 overflow-x-auto">
              {sortedImages.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`relative flex-shrink-0 w-16 h-12 rounded overflow-hidden transition-all ${
                    idx === currentIndex
                      ? 'ring-2 ring-[#C4A052] opacity-100'
                      : 'opacity-60 hover:opacity-100'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url.replace('w=1200', 'w=100')}
                    alt={img.caption || `Photo ${idx + 1}`}
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          )}

          {/* Floor plan tab */}
          {activeTab === 'floorplan' && floorPlanUrl && (
            <div className="relative aspect-[16/9] md:aspect-[21/9] flex items-center justify-center bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={floorPlanUrl}
                alt={`Floor plan - ${alt}`}
                className="max-w-full max-h-full object-contain p-4"
              />
            </div>
          )}

          {/* 3D Tour tab */}
          {activeTab === 'tour3d' && virtualTourUrl && (
            <div className="relative aspect-[16/9] md:aspect-[21/9]">
              <iframe
                src={virtualTourUrl}
                title={`3D Walkthrough - ${alt}`}
                className="absolute inset-0 w-full h-full"
                allow="xr-spatial-tracking"
                allowFullScreen
              />
            </div>
          )}

          {/* Video tab */}
          {activeTab === 'video' && videoUrl && (
            <div className="relative aspect-[16/9] md:aspect-[21/9]">
              {videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be') || videoUrl.includes('vimeo.com') ? (
                <iframe
                  src={videoUrl}
                  title={`Video tour - ${alt}`}
                  className="absolute inset-0 w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <video
                  src={videoUrl}
                  controls
                  className="absolute inset-0 w-full h-full object-cover"
                >
                  <track kind="captions" />
                </video>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
