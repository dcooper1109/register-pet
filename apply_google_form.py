from pathlib import Path
p=Path.home()/ 'projects/register-pet/app/page.tsx'
s=p.read_text()
if 'googleHandoffPending' in s:
    raise SystemExit('Google form integration already present; no changes made.')
def replace_once(old,new):
    global s
    n=s.count(old)
    if n!=1: raise SystemExit(f'Expected one matching anchor, found {n}: {old[:90]!r}. No file changed.')
    s=s.replace(old,new,1)
replace_once('import { useEffect, useState } from "react";', 'import { useEffect, useRef, useState } from "react";')
replace_once('  const [draftUnavailable, setDraftUnavailable] = useState(false);', '''  const [draftUnavailable, setDraftUnavailable] = useState(false);
  const [googleHandoffPending, setGoogleHandoffPending] = useState(false);
  const [googleVerifiedEmail, setGoogleVerifiedEmail] = useState("");
  const [googleHandoffError, setGoogleHandoffError] = useState("");
  const googleRedeemStarted = useRef(false);''')
replace_once('  useEffect(() => {\n    const params = new URLSearchParams(window.location.search);', '''  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("google_handoff");
    if (!code || googleRedeemStarted.current) return;
    googleRedeemStarted.current = true;
    // Remove the one-time code from history and subsequent referrers immediately.
    url.searchParams.delete("google_handoff");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    setGoogleHandoffPending(true);
    setGoogleHandoffError("");
    void (async () => {
      try {
        const response = await fetch("/api/google-registration/redeem", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const data = await response.json();
        if (!response.ok || data?.success !== true ||
            data?.authenticationMethod !== "google" ||
            typeof data?.email !== "string" || !data.email.includes("@")) {
          throw new Error(data?.message || "Unable to verify your Google account.");
        }
        const email = data.email.trim().toLowerCase();
        setGoogleVerifiedEmail(email);
        setAddForm(prev => ({ ...prev, memberEmail: email }));
        setResult("Google account verified. Complete your membership information below.");
        setIsError(false);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Google verification failed.";
        setGoogleHandoffError(message);
        setResult(message);
        setIsError(true);
      } finally {
        setGoogleHandoffPending(false);
      }
    })();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);''')
replace_once('  const submitDisabled = isSubmitting || !termsAccepted || draftUnavailable;', '''  // Google checkout remains blocked until server-side Dataverse/Stripe binding is implemented.
  const submitDisabled = isSubmitting || !termsAccepted || draftUnavailable ||
    googleHandoffPending || Boolean(googleVerifiedEmail);''')
replace_once('            <h3 style={subSectionTitleStyle}>Enrollee Information</h3>', '''            <h3 style={subSectionTitleStyle}>Enrollee Information</h3>
            {addForm.partnerName === "Direct Registration" && !isEmbedded && (
              <div style={{ marginBottom: 18 }}>
                <button type="button" style={secondaryButtonStyle}
                  disabled={googleHandoffPending || isSubmitting}
                  onClick={() => window.location.assign("/api/google-registration/start")}>
                  {googleHandoffPending ? "Verifying Google account..." : "Continue with Google"}
                </button>
                {googleVerifiedEmail && (
                  <p role="status" style={{ color: "#047857", fontWeight: 700 }}>
                    Google verified: {googleVerifiedEmail}
                  </p>
                )}
                {googleHandoffError && (
                  <p role="alert" style={{ color: "#b42318" }}>{googleHandoffError}</p>
                )}
                {googleVerifiedEmail && (
                  <p style={helperTextStyle}>
                    Google verification is ready. Checkout for Google accounts is temporarily disabled
                    until the server-side account linking is completed.
                  </p>
                )}
              </div>
            )}''')
replace_once('              label="Member Email"\n              value={addForm.memberEmail}', '              label="Member Email"\n              readOnly={Boolean(googleVerifiedEmail)}\n              value={addForm.memberEmail}')
# Prevent submission through other call paths while Google identity exists.
replace_once('  async function runAction(action: string) {\n    if (!validate(action)) return;', '''  async function runAction(action: string) {
    if (googleHandoffPending || googleVerifiedEmail) {
      setIsError(true);
      setResult("Google checkout is not yet enabled. Account linking must be completed first.");
      return;
    }
    if (!validate(action)) return;''')
p.write_text(s)
print(f'Updated {p} ({len(s.splitlines())} lines)')
