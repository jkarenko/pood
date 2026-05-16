import type { DayEntry } from "@/lib/storage";

interface Props {
  entry: DayEntry;
  imageUrl: string | null;
  onClick: () => void;
  className?: string;
}

function topReaction(reactions: Record<string, number> | undefined) {
  if (!reactions) return null;
  let topEmoji: string | null = null;
  let topCount = 0;
  let total = 0;
  for (const [emoji, count] of Object.entries(reactions)) {
    total += count;
    if (count > topCount) {
      topCount = count;
      topEmoji = emoji;
    }
  }
  return topEmoji ? { emoji: topEmoji, total } : null;
}

export function PolaroidImage({ entry, imageUrl, onClick, className = "" }: Props) {
  if (!imageUrl) return null;
  const top = topReaction(entry.reactions);

  return (
    <div
      className={`polaroid-container ${className}`}
      style={{
        transform: `rotate(${entry.tilt}deg) translate(${entry.offsetX}px, ${entry.offsetY}px)`,
      }}
      onClick={onClick}
    >
      <div className="polaroid-frame">
        <div className="polaroid-image-wrap">
          <img
            src={imageUrl}
            alt={`Photo by ${entry.name}`}
            className="polaroid-image"
            draggable={false}
          />
          {top && (
            <div className="polaroid-reaction-badge">
              <span className="polaroid-reaction-emoji">{top.emoji}</span>
              {top.total > 1 && <span className="polaroid-reaction-count">{top.total}</span>}
            </div>
          )}
        </div>
        <div className="polaroid-label">{entry.name}</div>
      </div>
    </div>
  );
}
