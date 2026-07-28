import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { createClientSession } from "@/lib/auth";
import { getRpConfig, consumeChallenge } from "@/lib/webauthn";

export async function POST(req: NextRequest) {
  const expectedChallenge = await consumeChallenge();
  if (!expectedChallenge) {
    return NextResponse.json({ error: "פג תוקף הבקשה, נסה/י שוב" }, { status: 400 });
  }

  const response = await req.json().catch(() => null);
  if (!response?.id) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  const passkey = await prisma.clientPasskey.findUnique({ where: { credentialId: response.id } });
  if (!passkey) return NextResponse.json({ error: "אמצעי הכניסה לא מזוהה" }, { status: 401 });

  const { rpID, origin } = getRpConfig(req);

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: passkey.credentialId,
        publicKey: new Uint8Array(Buffer.from(passkey.publicKey, "base64url")),
        counter: passkey.counter,
        transports: passkey.transports ? JSON.parse(passkey.transports) : undefined,
      },
    });
  } catch (e) {
    console.error("Passkey login verification failed", e);
    return NextResponse.json({ error: "האימות נכשל" }, { status: 401 });
  }

  if (!verification.verified) {
    return NextResponse.json({ error: "האימות נכשל" }, { status: 401 });
  }

  const client = await prisma.$transaction(async (tx) => {
    await tx.clientPasskey.update({
      where: { id: passkey.id },
      data: { counter: verification.authenticationInfo.newCounter },
    });
    return tx.client.findUnique({ where: { id: passkey.clientId } });
  });
  if (!client) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  await createClientSession(client.id);
  return NextResponse.json({ ok: true, name: client.name });
}
