/**
 * Background music: one looping track per scene (globe / roadmap / city), quiz and
 * career-card overlays, a one-shot milestone sting, side-panel ducking and a
 * persisted mute toggle. Only one track is audible at a time; every change crossfades.
 * Narration and the waterfall ambience use their own audio paths and are untouched.
 */
const BASE = `${import.meta.env.BASE_URL}assets/music/`

const TRACKS = {
  globe: { file: 'nastelbom-fantasy-454036.mp3', loop: true },
  roadmap: { file: '40173586-magical-wizard-school-orchestral-fantasy-488126.mp3', loop: true },
  city: { file: 'loksii-no-copyright-music-211881.mp3', loop: true },
  quiz: { file: 'sigmamusicart-no-copyright-music-537751.mp3', loop: true },
  career: { file: 'vibemode-no-copyright-music-581670.mp3', loop: true },
  milestone: { file: 'prettyjohn1-no-copyright-music-498106.mp3', loop: false },
}

const VOLUME = 0.25
const DUCKED_VOLUME = 0.1
const SCENE_FADE = 2
const OVERLAY_FADE = 1.5
const DUCK_FADE = 0.6
const MUTE_FADE = 0.5
const UNLOCK_FADE = 1
const MILESTONE_MS = 10000
const STORAGE_KEY = 'cluster.musicMuted'

const state = {
  scene: 'globe',
  panelOpen: false,
  panelTab: null,
  career: false,
  milestone: false,
  muted: false,
}

const audios = {}
const ramps = new Map()
let current = null
let blocked = false
let ticker = 0
let milestoneTimer = 0
let button = null
let started = false
// Hidden tabs and tabs another Cluster tab took over stay silent.
let suspended = false
const TAB_ID = Math.random().toString(36).slice(2)
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('cluster-music') : null

function desiredKey() {
  if (state.milestone) return 'milestone'
  if (state.panelOpen && state.panelTab === 'quiz') return state.career ? 'career' : 'quiz'
  return state.scene
}

function targetVolume() {
  if (state.muted) return 0
  if (state.panelOpen && state.panelTab !== 'quiz') return DUCKED_VOLUME
  return VOLUME
}

function tick() {
  const now = performance.now()
  for (const [audio, r] of ramps) {
    const t = Math.min(1, (now - r.t0) / r.dur)
    audio.volume = Math.min(1, Math.max(0, r.from + (r.to - r.from) * t))
    if (t >= 1) {
      ramps.delete(audio)
      if (r.pauseAtEnd) audio.pause()
    }
  }
  if (!ramps.size) {
    clearInterval(ticker)
    ticker = 0
  }
}

function rampTo(audio, to, seconds, pauseAtEnd = false) {
  ramps.set(audio, {
    from: audio.volume,
    to,
    t0: performance.now(),
    dur: Math.max(1, seconds * 1000),
    pauseAtEnd,
  })
  if (!ticker) ticker = setInterval(tick, 40)
}

function startPlayback(audio) {
  if (!audio.paused) return
  audio.play().then(
    () => {
      blocked = false
    },
    () => {
      // Autoplay blocked: stay silent and retry on the first user gesture.
      blocked = true
    },
  )
}

function apply(fadeSeconds, volumeSeconds = fadeSeconds) {
  if (!started) return
  const key = desiredKey()
  if (suspended) {
    current = key
    return
  }
  if (key !== current) {
    if (current) rampTo(audios[current], 0, fadeSeconds, true)
    const next = audios[key]
    if (key === 'milestone' || next.paused) next.volume = 0
    if (key === 'milestone') next.currentTime = 0
    current = key
    startPlayback(next)
    rampTo(next, targetVolume(), fadeSeconds)
    return
  }
  rampTo(audios[current], targetVolume(), volumeSeconds)
}

function onFirstGesture() {
  if (suspended) {
    resume()
    return
  }
  if (!blocked || !current) return
  const audio = audios[current]
  audio.volume = 0
  startPlayback(audio)
  rampTo(audio, targetVolume(), UNLOCK_FADE)
}

function silenceAll(fadeSeconds) {
  for (const audio of Object.values(audios)) {
    if (audio.paused) continue
    if (fadeSeconds > 0) {
      rampTo(audio, 0, fadeSeconds, true)
    } else {
      ramps.delete(audio)
      audio.volume = 0
      audio.pause()
    }
  }
}

function suspend(fadeSeconds) {
  if (suspended) return
  suspended = true
  silenceAll(fadeSeconds)
}

function claim() {
  channel?.postMessage({ type: 'claim', id: TAB_ID })
}

