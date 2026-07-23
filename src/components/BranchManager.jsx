import { useEffect, useMemo, useState } from 'react'
import { createBranchAccount, listBranches } from '../lib/auth.js'

export default function BranchManager({ open, onClose }) {
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [branchName, setBranchName] = useState('')
  const [displayName, setDisplayName] = useState('')

  const sortedBranches = useMemo(
    () => [...branches].sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ko')),
    [branches],
  )

  const refresh = async () => {
    setLoading(true)
    setError('')
    try {
      const next = await listBranches()
      setBranches(next)
    } catch (err) {
      setError(err?.message ?? '지점 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return undefined
    refresh()
    return undefined
  }, [open])

  if (!open) return null

  const handleCreate = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const created = await createBranchAccount({
        username,
        password,
        branchName: branchName || username,
        displayName: displayName || branchName || username,
      })
      setSuccess(`지점 "${created.name}" (아이디: ${created.username}) 계정이 생성되었습니다.`)
      setUsername('')
      setPassword('')
      setBranchName('')
      setDisplayName('')
      await refresh()
    } catch (err) {
      setError(err?.message ?? '지점 계정 생성에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-overlay">
      <div className="admin-panel branch-manager">
        <header className="admin-panel__header">
          <div>
            <p className="admin-panel__eyebrow">관리자</p>
            <h2>지점 계정 관리</h2>
          </div>
          <div className="admin-panel__header-actions">
            <button type="button" className="admin-panel__close" onClick={onClose}>
              닫기
            </button>
          </div>
        </header>

        <section className="admin-panel__section">
          <h3>새 지점 계정</h3>
          <form className="branch-manager__form" onSubmit={handleCreate}>
            <label className="admin-field">
              <span>지점 이름</span>
              <input
                type="text"
                value={branchName}
                onChange={(event) => setBranchName(event.target.value)}
                placeholder="예: 강남점"
              />
            </label>
            <label className="admin-field">
              <span>표시 이름</span>
              <input
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="선택"
              />
            </label>
            <label className="admin-field">
              <span>아이디</span>
              <input
                type="text"
                required
                autoComplete="off"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="예: gangnam"
              />
            </label>
            <label className="admin-field">
              <span>비밀번호</span>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="4자 이상"
              />
            </label>
            <button type="submit" className="admin-panel__save" disabled={saving}>
              {saving ? '생성 중…' : '지점 계정 생성'}
            </button>
          </form>
          {error ? <p className="admin-panel__sync-error">{error}</p> : null}
          {success ? <p className="branch-manager__success">{success}</p> : null}
        </section>

        <section className="admin-panel__section">
          <div className="admin-panel__row admin-panel__row--between">
            <h3>등록된 지점</h3>
            <button type="button" onClick={refresh} disabled={loading}>
              {loading ? '불러오는 중…' : '새로고침'}
            </button>
          </div>
          {sortedBranches.length === 0 ? (
            <p className="admin-panel__note">등록된 지점이 없습니다.</p>
          ) : (
            <ul className="branch-manager__list">
              {sortedBranches.map((branch) => (
                <li key={branch.id}>
                  <strong>{branch.name || branch.id}</strong>
                  <span>아이디: {branch.username || '—'}</span>
                  <span className="branch-manager__id">{branch.id}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
