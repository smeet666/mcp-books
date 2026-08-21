/**
 * What the live suite is allowed to conclude from the rows it gets back.
 *
 * Rows from one archive are the only evidence there is about what that archive
 * publishes, and an archive that was unreachable sent none. A live test that
 * reads rows and asserts on them without first asking whether the archive
 * answered states "this archive publishes nothing of the kind" on a night the
 * archive was down, and the canary opens an issue saying a contract moved.
 *
 * Nothing about that is visible in a passing run: it surfaces months later, on
 * one bad night, as an assertion nobody can reproduce. This reads the suite
 * itself instead.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const suite = readFileSync(
  fileURLToPath(new URL("../live/smoke.live.test.ts", import.meta.url)),
  "utf8",
);

/** Each `it(...)` of the live suite, as the text between one and the next. */
function tests(source: string): Array<{ title: string; body: string }> {
  const openings = [...source.matchAll(/\bit\(\s*"((?:[^"\\]|\\.)*)"/g)];
  return openings.map((opening, index) => ({
    title: opening[1] ?? "",
    body: source.slice(opening.index, openings[index + 1]?.index ?? source.length),
  }));
}

describe("the live suite's reading of an archive that did not answer", () => {
  it("stands a test down when the archive whose rows it reads was unreachable", () => {
    const reading = tests(suite).filter((test) => /\.(hits|rows)\b/.test(test.body));

    expect(reading.length).toBeGreaterThan(0);
    for (const test of reading) {
      expect(/ctx\.skip\(/.test(test.body), test.title).toBe(true);
    }
  });

  it("reports an archive that answered nothing at all, so a stand-down cannot hide one", () => {
    // Every stand-down is the right answer to one bad moment and the wrong
    // answer to an archive that has gone: stand every test down and the run is
    // green over an archive nobody can reach.
    expect(suite).toMatch(/answered at least once/);
  });
});
