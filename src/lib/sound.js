import gameStartUrl from '../assets/sounds/game-start.mp3'
import blindsUpUrl from '../assets/sounds/blinds-up.mp3'
import breakTimeUrl from '../assets/sounds/break-time.mp3'
import gameStartMaleUrl from '../assets/sounds/game-start-male.mp3'
import blindsUpMaleUrl from '../assets/sounds/blinds-up-male.mp3'
import breakTimeMaleUrl from '../assets/sounds/break-time-male.mp3'

/** Kept alive so the unlocked AudioContext is not GC'd on some TV browsers. */
let unlockedAudioContext = null

/** True after unlockAudio() finishes (success or best-effort). */
let audioUnlocked = false

/** Voice 1 = Korean female (default), Voice 2 = Korean male. */
export const ANNOUNCEMENT_VOICES = {
  1: 'female',
  2: 'male',
}

const VOICE_STORAGE_KEY = 'fourcard-timer-announcement-voice'

/** Vite content-hashed URLs — bustes stale TV / CDN caches when audio changes. */
const SOUND_URLS = {
  'game-start-female': gameStartUrl,
  'blinds-up-female': blindsUpUrl,
  'break-time-female': breakTimeUrl,
  'game-start-male': gameStartMaleUrl,
  'blinds-up-male': blindsUpMaleUrl,
  'break-time-male': breakTimeMaleUrl,
}

/** Decoded PCM buffers for Web Audio playback (preferred on Smart TVs). */
const audioBuffers = new Map()

/** Cached HTMLAudioElements keyed by sound name (fallback). */
const soundCache = new Map()

function logAudio(...args) {
  console.log('[audio]', ...args)
}

export function getAnnouncementVoice() {
  try {
    const saved = localStorage.getItem(VOICE_STORAGE_KEY)
    return saved === '2' ? 2 : 1
  } catch {
    return 1
  }
}

export function setAnnouncementVoice(voice) {
  const next = voice === 2 ? 2 : 1
  try {
    localStorage.setItem(VOICE_STORAGE_KEY, String(next))
  } catch {
    // ignore quota / private mode
  }
  return next
}

function voiceGender(voice = getAnnouncementVoice()) {
  return ANNOUNCEMENT_VOICES[voice] ?? ANNOUNCEMENT_VOICES[1]
}

/** Resolve base alert name to the voice-specific SOUND_URLS key. */
function resolveSoundName(baseName, voice = getAnnouncementVoice()) {
  return `${baseName}-${voiceGender(voice)}`
}

/**
 * Pick a Korean SpeechSynthesis voice matching the selected gender.
 * Voice 1 → female, Voice 2 → male. Falls back to any ko voice, then default.
 */
export function pickKoreanTtsVoice(voices, voice = getAnnouncementVoice()) {
  const list = Array.isArray(voices) ? voices : []
  const korean = list.filter((v) => {
    const lang = String(v.lang || '').toLowerCase()
    return lang === 'ko' || lang.startsWith('ko-')
  })

  const preferFemale = voiceGender(voice) === 'female'
  const genderMatched = korean.filter((v) => {
    const name = String(v.name || '').toLowerCase()
    const isFemale =
      /female|woman|girl|여성|여자|heami|sunhi|yuna|sora|ji.min|jimin/.test(name)
    const isMale =
      /male|man|boy|남성|남자|injoon|bongjin|hyunsu|minho/.test(name)
    if (preferFemale) return isFemale && !isMale
    return isMale && !isFemale
  })

  return genderMatched[0] || korean[0] || list[0] || null
}

/**
 * Speak Korean text via SpeechSynthesis using the selected announcement voice.
 * No-op when SpeechSynthesis is unavailable.
 */
export function speakAnnouncement(text, voice = getAnnouncementVoice()) {
  if (typeof window === 'undefined' || !window.speechSynthesis || !text) return false

  const utterance = new SpeechSynthesisUtterance(String(text))
  utterance.lang = 'ko-KR'

  const applyVoice = () => {
    const selected = pickKoreanTtsVoice(window.speechSynthesis.getVoices(), voice)
    if (selected) utterance.voice = selected
  }

  applyVoice()
  // Some browsers populate voices asynchronously.
  if (!utterance.voice) {
    window.speechSynthesis.addEventListener('voiceschanged', applyVoice, { once: true })
  }

  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
  return true
}

function getAudioContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx) {
    logAudio('AudioContext unsupported on this browser')
    return null
  }
  if (!unlockedAudioContext) {
    unlockedAudioContext = new AudioCtx()
    logAudio('AudioContext created, state=', unlockedAudioContext.state)
  }
  return unlockedAudioContext
}

/** Resume a suspended AudioContext. Must run inside a user gesture when possible. */
async function resumeAudioContext(reason) {
  const ctx = getAudioContext()
  if (!ctx) return null

  logAudio(`resume (${reason}) before:`, ctx.state)

  if (ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch (error) {
      logAudio(`resume (${reason}) failed:`, error)
    }
  }

  logAudio(`resume (${reason}) after:`, ctx.state)
  return ctx
}

function getHtmlSound(name) {
  let audio = soundCache.get(name)
  if (!audio) {
    audio = new Audio(SOUND_URLS[name])
    audio.preload = 'auto'
    audio.playsInline = true
    soundCache.set(name, audio)
  }
  return audio
}

