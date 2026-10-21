/**
 * Resolves the visitor's address. Behind the nginx gateway (TRUSTED_PROXY=true) the gateway sets
 * X-Real-IP to the real client (nginx itself takes it from Cloudflare's CF-Connecting-IP), so that header
 * wins; X-Forwarded-For's first hop is the fallback. Without a trusted proxy only the socket address counts,
 * because anyone can send those headers.
 */
export function resolveClientIp(
  headers: Headers,
  socketAddress: string | undefined,
  trustProxy: boolean,
): string {
  if (trustProxy) {
    const real = headers.get("x-real-ip")?.trim();
    if (real) {
      return normalize(real);
    }
    const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) {
      return normalize(forwarded);
    }
  }
  return normalize(socketAddress ?? "unknown");
}

/** Strips the IPv6-mapped IPv4 prefix so "::ffff:1.2.3.4" and "1.2.3.4" count as the same visitor. */
export function normalize(address: string): string {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  return mapped?.[1] ?? address;
}
