export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`bg-card border border-border rounded-2xl ${className}`}>{children}</div>
  );
}
