import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getSupabaseAdmin } from "../utils/supabaseClient.js";
import { groundedFactCount, importFields } from "./socialSave.js";

export class BillingError extends Error {
  constructor(status, code, message, retryable = false) {
    super(message);
    Object.assign(this, { status, code, retryable });
  }
}

const digest = (text) => createHash("sha256").update(text).digest();
const limit = (value, fallback) =>
  z.coerce
    .number()
    .int()
    .min(0)
    .max(10000)
    .parse(value ?? fallback);

async function adminRpc(name, args) {
  const { data, error } = await getSupabaseAdmin().rpc(name, args);
  if (error) throw new Error("Billing database unavailable");
  return data;
}

export function sandboxBillingEnabled(env = process.env) {
  const staging = env.RAILWAY_ENVIRONMENT_NAME === "staging";
  const local =
    !env.RAILWAY_ENVIRONMENT_NAME &&
    !env.RAILWAY_ENVIRONMENT_ID &&
    env.NODE_ENV !== "production";
  return env.V3_SOCIAL_BILLING_ENABLED === "true" && (staging || local);
}

export function createSocialBilling(options = {}) {
  const enabled = options.enabled ?? sandboxBillingEnabled();
  const preview =
    options.preview ??
    (process.env.NODE_ENV !== "production" &&
      !process.env.RAILWAY_ENVIRONMENT_ID &&
      process.env.V3_LOCAL_EXTRACTION_PREVIEW === "true");
  const limits = {
    free_limit: limit(process.env.V3_FREE_EXTRACTIONS, 3),
    premium_limit: limit(process.env.V3_PREMIUM_EXTRACTIONS, 30),
  };
  const rpc = options.rpc ?? adminRpc;
  return {
    enabled,
    sync: options.sync ?? syncRevenueCat,
    status: (userId) => rpc("billing_status", { owner_id: userId, ...limits }),
    async extract(userId, raw, requestId, run) {
      const input = z.object(importFields).parse(raw);
      if (!enabled) {
        if (preview) return run(input);
        throw new BillingError(
          503,
          "EXTRACTION_UNAVAILABLE",
          "AI extraction is unavailable. You can still save the link for review.",
          true,
        );
      }
      const operation = {
        owner_id: userId,
        operation_id: z.uuid().parse(requestId),
      };
      const reserved = await rpc("billing_reserve", {
        ...operation,
        ...limits,
        fingerprint: digest(JSON.stringify(input)).toString("hex"),
      });
      switch (reserved.state) {
        case "cached": {
          const { groundedFactCount: _privateCount, ...result } = reserved.result;
          return result;
        }
        case "pending":
          throw new BillingError(
            409,
            "EXTRACTION_IN_PROGRESS",
            "This extraction is in progress. Retry with the same request ID.",
            true,
          );
        case "conflict":
          throw new BillingError(
            409,
            "EXTRACTION_ID_CONFLICT",
            "This request ID is already associated with different input.",
          );
        case "limited":
          throw new BillingError(
            429,
            "EXTRACTION_LIMIT_REACHED",
            "Your AI save allowance is in use. You can still save the link for review.",
          );
        case "reserved":
          break;
        default:
          throw new Error("Unknown billing reservation");
      }
      const finish = (output, consume) =>
        rpc("billing_finish", {
          ...operation,
          lease_token: reserved.token,
          output,
          consume,
        });
      let output;
      try {
        output = await run(input);
      } catch (error) {
        await finish(null, false);
        throw error;
      }
      // An ambiguous commit may already have persisted the result. Retrying the
      // same request ID recovers it without refunding a successful execution.
      const receipt = { ...output, groundedFactCount: output[groundedFactCount] };
      if (!(await finish(receipt, output.candidates.length > 0)))
        throw new Error("Extraction reservation expired");
      return output;
    },
  };
}

