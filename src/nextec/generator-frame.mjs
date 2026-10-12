export function generatorHeight(event, origin, source) {
  if (!source || event.origin !== origin || event.source !== source || event.data?.type !== 'nextec-generator-ready') return null
  const height = event.data.height
  // A loaded iframe under v-show can report zero before its tab becomes visible.
  return typeof height === 'number' && Number.isFinite(height) && height >= 0 && height <= 30000 ? Math.max(480, height) : null
}
