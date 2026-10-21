import { z } from "zod";

const schema = z.object({
  /** TCP port to listen on. */
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  /** Bind address. */
  HOST: z.string().min(1).default("0.0.0.0"),
  /** Directory holding the SQLite database (created if missing). */
  DATA_DIR: z.string().min(1).default("./data"),
  /** IANA time zone that defines the "day" for per-day deduplication and today's count. */
  TIMEZONE: z.string().min(1).default("Asia/Seoul"),
  /** When true, the client address is taken from X-Real-IP / X-Forwarded-For (set by the nginx gateway). */
  TRUSTED_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  /** Raw per-visitor rows older than this many days are deleted; totals and per-day counts are kept forever. */
  VISIT_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(7),
  /** Reported by /healthz so deployments can be verified (set from the image tag). */
  APP_VERSION: z.string().min(1).default("dev"),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`invalid configuration: ${issues}`);
  }
  assertTimeZone(parsed.data.TIMEZONE);
  return parsed.data;
}

function assertTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    throw new Error(`invalid configuration: TIMEZONE "${timeZone}" is not a known IANA time zone`);
  }
}
