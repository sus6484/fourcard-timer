export const GLOBAL_SYNC_URL =
  'https://script.google.com/macros/s/AKfycbz2KFZPBv8CjR8_mfJdwJDDPsc_PqyRFmlsXUWvoOALpBnwepUeXYlhb20eyQSka5SU/exec'

async function parseJsonResponse(response) {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('서버 응답을 읽을 수 없습니다.')
  }
}

export async function fetchGlobalFromCloud() {
  const response = await fetch(GLOBAL_SYNC_URL, { method: 'GET' })
  const data = await parseJsonResponse(response)

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
  const body = {
    pin,
    globalGames,
  }

  if (typeof adminPin === 'string') {
    body.adminPin = adminPin
  }

  const response = await fetch(GLOBAL_SYNC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  })

  const data = await parseJsonResponse(response)

  if (data.error) {
    if (response.status === 403 || data.error.includes('PIN')) {
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
