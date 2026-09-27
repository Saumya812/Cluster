/**
 * Fire-and-forget ElevenLabs narration via /api/narrate.
 * Failures are silent — never block UI.
 */

let audioCtx = null
let currentSource = null

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
      if (!res.ok) return
      const buf = await res.arrayBuffer()
      if (!buf || buf.byteLength < 32) return

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
