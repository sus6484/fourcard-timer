export function createLevel(level, minutes, smallBlind, bigBlind, ante = 0, isBreak = false) {
  return { level, minutes, smallBlind, bigBlind, ante, isBreak }
}

export function createGame(id, name, levels, options = {}) {
  return {
    id,
    name,
    levels,
    memo: options.memo ?? '',
    custom: options.custom ?? false,
  }
}

export const DEFAULT_GAMES = [
  createGame('weekly-tournament', 'Weekly Tournament', [
    createLevel(1, 8, 100, 200),
    createLevel(2, 8, 200, 400),
    createLevel(3, 8, 300, 600),
    createLevel(4, 8, 400, 800),
    createLevel(5, 8, 500, 1000),
    createLevel(6, 8, 600, 1200),
    createLevel(7, 8, 800, 1600),
    createLevel(8, 8, 1000, 2000),
    createLevel(9, 8, 0, 0, 0, true),
    createLevel(10, 8, 1200, 2400),
    createLevel(11, 8, 1500, 3000),
    createLevel(12, 8, 2000, 4000),
  ]),
  createGame('highroller', 'Highroller', [
    createLevel(1, 10, 500, 1000),
    createLevel(2, 10, 1000, 2000),
    createLevel(3, 10, 1500, 3000),
    createLevel(4, 10, 2000, 4000),
    createLevel(5, 10, 3000, 6000),
    createLevel(6, 10, 4000, 8000),
    createLevel(7, 10, 5000, 10000),
    createLevel(8, 10, 0, 0, 0, true),
    createLevel(9, 10, 6000, 12000),
    createLevel(10, 10, 8000, 16000),
  ]),
  createGame('daily-game', 'Daily Game', [
    createLevel(1, 6, 100, 200),
    createLevel(2, 6, 200, 400),
    createLevel(3, 6, 300, 600),
    createLevel(4, 6, 400, 800),
    createLevel(5, 6, 500, 1000),
    createLevel(6, 6, 600, 1200),
    createLevel(7, 6, 800, 1600),
    createLevel(8, 6, 1000, 2000),
  ]),
  createGame('1fc-satellite', '1FC Satellite', [
    createLevel(1, 5, 50, 100),
    createLevel(2, 5, 100, 200),
    createLevel(3, 5, 150, 300),
    createLevel(4, 5, 200, 400),
    createLevel(5, 5, 300, 600),
    createLevel(6, 5, 400, 800),
  ]),
  createGame('all-in-or-fold', 'All-In or FOLD', [
    createLevel(1, 3, 100, 100),
    createLevel(2, 3, 200, 200),
    createLevel(3, 3, 400, 400),
    createLevel(4, 3, 800, 800),
    createLevel(5, 3, 1600, 1600),
    createLevel(6, 3, 3200, 3200),
  ]),
  createGame('weekend-tournament', 'Weekend Tournament', [
    createLevel(1, 8, 200, 400),
    createLevel(2, 8, 300, 600),
    createLevel(3, 8, 400, 800),
    createLevel(4, 8, 500, 1000),
    createLevel(5, 8, 600, 1200),
    createLevel(6, 8, 800, 1600),
    createLevel(7, 8, 1000, 2000),
    createLevel(8, 8, 0, 0, 0, true),
    createLevel(9, 8, 1200, 2400),
    createLevel(10, 8, 1500, 3000),
  ]),
]

export function formatBlinds(level) {
  if (!level || level.isBreak) return '—'
  return `${level.smallBlind.toLocaleString()}/${level.bigBlind.toLocaleString()}`
}

export function formatAnte(level) {
  if (!level || level.isBreak) return '—'
  if (!level.ante) return '—'
  return level.ante.toLocaleString()
}

export function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function cloneGame(game) {
  return {
    ...game,
    levels: game.levels.map((level) => ({ ...level })),
  }
}

export function duplicateGame(game) {
  const copy = cloneGame(game)
  copy.id = `${game.id}-copy-${Date.now()}`
  copy.name = `${game.name} (복사)`
  copy.custom = true
  return copy
}
