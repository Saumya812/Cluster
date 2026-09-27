/**
 * DoIT career outcomes per city (GET /api/career-outcomes), fetched once per city.
 */
const pending = new Map()
const resolved = new Map()

export function fetchCareerOutcomes(cityId) {
  const city = cityId || 'ml'
  if (resolved.has(city)) return Promise.resolve(resolved.get(city))
  if (!pending.has(city)) {
    const req = fetch(`/api/career-outcomes?city=${encodeURIComponent(city)}`)
      .then((r) => r.json())
      .then((data) => (data?.error ? null : data))
      .catch(() => null)
      .then((data) => {
        pending.delete(city)
        if (data) resolved.set(city, data)
        return data
      })
    pending.set(city, req)
  }
  return pending.get(city)
}

/** Synchronous read; null until fetchCareerOutcomes(city) has resolved. */
export function getCachedCareerOutcomes(cityId) {
  return resolved.get(cityId || 'ml') || null
}

export function formatSalary(n) {
  return Number.isFinite(n) ? `$${Math.round(n).toLocaleString('en-US')}` : '—'
}
