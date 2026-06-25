export const GLOBAL_SYNC_URL =
  'https://script.google.com/macros/s/AKfycbz2KFZPBv8CjR8_mfJdwJDDPsc_PqyRFmlsXUWvoOALpBnwepUeXYlhb20eyQSka5SU/exec'

const REQUEST_TIMEOUT_MS = 12000

export function isFileProtocol() {
  return typeof window !== 'undefined' && window.location.protocol === 'file:'
}

export function getNetworkSyncBlockedReason() {
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
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let response
  try {
    response = await fetch(url, {
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
      ...options,
    })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('구글 시트 응답 시간이 초과되었습니다. 인터넷 연결을 확인하세요.')
    }

    throw new Error(
      error?.message?.includes('Failed to fetch')
        ? isFileProtocol()
          ? '오프라인 모드로 실행 중입니다. 구글 시트 연동은 open-timer.bat 또는 GitHub Pages 링크를 사용하세요.'
          : '네트워크 요청이 차단되었습니다. 인터넷 연결을 확인하세요.'
        : error?.message ?? '네트워크 요청에 실패했습니다.',
    )
  } finally {
    clearTimeout(timeoutId)
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
  if (isFileProtocol()) {
    throw new Error('HTML 파일로 직접 열면 구글 시트에 저장할 수 없습니다. open-timer.bat으로 실행하세요.')
  }

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
