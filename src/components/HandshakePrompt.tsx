import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  onSubmit: (phrase: string) => void;
}

export function HandshakePrompt({ onSubmit }: Props) {
  const [phrase, setPhrase] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (phrase.trim()) onSubmit(phrase.trim());
  }

  return (
    <div className="app-root">
      <div className="handshake-card">
        <h1
          className="text-2xl text-[#3d3226] mb-1"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          Picture of Our Day
        </h1>
        <p className="text-[#8a7560] text-sm mb-6">
          Enter your group's secret verbal handshake to get started.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder="psst... the phrase is..."
            className="bg-white/70 border-[#d4c9b8] text-[#3d3226] placeholder:text-[#baa994] text-center"
            autoFocus
          />
          <Button
            type="submit"
            disabled={!phrase.trim()}
            className="w-full bg-[#8a7560] hover:bg-[#6a5b4a] text-white disabled:opacity-40"
          >
            Shake on it
          </Button>
        </form>
      </div>
    </div>
  );
}
