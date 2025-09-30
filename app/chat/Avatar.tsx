"use client";

import { useMemo } from "react";
import { createAvatar } from "@dicebear/core";
import { avataaars } from "@dicebear/collection";

interface AvatarProps {
  seed: string;
  size?: number;
  className?: string;
}

export default function Avatar({ seed, size = 32, className = "" }: AvatarProps) {
  const avatar = useMemo(() => {
    return createAvatar(avataaars, {
      seed,
      size,
    }).toDataUri();
  }, [seed, size]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatar}
      alt={`${seed} avatar`}
      className={`rounded-full ${className}`}
      style={{ width: size, height: size }}
    />
  );
}