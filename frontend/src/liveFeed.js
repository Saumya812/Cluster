// Connects to the live_server.py WebSocket feed and turns each push event
// into a brief flash on the matching building plus a corner toast.

const WS_URL = 'ws://localhost:8000/ws'
const RECONNECT_DELAY_MS = 5000
const FLASH_DURATION_MS = 1500
const TOAST_DURATION_MS = 3000

function createToastContainer() {
  const existing = document.getElementById('push-toast-container')
  if (existing) return existing
  const container = document.createElement('div')
  container.id = 'push-toast-container'
  document.body.appendChild(container)
  return container
}

function showToast(container, message) {
  const toast = document.createElement('div')
  toast.className = 'push-toast'
  toast.textContent = message
  container.appendChild(toast)
  // Fade out before removing rather than popping out instantly -- matches
  // the fade-in it already had coming in.
  setTimeout(() => toast.classList.add('push-toast-out'), TOAST_DURATION_MS)
  setTimeout(() => toast.remove(), TOAST_DURATION_MS + 350)
}

// A short, synthesized two-note blip -- no audio asset needed. Browsers
// refuse to start an AudioContext before a user gesture, so this is built
// lazily on the first push event (well after the page's initial click to
// enter flight mode) rather than at module load time.
let audioCtx = null
function playPushChime() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)()
    const now = audioCtx.currentTime
    const gain = audioCtx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)
    gain.connect(audioCtx.destination)

    const osc = audioCtx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, now)
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12)
    osc.connect(gain)
    osc.start(now)
    osc.stop(now + 0.24)
  } catch {
    // Audio is a nice-to-have; never let it break the live feed.
  }
}

// buildingIndex: Map<full_name, { mesh: THREE.InstancedMesh, localIndex: number }>
// built by main.js while it constructs the batched InstancedMeshes -- each
// mesh's geometry is expected to carry an 'instanceFlash' float attribute
// (see patchMaterialForInstancing in main.js) that the shader reads to add
// a temporary emissive/diffuse boost.
// onPush: optional callback invoked once per handled push event (used by
// the HUD stats panel to keep a running "live pushes seen" count).
export function createLiveFeed(buildingIndex, onPush) {
  // Keyed by full_name so concurrent flashes on different buildings never
  // clobber each other; each entry tracks its own independent start time.
  const activeFlashes = new Map()
  const toastContainer = createToastContainer()

  function triggerFlash(fullName) {
    const target = buildingIndex.get(fullName)
    if (!target) {
      console.log(`no matching building found for: ${fullName}`)
      return // repo not in this city (shouldn't normally happen)
    }
    console.log(`flashing building: ${fullName}`)
    activeFlashes.set(fullName, { ...target, startTime: performance.now() })
  }

  function handleEvent({ repo, username }) {
    triggerFlash(repo)
    showToast(toastContainer, `${username} just pushed to ${repo}`)
    playPushChime()
    onPush?.()
  }

  function connect() {
    const ws = new WebSocket(WS_URL)

    ws.addEventListener('message', (event) => {
      try {
        handleEvent(JSON.parse(event.data))
      } catch (err) {
        console.error('liveFeed: failed to handle message', err)
      }
    })

    ws.addEventListener('open', () => {
      console.log('WebSocket connected:', WS_URL)
    })

    ws.addEventListener('close', () => {
      console.log(`liveFeed: disconnected, retrying in ${RECONNECT_DELAY_MS / 1000}s`)
      setTimeout(connect, RECONNECT_DELAY_MS)
    })

    ws.addEventListener('error', (event) => {
      console.error('WebSocket error:', event)
      ws.close() // close handler above schedules the reconnect
    })
  }

  connect()

  // Call once per frame from the main animation loop. Lerps each active
  // flash back down to zero over FLASH_DURATION_MS and writes the result
  // into that building's own instanceFlash slot.
  function update() {
    if (activeFlashes.size === 0) return

    const now = performance.now()
    const dirtyAttributes = new Set()
    const finished = []

    for (const [fullName, flash] of activeFlashes) {
      const t = Math.min((now - flash.startTime) / FLASH_DURATION_MS, 1)
      const intensity = 1 - t // simple linear fade-out

      const attr = flash.mesh.geometry.attributes.instanceFlash
      attr.array[flash.localIndex] = intensity
      dirtyAttributes.add(attr)

      if (t >= 1) finished.push(fullName)
    }

    for (const fullName of finished) activeFlashes.delete(fullName)
    for (const attr of dirtyAttributes) attr.needsUpdate = true
  }

  return { update, handleEvent }
}
