export default function MemoPanel({ memo, editable, onChange }) {
  if (!memo && !editable) return null

  return (
    <div className={`memo-panel${editable ? ' memo-panel--editable' : ''}`}>
      {editable ? (
        <textarea
          className="memo-panel__input"
          value={memo}
          placeholder={'1st Prize\n2nd Prize\nRe-entry ...'}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <pre className="memo-panel__text">{memo}</pre>
      )}
    </div>
  )
}
