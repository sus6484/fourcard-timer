function speak(text) {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'en-US'
  utterance.rate = 1.05
  window.speechSynthesis.speak(utterance)
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
