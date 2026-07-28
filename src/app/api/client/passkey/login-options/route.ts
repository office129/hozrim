import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { getRpConfig, setChallenge } from "@/lib/webauthn";

// Public — this runs before the client is logged in. No allowCredentials
// is passed so the browser offers whichever passkey(s) it holds for this
// site (a "discoverable"/usernameless login), instead of needing an email
// first.
export async function POST(req: NextRequest) {
  const { rpID } = getRpConfig(req);

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
  });

  await setChallenge(options.challenge);
  return NextResponse.json(options);
}
