import { useAuth } from "@/lib/auth"

// Soft gate for logged-out visitors who try to place a bet. Keeps them on the
// page (no hard Auth0 redirect) and lets them opt in if they want to.
export function SignupPrompt({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { loginWithRedirect } = useAuth()
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-[#1B2025] p-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-white">Create a free account to bet</h2>
        <p className="mt-2 text-sm text-zinc-400">
          You can browse packages and run simulations without an account. To place a
          contract and earn schmeckles, sign up. it takes a few seconds.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={() => loginWithRedirect()}
            className="rounded-full bg-[#FDE832] px-4 py-2 text-sm font-bold text-[#15191D]"
          >
            Sign up / Sign in
          </button>
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200"
          >
            Keep browsing
          </button>
        </div>
      </div>
    </div>
  )
}
