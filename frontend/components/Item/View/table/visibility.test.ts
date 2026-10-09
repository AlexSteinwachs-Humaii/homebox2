import { describe, expect, it } from "vitest";
import { createTable, getCoreRowModel, type VisibilityState } from "@tanstack/vue-table";
import { withVisibleColumns } from "./visibility";

describe("homepage column visibility", () => {
  it.each<VisibilityState>([
    { name: true, assetId: false, quantity: true },
    { name: true, assetId: false, quantity: false },
    { name: true },
  ])("shows the original asset ID without changing saved visibility (%j)", saved => {
    const before = { ...saved };
    const table = createTable({
      data: [{ id: "uuid", name: "Asset", assetId: "000042" }],
      columns: [{ accessorKey: "name" }, { accessorKey: "assetId" }],
      state: { columnVisibility: withVisibleColumns(saved, ["assetId"]), columnPinning: {} },
      getCoreRowModel: getCoreRowModel(),
      onStateChange: () => {},
      renderFallbackValue: null,
    });
    const cells = table.getRowModel().rows[0]!.getVisibleCells();
    expect(cells.find(cell => cell.column.id === "assetId")?.getValue()).toBe("000042");
    expect(saved).toEqual(before);
    expect(withVisibleColumns(saved)).toEqual(saved);
  });
});
