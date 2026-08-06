/**
 * Timer audio — Metis-style Web Speech TTS + Web Audio ticks/bell.
 * Announcements: browser speechSynthesis only (no recording / cloud TTS).
 * Effects: Web Audio oscillators (MP3 fallback optional if assets exist).
 */

let audioCtx = null
let masterGain = null
let masterVolume = 1
let audioUnlocked = false

const MIN_MASTER_VOLUME = 0.35
const DEFAULT_MASTER_VOLUME = 1
const RESUME_TIMEOUT_MS = 2000
const UNLOCK_TOTAL_TIMEOUT_MS = 15000

/** Optional MP3 fallbacks for synthesized effects (not for voice announcements). */
const FALLBACK_URLS = {
  // No bundled tick/bell MP3s — Web Audio is primary. Keys kept for API parity.
}

const fallbackCache = {}

const ANNOUNCEMENT_TEXT = {
  'game-start': 'Game Start.',
  'blinds-up': 'Next Level. Blinds Up.',
  'break-time': 'Break Time.',
}

function logAudio(...args) {
  console.log('[audio]', ...args)
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[audio] timeout: ${label} after ${ms}ms`))
    }, ms)
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function ensureCtx() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx) {
    logAudio('AudioContext unsupported')
    return null
  }
  if (!audioCtx) {
    audioCtx = new AudioCtx()
    masterGain = audioCtx.createGain()
    masterGain.gain.value = masterVolume
    masterGain.connect(audioCtx.destination)
    logAudio('AudioContext created, state=', audioCtx.state)
  }
  if (masterGain) masterGain.gain.value = masterVolume
  return audioCtx
}

async function resumeCtx(reason = 'resume') {
  const ctx = ensureCtx()
  if (!ctx) return false
  if (ctx.state === 'running') return true

  logAudio(`resume (${reason}) before:`, ctx.state)
  try {
    await withTimeout(ctx.resume(), RESUME_TIMEOUT_MS, `resume:${reason}`)
  } catch (error) {
    logAudio(`resume (${reason}) failed:`, error)
  }
  logAudio(`resume (${reason}) after:`, ctx.state)
  return ctx.state === 'running'
}

function envelopeGain(gainNode, t0, peak, dur) {
  gainNode.gain.setValueAtTime(0.0001, t0)
  gainNode.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, peak * masterVolume),
    t0 + Math.min(0.03, dur * 0.15),
  )
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
}

function playUrlOnce(url, vol = 0.55) {
  if (!url) return
  try {
    let audio = null
    for (const [key, path] of Object.entries(FALLBACK_URLS)) {
      if (path === url && fallbackCache[key]) {
        audio = fallbackCache[key].cloneNode
          ? fallbackCache[key].cloneNode()
          : new Audio(url)
        break
      }
    }
    if (!audio) audio = new Audio(url)
    audio.volume = Math.max(0, Math.min(1, vol * masterVolume))
    const playPromise = audio.play()
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.catch(() => {})
    }
  } catch {
    // ignore
  }
}

function withAudio(webFn, fallbackKey, fallbackVol = 0.62) {
  unlockAudioSync()
  const url = FALLBACK_URLS[fallbackKey]
  void resumeCtx(`effect:${fallbackKey || 'synth'}`).then((running) => {
    if (running) {
      try {
        webFn(ensureCtx())
        return
      } catch (error) {
        logAudio('web audio effect failed:', error)
      }
    }
    if (url) playUrlOnce(url, fallbackVol)
  })
}

/** Synchronous unlock steps safe to call inside a user gesture. */
function unlockAudioSync() {
  ensureCtx()
  audioUnlocked = true
  const ctx = audioCtx
  if (!ctx) return

  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 440
    gain.gain.value = 0.00001
    osc.connect(gain)
    gain.connect(masterGain || ctx.destination)
    const t0 = ctx.currentTime
    osc.start(t0)
    osc.stop(t0 + 0.01)
  } catch {
    // ignore
  }

  void resumeCtx('unlock-sync')

  // Prime speechSynthesis during the gesture so later announces are less likely blocked.
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      window.speechSynthesis.getVoices()
    } catch {
      // ignore
    }
  }
}

export function setMasterVolume(v) {
  const n = Number(v)
  const next = !Number.isFinite(n) || n <= 0 ? DEFAULT_MASTER_VOLUME : n
  masterVolume = Math.max(MIN_MASTER_VOLUME, Math.min(1, next))
  if (masterGain) masterGain.gain.value = masterVolume
  return masterVolume
}

export function getMasterVolume() {
  return masterVolume
}

/** Short high tick for 3·2·1 countdown (Metis playTick). */
export function playTick() {
  withAudio((ctx) => {
    const dest = masterGain || ctx.destination
    const t0 = ctx.currentTime
    const freqs = [880, 1174]
    for (let i = 0; i < freqs.length; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freqs[i]
      osc.connect(gain)
      gain.connect(dest)
      const start = t0 + i * 0.045
      envelopeGain(gain, start, 0.28, 0.09)
      osc.start(start)
      osc.stop(start + 0.1)
    }
  }, 'tick', 0.68)
}

/** Level / bridge transition bell (Metis playDoorong). */
export function playDoorong() {
  withAudio((ctx) => {
    const dest = masterGain || ctx.destination
    const bell = (freq, start, peak, dur) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      osc.connect(gain)
      gain.connect(dest)
      envelopeGain(gain, start, peak, dur)
      osc.start(start)
      osc.stop(start + dur + 0.05)
    }
    const t0 = ctx.currentTime
    bell(659, t0, 0.32, 0.55)
    bell(880, t0 + 0.12, 0.36, 0.62)
    bell(1174, t0 + 0.24, 0.28, 0.72)
  }, 'bell', 0.85)
}

/**
 * Speak English announcement via Web Speech API.
 * Does not set utterance.voice — browser/OS default en-US voice.
 */
export function speakText(text) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false
  const spoken = String(text || '').trim()
  if (!spoken) return false

  void resumeCtx('tts')
  try {
    const utterance = new SpeechSynthesisUtterance(spoken)
    utterance.lang = 'en-US'
    utterance.rate = 0.92
    utterance.pitch = 1.02
    utterance.volume = Math.max(0, Math.min(1, 0.88 * masterVolume))
    // Do not assign utterance.voice — use default en-US.
    window.speechSynthesis.speak(utterance)
    logAudio('TTS speak:', {
      text: spoken,
      lang: utterance.lang,
      rate: utterance.rate,
      pitch: utterance.pitch,
      volume: utterance.volume,
    })
    return true
  } catch (error) {
    logAudio('TTS speak failed:', error)
    return false
  }
}

export function speakGameStart() {
  return speakText(ANNOUNCEMENT_TEXT['game-start'])
}

export function speakNextLevelBlindsUp() {
  return speakText(ANNOUNCEMENT_TEXT['blinds-up'])
}

export function speakBreakTime() {
  return speakText(ANNOUNCEMENT_TEXT['break-time'])
}

/** @deprecated Prefer speakGameStart — kept for App call sites. */
export function playGameStart() {
  speakGameStart()
}

/** @deprecated Prefer speakNextLevelBlindsUp. */
export function playBlindsUp() {
  speakNextLevelBlindsUp()
}

/** @deprecated Prefer speakBreakTime. */
export function playBreakTime() {
  speakBreakTime()
}

/**
 * Explicit audio start — call from a user gesture
 * (click / pointerdown / keydown) so autoplay policies allow sound + speech.
 */
export async function unlockAudio() {
  logAudio('=== audio start (user gesture) ===')
  unlockAudioSync()

  try {
    await withTimeout(
      (async () => {
        await resumeCtx('unlock')
        const ctx = ensureCtx()
        if (ctx) {
          try {
            const silent = ctx.createBuffer(1, 1, ctx.sampleRate || 22050)
            const source = ctx.createBufferSource()
            source.buffer = silent
            source.connect(masterGain || ctx.destination)
            source.start(0)
          } catch (error) {
            logAudio('silent buffer failed:', error)
          }
        }

        try {
          const unlockEl = new Audio(
            'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=',
          )
          unlockEl.volume = 0.01
          await withTimeout(unlockEl.play(), RESUME_TIMEOUT_MS, 'silent-html-unlock')
          unlockEl.pause()
        } catch (error) {
          logAudio('silent HTMLAudio unlock failed:', error)
        }

        await resumeCtx('unlock-after')
      })(),
      UNLOCK_TOTAL_TIMEOUT_MS,
      'unlockAudio',
    )
  } catch (error) {
    logAudio('unlockAudio failed or timed out:', error)
  } finally {
    audioUnlocked = true
    logAudio('=== audio start complete ===', getAudioDebugState())
  }
}

/** Best-effort resume on later UI gestures. */
export function ensureAudioRunning(reason = 'ui') {
  unlockAudioSync()
  void resumeCtx(reason)
}

export function getAudioDebugState() {
  return {
    unlocked: audioUnlocked,
    contextState: audioCtx?.state ?? 'none',
    masterVolume,
  }
}
