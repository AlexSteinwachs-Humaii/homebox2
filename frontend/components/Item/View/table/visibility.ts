import type { VisibilityState } from "@tanstack/vue-table";

/** Surface-specific visibility overrides never mutate the user's inventory preferences. */
export function withVisibleColumns(visibility: VisibilityState, visibleColumns: string[] = []): VisibilityState {
  if (visibleColumns.length === 0) return visibility;
  return {
    ...visibility,
    ...Object.fromEntries(visibleColumns.map(id => [id, true])),
  };
}
