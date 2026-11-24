const ICONS = {
  football: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6.8l3.9 2.8-1.5 4.5h-4.8L8.1 9.6z" />
      <path d="M12 3v3.8M21 9.9l-4.1-.3M18.2 19.6l-2.9-5.5M5.8 19.6l2.9-5.5M3 9.9l4.1-.3" />
    </>
  ),
  cricket: (
    <>
      <path d="M14.6 3.9l5.5 5.5-9.2 9.2a2.1 2.1 0 0 1-3 0l-2.5-2.5a2.1 2.1 0 0 1 0-3z" />
      <path d="M8.6 12.6l2.8 2.8" />
      <circle cx="18.4" cy="18.6" r="2" />
    </>
  ),
  basketball: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18M3.6 8.4c5.6 1.4 11.2 1.4 16.8 0M3.6 15.6c5.6-1.4 11.2-1.4 16.8 0" />
    </>
  ),
  tennis: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.4 5.8c3.4 2.8 3.4 9.6 0 12.4M18.6 5.8c-3.4 2.8-3.4 9.6 0 12.4" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 6H4.5v1.5A3.5 3.5 0 0 0 8 11M16 6h3.5v1.5A3.5 3.5 0 0 1 16 11" />
      <path d="M12 13v3M8.5 20h7M10 20l.5-4h3l.5 4" />
    </>
  ),
  bolt: <path d="M13.4 2.5L4.8 13.4h5.5L10.6 21.5l8.6-10.9h-5.5z" />,
  bell: (
    <>
      <path d="M18 9.5a6 6 0 0 0-12 0c0 4.6-2 6.5-2 6.5h16s-2-1.9-2-6.5" />
      <path d="M10.2 20a2.2 2.2 0 0 0 3.6 0" />
    </>
  ),
  check: <path d="M4.5 12.5l4.6 4.6L19.5 6.7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.8" />
      <path d="M15.8 15.8L21 21" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11.2A8 8 0 1 0 17.7 18" />
      <path d="M20.2 4.5v6.9h-6.9" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.4V12l3.2 1.9" />
    </>
  ),
  signal: <path d="M4 19v-3M9.3 19v-6.5M14.6 19V8.5M20 19V4" />,
  'arrow-up-right': <path d="M7 17L17 7M8.6 7H17v8.4" />,
  card: (
    <>
      <rect x="7" y="3.5" width="10" height="17" rx="1.6" />
      <path d="M7 8h10" />
    </>
  ),
  swap: <path d="M4 8h13M14 4.5L17.5 8 14 11.5M20 16H7M10 12.5L6.5 16l3.5 3.5" />,
  var: (
    <>
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M9 21h6M12 17v4" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  'chevron-right': <path d="M9.5 5.5L16 12l-6.5 6.5" />,
  sparkle: (
    <>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />
    </>
  ),
  flag: (
    <>
      <path d="M6 21V4" />
      <path d="M6 5h11.5l-2 4 2 4H6" />
    </>
  ),
}

export function Icon({ name, size = 18, className = '', strokeWidth = 1.7 }) {
  const paths = ICONS[name] || ICONS.bolt

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}
    >
      {paths}
    </svg>
  )
}
