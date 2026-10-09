import { readonly, ref } from "vue";
import type { StatsAPI } from "~~/lib/api/classes/stats";
import { downloadBlob } from "~~/lib/download";

/** Create the tenant-scoped client at click time, not when the dashboard mounts. */
export function useDashboardExport(getStats: () => StatsAPI, save = downloadBlob) {
  const exporting = ref(false);
  const failed = ref(false);

  async function exportCSV(start?: Date, end?: Date) {
    if (exporting.value) {
      return;
    }
    exporting.value = true;
    failed.value = false;
    try {
      // Capture filters before awaiting anything; subsequent UI changes cannot affect this request.
      const stats = getStats();
      const blob = await stats.exportCSV(start && new Date(start), end && new Date(end));
      save(blob, "homebox-dashboard-summary.csv");
    } catch {
      failed.value = true;
    } finally {
      exporting.value = false;
    }
  }

  return {
    exporting: readonly(exporting),
    failed: readonly(failed),
    exportCSV,
  };
}
