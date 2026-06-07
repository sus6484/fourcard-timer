import { cloneBranches, DEFAULT_BRANCHES, normalizeBranches } from './branches.js'
import { DEFAULT_GAMES } from './presets.js'

const STORAGE_KEY = 'fourcard-timer-settings-v2'

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

function defaultBranchStore() {
  return {}
}

const defaultState = () => ({
  globalGames: defaultGlobalGames(),
  activeGlobalGameId: DEFAULT_GAMES[0].id,
  adminPin: '0000',
  branches: cloneBranches(DEFAULT_BRANCHES),
  branchStore: defaultBranchStore(),
  branchCode: null,
  activeBranchGameId: null,
  activeSource: 'global',
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
    branches: normalizeBranches(raw.branches),
    branchStore: raw.branchStore ?? defaultBranchStore(),
    branchCode: raw.branchCode ?? null,
    activeBranchGameId: raw.activeBranchGameId ?? null,
    activeSource: raw.activeSource ?? 'global',
  }
}

function normalizeState(raw) {
  const migrated = migrateLegacy(raw)
  const source = migrated ?? raw

  if (!source?.globalGames?.length) return defaultState()

  const globalGames = sanitizeGames(source.globalGames)
  const branchStore = source.branchStore && typeof source.branchStore === 'object'
    ? Object.fromEntries(
        Object.entries(source.branchStore).map(([code, entry]) => [
          code,
          {
            games: sanitizeGames(entry?.games ?? []),
            activeGameId: entry?.activeGameId ?? null,
          },
        ]),
      )
    : defaultBranchStore()

  const activeGlobalGameId = globalGames.some((game) => game.id === source.activeGlobalGameId)
    ? source.activeGlobalGameId
    : globalGames[0].id

  const state = {
    globalGames,
    activeGlobalGameId,
    adminPin: source.adminPin ?? '0000',
    branches: normalizeBranches(source.branches),
    branchStore,
    branchCode: source.branchCode ?? null,
    activeBranchGameId: source.activeBranchGameId ?? null,
    activeSource: source.activeSource === 'branch' ? 'branch' : 'global',
    screenMemo: typeof source.screenMemo === 'string' ? source.screenMemo : '',
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

export function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) {
      const legacy = localStorage.getItem('fourcard-timer-settings-v1')
      if (legacy) return normalizeState(JSON.parse(legacy))
      return defaultState()
    }
    return normalizeState(JSON.parse(saved))
  } catch {
    return defaultState()
  }
}

export function applyRemoteGlobalSettings(localState, remote) {
  const hasRemoteGames = Array.isArray(remote?.globalGames) && remote.globalGames.length > 0

  return normalizeState({
    ...localState,
    globalGames: hasRemoteGames ? remote.globalGames : localState.globalGames,
    adminPin: typeof remote?.adminPin === 'string' ? remote.adminPin : localState.adminPin,
  })
}

export function saveSettings(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // file:// 등 저장 불가 환경에서도 타이머는 동작하게 둠
  }
}

export function getBranchGames(state) {
  if (!state.branchCode) return []
  return state.branchStore[state.branchCode]?.games ?? []
}

export function getActiveGame(state) {
  if (state.activeSource === 'branch' && state.branchCode) {
    const games = getBranchGames(state)
    const activeId = state.activeBranchGameId ?? games[0]?.id
    return games.find((game) => game.id === activeId) ?? games[0] ?? getActiveGlobalGame(state)
  }
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
    activeSource: 'global',
    activeGlobalGameId: gameId,
  }
}

export function selectBranchGame(state, gameId) {
  return {
    ...state,
    activeSource: 'branch',
    activeBranchGameId: gameId,
  }
}

export function updateGlobalGames(state, games, activeGameId = state.activeGlobalGameId) {
  return {
    ...state,
    globalGames: games,
    activeGlobalGameId: activeGameId,
  }
}

export function updateBranchGames(state, games, activeGameId = state.activeBranchGameId) {
  if (!state.branchCode) return state
  const branchStore = {
    ...state.branchStore,
    [state.branchCode]: {
      ...state.branchStore[state.branchCode],
      games,
    },
  }
  return {
    ...state,
    branchStore,
    activeBranchGameId: activeGameId,
  }
}

export function loginBranch(state, code) {
  const normalized = code.trim().toUpperCase()
  const branch = state.branches[normalized]
  if (!branch) return { ok: false, error: '등록되지 않은 지점 코드입니다.' }

  const existing = state.branchStore[normalized]
  const games = existing?.games ?? []
  const activeBranchGameId = existing?.activeGameId ?? games[0]?.id ?? null

  return {
    ok: true,
    state: {
      ...state,
      branchCode: normalized,
      branchStore: {
        ...state.branchStore,
        [normalized]: existing ?? { games: [], activeGameId: null },
      },
      activeBranchGameId,
      activeSource: games.length > 0 ? 'branch' : state.activeSource,
    },
  }
}

export function logoutBranch(state) {
  return {
    ...state,
    branchCode: null,
    activeBranchGameId: null,
    activeSource: 'global',
  }
}

export function updateBranches(state, branches) {
  return { ...state, branches }
}

export function resetToDefaults() {
  const state = defaultState()
  saveSettings(state)
  return state
}
