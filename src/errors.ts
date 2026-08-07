/**
 * One error type, carrying a code the caller can branch on.
 *
 * The distinction that matters most is between "no archive holds this" and
 * "the question could not be asked". Collapsing the two lets a model report an
 * absence it never established, which is a false statement about the world
 * rather than a missing feature.
 */

import { ISSUES_URL } from "./version.js";

export type ErrorCode =
  /** An archive answered, and holds no such record. */
  | "not_found"
  /** The arguments cannot produce a request. */
  | "invalid_input"
  /** An archive asked this client to slow down. */
  | "rate_limited"
  /** A response arrived in a shape this server cannot read. */
  | "parse_failure"
  /** The request could not be completed. */
  | "network_error"
  /** The request was abandoned before an answer arrived. */
  | "timeout";

export const ERROR_CODES: readonly ErrorCode[] = [
  "not_found",
  "invalid_input",
  "rate_limited",
  "parse_failure",
  "network_error",
  "timeout",
];

export interface ErrorDetails {
  /** What the caller can do about it, when there is something. */
  hint?: string;
  /** The address that produced the failure, for a bug report. */
  url?: string;
  status?: number;
}

export class BooksError extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorDetails;

  constructor(code: ErrorCode, message: string, details: ErrorDetails = {}) {
    super(message);
    this.name = "BooksError";
    this.code = code;
    this.details = details;
  }
}

export const notFound = (message: string, details?: ErrorDetails) =>
  new BooksError("not_found", message, details ?? {});

export const invalidInput = (message: string, hint?: string) =>
  new BooksError("invalid_input", message, hint ? { hint } : {});

export const rateLimited = (message: string, details?: ErrorDetails) =>
  new BooksError("rate_limited", message, {
    hint: "Wait a moment and ask again. This says nothing about whether the record exists.",
    ...details,
  });

export const parseFailure = (message: string, details?: ErrorDetails) =>
  new BooksError("parse_failure", message, {
    hint: `An archive may have changed how it answers. Please report this at ${ISSUES_URL} with the arguments you used.`,
    ...details,
  });

export const networkError = (message: string, details?: ErrorDetails) =>
  new BooksError("network_error", message, details ?? {});

export const timeout = (message: string, details?: ErrorDetails) =>
  new BooksError("timeout", message, details ?? {});

/**
 * Read the code off a failure raised by the library that reads an archive.
 *
 * Those libraries throw their own error classes carrying the six codes above,
 * and the classes are not part of the interface this server imports. Reading
 * the field keeps the taxonomy intact without depending on a class identity a
 * library is free to change, and anything unrecognisable is reported as a
 * network failure, which is the reading that claims least.
 */
export function toBooksError(error: unknown): BooksError {
  if (error instanceof BooksError) return error;

  const message = error instanceof Error ? error.message : String(error);
  const raw = error as { code?: unknown; details?: unknown } | null;
  const code = typeof raw?.code === "string" ? raw.code : "";
  const known = ERROR_CODES.find((candidate) => candidate === code);

  const details =
    raw && typeof raw.details === "object" && raw.details !== null
      ? (raw.details as ErrorDetails)
      : {};

  return new BooksError(known ?? "network_error", message, details);
}
