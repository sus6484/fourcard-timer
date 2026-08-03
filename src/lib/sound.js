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

/** Timeouts so a hung resume/fetch/decode cannot block forever on mobile. */
const RESUME_TIMEOUT_MS = 2000
const MEDIA_PLAY_TIMEOUT_MS = 2000
const WARM_SOUND_TIMEOUT_MS = 8000
const UNLOCK_TOTAL_TIMEOUT_MS = 15000

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
  // Resolve + log the mapped TTS voice as soon as the selection changes.
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    resolveKoreanTtsVoice(window.speechSynthesis.getVoices(), next)
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

function isKoreanLang(lang) {
  const value = String(lang || '').toLowerCase()
  return value === 'ko' || value === 'ko-kr' || value.startsWith('ko-')
}

function isFemaleVoiceName(name) {
  return /heami|여성|여자|female|woman|girl|sunhi|yuna|sora|ji\.?\s*min|jimin/i.test(
    String(name || ''),
  )
}

function isMaleVoiceName(name) {
  const value = String(name || '').toLowerCase()
  // Exclude female names first so "Female" is never treated as male.
  if (isFemaleVoiceName(value)) return false
  return /injoon|남성|남자|\bmale\b|\bman\b|\bboy\b|bongjin|hyunsu|minho/.test(value)
}

/** Canonical Korean phrases so the engine does not switch to an English voice. */
const ANNOUNCEMENT_TEXT_BY_KEY = {
  'game-start': '게임 스타트',
  'blinds-up': '블라인즈 업',
  'break-time': '브레이크 타임',
}

const ANNOUNCEMENT_TEXT_ALIASES = {
  'game start': '게임 스타트',
  gamestart: '게임 스타트',
  게임스타트: '게임 스타트',
  'blinds up': '블라인즈 업',
  blindsup: '블라인즈 업',
  블라인즈업: '블라인즈 업',
  'break time': '브레이크 타임',
  breaktime: '브레이크 타임',
  브레이크타임: '브레이크 타임',
}

/** Pitch / rate used when Voice 2 has no real male Korean voice installed. */
const MALE_PITCH_FALLBACK = 0.35
const MALE_RATE_FALLBACK = 0.9

/**
 * Voice 2 MP3 pitch-down. Male *-male.mp3 assets are byte-identical to female,
 * so we lower playbackRate through Web Audio (still GainNode-amplified).
 */
const MALE_MP3_PLAYBACK_RATE = 0.84

/**
 * Web Audio playback gain. HTMLMediaElement / SpeechSynthesis max out at 1;
 * GainNode can go above 1 to make alerts audible on quiet venue speakers.
 * 1.5 is a safe first step — raise toward 2 if field feedback still says quiet.
 */
const SOUND_GAIN = 1.5

function normalizeAnnouncementText(text) {
  const raw = String(text || '').trim()
  if (!raw) return ''
  const alias = ANNOUNCEMENT_TEXT_ALIASES[raw.toLowerCase()] || ANNOUNCEMENT_TEXT_ALIASES[raw]
  return alias || raw
}

function defaultFemaleVoice(korean) {
  return korean.find((v) => isFemaleVoiceName(v.name)) || korean[0] || null
}

/**
 * Pick a Korean SpeechSynthesis voice matching the selected gender.
 * Voice 1 → female. Voice 2 → male when available; otherwise female + pitch fallback.
 */
export function pickKoreanTtsVoice(voices, voice = getAnnouncementVoice()) {
  return resolveKoreanTtsVoice(voices, voice).selected
}

/**
 * Resolve TTS voice + whether Voice 2 must fake a male timbre via pitch/rate.
 */
export function resolveKoreanTtsVoice(voices, voice = getAnnouncementVoice()) {
  const list = Array.isArray(voices) ? voices : []
  const korean = list.filter((v) => isKoreanLang(v.lang))

  console.log(
    '현재 사용 가능한 한국어 목소리 목록',
    korean.map((v) => ({ name: v.name, lang: v.lang })),
  )

  const preferFemale = voiceGender(voice) === 'female'
  let selected = null
  let malePitchFallback = false

  if (preferFemale) {
    selected = defaultFemaleVoice(korean)
  } else {
    selected = korean.find((v) => isMaleVoiceName(v.name))
    if (!selected) {
      // No InJoon / Male voice installed — reuse the default female voice and pitch it down.
      selected = defaultFemaleVoice(korean)
      malePitchFallback = Boolean(selected)
    }
  }

  selected = selected || korean[0] || null
  console.log('최종 선택된 목소리 이름', selected?.name ?? null, {
    voice,
    malePitchFallback,
  })
  return { selected, malePitchFallback, korean }
}

