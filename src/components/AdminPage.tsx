import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Navigate } from 'react-router-dom';
import {
  Shield,
  ShieldOff,
  Users,
  Ban,
  UserMinus,
  RefreshCw,
  AlertTriangle,
  X,
} from 'lucide-react';
import { PageHeader, SearchField, EmptyState } from './ui';
import { useAuth } from '../lib/auth';
import { classNames } from '../lib/format';
import {
  LIBRARY_ROLE_LABELS,
  isBootstrapAdmin,
  type LibraryRole,
} from '../lib/permissions';
import {
  banEmail,
  listBannedEmails,
  listProfiles,
  removeUserAccess,
  setLibraryRole,
  setProfileAdmin,
  unbanEmail,
  type BannedEmailRecord,
  type ProfileRecord,
} from '../lib/db/admin';

type Tab = 'users' | 'bans';

type ConfirmAction =
  | { kind: 'make_admin'; profile: ProfileRecord }
  | { kind: 'remove_admin'; profile: ProfileRecord };

export default function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('users');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [bans, setBans] = useState<BannedEmailRecord[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [banEmailInput, setBanEmailInput] = useState('');
  const [banReason, setBanReason] = useState('');
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [p, b] = await Promise.all([listProfiles(), listBannedEmails()]);
      setProfiles(p);
      setBans(b);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin data.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const bannedSet = useMemo(() => new Set(bans.map((b) => b.email)), [bans]);

  if (!user?.isAdmin) {
    return <Navigate to="/" replace />;
  }

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const filteredProfiles = profiles.filter((p) => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return true;
    return p.email.includes(q) || (p.display_name ?? '').toLowerCase().includes(q);
  });

  return (
    <section className="flex-1 min-w-0 flex flex-col bg-surface-subtle">
      <PageHeader
        icon={Shield}
        title="Administrator Dashboard"
        subtitle="People, library access, and bans"
        actions={
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void refresh()}
            disabled={busy}
          >
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />
            Refresh
          </button>
        }
      />

      <div className="toolbar gap-1">
        {(
          [
            { id: 'users', label: 'People', icon: Users },
            { id: 'bans', label: 'Banned emails', icon: Ban },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={classNames('filter-chip', tab === id && 'filter-chip-active')}
          >
            <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-5 lg:px-8 py-6">
        <div className="mb-5 rounded-lg border border-rule bg-surface px-4 py-3 text-[13px] text-gray-600 leading-relaxed">
          <strong className="text-ink">Library access:</strong> set each person’s level
          here (<em>No access</em>, <em>Read only</em>, or <em>Can edit</em>). To limit who
          sees a specific folder, open the Knowledge library, right-click the folder, and
          choose <em>Manage who can see this</em>.
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-900">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Something went wrong</div>
              <div className="mt-0.5">{error}</div>
              <div className="mt-2 text-[12px] text-red-800/80">
                If columns are missing, re-run{' '}
                <code className="font-mono">supabase/permissions.sql</code> in the Supabase
                SQL Editor.
              </div>
            </div>
          </div>
        )}

        {notice && (
          <div className="mb-4 rounded-lg border border-un-blue-soft bg-un-blue-bg px-4 py-3 text-[13px] text-un-blue-text">
            {notice}
          </div>
        )}

        {tab === 'users' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <SearchField
                value={userQuery}
                onChange={setUserQuery}
                placeholder="Search people…"
                className="max-w-sm"
              />
              <p className="text-[12px] text-gray-500">
                {profiles.length} people
              </p>
            </div>

            {filteredProfiles.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No people yet"
                description="Profiles appear after someone signs in with an @unu.edu magic link."
              />
            ) : (
              <div className="data-register">
                <div className="data-register-scroll">
                  <table className="data-table" style={{ minWidth: 720 }}>
                    <thead>
                      <tr>
                        <th>Person</th>
                        <th>Status</th>
                        <th>Library access</th>
                        <th>Joined</th>
                        <th className="w-56">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProfiles.map((p) => {
                        const isSelf = p.email === user.email;
                        const isPrimary = isBootstrapAdmin(p.email);
                        return (
                          <tr key={p.id} style={{ cursor: 'default' }}>
                            <td>
                              <div className="font-semibold text-ink">
                                {p.display_name || p.email.split('@')[0]}
                              </div>
                              <div className="text-[12px] text-gray-500">{p.email}</div>
                              {p.is_admin && (
                                <span className="chip chip-blue mt-1">Administrator</span>
                              )}
                            </td>
                            <td>
                              {p.disabled_at ? (
                                <span className="chip chip-red">Removed</span>
                              ) : bannedSet.has(p.email) ? (
                                <span className="chip chip-amber">Banned</span>
                              ) : (
                                <span className="chip chip-green">Active</span>
                              )}
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              {p.is_admin ? (
                                <span className="text-[13px] text-ink font-medium">
                                  Full access
                                </span>
                              ) : (
                                <select
                                  className="select py-1.5 text-[13px] min-w-[9.5rem]"
                                  value={p.library_role}
                                  disabled={busy || Boolean(p.disabled_at)}
                                  onChange={(e) =>
                                    void withBusy(async () => {
                                      const role = e.target.value as LibraryRole;
                                      const res = await setLibraryRole(p.id, role);
                                      if (!res.ok) throw new Error(res.error);
                                      setNotice(
                                        `Set ${p.email} to ${LIBRARY_ROLE_LABELS[role]}.`
                                      );
                                    })
                                  }
                                >
                                  {(Object.keys(LIBRARY_ROLE_LABELS) as LibraryRole[]).map(
                                    (role) => (
                                      <option key={role} value={role}>
                                        {LIBRARY_ROLE_LABELS[role]}
                                      </option>
                                    )
                                  )}
                                </select>
                              )}
                            </td>
                            <td className="text-[12px] text-gray-500 whitespace-nowrap">
                              {new Date(p.created_at).toLocaleDateString()}
                            </td>
                            <td>
                              {isSelf ? (
                                <span className="text-[12px] text-gray-400">You</span>
                              ) : !p.disabled_at ? (
                                <div className="flex flex-wrap gap-1">
                                  {!p.is_admin && (
                                    <button
                                      type="button"
                                      className="btn btn-secondary btn-sm"
                                      disabled={busy}
                                      onClick={() =>
                                        setConfirm({ kind: 'make_admin', profile: p })
                                      }
                                    >
                                      <Shield className="w-3.5 h-3.5" />
                                      Make admin
                                    </button>
                                  )}
                                  {p.is_admin && !isPrimary && (
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn-sm"
                                      disabled={busy}
                                      onClick={() =>
                                        setConfirm({ kind: 'remove_admin', profile: p })
                                      }
                                    >
                                      <ShieldOff className="w-3.5 h-3.5" />
                                      Remove admin
                                    </button>
                                  )}
                                  {!p.is_admin && (
                                    <>
                                      <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        disabled={busy}
                                        onClick={() =>
                                          void withBusy(async () => {
                                            const ok = window.confirm(
                                              `Remove ${p.email}? They lose access until you restore them.`
                                            );
                                            if (!ok) return;
                                            const res = await removeUserAccess({
                                              profileId: p.id,
                                              email: p.email,
                                              ban: false,
                                              reason: 'Removed by admin',
                                              actorEmail: user.email,
                                            });
                                            if (!res.ok) throw new Error(res.error);
                                            setNotice(`Removed ${p.email}.`);
                                          })
                                        }
                                      >
                                        <UserMinus className="w-3.5 h-3.5" />
                                        Remove
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-danger btn-sm"
                                        disabled={busy}
                                        onClick={() =>
                                          void withBusy(async () => {
                                            const ok = window.confirm(
                                              `Remove and ban ${p.email}? They cannot sign in again.`
                                            );
                                            if (!ok) return;
                                            const res = await removeUserAccess({
                                              profileId: p.id,
                                              email: p.email,
                                              ban: true,
                                              reason: 'Removed and banned by admin',
                                              actorEmail: user.email,
                                            });
                                            if (!res.ok) throw new Error(res.error);
                                            setNotice(`Removed and banned ${p.email}.`);
                                          })
                                        }
                                      >
                                        <Ban className="w-3.5 h-3.5" />
                                        Ban
                                      </button>
                                    </>
                                  )}
                                  {isPrimary && (
                                    <span className="text-[11px] text-gray-400 self-center">
                                      Primary admin
                                    </span>
                                  )}
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'bans' && (
          <div className="space-y-5 max-w-3xl">
            <form
              className="rounded-lg border border-rule bg-surface p-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void withBusy(async () => {
                  const res = await banEmail(banEmailInput, {
                    reason: banReason,
                    bannedBy: user.email,
                  });
                  if (!res.ok) throw new Error(res.error);
                  setBanEmailInput('');
                  setBanReason('');
                  setNotice(`Banned ${banEmailInput.trim().toLowerCase()}.`);
                });
              }}
            >
              <div className="text-[13px] font-semibold text-ink">Ban an email</div>
              <p className="text-[12px] text-gray-500">
                Banned addresses cannot sign in — even with a valid @unu.edu account.
              </p>
              <input
                className="input"
                type="email"
                required
                placeholder="name@unu.edu"
                value={banEmailInput}
                onChange={(e) => setBanEmailInput(e.target.value)}
              />
              <input
                className="input"
                type="text"
                placeholder="Reason (optional)"
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" disabled={busy}>
                <Ban className="w-4 h-4" />
                Ban email
              </button>
            </form>

            <div className="data-register">
              <table className="data-table" style={{ minWidth: 480 }}>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Reason</th>
                    <th>Banned</th>
                    <th className="w-28">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bans.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-gray-500 text-[13px]">
                        No bans yet.
                      </td>
                    </tr>
                  ) : (
                    bans.map((b) => (
                      <tr key={b.email}>
                        <td className="font-medium">{b.email}</td>
                        <td className="text-[12px] text-gray-500">{b.reason || '—'}</td>
                        <td className="text-[12px] text-gray-500 whitespace-nowrap">
                          {new Date(b.banned_at).toLocaleString()}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busy}
                            onClick={() =>
                              void withBusy(async () => {
                                const res = await unbanEmail(b.email);
                                if (!res.ok) throw new Error(res.error);
                                setNotice(`Unbanned ${b.email}.`);
                              })
                            }
                          >
                            Unban
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {confirm &&
        createPortal(
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0 bg-ink/40 backdrop-blur-[1px]"
              aria-label="Close"
              onClick={() => setConfirm(null)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-confirm-title"
              className="relative w-full max-w-md bg-surface border border-rule rounded-lg shadow-panel fade-in p-5"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <h2
                  id="admin-confirm-title"
                  className="text-[17px] font-bold text-ink tracking-tight m-0"
                >
                  {confirm.kind === 'make_admin'
                    ? 'Make administrator?'
                    : 'Remove administrator?'}
                </h2>
                <button
                  type="button"
                  className="p-1.5 rounded-md text-gray-400 hover:text-ink hover:bg-gray-100"
                  onClick={() => setConfirm(null)}
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[13px] text-gray-600 leading-relaxed m-0">
                {confirm.kind === 'make_admin' ? (
                  <>
                    Are you sure you want to make{' '}
                    <strong className="text-ink">{confirm.profile.email}</strong> an
                    administrator? They will get full access to the Administrator Dashboard,
                    user management, and all library folders.
                  </>
                ) : (
                  <>
                    Are you sure you want to remove administrator privileges from{' '}
                    <strong className="text-ink">{confirm.profile.email}</strong>? They will
                    lose access to the Administrator Dashboard. Their library access will stay
                    as <em>Can edit</em> unless you change it.
                  </>
                )}
              </p>
              <div className="flex items-center justify-end gap-2 mt-5">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => setConfirm(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={
                    confirm.kind === 'make_admin'
                      ? 'btn btn-primary btn-sm'
                      : 'btn btn-danger btn-sm'
                  }
                  disabled={busy}
                  onClick={() =>
                    void withBusy(async () => {
                      const making = confirm.kind === 'make_admin';
                      const res = await setProfileAdmin({
                        profileId: confirm.profile.id,
                        email: confirm.profile.email,
                        isAdmin: making,
                      });
                      if (!res.ok) throw new Error(res.error);
                      setConfirm(null);
                      setNotice(
                        making
                          ? `${confirm.profile.email} is now an administrator.`
                          : `Removed administrator privileges from ${confirm.profile.email}.`
                      );
                    })
                  }
                >
                  {busy
                    ? 'Working…'
                    : confirm.kind === 'make_admin'
                      ? 'Yes, make admin'
                      : 'Yes, remove admin'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </section>
  );
}
