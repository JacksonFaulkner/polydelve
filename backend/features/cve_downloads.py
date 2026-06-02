import asyncio
import httpx

from features.package_enrichment import fetch_npm_downloads, fetch_pypi_downloads

NVD_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0"
MIN_DOWNLOADS = 100_000


def extract_packages(cve: dict) -> list[tuple[str, str]]:
    """Return list of (ecosystem, package_name) from a CVE record."""
    packages = []
    for config in cve.get("configurations", []):
        for node in config.get("nodes", []):
            for match in node.get("cpeMatch", []):
                cpe = match.get("criteria", "")
                parts = cpe.split(":")
                # cpe:2.3:a:<vendor>:<product>:...
                if len(parts) >= 5:
                    product = parts[4].replace("_", "-")
                    packages.append(product)
    return packages


async def main():
    async with httpx.AsyncClient(timeout=15) as client:
        for keyword in ("npm", "pypi"):
            print(f"\n=== {keyword.upper()} ===")

            r = await client.get(
                NVD_URL,
                params={
                    "keywordSearch": keyword,
                    "resultsPerPage": 20,
                },
            )
            items = r.json().get("vulnerabilities", [])

            for item in items:
                cve = item.get("cve", {})
                cve_id = cve.get("id", "")
                desc = next(
                    (
                        d["value"]
                        for d in cve.get("descriptions", [])
                        if d["lang"] == "en"
                    ),
                    "",
                )
                packages = extract_packages(cve)
                if not packages:
                    continue

                package = packages[0]
                if keyword == "npm":
                    downloads = await fetch_npm_downloads(client, package)
                else:
                    downloads = await fetch_pypi_downloads(client, package)

                if downloads >= MIN_DOWNLOADS:
                    metrics = cve.get("metrics", {})
                    score = "N/A"
                    for key in ("cvssMetricV31", "cvssMetricV30", "cvssMetricV2"):
                        if key in metrics:
                            score = metrics[key][0]["cvssData"]["baseScore"]
                            break

                    print(
                        f"{cve_id:25} {package:30} {downloads:>12,} downloads  CVSS: {score}"
                    )
                    print(f"  {desc[:120]}")


asyncio.run(main())
