import React, { useRef, useCallback } from 'react';

// ─── Waveform data ─────────────────────────────────────────────────────────────

const BARS = 80;

// Organic emotion intensity curve with peaks at emotionally charged moments
const INTENSITY: number[] = (() => {
  const data: number[] = [];
  for (let i = 0; i < BARS; i++) {
    const t = i / BARS;
    const v =
      0.14 +
      0.10 * Math.sin(t * Math.PI * 2.5) +
      0.22 * Math.max(0, Math.sin((t - 0.24) * Math.PI * 6.5)) +
      0.18 * Math.max(0, Math.sin((t - 0.48) * Math.PI * 5.5)) +
      0.30 * Math.max(0, Math.sin((t - 0.70) * Math.PI * 6)) +
      0.32 * Math.max(0, Math.sin((t - 0.88) * Math.PI * 9));
    data.push(Math.max(0.06, Math.min(1, v)));
  }
  return data;
})();

// ─── Seed markers (ghost reactions from "other users") ─────────────────────────

export interface Marker {
  id: string;
  time: number; // 0–1
  emoji: string;
  isUser?: boolean;
}

export const SEED_MARKERS: Marker[] = [
  { id: 'g1',  time: 0.10, emoji: '😂' },
  { id: 'g2',  time: 0.25, emoji: '❤️' },
  { id: 'g3',  time: 0.27, emoji: '🔥' },
  { id: 'g4',  time: 0.28, emoji: '😂' },
  { id: 'g5',  time: 0.49, emoji: '😢' },
  { id: 'g6',  time: 0.51, emoji: '😱' },
  { id: 'g7',  time: 0.71, emoji: '🔥' },
  { id: 'g8',  time: 0.73, emoji: '❤️' },
  { id: 'g9',  time: 0.88, emoji: '😂' },
  { id: 'g10', time: 0.90, emoji: '🔥' },
  { id: 'g11', time: 0.92, emoji: '❤️' },
];

const EMOJI_OPTIONS = ['❤️', '😂', '😢', '😱', '🔥'];

// ─── Component ─────────────────────────────────────────────────────────────────

interface Props {
  progress: number;   // 0–1, driven by rAF in parent
  onSeek: (ratio: number) => void;
}

export function EmotionHeatmap({ progress, onSeek }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);

  const handleTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(ratio);
  }, [onSeek]);

  const W = 100;   // SVG viewBox width
  const H = 36;    // SVG viewBox height
  const barW = W / BARS;
  const gap = 0.35;

  return (
    <div
      className="absolute inset-x-0 z-40 select-none"
      style={{ bottom: 78 }}
    >
      {/* Waveform + seek track */}
      <div
        ref={trackRef}
        onClick={handleTrackClick}
        style={{ position: 'relative', cursor: 'pointer' }}
      >
        {/* SVG Waveform */}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ display: 'block', width: '100%', height: H }}
        >
          <defs>
            <linearGradient id="playedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff6b8a" />
              <stop offset="100%" stopColor="#FE2C55" />
            </linearGradient>
          </defs>

          {INTENSITY.map((v, i) => {
            const barT = i / BARS;
            const played = barT <= progress;
            const nearCursor = Math.abs(barT - progress) < 1.4 / BARS;
            const bh = Math.max(2, v * (H - 2));
            const x = i * barW + gap / 2;
            const w = barW - gap;

            let fill: string;
            let opacity: number;
            if (nearCursor) {
              fill = '#ffffff';
              opacity = 1;
            } else if (played) {
              fill = 'url(#playedGrad)';
              opacity = 0.45 + v * 0.55;
            } else {
              fill = 'rgba(255,255,255,0.22)';
              opacity = 0.25 + v * 0.22;
            }

            return (
              <rect
                key={i}
                x={x}
                y={H - bh}
                width={w}
                height={bh}
                fill={fill}
                opacity={opacity}
                rx={0.8}
              />
            );
          })}
        </svg>

        {/* Cursor glow line */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 14,
            width: 2,
            left: `${progress * 100}%`,
            transform: 'translateX(-50%)',
            willChange: 'left',
            background: 'rgba(255,255,255,0.95)',
            boxShadow: '0 0 6px 2px rgba(255,255,255,0.55)',
            borderRadius: 1,
            pointerEvents: 'none',
          }}
        />

        {/* Progress track */}
        <div style={{
          position: 'absolute', bottom: 3, left: 0, right: 0,
          height: 2, background: 'rgba(255,255,255,0.18)',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: '100%',
            background: 'rgba(255,255,255,0.9)',
            transformOrigin: 'left center',
            transform: `scaleX(${progress})`,
          }} />
        </div>

        {/* Playhead dot */}
        <div style={{
          position: 'absolute', bottom: 1,
          left: `${progress * 100}%`,
          transform: 'translateX(-50%)',
          willChange: 'left',
          width: 6, height: 6,
          background: '#fff',
          borderRadius: '50%',
          boxShadow: '0 0 4px 2px rgba(255,255,255,0.5)',
          pointerEvents: 'none',
        }} />

      </div>
    </div>
  );
}
