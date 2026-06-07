import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './styles/app.css'

function showBootError(message) {
  const root = document.getElementById('root')
  if (!root) return
  root.innerHTML = `
    <div class="boot-error">
      <h1>화면을 불러오지 못했습니다</h1>
      <p>${message}</p>
      <button type="button" onclick="localStorage.clear(); location.reload()">설정 초기화 후 새로고침</button>
    </div>
  `
}

function mount() {
  const root = document.getElementById('root')
  if (!root) {
    showBootError('앱 루트(#root)를 찾지 못했습니다. release/index.html 을 열어주세요.')
    return
  }

  try {
    createRoot(root).render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    )
  } catch (error) {
    showBootError(error?.message ?? '알 수 없는 오류')
  }
}

window.addEventListener('error', (event) => {
  showBootError(event.message || '스크립트 오류')
})

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount)
} else {
  mount()
}
