import React, { useState, useEffect, useCallback, useRef } from "react";
import { createColumnHelper, type OnChangeFn, type SortingState } from "@tanstack/react-table";
import { useQueryStates } from "nuqs";

import type { Package, PackageListResponse } from "@/types";
import { Search } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { PackageExpandedRow } from "@/components/PackageExpandedRow";
import { DataTable } from "@/components/DataTable";
import { FilterClear, FilterSelect, FilterToggle } from "@/components/FilterBar";
import {
  CVE_WINDOW_OPTIONS, DOWNLOADS_MIN_OPTIONS, EPSS_MIN_OPTIONS, SEVERITY_OPTIONS,
  packageFilterParsers, type PackageSort,
} from "@/lib/filters";
import { useApi } from "@/lib/api";
import { EcoBadge, MalBadge, SeverityLabel } from "@/components/ui/Badges";
const PAGE_SIZE = 50;

const col = createColumnHelper<Package>();

function ColHeader({
  label,
  tip,
  source,
  sourceLabel,
}: {
  label: string;
  tip: string;
  source?: string;
  sourceLabel?: string;
}) {
  return (
    <Tooltip
      content={
        <div className="space-y-1.5">
          <p className="text-xs text-ink-1 leading-snug">{tip}</p>
          {source && (
            <a
              href={source}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline pointer-events-auto"
            >
              ↗ {sourceLabel ?? "Source"}
            </a>
          )}
        </div>
      }
    >
      <span className="border-b border-dashed border-line-3 cursor-help">
        {label}
      </span>
    </Tooltip>
  );
}

