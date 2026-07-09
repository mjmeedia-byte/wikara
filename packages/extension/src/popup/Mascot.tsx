// Wikara's book mascot, drawn as SVG so it stays crisp at any size.
export function Mascot({ size = 96 }: { size?: number }) {
  return (
    <svg
      className="wk-mascot-svg"
      width={size}
      height={(size * 156) / 140}
      viewBox="0 0 140 156"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Wikara mascot"
    >
      {/* shadow */}
      <ellipse cx="70" cy="147" rx="34" ry="5.5" fill="#000000" opacity="0.08" />

      {/* legs */}
      <rect x="55" y="118" width="11" height="23" rx="5.5" fill="#EBA96B" stroke="#3E2E20" strokeWidth="3.5" strokeLinejoin="round" />
      <rect x="74" y="118" width="11" height="23" rx="5.5" fill="#EBA96B" stroke="#3E2E20" strokeWidth="3.5" strokeLinejoin="round" />

      {/* arms */}
      <rect x="17" y="80" width="24" height="11" rx="5.5" transform="rotate(20 29 85)" fill="#EBA96B" stroke="#3E2E20" strokeWidth="3.5" />
      <rect x="99" y="80" width="24" height="11" rx="5.5" transform="rotate(-20 111 85)" fill="#EBA96B" stroke="#3E2E20" strokeWidth="3.5" />

      {/* pages peeking above the cover */}
      <rect x="45" y="13" width="50" height="16" rx="4" fill="#FFFFFF" stroke="#3E2E20" strokeWidth="2.5" />
      <line x1="50" y1="19" x2="90" y2="19" stroke="#E4DCCB" strokeWidth="1.6" />
      <line x1="50" y1="23" x2="90" y2="23" stroke="#E4DCCB" strokeWidth="1.6" />

      {/* book cover */}
      <rect x="32" y="23" width="76" height="103" rx="9" fill="#EBA96B" stroke="#3E2E20" strokeWidth="3.5" strokeLinejoin="round" />

      {/* spine crease */}
      <path d="M47 26 V123" stroke="#3E2E20" strokeWidth="2.5" opacity="0.45" strokeLinecap="round" />

      {/* cheeks */}
      <ellipse cx="60" cy="83" rx="7" ry="4.5" fill="#EE9E92" opacity="0.55" />
      <ellipse cx="90" cy="83" rx="7" ry="4.5" fill="#EE9E92" opacity="0.55" />

      {/* eyes */}
      <circle cx="65" cy="74" r="6.5" fill="#2E2318" />
      <circle cx="87" cy="74" r="6.5" fill="#2E2318" />
      <circle cx="67" cy="72" r="2" fill="#FFFFFF" />
      <circle cx="89" cy="72" r="2" fill="#FFFFFF" />

      {/* smile */}
      <path d="M69 86 Q76 92 83 86" stroke="#2E2318" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}
