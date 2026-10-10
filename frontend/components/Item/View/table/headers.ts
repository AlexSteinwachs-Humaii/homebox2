export type TableHeader = { value: string; enabled: boolean };

/** A surface preset is a starting point, never a replacement for saved settings.
 * Keep unshown columns in the settings dialog so users can still enable them.
 */
export function initialTableHeaders(
  columnIds: string[],
  saved: TableHeader[] | undefined,
  visible: string[],
  preset?: string[]
): TableHeader[] {
  if (saved !== undefined) return saved;
  const order = preset
    ? [...preset.filter(id => columnIds.includes(id)), ...columnIds.filter(id => !preset.includes(id))]
    : columnIds;
  return order.map(value => ({
    value,
    enabled: (preset ?? visible).includes(value),
  }));
}
