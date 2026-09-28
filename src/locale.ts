// Display supplied configuration text without changing its locale or stored values.
export const text = (value: string): string => value;

export function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Something went wrong. Please try again.';
}

export const percent = (part: number, total: number) =>
  total
    ? `${((part / total) * 100).toLocaleString('en-AU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
    : '—';
