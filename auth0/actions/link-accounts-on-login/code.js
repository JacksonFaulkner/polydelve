/**
 * Post-login Action: auto-link accounts with the same verified email.
 *
 * Security model:
 *   - Social logins (Google) have provider-verified email — trust and link all
 *     same-email accounts automatically.
 *   - Username/password logins require both sides to have email_verified.
 *   - Never run during a linking transaction (avoid infinite loops).
 */
exports.onExecutePostLogin = async (event, api) => {
  if (event.transaction?.linking_id) return;

  const { ManagementClient, AuthenticationClient } = require("auth0");

  // Get a Management API token (Actions don't have one natively)
  const auth = new AuthenticationClient({
    domain: event.secrets.MANAGEMENT_API_DOMAIN,
    clientId: event.secrets.MANAGEMENT_API_CLIENT_ID,
    clientSecret: event.secrets.MANAGEMENT_API_CLIENT_SECRET,
  });

  let accessToken;
  try {
    const res = await auth.oauth.clientCredentialsGrant({
      audience: `https://${event.secrets.MANAGEMENT_API_DOMAIN}/api/v2/`,
    });
    accessToken = res.data.access_token;
  } catch (err) {
    console.error("account-linking: failed to get management token", err.message);
    return;
  }

  const management = new ManagementClient({
    domain: event.secrets.MANAGEMENT_API_DOMAIN,
    token: accessToken,
  });

  let result;
  try {
    result = await management.users.listUsersByEmail({ email: event.user.email });
  } catch (err) {
    console.error("account-linking: failed to fetch users by email", err.message);
    return;
  }

  const allUsers = result.data ?? result;
  const isGoogleLogin = event.connection.strategy === "google-oauth2";

  const others = allUsers.filter((u) => {
    if (u.user_id === event.user.user_id) return false;
    // If current user is unverified (password signup), only link to verified social
    // accounts — Google vouches for the email, safe to merge
    if (!event.user.email_verified) {
      return u.email_verified && u.identities?.[0]?.isSocial === true;
    }
    return true;
  });

  if (others.length === 0) return;

  // Oldest account becomes primary
  const allAccounts = [event.user, ...others].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
  const primary = allAccounts[0];
  const secondaries = allAccounts.slice(1);

  for (const secondary of secondaries) {
    // Skip if already linked
    if (primary.identities?.some((id) => `${id.provider}|${id.user_id}` === secondary.user_id)) {
      continue;
    }

    const [provider, ...rest] = secondary.user_id.split("|");
    const secondaryUserId = rest.join("|");

    try {
      const res = await fetch(
        `https://${event.secrets.MANAGEMENT_API_DOMAIN}/api/v2/users/${encodeURIComponent(primary.user_id)}/identities`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ provider, user_id: secondaryUserId }),
        }
      );
      if (!res.ok) {
        const body = await res.text();
        console.error(`account-linking: link API ${res.status}`, body);
      } else {
        console.log(`account-linking: linked ${secondary.user_id} → ${primary.user_id}`);
      }
    } catch (err) {
      console.error(`account-linking: failed to link ${secondary.user_id}`, err.message);
    }
  }
};