import { useState } from 'react'

export default function LoginScreen({
  onSubmit,
  onClose,
  error = '',
  loading = false,
  configured = true,
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (event) => {
    event.preventDefault()
    if (loading) return
    onSubmit?.({
      username: username.trim(),
      password,
    })
  }

  return (
    <div className="login-screen" role="dialog" aria-modal="true" aria-labelledby="login-title">
      <form className="login-card" onSubmit={handleSubmit}>
        <p className="login-card__eyebrow">FOURCARD Timer</p>
        <h1 id="login-title">관리자 로그인</h1>
        <p className="login-card__hint">
          관리자 아이디와 비밀번호로 로그인합니다. 전체 게임 설정과 지점 계정 생성을 관리할 수 있습니다.
        </p>

        {!configured && (
          <p className="login-card__error" role="alert">
            Firebase 설정이 없습니다. `.env`에 VITE_FIREBASE_* 값을 입력한 뒤 다시 실행하세요.
          </p>
        )}

        <label className="login-field">
          <span>아이디</span>
          <input
            type="text"
            autoComplete="username"
            autoFocus
            value={username}
            disabled={!configured || loading}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>

        <label className="login-field">
          <span>비밀번호</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            disabled={!configured || loading}
            onChange={(event) => setPassword(event.target.value)}
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
    </div>
  )
}
