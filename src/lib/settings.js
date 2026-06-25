import { DEFAULT_GAMES } from './presets.js'

const STORAGE_KEY = 'fourcard-timer-settings-v3'
const LEGACY_STORAGE_KEYS = ['fourcard-timer-settings-v2', 'fourcard-timer-settings-v1']

function sanitizeLevel(level, index) {
  if (!level || typeof level !== 'object') {
    return { level: index + 1, minutes: 8, smallBlind: 100, bigBlind: 200, ante: 0, isBreak: false }
  }
  return {
    level: Number(level.level) || index + 1,
    minutes: Number(level.minutes) || 8,
    smallBlind: Number(level.smallBlind) || 0,
    bigBlind: Number(level.bigBlind) || 0,
    ante: Number(level.ante) || 0,
    isBreak: Boolean(level.isBreak),
  }
}

function sanitizeGame(game, index) {
  if (!game || typeof game !== 'object') {
    return defaultGlobalGames()[0]
  }
  const levels = Array.isArray(game.levels) && game.levels.length > 0
    ? game.levels.map(sanitizeLevel)
    : [sanitizeLevel(null, 0)]

  return {
    id: typeof game.id === 'string' && game.id ? game.id : `game-${index + 1}`,
    name: typeof game.name === 'string' && game.name ? game.name : `Game ${index + 1}`,
    levels,
    memo: typeof game.memo === 'string' ? game.memo : '',
    custom: Boolean(game.custom),
  }
}

function sanitizeGames(games) {
  if (!Array.isArray(games) || games.length === 0) return defaultGlobalGames()
  return games.map(sanitizeGame)
}

function cloneGames(games) {
  return sanitizeGames(games).map((game) => ({
    ...game,
    levels: game.levels.map((level) => ({ ...level })),
  }))
}

function defaultGlobalGames() {
  return cloneGames(DEFAULT_GAMES)
}

const defaultState = () => ({
  globalGames: defaultGlobalGames(),
  activeGlobalGameId: DEFAULT_GAMES[0].id,
  adminPin: '0000',
  screenMemo: '',
})

function migrateLegacy(raw) {
  if (!raw || raw.globalGames) return null
  if (!Array.isArray(raw.games)) return null

  const games = Array.isArray(raw.games) && raw.games.length > 0 ? raw.games : defaultGlobalGames()

  return {
    globalGames: games,
    activeGlobalGameId: raw.activeGameId ?? games[0].id,
    adminPin: raw.adminPin ?? '0000',
  }
}

function normalizeState(raw) {
  const migrated = migrateLegacy(raw)
  const source = migrated ?? raw

  if (!source?.globalGames?.length) return defaultState()

  const globalGames = sanitizeGames(source.globalGames)

  const activeGlobalGameId = globalGames.some((game) => game.id === source.activeGlobalGameId)
    ? source.activeGlobalGameId
    : globalGames[0].id

  const state = {
    globalGames,
    activeGlobalGameId,
    adminPin: source.adminPin ?? '0000',
    screenMemo: typeof source.screenMemo === 'string' ? source.screenMemo : '',
    cloudUpdatedAt: typeof source.cloudUpdatedAt === 'string' ? source.cloudUpdatedAt : null,
  }

  if (!state.screenMemo) {
    const legacyMemo = getActiveGame(state)?.memo
    if (legacyMemo) state.screenMemo = legacyMemo
  }

  return state
}

export function updateScreenMemo(state, memo) {
  return {
    ...state,
    screenMemo: typeof memo === 'string' ? memo : '',
  }
}

function readLegacySettings() {
  for (const key of LEGACY_STORAGE_KEYS) {
    const saved = localStorage.getItem(key)
    if (!saved) continue
    try {
      return normalizeState(JSON.parse(saved))
    } catch {
      // try next legacy key
    }
  }
  return null
}

export function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) {
      return readLegacySettings() ?? defaultState()
    }
    return normalizeState(JSON.parse(saved))
  } catch {
    return defaultState()
  }
}

export function applyRemoteGlobalSettings(localState, remote) {
  const remoteGames = Array.isArray(remote?.globalGames) ? remote.globalGames : []
  const hasRemoteGames = remoteGames.length > 0
  const remoteUpdatedAt = typeof remote?.updatedAt === 'string' ? remote.updatedAt : null
  const activeGlobalGameId = hasRemoteGames
    ? localState.globalGames.some((game) => game.id === localState.activeGlobalGameId)
      ? localState.activeGlobalGameId
      : remoteGames[0]?.id ?? localState.activeGlobalGameId
    : localState.activeGlobalGameId

  return normalizeState({
    ...localState,
    globalGames: hasRemoteGames ? remoteGames : localState.globalGames,
    activeGlobalGameId,
    adminPin: typeof remote?.adminPin === 'string' ? remote.adminPin : localState.adminPin,
    cloudUpdatedAt: remoteUpdatedAt ?? localState.cloudUpdatedAt ?? null,
  })
}

export function withCloudUpdatedAt(state, updatedAt) {
  return {
    ...state,
    cloudUpdatedAt: updatedAt ?? state.cloudUpdatedAt ?? null,
  }
}

export function saveSettings(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // file:// 등 저장 불가 환경에서도 타이머는 동작하게 둠
  }
}

export function getActiveGame(state) {
  return getActiveGlobalGame(state)
}

export function getActiveGlobalGame(state) {
  return (
    state.globalGames.find((game) => game.id === state.activeGlobalGameId) ?? state.globalGames[0]
  )
}

export function selectGlobalGame(state, gameId) {
  return {
    ...state,
    activeGlobalGameId: gameId,
  }
}

export function updateGlobalGames(state, games, activeGameId = state.activeGlobalGameId) {
  return {
    ...state,
    globalGames: games,
    activeGlobalGameId: activeGameId,
  }
}

export function resetToDefaults() {
  const state = defaultState()
  saveSettings(state)
  return state
}
