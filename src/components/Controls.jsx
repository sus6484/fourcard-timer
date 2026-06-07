import { assetPath } from '../lib/assets.js'

const controls = [
  { id: 'prev', icon: assetPath('assets/btn_previous2.png'), label: 'Previous level' },
  { id: 'toggle', icon: assetPath('assets/btn_play.png'), label: 'Play or pause' },
  { id: 'forward', icon: assetPath('assets/btn_plus.png'), label: 'Add one minute' },
  { id: 'next', icon: assetPath('assets/btn_next.png'), label: 'Next level' },
  { id: 'reset', icon: assetPath('assets/btn_reset2.png'), label: 'Reset timer' },
]

export default function Controls({ isRunning, onAction }) {
  return (
    <div className="controls">
      {controls.map((control) => (
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
    </div>
  )
}