const makeColumns = (singleEco: boolean) => [
  col.accessor("name", {
    header: () => (
      <ColHeader
        label="Package"
        tip="Package name and registry. Covers the top 500 most-downloaded PyPI and npm packages tracked by Polydelve."
        source="https://hugovk.github.io/top-pypi-packages/"
        sourceLabel="hugovk/top-pypi-packages · anvaka/npmrank"
      />
    ),
    enableSorting: false,
    cell: (info) => {
      const eco = info.row.original.ecosystem;
      return (
        <div className="flex items-center gap-2 min-w-0">
          {!singleEco && <EcoBadge ecosystem={eco} />}
          <span className="truncate font-mono text-sm text-ink-1">
            {info.getValue()}
          </span>
        </div>
      );
    },
  }),
  col.accessor("weekly_downloads", {
    meta: { mobileHidden: true },
    header: () => (
      <ColHeader
        label="Weekly DL"
        tip="Average weekly downloads over the last 7 days. PyPI data from pypistats.org; npm data from the npm downloads API."
        source="https://pypistats.org"
        sourceLabel="pypistats.org · npmjs.com/downloads"
      />
    ),
    cell: (info) => {
      const v = info.getValue();
      if (!v) return <span className="text-ink-4"> </span>;
      return (
        <span className="text-ink-2 tabular-nums">
          {(v / 1_000_000).toFixed(1)}M
        </span>
      );
    },
  }),
  col.accessor("epss_score", {
    header: () => (
      <ColHeader
        label="EPSS"
        tip="Exploit Prediction Scoring System. probability (0–100%) that this package's worst CVE will be exploited in the wild within 30 days. Published daily by FIRST.org. Higher = more dangerous."
        source="https://www.first.org/epss/"
        sourceLabel="first.org/epss. thank you FIRST!"
      />
    ),
    cell: (info) => {
      const v = info.getValue();
      if (v === null || v === undefined)
        return <span className="text-ink-4"> </span>;
      const pct = Math.round(v * 100);
      const color =
        pct >= 70 ? "bg-red-500" : pct >= 30 ? "bg-orange-400" : "bg-surface-3";
      return (
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 rounded-full bg-surface-3">
            <div
              className={`h-1.5 rounded-full ${color}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="tabular-nums text-xs text-ink-2">{pct}%</span>
        </div>
      );
    },
  }),
  col.accessor("num_cves", {
    header: () => (
      <ColHeader
        label="CVEs"
        tip="Total number of known CVEs affecting this package, sourced from the OSV vulnerability database. Includes historical and active vulnerabilities."
        source="https://osv.dev"
        sourceLabel="osv.dev. thank you Google!"
      />
    ),
    cell: (info) => {
      const v = info.getValue();
      const maxCvss = info.row.original.max_cvss_score;
      if (!v) return <span className="text-ink-4">0</span>;
      const badge = (
        <span className="rounded bg-surface-3 px-2 py-0.5 text-xs font-medium text-ink-1 cursor-default">
          {v}
        </span>
      );
      if (maxCvss == null) return badge;
      return (
        <Tooltip content={`Max CVSS: ${maxCvss.toFixed(1)}`}>{badge}</Tooltip>
      );
    },
  }),
  col.accessor("worst_severity", {
    meta: { mobileHidden: true },
    header: () => (
      <ColHeader
        label="Severity"
        tip="Highest CVSS severity rating across all CVEs for this package. Based on CVSS v3/v4 vectors from OSV. Critical > High > Medium > Low."
        source="https://www.first.org/cvss/"
        sourceLabel="first.org/cvss"
      />
    ),
    enableSorting: false,
    cell: (info) => {
      const v = info.getValue();
      if (!v) return <span className="text-ink-4"> </span>;
      return (
        <SeverityLabel severity={v} />
      );
    },
  }),
  col.accessor("risk_score", {
    meta: { mobileHidden: true },
    header: () => (
      <ColHeader
        label="Risk Score"
        tip="Composite risk signal: weekly downloads × max EPSS score. Captures both blast radius (how widely used) and exploit likelihood. Not a standardised metric. use as a relative ranking."
      />
    ),
    cell: (info) => {
      const v = info.getValue();
      if (!v) return <span className="text-ink-4"> </span>;
      return (
        <span className="tabular-nums text-sm text-ink-1">
          {(v / 1_000_000).toFixed(1)}M
        </span>
      );
    },
  }),
  col.accessor("has_mal_advisory", {
    meta: { mobileHidden: true },
    header: () => (
      <ColHeader
        label="MAL"
        tip="Has an OSV MAL-* advisory. confirmed or suspected supply chain compromise (malicious code injected into the package)."
        source="https://osv.dev"
        sourceLabel="osv.dev"
      />
    ),
    enableSorting: false,
    cell: (info) =>
      info.getValue() ? (
        <MalBadge />
      ) : null,
  }),
  // latest_cve_date injected inside component (need state closure)
];

interface Props {
  ecosystem?: "PyPI" | "npm";
}

export function PackagesTable({ ecosystem }: Props) {
  const { authFetch } = useApi();
  const [data, setData] = useState<Package[]>([]);
  const [total, setTotal] = useState(0);
  // Filters, sort and page live in the URL (shareable, back-button safe).
  const [f, setF] = useQueryStates(packageFilterParsers, { history: "push" });
  // nuqs setter input: any key may be null (= clear back to default)
  type FilterPatch = Exclude<Parameters<typeof setF>[0], (...args: never[]) => unknown>
  const { q: search, cve: latestCveDays, sev, epss, mal, dl, sort, page } = f;
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [loading, setLoading] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const autoExpanded = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Any filter change lands on page 1.
  const setFilter = useCallback(
    (patch: FilterPatch) => setF({ ...patch, page: 1 }),
    [setF],
  );
  const setPage = useCallback((p: number) => setF({ page: p }), [setF]);
  const setSearch = useCallback((v: string) => setF({ q: v || null, page: 1 }, { history: "replace" }), [setF]);

  const sorting: SortingState = [{ id: sort, desc: true }];
  const setSorting: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    const id = (next[0]?.id ?? "risk_score") as PackageSort;
    setFilter({ sort: id === "risk_score" ? null : id });
  };
  const activeFilterCount = [latestCveDays, sev, epss, mal, dl].filter((v) => v != null).length;

  function toggleRow(name: string, ecosystem: string) {
    const key = `${ecosystem}::${name}`;
    setExpandedKey((prev) => (prev === key ? null : key));
  }

  const latestCveDateCol = col.accessor("latest_cve_date", {
    id: "latest_cve_date",
    meta: { mobileHidden: true },
    header: () => (
      <div>
        <Tooltip
          content={
            <div className="space-y-1.5">
              <p className="text-xs text-ink-1 leading-snug">
                Publication date of the most recently disclosed CVE for this
                package. Sourced from OSV.
              </p>
              <a
                href="https://osv.dev"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline pointer-events-auto"
              >
                ↗ osv.dev
              </a>
            </div>
          }
        >
          <span className="border-b border-dashed border-line-3 cursor-help">
            Latest CVE
          </span>
        </Tooltip>
      </div>
    ),
    enableSorting: false,
    cell: (info) => {
      const v = info.getValue();
      if (!v) return <span className="text-ink-4"> </span>;
      return <span className="text-xs text-ink-2">{v}</span>;
    },
  });

  // Filters live in the column headers they apply to.
  const headerFilters: Record<string, React.ReactNode> = {
    weekly_downloads: <FilterSelect compact label="Downloads" value={dl} options={DOWNLOADS_MIN_OPTIONS} onChange={(v) => setFilter({ dl: v })} />,
    epss_score: (
      <FilterSelect
        compact
        label="EPSS"
        value={epss != null ? Number(epss) : null}
        options={EPSS_MIN_OPTIONS}
        onChange={(v) => setFilter({ epss: v == null ? null : String(v) })}
      />
    ),
    worst_severity: <FilterSelect compact label="Severity" value={sev} options={SEVERITY_OPTIONS} onChange={(v) => setFilter({ sev: v })} />,
    has_mal_advisory: <FilterToggle compact label="Only MAL-flagged" value={mal} onChange={(v) => setFilter({ mal: v })} />,
    latest_cve_date: <FilterSelect compact label="Latest CVE" value={latestCveDays} options={CVE_WINDOW_OPTIONS} onChange={(v) => setFilter({ cve: v })} />,
  };
  const allColumns = [...makeColumns(!!ecosystem), latestCveDateCol].map((c) =>
    c.id && headerFilters[c.id] ? { ...c, meta: { ...c.meta, filter: headerFilters[c.id] } } : c,
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(PAGE_SIZE),
      sort,
    });
    if (ecosystem) params.set("ecosystem", ecosystem);
    if (latestCveDays != null) params.set("latest_cve_days", String(latestCveDays));
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (sev) params.set("severity", sev);
    if (epss) params.set("min_epss", epss);
    if (mal) params.set("mal", "true");
    if (dl != null) params.set("min_downloads", String(dl));

    try {
      const res = await authFetch(`/packages?${params}`);
      if (!res.ok) {
        setData([]);
        setTotal(0);
        return;
      }
      const json: PackageListResponse = await res.json();
      const packages = json.packages ?? [];
      setData(packages);
      setTotal(json.total ?? 0);
      // First look at the table: open the top row so the expanded view is discoverable.
      if (!autoExpanded.current && packages.length > 0) {
        autoExpanded.current = true;
        setExpandedKey(`${packages[0].ecosystem}::${packages[0].name}`);
      }
    } catch (e) {
      console.error("Failed to fetch packages", e);
    } finally {
      setLoading(false);
    }
  }, [page, sort, ecosystem, latestCveDays, debouncedSearch, sev, epss, mal, dl, authFetch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    autoExpanded.current = false;
  }, [ecosystem]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const pagination = (
    <div className="flex items-center justify-between text-xs text-ink-3">
      <span>{total.toLocaleString()} packages</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page === 1}
          className="rounded border border-line-2 px-2.5 py-1 hover:border-line-3 hover:text-ink-2 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ←
        </button>
        <span>
          {page} / {totalPages}
        </span>
        <button
          onClick={() => setPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="rounded border border-line-2 px-2.5 py-1 hover:border-line-3 hover:text-ink-2 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          →
        </button>
      </div>
    </div>
  );

  const filterChips = (
    <div className="flex items-center gap-1.5 flex-wrap py-1.5 sm:hidden">
      <FilterSelect label="Latest CVE" value={latestCveDays} options={CVE_WINDOW_OPTIONS} onChange={(v) => setFilter({ cve: v })} />
      <FilterSelect label="Severity" value={sev} options={SEVERITY_OPTIONS} onChange={(v) => setFilter({ sev: v })} />
      <FilterSelect label="EPSS" value={epss != null ? Number(epss) : null} options={EPSS_MIN_OPTIONS} onChange={(v) => setFilter({ epss: v == null ? null : String(v) })} />
      <FilterSelect label="Downloads" value={dl} options={DOWNLOADS_MIN_OPTIONS} onChange={(v) => setFilter({ dl: v })} />
      <FilterToggle label="MAL flagged" value={mal} onChange={(v) => setFilter({ mal: v })} />
    </div>
  );

  const searchBar = (
    <div className="relative flex-1 min-w-0">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-3 pointer-events-none" />
      <input
        ref={searchRef}
        type="text"
        placeholder="Search packages…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-transparent pl-8 pr-8 py-2.5 text-sm text-ink-1 placeholder-ink-4 outline-none"
      />
      {search && (
        <button
          onClick={() => {
            setSearch("");
            searchRef.current?.focus();
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink-2"
          aria-label="Clear search"
        >
          ✕
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Mobile card list */}
      <div className="sm:hidden space-y-2">
        <div className="rounded border border-line-2 bg-surface-2/70 px-2">
          {searchBar}
          {filterChips}
        </div>
        {loading ? (
          <p className="py-12 text-center text-ink-3 text-sm">Loading…</p>
        ) : data.length === 0 ? (
          <p className="py-12 text-center text-ink-3 text-sm">
            No packages found
          </p>
        ) : (
          data.map((pkg, i) => {
            const key = `${pkg.ecosystem}::${pkg.name}`;
            const isExpanded = expandedKey === key;
            const epss = pkg.epss_score;
            const epssPct = epss != null ? Math.round(epss * 100) : null;
            const epssColor =
              epssPct != null
                ? epssPct >= 70
                  ? "bg-red-500"
                  : epssPct >= 30
                    ? "bg-orange-400"
                    : "bg-surface-3"
                : "bg-surface-3";
            return (
              <div
                key={key}
                data-tour={i === 0 ? "pkg-row-0" : undefined}
                className="rounded border border-line-1 bg-surface-2"
              >
                <button
                  className="w-full text-left px-4 py-3"
                  onClick={() => toggleRow(pkg.name, pkg.ecosystem)}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {!ecosystem && <EcoBadge ecosystem={pkg.ecosystem} />}
                      <span className="truncate font-mono text-sm text-ink-1">
                        {pkg.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {pkg.has_mal_advisory && (
                        <MalBadge />
                      )}
                      <span className="text-ink-4 text-xs">
                        {isExpanded ? "▲" : "▼"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    {epssPct != null && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-14 h-1.5 rounded-full bg-surface-3">
                          <div
                            className={`h-1.5 rounded-full ${epssColor}`}
                            style={{ width: `${epssPct}%` }}
                          />
                        </div>
                        <span className="tabular-nums text-ink-2">
                          {epssPct}%
                        </span>
                      </div>
                    )}
                    {pkg.num_cves > 0 && (
                      <span className="text-ink-2">
                        <span className="text-ink-1 font-medium">
                          {pkg.num_cves}
                        </span>{" "}
                        CVEs
                      </span>
                    )}
                    {pkg.worst_severity && (
                      <SeverityLabel severity={pkg.worst_severity} />
                    )}
                    {pkg.latest_cve_date && (
                      <span className="text-ink-3 ml-auto">
                        {pkg.latest_cve_date}
                      </span>
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div
                    data-tour={i === 0 ? "pkg-expanded" : undefined}
                    className="border-t border-line-1"
                  >
                    <table className="w-full">
                      <tbody>
                        <PackageExpandedRow
                          name={pkg.name}
                          ecosystem={pkg.ecosystem}
                          colSpan={1}
                        />
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}
        {data.length > 0 && pagination}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block">
        <DataTable
          columns={allColumns}
          data={data}
          loading={loading}
          emptyText="No packages found"
          sorting={sorting}
          onSortingChange={setSorting}
          toolbar={
            <>
              {searchBar}
              <FilterClear count={activeFilterCount} onClear={() => setFilter({ cve: null, sev: null, epss: null, mal: null, dl: null })} />
              <span className="shrink-0 text-xs text-ink-3 pr-1">
                {total.toLocaleString()} packages
              </span>
            </>
          }
          rowKey={(pkg) => `${pkg.ecosystem}::${pkg.name}`}
          expandedKey={expandedKey}
          onRowClick={(pkg) => toggleRow(pkg.name, pkg.ecosystem)}
          rowTourTag={(i) => (i === 0 ? "pkg-row-0" : undefined)}
          renderExpanded={(pkg, colSpan, i) => (
            <PackageExpandedRow
              key={`${pkg.ecosystem}::${pkg.name}::expanded`}
              name={pkg.name}
              ecosystem={pkg.ecosystem}
              colSpan={colSpan}
              tourTag={i === 0 ? "pkg-expanded" : undefined}
            />
          )}
          footer={pagination}
        />
      </div>
    </div>
  );
}
