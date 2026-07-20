import { NextResponse } from "next/server";
import { getAdminId, getClientId } from "@/lib/auth";

export async function requireAdmin(): Promise<string | NextResponse> {
  const id = await getAdminId();
  if (!id) return NextResponse.json({ error: "לא מחובר/ת" }, { status: 401 });
  return id;
}

export async function requireClient(): Promise<string | NextResponse> {
  const id = await getClientId();
  if (!id) return NextResponse.json({ error: "לא מחובר/ת" }, { status: 401 });
  return id;
}

export function isResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse;
}
