export default function PrizePanel({ open, prize, fontSize, color }) {
  if (!open) return null

  const text = typeof prize === 'string' ? prize.trim() : ''
  const textStyle = text ? { fontSize: `${fontSize}px`, color } : undefined

  return (
    <div className="memo-panel">
      <div
        className={`memo-panel__display prize-panel__display${text ? '' : ' is-empty'}`}
        style={textStyle}
      >
        {text || '등록된 상금이 없습니다.'}
      </div>
    </div>
  )
}
