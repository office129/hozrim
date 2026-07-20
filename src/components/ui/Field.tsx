import { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

const fieldClass =
  "w-full rounded-xl border border-border-strong bg-white px-3.5 py-3 text-sm text-ink outline-none focus:border-brand transition";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input className={`${fieldClass} ${className}`} {...rest} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return <textarea className={`${fieldClass} resize-y ${className}`} {...rest} />;
}

export function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-[13px] text-muted">{children}</div>;
}
