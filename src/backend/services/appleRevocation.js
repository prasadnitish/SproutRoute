import { createPublicKey, sign, verify } from "node:crypto";

const issuer = "https://appleid.apple.com";

function clientSecret(clientId, env, now) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned =
    encode({ alg: "ES256", kid: env.APPLE_KEY_ID }) +
    "." +
    encode({
      iss: env.APPLE_TEAM_ID,
      iat: now,
      exp: now + 300,
      aud: issuer,
      sub: clientId,
    });
  const signature = sign("sha256", Buffer.from(unsigned), {
    key: env.APPLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    dsaEncoding: "ieee-p1363",
  });
  return unsigned + "." + signature.toString("base64url");
}

export async function revokeAppleAuthorization(
  { appleClientId, appleAuthorizationCode },
  subject,
  { env = process.env, request = fetch } = {},
) {
  const allowed = [env.APPLE_NATIVE_CLIENT_ID, env.APPLE_WEB_CLIENT_ID].filter(
    Boolean,
  );
  if (!allowed.includes(appleClientId)) throw new Error("Unknown Apple client");
  const now = Math.floor(Date.now() / 1000);
  const credentials = {
    client_id: appleClientId,
    client_secret: clientSecret(appleClientId, env, now),
  };
  const post = async (path, fields) => {
    const response = await request(issuer + path, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({ ...credentials, ...fields }),
    });
    if (!response.ok) throw new Error("Apple authorization failed");
    return response;
  };
  const fields = {
    grant_type: "authorization_code",
    code: appleAuthorizationCode,
  };
  if (appleClientId === env.APPLE_WEB_CLIENT_ID)
    fields.redirect_uri = env.APPLE_WEB_REDIRECT_URI;
  const tokens = await (await post("/auth/token", fields)).json();
  const [h, p, s] = tokens.id_token.split(".");
  const header = JSON.parse(Buffer.from(h, "base64url"));
  const claims = JSON.parse(Buffer.from(p, "base64url"));
  if (
    header.alg !== "RS256" ||
    claims.iss !== issuer ||
    claims.sub !== subject ||
    claims.aud !== appleClientId ||
    !Number.isFinite(claims.exp) ||
    claims.exp <= now ||
    !tokens.refresh_token
  )
    throw new Error("Apple identity mismatch");
  const response = await request(issuer + "/auth/keys", {
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Apple verification unavailable");
  const key = (await response.json()).keys.find(
    (k) => k.kid === header.kid && k.kty === "RSA",
  );
  if (
    !key ||
    !verify(
      "RSA-SHA256",
      Buffer.from(h + "." + p),
      createPublicKey({ key, format: "jwk" }),
      Buffer.from(s, "base64url"),
    )
  )
    throw new Error("Apple identity verification failed");
  await post("/auth/revoke", {
    token: tokens.refresh_token,
    token_type_hint: "refresh_token",
  });
}
