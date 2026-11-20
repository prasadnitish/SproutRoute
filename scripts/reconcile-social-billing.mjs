import {
  reconcileBilling,
  sandboxBillingEnabled,
} from "../src/backend/services/socialBilling.js";
import { getSupabaseAdmin } from "../src/backend/utils/supabaseClient.js";
if (!sandboxBillingEnabled() || !process.env.REVENUECAT_SECRET_API_KEY)
  throw new Error("Configure sandbox billing before running reconciliation.");
const cutoff = new Date();
cutoff.setUTCDate(1);
cutoff.setUTCMonth(cutoff.getUTCMonth() - 1);
const { error } = await getSupabaseAdmin()
  .from("billing_extractions")
  .delete()
  .lt("period_start", cutoff.toISOString().slice(0, 10));
if (error) throw new Error("Billing history retention failed");
const summary = await reconcileBilling();
console.log(JSON.stringify(summary));
if (summary.failed) process.exitCode = 1;
