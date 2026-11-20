# Account removal and duplicate-account merge

The destination account stays signed in after a merge. Its connected providers stay attached. The source account is removed. To use its provider again, connect that provider from the surviving account’s settings.

## HTTP contract

Both routes require a registered first-party Supabase user access token (Bearer). Each account involved must have authenticated with a code, magic link, or social provider within the past five minutes. Session refresh alone does not renew this proof. Account IDs and Apple subjects are derived from authenticated records. The API does not match email addresses.

| Method and route | JSON body | Result |
|---|---|---|
| DELETE /api/v1/social-save/account | Empty body or Apple proof | Removes the signed-in account |
| POST /api/v1/social-save/account/merge | sourceAccessToken, confirm set to true, optional source Apple proof | Moves the source’s saved data into the Bearer account and removes the source identity |

Apple proof consists of appleAuthorizationCode and appleClientId. A client that cannot provide a code can explicitly select manualAppleRevocation set to true and display [Apple’s manual revocation instructions](https://support.apple.com/en-us/102571). The response is {"ok":true} with manualAppleRevocation set to true when used. Email and Google accounts require no Apple credential or provider setup. Invalid input returns 422, insufficient verification 403, and the same account on both sides 409. Temporary integration or database failures return 503.

## Database behavior

Apply migration 039 after 038. Check for public.users rows and user-prefixed group trip owner keys lacking an auth.users parent before applying. Resolve any orphan ownership through a separate reviewed migration. The new FK enforces the mapping for future writes.

The service-role-only database function locks both accounts in ID order. Auth removal and saved-data transfer commit as one transaction. Account deletion removes the owned trip snapshots, planning requests and feedback, profiles, revisions and imports, saved places, inbox and user-owned group trip documents. Guest-owned group workspaces and capability-based public trip links have separate ownership and expiry.

A merge keeps the destination profile active if both exist. Profile versions from the source and their attached revisions remain in the destination account. Identical saved trip snapshots deduplicate. Differing snapshots with the same UUID are both retained. Shared place IDs keep their real Apple identity and preserve the locked flag. Divergent source details become review candidates in the destination inbox. Inbox ID collisions retain differing entries under a new UUID.

The external Apple revocation precedes the database transaction. A failed Apple exchange or revocation leaves account data intact. If revocation succeeded and the database subsequently failed, retry with a fresh Apple code or choose manual revocation. A lost success response may leave the source unable to sign in with its old token. Refresh the destination library before starting a new merge. A retry cannot transfer data back out of the destination.

## Provider configuration and release verification

Configure Railway secrets APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY (Apple signing .p8 PEM), plus APPLE_NATIVE_CLIENT_ID (bundle ID), APPLE_WEB_CLIENT_ID (Services ID) and APPLE_WEB_REDIRECT_URI. Build the web app with VITE_APPLE_SERVICES_ID and VITE_APPLE_REDIRECT_URI matching those web settings. Register the HTTPS return URL and domain for the Services ID, group it with the native App ID, and configure Apple’s private relay for email verification. Never place signing material in a VITE_ variable. The server generates a short-lived ES256 secret for the chosen allowlisted client. It verifies Apple’s signed ID token and its issuer, audience, expiration and linked subject before revoking the exchanged refresh token.

Perform a real Apple sandbox/account test on iOS and the registered web origin after provisioning. Also verify an actual OTP email, Google login, manual revocation and removal of a staged two-account dataset. Apple developer credentials, live provider settings, hosted migrations and external purchases are outside local test coverage. SproutRoute obtains an authorization code at deletion time. It does not retain provider refresh tokens. Server-to-server Apple credential change notifications are a separate infrastructure integration.

[Apple TN3194](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple) · [Supabase JWT claims](https://supabase.com/docs/guides/auth/jwt-fields)
