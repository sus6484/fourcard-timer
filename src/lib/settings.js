import { createBreak, createLevel, DEFAULT_GAMES, normalizeScheduleLevels } from './presets.js'

const STORAGE_KEY = 'fourcard-timer-settings-v3'
const LEGACY_STORAGE_KEYS = ['fourcard-timer-settings-v2', 'fourcard-timer-settings-v1']

function sanitizeLevel(level) {
  if (!level || typeof level !== 'object') {
    return createLevel(1, 8, 100, 200)
  }
  if (level.isBreak) {
    return createBreak(Number(level.minutes) || 8)
  }
  return {
    isBreak: false,
    level: Number(level.level) || 1,
    minutes: Number(level.minutes) || 8,
    smallBlind: Number(level.smallBlind) || 0,
    bigBlind: Number(level.bigBlind) || 0,
    ante: Number(level.ante) || 0,
  }
}

function sanitizeLevels(levels) {
  if (!Array.isArray(levels) || levels.length === 0) {
    return normalizeScheduleLevels([createLevel(1, 8, 100, 200)])
  }
  return normalizeScheduleLevels(levels.map(sanitizeLevel))
}

function sanitizeGame(game, index) {
  if (!game || typeof game !== 'object') {
    return defaultGlobalGames()[0]
  }
  const levels = sanitizeLevels(game.levels)

  return {
    id: typeof game.id === 'string' && game.id ? game.id : `game-${index + 1}`,
    name: typeof game.name === 'string' && game.name ? game.name : `Game ${index + 1}`,
    levels,
    memo: typeof game.memo === 'string' ? game.memo : '',
    custom: Boolean(game.custom),
    branchId: normalizeBranchId(game.branchId),
  }
}

/** null / '' → 전체 매장(공용), 그 외는 지점 ID */
export function normalizeBranchId(value) {
  if (value == null) return null
  const trimmed = String(value).trim()
  return trimmed ? trimmed : null
}

/**
 * 지점 화면에 노출할 프리셋만 남깁니다.
 * - branchId 없음(공용) 또는 현재 지점과 일치하는 게임만 허용
 * - viewerBranchId가 없으면(관리자) 전체 반환
 */
