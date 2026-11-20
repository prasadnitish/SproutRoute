import { useId, useRef, useState } from "react";
import { accountRequest, checked } from "../services/account.js";

const button =
  "rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-60";
const manualHelp = "https://support.apple.com/en-us/102571";
let appleSdk;
function loadApple() {
  if (window.AppleID) return Promise.resolve(window.AppleID);
  if (!appleSdk)
    appleSdk = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
      script.onload = () => resolve(window.AppleID);
      script.onerror = () => {
        script.remove();
        appleSdk = undefined;
        reject(new Error("Apple authorization is unavailable."));
      };
      document.head.append(script);
    });
  return appleSdk;
}
const linkedApple = (user) =>
  user?.identities?.some((identity) => identity.provider === "apple");

export async function getAppleRevocationProof(user) {
  if (!linkedApple(user)) return {};
  const clientId = import.meta.env.VITE_APPLE_SERVICES_ID;
  const redirectURI = import.meta.env.VITE_APPLE_REDIRECT_URI;
  if (!clientId || !redirectURI)
    throw new Error("Apple authorization is unavailable.");
  const apple = await loadApple();
  const state = crypto.randomUUID();
  apple.auth.init({ clientId, redirectURI, state, usePopup: true });
  const response = await apple.auth.signIn();
  if (!response?.authorization?.code || response.authorization.state !== state)
    throw new Error("Apple authorization did not finish.");
  return {
    appleClientId: clientId,
    appleAuthorizationCode: response.authorization.code,
  };
}

export default function AccountDeletion({ client, user, onDeleted }) {
  const dialog = useRef(null);
  const heading = useId();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [manual, setManual] = useState(false);
  const apple = linkedApple(user);

  function open() {
    setMessage("");
    setSent(false);
    setCode("");
    setManual(false);
    dialog.current.showModal();
    if (apple && import.meta.env.VITE_APPLE_SERVICES_ID)
      loadApple().catch(() => {});
  }
  async function run(action) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(error.message || "Authorization did not finish. Try again.");
    } finally {
      setBusy(false);
    }
  }
  async function erase() {
    const proof = manual
      ? { manualAppleRevocation: true }
      : await getAppleRevocationProof(user);
    const { session } = checked(await client.auth.getSession());
    if (session?.user?.id !== user.id)
      throw new Error("Sign in to this account again.");
    await accountRequest("/api/v1/social-save/account", session, {
      method: "DELETE",
      body: JSON.stringify(proof),
    });
    dialog.current?.close();
    // Auth may already have removed the session remotely. Clear this client either way.
    try {
      await client.auth.signOut({ scope: "local" });
    } finally {
      onDeleted();
    }
  }

  return (
    <>
      <button type="button" className={button + " text-red-800"} onClick={open}>
        Delete account
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={heading}
        className="ph-no-capture w-[min(94vw,28rem)] space-y-3 rounded-2xl p-5 shadow-xl overscroll-contain backdrop:bg-black/50 backdrop:overflow-hidden backdrop:overscroll-contain"
      >
        <h3 id={heading} className="text-lg font-bold">
          Permanently delete your account?
        </h3>
        <p>
          This removes your saved trips, family profiles, and Social Save
          library. You cannot undo this.
        </p>
        <form method="dialog">
          <button autoFocus className={button} disabled={busy}>
            Keep account
          </button>
        </form>
        {apple && (
          <div className="space-y-1">
            <p>Apple will ask you to authorize revocation.</p>
            <label className="block">
              <input
                type="checkbox"
                checked={manual}
                disabled={busy}
                onChange={(e) => setManual(e.target.checked)}
              />{" "}
              I’ll revoke Apple access manually
            </label>
            {manual && (
              <a
                className="underline"
                href={manualHelp}
                target="_blank"
                rel="noreferrer"
              >
                Open Apple’s instructions for revoking access
              </a>
            )}
          </div>
        )}
        {user.email && (
          <div className="space-y-2">
            <p className="text-sm">
              Signed in more than five minutes ago? Verify your email first.
            </p>
            {!sent ? (
              <button
                type="button"
                className={button}
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    checked(
                      await client.auth.signInWithOtp({
                        email: user.email,
                        options: { shouldCreateUser: false },
                      }),
                    );
                    setSent(true);
                    setMessage("Check your email for the verification code.");
                  })
                }
              >
                Send verification code
              </button>
            ) : (
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(async () => {
                    const { user: verified } = checked(
                      await client.auth.verifyOtp({
                        email: user.email,
                        token: code,
                        type: "email",
                      }),
                    );
                    if (verified?.id !== user.id)
                      throw new Error("Verify the same account.");
                    setSent(false);
                    setCode("");
                    setMessage(
                      "Identity verified. You can now confirm deletion.",
                    );
                  });
                }}
              >
                <label className="block">
                  Verification code
                  <input
                    className="ml-2 rounded border p-1"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    required
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </label>
                <button className={button} disabled={busy}>
                  Verify code
                </button>
              </form>
            )}
          </div>
        )}
        <p role="status">{message}</p>
        <button
          type="button"
          className={button + " bg-red-700 text-white"}
          disabled={busy || sent}
          onClick={() => run(erase)}
        >
          {busy ? "Working…" : "Permanently delete account"}
        </button>
      </dialog>
    </>
  );
}
