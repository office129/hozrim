import { NextResponse } from "next/server";
import { destroyClientSession } from "@/lib/auth";

export async function POST() {
  await destroyClientSession();
  return NextResponse.json({ ok: true });
}
