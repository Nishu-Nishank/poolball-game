import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Typography } from '@mui/material';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import { colors } from '../../theme';

/** How long the sparkles play before the result is shown. */
export const REVEAL_MS = 5000;
const SPARKLE_COUNT = 60;

interface Sparkle {
  left: number;
  top: number;
  size: number;
  delay: number;
  duration: number;
}

function makeSparkles(): Sparkle[] {
  return Array.from({ length: SPARKLE_COUNT }, () => ({
    left: 3 + Math.random() * 94,
    top: 5 + Math.random() * 90,
    size: 12 + Math.random() * 28,
    delay: Math.random() * 1.2,
    duration: 0.7 + Math.random() * 0.6,
  }));
}

const CONFETTI_COUNT = 70;
const CONFETTI_COLORS = ['#fbbf24', '#f87171', '#34d399', '#60a5fa', '#f472b6', '#a78bfa', '#ffffff'];

interface Confetti {
  left: number;
  width: number;
  height: number;
  color: string;
  delay: number;
  duration: number;
  drift: number;
}

/** Paper strips that fall from above the viewport to below it, drifting sideways as they spin. */
function makeConfetti(): Confetti[] {
  return Array.from({ length: CONFETTI_COUNT }, () => ({
    left: Math.random() * 100,
    width: 6 + Math.random() * 8,
    height: 10 + Math.random() * 14,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    delay: Math.random() * 1.1,
    duration: 1.4 + Math.random() * 1.0,
    drift: -60 + Math.random() * 120,
  }));
}

/** How long gold stars keep falling over the cards after the result is shown. */
const STAR_SHOWER_MS = 3500;
const FALLING_STAR_COUNT = 30;

interface FallingStar {
  left: number;
  size: number;
  delay: number;
  duration: number;
  drift: number;
}

function makeFallingStars(): FallingStar[] {
  return Array.from({ length: FALLING_STAR_COUNT }, () => ({
    left: Math.random() * 100,
    size: 10 + Math.random() * 16,
    delay: Math.random() * 1.5,
    duration: 1.6 + Math.random() * 1.2,
    drift: -40 + Math.random() * 80,
  }));
}

const FIREWORK_COUNT = 18;
const SPARKS_PER_FIREWORK = 24;

interface Firework {
  /** Launch column, percent of the viewport width. */
  left: number;
  /** Where the rocket bursts, in vh from the top of the viewport. */
  burstTop: number;
  /** Seconds before launch. */
  delay: number;
  /** Seconds the rocket takes to climb. */
  rise: number;
  color: string;
  /** Distance each spark flies out from the burst, in px. */
  sparks: { angle: number; radius: number }[];
}

/** Rockets launched from the bottom edge that burst into a ring of sparks, staggered across the reveal. */
function makeFireworks(): Firework[] {
  return Array.from({ length: FIREWORK_COUNT }, (_, i) => ({
    left: 12 + Math.random() * 76,
    burstTop: 15 + Math.random() * 35,
    delay: i * 0.25 + Math.random() * 0.2,
    rise: 0.7 + Math.random() * 0.3,
    color: CONFETTI_COLORS[Math.floor(Math.random() * (CONFETTI_COLORS.length - 1))],
    sparks: Array.from({ length: SPARKS_PER_FIREWORK }, (_, k) => ({
      angle: (360 / SPARKS_PER_FIREWORK) * k + Math.random() * 10,
      radius: 70 + Math.random() * 70,
    })),
  }));
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Plays a short sparkle animation when mounted, then fades its children in. Mount it fresh
 * (e.g. with a `key`) each time the Final should be revealed again.
 */
export function FinalReveal({ children }: { children: ReactNode }) {
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const [revealed, setRevealed] = useState(reduced);
  // Stars keep falling over the cards for a moment after they appear, then are removed.
  const [starsFalling, setStarsFalling] = useState(!reduced);
  const sparkles = useMemo(() => makeSparkles(), []);
  const confetti = useMemo(() => makeConfetti(), []);
  const fallingStars = useMemo(() => makeFallingStars(), []);
  const fireworks = useMemo(() => makeFireworks(), []);

  useEffect(() => {
    if (revealed) return;
    const timer = window.setTimeout(() => setRevealed(true), REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [revealed]);

  useEffect(() => {
    if (!revealed || !starsFalling) return;
    const timer = window.setTimeout(() => setStarsFalling(false), STAR_SHOWER_MS);
    return () => window.clearTimeout(timer);
  }, [revealed, starsFalling]);

  if (revealed) {
    return (
      <div className="final-reveal-content relative">
        {children}
        {starsFalling && (
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            {fallingStars.map((s, i) => (
              <span
                key={i}
                className="final-star-fall"
                style={{
                  left: `${s.left}%`,
                  width: s.size,
                  height: s.size,
                  animationDelay: `${s.delay}s`,
                  animationDuration: `${s.duration}s`,
                  ['--drift' as string]: `${s.drift}px`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Full-screen overlay above the header and content; a portal keeps it out of any
  // transformed/overflow-hidden ancestors so `fixed` really means the viewport.
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      aria-label="Revealing the final result"
      className="final-reveal fixed inset-0 z-2000 flex items-center justify-center overflow-hidden"
      style={{ background: colors.navy, color: '#fff' }}
    >
      {fireworks.map((f, i) => (
        <div
          key={`f${i}`}
          aria-hidden
          className="final-firework"
          style={{
            left: `${f.left}%`,
            ['--burst-top' as string]: `${f.burstTop}vh`,
            ['--fw-delay' as string]: `${f.delay}s`,
            ['--fw-rise' as string]: `${f.rise}s`,
            ['--fw-color' as string]: f.color,
          }}
        >
          <span className="final-rocket" />
          <span className="final-burst">
            <span className="final-flash" />
            {f.sparks.map((s, k) => (
              <span
                key={k}
                className="final-spark"
                style={{ ['--angle' as string]: `${s.angle}deg`, ['--radius' as string]: `${s.radius}px` }}
              />
            ))}
          </span>
        </div>
      ))}
      {confetti.map((c, i) => (
        <span
          key={`c${i}`}
          aria-hidden
          className="final-confetti"
          style={{
            left: `${c.left}%`,
            width: c.width,
            height: c.height,
            background: c.color,
            animationDelay: `${c.delay}s`,
            animationDuration: `${c.duration}s`,
            ['--drift' as string]: `${c.drift}px`,
          }}
        />
      ))}
      {sparkles.map((s, i) => (
        <span
          key={`s${i}`}
          aria-hidden
          className="final-sparkle"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
          }}
        />
      ))}
      <div className="final-reveal-badge relative flex flex-col items-center gap-2 px-6 text-center">
        <EmojiEventsIcon sx={{ color: '#fbbf24', fontSize: 96 }} aria-hidden />
        <Typography sx={{ fontWeight: 800, fontSize: { xs: '1.75rem', md: '2.5rem' }, letterSpacing: '0.04em' }}>
          And the champion is…
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.75)', fontSize: '1.125rem' }}>4IBC 2026 Final</Typography>
      </div>
    </div>,
    document.body,
  );
}
