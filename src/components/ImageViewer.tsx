import { useEffect, useRef, useState } from "react";
import Picker from "@emoji-mart/react";
import emojiData from "@emoji-mart/data";
import { SmilePlus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const LONG_PRESS_MS = 500;

interface ChipProps {
  emoji: string;
  count: number;
  isMine: boolean;
  onTap: () => void;
  onForceRemove: () => void;
}

function ReactionChip({ emoji, count, isMine, onTap, onForceRemove }: ChipProps) {
  const timerRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  const startTimer = () => {
    firedRef.current = false;
    timerRef.current = window.setTimeout(() => {
      firedRef.current = true;
      onForceRemove();
    }, LONG_PRESS_MS);
  };
  const cancelTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <button
      onPointerDown={startTimer}
      onPointerUp={cancelTimer}
      onPointerLeave={cancelTimer}
      onPointerCancel={cancelTimer}
      onContextMenu={(e) => {
        e.preventDefault();
        cancelTimer();
        firedRef.current = true;
        onForceRemove();
      }}
      onClick={() => {
        if (firedRef.current) {
          firedRef.current = false;
          return;
        }
        onTap();
      }}
      className={
        "px-2.5 py-1 rounded-full flex items-center gap-1.5 transition-colors text-white select-none " +
        (isMine
          ? "bg-white/25 ring-1 ring-white/50 hover:bg-white/30"
          : "bg-white/10 hover:bg-white/20")
      }
      title="Tap to toggle · hold to remove one"
    >
      <span className="text-base leading-none">{emoji}</span>
      <span className="text-xs font-medium">{count}</span>
    </button>
  );
}

interface Props {
  imageUrl: string;
  name: string;
  reactions: Record<string, number>;
  myReactions: string[];
  onClose: () => void;
  onDelete: () => void;
  onToggleReaction: (emoji: string) => void;
  onForceRemove: (emoji: string) => void;
}

export function ImageViewer({ imageUrl, name, reactions, myReactions, onClose, onDelete, onToggleReaction, onForceRemove }: Props) {
  const mine = new Set(myReactions);
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
              <ReactionChip
                key={emoji}
                emoji={emoji}
                count={count}
                isMine={mine.has(emoji)}
                onTap={() => onToggleReaction(emoji)}
                onForceRemove={() => onForceRemove(emoji)}
              />
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
                <SmilePlus size={20} strokeWidth={2} />
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
                  onToggleReaction(e.native);
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