export function filterGamesForBranch(games, viewerBranchId) {
  if (!Array.isArray(games)) return []
  const viewerId = normalizeBranchId(viewerBranchId)
  if (!viewerId) return games

  return games.filter((game) => {
    const assigned = normalizeBranchId(game?.branchId)
    return !assigned || assigned === viewerId
  })
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

const MEMO_FONT_SIZE_MIN = 18
const MEMO_FONT_SIZE_MAX = 100
const MEMO_FONT_SIZE_STEP = 2
const DEFAULT_MEMO_COLOR = '#c8a96b'
const DEFAULT_ADMIN_PIN = '0919'

function normalizeAdminPin(pin) {
  if (pin === '0000') return DEFAULT_ADMIN_PIN
  return typeof pin === 'string' && pin.length === 4 ? pin : DEFAULT_ADMIN_PIN
}

const defaultState = () => ({
  globalGames: defaultGlobalGames(),
  activeGlobalGameId: DEFAULT_GAMES[0].id,
  adminPin: DEFAULT_ADMIN_PIN,
  screenMemo: '',
  memoFontSize: 30,
  memoColor: DEFAULT_MEMO_COLOR,
})

function migrateLegacy(raw) {
  if (!raw || raw.globalGames) return null
  if (!Array.isArray(raw.games)) return null

  const games = Array.isArray(raw.games) && raw.games.length > 0 ? raw.games : defaultGlobalGames()

  return {
    globalGames: games,
    activeGlobalGameId: raw.activeGameId ?? games[0].id,
    adminPin: normalizeAdminPin(raw.adminPin),
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
    adminPin: normalizeAdminPin(source.adminPin),
    screenMemo: typeof source.screenMemo === 'string' ? source.screenMemo : '',
    memoFontSize: clampMemoFontSize(source.memoFontSize),
    memoColor: sanitizeMemoColor(source.memoColor),
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

function clampMemoFontSize(value) {
  const size = Number(value)
  if (!Number.isFinite(size)) return 30
  return Math.min(MEMO_FONT_SIZE_MAX, Math.max(MEMO_FONT_SIZE_MIN, Math.round(size)))
}

function sanitizeMemoColor(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_MEMO_COLOR
}

export function updateMemoStyle(state, style) {
  const next = { ...state }

  if (typeof style?.fontSize === 'number') {
    next.memoFontSize = clampMemoFontSize(style.fontSize)
  }

  if (typeof style?.color === 'string') {
    next.memoColor = sanitizeMemoColor(style.color)
  }

  return next
}

export const MEMO_STYLE = {
  fontSizeMin: MEMO_FONT_SIZE_MIN,
  fontSizeMax: MEMO_FONT_SIZE_MAX,
  fontSizeStep: MEMO_FONT_SIZE_STEP,
  defaultColor: DEFAULT_MEMO_COLOR,
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

function sameGamesContent(left, right) {
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return false
  }
}

export function applyRemoteGlobalSettings(localState, remote, { branchId = null } = {}) {
  const allRemoteGames = Array.isArray(remote?.globalGames) ? remote.globalGames : []
  const viewerBranchId = normalizeBranchId(branchId)
  const remoteGames = viewerBranchId
    ? filterGamesForBranch(allRemoteGames, viewerBranchId)
    : allRemoteGames
  const hasRemoteGames = remoteGames.length > 0
  const remoteUpdatedAt = typeof remote?.updatedAt === 'string' ? remote.updatedAt : null
  const activeGlobalGameId = hasRemoteGames
    ? remoteGames.some((game) => game.id === localState.activeGlobalGameId)
      ? localState.activeGlobalGameId
      : remoteGames[0]?.id ?? localState.activeGlobalGameId
    : localState.activeGlobalGameId

  // 원격에 문서가 있어도 이 지점에 보이는 게임이 없으면 로컬의 타 지점 전용 게임을 제거
  if (viewerBranchId && allRemoteGames.length > 0 && !hasRemoteGames) {
    const localVisible = filterGamesForBranch(localState.globalGames, viewerBranchId)
    const next = normalizeState({
      ...localState,
      globalGames: localVisible.length > 0 ? localVisible : defaultGlobalGames(),
      activeGlobalGameId: localVisible.some((game) => game.id === localState.activeGlobalGameId)
        ? localState.activeGlobalGameId
        : (localVisible[0]?.id ?? localState.activeGlobalGameId),
      adminPin: normalizeAdminPin(localState.adminPin),
      cloudUpdatedAt: remoteUpdatedAt ?? localState.cloudUpdatedAt ?? null,
    })
    // 내용이 같으면 기존 참조를 유지해 타이머 reset 이펙트가 불필요하게 돌지 않게 함
    if (
      localState.cloudUpdatedAt === next.cloudUpdatedAt &&
      localState.activeGlobalGameId === next.activeGlobalGameId &&
      sameGamesContent(localState.globalGames, next.globalGames)
    ) {
      return localState
    }
    return next
  }

  const next = normalizeState({
    ...localState,
    globalGames: hasRemoteGames ? remoteGames : localState.globalGames,
    activeGlobalGameId,
    // adminPin은 레거시 localStorage 호환용. 인증은 Firebase Auth로 이전됨.
    adminPin: normalizeAdminPin(localState.adminPin),
    cloudUpdatedAt: remoteUpdatedAt ?? localState.cloudUpdatedAt ?? null,
  })

  // 헬스 재구독 등으로 동일 문서가 다시 오면 새 객체로 갈아끼우지 않음
  if (
    localState.cloudUpdatedAt === next.cloudUpdatedAt &&
    localState.activeGlobalGameId === next.activeGlobalGameId &&
    sameGamesContent(localState.globalGames, next.globalGames)
  ) {
    return localState
  }

  return next
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
  const globalGames = sanitizeGames(games)
  const nextActiveId = globalGames.some((game) => game.id === activeGameId)
    ? activeGameId
    : globalGames[0]?.id

  return {
    ...state,
    globalGames,
    activeGlobalGameId: nextActiveId,
  }
}

export function resetToDefaults() {
  const state = defaultState()
  saveSettings(state)
  return state
}
