import type { PackageDetail } from "@/types"

/** EPSS line + CVE scatter points for <EpssChart>, clipped to the EPSS date
 * range. Null when there isn't enough history to draw a line. */
export function buildEpssChartData(detail: PackageDetail) {
  if (!detail.epss_history || detail.epss_history.length < 2) return null
  const epssStart = detail.epss_history[0].date
  const epssEnd = detail.epss_history[detail.epss_history.length - 1].date
  const chartData = detail.epss_history.map((pt) => ({
    date: pt.date, epss: pt.epss,
    cvss: null as number | null, severity: null as string | null, cve_id: null as string | null,
  }))
  const scatterData = (detail.cve_history ?? [])
    .filter((c) => c.published_date && c.cvss_score != null)
    .map((c) => ({ date: c.published_date!.slice(0, 10), epss: 0, cvss: c.cvss_score, severity: c.severity, cve_id: c.cve_id }))
    .filter((c) => c.date >= epssStart && c.date <= epssEnd)
  return { chartData, scatterData }
}

export const nvdUrl = (cveId: string) => `https://nvd.nist.gov/vuln/detail/${cveId}`
