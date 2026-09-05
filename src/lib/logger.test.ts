import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "@/lib/logger";

describe("logger", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("outputs structured JSON", () => {
    logger.info("test:context", "test message", { key: "value" });

    expect(consoleLogSpy).toHaveBeenCalledOnce();
    const output = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
    expect(output).toMatchObject({
      level: "info",
      context: "test:context",
      message: "test message",
      key: "value",
    });
    expect(output.timestamp).toBeDefined();
  });

  it("uses console.error for error level", () => {
    logger.error("test:context", "error message");

    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    const output = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);
    expect(output.level).toBe("error");
  });

  it("uses console.warn for warn level", () => {
    logger.warn("test:context", "warn message");

    expect(consoleWarnSpy).toHaveBeenCalledOnce();
    const output = JSON.parse(consoleWarnSpy.mock.calls[0][0] as string);
    expect(output.level).toBe("warn");
  });

  it("handles undefined data safely", () => {
    logger.info("test:context", "no data");

    const output = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
    expect(output.context).toBe("test:context");
    expect(output.message).toBe("no data");
  });

  it("debug method exists and works", () => {
    logger.debug("test:context", "debug message");

    // In test env (no LOG_LEVEL set), debug should be logged
    expect(consoleLogSpy).toHaveBeenCalledOnce();
    const output = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
    expect(output.level).toBe("debug");
  });
});
