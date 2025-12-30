export function formatExerciseName(name: string): string {
  if (!name) return name
  return name.replace(/(^|[\s\-–—/()])([a-z])/g, (_match, prefix, letter) => {
    return `${prefix}${letter.toUpperCase()}`
  })
}
