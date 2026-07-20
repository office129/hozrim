import { InputHTMLAttributes, TextareaHTMLAttributes, useState } from "react";

const fieldClass =
  "w-full rounded-xl border border-border-strong bg-white px-3.5 py-3 text-sm text-ink outline-none focus:border-brand transition";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input className={`${fieldClass} ${className}`} {...rest} />;
}

const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61C3.35 8.36 1 11.5 1 12s4 7 11 7a9.9 9.9 0 0 0 5.39-1.61M1 1l22 22" />
    <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" />
  </svg>
);

export function PasswordInput(
  props: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> & {
    /** Full class string for the input itself; defaults to the shared field style. */
    inputClassName?: string;
    /** Class for the wrapping <div> (e.g. to control width). */
    wrapperClassName?: string;
  }
) {
  const { inputClassName, wrapperClassName = "", ...rest } = props;
  const [visible, setVisible] = useState(false);
  return (
    <div className={`relative ${wrapperClassName}`}>
      <input
        type={visible ? "text" : "password"}
        className={`${inputClassName ?? fieldClass} pl-10`}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink cursor-pointer"
        aria-label={visible ? "הסתרת סיסמה" : "הצגת סיסמה"}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return <textarea className={`${fieldClass} resize-y ${className}`} {...rest} />;
}

export function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-[13px] text-muted">{children}</div>;
}
