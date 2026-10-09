import { BaseAPI, route } from "../base";
import type { GroupStatistics, TotalsByOrganizer, ValueOverTime } from "../types/data-contracts";

function YYYY_MM_DD(date?: Date): string {
  if (!date) {
    return "";
  }
  // with leading zeros
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}
export class StatsAPI extends BaseAPI {
  /** Download the fixed-column dashboard summaries, not inventory records.
   * Dates have the same semantics as totalPriceOverTime; other summaries are collection-wide.
   */
  async exportCSV(start?: Date, end?: Date): Promise<Blob> {
    const result = await this.http.get<unknown>({
      url: route("/groups/statistics/export", {
        start: YYYY_MM_DD(start),
        end: YYYY_MM_DD(end),
      }),
    });
    const contentType = result.response.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase();
    if (result.error || contentType !== "text/csv") {
      throw new Error("Dashboard CSV export failed");
    }
    return result.response.blob();
  }

  totalPriceOverTime(start?: Date, end?: Date) {
    return this.http.get<ValueOverTime>({
      url: route("/groups/statistics/purchase-price", {
        start: YYYY_MM_DD(start),
        end: YYYY_MM_DD(end),
      }),
    });
  }

  /**
   * Returns ths general statistics for the group. This mostly just
   * includes the totals for various group properties.
   */
  group() {
    return this.http.get<GroupStatistics>({
      url: route("/groups/statistics"),
    });
  }

  tags() {
    return this.http.get<TotalsByOrganizer[]>({
      url: route("/groups/statistics/tags"),
    });
  }

  locations() {
    return this.http.get<TotalsByOrganizer[]>({
      url: route("/groups/statistics/locations"),
    });
  }
}
