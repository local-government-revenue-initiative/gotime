import React from 'react';

/**
 * The Go Time logo — the "Grid" mark plus the wordmark, reproduced exactly from
 * the brand handoff (assets/logo-mark.svg and the horizontal lockup).
 *
 * The mark is inlined rather than loaded from /brand/logo-mark.svg so it paints
 * with the first frame and can't flash; its geometry and colours are fixed and
 * must not be recoloured, reordered or animated. The wordmark is live text
 * (rather than the SVG's <text>) so it renders in the Mulish the app already
 * bundles: "Go" at weight 800, a space, "Time" light — see the .brand rules in
 * styles.css for the sizes.
 */
export function BrandMark({ className = 'mark', title }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : 'true'}
      focusable="false"
    >
      {title && <title>{title}</title>}
      <rect x="4" y="4" width="16" height="16" fill="#D1D4DE" />
      <rect x="24" y="4" width="16" height="16" fill="#D1D4DE" />
      <rect x="44" y="4" width="16" height="16" fill="#009E47" />
      <rect x="4" y="24" width="16" height="16" fill="#D1D4DE" />
      <rect x="24" y="24" width="16" height="16" fill="#FFC70A" />
      <rect x="44" y="24" width="16" height="16" fill="#D1D4DE" />
      <rect x="4" y="44" width="16" height="16" fill="#1A2E5A" />
      <rect x="24" y="44" width="16" height="16" fill="#D1D4DE" />
      <rect x="44" y="44" width="16" height="16" fill="#47BFAF" />
    </svg>
  );
}

/** Mark + wordmark, for the site header. */
export default function BrandLockup() {
  return (
    <>
      <BrandMark />
      <span className="wordmark">
        <span className="go">Go</span> <span className="time">Time</span>
      </span>
    </>
  );
}
