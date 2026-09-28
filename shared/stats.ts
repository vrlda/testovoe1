type Rate = { result: number; started: number };

// 95% Wald interval for the difference of two proportions (B − A), in percentage points.
// Crude at small samples, but enough to tell a reader when a gap is still noise.
export function differenceInterval(a: Rate, b: Rate) {
  if (!a.started || !b.started) return null;
  const pa = a.result / a.started,
    pb = b.result / b.started;
  const margin = 1.96 * Math.sqrt((pa * (1 - pa)) / a.started + (pb * (1 - pb)) / b.started) * 100;
  const difference = (pb - pa) * 100;
  return { difference, low: difference - margin, high: difference + margin };
}
