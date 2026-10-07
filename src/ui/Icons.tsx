import type { ReactNode } from "react";

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export type IconName = "plan" | "chart" | "readings" | "lures" | "settings";

export function Icon({ name }: { name: IconName }) {
  switch (name) {
    case "plan":
      return (
        <Svg>
          <path d="M12 3v12" />
          <path d="M6.5 10.5 12 16l5.5-5.5" />
          <path d="M4 21h16" />
        </Svg>
      );
    case "chart":
      return (
        <Svg>
          <path d="M4 4v16h16" />
          <path d="m7.5 15 3.5-4 3 3 4.5-6" />
        </Svg>
      );
    case "readings":
      return (
        <Svg>
          <path d="M9 6h11M9 12h11M9 18h11" />
          <circle cx="4.5" cy="6" r="1" />
          <circle cx="4.5" cy="12" r="1" />
          <circle cx="4.5" cy="18" r="1" />
        </Svg>
      );
    case "lures":
      return (
        <Svg>
          <path d="M3 12c3-5 9-6 13-3l5-3v12l-5-3c-4 3-10 2-13-3z" />
          <circle cx="8" cy="11" r=".6" />
        </Svg>
      );
    case "settings":
      return (
        <Svg>
          <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
          <circle cx="15" cy="7" r="2" />
          <circle cx="9" cy="17" r="2" />
        </Svg>
      );
  }
}
