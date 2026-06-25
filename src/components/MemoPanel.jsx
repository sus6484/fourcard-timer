import { MEMO_STYLE } from '../lib/settings.js'

const MEMO_COLORS = [
  { id: 'gold', label: '골드', value: '#c8a96b' },
  { id: 'white', label: '흰색', value: '#f5f5f5' },
  { id: 'red', label: '빨강', value: '#ff8e8e' },
  { id: 'green', label: '초록', value: '#8fd98f' },
  { id: 'blue', label: '파랑', value: '#8ec8ff' },
]

export default function MemoPanel({
  memo,
  open,
  editing,
  fontSize,
  color,
  onChange,
  onFontSizeChange,
  onColorChange,
}) {
  if (!open) return null

  const canDecrease = fontSize > MEMO_STYLE.fontSizeMin
  const canIncrease = fontSize < MEMO_STYLE.fontSizeMax
  const hasMemo = memo.trim().length > 0
  const textStyle = { fontSize: `${fontSize}px`, color }

  return (
    <div className="memo-panel">
      {editing && (
        <>
          <div className="memo-panel__toolbar" aria-label="메모 글씨 설정">
            <div className="memo-panel__size-group">
              <span className="memo-panel__toolbar-label">크기</span>
              <button
                type="button"
                className="memo-panel__size-btn"
                aria-label="글씨 작게"
                disabled={!canDecrease}
                onClick={() => onFontSizeChange(fontSize - MEMO_STYLE.fontSizeStep)}
              >
                A-
              </button>
              <span className="memo-panel__size-value" aria-live="polite">{fontSize}</span>
              <button
                type="button"
                className="memo-panel__size-btn"
                aria-label="글씨 크게"
                disabled={!canIncrease}
                onClick={() => onFontSizeChange(fontSize + MEMO_STYLE.fontSizeStep)}
              >
                A+
              </button>
            </div>

            <div className="memo-panel__color-group">
              <span className="memo-panel__toolbar-label">색상</span>
              <div className="memo-panel__colors">
                {MEMO_COLORS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`memo-panel__color-btn${color === option.value ? ' is-active' : ''}`}
                    aria-label={`${option.label} 색상`}
                    aria-pressed={color === option.value}
                    style={{ '--memo-swatch': option.value }}
                    onClick={() => onColorChange(option.value)}
                  />
                ))}
              </div>
            </div>
          </div>

          <textarea
            className="memo-panel__input"
            value={memo}
            placeholder={'1st Prize\n2nd Prize\nRe-entry ...'}
            style={textStyle}
            onChange={(event) => onChange(event.target.value)}
          />
        </>
      )}

      {!editing && hasMemo && (
        <div className="memo-panel__display" style={textStyle}>
          {memo}
        </div>
      )}
    </div>
  )
}
