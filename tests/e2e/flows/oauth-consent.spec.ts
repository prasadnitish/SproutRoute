import { expect, test } from "@playwright/test";

for (const action of ["approve", "deny"] as const) {
  test(`a signed-in owner can ${action} a registered connector`, async ({
    page,
  }) => {
    const owner = "3dd46340-7a0b-40b5-9db9-fa63ec6268bb";
    const client = "90ff5ff7-7e40-4c69-993a-9aba987ecfe8";
    const authorization = "24b5f01e-e78f-41fe-8a2b-0fe4977419c8";
    const provider = "https://oauth-fixture.example";
    const callback = "https://assistant.example/connector-return";
    const user = { id: owner, email: "owner@example.com", is_anonymous: false };
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const encode = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const accessToken = [
      encode({ alg: "HS256", typ: "JWT" }),
      encode({ sub: owner, exp }),
      "fixture",
    ].join(".");
    await page.addInitScript(
      (session) => {
        localStorage.setItem(
          "sb-oauth-fixture-auth-token",
          JSON.stringify(session),
        );
      },
      {
        user,
        access_token: accessToken,
        refresh_token: "fixture",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: exp,
      },
    );
    await page.route("**/api/v1/social-save/config", (route) =>
      route.fulfill({ json: { url: provider, key: "fixture-public-key" } }),
    );
    await page.route("**/api/v1/social-save/oauth-clients", (route) =>
      route.fulfill({ json: { clients: { [client]: callback } } }),
    );
    await page.route(provider + "/auth/v1/user", (route) =>
      route.fulfill({ json: user }),
    );
    await page.route(
      provider + "/auth/v1/oauth/authorizations/" + authorization,
      (route) =>
        route.fulfill({
          json: {
            authorization_id: authorization,
            user,
            client: { id: client, name: "Assistant fixture" },
            scope: "openid",
            redirect_uri: callback,
          },
        }),
    );
    const consentCalls: string[] = [];
    await page.route(
      provider + "/auth/v1/oauth/authorizations/" + authorization + "/consent",
      (route) => {
        consentCalls.push(route.request().postDataJSON().action);
        return route.fulfill({
          json: {
            redirect_url:
              callback +
              (action === "approve" ? "?code=fixture" : "?error=access_denied"),
          },
        });
      },
    );
    await page.route(callback + "**", (route) =>
      route.fulfill({ body: "Back in assistant" }),
    );
    await page.goto("/oauth/consent?authorization_id=" + authorization);
    await expect(
      page.getByText("Assistant fixture", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/owner@example.com/)).toBeVisible();
    expect(consentCalls).toEqual([]);
    await page
      .getByRole("button", {
        name: action === "approve" ? "Allow access" : "Deny access",
      })
      .click();
    await expect(page).toHaveURL(
      new RegExp("^https://assistant\\.example/connector-return\\?"),
    );
    expect(consentCalls).toEqual([action]);
  });
}
