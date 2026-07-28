import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { requireClient, isResponse } from "@/lib/guard";
import { getRpConfig, setChallenge } from "@/lib/webauthn";

export async function POST(req: NextRequest) {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  const existing = await prisma.clientPasskey.findMany({ where: { clientId } });
  const { rpName, rpID } = getRpConfig(req);

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: client.email,
    userID: new TextEncoder().encode(client.id),
    userDisplayName: client.name,
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({
      id: p.credentialId,
      transports: p.transports ? JSON.parse(p.transports) : undefined,
    })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "preferred",
      authenticatorAttachment: "platform",
    },
  });

  await setChallenge(options.challenge);
  return NextResponse.json(options);
}
