import math
from dataclasses import dataclass

_SEVERITY_BASELINE = {
    "critical": 0.65,
    "high": 0.45,
    "medium": 0.25,
    "low": 0.10,
}

_EXPLOIT_STATUS_DELTA = {
    "actively_exploited": 0.10,
    "poc_available": 0.05,
    "unpatched": 0.0,
    "patched": -0.25,
}


@dataclass
class MarketProbability:
    final: float
    base: float
    mal_triggered: bool
    epss_used: float | None
    modifiers: dict[str, float]


def compute(
    best_epss: float | None,
    has_mal_advisory: bool,
    exploit_status: str | None,
    severity: str | None,
    threat_actor: str | None,
    max_downloads: int | None,
) -> MarketProbability:
    modifiers: dict[str, float] = {}

    # MAL advisory = confirmed supply chain compromise, hard floor
    if has_mal_advisory:
        base = 0.90
        mal_triggered = True
    elif best_epss is not None:
        base = best_epss
        mal_triggered = False
    else:
        base = _SEVERITY_BASELINE.get(severity or "", 0.20)
        mal_triggered = False

    # exploit_status nudge — meaningful when EPSS is absent or low
    if not has_mal_advisory:
        delta = _EXPLOIT_STATUS_DELTA.get(exploit_status or "", 0.0)
        if delta:
            modifiers["exploit_status"] = delta

    # named threat actor = organized, repeat offender
    if threat_actor:
        modifiers["threat_actor"] = 0.05

    # blast radius: large download count means attacker has more targets
    # capped at +0.08 to keep it a tiebreaker not the driver
    if max_downloads and max_downloads > 0:
        blast = min(math.log10(max_downloads) / 90, 0.08)
        if blast > 0.01:
            modifiers["blast_radius"] = round(blast, 4)

    total = base + sum(modifiers.values())
    final = round(max(0.05, min(0.95, total)), 4)

    return MarketProbability(
        final=final,
        base=round(base, 4),
        mal_triggered=mal_triggered,
        epss_used=round(best_epss, 4) if best_epss is not None else None,
        modifiers=modifiers,
    )
