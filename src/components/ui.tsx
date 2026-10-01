"use client";

import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { ChevronDown, Inbox, Loader2, Trash2 } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

/* --------------------------------- Button --------------------------------- */

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 ring-accent disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-white hover:brightness-110 active:brightness-95",
        secondary: "bg-panel2 text-fog border border-line hover:border-line2 hover:bg-[#1a2942]",
        ghost: "text-mute hover:text-fog hover:bg-panel2",
        outline: "border border-line text-fog hover:border-line2 hover:bg-panel2",
        destructive: "bg-[#3a1d24] text-red-300 border border-[#58303a] hover:bg-[#47242d]",
        subtle: "bg-accent-soft text-accent hover:brightness-125",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-4",
        lg: "h-11 px-5 text-[15px]",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export function Button({ className, variant, size, loading, children, disabled, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="animate-spin" />}
      {children}
    </button>
  );
}

/* ---------------------------------- Card ---------------------------------- */

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl bg-panel", className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  icon,
  action,
  sub,
  className,
}: {
  title: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  sub?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-5 pt-4 pb-1", className)}>
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && <span className="text-mute [&_svg]:size-4">{icon}</span>}
        <div className="min-w-0">
          <h3 className="font-display text-[13px] font-semibold tracking-wide text-fog uppercase">{title}</h3>
          {sub && <p className="text-xs text-mute mt-0.5 normal-case tracking-normal font-sans">{sub}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/* ---------------------------------- Badge ---------------------------------- */

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium border",
  {
    variants: {
      variant: {
        default: "bg-panel2 text-mute border-line",
        accent: "bg-accent-soft text-accent border-transparent",
        green: "bg-success/10 text-success border-success/20",
        red: "bg-danger/10 text-danger border-danger/20",
        amber: "bg-warning/10 text-warning border-warning/20",
        ice: "bg-[#90caf9]/15 text-[#90caf9] border-[#90caf9]/30",
        violet: "bg-accent/10 text-accent border-accent/20",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export function Badge({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/* ---------------------------------- Forms ---------------------------------- */

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-9 w-full rounded-lg border border-line bg-ink px-3 text-sm text-fog placeholder:text-dim focus-visible:outline-none focus-visible:ring-2 ring-accent disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "flex min-h-[72px] w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm text-fog placeholder:text-dim focus-visible:outline-none focus-visible:ring-2 ring-accent disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cn("relative", className)}>
      <select
        className="h-9 w-full appearance-none rounded-lg border border-line bg-ink pl-3 pr-8 text-sm text-fog focus-visible:outline-none focus-visible:ring-2 ring-accent cursor-pointer disabled:opacity-50"
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-mute" />
    </div>
  );
}

export function Field({ label, children, className, hint }: { label: string; children: ReactNode; className?: string; hint?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="block text-xs font-medium text-mute uppercase tracking-wide">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-dim">{hint}</p>}
    </div>
  );
}

/* --------------------------------- Progress -------------------------------- */

export function Progress({
  value,
  className,
  barClassName,
  color,
}: {
  value: number; // 0-100
  className?: string;
  barClassName?: string;
  color?: string;
}) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-line/60", className)}>
      <div
        className={cn("h-full rounded-full bg-accent transition-[width] duration-500", barClassName)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }}
      />
    </div>
  );
}

export function Ring({ value, size = 120, stroke = 9, color, children, track = "#1b2941" }: {
  value: number; size?: number; stroke?: number; color?: string; children?: ReactNode; track?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color ?? "var(--accent)"} strokeWidth={stroke} fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
          style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

/* --------------------------------- States ---------------------------------- */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-5 animate-spin text-mute", className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("rounded-lg bg-panel2", className)}
      style={{
        backgroundImage: "linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.6s linear infinite",
      }}
    />
  );
}

export function EmptyState({
  icon,
  title,
  desc,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  desc?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line px-6 py-10 text-center", className)}>
      <span className="text-dim [&_svg]:size-6">{icon ?? <Inbox />}</span>
      <p className="text-sm font-medium text-mute">{title}</p>
      {desc && <p className="max-w-xs text-xs text-dim">{desc}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ---------------------------------- Tabs ----------------------------------- */

const TabsCtx = createContext<{ value: string; set: (v: string) => void }>({ value: "", set: () => {} });

export function Tabs({ defaultValue, children, className, value, onValueChange }: {
  defaultValue?: string; children: ReactNode; className?: string;
  value?: string; onValueChange?: (v: string) => void;
}) {
  const [internal, setInternal] = useState(defaultValue ?? "");
  const val = value ?? internal;
  const set = (v: string) => { setInternal(v); onValueChange?.(v); };
  return (
    <TabsCtx.Provider value={{ value: val, set }}>
      <div className={className}>{children}</div>
    </TabsCtx.Provider>
  );
}

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("inline-flex items-center gap-1 rounded-lg border border-line bg-ink p-1", className)}>
      {children}
    </div>
  );
}

export function TabsTrigger({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  const { value: val, set } = useContext(TabsCtx);
  const active = val === value;
  return (
    <button
      onClick={() => set(value)}
      className={cn(
        "rounded-md px-3.5 h-8 text-[13px] font-medium transition-colors cursor-pointer",
        active ? "bg-panel2 text-fog shadow-sm" : "text-mute hover:text-fog",
        className
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  const { value: val } = useContext(TabsCtx);
  if (val !== value) return null;
  return <div className={cn("anim-fade-up", className)}>{children}</div>;
}

/* ---------------------------------- Stat ----------------------------------- */

export function Stat({
  label, value, sub, icon, className, tone,
}: {
  label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; className?: string; tone?: string;
}) {
  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-mute">{label}</p>
        {icon && <span className="[&_svg]:size-4" style={{ color: tone ?? "var(--accent)" }}>{icon}</span>}
      </div>
      <p className="font-display mt-1.5 text-2xl font-bold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-mute">{sub}</p>}
    </Card>
  );
}

/* ---------------------------- Confirm delete ------------------------------- */

export function ConfirmDelete({ onConfirm, className }: { onConfirm: () => void; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
      className={cn(
        "flex items-center justify-center rounded-md p-1.5 transition-colors cursor-pointer",
        armed ? "bg-red-500/15 text-red-400" : "text-dim hover:bg-panel2 hover:text-red-400",
        className
      )}
      title="Delete"
    >
      {armed ? <span className="whitespace-nowrap px-1 text-[10px] font-semibold">Sure?</span> : <Trash2 className="size-3.5" />}
    </button>
  );
}

/* ------------------------------- Page header ------------------------------- */

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-mute">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
