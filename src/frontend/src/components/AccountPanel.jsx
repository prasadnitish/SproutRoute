import { useEffect, useRef, useState } from "react";
import {
  accountRequest,
  checked,
  getAccountClient,
  listAccountTrips,
} from "../services/account.js";
import {
  accountTripDraft,
  clearTripDraft,
  readTripDraft,
  stageTripDraft,
} from "../utils/accountTrip.js";
import AccountDeletion, {
  getAppleRevocationProof,
} from "./AccountDeletion.jsx";

const button =
  "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60";
const input =
  "block w-full rounded-lg border border-gray-400 bg-white p-2 text-gray-900";
const title = "text-lg font-bold text-gray-900";
const providers = ["google", "apple"];
const providerName = (provider) =>
  provider[0].toUpperCase() + provider.slice(1);

function signInFeedback(code) {
  if (
    ["identity_already_exists", "email_exists", "user_already_exists"].includes(
      code,
    )
  ) {
    return "This sign-in already belongs to another account. Sign in to the account you want to keep and choose Merge an existing account.";
  }
  return code ? "Sign-in did not finish. Try again, or use an email code." : "";
}

export default function AccountPanel({
  tripData,
  tripId,
  onOpenTrip,
  profile,
  onProfile,
  initiallyOpen = false,
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [client, setClient] = useState(null);
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(() => {
    if (window.location.pathname !== "/account") return "";
    const callback = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    return signInFeedback(
      callback.get("error_code") ||
        query.get("error_code") ||
        callback.get("error") ||
        query.get("error"),
    );
  });
  const [draft, setDraft] = useState(() => readTripDraft());
  const [rows, setRows] = useState([]);
  const [more, setMore] = useState(false);
  const [merge, setMerge] = useState(false);
  const [generation, setGeneration] = useState(0);
  const dialog = useRef(null);
  const newId = useRef(null);
  const user = session?.user;
  const accountId = user?.is_anonymous ? null : user?.id;
  const redirectTo =
    window.location.pathname === "/oauth/consent"
      ? window.location.origin +
        window.location.pathname +
        window.location.search
      : window.location.origin + "/account";
  const previousAccount = useRef(null);

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    element?.showModal();
    let active = true;
    getAccountClient()
      .then((sdk) => {
        if (active) setClient(sdk);
      })
      .catch((err) => {
        if (active) setStatus(err.message);
      });
    return () => {
      active = false;
      element?.close();
    };
  }, [open]);

  useEffect(() => {
    if (!client) return;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, next) => {
      const nextId = next?.user?.id;
      if (previousAccount.current && nextId !== previousAccount.current) {
        // Drop all in-memory private views when this or another tab changes accounts.
        clearTripDraft();
        window.location.replace("/");
        return;
      }
      previousAccount.current = nextId || null;
      setSession(next);
    });
    return () => subscription.unsubscribe();
  }, [client]);

  useEffect(() => {
    let current = true;
    setRows([]);
    setMore(false);
    setMerge(false);
    if (open && accountId && client)
      listAccountTrips(client, accountId)
        .then((page) => {
          if (current) {
            setRows(page);
            setMore(page.length === 25);
          }
        })
        .catch((err) => {
          if (current) setStatus(err.message);
        });
    return () => {
      current = false;
    };
  }, [client, accountId, open, generation]);

  useEffect(() => {
    if (
      !client ||
      !accountId ||
      !onOpenTrip ||
      location.pathname !== "/account"
    )
      return;
    const id = new URLSearchParams(location.search).get("trip");
    if (!id || !/^[a-f0-9-]{36}$/i.test(id)) return;
    let active = true;
    client
      .from("account_trips")
      .select("id,snapshot")
      .eq("user_id", accountId)
      .eq("id", id)
      .single()
      .then((result) => {
        if (!active) return;
        const row = checked(result);
        history.replaceState({}, "", "/account");
        onOpenTrip(row);
        close();
      })
      .catch((err) => {
        if (active) setStatus(err.message);
      });
    return () => {
      active = false;
    };
  }, [client, accountId, onOpenTrip]);

  async function run(action) {
    if (busy) return;
    setBusy(true);
    setStatus("");
    try {
      await action();
    } catch (err) {
      setStatus(signInFeedback(err.code) || err.message || "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  function show() {
    try {
      if (tripData) {
        newId.current ??= crypto.randomUUID();
        const next = accountTripDraft(tripData, tripId || newId.current);
        stageTripDraft(next);
        setDraft(next);
      } else setDraft(readTripDraft());
      setStatus("");
    } catch (err) {
      setStatus(err.message);
    }
    setOpen(true);
  }
  function close() {
    dialog.current?.close();
    setOpen(false);
  }
  function clearPending() {
    clearTripDraft();
    setDraft(null);
  }
  async function save() {
    checked(
      await client.from("account_trips").upsert(
        {
          ...draft,
          user_id: accountId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,id" },
      ),
    );
    clearPending();
    setGeneration((x) => x + 1);
    setStatus("Trip saved to your account.");
  }
  async function providerSignIn(provider) {
    const options = { provider, options: { redirectTo } };
    checked(
      await (accountId
        ? client.auth.linkIdentity(options)
        : client.auth.signInWithOAuth(options)),
    );
  }
  async function openSaved(id) {
    const row = checked(
      await client
        .from("account_trips")
        .select("id,snapshot")
        .eq("user_id", accountId)
        .eq("id", id)
        .single(),
    );
    if (!row?.snapshot?.tripData)
      throw new Error("This saved itinerary is unavailable.");
    if (onOpenTrip) {
      onOpenTrip(row);
      close();
    } else window.location.assign("/account?trip=" + encodeURIComponent(id));
  }

  return (
    <>
      <button type="button" className={button} onClick={show}>
        {tripData ? "Save trip" : "My account"}
      </button>
      {open && (
        <dialog
          ref={dialog}
          onCancel={close}
          aria-label="SproutRoute account"
          className="ph-no-capture max-h-[90dvh] w-[min(94vw,32rem)] overflow-auto rounded-2xl p-5 shadow-xl backdrop:bg-black/40"
        >
          <div className="flex items-center justify-between gap-4">
            <h2 className={title}>
              {accountId ? "My account" : "Sign in to SproutRoute"}
            </h2>
            <button type="button" className={button} onClick={close}>
              Close
            </button>
          </div>
          {status && (
            <p className="mt-3 text-sm" role="status">
              {status}
            </p>
          )}
          {draft && (
            <div className="my-3 rounded-xl bg-meadow-50 p-3">
              <p className="font-semibold">{draft.destination}</p>
              {accountId ? (
                <button
                  className={button}
                  disabled={busy}
                  onClick={() => run(save)}
                >
                  Save to this account
                </button>
              ) : (
                <p className="text-sm">
                  Sign in to keep this itinerary. Your trip is ready to save
                  after sign-in.
                </p>
              )}
              <button
                type="button"
                className="ml-2 text-sm underline"
                onClick={clearPending}
              >
                Dismiss
              </button>
            </div>
          )}
          {!client ? (
            <p role="status">Connecting to your account…</p>
          ) : !accountId ? (
            <div className="mt-4 space-y-3">
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(async () => {
                    if (sent) {
                      checked(
                        await client.auth.verifyOtp({
                          email,
                          token: code,
                          type: "email",
                        }),
                      );
                      setSent(false);
                      setCode("");
                    } else {
                      checked(
                        await client.auth.signInWithOtp({
                          email,
                          options: { emailRedirectTo: redirectTo },
                        }),
                      );
                      setSent(true);
                      setStatus("Check your email for a six-digit code.");
                    }
                  });
                }}
              >
                <label className="block">
                  Email address
                  <input
                    className={input}
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    readOnly={sent}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                {sent && (
                  <label className="block">
                    Verification code
                    <input
                      className={input}
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </label>
                )}
                <button type="submit" disabled={busy} className={button}>
                  {sent ? "Verify code" : "Email me a code"}
                </button>
                {sent && (
                  <button
                    type="button"
                    className={button}
                    onClick={() => {
                      setSent(false);
                      setCode("");
                    }}
                  >
                    Change email or resend
                  </button>
                )}
              </form>
              {providers.map((p) => (
                <button
                  key={p}
                  className={button + " block w-full"}
                  disabled={busy}
                  onClick={() => run(() => providerSignIn(p))}
                >
                  Continue with {providerName(p)}
                </button>
              ))}
            </div>
          ) : (
            <div key={accountId} className="mt-3 space-y-5">
              <p>{user.email}</p>
              <section>
                <h3 className={title}>Saved trips</h3>
                {!rows.length && <p className="text-sm">No trips loaded.</p>}
                <ul>
                  {rows.map((row) => (
                    <li key={row.id}>
                      <button
                        className="py-2 text-meadow-700 underline"
                        onClick={() => run(() => openSaved(row.id))}
                      >
                        {row.destination}
                      </button>
                    </li>
                  ))}
                </ul>
                {more && (
                  <button
                    className={button}
                    onClick={() =>
                      run(async () => {
                        const page = await listAccountTrips(
                          client,
                          accountId,
                          rows.length,
                        );
                        setRows([...rows, ...page]);
                        setMore(page.length === 25);
                      })
                    }
                  >
                    Load more trips
                  </button>
                )}
              </section>
              {onProfile && (
                <section>
                  <h3 className={title}>Family profile</h3>
                  <button
                    className={button}
                    onClick={() =>
                      run(async () => {
                        const data = await accountRequest(
                          "/api/v1/profile/me",
                          session,
                        );
                        if (data.profile) {
                          onProfile(data.profile);
                          setStatus("Family profile loaded for planning.");
                        } else setStatus("No family profile saved.");
                      })
                    }
                  >
                    Load account profile
                  </button>
                  {profile && (
                    <button
                      className={button}
                      onClick={() =>
                        run(async () => {
                          await accountRequest("/api/v1/profile/me", session, {
                            method: "PUT",
                            body: JSON.stringify({ profile }),
                          });
                          setStatus("Family profile saved.");
                        })
                      }
                    >
                      Save current profile
                    </button>
                  )}
                </section>
              )}
              <section>
                <h3 className={title}>Connected accounts</h3>
                <p>
                  {(user.identities || [])
                    .map((i) => providerName(i.provider))
                    .join(", ") || "Signed in"}
                </p>
                {providers
                  .filter(
                    (p) => !user.identities?.some((i) => i.provider === p),
                  )
                  .map((p) => (
                    <button
                      key={p}
                      className={button}
                      disabled={busy}
                      onClick={() => run(() => providerSignIn(p))}
                    >
                      Connect {providerName(p)}
                    </button>
                  ))}
                <button className={button} onClick={() => setMerge(!merge)}>
                  Merge an existing account
                </button>
                {merge && (
                  <MergeAccount
                    session={session}
                    onMerged={() => {
                      setGeneration((x) => x + 1);
                      setStatus("Accounts merged.");
                    }}
                  />
                )}
              </section>
              <button
                className={button}
                onClick={() =>
                  run(async () => {
                    checked(await client.auth.signOut({ scope: "local" }));
                    clearPending();
                    setEmail("");
                    setCode("");
                    setStatus("Signed out.");
                  })
                }
              >
                Sign out
              </button>
              <AccountDeletion
                client={client}
                user={user}
                onDeleted={() => {
                  clearPending();
                  setSession(null);
                  setRows([]);
                }}
              />
            </div>
          )}
        </dialog>
      )}
    </>
  );
}

