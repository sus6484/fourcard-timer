import { assetPath } from '../lib/assets.js'

export default function TimeScrubber({
  isRunning,
  remainingSeconds,
  maxSeconds,
  onToggle,
  onSeek,
}) {
  const max = Math.max(maxSeconds, 1)

  return (
    <div className="time-scrubber">
      <button
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
      />
    </div>
  )
}
