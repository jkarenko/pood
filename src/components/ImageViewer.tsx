import { useEffect, useState } from "react";

interface Props {
  imageUrl: string;
  name: string;
  onClose: () => void;
  onDelete: () => void;
}

export function ImageViewer({ imageUrl, name, onClose, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirming) setConfirming(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, confirming]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm cursor-pointer"
      onClick={() => {
        if (confirming) setConfirming(false);
        else onClose();
      }}
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={imageUrl}
          alt={`Photo by ${name}`}
          className="max-w-full max-h-[85vh] object-contain rounded-sm shadow-2xl cursor-default"
          draggable={false}
        />
        <div className="mt-3 flex items-center gap-4">
          <p
            className="text-white/80 text-sm tracking-wide"
            style={{ fontFamily: "'Caveat', cursive" }}
          >
            {name}
          </p>
        </div>

        {/* Delete button — bottom left */}
        <div className="absolute bottom-2 left-2">
          {confirming ? (
            <button
              onClick={onDelete}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded-md shadow-lg transition-colors"
            >
              Remove photo?
            </button>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="p-2 bg-black/40 hover:bg-black/60 text-white/60 hover:text-white/90 rounded-full transition-colors"
              title="Delete photo"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M3 6h18" />
                <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