/** Play a decoded buffer through the unlocked AudioContext. */
function playBuffer(name) {
  const ctx = getAudioContext()
  const buffer = audioBuffers.get(name)
  if (!ctx || !buffer) return false

  if (ctx.state === 'suspended') {
    logAudio('playBuffer: context still suspended, cannot play', name)
    return false
  }

  const source = ctx.createBufferSource()
  const gain = ctx.createGain()
  gain.gain.value = 1
  source.buffer = buffer
  source.connect(gain)
  gain.connect(ctx.destination)
  source.start(0)
  logAudio('playBuffer: started', name, 'ctx.state=', ctx.state)
  return true
}

async function playHtmlSound(name) {
  const audio = getHtmlSound(name)
  audio.currentTime = 0
  audio.muted = false
  audio.volume = 1
  try {
    await audio.play()
    logAudio('playHtmlSound: started', name)
    return true
  } catch (error) {
    logAudio('playHtmlSound: blocked', name, error)
    return false
  }
}

async function playSound(name) {
  logAudio('playSound:', name, 'unlocked=', audioUnlocked)

  const ctx = await resumeAudioContext(`play:${name}`)

  if (ctx && playBuffer(name)) return

  await playHtmlSound(name)
}

/**
 * Decode one MP3 into an AudioBuffer while the context is running.
 * Falls back to priming the HTMLAudioElement if decode fails.
 */
async function warmSound(name, ctx) {
  const url = SOUND_URLS[name]

  if (ctx) {
    try {
      const response = await fetch(url, { cache: 'no-store' })
      const arrayBuffer = await response.arrayBuffer()
      const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
      audioBuffers.set(name, buffer)
      logAudio('warmSound: decoded', name, 'duration=', buffer.duration.toFixed(2) + 's')
      return
    } catch (error) {
      logAudio('warmSound: decode failed, priming HTMLAudio', name, error)
    }
  }

  // Prime HTMLMediaElement autoplay: play muted inside the unlock gesture.
  try {
    const audio = getHtmlSound(name)
    audio.muted = true
    audio.volume = 0
    audio.load()
    await audio.play()
    audio.pause()
    audio.currentTime = 0
    audio.muted = false
    audio.volume = 1
    logAudio('warmSound: HTMLAudio primed', name)
  } catch (error) {
    logAudio('warmSound: HTMLAudio prime failed', name, error)
  }
}

/** Short confirmation beep so the user (and TV) know audio is live. */
function playUnlockBeep(ctx) {
  if (!ctx || ctx.state !== 'running') {
    logAudio('unlock beep skipped, ctx.state=', ctx?.state)
    return
  }

  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = 880
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.35, now + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.2)
  logAudio('unlock beep played')
}

/**
 * Explicit audio start — must be called from a user gesture
 * (click / pointerdown / keydown) so Smart TV autoplay policies allow sound.
 */
export async function unlockAudio() {
  logAudio('=== audio start (user gesture) ===')
  logAudio('document.visibilityState=', document.visibilityState)

  // 1) Create + resume AudioContext inside the gesture (critical for TVs).
  const ctx = await resumeAudioContext('unlock')

  // 2) Play a tiny silent buffer through Web Audio (marks output as allowed).
  if (ctx) {
    try {
      const silent = ctx.createBuffer(1, 1, ctx.sampleRate || 22050)
      const source = ctx.createBufferSource()
      source.buffer = silent
      source.connect(ctx.destination)
      source.start(0)
      logAudio('silent Web Audio buffer played, state=', ctx.state)
    } catch (error) {
      logAudio('silent Web Audio buffer failed:', error)
    }
  }

  // 3) Unlock HTMLMediaElement autoplay with a silent data-URI clip.
  try {
    const unlockEl = new Audio(
      'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=',
    )
    unlockEl.volume = 0.01
    await unlockEl.play()
    unlockEl.pause()
    logAudio('silent HTMLAudio unlock ok')
  } catch (error) {
    logAudio('silent HTMLAudio unlock failed:', error)
  }

  // 4) Decode / prime alert MP3s so later plays do not hit autoplay gates.
  const names = Object.keys(SOUND_URLS)
  await Promise.allSettled(names.map((name) => warmSound(name, ctx)))

  // 5) Resume again after async work — some TVs re-suspend during fetch/decode.
  const ctxAfter = await resumeAudioContext('unlock-after-warm')

  // 6) Audible confirmation that the pipeline is live.
  playUnlockBeep(ctxAfter)

  audioUnlocked = true
  logAudio('=== audio start complete ===', {
    unlocked: audioUnlocked,
    contextState: ctxAfter?.state ?? 'none',
    buffers: [...audioBuffers.keys()],
    announcementVoice: getAnnouncementVoice(),
  })
}

export function playGameStart() {
  void playSound(resolveSoundName('game-start'))
}

export function playBlindsUp() {
  void playSound(resolveSoundName('blinds-up'))
}

export function playBreakTime() {
  void playSound(resolveSoundName('break-time'))
}

/**
 * Best-effort resume on later UI gestures (play/pause, etc.).
 * Call from control handlers so TVs that re-suspend still recover.
 */
export function ensureAudioRunning(reason = 'ui') {
  void resumeAudioContext(reason)
}

/** Current AudioContext state for UI / remote debugging. */
export function getAudioDebugState() {
  const ctx = unlockedAudioContext
  return {
    unlocked: audioUnlocked,
    contextState: ctx?.state ?? 'none',
    bufferCount: audioBuffers.size,
    announcementVoice: getAnnouncementVoice(),
  }
}
