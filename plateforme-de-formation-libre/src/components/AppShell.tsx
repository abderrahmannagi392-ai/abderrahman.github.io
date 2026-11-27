import React, { useEffect, useRef, useState } from 'react';
import { ChevronsUpDown, LogOut, Menu, Moon, Sun } from 'lucide-react';
import type { AppView } from '../context/AppContext';
import type { Language } from '../types';
import { tr } from '../utils/locale';

// Desktop "logged-in" shell, in the style of a chat app:
//  - a persistent sidebar on the start side (right in Arabic, left in French/English) with the tools;
//  - the account button at the bottom of the sidebar opens a menu with the account
//    pages, the theme, the language and sign-out.
// The public website (before login) keeps its own top-bar layout.

export interface ShellItem {
  id: AppView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

export interface AppShellProps {
  lang: Language;
  currentView: AppView;
  tools: ShellItem[];
  accountItems: ShellItem[];
  userName: string;
  userSubtitle?: string;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onSetLang: (lang: Language) => void;
  onNavigate: (view: AppView) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

const initialsOf = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const second = parts.length > 1 ? parts[1]?.[0] ?? '' : '';
  return (first + second).toUpperCase();
};

export const AppShell: React.FC<AppShellProps> = ({
  lang,
  currentView,
  tools,
  accountItems,
  userName,
  userSubtitle,
  theme,
  onToggleTheme,
  onSetLang,
  onNavigate,
  onLogout,
  children,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);

  const brand = tr(lang, 'منصة التدريب الحر', 'Plateforme de Formation Libre', 'Free Training Platform');

  // Close the account menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const go = (view: AppView) => {
    setMenuOpen(false);
    setDrawerOpen(false);
    onNavigate(view);
  };

  const languages: Array<{ id: Language; label: string }> = [
    { id: 'ar', label: 'العربية' },
    { id: 'fr', label: 'Français' },
    { id: 'en', label: 'English' },
  ];

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
      {/* Backdrop for the narrow-screen drawer */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        ref={sidebarRef}
        className={`fixed inset-y-0 start-0 z-40 flex w-[264px] flex-col border-e transition-transform duration-200 ${
          drawerOpen ? 'translate-x-0' : 'max-lg:rtl:translate-x-full max-lg:ltr:-translate-x-full'
        }`}
        style={{ background: 'var(--surface-muted)', borderColor: 'var(--line)' }}
        aria-label={brand}
      >
        <div className="flex items-center gap-2.5 px-4 py-4">
          <button
            type="button"
            onClick={() => go('home')}
            className="flex items-center gap-2.5 cursor-pointer text-start"
          >
            <img
              src="/assets/images/platform-logo.webp"
              alt=""
              className="h-8 w-auto max-w-[120px] object-contain"
            />
            <span className="text-sm font-extrabold leading-tight">{brand}</span>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          {tools.map((item) => {
            const active = currentView === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors ${
                  active ? 'font-bold' : 'font-semibold hover:bg-black/5'
                }`}
                style={active ? { background: 'var(--card)', color: 'var(--ink)' } : undefined}
              >
                <Icon className="w-4 h-4 shrink-0 opacity-80" />
                <span className="flex-1 truncate text-start">{item.label}</span>
                {item.badge && (
                  <span className="min-w-[20px] rounded-full bg-[#A6CE39] px-1.5 text-center text-[11px] font-extrabold text-[#384D55]">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="relative border-t p-2" style={{ borderColor: 'var(--line)' }}>
          {menuOpen && (
            <div
              role="menu"
              className="absolute bottom-full start-2 end-2 mb-2 overflow-hidden rounded-xl border py-1 shadow-xl"
              style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
            >
              <div className="border-b px-3 py-2.5" style={{ borderColor: 'var(--line)' }}>
                <p className="truncate text-sm font-bold">{userName}</p>
                {userSubtitle && <p className="truncate text-xs opacity-70">{userSubtitle}</p>}
              </div>

              {accountItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    onClick={() => go(item.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-semibold cursor-pointer hover:bg-black/5"
                  >
                    <Icon className="w-4 h-4 shrink-0 opacity-80" />
                    <span className="flex-1 truncate text-start">{item.label}</span>
                  </button>
                );
              })}

              <button
                type="button"
                role="menuitem"
                onClick={onToggleTheme}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-semibold cursor-pointer hover:bg-black/5"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                <span className="flex-1 text-start">
                  {theme === 'dark'
                    ? tr(lang, 'الوضع الفاتح', 'Mode clair', 'Light mode')
                    : tr(lang, 'الوضع الداكن', 'Mode sombre', 'Dark mode')}
                </span>
              </button>

              <div className="border-t px-3 py-2" style={{ borderColor: 'var(--line)' }}>
                <p className="mb-1.5 text-xs font-bold opacity-70">
                  {tr(lang, 'اللغة', 'Langue', 'Language')}
                </p>
                <div className="grid grid-cols-3 gap-1">
                  {languages.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onSetLang(option.id)}
                      aria-pressed={lang === option.id}
                      className={`rounded-md border px-1 py-1 text-xs font-bold cursor-pointer ${
                        lang === option.id ? 'bg-[#A6CE39] text-[#384D55] border-[#A6CE39]' : ''
                      }`}
                      style={lang === option.id ? undefined : { borderColor: 'var(--line)' }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onLogout();
                }}
                className="w-full flex items-center gap-2.5 border-t px-3 py-2 text-sm font-bold text-red-700 cursor-pointer hover:bg-red-50"
                style={{ borderColor: 'var(--line)' }}
              >
                <LogOut className="w-4 h-4" />
                <span className="flex-1 text-start">{tr(lang, 'تسجيل الخروج', 'Se déconnecter', 'Log out')}</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="w-full flex items-center gap-3 rounded-lg px-2 py-2 cursor-pointer hover:bg-black/5"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#A6CE39] text-sm font-extrabold text-[#384D55]">
              {initialsOf(userName)}
            </span>
            <span className="min-w-0 flex-1 text-start">
              <span className="block truncate text-sm font-bold">{userName}</span>
              {userSubtitle && <span className="block truncate text-xs opacity-70">{userSubtitle}</span>}
            </span>
            <ChevronsUpDown className="w-4 h-4 shrink-0 opacity-60" />
          </button>
        </div>
      </aside>

      <div className="ps-0 lg:ps-[264px]">
        <header
          className="sticky top-0 z-20 flex items-center gap-3 border-b px-4 py-3 lg:hidden"
          style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
        >
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={tr(lang, 'فتح القائمة', 'Ouvrir le menu', 'Open menu')}
            className="grid h-9 w-9 place-items-center rounded-md cursor-pointer hover:bg-black/5"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-extrabold">{brand}</span>
        </header>

        <main className="min-h-dvh">{children}</main>
      </div>
    </div>
  );
};
