import { useState } from "react";

interface Props {
  phrases: string[];
  activePhrase: string;
  onSwitch: (phrase: string) => void;
  onAdd: (phrase: string) => void;
  onRemove: (phrase: string) => void;
}

export function GroupSwitcher({
  phrases,
  activePhrase,
  onSwitch,
  onAdd,
  onRemove,
}: Props) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newPhrase, setNewPhrase] = useState("");

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (newPhrase.trim()) {
      onAdd(newPhrase.trim());
      setNewPhrase("");
      setAdding(false);
      setOpen(false);
    }
  }

  return (
    <div className="group-switcher">
      <button
        className="group-stub-btn"
        onClick={() => setOpen(!open)}
        title="Switch group"
      >
        <span className="group-stub-label">{activePhrase}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className={`group-stub-chevron ${open ? "open" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="group-dropdown">
          {phrases.map((phrase) => (
            <div
              key={phrase}
              className={`group-dropdown-item ${phrase === activePhrase ? "active" : ""}`}
            >
              <button
                className="group-dropdown-label"
                onClick={() => {
                  if (phrase !== activePhrase) onSwitch(phrase);
                  setOpen(false);
                }}
              >
                {phrase}
              </button>
              {phrases.length > 1 && (
                <button
                  className="group-dropdown-remove"
                  onClick={() => onRemove(phrase)}
                  title="Remove group"
                >
                  ×
                </button>
              )}
            </div>
          ))}

          {adding ? (
            <form onSubmit={handleAdd} className="group-dropdown-add-form">
              <input
                value={newPhrase}
                onChange={(e) => setNewPhrase(e.target.value.slice(0, 20))}
                placeholder="new handshake..."
                className="group-dropdown-input"
                autoFocus
                onBlur={() => {
                  if (!newPhrase.trim()) setAdding(false);
                }}
              />
            </form>
          ) : (
            <button
              className="group-dropdown-add"
              onClick={() => setAdding(true)}
            >
              + Add group
            </button>
          )}
        </div>
      )}
    </div>
  );
}
