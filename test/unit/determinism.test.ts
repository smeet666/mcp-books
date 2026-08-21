/**
 * The same question, asked again, answers the same.
 *
 * Time is pinned to one instant here rather than measured, so a test cannot
 * pass on a fast machine and fail on a slow one, and nothing in an answer can
 * be a clock reading that changes between two runs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runGetItem } from "../../src/tools/getItem.js";
import { runSearchInside } from "../../src/tools/searchInside.js";
import { runSearchItems } from "../../src/tools/searchItems.js";
import {
  FakeSourceError,
  clientWithStandIn,
  fakeClient,
  insideArgs,
  itemArgs,
  payloadOf,
  recordArgs,
  textOf,
} from "./support.js";

const EPOCH = new Date("2026-02-02T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ now: EPOCH });
});

afterEach(() => {
  vi.useRealTimers();
});

const PASSES = 5;

async function fiveTimes(run: () => Promise<string>): Promise<string[]> {
  const answers: string[] = [];
  for (let pass = 0; pass < PASSES; pass += 1) {
    answers.push(await run());
  }
  return answers;
}

function identical(answers: string[]): void {
  expect(new Set(answers).size).toBe(1);
}

describe("five consecutive passes agree", () => {
  it("on a search inside the text of every archive", async () => {
    identical(
      await fiveTimes(async () => textOf(await runSearchInside(fakeClient(), insideArgs()))),
    );
  });

  it("on a catalogue search", async () => {
    identical(await fiveTimes(async () => textOf(await runSearchItems(fakeClient(), itemArgs()))));
  });

  it("on one record", async () => {
    identical(
      await fiveTimes(async () =>
        textOf(
          await runGetItem(
            fakeClient(),
            recordArgs({
              identifier: "archive:voyageofthecormorant00pell",
              sections: ["description", "subjects", "copies", "context"],
            }),
          ),
        ),
      ),
    );
  });

  it("on an answer where one archive failed", async () => {
    identical(
      await fiveTimes(async () =>
        textOf(
          await runSearchInside(
            fakeClient({ archive: { fail: new FakeSourceError("timeout", "Too slow.") } }),
            insideArgs(),
          ),
        ),
      ),
    );
  });

  it("on an answer where one archive was never asked", async () => {
    identical(
      await fiveTimes(async () => textOf(await runSearchInside(clientWithStandIn(), insideArgs()))),
    );
  });

  it("on a refusal", async () => {
    identical(
      await fiveTimes(async () =>
        textOf(await runGetItem(fakeClient(), recordArgs({ identifier: "The Cormorant" }))),
      ),
    );
  });
});

describe("nothing in an answer is a clock reading", () => {
  it("carries no timestamp and no elapsed time", async () => {
    const text = textOf(await runSearchInside(fakeClient(), insideArgs()));
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(text).not.toMatch(/\belapsed\b|\btook \d/);
  });

  it("answers the same whichever instant the clock is pinned to", async () => {
    const at = async (instant: string) => {
      vi.setSystemTime(new Date(instant));
      return textOf(await runSearchItems(fakeClient(), itemArgs()));
    };
    expect(await at("2020-01-01T00:00:00.000Z")).toBe(await at("2030-12-31T23:59:59.000Z"));
  });
});

describe("the order archives are asked in changes nothing", () => {
  it("gives the same answer whichever archive is named first", async () => {
    const forward = textOf(
      await runSearchInside(fakeClient(), insideArgs({ sources: ["archive", "loc"] })),
    );
    const backward = textOf(
      await runSearchInside(fakeClient(), insideArgs({ sources: ["loc", "archive"] })),
    );
    // The registry's own order decides the interleave, so naming the archives
    // in either order asks the same question and answers it the same way.
    expect(forward).toBe(backward);
  });
});

describe("a field a caller reads keeps one shape", () => {
  it("counts the rows left out as a number, read again or served from a cache", async () => {
    const countsOf = async (cached: boolean) => {
      const result = await runSearchItems(fakeClient({ loc: { cached } }), itemArgs());
      const payload = payloadOf<{ per_source: Array<{ name: string; skipped: unknown }> }>(result);
      return payload.per_source.map((report) => [report.name, report.skipped] as const);
    };

    const fresh = await countsOf(false);
    const served = await countsOf(true);

    expect(served).toEqual(fresh);
    for (const [, skipped] of served) {
      expect(typeof skipped).toBe("number");
    }
  });
});
