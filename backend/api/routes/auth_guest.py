from fastapi import APIRouter

from api.auth import mint_guest_token

public_router = APIRouter(prefix="/auth")


@public_router.post("/guest")
def issue_guest_token() -> dict:
    """Mint a short-lived guest bearer token for logged-out browsing.
    Cannot place or sell bets — those endpoints require Auth0 login."""
    token, expires_in = mint_guest_token()
    return {"token": token, "expires_in": expires_in, "token_type": "Bearer"}
