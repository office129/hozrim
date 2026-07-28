import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { requireClient, isResponse } from "@/lib/guard";
import { getRpConfig, consumeChallenge } from "@/lib/webauthn";

export async function POST(req: NextRequest) {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;

  const expectedChallenge = await consumeChallenge();
  if (!expectedChallenge) {
    return NextResponse.json({ error: "פג תוקף הבקשה, נסה/י שוב" }, { status: 400 });
  }

  const response = await req.json().catch(() => null);
  if (!response) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  const { rpID, origin } = getRpConfig(req);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
  } catch (e) {
    console.error("Passkey registration verification failed", e);
    return NextResponse.json({ error: "האימות נכשל" }, { status: 400 });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "האימות נכשל" }, { status: 400 });
  }

  const { credential } = verification.registrationInfo;
  try {
    await prisma.clientPasskey.create({
      data: {
        clientId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString("base64url"),
        counter: credential.counter,
        transports: credential.transports ? JSON.stringify(credential.transports) : null,
      },
    });
  } catch {
    return NextResponse.json({ error: "אמצעי הכניסה הזה כבר רשום" }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
