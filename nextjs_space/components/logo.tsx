'use client';

import React from 'react';

interface LogoProps {
  className?: string;
  title?: string;
}

/**
 * Gahundiq brand mark — "Q.":
 * A custom-drawn capital Q whose tail sweeps toward a small rose-gold dot —
 * the signature ending of "Gahundiq." No background.
 *
 * The Q is drawn with pure vector paths (no <text>), so it renders
 * identically on every platform/font stack and is suitable for
 * trademark use as a fixed design mark.
 */
export function Logo({ className, title = 'Gahundiq' }: LogoProps) {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label={title} className={className}>
      {/* Q bowl — bold ring: outer ellipse with an evenodd inner counter */}
      <path
        fill="#4F46E5"
        fillRule="evenodd"
        d="M11.5 31.5a16.5 18.5 0 1 0 33 0a16.5 18.5 0 1 0 -33 0ZM19.25 31.5a8.75 10.75 0 1 0 17.5 0a8.75 10.75 0 1 0 -17.5 0Z"
      />

      {/* Tail — sweeps out of the lower-right of the bowl and reaches for the dot */}
      <path
        d="M33.5 41.5C37.5 45 41.5 47.5 46.5 48.5"
        stroke="#4F46E5"
        strokeWidth="5.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Small dot — the period of "Gahundiq." */}
      <circle cx="55.5" cy="48.75" r="4.5" fill="#E8A598" />
    </svg>
  );
}