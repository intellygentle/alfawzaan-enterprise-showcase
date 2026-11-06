"use client";

/**
 * AmbientMesh — a subtle animated gradient mesh background.
 * Renders as a fixed-position layer behind content.
 * Uses CSS animation (no JS overhead).
 */
export default function AmbientMesh() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {/* Animated mesh gradient */}
      <div className="absolute inset-0 animate-mesh" />

      {/* Soft radial glows */}
      <div
        className="absolute w-[800px] h-[800px] rounded-full opacity-[0.04]"
        style={{
          background: "radial-gradient(circle, #D4AF37 0%, transparent 70%)",
          top: "10%",
          left: "-10%",
        }}
      />
      <div
        className="absolute w-[600px] h-[600px] rounded-full opacity-[0.03]"
        style={{
          background: "radial-gradient(circle, #D4AF37 0%, transparent 70%)",
          top: "50%",
          right: "-5%",
        }}
      />
      <div
        className="absolute w-[500px] h-[500px] rounded-full opacity-[0.04]"
        style={{
          background: "radial-gradient(circle, #F5E6AD 0%, transparent 70%)",
          bottom: "5%",
          left: "30%",
        }}
      />
    </div>
  );
}
