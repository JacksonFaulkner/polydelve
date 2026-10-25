#!/usr/bin/env python3
"""Render backtest metrics.json files as SVG charts for the docs site.

Reads backend/scripts/backtest/<slice>/metrics.json. A slice is drawn only
if its file has the keys each chart needs; otherwise it is skipped with a
note. Nothing is typed in here: every plotted value comes from the JSON.

Writes docs/public/backtest/<slice>-calibration.svg (reliability plot per
cell) and <slice>-skill.svg (Brier skill vs constant baseline by tier).

Palette and chrome follow the dataviz reference palette
(`references/palette.md`): blue = model better, red = model worse,
gray = reference line, text in ink tokens, 2px surface gap on marks.

Usage:
    python scripts/backtest/report/render_charts.py
"""

import json
import math
import pathlib
from xml.sax.saxutils import escape

ROOT = pathlib.Path(__file__).resolve().parents[4]
BACKTEST = ROOT / "backend" / "scripts" / "backtest"
OUT = ROOT / "docs" / "public" / "backtest"

CSS = """
svg { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
.surface { fill: #fcfcfb; }
.ink { fill: #0b0b0b; }
.ink2 { fill: #52514e; }
.muted { fill: #898781; }
.title { fill: #0b0b0b; font-size: 14px; font-weight: 600; }
.label { fill: #52514e; font-size: 12px; }
.tick { fill: #898781; font-size: 11px; }
.grid { stroke: #e1e0d9; stroke-width: 1; }
.axis { stroke: #c3c2b7; stroke-width: 1; }
.ref { stroke: #898781; stroke-width: 1; }
.series { fill: #2a78d6; stroke: #fcfcfb; stroke-width: 2; }
.baseline { fill: #eb6834; stroke: #fcfcfb; stroke-width: 2; }
.ci { stroke: #898781; stroke-width: 2; }
.better { fill: #2a78d6; }
.worse { fill: #e34948; }
@media (prefers-color-scheme: dark) {
  .surface { fill: #1a1a19; }
  .ink { fill: #f0efec; }
  .ink2 { fill: #c3c2b7; }
  .muted { fill: #898781; }
  .title { fill: #f0efec; }
  .label { fill: #c3c2b7; }
  .grid { stroke: #2c2c2a; }
  .axis { stroke: #383835; }
  .series { fill: #3987e5; stroke: #1a1a19; }
  .baseline { fill: #d95926; stroke: #1a1a19; }
  .ci { stroke: #898781; }
  .better { fill: #3987e5; }
  .worse { fill: #e66767; }
}
"""

CELL_LABEL = {
    "30d_cvss>=5": "30 days, CVSS ≥ 5",
    "30d_cvss>=7": "30 days, CVSS ≥ 7",
    "90d_cvss>=5": "90 days, CVSS ≥ 5",
    "90d_cvss>=7": "90 days, CVSS ≥ 7",
    "pooled": "All K-of-N baskets, pooled",
}
TIER_LABEL = {
    "top_100": "Top 100",
    "rank_101_1000": "Rank 101–1,000",
    "rank_1001_10000": "Rank 1,001–10,000",
}


def svg_open(width, height, label):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}" role="img" aria-label="{escape(label)}">'
        f"<style>{CSS}</style>"
        f'<rect class="surface" x="0" y="0" width="{width}" height="{height}"/>'
    )


def pct(v):
    """Fraction to a compact percent label: 0.0035 -> '0.35%'."""
    p = v * 100
    if p >= 10:
        return f"{p:.0f}%"
    if p >= 1:
        return f"{p:.1f}%"
    return f"{p:.2g}%"


# -- calibration (reliability) ------------------------------------------------

LOG_LO, LOG_HI = -3.0, 0.0  # 0.1% .. 100%


def log_pos(v, lo, hi, a, b):
    t = (math.log10(v) - lo) / (hi - lo)
    return a + t * (b - a)


