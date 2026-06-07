export default function MemoPanel({ memo, open, onChange }) {
  if (!open) return null

  return (
    <div className="memo-panel">
      <textarea
        className="memo-panel__input"
        value={memo}
        placeholder={'1st Prize\n2nd Prize\nRe-entry ...'}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}
