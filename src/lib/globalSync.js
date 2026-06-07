export const GLOBAL_SYNC_URL =
  'https://script.google.com/macros/s/AKfycbz2KFZPBv8CjR8_mfJdwJDDPsc_PqyRFmlsXUWvoOALpBnwepUeXYlhb20eyQSka5SU/exec'

export function isFileProtocol() {
  return typeof window !== 'undefined' && window.location.protocol === 'file:'
}

export function getNetworkSyncBlockedReason() {
  if (isFileProtocol()) {
    return 'file:// 로 열면 브라우저가 구글 시트 통신을 차단합니다. open-timer.bat 또는 npm run serve:file 로 실행하세요.'
  }
  return null
}

function buildGetUrl() {
  const separator = GLOBAL_SYNC_URL.includes('?') ? '&' : '?'
  return `${GLOBAL_SYNC_URL}${separator}t=${Date.now()}`
}

function parseJsonText(text) {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('서버가 빈 응답을 반환했습니다.')
  }

  const jsonStart = trimmed.indexOf('{')
  const jsonText = jsonStart >= 0 ? trimmed.slice(jsonStart) : trimmed

  try {
    return JSON.parse(jsonText)
  } catch {
    throw new Error(`서버 응답을 JSON으로 읽을 수 없습니다: ${trimmed.slice(0, 160)}`)
  }
}

async function parseJsonResponse(response) {
  const text = await response.text()
  return parseJsonText(text)
}

async function requestJson(url, options) {
  const blocked = getNetworkSyncBlockedReason()
  if (blocked) {
    throw new Error(blocked)
  }

  let response
  try {
    response = await fetch(url, {
      cache: 'no-store',
      redirect: 'follow',
      ...options,
    })
  } catch (error) {
    throw new Error(
      error?.message?.includes('Failed to fetch')
        ? '네트워크 요청이 차단되었습니다. 인터넷 연결과 실행 방법(open-timer.bat / npm run serve:file)을 확인하세요.'
        : error?.message ?? '네트워크 요청에 실패했습니다.',
    )
  }

  if (!response.ok) {
    throw new Error(`구글 시트 요청 실패 (HTTP ${response.status})`)
  }

  return parseJsonResponse(response)
}

export async function fetchGlobalFromCloud() {
  const data = await requestJson(buildGetUrl(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })

  if (data.error) {
    throw new Error(data.error)
  }

  return {
    globalGames: Array.isArray(data.globalGames) ? data.globalGames : [],
    adminPin: typeof data.adminPin === 'string' ? data.adminPin : '0000',
    updatedAt: data.updatedAt ?? null,
  }
}

export async function saveGlobalToCloud({ pin, globalGames, adminPin }) {
  const payload = { pin, globalGames }
  if (typeof adminPin === 'string') {
    payload.adminPin = adminPin
  }

  const data = await requestJson(GLOBAL_SYNC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  })

  if (data.error) {
    if (data.error.includes('PIN')) {
      throw new Error('PIN이 올바르지 않습니다. 구글 시트의 adminPin과 일치하는지 확인하세요.')
    }
    throw new Error(data.error)
  }

  if (!data.ok) {
    throw new Error('구글 시트 저장에 실패했습니다.')
  }

  return {
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  }
}
