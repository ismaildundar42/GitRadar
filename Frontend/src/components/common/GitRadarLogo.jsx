import React from 'react';

/**
 * GitRadar Enterprise Vector Logo (Dual-Theme & Modern Security Radar)
 */
export default function GitRadarLogo({ className = 'h-7 w-auto' }) {
  return (
    <svg
      viewBox="0 0 140 40"
      className={`${className} select-none`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="GitRadar"
    >
      <circle cx="20" cy="20" r="16" stroke="#2563eb" strokeWidth="2.5" strokeDasharray="3 3" opacity="0.6" />
      <circle cx="20" cy="20" r="10" stroke="#3b82f6" strokeWidth="2" opacity="0.8" />
      <circle cx="20" cy="20" r="4" fill="#60a5fa" />
      <path d="M20 20 L32 8" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
      <text
        x="45"
        y="26"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="800"
        fontSize="19"
        letterSpacing="0.5"
        className="fill-slate-900 dark:fill-white transition-colors"
      >
        GitRadar
      </text>
    </svg>
  );
}
