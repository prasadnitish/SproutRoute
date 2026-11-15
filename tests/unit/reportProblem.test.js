import test from "node:test";
import assert from "node:assert/strict";
import { REPORT_EMAIL, buildReportMailto } from "../../src/frontend/src/utils/reportProblem.js";

test("the report opens the visitor's mail app with the trip named and nothing else attached", () => {
  const url = buildReportMailto({ destination: "San Diego, CA", startDate: "2026-12-18", endDate: "2026-12-22" });
  assert.ok(url.startsWith(`mailto:${REPORT_EMAIL}?`));
  const params = new URLSearchParams(url.slice(url.indexOf("?") + 1));
  assert.equal(params.get("subject"), "Problem with a SproutRoute plan: San Diego, CA (2026-12-18 to 2026-12-22)");
  assert.match(params.get("body"), /closed, unsafe or inappropriate for kids/);
  assert.ok(!url.includes(" "), "spaces are encoded so the link works in every mail app");
});

test("a trip with no destination or dates still gets a usable subject", () => {
  const params = new URLSearchParams(buildReportMailto({}).split("?")[1]);
  assert.equal(params.get("subject"), "Problem with a SproutRoute plan");
});