def calibration_panel(cell_key, bins, events, ox, oy, pw, ph):
    """One reliability plot. Both axes are log-scaled so bins from 0.1% to 100% fit."""
    left, right, top, bottom = 52, 14, 40, 44
    x0, x1 = ox + left, ox + pw - right
    y0, y1 = oy + ph - bottom, oy + top  # y0 bottom, y1 top
    parts = []
    parts.append(
        f'<text class="title" x="{ox + left}" y="{oy + 22}">'
        f"{escape(CELL_LABEL.get(cell_key, str(cell_key)))}</text>"
    )
    parts.append(
        f'<text class="tick" x="{ox + pw - right}" y="{oy + 22}" text-anchor="end">'
        f"{events:,} events</text>"
    )
    ticks = [10**e for e in (-3, -2, -1, 0)]
    for t in ticks:
        gx = log_pos(t, LOG_LO, LOG_HI, x0, x1)
        gy = log_pos(t, LOG_LO, LOG_HI, y0, y1)
        parts.append(f'<line class="grid" x1="{gx:.1f}" y1="{y1}" x2="{gx:.1f}" y2="{y0}"/>')
        parts.append(f'<line class="grid" x1="{x0}" y1="{gy:.1f}" x2="{x1}" y2="{gy:.1f}"/>')
        parts.append(
            f'<text class="tick" x="{gx:.1f}" y="{y0 + 16}" text-anchor="middle">{pct(t)}</text>'
        )
        parts.append(
            f'<text class="tick" x="{x0 - 8}" y="{gy + 4:.1f}" text-anchor="end">{pct(t)}</text>'
        )
    parts.append(f'<line class="axis" x1="{x0}" y1="{y0}" x2="{x1}" y2="{y0}"/>')
    parts.append(f'<line class="axis" x1="{x0}" y1="{y1}" x2="{x0}" y2="{y0}"/>')
    parts.append(
        f'<text class="label" x="{(x0 + x1) / 2:.1f}" y="{oy + ph - 6}" text-anchor="middle">'
        "Predicted probability (bin mean)</text>"
    )
    parts.append(
        f'<text class="label" transform="translate({ox + 14},{(y0 + y1) / 2:.1f}) rotate(-90)" '
        'text-anchor="middle">Observed rate</text>'
    )
    # identity reference: where a perfectly calibrated model would sit
    parts.append(
        f'<line class="ref" x1="{x0}" y1="{y0}" x2="{x1}" y2="{y1}"/>'
        f'<text class="tick" x="{x1 - 6}" y="{y0 - 8}" text-anchor="end">perfect calibration</text>'
    )
    usable = [b for b in bins if b["predicted_mean"] > 0 and b["observed"] > 0]
    dropped = len(bins) - len(usable)
    for b in usable:
        cx = log_pos(b["predicted_mean"], LOG_LO, LOG_HI, x0, x1)
        cy = log_pos(b["observed"], LOG_LO, LOG_HI, y0, y1)
        tip = (
            f"predicted {pct(b['predicted_mean'])}, observed {pct(b['observed'])}, "
            f"n = {b['n']:,}"
        )
        parts.append(
            f'<circle class="series" cx="{cx:.1f}" cy="{cy:.1f}" r="5">'
            f"<title>{escape(tip)}</title></circle>"
        )
    if usable:
        # label only the bin with the most predictions, the one the table leads with
        big = max(usable, key=lambda b: b["n"])
        cx = log_pos(big["predicted_mean"], LOG_LO, LOG_HI, x0, x1)
        cy = log_pos(big["observed"], LOG_LO, LOG_HI, y0, y1)
        parts.append(
            f'<text class="label" x="{cx + 9:.1f}" y="{cy + 4:.1f}">'
            f"n = {big['n']:,}</text>"
        )
    if dropped:
        parts.append(
            f'<text class="tick" x="{x0}" y="{oy + 36}">'
            f"{dropped} bin(s) with zero observed events not shown (log scale)</text>"
        )
    return "".join(parts)


