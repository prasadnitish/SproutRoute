import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";

export const libraryPath = "/api/v1/social-save/mcp";
const metadataPath = "/.well-known/oauth-protected-resource" + libraryPath;
const permissions = new Map([
  ["list_saved_trips", "library:read"],
  ["list_saved_places", "library:read"],
  ["save_place_from_url", "library:write"],
]);

function httpsUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  )
    throw new Error("Expected a canonical HTTPS URL");
  return url;
}

function readConfig() {
  try {
    const origin = httpsUrl(process.env.MCP_PUBLIC_ORIGIN);
    const project = httpsUrl(process.env.SUPABASE_URL);
    const clients = JSON.parse(process.env.MCP_OAUTH_CLIENTS || "{}");
    if (
      origin.pathname !== "/" ||
      project.pathname !== "/" ||
      !Object.keys(clients).length
    )
      return null;
    for (const [id, callback] of Object.entries(clients)) {
      z.uuid().parse(id);
      httpsUrl(callback);
    }
    return {
      issuer: project.origin + "/auth/v1",
      resource: origin.origin + libraryPath,
      clients,
    };
  } catch {
    return null;
  }
}

export function mountLibraryOAuth(app, config = readConfig(), signingKey) {
  const metadataUrl = config && new URL(metadataPath, config.resource).href;
  const key =
    config &&
    (signingKey ??
      createRemoteJWKSet(new URL(config.issuer + "/.well-known/jwks.json")));
  app.get(metadataPath, (_req, res) => {
    if (!config)
      return res
        .status(503)
        .json({ message: "Account linking is unavailable." });
    res.json({
      resource: config.resource,
      resource_name: "SproutRoute private library",
      authorization_servers: [config.issuer],
      scopes_supported: ["openid"],
      bearer_methods_supported: ["header"],
    });
  });
  // Public registration information only. The consent page uses the same allowlist.
  app.get("/api/v1/social-save/oauth-clients", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ clients: config?.clients ?? {} });
  });
  return async (req, res, next) => {
    const token = /^Bearer ([^\s]+)$/i.exec(
      req.headers.authorization ?? "",
    )?.[1];
    const challenge = (status, error) => {
      const params = [
        metadataUrl && `resource_metadata="${metadataUrl}"`,
        'scope="openid"',
        error && `error="${error}"`,
      ];
      res.set(
        "WWW-Authenticate",
        "Bearer " + params.filter(Boolean).join(", "),
      );
      return res
        .status(status)
        .json({
          message:
            status === 403
              ? "Connector lacks library access."
              : "Connect your SproutRoute account.",
        });
    };
    if (!token) return challenge(401);
    if (!config)
      return res
        .status(503)
        .json({ message: "Account linking is unavailable." });
    try {
      const { payload } = await jwtVerify(token, key, {
        issuer: config.issuer,
        audience: config.resource,
        algorithms: ["ES256", "RS256"],
        maxTokenAge: "1h",
        requiredClaims: ["exp", "iat", "sub", "client_id"],
      });
      if (
        payload.exp - payload.iat > 3600 ||
        payload.aud !== config.resource ||
        payload.role !== "sproutroute_mcp" ||
        payload.is_anonymous !== false ||
        !z.uuid().safeParse(payload.sub).success ||
        !Object.hasOwn(config.clients, payload.client_id)
      )
        return challenge(401, "invalid_token");

      const grants = payload.sproutroute_permissions;
      const required =
        req.body?.method === "tools/call"
          ? permissions.get(req.body.params?.name)
          : null;
      if (
        payload.scope !== "openid" ||
        !Array.isArray(grants) ||
        !grants.includes("library:read") ||
        (req.body?.method === "tools/call" &&
          (!required || !grants.includes(required)))
      )
        return challenge(403, "insufficient_scope");
      req.user = { id: payload.sub, isAnonymous: false };
      req.libraryConnector = true;
    } catch {
      return challenge(401, "invalid_token");
    }
    next();
  };
}
