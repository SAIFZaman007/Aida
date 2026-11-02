/*
  Icons — one small inline-SVG set (24x24, 1.8 stroke, `currentColor`) so the whole
  interface shares one visual language and nothing is fetched at runtime.
*/
const base = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: "false",
};

const make = (children, extra = {}) =>
  function Icon({ size = 24, className = "", ...rest }) {
    return (
      <svg {...base} {...extra} width={size} height={size} className={className} {...rest}>
        {children}
      </svg>
    );
  };

export const ChatIcon = make(
  <>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.5-4.6A8 8 0 1 1 21 12Z" />
    <path d="M8.5 11h7M8.5 14h4" />
  </>,
);

/** History: a clock with a counter-clockwise arrow — deliberately NOT the chat bubble. */
export const HistoryIcon = make(
  <>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3.4 4.2v4.3h4.3" />
    <path d="M12 7.6V12l3 1.8" />
  </>,
);

export const MicIcon = make(
  <>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" />
  </>,
);

export const WaveIcon = make(<path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" />);
export const WaveOffIcon = make(
  <>
    <path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" />
    <path d="M3 3l18 18" />
  </>,
);

export const GearIcon = make(
  <>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 14.4a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </>,
);

export const ChevronLeftIcon = make(<path d="m15 5-7 7 7 7" />);
export const ChevronRightIcon = make(<path d="m9 5 7 7-7 7" />);
export const CloseIcon = make(<path d="M5 5l14 14M19 5 5 19" />);
export const MinimizeIcon = make(<path d="M5 12h14" />);
export const MaximizeIcon = make(<rect x="5" y="5" width="14" height="14" rx="1.5" />);
export const RestoreIcon = make(
  <>
    <rect x="4.5" y="8.5" width="11" height="11" rx="1.5" />
    <path d="M8.5 8.5v-3a1.5 1.5 0 0 1 1.5-1.5h8a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-3" />
  </>,
);
export const CheckIcon = make(<path d="m5 12.5 4.5 4.5L19 7.5" />, { strokeWidth: 2.4 });
export const PlusIcon = make(<path d="M12 5v14M5 12h14" />);
export const EditIcon = make(<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4" />);
export const StopIcon = make(<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />);
export const SparkleIcon = make(
  <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" />,
);
export const FolderIcon = make(<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />);
export const ArrowRightIcon = make(<path d="M5 12h14M13 6l6 6-6 6" />);
export const ExternalIcon = make(<path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />);

/* ── One icon per mode (cards, landing) ───────────────────────────────────── */
export const InfinityIcon = make(
  <path d="M12 12c-1.6-2.4-3-4-5-4a4 4 0 0 0 0 8c2 0 3.4-1.6 5-4Zm0 0c1.6 2.4 3 4 5 4a4 4 0 0 0 0-8c-2 0-3.4 1.6-5 4Z" />,
);
export const BarsIcon = make(<path d="M5 20V12M10 20V6M15 20V10M20 20V4" />);
export const CodeIcon = make(<path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 5l-4 14" />);
export const LayersIcon = make(
  <>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12.5 9 5 9-5M3 16.5l9 5 9-5" />
  </>,
);
export const ShieldIcon = make(
  <>
    <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8 7.5 9.5 4.4-1.5 7.5-4.9 7.5-9.5V6L12 3Z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </>,
);
export const SearchIcon = make(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </>,
);
export const PenIcon = make(<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1ZM14 7l3 3" />);

export const MODE_ICON = {
  nonstop: InfinityIcon,
  executive: BarsIcon,
  coder: CodeIcon,
  architect: LayersIcon,
  security: ShieldIcon,
  researcher: SearchIcon,
  writer: PenIcon,
};

/* ── Landing page extras ──────────────────────────────────────────────────── */
export const GlobeIcon = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3Z" />
  </>,
);
export const MonitorIcon = make(
  <>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </>,
);
export const FilmIcon = make(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M8 4v16M16 4v16M3 9h5M3 15h5M16 9h5M16 15h5" />
  </>,
);
export const DatabaseIcon = make(
  <>
    <ellipse cx="12" cy="6" rx="7.5" ry="3" />
    <path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6" />
  </>,
);
export const HandIcon = make(
  <path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11V6a1.5 1.5 0 0 1 3 0v8.5a6.5 6.5 0 0 1-6.5 6.5h-.8A5 5 0 0 1 6 18.3L3.6 14a1.5 1.5 0 0 1 2.6-1.5L8 15" />,
);
export const LockIcon = make(
  <>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </>,
);
export const ZapIcon = make(<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" />);
export const BoltIcon = ZapIcon;
export const UsersIcon = make(
  <>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20a6 6 0 0 1 12 0M16.5 5.2a3.2 3.2 0 0 1 0 5.6M18 14.2A6 6 0 0 1 21.5 20" />
  </>,
);
