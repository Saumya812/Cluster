/**
 * Fire-and-forget ElevenLabs narration via /api/narrate.
 * Falls back to the browser's built-in voice if the server has no audio.
 * Failures are silent — never block UI.
 */

let audioCtx = null
let currentSource = null

function speakWithBrowser(line) {
  const synth = window.speechSynthesis
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return
  try {
    synth.cancel()
    synth.speak(new SpeechSynthesisUtterance(line))
  } catch {
    /* ignore */
  }
}

function getAudioContext() {
  if (audioCtx) return audioCtx
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  audioCtx = new Ctx()
  return audioCtx
}

/**
 * Speak a line without awaiting. Safe to call from anywhere.
 * @param {string} text
 */
export function narrate(text) {
  const line = (text || '').trim()
  if (!line) return

  void (async () => {
    try {
      const res = await fetch('/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: line }),
      })
      const buf = res.ok ? await res.arrayBuffer() : null
      if (!buf || buf.byteLength < 32) {
        speakWithBrowser(line)
        return
      }

      const ctx = getAudioContext()
      if (!ctx) return
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume()
        } catch {
          return
        }
      }

      const decoded = await ctx.decodeAudioData(buf.slice(0))
      try {
        currentSource?.stop?.()
      } catch {
        /* ignore */
      }
      const source = ctx.createBufferSource()
      source.buffer = decoded
      source.connect(ctx.destination)
      currentSource = source
      source.start(0)
    } catch {
      /* silent */
    }
  })()
}
