import { useEffect, useState } from "react";
import Picker from "@emoji-mart/react";
import emojiData from "@emoji-mart/data";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Props {
  imageUrl: string;
  name: string;
  reactions: Record<string, number>;
  onClose: () => void;
  onDelete: () => void;
  onReact: (emoji: string, delta: 1 | -1) => void;
}

export function ImageViewer({ imageUrl, name, reactions, onClose, onDelete, onReact }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (pickerOpen) setPickerOpen(false);
        else if (confirming) setConfirming(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, confirming, pickerOpen]);

  const sortedReactions = Object.entries(reactions).sort((a, b) => b[1] - a[1]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm cursor-pointer"
      onClick={() => {
        if (pickerOpen) setPickerOpen(false);
        else if (confirming) setConfirming(false);
        else onClose();
      }}
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center"
      >
        <img
          src={imageUrl}
          alt={`Photo by ${name}`}
          className="max-w-full max-h-[85vh] object-contain rounded-sm shadow-2xl cursor-default"
          draggable={false}
        />

        {sortedReactions.length > 0 && (
          <div
            className="mt-3 flex flex-wrap items-center justify-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {sortedReactions.map(([emoji, count]) => (
              <button
                key={emoji}
                onClick={() => onReact(emoji, 1)}
                className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center gap-1.5 transition-colors"
              >
                <span className="text-base leading-none">{emoji}</span>
                <span className="text-xs font-medium">{count}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center gap-4">
          <p
            className="text-white/80 text-sm tracking-wide"
            style={{ fontFamily: "'Caveat', cursive" }}
          >
            {name}
          </p>
        </div>

        {/* Delete button — bottom left */}
        <div className="absolute bottom-2 left-2" onClick={(e) => e.stopPropagation()}>
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

        {/* Add-reaction button — top right */}
        <div className="absolute top-2 right-2" onClick={(e) => e.stopPropagation()}>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <button
                className="p-2 bg-black/40 hover:bg-black/60 text-white/60 hover:text-white/90 rounded-full transition-colors"
                title="Add reaction"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" opacity="0" />
                  <circle cx="12" cy="12" r="9" />
                  <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                  <line x1="9" y1="10" x2="9.01" y2="10" />
                  <line x1="15" y1="10" x2="15.01" y2="10" />
                  <line x1="19" y1="4" x2="19" y2="8" />
                  <line x1="17" y1="6" x2="21" y2="6" />
                </svg>
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={6}
              className="p-0 w-auto border-none bg-transparent shadow-none"
            >
              <Picker
                data={emojiData}
                theme="dark"
                onEmojiSelect={(e: { native: string }) => {
                  onReact(e.native, 1);
                  setPickerOpen(false);
                }}
                previewPosition="none"
                skinTonePosition="none"
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}
