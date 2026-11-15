// Features the website shares with the iOS app: AI data consent, the children's ages
// question, per-stop editing, calendar export and the problem report link.
import { test, expect } from "@playwright/test";
import { mockAllApis, goToResults } from "../fixtures/mock-api";
import { MOCK_PARSED_INPUT } from "../fixtures/trip-data";

const submit = async (page, text = "Beach vacation in Maui with the kids") => {
  await page.goto("/");
  await page.locator("textarea").fill(text);
  await page.getByRole("button", { name: /plan it/i }).click();
};

test.describe("AI data consent", () => {
  test("nothing is sent until the visitor agrees, and the answer is remembered", async ({ page }) => {
    await mockAllApis(page, { aiConsent: false });
    let parseCalls = 0;
    await page.route("**/api/v1/trip/parse-input", (r) => {
      parseCalls += 1;
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_PARSED_INPUT) });
    });

    await submit(page);
    const sheet = page.getByRole("dialog", { name: "Before we plan" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText("Your children's ages")).toBeVisible();
    await expect(sheet.getByRole("link", { name: /Anthropic/ })).toBeVisible();
    expect(parseCalls).toBe(0);

    await sheet.getByRole("button", { name: "Not now" }).click();
    await expect(sheet).toBeHidden();
    expect(parseCalls).toBe(0);

    await page.getByRole("button", { name: /plan it/i }).click();
    await page.getByRole("button", { name: "Agree and continue" }).click();
    await page.getByRole("heading", { name: /Maui, Hawaii/i, level: 2 }).waitFor({ timeout: 15000 });
    expect(parseCalls).toBe(1);

    await page.reload();
    await page.locator("textarea").fill("Another trip to Maui");
    await page.getByRole("button", { name: /plan it/i }).click();
    await page.getByRole("heading", { name: /Maui, Hawaii/i, level: 2 }).waitFor({ timeout: 15000 });
    await expect(page.getByRole("dialog", { name: "Before we plan" })).toBeHidden();
  });

  test("consent can be withdrawn from the home screen", async ({ page }) => {
    await mockAllApis(page);
    await page.goto("/");
    await page.getByRole("button", { name: "AI data choices" }).click();
    await page.getByRole("button", { name: "Withdraw consent" }).click();
    expect(await page.evaluate(() => localStorage.getItem("sproutroute.aiConsent.acceptedVersion"))).toBeNull();
  });
});

test.describe("children's ages question", () => {
  const guessed = { ...MOCK_PARSED_INPUT, childrenAges: [5], childrenAgesAssumed: true };

  const mockGuessedAges = async (page) => {
    await mockAllApis(page);
    await page.route("**/api/v1/trip/parse-input", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(guessed) }));
    const seen = { stream: [] as any[], carSeat: [] as any[] };
    page.on("request", (request) => {
      if (request.url().includes("/api/v1/trip/stream")) seen.stream.push(request.postDataJSON());
      if (request.url().includes("/api/safety/car-seat-check")) seen.carSeat.push(request.postDataJSON());
    });
    return seen;
  };

  test("asks before planning, and plans with the ages the parent chose", async ({ page }) => {
    const seen = await mockGuessedAges(page);
    await submit(page);

    await expect(page.getByRole("heading", { name: "How old are your children?" })).toBeVisible();
    expect(seen.stream).toHaveLength(0);
    const next = page.getByRole("button", { name: "Continue" });
    await expect(next).toBeDisabled();

    await page.getByLabel("Child 1", { exact: true }).selectOption("2");
    await page.getByRole("button", { name: "Add a child" }).click();
    await page.getByLabel("Child 2", { exact: true }).selectOption("9");
    await next.click();

    await page.getByRole("heading", { name: /Maui, Hawaii/i, level: 2 }).waitFor({ timeout: 15000 });
    expect(seen.stream[0].childrenAges).toEqual([2, 9]);
    await expect.poll(() => seen.carSeat.length).toBe(1);
    expect(seen.carSeat[0].children).toEqual([{ age: 2 }, { age: 9 }]);
    await expect(page.getByText(/2 kids, ages 2 & 9/)).toBeVisible();
  });

  test("skipping plans the trip without car seat guidance and without showing the guess", async ({ page }) => {
    const seen = await mockGuessedAges(page);
    await submit(page);
    await page.getByRole("button", { name: /Skip\. Plan without car seat guidance/ }).click();

    await page.getByRole("heading", { name: /Maui, Hawaii/i, level: 2 }).waitFor({ timeout: 15000 });
    await expect(page.getByText(/1 kid\b/)).toBeVisible();
    await expect(page.getByText(/age 5/)).toHaveCount(0);
    await page.getByRole("button", { name: /Safety/ }).first().click();
    await expect(page.getByText(/No car seat guidance, because the children.s ages weren.t given/)).toBeVisible();
    expect(seen.carSeat).toHaveLength(0);
  });

  test("stated ages are not asked about", async ({ page }) => {
    await mockAllApis(page);
    await goToResults(page);
    await expect(page.getByRole("heading", { name: "How old are your children?" })).toHaveCount(0);
  });
});

