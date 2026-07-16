export function createLevel(level, minutes, smallBlind, bigBlind, ante = 0) {
  return { isBreak: false, level, minutes, smallBlind, bigBlind, ante }
}

export function createBreak(minutes = 8) {
  return { isBreak: true, minutes, smallBlind: 0, bigBlind: 0, ante: 0, level: null }
}

export function createGame(id, name, levels, options = {}) {
  return {
    id,
    name,
    levels: normalizeScheduleLevels(levels),
    memo: options.memo ?? '',
    custom: options.custom ?? false,
  }
}

export function getPokerLevelNumber(levels, index) {
  if (!levels?.[index] || levels[index].isBreak) return null
  let count = 0
  for (let i = 0; i <= index; i++) {
    if (!levels[i]?.isBreak) count++
  }
  return count
}

export function getScheduleLabel(levels, index) {
  const entry = levels?.[index]
  if (!entry) return '—'
  if (entry.isBreak) return 'BREAK'
  const levelNumber = getPokerLevelNumber(levels, index)
  return levelNumber ? `LEVEL ${levelNumber}` : '—'
}

export function normalizeScheduleLevels(levels) {
  if (!Array.isArray(levels)) return []
  let pokerLevel = 0
  return levels.map((entry) => {
    if (entry?.isBreak) {
      return createBreak(Number(entry.minutes) || 8)
    }
    pokerLevel += 1
    return {
      isBreak: false,
      level: pokerLevel,
      minutes: Number(entry.minutes) || 8,
      smallBlind: Number(entry.smallBlind) || 0,
      bigBlind: Number(entry.bigBlind) || 0,
      ante: Number(entry.ante) || 0,
    }
  })
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
    createBreak(8),
    createLevel(9, 8, 1200, 2400),
    createLevel(10, 8, 1500, 3000),
    createLevel(11, 8, 2000, 4000),
  ]),
  createGame('highroller', 'Highroller', [
    createLevel(1, 10, 500, 1000),
    createLevel(2, 10, 1000, 2000),
    createLevel(3, 10, 1500, 3000),
    createLevel(4, 10, 2000, 4000),
    createLevel(5, 10, 3000, 6000),
    createLevel(6, 10, 4000, 8000),
    createLevel(7, 10, 5000, 10000),
    createBreak(10),
    createLevel(8, 10, 6000, 12000),
    createLevel(9, 10, 8000, 16000),
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
    createBreak(8),
    createLevel(8, 8, 1200, 2400),
    createLevel(9, 8, 1500, 3000),
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

export function getSecondsUntilNextBreak(levels, levelIndex, remainingSeconds) {
  if (!levels?.length) return null

  let total = levels[levelIndex]?.isBreak ? 0 : remainingSeconds

  for (let i = levelIndex + 1; i < levels.length; i++) {
    if (levels[i].isBreak) return total
    total += levels[i].minutes * 60
  }

  return null
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
