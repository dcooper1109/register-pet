#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import sys

root = Path.cwd()
page = root / "app/page.tsx"
checkout = root / "app/api/stripe/create-checkout-session/route.ts"
completion = root / "app/api/stripe/complete-registration/route.ts"
files = [page, checkout, completion]

for f in files:
    if not f.is_file():
        sys.exit(f"Missing {f}. Run from the register-pet root.")

original = {f: f.read_text() for f in files}
updated = dict(original)

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise ValueError(
            f"{label}: expected 1 match, found {count}; no files changed"
        )
    return text.replace(old, new, 1)

try:
    p = updated[page]
    marker = "memberEmail: addForm.memberEmail,"
    p = replace_once(
        p, marker,
        'authenticationMethod: googleVerifiedEmail ? "google" : "password",\n          ' + marker,
        "registration page checkout request"
    )
    updated[page] = p

    c = updated[checkout]

    # Parse the request before checking the Google cookie.
    c = replace_once(
        c,
        "    // Only the server-side, HttpOnly Redis identity can select Google registration.",
        "    const body = await request.json();\n"
        "    // Only the server-side, HttpOnly Redis identity can select Google registration.",
        "move request parsing before cookie lookup"
    )

    # Remove the old request parser, now redundant.
    parser = "    const body = await request.json();"
    first = c.find(parser)
    second = c.find(parser, first + len(parser))
    if first < 0 or second < 0:
        raise ValueError("Expected two request parsing anchors")
    c = c[:second] + c[second + len(parser):]

    # Ignore stale Google cookies for password registration.
    c = replace_once(
        c,
        "    if (googleCookie) {",
        '    if (googleCookie && body?.authenticationMethod === "google") {',
        "ignore stale Google cookie"
    )

    # Require a verified Google identity for Google checkout.
    marker = "    const {\n      subscriptionType,"
    c = replace_once(
        c, marker,
        """    const authenticationMethod = body?.authenticationMethod;
    if (authenticationMethod !== "google" && authenticationMethod !== "password") {
      return NextResponse.json(
        { success: false, message: "Invalid registration authentication method." },
        { status: 400 }
      );
    }
    if (authenticationMethod === "google" && !googleIdentity) {
      return NextResponse.json(
        { success: false, message: "Google verification expired. Please sign in with Google again." },
        { status: 403 }
      );
    }
    const {
      subscriptionType,""",
        "validate checkout authentication method"
    )

    # Extend browser binding from 1 hour to 24 hours.
    c = replace_once(
        c,
        "maxAge: 60 * 60,",
        "maxAge: 60 * 60 * 24,",
        "checkout cookie lifetime"
    )
    updated[checkout] = c

    # Verify existing completion security controls remain present.
    required = [
        "const boundToken = request.cookies.get(cookieName)?.value;",
        "pvr:google-checkout:${checkoutSessionId}",
    ]
    for needle in required:
        if needle not in updated[completion]:
            raise ValueError(f"Missing completion security control: {needle}")

    for needle in [
        "pvr:google-checkout:${session.id}",
        '...(googleIdentity ? { authenticationMethod: "google" } : {})',
    ]:
        if needle not in c:
            raise ValueError(f"Missing checkout security control: {needle}")

except ValueError as error:
    sys.exit(str(error))

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
for f in files:
    if updated[f] != original[f]:
        backup = f.with_name(f.name + ".before-edge-fix-" + stamp)
        backup.write_text(original[f])
        f.write_text(updated[f])
        print(f"Updated {f.relative_to(root)}; backup: {backup.name}")

print("Completed. Run: git diff --check && npm run build")
