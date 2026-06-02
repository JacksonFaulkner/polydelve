import { useAuth0 } from "@auth0/auth0-react"

const SKIP = import.meta.env.VITE_SKIP_AUTH === "true"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const noop = () => Promise.resolve(undefined as any)

export function useAuth() {
  if (SKIP) {
    return {
      isAuthenticated: true,
      isLoading: false,
      loginWithRedirect: noop,
      logout: noop,
      user: { name: "Dev", picture: null },
      getAccessTokenSilently: () => Promise.resolve("dev-token"),
    }
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useAuth0()
}
