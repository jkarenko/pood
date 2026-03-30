import type { DayEntry } from "@/lib/storage";

interface Props {
  entry: DayEntry;
  imageUrl: string | null;
  onClick: () => void;
  className?: string;
}

export function PolaroidImage({ entry, imageUrl, onClick, className = "" }: Props) {
  if (!imageUrl) return null;

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
        </div>
        <div className="polaroid-label">{entry.name}</div>
      </div>
    </div>
  );
}
