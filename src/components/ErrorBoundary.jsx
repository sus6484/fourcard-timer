import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  handleReset = () => {
    localStorage.removeItem('fourcard-timer-settings-v1')
    localStorage.removeItem('fourcard-timer-settings-v2')
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="boot-error">
        <h1>화면을 불러오지 못했습니다</h1>
        <p>저장된 설정이 손상됐을 수 있습니다. 아래 버튼으로 초기화 후 다시 열어주세요.</p>
        <button type="button" onClick={this.handleReset}>
          설정 초기화 후 새로고침
        </button>
      </div>
    )
  }
}
