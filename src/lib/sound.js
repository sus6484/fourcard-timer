const sounds = {}

function getSound(name) {
  if (!sounds[name]) {
    sounds[name] = new Audio(`/assets/${name}.mp3`)
  }
  return sounds[name]
}

export function playSound(name) {
  const audio = getSound(name)
  audio.currentTime = 0
  audio.play().catch(() => {})
}

export function playLevelWarning(isBreak) {
  playSound(isBreak ? 'one_minute_break' : 'one_minute_round')
}

export function playLevelComplete(isBreak) {
  playSound(isBreak ? 'end_of_break' : 'end_of_round')
}
