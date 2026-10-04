export const SEV_COLOR: Record<string, string> = {
  critical: "#f87171",
  high: "#fb923c",
  medium: "#facc15",
  low: "#7b8996",
}

export const SEV_FALLBACK = SEV_COLOR.low

export const scoreColor = (s: number) =>
  s >= 9 ? SEV_COLOR.critical : s >= 7 ? SEV_COLOR.high : s >= 4 ? SEV_COLOR.medium : SEV_COLOR.low
