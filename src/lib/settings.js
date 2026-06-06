import { DEFAULT_GAMES } from './presets.js'

const STORAGE_KEY = 'fourcard-timer-settings-v1'

const defaultState = () => ({
  games: DEFAULT_GAMES.map((game) => ({
    ...game,
    levels: game.levels.map((level) => ({ ...level })),
  })),
  activeGameId: DEFAULT_GAMES[0].id,
  adminPin: '0000',
})

function normalizeState(raw) {
  if (!raw || !Array.isArray(raw.games) || raw.games.length === 0) {
    return defaultState()
  }

  return {
    games: raw.games,
    activeGameId: raw.activeGameId ?? raw.games[0].id,
    adminPin: raw.adminPin ?? '0000',
  }
}

export function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return defaultState()
    return normalizeState(JSON.parse(saved))
  } catch {
    return defaultState()
  }
}

// Phase 2: swap implementation to Supabase branch-code sync.
export function saveSettings(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function getActiveGame(state) {
  return state.games.find((game) => game.id === state.activeGameId) ?? state.games[0]
}

export function updateGame(state, gameId, updater) {
  const games = state.games.map((game) => {
    if (game.id !== gameId) return game
    return typeof updater === 'function' ? updater(game) : { ...game, ...updater }
  })
  return { ...state, games }
}

export function addGame(state, game) {
  return {
    ...state,
    games: [...state.games, game],
    activeGameId: game.id,
  }
}

export function removeGame(state, gameId) {
  const games = state.games.filter((game) => game.id !== gameId)
  if (games.length === 0) return defaultState()
  const activeGameId = state.activeGameId === gameId ? games[0].id : state.activeGameId
  return { ...state, games, activeGameId }
}

export function resetToDefaults() {
  const state = defaultState()
  saveSettings(state)
  return state
}
