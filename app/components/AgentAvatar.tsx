'use client';

import Image from 'next/image';
import { useState } from 'react';
import { headshotVariant, avatarInitials } from '@/lib/agents/avatar';

interface AgentAvatarProps {
  photo?: string | null;
  name: string;
  /** Tailwind size classes for the circular frame (default 56px). */
  sizeClass?: string;
}

/**
 * Circular agent avatar with graceful fallbacks: square headshot variant →
 * full photo → initials. Client component so a missing headshot file degrades
 * via onError instead of rendering a broken image. Generic — no hardcoded agent.
 */
export default function AgentAvatar({ photo, name, sizeClass = 'w-14 h-14' }: AgentAvatarProps) {
  const headshot = headshotVariant(photo);
  const [src, setSrc] = useState<string>(headshot || photo || '');
  const [failed, setFailed] = useState<boolean>(!photo);

  if (failed || !src) {
    return (
      <div
        className={`${sizeClass} rounded-full flex items-center justify-center flex-shrink-0 bg-brand-gold/10 text-brand-gold-deep font-display font-semibold text-lg`}
        aria-hidden="true"
      >
        {avatarInitials(name)}
      </div>
    );
  }

  return (
    <div className={`relative ${sizeClass} rounded-full overflow-hidden flex-shrink-0 ring-1 ring-black/5`}>
      <Image
        src={src}
        alt={name}
        fill
        sizes="56px"
        className="object-cover"
        onError={() => {
          // headshot missing → try the full photo → finally initials.
          if (src === headshot && photo && photo !== headshot) setSrc(photo);
          else setFailed(true);
        }}
      />
    </div>
  );
}
