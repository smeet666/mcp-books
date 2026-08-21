/**
 * How long a live test is allowed to take, against how long the client is
 * entitled to take.
 *
 * The client keeps a backstop deadline over each archive that covers every
 * attempt it may make, the pacing owed before each of them, and the wait an
 * archive can ask it to keep. Reaching that deadline produces an error naming
 * the archive and the moment, which is the whole value of a live run: it says
 * which archive went quiet.
 *
 * A test cut short before that deadline produces none of it. The run fails with
 * a bare "test timed out", naming no archive and no stage, and a slow night
 * reads exactly like an archive that changed the shape of what it publishes.
 * These hold the live budget above the client's own backstop so the coded error
 * is the one that surfaces.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../../src/config.js";
import {
  BooksClient,
  LONGEST_BACKOFF_MS,
  MAX_QUERIES_PER_SOURCE,
} from "../../src/sources/client.js";

const repoFile = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../${name}`, import.meta.url)), "utf8");

/** The settings the nightly canary runs the live suite under. */
function canaryEnvironment(): NodeJS.ProcessEnv {
  const workflow = repoFile(".github/workflows/live-canary.yml");
  const env: NodeJS.ProcessEnv = {};
  for (const match of workflow.matchAll(/^\s+(BOOKS_[A-Z_]+):\s*"?([^"\n]+)"?$/gm)) {
    const name = match[1];
    const value = match[2];
    if (name === undefined || value === undefined) {
      continue;
    }
    env[name] = value.trim();
  }
  return env;
}

/** The per-test ceiling the live script pins, if it pins one. */
function pinnedTestTimeoutMs(): number | null {
  const scripts = JSON.parse(repoFile("package.json")).scripts as Record<string, string>;
  const pinned = /--testTimeout[= ](\d+)/.exec(scripts["test:live"] ?? "");
  return pinned ? Number(pinned[1]) : null;
}

describe("the backstop the client keeps over one archive", () => {
  it("covers every attempt, the pacing before each, and the wait between them", () => {
    const config = { ...loadConfig({}), timeoutMs: 20_000, maxRetries: 2, minIntervalMs: 10_000 };
    const client = new BooksClient({ config });

    // Three attempts, each preceded by the spacing owed, and two waits between.
    expect(client.slowestDeadlineMs).toBe((20_000 + 10_000) * 3 + LONGEST_BACKOFF_MS * 2);
  });

  it("widens when a caller asks the server to be more patient with an archive", () => {
    const base = new BooksClient({ config: { ...loadConfig({}), minIntervalMs: null } });
    const patient = new BooksClient({ config: { ...loadConfig({}), minIntervalMs: 20_000 } });

    expect(patient.slowestDeadlineMs).toBeGreaterThan(base.slowestDeadlineMs);
  });

  it("allows a search the backstop once per wording it may send", () => {
    const client = new BooksClient({ config: loadConfig({}) });

    expect(client.slowestAnswerMs).toBe(client.slowestDeadlineMs * MAX_QUERIES_PER_SOURCE);
  });
});

describe("the live suite's budget", () => {
  it("outlasts the client's backstop under the settings the canary uses", () => {
    const client = new BooksClient({ config: loadConfig(canaryEnvironment()) });
    const pinned = pinnedTestTimeoutMs();

    // A pinned ceiling below the backstop turns "the Library of Congress did
    // not answer" into "a test timed out", which names nothing.
    expect(pinned === null || pinned >= client.slowestDeadlineMs).toBe(true);
  });

  it("outlasts it on the defaults a workstation run gets", () => {
    const client = new BooksClient({ config: loadConfig({}) });
    const pinned = pinnedTestTimeoutMs();

    expect(pinned === null || pinned >= client.slowestDeadlineMs).toBe(true);
  });

  it("states a budget on every live test that goes to an archive", () => {
    // A test that reaches an archive is asynchronous, and the default ceiling
    // is seconds where an archive is allowed minutes. One that only reads what
    // the run already collected reaches nothing and needs no room.
    const suite = repoFile("test/live/smoke.live.test.ts");
    const asking = [...suite.matchAll(/\bit\(\s*"(?:[^"\\]|\\.)*",\s*async\b/g)].length;
    const budgeted = [...suite.matchAll(/\bbudget\(\d/g)].length;

    expect(asking).toBeGreaterThan(0);
    expect(budgeted).toBe(asking);
  });
});
