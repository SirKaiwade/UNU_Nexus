import {
  Plus,
  MessageSquare,
  Library,
  BookUser,
  CalendarDays,
  BookOpen,
  Trash2,
  LogOut,
  X,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import BrandMark from './BrandMark';
import type { Conversation } from '../types/chat';
import { formatRelative, classNames } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { version as appVersion } from '../../package.json';

const NAV_ITEMS = [
  { to: '/', label: 'Chat', icon: MessageSquare, end: true as const },
  { to: '/library', label: 'Knowledge library', icon: Library },
  { to: '/directory', label: 'Directory', icon: BookUser },
  { to: '/events', label: 'Events', icon: CalendarDays },
  { to: '/publications', label: 'Publications', icon: BookOpen },
];

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onNew: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  /** Desktop: icon-rail collapsed for more main-content width. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** Mobile-only: drawer visibility (sidebar is always visible at md+). */
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export default function ConversationsSidebar({
  conversations,
  activeId,
  onNew,
  onOpen,
  onDelete,
  collapsed = false,
  onToggleCollapsed,
  mobileOpen = false,
  onCloseMobile,
}: Props) {
  const sorted = [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [theme, toggleTheme] = useTheme();

  function handleNewChat() {
    onNew();
    navigate('/');
    onCloseMobile?.();
  }

  function handleOpenConversation(id: string) {
    onOpen(id);
    navigate('/');
    onCloseMobile?.();
  }

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    classNames('nav-link', isActive && 'active');

  const iconNavClass = ({ isActive }: { isActive: boolean }) =>
    classNames(
      'flex items-center justify-center w-10 h-10 rounded-md transition-colors border border-transparent',
      isActive
        ? 'bg-surface text-un-blue border-rule shadow-card'
        : 'text-gray-500 hover:text-ink hover:bg-surface/70'
    );

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="md:hidden fixed inset-0 z-40 bg-ink/35 backdrop-blur-[1px] fade-in"
          onClick={onCloseMobile}
        />
      )}
      <aside
        className={classNames(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-rule bg-surface-subtle shrink-0',
          'transform transition-[width,transform] duration-200 ease-out',
          'md:static md:z-auto md:translate-x-0 md:flex',
          collapsed
            ? 'md:w-[3.5rem] w-[18.5rem]'
            : 'w-[18.5rem] md:w-64 lg:w-[18.5rem]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Desktop collapsed: icon rail */}
        <div
          className={classNames(
            'hidden h-full flex-col',
            collapsed ? 'md:flex' : 'md:hidden'
          )}
        >
          <div className="flex flex-col items-center gap-1 py-3 border-b border-rule">
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="p-2 rounded-md text-gray-400 hover:text-ink hover:bg-surface"
            >
              <PanelLeftOpen className="w-4 h-4" strokeWidth={1.75} />
            </button>
            <img
              src="/un/emblem.svg"
              alt=""
              width={34}
              height={29}
              className="brand-emblem mt-1"
              draggable={false}
            />
          </div>

          <nav className="flex-1 flex flex-col items-center gap-1 py-3" aria-label="Primary">
            {user?.isAdmin && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  classNames(
                    'flex items-center justify-center w-10 h-10 rounded-md transition-colors border',
                    isActive
                      ? 'bg-un-blue-bg text-un-blue border-un-blue-soft shadow-card'
                      : 'bg-surface text-un-blue border-rule shadow-card hover:border-rule-strong'
                  )
                }
                title="Administrator Dashboard"
                aria-label="Administrator Dashboard"
              >
                <Shield className="w-4 h-4" strokeWidth={1.75} />
              </NavLink>
            )}
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={iconNavClass}
                  title={item.label}
                  aria-label={item.label}
                >
                  <Icon className="w-4 h-4" strokeWidth={1.75} />
                </NavLink>
              );
            })}
            <button
              type="button"
              onClick={handleNewChat}
              title="New chat"
              aria-label="New chat"
              className="mt-2 flex items-center justify-center w-10 h-10 rounded-md bg-un-blue text-white hover:bg-un-blue-dark"
            >
              <Plus className="w-4 h-4" strokeWidth={2} />
            </button>
          </nav>

          <div className="flex flex-col items-center gap-1 py-3 border-t border-rule">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="p-2 rounded-md text-gray-400 hover:text-ink hover:bg-surface"
            >
              {theme === 'dark' ? (
                <Sun className="w-3.5 h-3.5" strokeWidth={1.75} />
              ) : (
                <Moon className="w-3.5 h-3.5" strokeWidth={1.75} />
              )}
            </button>
            <div
              className="w-7 h-7 rounded-full bg-un-blue text-white text-[10px] font-semibold flex items-center justify-center tracking-wide"
              title={user?.name ?? 'Signed in'}
            >
              {user?.initials ?? 'UN'}
            </div>
          </div>
        </div>

        {/* Expanded (and always on mobile drawer) */}
        <div
          className={classNames(
            'flex flex-col h-full min-h-0',
            collapsed ? 'md:hidden' : 'flex'
          )}
        >
          <div className="px-4 py-4 border-b border-rule flex items-start justify-between gap-2">
            <BrandMark
              emblemSize={56}
              org="UNU Global Health"
              nameClassName="text-[20px] font-bold leading-none tracking-tight"
              orgClassName="text-[11px] tracking-[0.08em]"
            />
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={onToggleCollapsed}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="hidden md:inline-flex p-1.5 rounded-md text-gray-400 hover:text-ink hover:bg-surface"
              >
                <PanelLeftClose className="w-4 h-4" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Close menu"
                className="md:hidden p-1.5 -mr-1.5 rounded-md text-gray-400 hover:text-ink hover:bg-surface"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {user?.isAdmin && (
            <nav className="px-2.5 pt-3 pb-1 space-y-0.5" aria-label="Administrator Dashboard">
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  classNames('nav-link nav-link-admin', isActive && 'active')
                }
                onClick={onCloseMobile}
              >
                <Shield className="w-4 h-4 shrink-0 nav-icon" strokeWidth={1.75} />
                Administrator Dashboard
              </NavLink>
            </nav>
          )}

          <div className="px-3 pt-3 pb-1 text-overline uppercase font-semibold text-gray-500 tracking-[0.08em]">
            Workspace
          </div>
          <nav className="px-2.5 pb-2 space-y-0.5" aria-label="Primary">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={navLinkClass}
                  onClick={onCloseMobile}
                >
                  <Icon className="w-4 h-4 shrink-0 nav-icon" strokeWidth={1.75} />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          <div className="px-3 py-3 border-y border-rule bg-surface/60">
            <button type="button" onClick={handleNewChat} className="btn btn-primary w-full">
              <Plus className="w-4 h-4" />
              New chat
            </button>
          </div>

          <div className="px-3 pt-3 pb-1 text-overline uppercase font-semibold text-gray-500 tracking-[0.08em]">
            Recent
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-3">
            {sorted.length === 0 ? (
              <div className="text-[12px] text-gray-500 px-3 py-3 leading-relaxed">
                No conversations yet. Ask Nexus anything grounded in your sources.
              </div>
            ) : (
              <ul className="space-y-0.5">
                {sorted.map((c) => {
                  const active = c.id === activeId;
                  return (
                    <li key={c.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => handleOpenConversation(c.id)}
                        className={classNames(
                          'w-full text-left flex items-start gap-2 px-2.5 py-2 rounded-md transition-all duration-150 border border-transparent',
                          active
                            ? 'bg-surface text-ink border-rule shadow-card'
                            : 'hover:bg-surface/70 text-gray-700'
                        )}
                      >
                        <MessageSquare
                          className={classNames(
                            'w-3.5 h-3.5 mt-0.5 shrink-0',
                            active ? 'text-un-blue' : 'text-gray-400'
                          )}
                          strokeWidth={1.75}
                        />
                        <span className="flex-1 min-w-0 pr-5">
                          <span className="block text-[13px] font-medium leading-snug truncate">
                            {c.title}
                          </span>
                          <span className="block text-[11px] text-gray-500 mt-0.5">
                            {formatRelative(c.updatedAt)}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(c.id);
                        }}
                        aria-label="Delete conversation"
                        className="absolute right-1.5 top-1.5 p-1 rounded-md opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-surface text-gray-400 hover:text-accent-red"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-rule p-3 bg-surface">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-un-blue text-white text-[11px] font-semibold flex items-center justify-center shrink-0 tracking-wide">
                {user?.initials ?? 'UN'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold leading-tight truncate">
                  {user?.name ?? 'Signed in'}
                </div>
                <div className="text-[11px] text-gray-500 truncate">{user?.email}</div>
                <div className="text-[10px] text-gray-400 mt-0.5 tabular-nums tracking-wide">
                  v{appVersion}
                </div>
              </div>
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                className="p-1.5 rounded-md text-gray-400 hover:text-ink hover:bg-gray-100 shrink-0"
              >
                {theme === 'dark' ? (
                  <Sun className="w-3.5 h-3.5" strokeWidth={1.75} />
                ) : (
                  <Moon className="w-3.5 h-3.5" strokeWidth={1.75} />
                )}
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                aria-label="Sign out"
                className="p-1.5 rounded-md text-gray-400 hover:text-ink hover:bg-gray-100 shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" strokeWidth={1.75} />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
