/**
 * Settings, and what no setting can do.
 *
 * The archives serve everyone free of charge and one of them publishes a
 * ceiling, so the spacing between two requests is a promise this server makes
 * on its own behalf. A value that widens it is honoured; a value that would
 * narrow it is not, whichever way it arrives.
 */

import { describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_AGENT, loadConfig } from "../../src/config.js";
import { pacingFor } from "../../src/sources/registry.js";
import { PKG_VERSION } from "../../src/version.js";

const quiet = () => vi.spyOn(process.stderr, "write").mockImplementation(() => true);

describe("the defaults", () => {
  it("leave each archive on the spacing it was built with", () => {
    expect(loadConfig({}).minIntervalMs).toBeNull();
  });

  it("name the project and a way to reach a human", () => {
    expect(loadConfig({}).userAgent).toBe(DEFAULT_USER_AGENT);
    expect(DEFAULT_USER_AGENT).toContain(PKG_VERSION);
    expect(DEFAULT_USER_AGENT).toContain("github.com/smeet666/mcp-books");
  });

  it("give the full-text routes room to answer, since they read whole pages", () => {
    expect(loadConfig({}).timeoutMs).toBe(45_000);
  });

  it("keep a cache short enough that a conversation sees fresh answers", () => {
    expect(loadConfig({}).cacheTtlMs).toBe(900_000);
  });
});

describe("a caller who says who they are", () => {
  it("keeps the project's own identifier attached", () => {
    const config = loadConfig({ BOOKS_USER_AGENT: "some-client/2.0" });
    expect(config.userAgent).toContain("some-client/2.0");
    expect(config.userAgent).toContain(DEFAULT_USER_AGENT);
  });
});

describe("a setting that cannot be read", () => {
  it("warns and leaves the default standing rather than stopping the server", () => {
    const stderr = quiet();
    expect(loadConfig({ BOOKS_TIMEOUT_MS: "soon" }).timeoutMs).toBe(45_000);
    expect(stderr).toHaveBeenCalled();
    stderr.mockRestore();
  });

  it("refuses a value outside its range and says so", () => {
    const stderr = quiet();
    expect(loadConfig({ BOOKS_MAX_RETRIES: "500" }).maxRetries).toBe(3);
    expect(String(stderr.mock.calls[0]?.[0])).toMatch(/outside 0\.\.8/);
    stderr.mockRestore();
  });

  it("refuses a log level it does not know", () => {
    const stderr = quiet();
    expect(loadConfig({ BOOKS_LOG_LEVEL: "loud" }).logLevel).toBe("error");
    stderr.mockRestore();
  });
});

describe("the spacing an archive is owed", () => {
  it("stands when a setting asks for less", () => {
    expect(pacingFor(loadConfig({ BOOKS_MIN_INTERVAL_MS: "600" }), 6000)).toBe(6000);
  });

  it("widens when a setting asks for more", () => {
    expect(pacingFor(loadConfig({ BOOKS_MIN_INTERVAL_MS: "9000" }), 6000)).toBe(9000);
  });

  it("stands when no setting arrives at all", () => {
    expect(pacingFor(loadConfig({}), 6000)).toBe(6000);
    expect(pacingFor(loadConfig({}), 1000)).toBe(1000);
  });

  it("refuses a value below the floor and leaves each archive on its own", () => {
    const stderr = quiet();
    const config = loadConfig({ BOOKS_MIN_INTERVAL_MS: "10" });
    expect(pacingFor(config, 6000)).toBe(6000);
    expect(pacingFor(config, 1000)).toBe(1000);
    stderr.mockRestore();
  });
});
