// Interactive city map, repo search, stats, and Gemini tour guide.
import * as THREE from 'three'

const MINIMAP_SIZE = 220
const SEARCH_RESULT_LIMIT = 8
const API_BASE = '' // Vite proxies /api → live_server

function createMinimapBase(repos, colorMap, bounds, districtCenters) {
  const canvas = document.createElement('canvas')
  canvas.width = MINIMAP_SIZE
  canvas.height = MINIMAP_SIZE
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#050814'
  ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE)

  const { minX, maxX, minZ, maxZ } = bounds
  const spanX = Math.max(maxX - minX, 1)
  const spanZ = Math.max(maxZ - minZ, 1)

  for (const repo of repos) {
    const px = ((repo.x - minX) / spanX) * MINIMAP_SIZE
    const py = ((repo.z - minZ) / spanZ) * MINIMAP_SIZE
    ctx.fillStyle = colorMap.get(repo.district)?.getStyle() ?? '#8899cc'
    ctx.fillRect(px, py, 1.2, 1.2)
  }

  // District labels (top districts only so the map stays readable).
  const labeled = [...districtCenters]
    .sort((a, b) => b.repo_count - a.repo_count)
    .slice(0, 14)
  ctx.font = '600 9px Sora, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const d of labeled) {
    const px = ((d.cx - minX) / spanX) * MINIMAP_SIZE
    const py = ((d.cz - minZ) / spanZ) * MINIMAP_SIZE
    const label = d.name.length > 12 ? `${d.name.slice(0, 11)}…` : d.name
    ctx.fillStyle = 'rgba(5, 8, 20, 0.65)'
    ctx.fillRect(px - 28, py - 7, 56, 14)
    ctx.fillStyle = '#e8eef8'
    ctx.fillText(label, px, py)
  }

  return canvas
}

function buildDistrictCenters(repos) {
  const map = new Map()
  for (const repo of repos) {
    const bucket = map.get(repo.district) || {
      name: repo.district,
      repo_count: 0,
      stars: 0,
      sum_x: 0,
      sum_z: 0,
    }
    bucket.repo_count += 1
    bucket.stars += repo.stars || 0
    bucket.sum_x += repo.x
    bucket.sum_z += repo.z
    map.set(repo.district, bucket)
  }
  return [...map.values()].map((b) => ({
    name: b.name,
    repo_count: b.repo_count,
    stars: b.stars,
    cx: b.sum_x / b.repo_count,
    cz: b.sum_z / b.repo_count,
  }))
}

function nearestDistrict(districtCenters, x, z) {
  let best = null
  let bestDist = Infinity
  for (const d of districtCenters) {
    const dist = Math.hypot(d.cx - x, d.cz - z)
    if (dist < bestDist) {
      bestDist = dist
      best = d
    }
  }
  return best
}