test.describe("editing the plan", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await goToResults(page);
  });

  test("a stop can be removed and the change undone", async ({ page }) => {
    await page.getByRole("button", { name: "Edit Road to Hana" }).click();
    await page.getByRole("menuitem", { name: "Remove from plan" }).click();
    await expect(page.getByRole("button", { name: "View details for Road to Hana" })).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveText("Road to Hana removed from the plan.");

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("button", { name: "View details for Road to Hana" })).toBeVisible();
  });

  test("a stop can be moved to another day", async ({ page }) => {
    await page.getByRole("button", { name: "Edit Road to Hana" }).click();
    await page.getByRole("menuitem", { name: "Move to another day" }).click();
    await page.getByRole("menuitem", { name: /Day 2/ }).click();
    await expect(page.getByRole("button", { name: "View details for Road to Hana" })).toHaveCount(0);

    await page.getByRole("button", { name: /Mon, Apr 13/i }).click();
    await expect(page.getByRole("button", { name: "View details for Road to Hana" })).toBeVisible();

    await page.getByRole("button", { name: "Back to original plan" }).click();
    await expect(page.getByRole("button", { name: "View details for Road to Hana" })).toHaveCount(0);
    await page.getByRole("button", { name: /Sun, Apr 12/i }).click();
    await expect(page.getByRole("button", { name: "View details for Road to Hana" })).toBeVisible();
  });

  test("the traveler can add their own block after a stop", async ({ page }) => {
    await page.getByRole("button", { name: "Edit Road to Hana" }).click();
    await page.getByRole("menuitem", { name: "Add block after" }).click();
    await page.getByLabel("Add your own block after Road to Hana").fill("Nap at the hotel");
    await page.getByRole("button", { name: "Add block" }).click();
    await expect(page.getByText("Nap at the hotel").first()).toBeVisible();
    await expect(page.getByText("5:00 PM").first()).toBeVisible();
  });
});

test.describe("calendar and problem report", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await goToResults(page);
  });

  test("Add to calendar downloads an .ics file with the stops", async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Add to calendar" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("sproutroute-maui-hawaii.ics");
    const stream = await download.createReadStream();
    let ics = "";
    for await (const chunk of stream) ics += chunk.toString();
    expect(ics).toContain("SUMMARY:Road to Hana");
    expect(ics).toContain("DTSTART:20260412T090000");
  });

  test("the report link opens an email about this trip", async ({ page }) => {
    const href = await page.getByRole("link", { name: "Report a problem with this plan" }).getAttribute("href");
    expect(href).toMatch(/^mailto:feedback@sproutroute\.com\?subject=/);
    expect(decodeURIComponent(href!)).toContain("Maui, Hawaii (2026-04-12 to 2026-04-19)");
  });
});
