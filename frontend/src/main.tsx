import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { Auth0Provider } from "@auth0/auth0-react"
import "./index.css"
import App from "./App"

const domain   = import.meta.env.VITE_AUTH0_DOMAIN
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID
const audience = import.meta.env.VITE_AUTH0_AUDIENCE
const skipAuth = import.meta.env.VITE_SKIP_AUTH === "true"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {skipAuth ? (
      <App />
    ) : (
      <Auth0Provider
        domain={domain}
        clientId={clientId}
        authorizationParams={{ redirect_uri: window.location.origin, audience }}
      >
        <App />
      </Auth0Provider>
    )}
  </StrictMode>
)
