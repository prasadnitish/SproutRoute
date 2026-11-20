import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
const path = "/api/v1/social-save/mcp";
const origin = "https://staging.example.org";
const issuer = "https://project.example.org/auth/v1";
const client = randomUUID();
const owner = randomUUID();
const callback = "https://host.example.org/callback";
const pairs = [0, 1].map(() =>
  generateKeyPairSync("ec", { namedCurve: "P-256" }),
);
const baseClaims = {
  iat: Math.floor(Date.now() / 1000),
  iss: issuer,
  aud: origin + path,
  sub: owner,
  exp: Math.floor(Date.now() / 1000) + 300,
  client_id: client,
  is_anonymous: false,
  role: "sproutroute_mcp",
  scope: "openid",
  sproutroute_permissions: ["library:read", "library:write"],
};
function token(overrides, pair = pairs[0]) {
  const parts = [
    { alg: "ES256", kid: "test" },
    { ...baseClaims, ...overrides },
  ]
    .map((value) => Buffer.from(JSON.stringify(value)).toString("base64url"))
    .join(".");
  return (
    parts +
    "." +
    sign("sha256", Buffer.from(parts), {
      key: pair.privateKey,
      dsaEncoding: "ieee-p1363",
    }).toString("base64url")
  );
}

export { owner, token, path, origin, issuer, pairs, client, callback };
export const oauthDeps = {
  oauthConfig: {
    resource: origin + path,
    issuer,
    clients: { [client]: callback },
  },
  oauthKey: pairs[0].publicKey,
};
