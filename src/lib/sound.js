/** Kept alive so the unlocked AudioContext is not GC'd on some TV browsers. */
let unlockedAudioContext = null

function speak(text) {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'en-US'
  utterance.rate = 1.05
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
