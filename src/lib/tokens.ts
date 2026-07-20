import { randomBytes, randomUUID, createHash } from "crypto";

export function generateTempPassword() {
  // 8 base32-ish chars, easy to read aloud/type — this is a one-time
  // temporary password the client changes from their profile screen.
  return randomBytes(6).toString("base64url").slice(0, 8);
}

export function generateResetToken() {
  const token = randomUUID() + randomUUID();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
