import { useEffect } from "react";

interface Props {
  imageUrl: string;
  name: string;
  onClose: () => void;
}

export function ImageViewer({ imageUrl, name, onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm cursor-pointer"
      onClick={onClose}
    >
      <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center">
        <img
          src={imageUrl}
          alt={`Photo by ${name}`}
          className="max-w-full max-h-[85vh] object-contain rounded-sm shadow-2xl"
          onClick={onClose}
          draggable={false}
        />
        <p
          className="mt-3 text-white/80 text-sm tracking-wide"
          style={{ fontFamily: "'Caveat', cursive" }}
        >
          {name}
        </p>
      </div>
    </div>
  );
}
