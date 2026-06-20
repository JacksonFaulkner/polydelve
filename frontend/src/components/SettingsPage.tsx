import { useRef, useState } from "react"
import { useAuth } from "@/lib/auth"
import { useApi } from "@/lib/api"
import { SchmeckleIcon } from "./SchmeckleIcon"
import type { User } from "@/types"

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/
const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]

interface Props {
  user: User | null
  onUsernameChange: (user: User) => void
}

export function SettingsPage({ user, onUsernameChange }: Props) {
  const { logout, user: auth0User } = useAuth()
  const { authFetch } = useApi()

  // Username edit state
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState("")
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Avatar upload state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  const validationError = dirty && value.length > 0 && !USERNAME_RE.test(value)
    ? "3–20 chars: letters, numbers, underscores only."
    : null

  function startEdit() {
    const current = user?.username ?? ""
    setValue(USERNAME_RE.test(current) ? current : "")
    setUsernameError(null)
    setSaved(false)
    setDirty(false)
    setEditing(true)
  }

  async function handleSave(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!USERNAME_RE.test(value)) return
    setSaving(true)
    setUsernameError(null)
    try {
      const res = await authFetch("/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: value }),
      })
      if (res.status === 409) { setUsernameError("Username already taken."); return }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setUsernameError(body.detail ?? "Something went wrong.")
        return
      }
      const updated: User = await res.json()
      onUsernameChange(updated)
      setEditing(false)
      setSaved(true)
    } catch {
      setUsernameError("Network error.")
    } finally {
      setSaving(false)
    }
  }

  async function handleAvatarFile(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setAvatarError("Must be JPEG, PNG, WebP, or GIF.")
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setAvatarError("Max file size is 5 MB.")
      return
    }

    setAvatarError(null)
    setAvatarUploading(true)

    // Local preview immediately
    const reader = new FileReader()
    reader.onload = (e) => setAvatarPreview(e.target?.result as string)
    reader.readAsDataURL(file)

    try {
      // 1. Get presigned URL
      const urlRes = await authFetch(`/users/me/avatar-upload-url?content_type=${encodeURIComponent(file.type)}`)
      if (!urlRes.ok) {
        setAvatarError("Failed to get upload URL.")
        setAvatarPreview(null)
        return
      }
      const { upload_url, public_url } = await urlRes.json()

      // 2. PUT directly to S3
      const s3Res = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      })
      if (!s3Res.ok) {
        setAvatarError("Upload failed.")
        setAvatarPreview(null)
        return
      }

      // 3. Save public URL to user record
      const patchRes = await authFetch("/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_url: public_url }),
      })
      if (!patchRes.ok) {
        setAvatarError("Saved to S3 but failed to update profile.")
        return
      }
      const updated: User = await patchRes.json()
      onUsernameChange(updated)
    } catch {
      setAvatarError("Network error.")
      setAvatarPreview(null)
    } finally {
      setAvatarUploading(false)
    }
  }

  const avatarSrc = avatarPreview ?? user?.avatar_url ?? (auth0User as { picture?: string })?.picture

  return (
    <div className="mx-auto max-w-lg py-8">
      <div className="rounded-xl border border-zinc-800 bg-[#1C2128] p-6 space-y-4">
        <div className="flex items-center gap-4">
          {/* Avatar with upload overlay */}
          <div className="relative group shrink-0">
            <div className="h-16 w-16 rounded-full overflow-hidden bg-zinc-700">
              {avatarSrc ? (
                <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full" />
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarUploading}
              className="absolute inset-0 rounded-full flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-white font-medium disabled:cursor-wait"
            >
              {avatarUploading ? "…" : "Change"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_TYPES.join(",")}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleAvatarFile(f)
                e.target.value = ""
              }}
            />
          </div>

          <div className="space-y-0.5 min-w-0">
            <p className="text-lg font-semibold text-white truncate">{user?.username ?? ""}</p>
            {"email" in (auth0User ?? {}) && (
              <p className="text-sm text-zinc-400 truncate">{(auth0User as { email?: string })?.email}</p>
            )}
          </div>
        </div>

        {avatarError && <p className="text-xs text-red-400">{avatarError}</p>}

        <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3">
          <SchmeckleIcon className="h-5 w-5 text-[#FDE832]" />
          <span className="text-sm text-zinc-300">Balance</span>
          <span className="ml-auto font-bold tabular-nums text-white">
            {user?.schmeckles.toLocaleString() ?? ""}
          </span>
        </div>

        {/* Username change */}
        {editing ? (
          <form onSubmit={handleSave} className="space-y-2">
            <input
              type="text"
              value={value}
              onChange={(e) => { setValue(e.target.value); setUsernameError(null); setDirty(true) }}
              maxLength={20}
              autoFocus
              className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2.5 text-white placeholder-zinc-500 outline-none focus:border-[#FDE832] focus:ring-1 focus:ring-[#FDE832]"
            />
            {(validationError || usernameError) && (
              <p className="text-xs text-red-400">{validationError ?? usernameError}</p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving || !value || !!validationError}
                className="flex-1 rounded-lg bg-[#FDE832] py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={startEdit}
            className="w-full rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors"
          >
            {saved ? "Username updated ✓" : "Change username"}
          </button>
        )}

        <button
          onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
          className="w-full rounded-lg border border-red-800/60 bg-red-950/30 px-4 py-2.5 text-sm font-medium text-red-400 transition-colors hover:border-red-700 hover:bg-red-950/50 hover:text-red-300"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
