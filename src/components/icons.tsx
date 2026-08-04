// Small CSS-shape icons matching the original design's hand-built look
// (border-trick triangles, bar waveforms) instead of an icon font/SVG set.

export function PlayTriangle({ size = 11, color = "var(--color-brand)" }: { size?: number; color?: string }) {
  return (
    <div
      style={{
        width: 0,
        height: 0,
        borderTop: `${size}px solid transparent`,
        borderBottom: `${size}px solid transparent`,
        borderRight: `${Math.round(size * 1.55)}px solid ${color}`,
        marginRight: -3,
      }}
    />
  );
}

export function PauseBars({ color = "var(--color-brand-dark)" }: { color?: string }) {
  return (
    <div className="flex gap-[5px]">
      <div className="w-[5px] h-5 rounded-sm" style={{ background: color }} />
      <div className="w-[5px] h-5 rounded-sm" style={{ background: color }} />
    </div>
  );
}

export function Waveform({ color = "var(--color-brand)" }: { color?: string }) {
  return (
    <div className="flex items-end gap-[3px] h-[14px] shrink-0">
      <div className="w-[3px] h-[7px] rounded-sm" style={{ background: color }} />
      <div className="w-[3px] h-[14px] rounded-sm" style={{ background: color }} />
      <div className="w-[3px] h-[10px] rounded-sm" style={{ background: color }} />
    </div>
  );
}

export function DocIcon({ color = "var(--color-brand)" }: { color?: string }) {
  return <div className="w-4 h-5 rounded-[3px] shrink-0" style={{ border: `2px solid ${color}` }} />;
}

export function ChevronDown({ open }: { open: boolean }) {
  return (
    <div
      className="text-muted text-base shrink-0 transition-transform"
      style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
    >
      ⌄
    </div>
  );
}

export function FolderIcon({ color = "var(--color-brand)" }: { color?: string }) {
  return (
    <div className="relative w-[18px] h-[15px] shrink-0">
      <div className="absolute top-0 right-0 w-2.5 h-1.5 rounded-t-[2px]" style={{ background: color }} />
      <div className="absolute bottom-0 w-full h-3 rounded-[3px]" style={{ background: color }} />
    </div>
  );
}

export function DragHandle() {
  return (
    <div className="cursor-grab flex flex-col gap-[3px] shrink-0 p-1">
      <div className="w-3.5 h-0.5 rounded-full bg-border-strong" />
      <div className="w-3.5 h-0.5 rounded-full bg-border-strong" />
      <div className="w-3.5 h-0.5 rounded-full bg-border-strong" />
    </div>
  );
}

export function InitialBadge({ label, size = 42 }: { label: string; size?: number }) {
  return (
    <div
      className="rounded-full bg-brand text-on-brand flex items-center justify-center font-bold shrink-0"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {label}
    </div>
  );
}
