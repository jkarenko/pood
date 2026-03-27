import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onClose: () => void;
  onUpload: (file: File, name: string) => void;
  defaultName: string;
  isFull: boolean;
}

export function UploadDialog({ open, onClose, onUpload, defaultName, isFull }: Props) {
  const [name, setName] = useState(defaultName);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(defaultName);
      setPreview(null);
      setFile(null);
    }
  }, [open, defaultName]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  }

  function handleSubmit() {
    if (!file || !name.trim()) return;
    onUpload(file, name.trim());
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md bg-[#faf6f0] border-[#d4c9b8]">
        <DialogHeader>
          <DialogTitle
            className="text-xl text-[#3d3226]"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Add your picture of the day
          </DialogTitle>
        </DialogHeader>

        {isFull ? (
          <p className="text-[#8a7560] text-sm py-4">
            Today's page is full — all 9 spots are taken!
          </p>
        ) : (
          <div className="space-y-4 pt-2">
            <div>
              <Label htmlFor="name" className="text-[#5a4a3a] text-sm">
                Your name
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Anonymous friend"
                className="mt-1 bg-white/70 border-[#d4c9b8] text-[#3d3226] placeholder:text-[#baa994]"
              />
            </div>

            <div>
              <Label className="text-[#5a4a3a] text-sm">Photo</Label>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                onChange={handleFile}
                className="hidden"
              />
              {preview ? (
                <div className="mt-2 relative">
                  <img
                    src={preview}
                    className="w-full max-h-60 object-contain rounded border border-[#d4c9b8]"
                    alt="Preview"
                  />
                  <button
                    onClick={() => {
                      setPreview(null);
                      setFile(null);
                    }}
                    className="absolute top-1 right-1 bg-black/50 text-white rounded-full w-6 h-6 text-xs flex items-center justify-center hover:bg-black/70"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => inputRef.current?.click()}
                  className="mt-2 w-full h-32 border-2 border-dashed border-[#c4b5a0] rounded-lg flex flex-col items-center justify-center text-[#8a7560] hover:border-[#a08b73] hover:text-[#6a5b4a] transition-colors"
                >
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                  <span className="text-sm mt-2">Choose a photo</span>
                </button>
              )}
            </div>

            <Button
              onClick={handleSubmit}
              disabled={!file || !name.trim()}
              className="w-full bg-[#8a7560] hover:bg-[#6a5b4a] text-white disabled:opacity-40"
            >
              Pin to today's page
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
