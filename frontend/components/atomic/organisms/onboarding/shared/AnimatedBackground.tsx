"use client";

import { useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
}

interface AnimatedBackgroundProps {
  particleCount?: number;
  showGradient?: boolean;
}

function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1,
    duration: Math.random() * 20 + 15,
    delay: Math.random() * 5,
    opacity: Math.random() * 0.3 + 0.1,
  }));
}

const subscribeNoop = () => () => {};

/**
 * Random particles are client-only: the server snapshot is `false`, so SSR and
 * hydration render no particles (no Math.random mismatch), as the old
 * mount effect did.
 */
function useIsClient() {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

export function AnimatedBackground({
  particleCount = 30,
  showGradient = true,
}: AnimatedBackgroundProps) {
  const isClient = useIsClient();

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      {/* Base gradient */}
      {showGradient && (
        <div className="absolute inset-0 bg-gradient-to-br from-[#050505] via-[#0a0a0f] to-[#050510]" />
      )}

      {/* Radial glow - gold accent */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#D4AF37]/5 rounded-full blur-[120px] translate-x-1/3 -translate-y-1/3" />

      {/* Radial glow - blue accent */}
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-[#3B82F6]/5 rounded-full blur-[100px] -translate-x-1/3 translate-y-1/3" />

      {/* Floating particles (keyed so a new count regenerates them) */}
      {isClient && (
        <FloatingParticles key={particleCount} count={particleCount} />
      )}

      {/* Subtle grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />
    </div>
  );
}

function FloatingParticles({ count }: { count: number }) {
  const [particles] = useState(() => generateParticles(count));

  return (
    <>
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full bg-white/20"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            width: particle.size,
            height: particle.size,
            opacity: particle.opacity,
          }}
          animate={{
            y: [0, -30, 0],
            opacity: [
              particle.opacity,
              particle.opacity * 1.5,
              particle.opacity,
            ],
          }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </>
  );
}
