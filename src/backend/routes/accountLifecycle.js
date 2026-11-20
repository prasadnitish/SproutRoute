import { z } from "zod";
import { getSupabaseAdmin } from "../utils/supabaseClient.js";
import { revokeAppleAuthorization } from "../services/appleRevocation.js";

const deletion = z.strictObject({
  appleClientId: z.string().min(1).max(255).optional(),
  appleAuthorizationCode: z.string().min(1).max(4096).optional(),
  manualAppleRevocation: z.boolean().optional(),
});
const merge = deletion.extend({
  sourceAccessToken: z.string().min(1).max(16384),
  confirm: z.literal(true),
});

class LifecycleError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function verifiedUser(jwt) {
  const { data, error } = await getSupabaseAdmin().auth.getUser(jwt);
  if (error && error.status >= 500) throw error;
  return error ? null : data.user;
}

async function finishAccount(source, destination, appleSubject) {
  const { error } = await getSupabaseAdmin().rpc("finish_account_lifecycle", {
    source_id: source,
    destination_id: destination,
    apple_subject: appleSubject,
  });
  if (error) throw error;
}

async function recentUser(token, verify) {
  const denied = new LifecycleError(
    403,
    "Sign in again to verify this account.",
  );
  if (!token) throw denied;
  const user = await verify(token);
  if (!user?.id || user.is_anonymous || !Array.isArray(user.identities))
    throw denied;
  // Supabase Auth verified this exact token. Refreshing it does not renew the AMR timestamp.
  let claims;
  try {
    claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url"));
  } catch {
    throw denied;
  }
  const now = Date.now() / 1000;
  if (
    claims?.sub !== user.id ||
    "client_id" in claims ||
    !Array.isArray(claims.amr) ||
    !claims.amr.some(
      (m) =>
        ["oauth", "otp", "magiclink"].includes(m?.method) &&
        Number.isFinite(m.timestamp) &&
        m.timestamp <= now &&
        now - m.timestamp <= 300,
    )
  )
    throw denied;
  return user;
}

export function mountAccountLifecycle(
  app,
  path,
  {
    verify = verifiedUser,
    revokeApple = revokeAppleAuthorization,
    finish = finishAccount,
  } = {},
) {
  function handle(isMerge) {
    return async (req, res) => {
      try {
        const parsed = (isMerge ? merge : deletion).safeParse(req.body ?? {});
        if (!parsed.success)
          throw new LifecycleError(
            422,
            "Check the account confirmation and try again.",
          );
        const body = parsed.data;
        const current = await recentUser(
          req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1],
          verify,
        );
        if (current.id !== req.user.id)
          throw new LifecycleError(403, "Verify this account again.");
        const source = isMerge
          ? await recentUser(body.sourceAccessToken, verify)
          : current;
        if (isMerge && source.id === current.id)
          throw new LifecycleError(
            409,
            "These sign-ins already use one account.",
          );
        const apple = source.identities.find(
          (identity) => identity.provider === "apple",
        );
        const subject = apple?.identity_data?.sub ?? apple?.id ?? null;
        if (apple && !subject) throw new Error("Apple identity missing");
        if (apple && !body.manualAppleRevocation) {
          if (!body.appleAuthorizationCode || !body.appleClientId)
            throw new LifecycleError(
              403,
              "Authorize Apple revocation or choose manual revocation.",
            );
          await revokeApple(body, subject);
        }
        await finish(source.id, isMerge ? current.id : null, subject);
        return res.json(
          apple && body.manualAppleRevocation
            ? { ok: true, manualAppleRevocation: true }
            : { ok: true },
        );
      } catch (err) {
        const known = err instanceof LifecycleError;
        res
          .status(known ? err.status : 503)
          .json({
            message: known
              ? err.message
              : "Account change could not be completed. Please try again.",
          });
      }
    };
  }
  app.delete(path, handle(false));
  app.post(path + "/merge", handle(true));
}
