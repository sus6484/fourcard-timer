// 지점 코드 등록표. 전체 관리자(설정1)에서 편집·동기화 예정.
export const DEFAULT_BRANCHES = {
  FC001: { name: '본점', pin: '0000' },
  FC002: { name: '강남', pin: '0000' },
  FC003: { name: '홍대', pin: '0000' },
}

export function cloneBranches(branches) {
  return Object.fromEntries(
    Object.entries(branches).map(([code, branch]) => [code, { ...branch }]),
  )
}

export function normalizeBranches(raw) {
  if (!raw || typeof raw !== 'object') return cloneBranches(DEFAULT_BRANCHES)
  return { ...cloneBranches(DEFAULT_BRANCHES), ...raw }
}

export function getBranch(branches, code) {
  if (!code) return null
  return branches[code.trim().toUpperCase()] ?? null
}
