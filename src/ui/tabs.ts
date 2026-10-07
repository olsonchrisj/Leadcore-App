export type TabId = "plan" | "chart" | "readings" | "lures" | "settings";

export const TABS: { id: TabId; label: string }[] = [
  { id: "plan", label: "Plan" },
  { id: "chart", label: "Chart" },
  { id: "readings", label: "Readings" },
  { id: "lures", label: "Lures" },
  { id: "settings", label: "Settings" },
];
