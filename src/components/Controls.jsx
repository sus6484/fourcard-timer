const controls = [
  { id: 'prev', icon: '/assets/btn_previous2.png', label: 'Previous level' },
  { id: 'toggle', icon: '/assets/btn_play.png', label: 'Play or pause' },
  { id: 'forward', icon: '/assets/btn_plus.png', label: 'Add one minute' },
  { id: 'next', icon: '/assets/btn_next.png', label: 'Next level' },
  { id: 'reset', icon: '/assets/btn_reset2.png', label: 'Reset timer' },
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
