import { useEffect, useMemo, useState } from 'react'
import { createBranchAccount, listBranches } from '../lib/auth.js'

export default function BranchLoginScreen({
  onSubmit,
  onClose,
  error = '',
  loading = false,
  configured = true,
  canCreateAccounts = false,
}) {
  const [mode, setMode] = useState('login')
  const [branches, setBranches] = useState([])
  const [branchesLoading, setBranchesLoading] = useState(false)
  const [branchesError, setBranchesError] = useState('')
  const [branchId, setBranchId] = useState('')
  const [password, setPassword] = useState('')

  const [createUsername, setCreateUsername] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [branchName, setBranchName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createSuccess, setCreateSuccess] = useState('')

  const sortedBranches = useMemo(
    () => [...branches].sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ko')),
    [branches],
  )

  const refreshBranches = async () => {
    setBranchesLoading(true)
    setBranchesError('')
    try {
      const next = await listBranches()
      setBranches(next)
    } catch (err) {
      setBranches([])
      setBranchesError(err?.message ?? '지점 목록을 불러오지 못했습니다.')
    } finally {
      setBranchesLoading(false)
    }
  }

  useEffect(() => {
    refreshBranches()
  }, [])

  const handleLogin = (event) => {
    event.preventDefault()
    if (loading) return
    onSubmit?.({ branchId, password })
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    if (!canCreateAccounts || saving) return

    setSaving(true)
    setCreateError('')
    setCreateSuccess('')
    try {
      const created = await createBranchAccount({
        username: createUsername,
        password: createPassword,
        branchName: branchName || createUsername,
        displayName: displayName || branchName || createUsername,
      })
      setCreateSuccess(`지점 "${created.name}" (아이디: ${created.username}) 계정이 생성되었습니다.`)
      setCreateUsername('')
      setCreatePassword('')
      setBranchName('')
      setDisplayName('')
      await refreshBranches()
      setBranchId(created.branchId)
    } catch (err) {
      setCreateError(err?.message ?? '지점 계정 생성에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="login-screen" role="dialog" aria-modal="true" aria-labelledby="branch-login-title">
      <div className="login-card branch-login-card">
        {mode === 'login' ? (
          <form onSubmit={handleLogin}>
            <p className="login-card__eyebrow">FOURCARD Timer</p>
            <h1 id="branch-login-title">지점 로그인</h1>
            <p className="login-card__hint">
              지점을 선택하고 비밀번호를 입력하세요. 로그인한 TV·컴퓨터끼리 타이머가 동기화됩니다.
            </p>

            {!configured && (
              <p className="login-card__error" role="alert">
                Firebase 설정이 없습니다. `.env`에 VITE_FIREBASE_* 값을 입력한 뒤 다시 실행하세요.
              </p>
            )}

            {branchesError ? (
              <p className="login-card__error" role="alert">
                {branchesError}
              </p>
            ) : null}

            <label className="login-field">
              <span>지점</span>
              <select
                value={branchId}
                disabled={!configured || loading || branchesLoading}
                onChange={(event) => setBranchId(event.target.value)}
                required
              >
                <option value="">
                  {branchesLoading ? '불러오는 중…' : '지점 선택'}
                </option>
                {sortedBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name || branch.id}
                  </option>
                ))}
              </select>
            </label>

            <label className="login-field">
              <span>비밀번호</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                disabled={!configured || loading}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>

            {error ? (
              <p className="login-card__error" role="alert">
                {error}
              </p>
            ) : null}

            <button type="submit" className="login-card__submit" disabled={!configured || loading}>
              {loading ? '로그인 중…' : '로그인'}
            </button>

            <button
              type="button"
              className="login-card__secondary"
              disabled={loading}
              onClick={() => {
                setMode('create')
                setCreateError('')
                setCreateSuccess('')
              }}
            >
              계정 생성
            </button>

            {onClose ? (
              <button
                type="button"
                className="login-card__cancel"
                disabled={loading}
                onClick={onClose}
              >
                닫기
              </button>
            ) : null}
          </form>
        ) : (
          <form onSubmit={handleCreate}>
            <p className="login-card__eyebrow">관리자</p>
            <h1 id="branch-login-title">지점 계정 생성</h1>
            {canCreateAccounts ? (
              <p className="login-card__hint">새 지점 계정을 만들면 로그인 목록에 바로 추가됩니다.</p>
            ) : (
              <p className="login-card__hint">
                계정 생성은 관리자만 할 수 있습니다. 설정에서 관리자 로그인 후 다시 시도하세요.
              </p>
            )}

            <label className="login-field">
              <span>지점 이름</span>
              <input
                type="text"
                value={branchName}
                disabled={!canCreateAccounts || saving}
                onChange={(event) => setBranchName(event.target.value)}
                placeholder="예: 강남점"
              />
            </label>
            <label className="login-field">
              <span>표시 이름</span>
              <input
                type="text"
                value={displayName}
                disabled={!canCreateAccounts || saving}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="선택"
              />
            </label>
            <label className="login-field">
              <span>아이디</span>
              <input
                type="text"
                required
                autoComplete="off"
                value={createUsername}
                disabled={!canCreateAccounts || saving}
                onChange={(event) => setCreateUsername(event.target.value)}
                placeholder="예: gangnam"
              />
            </label>
            <label className="login-field">
              <span>비밀번호</span>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={createPassword}
                disabled={!canCreateAccounts || saving}
                onChange={(event) => setCreatePassword(event.target.value)}
                placeholder="4자 이상"
              />
            </label>

            {createError ? (
              <p className="login-card__error" role="alert">
                {createError}
              </p>
            ) : null}
            {createSuccess ? <p className="branch-manager__success">{createSuccess}</p> : null}

            <button
              type="submit"
              className="login-card__submit"
              disabled={!canCreateAccounts || saving}
            >
              {saving ? '생성 중…' : '지점 계정 생성'}
            </button>

            <button
              type="button"
              className="login-card__cancel"
              disabled={saving}
              onClick={() => setMode('login')}
            >
              로그인으로 돌아가기
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
