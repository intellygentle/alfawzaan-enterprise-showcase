"use client";

import { useEffect, useState } from "react";

/**
 * Moniepoint logo used on the checkout account-number cards.
 *
 * The official blue logo is auto-detected from /public/moniepoint-logo.png —
 * download the official logo into `public/` and every card will use it.
 * Until then (or if the file is missing) a clean inline placeholder renders
 * so the card still looks finished.
 */
export function MoniepointLogo({
  className = "h-5 w-auto",
}: {
  className?: string;
}) {
  const [imageOk, setImageOk] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setImageOk(true);
      setChecked(true);
    };
    img.onerror = () => setChecked(true);
    img.src = "/moniepoint-logo.png";
  }, []);

  if (checked && imageOk) {
    return (
      <img
        src="/moniepoint-logo.png"
        alt="Moniepoint"
        className={className}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 132 32"
      className={className}
      role="img"
      aria-label="Moniepoint"
    >
      <rect x="0" y="0" width="32" height="32" rx="9" fill="#1B46EC" />
      <path
        d="M8 23V9l8 8 8-8v14"
        fill="none"
        stroke="#fff"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text
        x="40"
        y="23"
        fontSize="19"
        fontWeight="800"
        fill="#1B46EC"
        fontFamily="'Arial Black', Arial, sans-serif"
      >
        Moniepoint
      </text>
    </svg>
  );
}
