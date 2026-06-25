import { assetPath } from '../lib/assets.js'

const iconControls = [
  { id: 'prev', icon: assetPath('assets/btn_previous2.png'), label: 'Previous level' },
  { id: 'toggle', icon: assetPath('assets/btn_play.png'), label: 'Play or pause' },
  { id: 'next', icon: assetPath('assets/btn_next.png'), label: 'Next level' },
]

const timeAdjustControls = [
  { id: 'minus10', label: '−10', ariaLabel: '10초 빼기' },
  { id: 'plus10', label: '+10', ariaLabel: '10초 더하기' },
]

export default function Controls({ isRunning, onAction }) {
  return (
    <div className="controls">
      {iconControls.map((control) => (
        <button
          key={control.id}
          type="button"
          className={`controls__button${control.id === 'toggle' && isRunning ? ' is-running' : ''}`}
          aria-label={control.label}
          onClick={() => onAction(control.id)}
        >
          <img src={control.icon} alt="" />
        </button>
      ))}
      <div className="controls__adjust">
        {timeAdjustControls.map((control) => (
          <button
            key={control.id}
            type="button"
            className="controls__adjust-button"
            aria-label={control.ariaLabel}
            onClick={() => onAction(control.id)}
          >
            {control.label}
          </button>
        ))}
        <button
          type="button"
          className="controls__button"
          aria-label="Reset timer"
          onClick={() => onAction('reset')}
        >
          <img src={assetPath('assets/btn_reset2.png')} alt="" />
        </button>
      </div>
    </div>
  )
}
