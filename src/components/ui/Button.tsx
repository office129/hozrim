import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "outline" | "ghost" | "danger-ghost";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-brand text-on-brand hover:bg-brand-dark disabled:opacity-50",
  outline: "border border-brand text-brand bg-transparent hover:bg-brand-soft-2 disabled:opacity-50",
  ghost: "text-brand hover:underline bg-transparent",
  "danger-ghost": "text-danger hover:underline bg-transparent",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base =
    variant === "ghost" || variant === "danger-ghost"
      ? "text-sm font-medium cursor-pointer disabled:cursor-not-allowed transition"
      : "rounded-xl px-5 py-3.5 text-sm font-semibold cursor-pointer disabled:cursor-not-allowed transition";
  return <button className={`${base} ${VARIANT_CLASSES[variant]} ${className}`} {...props} />;
}