function applyUtteranceVoiceSettings(utterance, selected, malePitchFallback) {
  utterance.lang = 'ko-KR'
  // Spec clamps volume to [0, 1] — cannot amplify SpeechSynthesis past this.
  utterance.volume = 1
  if (selected) utterance.voice = selected
  if (malePitchFallback) {
    utterance.pitch = MALE_PITCH_FALLBACK
    utterance.rate = MALE_RATE_FALLBACK
  } else {
    utterance.pitch = 1
    utterance.rate = 1
  }
}

/**
 * Speak Korean text via SpeechSynthesis using the selected announcement voice.
 * Always forces the same ko-KR voice object for every phrase (including Game Start).
 * No-op when SpeechSynthesis is unavailable.
 */
export function speakAnnouncement(text, voice = getAnnouncementVoice()) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false

  const spokenText = normalizeAnnouncementText(text)
  if (!spokenText) return false

  const synth = window.speechSynthesis

  const speakNow = () => {
    const { selected, malePitchFallback } = resolveKoreanTtsVoice(synth.getVoices(), voice)
    const utterance = new SpeechSynthesisUtterance(spokenText)
    applyUtteranceVoiceSettings(utterance, selected, malePitchFallback)

    // Re-assert voice right before speak — some engines drop it for Latin-looking tokens.
    if (selected) utterance.voice = selected
    utterance.lang = 'ko-KR'

    synth.cancel()
    synth.speak(utterance)
    logAudio('TTS speak:', {
      text: spokenText,
      voiceName: selected?.name ?? null,
      lang: utterance.lang,
      pitch: utterance.pitch,
      rate: utterance.rate,
      malePitchFallback,
    })
  }

  // Voices often load asynchronously; wait before speaking so Game Start cannot grab an English voice.
  if (synth.getVoices().length > 0) {
    speakNow()
  } else {
    synth.addEventListener('voiceschanged', speakNow, { once: true })
  }

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
      await withTimeout(ctx.resume(), RESUME_TIMEOUT_MS, `resume:${reason}`)
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
function playBuffer(name, { playbackRate = 1 } = {}) {
  const ctx = getAudioContext()
  const buffer = audioBuffers.get(name)
  if (!ctx || !buffer) return false

  if (ctx.state === 'suspended') {
    logAudio('playBuffer: context still suspended, cannot play', name)
    return false
  }

  const source = ctx.createBufferSource()
  const gain = ctx.createGain()
  gain.gain.value = SOUND_GAIN
  source.buffer = buffer
  source.playbackRate.value = playbackRate
  source.connect(gain)
  gain.connect(ctx.destination)
  source.start(0)
  logAudio(
    'playBuffer: started',
    name,
    'gain=',
    SOUND_GAIN,
    'rate=',
    playbackRate,
    'ctx.state=',
    ctx.state,
  )
  return true
}

async function playHtmlSound(name, { playbackRate = 1 } = {}) {
  const audio = getHtmlSound(name)
  audio.currentTime = 0
  audio.muted = false
  audio.volume = 1
  audio.playbackRate = playbackRate
  try {
    await audio.play()
    logAudio('playHtmlSound: started', name, 'rate=', playbackRate)
    return true
  } catch (error) {
    logAudio('playHtmlSound: blocked', name, error)
    return false
  }
}

async function playSound(name, options = {}) {
  logAudio('playSound:', name, 'unlocked=', audioUnlocked, 'options=', options)

  const ctx = await resumeAudioContext(`play:${name}`)

  if (ctx && playBuffer(name, options)) return true

  return playHtmlSound(name, options)
}

