/** Locate ADP's eight-column printed table using its continuous gray borders. */
export function scheduleImageGrid(image: { width: number; height: number; data: Uint8ClampedArray }): { columns: number[]; rows: number[] } | null {
  const { width, height, data } = image;
  const dark = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    return data[offset] < 215 && data[offset + 1] < 215 && data[offset + 2] < 215;
  };
  const groups = (values: number[]) => {
    const result: number[][] = [];
    for (const value of values) {
      if (!result.length || value - result[result.length - 1].at(-1)! > 3) result.push([]);
      result[result.length - 1].push(value);
    }
    return result.map(group => Math.round((group[0] + group[group.length - 1]) / 2));
  };
  const horizontal: number[] = [];
  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = 0; x < width; x += 2) if (dark(x, y)) count++;
    if (count > width * 0.32) horizontal.push(y);
  }
  const rows = groups(horizontal);
  if (rows.length < 3) return null;
  const top = rows[0], bottom = rows[rows.length - 1];
  const vertical: number[] = [];
  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let y = top; y <= bottom; y += 2) if (dark(x, y)) count++;
    if (count > (bottom - top) * 0.38) vertical.push(x);
  }
  const columns = groups(vertical);
  if (columns.length !== 9) return null;
  const step = (columns[8] - columns[0]) / 8;
  if (columns.some((x, index) => Math.abs(x - columns[0] - index * step) > step * 0.12)) return null;
  return { columns, rows };
}

export function hasScheduleInk(image: { width: number; height: number; data: Uint8ClampedArray }, left = 0, top = 0, right = image.width, bottom = image.height): boolean {
  let ink = 0;
  for (let y = Math.ceil(top); y < bottom; y += 2) for (let x = Math.ceil(left); x < right; x += 2) {
    const offset = (y * image.width + x) * 4;
    if (image.data[offset] < 150 && image.data[offset + 1] < 150 && image.data[offset + 2] < 150 && ++ink > 5) return true;
  }
  return false;
}
