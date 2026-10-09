import { afterEach, expect, test, vi } from "vitest";
import { downloadBlob } from "./download";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test.each([false, true])("removes link and releases the object URL (click failure: %s)", throws => {
  vi.useFakeTimers();
  const blob = new Blob(["CSV"], { type: "text/csv" });
  const link = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
  const appendChild = vi.fn();
  vi.stubGlobal("document", {
    createElement: vi.fn(() => link),
    body: { appendChild },
  });
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:summary");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  if (throws) {
    link.click.mockImplementation(() => {
      throw new Error("click failed");
    });
    expect(() => downloadBlob(blob, "summary.csv")).toThrow("click failed");
  } else {
    downloadBlob(blob, "summary.csv");
  }
  expect(create).toHaveBeenCalledWith(blob);
  expect(link.download).toBe("summary.csv");
  expect(link.href).toBe("blob:summary");
  expect(appendChild).toHaveBeenCalledWith(link);
  expect(link.click).toHaveBeenCalledOnce();
  expect(link.remove).toHaveBeenCalledOnce();
  expect(revoke).not.toHaveBeenCalled();
  vi.runAllTimers();
  expect(revoke).toHaveBeenCalledWith("blob:summary");
});
