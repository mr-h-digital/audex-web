import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StartupReady } from "./StartupReady";

vi.mock("react", () => ({ useEffect: vi.fn() }));

describe("readiness-driven launch", () => {
  let effect: (() => void) | void;
  let frame: FrameRequestCallback;
  const boot = { dataset: { state: "loading" }, setAttribute: vi.fn(), remove: vi.fn() };
  beforeEach(() => {
    vi.useFakeTimers(); vi.clearAllMocks();
    boot.dataset.state = "loading";
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("document", { getElementById: vi.fn(() => boot) });
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { frame = callback; return 7; }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.mocked(useEffect).mockImplementation((callback) => { effect = callback(); });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it("starts exiting on the first ready frame, not an arbitrary minimum launch timer", () => {
    StartupReady();
    expect(boot.dataset.state).toBe("loading");
    frame(0);
    expect(boot.dataset.state).toBe("exiting");
    expect(boot.setAttribute).toHaveBeenCalledWith("aria-hidden", "true");
    expect(boot.remove).not.toHaveBeenCalled();
    vi.advanceTimersByTime(350);
    expect(boot.remove).toHaveBeenCalledOnce();
  });
  it("cancels an uncommitted frame during StrictMode cleanup", () => {
    StartupReady();
    if (effect) effect();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
    expect(boot.remove).not.toHaveBeenCalled();
  });
  it("does nothing when another ready screen already removed the splash", () => {
    vi.mocked(document.getElementById).mockReturnValue(null);
    StartupReady();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });
});
