/**
 * Settings, read from the environment.
 *
 * A value that cannot be read warns and falls back rather than stopping the
 * server: a typo in one variable should not take away every tool. Warnings go
 * to stderr, because stdout carries the protocol and anything written there
 * corrupts the session.
 *
 * One setting governs every source. Each source is read through its own client,
 * and each of those keeps a pacing floor that nothing here can lower, so a
 * value set here can only make this server more patient than it already is.
 */

import { PKG_VERSION, REPO_URL } from "./version.js";

export const LOG_LEVELS = ["silent", "error", "info", "debug"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * Spacing between two requests to one archive, when a caller asks for one.
 *
 * Left unset, each source keeps the spacing its own reader was built with,
 * which is the spacing that source's own published ceiling implies. A number
 * given here is compared against that spacing and the wider of the two wins, so
 * a setting can slow a source down and never speed it up.
 */
export const MIN_ALLOWED_INTERVAL_MS = 500;
/** Beyond this a request would look hung rather than paced. */
export const MAX_ALLOWED_INTERVAL_MS = 60_000;

export interface Config {
  userAgent: string;
  /**
   * Null when no spacing was asked for, which leaves each source on its own.
   * A number widens whichever source paces itself faster than it.
   */
  minIntervalMs: number | null;
  timeoutMs: number;
  maxRetries: number;
  cacheTtlMs: number;
  cacheMaxEntries: number;
  logLevel: LogLevel;
}

export const DEFAULT_USER_AGENT = `mcp-books/${PKG_VERSION} (+${REPO_URL})`;

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export function createLogger(level: LogLevel): Logger {
  const rank = LOG_LEVELS.indexOf(level);
  const write = (at: LogLevel, message: string) => {
    if (rank === 0 || LOG_LEVELS.indexOf(at) > rank) return;
    process.stderr.write(`[mcp-books] ${at}: ${message}\n`);
  };
  return {
    debug: (m) => write("debug", m),
    info: (m) => write("info", m),
    // A warning goes out at the error level so it survives the default
    // setting: a caller has to know that an archive was left out of an answer.
    warn: (m) => write("error", m),
    error: (m) => write("error", m),
  };
}

function readInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    process.stderr.write(
      `[mcp-books] error: ${name}="${raw}" is not a whole number; using ${fallback}.\n`,
    );
    return fallback;
  }
  if (value < min || value > max) {
    // Clamping silently would let a caller believe a setting took effect when
    // the opposite is true, so the refusal is stated and the default stands.
    process.stderr.write(
      `[mcp-books] error: ${name}=${value} is outside ${min}..${max}; using ${fallback}.\n`,
    );
    return fallback;
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const level = env.BOOKS_LOG_LEVEL as LogLevel | undefined;
  const logLevel = level && LOG_LEVELS.includes(level) ? level : "error";
  if (level && !LOG_LEVELS.includes(level)) {
    process.stderr.write(
      `[mcp-books] error: BOOKS_LOG_LEVEL="${level}" is not one of ${LOG_LEVELS.join(", ")}; using error.\n`,
    );
  }

  const custom = env.BOOKS_USER_AGENT?.trim();
  const spacing = env.BOOKS_MIN_INTERVAL_MS;

  return {
    // A caller who wants to be recognised may say who they are, and the
    // contact address stays attached: an archive has to be able to reach a
    // human about traffic it did not expect.
    userAgent: custom ? `${custom} ${DEFAULT_USER_AGENT}` : DEFAULT_USER_AGENT,
    minIntervalMs:
      spacing === undefined || spacing.trim() === ""
        ? null
        : readInteger(
            env,
            "BOOKS_MIN_INTERVAL_MS",
            MIN_ALLOWED_INTERVAL_MS,
            MIN_ALLOWED_INTERVAL_MS,
            MAX_ALLOWED_INTERVAL_MS,
          ),
    // Reading the machine-read text of millions of pages takes an archive far
    // longer than answering from a catalogue, so the deadline is generous.
    timeoutMs: readInteger(env, "BOOKS_TIMEOUT_MS", 45_000, 1000, 120_000),
    maxRetries: readInteger(env, "BOOKS_MAX_RETRIES", 3, 0, 8),
    cacheTtlMs: readInteger(env, "BOOKS_CACHE_TTL_MS", 900_000, 0, 86_400_000),
    cacheMaxEntries: readInteger(env, "BOOKS_CACHE_MAX_ENTRIES", 200, 1, 5000),
    logLevel,
  };
}
