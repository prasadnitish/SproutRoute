import { useEffect, useRef, useState } from "react";
import { getAccountClient, checked } from "../services/account.js";
import { trustedCallback } from "../services/oauthConsent.js";
import AccountPanel from "../components/AccountPanel.jsx";

const buttonClass = "min-h-12 rounded-lg px-5 py-2 font-semibold";

export default function OAuthConsent() {
  const authorizationId = new URLSearchParams(window.location.search).get(
    "authorization_id",
  );
  const [session, setSession] = useState(undefined);
  const [request, setRequest] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const userId =
    session?.user && !session.user.is_anonymous ? session.user.id : null;
  useEffect(() => {
    let active = true;
    let subscription;
    getAccountClient()
      .then((client) => {
        if (!active) return;
        subscription = client.auth.onAuthStateChange((_event, next) =>
          setSession(next),
        ).data.subscription;
      })
      .catch(() => {
        if (active)
          setError("Account sign-in is unavailable. Try again later.");
      });
    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    setRequest(null);
    if (!authorizationId || !userId) return;
    (async () => {
      const response = await fetch("/api/v1/social-save/oauth-clients", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      const { clients } = await response.json();
      const client = await getAccountClient();
      const data = checked(
        await client.auth.oauth.getAuthorizationDetails(authorizationId),
      );
      if (!active) return;
      if (data.redirect_url) {
        window.location.assign(
          trustedCallback(data.redirect_url, Object.values(clients)),
        );
        return;
      }
      if (
        data.user.id !== userId ||
        data.authorization_id !== authorizationId ||
        data.scope !== "openid" ||
        !Object.hasOwn(clients, data.client.id) ||
        data.redirect_uri !== clients[data.client.id]
      )
        throw new Error();
      setError("");
      setRequest(data);
    })().catch(() => {
      if (active)
        setError(
          "This connection request is unavailable. Start a new request from your connector.",
        );
    });
    return () => {
      active = false;
    };
  }, [authorizationId, userId]);

  async function decide(approve) {
    if (submitting.current || request?.user.id !== userId) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const client = await getAccountClient();
      const current = checked(await client.auth.getUser()).user;
      if (current.id !== userId) throw new Error();
      const method = approve ? "approveAuthorization" : "denyAuthorization";
      const result = checked(
        await client.auth.oauth[method](authorizationId, {
          skipBrowserRedirect: true,
        }),
      );
      window.location.assign(
        trustedCallback(result.redirect_url, [request.redirect_uri]),
      );
    } catch {
      setError(
        "We could not finish connecting. Start a new request from your connector.",
      );
      setBusy(false);
      submitting.current = false;
    }
  }

  return (
    <main className="mx-auto max-w-lg space-y-5 px-6 py-12">
      <h1 className="text-3xl font-bold">Connect your SproutRoute library</h1>
      {!authorizationId ? (
        <p>
          Open the SproutRoute connector in your assistant to start linking an
          account.
        </p>
      ) : !userId && session !== undefined ? (
        <>
          <p>Sign in to choose whether to share your library.</p>
          <AccountPanel />
        </>
      ) : request?.user.id === userId && request ? (
        <>
          <p>
            <strong>{request.client.name}</strong> is requesting access to your
            account
            {request.user.email && <> ({request.user.email})</>}.
          </p>
          <ul className="list-disc space-y-2 pl-6">
            <li>Read your saved trip names and confirmed places.</li>
            <li>
              Add links to your review inbox and request place extraction.
            </li>
          </ul>
          <p className="break-words">
            You will return to {new URL(request.redirect_uri).hostname}.
          </p>
          <form
            method="post"
            onSubmit={(event) => {
              event.preventDefault();
              void decide(true);
            }}
            className="flex flex-wrap gap-3"
          >
            <button
              type="submit"
              disabled={busy}
              className={buttonClass + " bg-green-800 text-white"}
            >
              Allow access
            </button>
            <button
              type="button"
              disabled={busy}
              className={buttonClass + " border"}
              onClick={() => decide(false)}
            >
              Deny access
            </button>
          </form>
        </>
      ) : (
        !error && <p role="status">Checking your connection request…</p>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
