export function cn(...values: (string | undefined | null | false)[]) {
  return values.filter(Boolean).join(' ')
}