export function verifiedSubscriber(snapshot, sandbox) {
  const entitlements = snapshot?.subscriber?.entitlements;
  if (
    !Number.isSafeInteger(snapshot?.request_date_ms) ||
    !entitlements ||
    typeof entitlements !== "object" ||
    Array.isArray(entitlements)
  )
    throw new Error("Invalid RevenueCat snapshot");
  const premium = entitlements.premium;
  const purchase =
    snapshot.subscriber.subscriptions?.[premium?.product_identifier];
  let expires = null;
  if (
    premium &&
    purchase?.store === "app_store" &&
    purchase.is_sandbox === sandbox &&
    !purchase.refunded_at
  ) {
    const dates = [premium.expires_date, premium.grace_period_expires_date]
      .filter(Boolean)
      .map(Date.parse);
    if (!dates.length || !dates.every(Number.isFinite))
      throw new Error("Invalid subscription expiry");
    expires = new Date(Math.max(...dates)).toISOString();
  }
  return {
    observed: new Date(snapshot.request_date_ms).toISOString(),
    expires,
  };
}

export async function syncRevenueCat(
  ownerId,
  {
    rpc = adminRpc,
    fetchFn = fetch,
    apiKey = process.env.REVENUECAT_SECRET_API_KEY,
    sandbox = true,
  } = {},
) {
  if (!apiKey) throw new Error("RevenueCat is unconfigured");
  const response = await fetchFn(
    "https://api.revenuecat.com/v1/subscribers/" +
      encodeURIComponent(z.uuid().parse(ownerId)),
    {
      headers: { authorization: "Bearer " + apiKey },
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!response.ok) throw new Error("RevenueCat verification unavailable");
  const snapshot = verifiedSubscriber(await response.json(), sandbox);
  await rpc("billing_sync", { owner_id: ownerId, ...snapshot });
}

export function mountRevenueCat(app, options = {}, limiter) {
  const configured =
    options.webhookHeader ?? process.env.REVENUECAT_WEBHOOK_AUTH;
  app.post("/api/v1/billing/revenuecat", limiter, async (req, res) => {
    if (!configured) return res.sendStatus(503);
    if (
      !timingSafeEqual(
        digest(configured),
        digest(req.get("authorization") ?? ""),
      )
    )
      return res.sendStatus(401);
    const event = req.body?.event;
    if (!event || typeof event.type !== "string") return res.sendStatus(400);
    if (event.type === "TEST" || event.environment !== "SANDBOX")
      return res.sendStatus(200);
    const groups =
      event.type === "TRANSFER"
        ? [event.transferred_from, event.transferred_to]
        : [
            [event.app_user_id, event.original_app_user_id],
            event.aliases ?? [],
          ];
    if (groups.some((group) => !Array.isArray(group)))
      return res.sendStatus(400);
    const ids = groups.flat();
    try {
      const sync = options.sync ?? syncRevenueCat;
      await Promise.all(
        [...new Set(ids.filter((id) => z.uuid().safeParse(id).success))].map(
          (id) => sync(id),
        ),
      );
      res.sendStatus(200);
    } catch {
      res.sendStatus(503);
    }
  });
}

async function listBillingCustomers(after) {
  let query = getSupabaseAdmin()
    .from("billing_entitlements")
    .select("user_id")
    .order("user_id")
    .limit(100);
  if (after) query = query.gt("user_id", after);
  const { data, error } = await query;
  if (error) throw new Error("Billing customer list unavailable");
  return data;
}

export async function reconcileBilling({
  list = listBillingCustomers,
  sync = syncRevenueCat,
} = {}) {
  let after;
  const summary = { processed: 0, failed: 0 };
  for (;;) {
    const rows = await list(after);
    if (rows.length === 0) return summary;
    for (const { user_id } of rows) {
      try {
        await sync(user_id);
      } catch {
        summary.failed++;
      }
      summary.processed++;
    }
    after = rows.at(-1).user_id;
  }
}
