import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

const palette = {
  ink: "#0f1720",
  emerald: "#0f8f78",
  emeraldStrong: "#0c6f5d",
  amber: "#f59e0b",
  ivory: "#f4efe5",
  white: "#ffffff",
};

const scenes = [
  {
    eyebrow: "The problem",
    title: "Hiring is full of noise.",
    body: "Too many signals are weak. Too many strong candidates still disappear into clutter.",
    align: "left" as const,
  },
  {
    eyebrow: "The shift",
    title: "Trust should be visible.",
    body: "AfriTalent turns credibility, readiness, and workflow into part of the hiring surface.",
    align: "right" as const,
  },
  {
    eyebrow: "The edge",
    title: "Smaller shortlist. Stronger trust.",
    body: "A product direction built for cleaner Africa-to-global matching, not generic board noise.",
    align: "left" as const,
  },
  {
    eyebrow: "The close",
    title: "AfriTalent",
    body: "Trust-first Africa-to-global hiring.",
    align: "center" as const,
  },
];

const sceneLength = 300;

const SceneCard: React.FC<{
  title: string;
  eyebrow: string;
  body: string;
  progress: number;
  align: "left" | "right" | "center";
}> = ({ title, eyebrow, body, progress, align }) => {
  const opacity = interpolate(progress, [0, 0.18, 0.82, 1], [0, 1, 1, 0], {
    easing: Easing.bezier(0.2, 0.9, 0.2, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const translateY = interpolate(progress, [0, 1], [44, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const translateX = align === "right" ? 180 : align === "center" ? 0 : -180;

  return (
    <div
      style={{
        width: 920,
        borderRadius: 48,
        padding: "52px 56px",
        background: "rgba(255,255,255,0.12)",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 30px 100px rgba(15, 23, 32, 0.25)",
        backdropFilter: "blur(22px)",
        color: palette.white,
        opacity,
        transform: `translate(${translateX}px, ${translateY}px)`,
      }}
    >
      <div style={{ fontSize: 22, textTransform: "uppercase", letterSpacing: "0.36em", opacity: 0.68, marginBottom: 28 }}>
        {eyebrow}
      </div>
      <div style={{ fontSize: 92, lineHeight: 0.95, fontWeight: 700, letterSpacing: "-0.05em", marginBottom: 26 }}>
        {title}
      </div>
      <div style={{ fontSize: 34, lineHeight: 1.45, opacity: 0.84 }}>{body}</div>
    </div>
  );
};

export const AfriTalentLaunch: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const glow = spring({
    fps,
    frame,
    config: {
      damping: 20,
      stiffness: 90,
      mass: 0.9,
    },
  });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at top left, rgba(52,211,178,0.22), transparent 28%), radial-gradient(circle at 80% 20%, rgba(245,158,11,0.25), transparent 20%), linear-gradient(135deg, ${palette.ink}, #0b4d54 42%, #117b6b 72%, #d78d17 120%)`,
        color: palette.white,
        fontFamily: "Inter, ui-sans-serif, system-ui",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          opacity: 0.34,
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: "-10%",
          background: `radial-gradient(circle, rgba(255,255,255,${0.05 + glow * 0.08}), transparent 50%)`,
          filter: "blur(40px)",
        }}
      />

      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 80,
        }}
      >
        {scenes.map((scene, index) => {
          const start = index * sceneLength;
          const localFrame = frame - start;
          const progress = interpolate(localFrame, [0, 45, 230, sceneLength], [0, 0.2, 0.88, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          const justifyContent =
            scene.align === "right" ? "flex-end" : scene.align === "center" ? "center" : "flex-start";

          return (
            <div
              key={scene.title}
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent,
                padding: "0 110px",
              }}
            >
              <SceneCard {...scene} progress={progress} />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
