import { test, expect } from "@playwright/test";

test("the parent can cancel deletion, then explicitly confirm a manual Apple revocation", async ({
  page,
}) => {
  const user = {
    id: "48ff35f8-0292-42bf-b680-40b9b83f8212",
    email: "parent@example.org",
    identities: [{ provider: "apple" }],
    app_metadata: { provider: "apple" },
    user_metadata: {},
    aud: "authenticated",
    role: "authenticated",
    created_at: new Date().toISOString(),
  };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const accessToken = [
    "eyJhbGciOiJIUzI1NiJ9",
    Buffer.from(JSON.stringify({ sub: user.id, exp })).toString("base64url"),
    "fixture",
  ].join(".");
  await page.addInitScript(
    (session) => {
      if (!sessionStorage.getItem("fixture-initialized")) {
        localStorage.setItem(
          "sb-localhost-auth-token",
          JSON.stringify(session),
        );
        sessionStorage.setItem("fixture-initialized", "1");
      }
    },
    {
      access_token: accessToken,
      refresh_token: "fixture",
      token_type: "bearer",
      expires_at: exp,
      expires_in: 3600,
      user,
    },
  );
  await page.route("**/api/v1/social-save/config", (route) =>
    route.fulfill({
      json: { url: "http://localhost:4173", key: "fixture-anon-key" },
    }),
  );
  await page.route("**/rest/v1/account_trips**", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/auth/v1/logout**", (route) =>
    route.fulfill({ status: 204 }),
  );
  const received: unknown[] = [];
  await page.route("**/api/v1/social-save/account", (route) => {
    expect(route.request().method()).toBe("DELETE");
    expect(route.request().headers().authorization).toBe(
      "Bearer " + accessToken,
    );
    received.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, manualAppleRevocation: true } });
  });
  await page.goto("/account");
  const open = page.getByRole("button", {
    name: "Delete account",
    exact: true,
  });
  await open.click();
  const dialog = page.getByRole("dialog", {
    name: "Permanently delete your account?",
  });
  await expect(
    dialog.getByRole("button", { name: "Keep account" }),
  ).toBeFocused();
  await dialog.getByRole("button", { name: "Keep account" }).click();
  await expect(dialog).toBeHidden();
  expect(received).toHaveLength(0);
  await open.click();
  await dialog
    .getByRole("checkbox", { name: "I’ll revoke Apple access manually" })
    .check();
  await expect(dialog.getByRole("link")).toHaveAttribute(
    "href",
    "https://support.apple.com/en-us/102571",
  );
  await dialog
    .getByRole("button", { name: "Permanently delete account" })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("sb-localhost-auth-token")),
    )
    .toBeNull();
  if (!(await page.getByRole("dialog").isVisible()))
    await page.getByRole("button", { name: "My account" }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to SproutRoute" }),
  ).toBeVisible();
  expect(received).toEqual([{ manualAppleRevocation: true }]);
});
