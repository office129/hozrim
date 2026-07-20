export class ApiError extends Error {}

async function parse(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error || "משהו השתבש, נסו שוב");
  return data;
}

export async function apiGet(url: string) {
  const res = await fetch(url, { credentials: "include" });
  return parse(res);
}

export async function apiSend(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return parse(res);
}

export async function apiUpload(url: string, formData: FormData) {
  const res = await fetch(url, { method: "POST", credentials: "include", body: formData });
  return parse(res);
}
