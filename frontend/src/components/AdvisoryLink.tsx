import { advisoryUrl } from "@/lib/epss"

/** Links a CVE or OSV advisory ID to its public record. */
export function AdvisoryLink({ id, className = "text-ink-2 hover:text-ink-1" }: { id: string; className?: string }) {
  return (
    <a
      href={advisoryUrl(id)}
      target="_blank"
      rel="noopener noreferrer"
      className={`underline decoration-line-3 hover:decoration-ink-3 transition-colors ${className}`}
    >
      {id}
    </a>
  )
}
