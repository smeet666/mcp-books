/**
 * An archive that answers some questions and not others.
 *
 * A registry written for exactly the archives it holds today breaks the day one
 * of them cannot answer a tool. The stand-in here answers a catalogue and
 * cannot be searched inside its text, which is the shape a national library
 * whose full-text route is closed to automated clients would take. What has to
 * hold is that it appears in the tools it can answer and is named as absent
 * from the one it cannot, so an answer narrower than the server never reads as
 * the whole of it.
 */

import { describe, expect, it } from "vitest";
import { splitByCapability } from "../../src/sources/registry.js";
import { runGetItem } from "../../src/tools/getItem.js";
import { runSearchInside } from "../../src/tools/searchInside.js";
import { runSearchItems } from "../../src/tools/searchItems.js";
import {
  clientWithStandIn,
  insideArgs,
  itemArgs,
  payloadOf,
  recordArgs,
  reportFor,
  standInAdapter,
  textOf,
} from "./support.js";

interface Payload {
  per_source: Array<{
    source: string;
    status: string;
    stage: string | null;
    absent_because: string | null;
  }>;
  notes: string[];
}

describe("an archive that cannot be searched inside its text", () => {
  it("appears in the answer with a status of its own", async () => {
    const payload = payloadOf<Payload>(await runSearchInside(clientWithStandIn(), insideArgs()));

    expect(payload.per_source).toHaveLength(3);
    expect(reportFor(payload, "standin").status).toBe("absent");
  });

  it("has no stage, because it was never asked", async () => {
    const payload = payloadOf<Payload>(await runSearchInside(clientWithStandIn(), insideArgs()));
    expect(reportFor(payload, "standin").stage).toBeNull();
  });

  it("carries the reason it was left out", async () => {
    const payload = payloadOf<Payload>(await runSearchInside(clientWithStandIn(), insideArgs()));
    expect(String(reportFor(payload, "standin").absent_because)).toMatch(/robots file/);
  });

  it("is named in the text a client renders", async () => {
    const text = textOf(await runSearchInside(clientWithStandIn(), insideArgs()));
    expect(text).toMatch(/a stand-in archive was not asked for this/);
    expect(text).toMatch(/Nothing in this answer is evidence about what it holds/);
  });

  it("is never counted as an archive that answered and found nothing", async () => {
    const text = textOf(await runSearchInside(clientWithStandIn(), insideArgs()));
    expect(text).not.toMatch(/a stand-in archive answered and offered nothing/);
  });

  it("is not credited, having published nothing here", async () => {
    const text = textOf(await runSearchInside(clientWithStandIn(), insideArgs()));
    expect(text.split("\n").at(-1)).not.toContain("stand-in");
  });

  it("names no corpus, having none to read", async () => {
    const payload = payloadOf<Payload & { per_source: Array<{ corpus: string | null }> }>(
      await runSearchInside(clientWithStandIn(), insideArgs()),
    );
    expect(reportFor(payload, "standin").corpus).toBeNull();
    expect(reportFor(payload, "archive").corpus).toBeTruthy();
  });
});

describe("the same archive on a tool it does answer", () => {
  it("contributes rows to the catalogue search", async () => {
    const payload = payloadOf<Payload & { items: Array<{ source: string }> }>(
      await runSearchItems(clientWithStandIn(), itemArgs({ media_type: "books" })),
    );

    expect(reportFor(payload, "standin").status).toBe("answered");
    expect(payload.items.some((row) => row.source === "standin")).toBe(true);
  });

  it("is interleaved with the others rather than appended", async () => {
    const payload = payloadOf<{ items: Array<{ source: string }> }>(
      await runSearchItems(clientWithStandIn(), itemArgs({ media_type: "books" })),
    );
    expect(payload.items[0]?.source).toBe("loc");
    expect(payload.items[1]?.source).toBe("standin");
  });
});

describe("the registry, asked which archives answer a call", () => {
  it("returns the reason beside every archive it sets aside", () => {
    const { able, absent } = splitByCapability([standInAdapter()], "search_inside");
    expect(able).toHaveLength(0);
    expect(absent[0]?.because).toMatch(/robots file/);
  });

  it("keeps an archive that answers the call", () => {
    const { able, absent } = splitByCapability([standInAdapter()], "search_items");
    expect(able).toHaveLength(1);
    expect(absent).toHaveLength(0);
  });
});

describe("a record read from an archive that answers reads", () => {
  it("routes on the prefix the identifier carries", async () => {
    const result = await runGetItem(
      clientWithStandIn(),
      recordArgs({ identifier: "standin:sc-4471" }),
    );
    // The stand-in holds no record under that name and says so as an absence.
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("[not_found]");
    expect(textOf(result)).toMatch(/a stand-in archive was asked for "sc-4471"/);
  });
});