function resume() {
  if (!started || document.visibilityState === 'hidden') return
  claim()
  if (!suspended) return
  suspended = false
  current = desiredKey()
  const audio = audios[current]
  audio.volume = 0
  startPlayback(audio)
  rampTo(audio, targetVolume(), UNLOCK_FADE)
}

function onChannelMessage(event) {
  if (event.data?.type === 'claim' && event.data.id !== TAB_ID) suspend(MUTE_FADE)
}

function onVisibilityChange() {
  // Timers are throttled in background tabs, so a fade would stall; pause outright.
  if (document.visibilityState === 'hidden') suspend(0)
  else resume()
}

function endMilestone() {
  clearTimeout(milestoneTimer)
  if (!state.milestone) return
  state.milestone = false
  apply(SCENE_FADE)
}

function renderButton() {
  if (!button) return
  button.classList.toggle('is-muted', state.muted)
  button.setAttribute('aria-pressed', String(state.muted))
  const label = state.muted ? 'Unmute music' : 'Mute music'
  button.setAttribute('aria-label', label)
  button.title = label
}

function createButton() {
  document.getElementById('music-toggle')?.remove()
  button = document.createElement('button')
  button.type = 'button'
  button.id = 'music-toggle'
  button.innerHTML = '<span class="music-note" aria-hidden="true">♪</span>'
  button.addEventListener('click', () => {
    music.toggleMute()
    // Keep Space/Enter for flight controls instead of re-toggling.
    button.blur()
  })
  document.body.appendChild(button)
  renderButton()
}

export const music = {
  init() {
    if (started) return
    started = true
    try {
      state.muted = localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      /* storage unavailable */
    }
    for (const [key, def] of Object.entries(TRACKS)) {
      const audio = new Audio()
      audio.preload = 'auto'
      audio.loop = def.loop
      audio.volume = 0
      audio.src = BASE + def.file
      audios[key] = audio
    }
    audios.milestone.addEventListener('ended', endMilestone)
    for (const type of ['pointerdown', 'keydown', 'touchstart']) {
      document.addEventListener(type, onFirstGesture, { capture: true, passive: true })
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', resume)
    channel?.addEventListener('message', onChannelMessage)
    createButton()
    if (document.visibilityState === 'hidden') {
      suspended = true
    } else {
      claim()
    }
    apply(SCENE_FADE)
  },

  /** 'globe' | 'roadmap' | 'city' */
  setScene(scene) {
    if (!scene || scene === state.scene) return
    state.scene = scene
    if (scene !== 'city') {
      state.panelOpen = false
      state.career = false
      if (state.milestone) {
        clearTimeout(milestoneTimer)
        state.milestone = false
      }
    }
    apply(SCENE_FADE)
  },

  setPanel(open, tab = null) {
    const nextTab = open ? tab : null
    if (open === state.panelOpen && nextTab === state.panelTab) return
    state.panelOpen = open
    state.panelTab = nextTab
    if (nextTab !== 'quiz') state.career = false
    apply(OVERLAY_FADE, DUCK_FADE)
  },

  setCareerVisible(visible) {
    if (visible === state.career) return
    state.career = visible
    apply(OVERLAY_FADE)
  },

  playMilestone() {
    clearTimeout(milestoneTimer)
    if (state.milestone && current === 'milestone') audios.milestone.currentTime = 0
    state.milestone = true
    apply(UNLOCK_FADE)
    milestoneTimer = setTimeout(endMilestone, MILESTONE_MS)
  },

  toggleMute() {
    state.muted = !state.muted
    try {
      localStorage.setItem(STORAGE_KEY, state.muted ? '1' : '0')
    } catch {
      /* storage unavailable */
    }
    renderButton()
    apply(MUTE_FADE)
  },

  get muted() {
    return state.muted
  },

  debug() {
    return {
      ...state,
      current,
      blocked,
      suspended,
      volumes: Object.fromEntries(
        Object.entries(audios).map(([k, a]) => [k, { vol: +a.volume.toFixed(3), paused: a.paused }]),
      ),
    }
  },
}

// A hot-reloaded copy of this module must not leave the old tracks playing.
import.meta.hot?.dispose(() => {
  started = false
  suspended = true
  clearTimeout(milestoneTimer)
  clearInterval(ticker)
  for (const audio of Object.values(audios)) audio.pause()
  for (const type of ['pointerdown', 'keydown', 'touchstart']) {
    document.removeEventListener(type, onFirstGesture, { capture: true })
  }
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('focus', resume)
  channel?.close()
  button?.remove()
})
