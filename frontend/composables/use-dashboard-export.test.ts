import { afterEach, describe, expect, test, vi } from "vitest";
import { useDashboardExport } from "./use-dashboard-export";
import { StatsAPI } from "../lib/api/classes/stats";
import { Requests } from "../lib/requests";

const csv = "metric,breakdown,breakdown_id,breakdown_label,value,unit,date\ntotalItems,,,,0,items,\n";
const response = () => new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8" } });

afterEach(() => vi.unstubAllGlobals());

describe("dashboard export", () => {
  test("captures collection and filters, blocks duplicate requests, and downloads the fixed CSV", async () => {
    let finish!: (r: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>(resolve => (finish = resolve)));
    vi.stubGlobal("fetch", fetch);
    let collection = "first-collection";
    const save = vi.fn();
    const getStats = vi.fn(() => new StatsAPI(new Requests("", "session-token", { "X-Tenant": collection })));
    const action = useDashboardExport(getStats, save);
    const start = new Date(2026, 0, 2);
    const end = new Date(2026, 1, 3);
    const pending = action.exportCSV(start, end);
    expect(action.exporting.value).toBe(true);
    expect(action.failed.value).toBe(false);
    collection = "second-collection";
    start.setFullYear(2030);
    await action.exportCSV();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(getStats).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/groups/statistics/export?start=2026-01-02&end=2026-02-03");
    expect(init).toMatchObject({
      method: "GET",
      headers: {
        "X-Tenant": "first-collection",
        Authorization: "session-token",
      },
    });
    expect(save).not.toHaveBeenCalled();
    finish(response());
    await pending;
    expect(action.exporting.value).toBe(false);
    expect(save).toHaveBeenCalledWith(expect.any(Blob), "homebox-dashboard-summary.csv");
    expect(await (save.mock.calls[0]![0] as Blob).text()).toBe(csv);
    expect(start.getFullYear()).toBe(2030); // export never writes back filter state

    const retry = action.exportCSV();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]).toEqual([
      "/api/v1/groups/statistics/export?start=&end=",
      expect.objectContaining({
        headers: {
          "X-Tenant": "second-collection",
          Authorization: "session-token",
        },
      }),
    ]);
    finish(response());
    await retry;
  });

  test.each([
    [
      "HTTP JSON error",
      () =>
        Promise.resolve(
          new Response('{"error":"failed"}', {
            status: 500,
            headers: { "Content-Type": "application/json" },
          })
        ),
    ],
    [
      "error with CSV content type",
      () =>
        Promise.resolve(
          new Response("error", {
            status: 403,
            headers: { "Content-Type": "text/csv" },
          })
        ),
    ],
    [
      "successful HTML response",
      () => Promise.resolve(new Response("login", { headers: { "Content-Type": "text/html" } })),
    ],
    ["network failure", () => Promise.reject(new Error("offline"))],
    [
      "body read failure",
      () => {
        const r = response();
        vi.spyOn(r, "blob").mockRejectedValue(new Error("disconnected"));
        return Promise.resolve(r);
      },
    ],
  ])("does not download on %s and allows retry", async (_, fail) => {
    const fetch = vi.fn().mockImplementationOnce(fail).mockResolvedValue(response());
    vi.stubGlobal("fetch", fetch);
    const save = vi.fn();
    const action = useDashboardExport(() => new StatsAPI(new Requests("")), save);
    await action.exportCSV();
    expect(action.failed.value).toBe(true);
    expect(action.exporting.value).toBe(false);
    expect(save).not.toHaveBeenCalled();
    await action.exportCSV();
    expect(action.failed.value).toBe(false);
    expect(action.exporting.value).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
  });

  test("a browser download failure also releases the action", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(response));
    const save = vi.fn().mockImplementationOnce(() => {
      throw new Error("download failed");
    });
    const action = useDashboardExport(() => new StatsAPI(new Requests("")), save);
    await action.exportCSV();
    expect(action.failed.value).toBe(true);
    expect(action.exporting.value).toBe(false);
    await action.exportCSV();
    expect(action.failed.value).toBe(false);
  });
});
