export function BitIcon({ className = "h-4 w-4" }: { className?: string }) {
  return <img src="/bit.png" alt="bit" width={96} height={96} className={`inline object-contain ${className}`} />
}
