// Sends one test alert email using the same code path as production alerts.
// Run against the production variables without printing them: railway run node scripts/send-test-alert.mjs
import { createAiAlerts } from "../src/backend/services/aiAlerts.js";

const result = await createAiAlerts().sendTest();
console.log(result.sent ? "Test alert emailed." : `Not sent: ${result.reason}`);
process.exit(result.sent ? 0 : 1);
