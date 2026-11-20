import { test, expect } from "@playwright/test";

test("a handoff survives sign-in and saves only after the parent confirms the destination account", async ({
  page,
}) => {
  const token = "x".repeat(43);
  const tripData = {
    trip: {
      destination: "Seattle",
      startDate: "2027-05-01",
      endDate: "2027-05-01",
    },
    parsed: { destination: "Seattle" },
    scheduledItinerary: [
      {
        day: "Day 1",
        date: "2027-05-01",
        scheduled: [{ name: "Discovery Park", id: "park", duration: 60 }],
      },
    ],
    tripPlan: { dailyItinerary: [], suggestedActivities: [] },
  };
  const user = {
    id: "5fd90167-15cb-4467-b91c-81ccbd5de551",
    email: "parent@example.com",
    is_anonymous: false,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "email" },
    user_metadata: {},
    identities: [{ provider: "email" }],
    created_at: new Date().toISOString(),
  };
  const access = [
    "eyJhbGciOiJIUzI1NiJ9",
    Buffer.from(
      JSON.stringify({
        sub: user.id,
        exp: Math.floor(Date.now() / 1000) + 3600,
        role: "authenticated",
      }),
    ).toString("base64url"),
    "fake",
  ].join(".");
  let saved: any;
  await page.route("**/api/v1/mcp/itinerary/view", (route) => {
    expect(route.request().headers()["x-trip-share-token"]).toEqual(token);
    return route.fulfill({
      json: {
        snapshot: { schemaVersion: 1, tripData },
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      },
    });
  });
  await page.route("**/api/v1/social-save/config", (route) =>
    route.fulfill({
      json: { url: "http://localhost:4173", key: "public-test-key" },
    }),
  );
  await page.route("**/auth/v1/otp**", (route) => route.fulfill({ json: {} }));
  await page.route("**/auth/v1/verify**", (route) =>
    route.fulfill({
      json: {
        user,
        access_token: access,
        refresh_token: "test-refresh",
        expires_in: 3600,
        token_type: "bearer",
      },
    }),
  );
  await page.route("**/rest/v1/account_trips**", (route) => {
    if (route.request().method() === "POST") {
      saved = route.request().postDataJSON();
      return route.fulfill({ status: 201, body: "" });
    }
    const single = route.request().headers().accept?.includes("object");
    return route.fulfill({
      json: single
        ? saved
        : saved
          ? [{ id: saved.id, destination: saved.destination }]
          : [],
    });
  });
  await page.goto("/s#mcp=" + token);
  await page.getByRole("button", { name: "Save trip", exact: true }).click();
  await page.getByLabel("Email address").fill(user.email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("Verification code").fill("123456");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(
    page.getByRole("button", { name: "Save to this account" }),
  ).toBeVisible();
  expect(saved).toBeUndefined();
  await page.goto("/account");
  await page.getByRole("button", { name: "Save to this account" }).click();
  await expect(page.getByText("Trip saved to your account.")).toBeVisible();
  expect(saved.user_id).toBe(user.id);
  expect(saved.snapshot.tripData.scheduledItinerary[0].scheduled[0].id).toBe(
    "park",
  );
  await page.getByRole("button", { name: "Seattle", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save trip", exact: true }),
  ).toBeVisible();
});
