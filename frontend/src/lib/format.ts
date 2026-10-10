export function formatFare(amount: number): string {
  return `₹${amount.toFixed(2)}`
}

export function titleCase(value: string): string {
  return value.replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
}
