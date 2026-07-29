import { useRef } from 'react'
import { assetPath } from '../lib/assets.js'

/**
 * Smart TV 브라우저에서 range 입력에 포커스가 잡히면
 * 방향키가 값 조절에만 소비되어 다른 컨트롤로 이동하지 못하는 경우가 있다.
 * 세로 방향키(ArrowUp/ArrowDown)는 슬라이더를 빠져나와 시작/정지 버튼으로 포커스를 넘긴다.
 * 가로 방향키(ArrowLeft/ArrowRight)는 기존대로 시간 조절에 사용한다.
 */
export default function TimeScrubber({
  isRunning,
  remainingSeconds,
  maxSeconds,
  onToggle,
  onSeek,
}) {
  const max = Math.max(maxSeconds, 1)
  const toggleRef = useRef(null)

  function handleSliderKeyDown(event) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return

    event.preventDefault()
    event.stopPropagation()

    const toggle = toggleRef.current
    if (toggle) {
      toggle.focus()
      return
    }

    event.currentTarget.blur()
  }

  return (
    <div className="time-scrubber">
      <button
        ref={toggleRef}
        type="button"
        className={`time-scrubber__toggle${isRunning ? ' is-running' : ''}`}
        aria-label={isRunning ? 'Pause timer' : 'Start timer'}
        onClick={onToggle}
      >
        <img src={assetPath('assets/btn_play.png')} alt="" />
      </button>

      <input
        type="range"
        className="time-scrubber__slider"
        min={0}
        max={max}
        step={1}
        value={Math.min(remainingSeconds, max)}
        aria-label="남은 시간 조절"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={remainingSeconds}
        onChange={(event) => onSeek(Number(event.target.value))}
        onKeyDown={handleSliderKeyDown}
      />
    </div>
  )
}
