export type SortDirection = "asc" | "desc";

type SortValue = string | number | null | undefined;

const TABLE_TEXT_COLLATOR = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

export function compareTableText(left: string, right: string): number {
  return TABLE_TEXT_COLLATOR.compare(left, right);
}

export function compareSortValues(
  left: SortValue,
  right: SortValue,
  direction: SortDirection
): number {
  const leftMissing = left === null || left === undefined || left === "";
  const rightMissing = right === null || right === undefined || right === "";
  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;

  const comparison =
    typeof left === "number" && typeof right === "number"
      ? left - right
      : TABLE_TEXT_COLLATOR.compare(String(left), String(right));
  return direction === "asc" ? comparison : -comparison;
}