def cell_key(cell):
    """metrics.json cell -> key used in calibration and tier_skill maps."""
    return f"{cell['window_days']}d_cvss>={int(cell['cvss_min'])}"


def render_calibration(slice_name, metrics):
    cal = metrics.get("calibration")
    if not cal:
        return None
    cells = metrics.get("cells", [])
    cell_keys = [c for c in CELL_LABEL if c in cal]
    if not cell_keys and cal:
        # no CVE cells (e.g. basket K-of-N): pool every key into one panel
        cal = {"pooled": [b for key in cal for b in cal[key]]}
        cell_keys = ["pooled"]
    if not cell_keys:
        return None
    pw, ph = 360, 300
    cols = 2
    rows = math.ceil(len(cell_keys) / cols)
    width, height = pw * cols, ph * rows + 28
    out = [svg_open(width, height, f"{slice_name} calibration: predicted vs observed")]
    out.append(
        f'<text class="title" x="16" y="{height - 10}">'
        f"Calibration, {escape(slice_name)}: each dot is a bin of predictions; "
        "a calibrated model sits on the gray line.</text>"
    )
    events = {cell_key(c): c["events"] for c in cells}
    for i, key in enumerate(cell_keys):
        ox = (i % cols) * pw
        oy = (i // cols) * ph
        # no cell metadata for pooled or non-CVE keys: count events from the bins
        n_events = events.get(key, sum(round(b["observed"] * b["n"]) for b in cal[key]))
        out.append(calibration_panel(key, cal[key], n_events, ox, oy, pw, ph))
    out.append("</svg>")
    return "".join(out)


# -- Brier skill by tier ------------------------------------------------------


def render_skill(slice_name, metrics):
    tiers = metrics.get("tier_skill")
    if not tiers:
        return None
    cell_keys = [c for c in CELL_LABEL if all(c in tiers[t] for t in tiers)]
    if not cell_keys:
        return None
    vals = [tiers[t][c] for t in tiers for c in cell_keys]
    lo = min(0.0, math.floor(min(vals) * 2) / 2) - 0.5
    hi = 0.25
    width = 640
    left, right = 170, 620  # plot x-range; left column holds the labels
    bar_h, step = 14, 18
    group_gap = 22
    top = 44
    header_h = 18  # tier name sits on its own line above its bars
    group_h = header_h + len(cell_keys) * step
    height = top + len(tiers) * (group_h + group_gap) + 52

    def xpos(v):
        return left + (v - lo) / (hi - lo) * (right - left)

    out = [svg_open(width, height, f"{slice_name} Brier skill by tier")]
    out.append(
        '<text class="title" x="16" y="24">Brier skill vs constant baseline, by tier</text>'
    )
    out.append(
        f'<text class="tick" x="16" y="38">{escape(slice_name)} · '
        "above zero = model beats the constant base rate</text>"
    )
    zero = xpos(0)
    body_top = top
    body_bottom = height - 52
    for t_i, (t, row) in enumerate(tiers.items()):
        gy = body_top + t_i * (group_h + group_gap)
        out.append(f'<text class="ink" x="16" y="{gy + 12}" style="font-size:12px;font-weight:600">'
                   f"{escape(TIER_LABEL.get(t, str(t)))}</text>")
        for c_i, c in enumerate(cell_keys):
            v = row[c]
            by = gy + header_h + c_i * step + 2
            x_from, x_to = (zero, xpos(v)) if v < 0 else (zero, xpos(v))
            x_start, w = min(x_from, x_to), abs(x_to - x_from)
            cls = "better" if v >= 0 else "worse"
            if w >= 1:
                out.append(
                    f'<rect class="{cls}" x="{x_start:.1f}" y="{by}" width="{w:.1f}" '
                    f'height="{bar_h}" rx="4"><title>{escape(CELL_LABEL[c])}: {v:+.3f}</title></rect>'
                )
            label_x = (x_start - 6) if v < 0 else (x_start + w + 6)
            anchor = "end" if v < 0 else "start"
            out.append(
                f'<text class="tick" x="{label_x:.1f}" y="{by + 11}" text-anchor="{anchor}">'
                f"{v:+.3f}</text>"
            )
            out.append(
                f'<text class="label" x="{left - 14}" y="{by + 11}" text-anchor="end">'
                f"{escape(CELL_LABEL[c])}</text>"
            )
    out.append(f'<line class="axis" x1="{zero:.1f}" y1="{body_top}" x2="{zero:.1f}" y2="{body_bottom}"/>')
    # legend: two meanings, so it is always drawn
    ly = height - 22
    out.append(f'<rect class="better" x="16" y="{ly - 9}" width="12" height="12" rx="2"/>')
    out.append(f'<text class="label" x="34" y="{ly + 1}">model beats constant baseline</text>')
    out.append(f'<rect class="worse" x="236" y="{ly - 9}" width="12" height="12" rx="2"/>')
    out.append(f'<text class="label" x="254" y="{ly + 1}">model worse than constant baseline</text>')
    out.append("</svg>")
    return "".join(out)


# -- holdout: hierarchical model vs current (results_hier.json) ---------------

HIER_JSON = BACKTEST / "holdout" / "results_hier.json"


def _rows_from_hier(report):
    """(label, current, chosen, brier_diff, ci) per ecosystem x cell, in report order."""
    rows = []
    for eco, block in report["holdout"].items():
        for cell, h in block.items():
            # chosen_q is the shipped model: hierarchical prior plus the zero-history factor
            rows.append((f"{eco} {cell.replace('_cvss>=', ' CVSS>=')}",
                         h["current"], h["chosen_q"],
                         h["brier_diff_q_vs_current"]["diff"], h["brier_diff_q_vs_current"]["ci95"]))
    return rows


def render_hier_bias(report):
    """Dot plot of mean-prediction / base-rate on a log scale, current vs hierarchical."""
    rows = _rows_from_hier(report)
    lo_exp, hi_exp = -1.0, math.log10(30.0)  # ratio 0.1x .. 30x
    left, right, top = 200, 620, 52
    row_h = 24
    width = 640
    height = top + len(rows) * row_h + 70

    def xp(r):
        t = (math.log10(r) - lo_exp) / (hi_exp - lo_exp)
        return left + t * (right - left)

    out = [svg_open(width, height, "Holdout calibration: predicted / observed, before and after")]
    out.append('<text class="title" x="16" y="24">Holdout calibration, predicted ÷ observed</text>')
    out.append('<text class="tick" x="16" y="40">1.0 means calibrated. Holdout is 2024 onward, '
               "never used to fit.</text>")
    for r, label in ((0.1, "0.1×"), (0.3, "0.3×"), (1.0, "1×"), (3.0, "3×"), (10.0, "10×"), (30.0, "30×")):
        gx = xp(r)
        out.append(f'<line class="grid" x1="{gx:.1f}" y1="{top - 6}" x2="{gx:.1f}" y2="{top + len(rows) * row_h}"/>')
        out.append(f'<text class="tick" x="{gx:.1f}" y="{top + len(rows) * row_h + 16}" text-anchor="middle">'
                   f"{label}</text>")
    ref = xp(1.0)
    out.append(f'<line class="ref" x1="{ref:.1f}" y1="{top - 6}" x2="{ref:.1f}" y2="{top + len(rows) * row_h}"/>')
    for i, (label, cur, new, _d, _ci) in enumerate(rows):
        y = top + i * row_h + row_h / 2
        out.append(f'<text class="label" x="{left - 10}" y="{y + 4:.1f}" text-anchor="end">{escape(label)}</text>')
        for val, cls, dy in ((cur["bias_ratio"], "baseline", -4), (new["bias_ratio"], "series", 4)):
            cx = xp(max(val, 10**lo_exp))
            out.append(f'<circle class="{cls}" cx="{cx:.1f}" cy="{y + dy:.1f}" r="4">'
                       f"<title>{escape(label)}: {val:.2f}×</title></circle>")
    ly = height - 26
    out.append(f'<circle class="baseline" cx="20" cy="{ly - 4}" r="4"/>'
               f'<text class="label" x="30" y="{ly}">current production model</text>')
    out.append(f'<circle class="series" cx="240" cy="{ly - 4}" r="4"/>'
               f'<text class="label" x="250" y="{ly}">shipped model (PyPI fit, no refit)</text>')
    out.append("</svg>")
    return "".join(out)


def render_hier_brier(report):
    """Brier(new) - Brier(current) with package-clustered 95% CI. Negative = new is better."""
    rows = _rows_from_hier(report)
    lo, hi = -0.0045, 0.0010
    left, right, top = 200, 620, 52
    row_h = 24
    width = 640
    height = top + len(rows) * row_h + 60

    def xp(v):
        return left + (v - lo) / (hi - lo) * (right - left)

    out = [svg_open(width, height, "Holdout Brier difference with 95% CI")]
    out.append('<text class="title" x="16" y="24">Brier score: hierarchical minus current</text>')
    out.append('<text class="tick" x="16" y="40">Below zero = better. Bars are package-clustered 95% CIs.</text>')
    zero = xp(0.0)
    for v in (-0.004, -0.002, 0.0, 0.001):
        gx = xp(v)
        out.append(f'<line class="grid" x1="{gx:.1f}" y1="{top - 6}" x2="{gx:.1f}" y2="{top + len(rows) * row_h}"/>')
        out.append(f'<text class="tick" x="{gx:.1f}" y="{top + len(rows) * row_h + 16}" text-anchor="middle">'
                   f"{v:+.3f}</text>")
    out.append(f'<line class="ref" x1="{zero:.1f}" y1="{top - 6}" x2="{zero:.1f}" y2="{top + len(rows) * row_h}"/>')
    for i, (label, _c, _n, diff, ci) in enumerate(rows):
        y = top + i * row_h + row_h / 2
        out.append(f'<text class="label" x="{left - 10}" y="{y + 4:.1f}" text-anchor="end">{escape(label)}</text>')
        x0, x1 = xp(max(ci[0], lo)), xp(min(ci[1], hi))
        out.append(f'<line class="ci" x1="{x0:.1f}" y1="{y:.1f}" x2="{x1:.1f}" y2="{y:.1f}"/>')
        cx = xp(diff)
        cls = "better" if diff < 0 else "worse"
        out.append(f'<circle class="{cls}" cx="{cx:.1f}" cy="{y:.1f}" r="5">'
                   f"<title>{escape(label)}: {diff:+.5f} [{ci[0]:+.5f}, {ci[1]:+.5f}]</title></circle>")
    ly = height - 22
    out.append(f'<circle class="better" cx="20" cy="{ly - 4}" r="5"/>'
               f'<text class="label" x="32" y="{ly}">new model better</text>')
    out.append(f'<circle class="worse" cx="170" cy="{ly - 4}" r="5"/>'
               f'<text class="label" x="182" y="{ly}">new model worse</text>')
    out.append("</svg>")
    return "".join(out)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    if HIER_JSON.exists():
        report = json.loads(HIER_JSON.read_text())
        for name, fn in (("hier-bias", render_hier_bias), ("hier-brier", render_hier_brier)):
            target = OUT / f"{name}.svg"
            target.write_text(fn(report))
            print(f"wrote {target}")
    for path in sorted(BACKTEST.glob("*/metrics.json")):
        slice_name = path.parent.name
        metrics = json.loads(path.read_text())
        for kind, fn in (("calibration", render_calibration), ("skill", render_skill)):
            svg = fn(slice_name, metrics)
            if svg is None:
                print(f"skip {slice_name} {kind}: no matching keys in metrics.json")
                continue
            target = OUT / f"{slice_name}-{kind}.svg"
            target.write_text(svg)
            print(f"wrote {target}")


if __name__ == "__main__":
    main()
