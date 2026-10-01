"use client";

import type { ShellData } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Dumbbell,
  Flame,
  GraduationCap,
  LayoutDashboard,
  Layers,
  ListTodo,
  Menu,
  NotebookText,
  Settings,
  ShieldAlert,
  Sigma,
  Snowflake,
  Sparkles,
  UtensilsCrossed,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const SECTIONS: { label: string; items: { href: string; label: string; icon: ReactNode }[] }[] = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Home", icon: <LayoutDashboard /> },
      { href: "/planner", label: "Planner", icon: <CalendarDays /> },
      { href: "/analytics", label: "Analytics", icon: <BarChart3 /> },
    ],
  },
  {
    label: "Academics",
    items: [
      { href: "/backlog", label: "Backlog", icon: <Layers /> },
      { href: "/study", label: "Study", icon: <BookOpen /> },
      { href: "/tutor", label: "Tutor", icon: <Sparkles /> },
      { href: "/notes", label: "Notes", icon: <NotebookText /> },
      { href: "/mistakes", label: "Mistake Book", icon: <ShieldAlert /> },
      { href: "/formulas", label: "Formulas", icon: <Sigma /> },
      { href: "/tasks", label: "Tasks", icon: <ListTodo /> },
      { href: "/exams", label: "Exams", icon: <GraduationCap /> },
    ],
  },
  {
    label: "Body",
    items: [
      { href: "/fitness", label: "Fitness", icon: <Dumbbell /> },
      { href: "/nutrition", label: "Nutrition", icon: <UtensilsCrossed /> },
    ],
  },
  {
    label: "Season",
    items: [{ href: "/winter-arc", label: "Winter Arc", icon: <Snowflake /> }],
  },
];

function SidebarContent({ data, onNavigate }: { data: ShellData; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { level, streak, arc } = data;

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-line shrink-0">
        <div className="flex size-8 items-center justify-center rounded-lg bg-accent">
          <BookOpen className="size-4 text-white" />
        </div>
        <div className="leading-tight">
          <p className="font-display text-[15px] font-bold tracking-tight">Study OS</p>
          <p className="text-[10px] uppercase tracking-[0.14em] text-dim">Personal edition</p>
        </div>
      </div>

      {/* Arc chip */}
      <Link href="/winter-arc" onClick={onNavigate} className="mx-3 mt-4 block shrink-0">
        <div className="rounded-xl bg-panel2 p-3 transition-colors hover:bg-line/40">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-mute">
              <Snowflake className="size-3.5 text-ice" />
              Winter Arc
            </span>
            {arc.status === "pre" ? (
              <span className="text-[11px] font-medium text-ice">T-{arc.daysUntilStart}d</span>
            ) : (
              <span className="text-[11px] font-medium text-ice">
                Day {arc.dayNumber}/{arc.totalDays}
              </span>
            )}
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-line/60">
            <div className="h-full rounded-full bg-ice transition-all duration-700" style={{ width: `${arc.pctElapsed}%` }} />
          </div>
        </div>
      </Link>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-dim">{section.label}</p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors [&_svg]:size-4",
                      active
                        ? "bg-accent-soft text-fog"
                        : "text-mute hover:bg-panel2 hover:text-fog"
                    )}
                  >
                    <span className={active ? "text-accent" : "text-dim group-hover:text-mute"}>{item.icon}</span>
                    {item.label}
                    {active && <span className="ml-auto size-1.5 rounded-full bg-accent" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Level footer */}
      <div className="shrink-0 border-t border-line p-3 space-y-2.5">
        <Link
          href="/settings"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13.5px] font-medium transition-colors [&_svg]:size-4",
            pathname === "/settings" ? "bg-accent-soft text-fog" : "text-mute hover:bg-panel2 hover:text-fog"
          )}
        >
          <Settings className="text-dim" />
          Settings
        </Link>
        <div className="rounded-xl bg-panel2 p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold">
              <Zap className="size-3.5 text-warning" />
              Lv {level.level} · {level.title}
            </span>
            <span className="flex items-center gap-1 text-xs font-semibold text-orange-400">
              <Flame className="size-3.5" />
              {streak}d
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-line/60">
            <div className="h-full rounded-full bg-warning transition-all duration-700" style={{ width: `${level.pct}%` }} />
          </div>
          <p className="mt-1.5 text-[10px] text-dim">
            {level.intoLevel}/{level.needForNext} XP to level {level.level + 1}
          </p>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ data, children }: { data: ShellData; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [prevPathname, setPrevPathname] = useState(pathname);

  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-line bg-panel lg:block">
        <SidebarContent data={data} />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-ink/90 backdrop-blur px-4 lg:hidden">
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 text-mute hover:bg-panel2 hover:text-fog transition-colors cursor-pointer"
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-accent">
            <BookOpen className="size-3.5 text-white" />
          </div>
          <p className="font-display text-sm font-bold">Study OS</p>
        </div>
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-line bg-panel px-2.5 py-1 text-xs font-semibold text-orange-400">
          <Flame className="size-3.5" />
          {data.streak}
        </div>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-[#060b14]/80 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="anim-pop absolute inset-y-0 left-0 w-72 border-r border-line bg-panel">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-mute hover:bg-panel2 hover:text-fog cursor-pointer"
              aria-label="Close menu"
            >
              <X className="size-4" />
            </button>
            <SidebarContent data={data} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      {/* Content */}
      <main className="lg:pl-60">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">{children}</div>
      </main>
    </div>
  );
}