/**
 * Prefer amplified MP3 for both voices (GainNode can exceed volume 1).
 * Voice 2 also lowers playbackRate so it sounds male-ish — the *-male.mp3
 * files are currently identical copies of the female recordings.
 * TTS remains a fallback when Web Audio / HTMLAudio cannot play.
 */
async function playAnnouncement(baseName) {
  const voice = getAnnouncementVoice()
  const text = ANNOUNCEMENT_TEXT_BY_KEY[baseName]
  const soundName = resolveSoundName(baseName, voice)
  const options = voice === 2 ? { playbackRate: MALE_MP3_PLAYBACK_RATE } : {}

  const played = await playSound(soundName, options)
  if (!played) {
    speakAnnouncement(text, voice)
  }
}

/**
 * Decode one MP3 into an AudioBuffer while the context is running.
 * Falls back to priming the HTMLAudioElement if decode fails.
 */
async function warmSound(name, ctx) {
  const url = SOUND_URLS[name]

  if (ctx) {
    try {
      const response = await withTimeout(
        fetch(url, { cache: 'no-store' }),
        WARM_SOUND_TIMEOUT_MS,
        `warm-fetch:${name}`,
      )
      const arrayBuffer = await withTimeout(
        response.arrayBuffer(),
        WARM_SOUND_TIMEOUT_MS,
        `warm-buffer:${name}`,
      )
      const buffer = await withTimeout(
        ctx.decodeAudioData(arrayBuffer.slice(0)),
        WARM_SOUND_TIMEOUT_MS,
        `warm-decode:${name}`,
      )
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
    await withTimeout(audio.play(), MEDIA_PLAY_TIMEOUT_MS, `warm-play:${name}`)
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
 * Core unlock steps. May hang on some mobile browsers without withTimeout wrappers.
 * Must be started from a user gesture (click / pointerdown / keydown).
 */
async function runUnlockAudioPipeline() {
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
    await withTimeout(unlockEl.play(), MEDIA_PLAY_TIMEOUT_MS, 'silent-html-unlock')
    unlockEl.pause()
    logAudio('silent HTMLAudio unlock ok')
  } catch (error) {
    logAudio('silent HTMLAudio unlock failed:', error)
  }

  // 4) Decode / prime alert MP3s so later plays do not hit autoplay gates.
  const names = Object.keys(SOUND_URLS)
  await Promise.allSettled(
    names.map((name) =>
      withTimeout(warmSound(name, ctx), WARM_SOUND_TIMEOUT_MS, `warm:${name}`).catch((error) => {
        logAudio('warmSound timed out/failed:', name, error)
      }),
    ),
  )

  // 4b) Prime SpeechSynthesis voices early so the first announcement keeps a fixed ko-KR voice.
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.getVoices()
    resolveKoreanTtsVoice(window.speechSynthesis.getVoices(), getAnnouncementVoice())
  }

  // 5) Resume again after async work — some TVs re-suspend during fetch/decode.
  const ctxAfter = await resumeAudioContext('unlock-after-warm')

  // 6) Audible confirmation that the pipeline is live.
  playUnlockBeep(ctxAfter)

  return ctxAfter
}

/**
 * Explicit audio start — must be called from a user gesture
 * (click / pointerdown / keydown) so Smart TV autoplay policies allow sound.
 * Safe to fire-and-forget after the start overlay is dismissed.
 */
export async function unlockAudio() {
  logAudio('=== audio start (user gesture) ===')
  logAudio('document.visibilityState=', document.visibilityState)

  let ctxAfter = null
  try {
    ctxAfter = await withTimeout(
      runUnlockAudioPipeline(),
      UNLOCK_TOTAL_TIMEOUT_MS,
      'unlockAudio',
    )
  } catch (error) {
    logAudio('unlockAudio failed or timed out:', error)
  } finally {
    audioUnlocked = true
    logAudio('=== audio start complete ===', {
      unlocked: audioUnlocked,
      contextState: ctxAfter?.state ?? unlockedAudioContext?.state ?? 'none',
      buffers: [...audioBuffers.keys()],
      announcementVoice: getAnnouncementVoice(),
    })
  }
}

export function playGameStart() {
  void playAnnouncement('game-start')
}

export function playBlindsUp() {
  void playAnnouncement('blinds-up')
}

export function playBreakTime() {
  void playAnnouncement('break-time')
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
