import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Returns the singular form when |count| === 1, else the plural. Defaults the
// plural to `singular + "s"` but accepts an explicit form for all-caps or
// irregular labels ("REP"/"REPS", "EXERCISE"/"EXERCISES"). Nullish counts fall
// back to the plural form.
export function plural(count: number | null | undefined, singular: string, pluralForm?: string) {
  return Math.abs(count ?? NaN) === 1 ? singular : pluralForm ?? `${singular}s`
}
