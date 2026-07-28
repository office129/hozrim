import { NextResponse } from "next/server";
import { destroyAdminSession, destroyClientSession, getAdminId, getClientId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function requireAdmin(): Promise<string | NextResponse> {
  const id = await getAdminId();
  if (!id) return NextResponse.json({ error: "לא מחובר/ת" }, { status: 401 });

  // Same reasoning as requireClient: a valid JWT doesn't mean the account
  // wasn't removed from the team after the cookie was issued.
  const exists = await prisma.admin.findUnique({ where: { id }, select: { id: true } });
  if (!exists) {
    await destroyAdminSession();
    return NextResponse.json({ error: "לא מחובר/ת" }, { status: 401 });
  }

  return id;
}

export async function requireClient(): Promise<string | NextResponse> {
  const id = await getClientId();
  if (!id) return NextResponse.json({ error: "לא מחובר/ת" }, { status: 401 });

  // The JWT alone only proves it was issued by us and hasn't expired — it
  // says nothing about whether the account still exists (e.g. an admin
  // deleted it after the cookie was already sitting in the browser).
  const exists = await prisma.client.findUnique({ where: { id }, select: { id: true } });
  if (!exists) {
    await destroyClientSession();
    return NextResponse.json({ error: "לא מחובר/ת" }, { status: 401 });
  }

  return id;
}

export function isResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse;
}
