export function generatorHeight(event, origin, source) {
  if (!source || event.origin !== origin || event.source !== source || event.data?.type !== 'nextec-generator-ready') return null
  const height = Number(event.data.height)
  return Number.isFinite(height) && height >= 100 && height <= 30000 ? Math.max(480, height) : null
}
