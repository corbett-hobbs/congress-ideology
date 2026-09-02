"use client";

import { useState } from "react";
import {
  MEMBER_PHOTO_PLACEHOLDER,
  memberPhotoSrc,
  type MemberPhotoSize,
} from "@/lib/member-photo";

interface MemberPhotoProps {
  bioguideId: string;
  hasPhoto: boolean;
  size: MemberPhotoSize;
  className?: string;
  /** Usually "" — the member's name is always adjacent in the markup. */
  alt?: string;
}

/**
 * A member's official photo, falling back to the silhouette if the source file
 * is somehow missing at request time (e.g. a manifest that's a step stale).
 * Give it a fixed size in CSS so there's no layout shift.
 */
export function MemberPhoto({
  bioguideId,
  hasPhoto,
  size,
  className,
  alt = "",
}: MemberPhotoProps) {
  const [src, setSrc] = useState(() =>
    memberPhotoSrc(bioguideId, hasPhoto, size),
  );
  return (
    // A pre-sized static asset from public/ — next/image would add an optimizer
    // this fully-static site deliberately doesn't run.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => {
        if (src !== MEMBER_PHOTO_PLACEHOLDER) setSrc(MEMBER_PHOTO_PLACEHOLDER);
      }}
    />
  );
}
