/// <reference types="jest" />
/**
 * Phase 1A — `partial` is a WARNING-level run outcome, not an error.
 *
 * An incomplete legacy-media batch preserves stored media and caps the Property
 * watermark so the affected listings retry. That is degraded-but-recoverable:
 * it must not be logged as an error (which would page/alert as a hard failure),
 * and must not be logged as info (which would hide a real reconciliation gap).
 */
import { logIDXAccess } from "@/lib/idx/logger";
import type { IDXAuditLogEntry } from "@/lib/idx/types";

function entry(resultStatus: IDXAuditLogEntry["resultStatus"]): IDXAuditLogEntry {
  return {
    timestamp: new Date("2026-07-29T00:00:00Z"),
    operation: "sync",
    resultStatus,
  } as unknown as IDXAuditLogEntry;
}

describe("logIDXAccess — partial run status", () => {
  let warn: jest.SpyInstance, err: jest.SpyInstance, info: jest.SpyInstance, log: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    err = jest.spyOn(console, "error").mockImplementation(() => {});
    info = jest.spyOn(console, "info").mockImplementation(() => {});
    log = jest.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("logs 'partial' at WARN level", () => {
    logIDXAccess(entry("partial"));
    expect(warn).toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
  });

  it("still logs 'error' at ERROR level", () => {
    logIDXAccess(entry("error"));
    expect(err).toHaveBeenCalled();
  });

  it("does not escalate 'success' to warn or error", () => {
    logIDXAccess(entry("success"));
    expect(err).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(info.mock.calls.length + log.mock.calls.length).toBeGreaterThan(0);
  });
});
