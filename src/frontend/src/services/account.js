let client;
let pendingClient;

export async function getAccountClient() {
  if (client) return client;
  pendingClient ??= (async () => {
    const response = await fetch("/api/v1/social-save/config", {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Sign-in is temporarily unavailable.");
    const { url, key } = await response.json();
    const { createClient } = await import("@supabase/supabase-js");
    client = createClient(url, key, { auth: { flowType: "pkce" } });
    return client;
  })().finally(() => {
    pendingClient = null;
  });
  return pendingClient;
}

export function checked(result) {
  if (result.error) throw result.error;
  return result.data;
}

export async function listAccountTrips(client, userId, offset = 0) {
  return checked(
    await client
      .from("account_trips")
      .select("id,destination,updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .order("id")
      .range(offset, offset + 24),
  );
}

export async function accountRequest(path, session, options = {}) {
  const response = await fetch(path, {
    ...options,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.message || data.error || "Account request failed.");
  return data;
}
