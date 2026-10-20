import "server-only";

export class IntegrationError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function jsonError(e: unknown) {
  if (e instanceof IntegrationError) return Response.json({ error: e.message }, { status: e.status });
  const status = typeof e === "object" && e && "status" in e && typeof (e as { status: unknown }).status === "number" ? (e as { status: number }).status : 500;
  const message = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "Unexpected error";
  return Response.json({ error: message }, { status: status >= 400 && status < 600 ? status : 500 });
}
