import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

const token = "w".repeat(43);
const openUrl = "https://sproutroute.app/s#mcp=" + token;
const stop = { name: "Garden", place_id: "place-1", start_time: "10:00", duration_minutes: 45, category: "park", locked: false, rating: null, hours: null };
const plan = {
  schema_version: 1, status: "ready", job_id: "aaa", destination: "Seattle", open_url: openUrl,
  days: [{ day: 1, date: "2027-05-01", stops: [stop] }, { day: 2, date: "2027-05-02", stops: [{ ...stop, name: "Waterfront" }] }],
};

test("host negotiates theme, polls, handles a swap and opens only declared destinations", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const html = readFileSync(path.resolve("src/backend/mcp/widget/itinerary.html"), "utf8");
  await page.route("http://widget-host.test/", route => route.fulfill({ contentType: "text/html", body: '<iframe title="Trip" sandbox="allow-scripts"></iframe>' }));
  await page.goto("http://widget-host.test/");
  await page.evaluate(({ html, plan }) => {
    const iframe = document.querySelector("iframe")!;
    const send = (data: any) => iframe.contentWindow!.postMessage({ jsonrpc: "2.0", ...data }, "*");
    const messages: any[] = [];
    Object.assign(window, { messages, send });
    window.addEventListener("message", (event) => {
      if (event.source !== iframe.contentWindow) return;
      const { id, method, params } = event.data;
      messages.push(event.data);
      if (method === "ui/initialize") send({ id, result: { protocolVersion: "2026-01-26", hostContext: { theme: "dark" }, hostCapabilities: { openLinks: {}, serverTools: {}, updateModelContext: {} } } });
      if (method === "ui/notifications/initialized") send({ method: "ui/notifications/tool-result", params: { structuredContent: { ...plan, status: "pending", days: [] } } });
      if (method === "tools/call") {
        if (params.name === "get_attraction") {
          send({ id, result: { structuredContent: { rating: 4.6, hours: ["9 AM–6 PM"] } } });
          return;
        }
        if (params.name === "set_stop_lock") plan.days[1].stops[0].locked = params.arguments.locked;
        if (params.name === "suggest_alternative") {
          if (plan.days[1].stops[0].name === "Replacement garden") {
            send({ id, result: { isError: true, content: [{ type: "text", text: "No verified alternative was available." }] } });
            return;
          }
          plan.days[1].stops[0].name = "Replacement garden";
        }
        send({ id, result: { structuredContent: plan } });
      }
      if (method === "ui/update-model-context" || method === "ui/open-link") send({ id, result: {} });
    });
    iframe.srcdoc = html;
  }, { html, plan });
  const frame = page.frameLocator('iframe[title="Trip"]');
  await expect(frame.getByText("Garden", { exact: true })).toBeVisible();
  await expect(frame.locator("html")).toHaveCSS("color-scheme", "dark");
  await page.evaluate(() => (window as any).send({ method: "ui/notifications/host-context-changed", params: { theme: "light" } }));
  await expect(frame.locator("html")).toHaveCSS("color-scheme", "light");
  await frame.getByRole("tab", { name: "Day 2" }).click();
  await expect(frame.getByText("Waterfront", { exact: true })).toBeVisible();
  const lock = frame.getByRole("button", { name: "Lock this stop" });
  const swap = frame.getByRole("button", { name: "Swap this stop" });
  await lock.click();
  await expect(lock).toHaveAttribute("aria-pressed", "true");
  await expect(swap).toBeDisabled();
  await lock.click();
  await expect(lock).toHaveAttribute("aria-pressed", "false");
  await expect(swap).toBeEnabled();
  await swap.click();
  await expect(frame.getByText("Replacement garden", { exact: true })).toBeVisible();
  await frame.getByRole("button", { name: "Rating and hours" }).click();
  await expect(frame.getByText("Google Maps · 4.6/5 · 9 AM–6 PM")).toBeVisible();
  await frame.getByRole("button", { name: "Swap this stop" }).click();
  await expect(frame.getByRole("status")).toHaveText("No verified alternative was available.");
  await expect(frame.getByText("Replacement garden", { exact: true })).toBeVisible();
  await frame.getByRole("button", { name: "View map" }).click();
  await frame.getByRole("button", { name: "Open in SproutRoute" }).click();
  // postMessage is delivered asynchronously after the click handler returns.
  await expect.poll(() => page.evaluate(() =>
    (window as any).messages.filter((event: any) => event.method === "ui/open-link").length
  )).toBe(2);
  const events = await page.evaluate(() => (window as any).messages);
  expect(events.filter((e: any) => e.params?.name === "set_stop_lock").map((e: any) => e.params.arguments)).toEqual(
    [true, false].map(locked => ({ job_id: "aaa", day: 2, place_id: "place-1", locked }))
  );
  expect(events.filter((e: any) => e.method === "ui/update-model-context").map((e: any) => e.params.structuredContent.days[1].stops[0].locked)).toContain(true);
  expect(events.some((e: any) => e.method === "ui/notifications/size-changed" && e.params.height > 0)).toBe(true);
  expect(events.find((e: any) => e.params?.name === "suggest_alternative").params.arguments).toEqual({ job_id: "aaa", day: 2, place_id: "place-1" });
  expect(events.filter((e: any) => e.method === "ui/update-model-context").at(-1).params.structuredContent.days[1].stops[0].name).toBe("Replacement garden");
  expect(events.filter((e: any) => e.method === "ui/open-link").map((e: any) => e.params.url)).toEqual([expect.stringMatching(/^https:\/\/www\.google\.com\/maps\/search\//), openUrl]);
  await page.evaluate(plan => (window as any).send({ method: "ui/notifications/tool-result", params: { structuredContent: { ...plan, open_url: "https://evil.test/" } } }), plan);
  await expect(frame.getByRole("button", { name: "Open in SproutRoute" })).toHaveCount(0);
  // A sibling frame has no authority over the itinerary.
  await page.evaluate(() => {
    const sibling = document.createElement("iframe");
    document.body.append(sibling);
    sibling.srcdoc = '<script>parent.frames[0].postMessage({jsonrpc:"2.0",method:"ui/notifications/tool-cancelled",params:{}}, "*")</script>';
  });
  await expect(frame.getByText("Waterfront", { exact: true })).toBeVisible();
  await page.evaluate(() => (window as any).send({ method: "ui/notifications/tool-result", params: { structuredContent: { schema_version: 1, status: "ready", job_id: "aaa", days: [null] } } }));
  await expect(frame.getByRole("status")).toHaveText("Read the itinerary in the tool response.");
  expect(errors).toEqual([]);
});