function MergeAccount({ session, onMerged }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [source, setSource] = useState(null);
  const [verified, setVerified] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (!source) {
        const config = await fetch("/api/v1/social-save/config").then((r) =>
          r.json(),
        );
        const { createClient } = await import("@supabase/supabase-js");
        const other = createClient(config.url, config.key, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
            storageKey: "sprout-merge-source",
          },
        });
        checked(
          await other.auth.signInWithOtp({
            email,
            options: { shouldCreateUser: false },
          }),
        );
        setSource(other);
      } else if (!verified) {
        const { session: proof } = checked(
          await source.auth.verifyOtp({ email, token: code, type: "email" }),
        );
        if (proof.user.id === session.user.id)
          throw new Error("Choose the other account.");
        setVerified(proof);
      } else {
        const appleProof = await getAppleRevocationProof(verified.user);
        await accountRequest("/api/v1/social-save/account/merge", session, {
          method: "POST",
          body: JSON.stringify({
            sourceAccessToken: verified.access_token,
            confirm: true,
            ...appleProof,
          }),
        });
        onMerged();
      }
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="mt-3 space-y-2" onSubmit={submit}>
      <p>
        Move saved data into {session.user.email} and delete the other account.
        Sign in to this account again if your session is older than five
        minutes.
      </p>
      <label className="block">
        Other account email
        <input
          className={input}
          type="email"
          autoComplete="email"
          required
          readOnly={!!source}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      {source && !verified && (
        <label className="block">
          Other account code
          <input
            className={input}
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            pattern="[0-9]{6}"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
      )}
      <button className={button} disabled={busy}>
        {verified
          ? "Confirm merge and delete other account"
          : source
            ? "Verify other account"
            : "Send verification code"}
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