function createMlMinimapBase(mapLayout) {
  const canvas = document.createElement('canvas')
  canvas.width = MINIMAP_SIZE
  canvas.height = MINIMAP_SIZE
  const ctx = canvas.getContext('2d')
  const { minX, maxX, minZ, maxZ } = mapLayout.bounds
  const spanX = Math.max(maxX - minX, 1)
  const spanZ = Math.max(maxZ - minZ, 1)

  const toMap = (x, z) => [
    ((x - minX) / spanX) * MINIMAP_SIZE,
    ((z - minZ) / spanZ) * MINIMAP_SIZE,
  ]

  ctx.fillStyle = '#050814'
  ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE)

  // Filler lots
  ctx.fillStyle = 'rgba(90, 106, 136, 0.55)'
  for (const f of mapLayout.fillers || []) {
    const [px, py] = toMap(f.x, f.z)
    ctx.fillRect(px - 1.1, py - 1.1, 2.2, 2.2)
  }

  // Avenues
  ctx.strokeStyle = 'rgba(26, 28, 38, 0.95)'
  ctx.lineWidth = 5
  for (const x of mapLayout.avenues || []) {
    const [px] = toMap(x, minZ)
    ctx.beginPath()
    ctx.moveTo(px, 0)
    ctx.lineTo(px, MINIMAP_SIZE)
    ctx.stroke()
  }

  // Named streets
  for (const street of mapLayout.streets || []) {
    const [, py] = toMap(0, street.z)
    ctx.strokeStyle = street.color || '#3de7ff'
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(0, py)
    ctx.lineTo(MINIMAP_SIZE, py)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // Plaza + growth tower
  const [gx, gz] = toMap(0, 0)
  const plazaR =
    ((mapLayout.plazaRadius || 15) / Math.max(spanX, spanZ)) * MINIMAP_SIZE
  ctx.fillStyle = 'rgba(18, 24, 42, 0.95)'
  ctx.beginPath()
  ctx.arc(gx, gz, plazaR, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(45, 90, 52, 0.9)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = '#3de7ff'
  ctx.beginPath()
  ctx.arc(gx, gz, 4, 0, Math.PI * 2)
  ctx.fill()

  // Topic buildings
  for (const t of mapLayout.topics || []) {
    const [px, py] = toMap(t.x, t.z)
    ctx.fillStyle = t.color || '#ffb347'
    ctx.fillRect(px - 2.4, py - 2.4, 4.8, 4.8)
  }

  // Amusement park
  if (mapLayout.amusementPark) {
    const [ax, ay] = toMap(mapLayout.amusementPark.x, mapLayout.amusementPark.z)
    ctx.fillStyle = 'rgba(255, 77, 109, 0.35)'
    ctx.beginPath()
    ctx.arc(ax, ay, 14, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#ff4d6d'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = '#ffe08a'
    ctx.font = '700 9px Bebas Neue, Sora, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('PARK', ax, ay + 3)
  }

  // Street labels
  ctx.font = '600 9px Sora, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  for (const street of mapLayout.streets || []) {
    const [, py] = toMap(0, street.z)
    const label =
      street.name.length > 14 ? `${street.name.slice(0, 13)}…` : street.name
    ctx.fillStyle = 'rgba(5, 8, 20, 0.7)'
    ctx.fillRect(6, py - 7, Math.min(92, label.length * 6.2), 14)
    ctx.fillStyle = street.color || '#e8eef8'
    ctx.fillText(label, 10, py)
  }

  // Legend note
  ctx.fillStyle = 'rgba(232,238,248,0.45)'
  ctx.font = '500 8px Sora, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('■ topic  ✦ growth  ● park', 8, MINIMAP_SIZE - 8)

  return canvas
}

export function createHud({
  repos,
  colorMap,
  camera,
  flyTo,
  flyToPoint,
  mode = 'cluster',
  placeLabel = null,
  mapLayout = null,
  growthInfo = null,
}) {
  let growth = growthInfo
  const xs = repos.map((r) => r.x)
  const zs = repos.map((r) => r.z)
  const bounds = mapLayout?.bounds || {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  }
  const districtCenters = mapLayout?.streets
    ? mapLayout.streets.map((s) => ({
        name: s.name,
        repo_count: (mapLayout.topics || []).filter((t) => t.streetName === s.name)
          .length,
        stars: 0,
        cx: s.cx ?? 0,
        cz: s.cz ?? s.z,
      }))
    : buildDistrictCenters(repos)

  const totalStars = repos.reduce((sum, r) => sum + (r.stars || 0), 0)
  const districtCount = districtCenters.length

  const statLine = document.getElementById('hud-stat-line')
  const locationLine = document.getElementById('hud-location')
  let pushCount = 0
  let currentDistrict = null

  function renderStats() {
    if (mode === 'nyc') {
      statLine.innerHTML =
        `<span class="stat-em">${repos.length.toLocaleString()}</span> buildings · ` +
        `<span class="stat-em">Midtown</span> · ` +
        `<span class="stat-live">${placeLabel || 'New York'}</span>`
    } else if (mode === 'ml') {
      const topics = mapLayout?.topics?.length ?? repos.length
      const streets = mapLayout?.streets?.length ?? districtCount
      const done = growth?.completed ?? 0
      const total = growth?.totalBuildings ?? topics
      statLine.innerHTML =
        `<span class="stat-em">${topics}</span> topics · ` +
        `<span class="stat-em">${streets}</span> streets · ` +
        `<span class="stat-live">${done}/${total}</span> complete`
    } else {
      statLine.innerHTML =
        `<span class="stat-em">${repos.length.toLocaleString()}</span> towers · ` +
        `<span class="stat-em">${districtCount}</span> districts · ` +
        `<span class="stat-em">${totalStars.toLocaleString()}</span> ★ · ` +
        `<span class="stat-live">${pushCount.toLocaleString()}</span> live pushes`
    }
  }
  renderStats()

  function recordPush() {
    pushCount++
    if (mode !== 'ml') renderStats()
  }

  // ---- Interactive map (compass-gated) ------------------------------------
  const mapWrap = document.getElementById('map-wrap')
  const compassBtn = document.getElementById('compass-btn')
  const mapClose = document.getElementById('map-close')
  const minimapCanvas = document.getElementById('minimap')
  minimapCanvas.width = MINIMAP_SIZE
  minimapCanvas.height = MINIMAP_SIZE
  minimapCanvas.style.pointerEvents = 'auto'
  minimapCanvas.style.cursor = 'crosshair'
  minimapCanvas.title = 'Click to fly'
  const minimapCtx = minimapCanvas.getContext('2d')
  const baseLayer =
    mode === 'ml' && mapLayout
      ? createMlMinimapBase(mapLayout)
      : createMinimapBase(repos, colorMap, bounds, districtCenters)
  const dirVector = new THREE.Vector3()

  function setMapOpen(open) {
    if (!mapWrap || !compassBtn) return
    if (open) {
      mapWrap.hidden = false
      compassBtn.classList.add('is-hidden')
    } else {
      mapWrap.hidden = true
      compassBtn.classList.remove('is-hidden')
    }
  }

  // Default: map closed, compass visible (especially for ML city).
  setMapOpen(false)

  compassBtn?.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    setMapOpen(true)
  })
  compassBtn?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setMapOpen(true)
    }
  })
  mapClose?.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    setMapOpen(false)
  })

  function worldToMinimap(x, z) {
    return [
      ((x - bounds.minX) / Math.max(bounds.maxX - bounds.minX, 1)) * MINIMAP_SIZE,
      ((z - bounds.minZ) / Math.max(bounds.maxZ - bounds.minZ, 1)) * MINIMAP_SIZE,
    ]
  }

  function minimapToWorld(px, py) {
    const x =
      bounds.minX + (px / MINIMAP_SIZE) * Math.max(bounds.maxX - bounds.minX, 1)
    const z =
      bounds.minZ + (py / MINIMAP_SIZE) * Math.max(bounds.maxZ - bounds.minZ, 1)
    return { x, z }
  }

  function renderMinimap() {
    if (mapWrap?.hidden) return
    minimapCtx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE)
    minimapCtx.drawImage(baseLayer, 0, 0)

    camera.getWorldDirection(dirVector)
    const yaw = Math.atan2(dirVector.x, dirVector.z)
    const [px, py] = worldToMinimap(camera.position.x, camera.position.z)

    minimapCtx.save()
    minimapCtx.translate(px, py)
    minimapCtx.rotate(yaw)
    minimapCtx.fillStyle = '#ffb347'
    minimapCtx.strokeStyle = 'rgba(61,231,255,0.55)'
    minimapCtx.beginPath()
    minimapCtx.moveTo(0, -7)
    minimapCtx.lineTo(5, 6)
    minimapCtx.lineTo(-5, 6)
    minimapCtx.closePath()
    minimapCtx.fill()
    minimapCtx.stroke()
    minimapCtx.restore()

    const near = nearestDistrict(districtCenters, camera.position.x, camera.position.z)
    if (near && near.name !== currentDistrict?.name) {
      currentDistrict = near
      if (locationLine && mode !== 'ml') {
        locationLine.innerHTML =
          `Near <span class="stat-live">${near.name}</span> · ` +
          `${near.repo_count.toLocaleString()} towers`
      } else if (locationLine && mode === 'ml') {
        locationLine.innerHTML = `Near <span class="stat-live">${near.name}</span>`
      }
    }
  }

  minimapCanvas.addEventListener('click', (event) => {
    const rect = minimapCanvas.getBoundingClientRect()
    const px = ((event.clientX - rect.left) / rect.width) * MINIMAP_SIZE
    const py = ((event.clientY - rect.top) / rect.height) * MINIMAP_SIZE
    const { x, z } = minimapToWorld(px, py)

    if (mode === 'ml' && mapLayout?.topics?.length) {
      let best = null
      let bestD = 18
      for (const t of mapLayout.topics) {
        const d = Math.hypot(t.x - x, t.z - z)
        if (d < bestD) {
          bestD = d
          best = t
        }
      }
      if (best && flyToPoint) {
        flyToPoint(best.x, best.z, best.name)
        return
      }
    }

    const district = nearestDistrict(districtCenters, x, z)
    if (district && flyToPoint) {
      flyToPoint(district.cx, district.cz, district.name)
      appendGuideNote(`Flying to ${district.name}…`)
    }
  })

  // ---- Search -------------------------------------------------------------
  const searchInput = document.getElementById('hud-search-input')
  const resultsBox = document.getElementById('hud-search-results')

  function clearResults() {
    resultsBox.innerHTML = ''
    resultsBox.hidden = true
  }

  function selectRepo(repo) {
    flyTo(repo)
    searchInput.value = repo.full_name
    searchInput.blur()
    clearResults()
  }

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase()
    if (query.length < 2) {
      clearResults()
      return
    }

    // Match districts first, then repos.
    const districtHits = districtCenters
      .filter((d) => d.name.toLowerCase().includes(query))
      .slice(0, 4)
    const matches = []
    for (const repo of repos) {
      if (repo.full_name.toLowerCase().includes(query)) {
        matches.push(repo)
        if (matches.length >= SEARCH_RESULT_LIMIT) break
      }
    }

    if (districtHits.length === 0 && matches.length === 0) {
      resultsBox.innerHTML = '<div class="hud-search-empty">No matches</div>'
      resultsBox.hidden = false
      return
    }

    resultsBox.innerHTML = ''
    for (const d of districtHits) {
      const row = document.createElement('div')
      row.className = 'hud-search-result hud-search-district'
      row.textContent = `District · ${d.name}`
      row.addEventListener('click', () => {
        flyToPoint?.(d.cx, d.cz, d.name)
        searchInput.value = d.name
        searchInput.blur()
        clearResults()
      })
      resultsBox.appendChild(row)
    }
    for (const repo of matches) {
      const row = document.createElement('div')
      row.className = 'hud-search-result'
      row.textContent = repo.full_name
      row.addEventListener('click', () => selectRepo(repo))
      resultsBox.appendChild(row)
    }
    resultsBox.hidden = false
  })

  searchInput.addEventListener('keydown', (event) => {
    event.stopPropagation()
    if (event.key === 'Enter') {
      const first = resultsBox.querySelector('.hud-search-result')
      if (first) first.click()
    } else if (event.key === 'Escape') {
      searchInput.blur()
      clearResults()
    }
  })

  // ---- Gemini tour guide --------------------------------------------------
  const guideInput = document.getElementById('guide-input')
  const guideAsk = document.getElementById('guide-ask')
  const guideLog = document.getElementById('guide-log')
  let guideBusy = false

  function appendGuideNote(text, kind = 'note') {
    if (!guideLog) return
    const bubble = document.createElement('div')
    bubble.className = `guide-bubble guide-${kind}`
    bubble.textContent = text
    guideLog.appendChild(bubble)
    guideLog.scrollTop = guideLog.scrollHeight
  }

  async function askGuide(question) {
    if (!question || guideBusy) return
    guideBusy = true
    appendGuideNote(question, 'you')
    appendGuideNote('Guide is thinking…', 'note')
    if (guideAsk) guideAsk.disabled = true

    try {
      const response = await fetch(`${API_BASE}/api/guide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          near_district: currentDistrict?.name ?? null,
        }),
      })
      const data = await response.json()
      // Remove the "thinking" note
      const last = guideLog?.lastElementChild
      if (last?.classList.contains('guide-note')) last.remove()
      appendGuideNote(data.answer || 'No reply.', data.ok ? 'guide' : 'error')
    } catch (err) {
      const last = guideLog?.lastElementChild
      if (last?.classList.contains('guide-note')) last.remove()
      appendGuideNote(
        'Guide offline — start live_server (uvicorn live_server:app) and add GEMINI_API_KEY.',
        'error',
      )
    } finally {
      guideBusy = false
      if (guideAsk) guideAsk.disabled = false
    }
  }

  guideAsk?.addEventListener('click', () => {
    const q = guideInput?.value.trim()
    if (!q) return
    guideInput.value = ''
    askGuide(q)
  })

  guideInput?.addEventListener('keydown', (event) => {
    event.stopPropagation()
    if (event.key === 'Enter') {
      event.preventDefault()
      guideAsk?.click()
    }
  })

  document.querySelectorAll('[data-guide-prompt]').forEach((btn) => {
    btn.addEventListener('click', () => {
      askGuide(btn.getAttribute('data-guide-prompt'))
    })
  })

  appendGuideNote(
    mode === 'nyc'
      ? 'You are over Midtown. Ask me about landmarks, where to fly, or street tips.'
      : mode === 'ml'
        ? 'Fly the plane through topic streets. Open the compass for a live city map.'
        : 'Ask me about districts, where to fly, or what a topic neighborhood is known for.',
    'guide',
  )

  return {
    update() {
      renderMinimap()
    },
    recordPush,
    setGrowthInfo(info) {
      growth = info
      renderStats()
    },
  }
}
