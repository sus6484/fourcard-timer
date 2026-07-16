/** Kept alive so the unlocked AudioContext is not GC'd on some TV browsers. */
let unlockedAudioContext = null

/** SpeechSynthesis volume is 0–1; keep announcements at maximum. */
const SPEECH_VOLUME = 1

function getAudioContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx) return null
  if (!unlockedAudioContext) unlockedAudioContext = new AudioCtx()
  return unlockedAudioContext
}

/** Loud attention tones — Web Audio gain can go above HTML media volume. */
function playAlertTone() {
  const ctx = getAudioContext()
  if (!ctx) return

  if (ctx.state === 'suspended') {
    void ctx.resume()
  }

  const now = ctx.currentTime
  const master = ctx.createGain()
  // Hot gain so alerts cut through on TVs / quiet browser TTS buses.
  master.gain.setValueAtTime(2.4, now)
  master.gain.exponentialRampToValueAtTime(0.001, now + 0.55)
  master.connect(ctx.destination)

  const freqs = [880, 1174]
  freqs.forEach((freq, index) => {
    const osc = ctx.createOscillator()
    const amp = ctx.createGain()
    const start = now + index * 0.12
    osc.type = 'square'
    osc.frequency.setValueAtTime(freq, start)
    amp.gain.setValueAtTime(0.0001, start)
    amp.gain.exponentialRampToValueAtTime(0.9, start + 0.02)
    amp.gain.exponentialRampToValueAtTime(0.0001, start + 0.28)
    osc.connect(amp)
    amp.connect(master)
    osc.start(start)
    osc.stop(start + 0.3)
  })
}

function speak(text) {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()

  playAlertTone()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'en-US'
  utterance.rate = 1
  utterance.pitch = 1
  utterance.volume = SPEECH_VOLUME

  const voices = window.speechSynthesis.getVoices()
  const preferred =
    voices.find((voice) => /en(-|_)US/i.test(voice.lang) && /Google|Microsoft|Samantha|Alex|Zira/i.test(voice.name)) ||
    voices.find((voice) => /en(-|_)US/i.test(voice.lang)) ||
    voices.find((voice) => /^en/i.test(voice.lang))
  if (preferred) utterance.voice = preferred

  window.speechSynthesis.speak(utterance)
  // Some WebKit / TV browsers park synthesis until resume() after a gesture.
  window.speechSynthesis.resume()
}

/**
 * Unlock browser autoplay / speech gates. Must run inside a user gesture
 * (click / keydown) so Smart TV browsers allow later TTS and audio.
 */
export async function unlockAudio() {
  const tasks = []

  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (AudioCtx) {
    tasks.push(
      (async () => {
        try {
          const ctx = unlockedAudioContext ?? new AudioCtx()
          unlockedAudioContext = ctx
          if (ctx.state === 'suspended') {
            await ctx.resume()
          }
          const buffer = ctx.createBuffer(1, 1, 22050)
          const source = ctx.createBufferSource()
          source.buffer = buffer
          source.connect(ctx.destination)
          source.start(0)
        } catch {
          // Ignore — TTS unlock below may still succeed.
        }
      })(),
    )
  }

  // Silent WAV — unlocks HTMLMediaElement autoplay on Chromium / many TVs.
  tasks.push(
    (async () => {
      try {
        const audio = new Audio(
          'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=',
        )
        audio.volume = 0.01
        await audio.play()
        audio.pause()
      } catch {
        // Ignore.
      }
    })(),
  )

  // Warm speechSynthesis during the same gesture (this app's alert channel).
  if (window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel()
      const warm = new SpeechSynthesisUtterance(' ')
      warm.volume = 0
      warm.rate = 10
      warm.lang = 'en-US'
      window.speechSynthesis.speak(warm)
      window.speechSynthesis.resume()
      // Populate voice list early on Chromium.
      window.speechSynthesis.getVoices()
    } catch {
      // Ignore.
    }
  }

  await Promise.allSettled(tasks)
}

export function playGameStart() {
  speak('Game start')
}

export function playBlindsUp() {
  speak('Blinds up')
}

export function playBreakTime() {
  speak('Break time')
}
