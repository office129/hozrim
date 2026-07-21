import { randomInt, randomUUID, createHash } from "crypto";

// Excludes look-alike characters (0/O, 1/l/I) and any separator character
// (-, _) that browsers treat as a word boundary when double-click-selecting
// text — a dash in the password meant a double-click copy from the admin
// panel's banner could silently grab only half of it.
const TEMP_PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

export function generateTempPassword(length = 10) {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)];
  }
  return out;
}

export function generateResetToken() {
  const token = randomUUID() + randomUUID();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
