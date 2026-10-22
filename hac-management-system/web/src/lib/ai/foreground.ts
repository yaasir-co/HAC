/** Border-colour segmentation + connected components. Returns no mask for an unreliable/filled frame. */
export function foregroundRegion(
  rgb: Uint8Array,
  width: number,
  height: number,
) {
  const border: number[][] = [[], [], []];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (x < 3 || y < 3 || x >= width - 3 || y >= height - 3)
        for (let c = 0; c < 3; c++)
          border[c].push(rgb[(y * width + x) * 3 + c]);
  const median = border.map(
    (channel) =>
      channel.sort((a, b) => a - b)[Math.floor(channel.length / 2)] || 0,
  );
  const distances = border[0]
    .map((_, i) =>
      Math.hypot(...border.map((channel, c) => channel[i] - median[c])),
    )
    .sort((a, b) => a - b);
  const threshold = Math.max(
    35,
    Math.min(105, (distances[Math.floor(distances.length * 0.7)] || 0) * 1.3),
  );
  const raw = new Uint8Array(width * height);
  let occupied = 0;
  for (let i = 0; i < raw.length; i++) {
    raw[i] =
      Math.hypot(
        rgb[i * 3] - median[0],
        rgb[i * 3 + 1] - median[1],
        rgb[i * 3 + 2] - median[2],
      ) > threshold
        ? 1
        : 0;
    occupied += raw[i];
  }
  if (occupied < raw.length * 0.025 || occupied > raw.length * 0.85)
    return null;
  const seen = new Uint8Array(raw.length);
  let best: number[] = [],
    bestScore = 0;
  for (let i = 0; i < raw.length; i++) {
    if (!raw[i] || seen[i]) continue;
    const component = [i];
    seen[i] = 1;
    let cx = 0,
      cy = 0;
    for (let p = 0; p < component.length; p++) {
      const index = component[p],
        x = index % width,
        y = Math.floor(index / width);
      cx += x;
      cy += y;
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        const nx = x + dx,
          ny = y + dy,
          ni = ny * width + nx;
        if (
          nx >= 0 &&
          ny >= 0 &&
          nx < width &&
          ny < height &&
          raw[ni] &&
          !seen[ni]
        ) {
          seen[ni] = 1;
          component.push(ni);
        }
      }
    }
    const distance =
        Math.hypot(
          cx / component.length - width / 2,
          cy / component.length - height / 2,
        ) / Math.max(width, height),
      score = component.length * (1 - Math.min(0.8, distance));
    if (score > bestScore) {
      best = component;
      bestScore = score;
    }
  }
  if (best.length < raw.length * 0.025) return null;
  const mask = new Uint8Array(raw.length);
  let minX = width,
    minY = height,
    maxX = 0,
    maxY = 0;
  for (const index of best) {
    const x = index % width,
      y = Math.floor(index / width);
    mask[index] = 1;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  // Fill interior gaps, retaining the whole package rather than cutting its printed label into fragments.
  for (let y = minY; y <= maxY; y++) {
    let first = width,
      last = -1;
    for (let x = minX; x <= maxX; x++)
      if (mask[y * width + x]) {
        first = Math.min(first, x);
        last = x;
      }
    for (let x = first; x <= last; x++) mask[y * width + x] = 1;
  }
  const padding = 3;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(width - 1, maxX + padding);
  maxY = Math.min(height - 1, maxY + padding);
  if ((maxX - minX) * (maxY - minY) > raw.length * 0.9) return null;
  return {
    mask,
    bounds: {
      x: minX / width,
      y: minY / height,
      width: (maxX - minX + 1) / width,
      height: (maxY - minY + 1) / height,
    },
  };
}
export function frameDifference(
  previous: Uint8Array | undefined,
  current: Uint8Array,
) {
  if (!previous || previous.length !== current.length) return 1;
  let difference = 0;
  for (let i = 0; i < current.length; i++)
    difference += Math.abs(current[i] - previous[i]);
  return difference / current.length / 255;
}
