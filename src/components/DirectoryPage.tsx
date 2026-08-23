import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  BookUser,
  Mail,
  MapPin,
  Building2,
  Plus,
  Pencil,
  Trash2,
  MessageSquare,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  CATEGORY_LABELS,
  countByCategory,
  directoryStore,
  getContactsByCategory,
  searchContacts,
} from '../data/directory';
import type { ContactCategory, DirectoryContact } from '../types';
import ContactEditor from './ContactEditor';
import { useLocalDataInfo } from '../lib/localDataSync';
import {
  Avatar,
  CopyButton,
  EmptyState,
  FilterChip,
  PageHeader,
  SearchField,
} from './ui';
import { classNames } from '../lib/format';
import type { ShellContext } from './AppShell';

type FilterCategory = ContactCategory | 'all';
type SortKey = 'name' | 'organization' | 'category';

const FILTER_ORDER: FilterCategory[] = ['all', 'unu', 'government', 'ngo', 'partner', 'other'];

const CATEGORY_CHIP: Record<ContactCategory, string> = {
  unu: 'chip-blue',
  government: 'chip-amber',
  ngo: 'chip-green',
  partner: 'chip-gray',
  other: 'chip-gray',
};

export default function DirectoryPage() {
  const ctx = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const allContacts = directoryStore.use();
  const dataInfo = useLocalDataInfo();
  const [category, setCategory] = useState<FilterCategory>('all');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<DirectoryContact | null>(null);

  const counts = useMemo(() => countByCategory(allContacts), [allContacts]);

  const contacts = useMemo(() => {
    const byCategory = getContactsByCategory(category, allContacts);
    const searched = searchContacts(byCategory, query);
    return [...searched].sort((a, b) => {
      if (sortKey === 'organization') {
        return (
          a.organization.localeCompare(b.organization) || a.name.localeCompare(b.name)
        );
      }
      if (sortKey === 'category') {
        return (
          CATEGORY_LABELS[a.category].localeCompare(CATEGORY_LABELS[b.category]) ||
          a.name.localeCompare(b.name)
        );
      }
      return a.name.localeCompare(b.name);
    });
  }, [allContacts, category, query, sortKey]);

  function openAdd() {
    setEditing(null);
    setEditorOpen(true);
  }

  function openEdit(c: DirectoryContact) {
    setEditing(c);
    setEditorOpen(true);
  }

  function saveContact(record: DirectoryContact) {
    if (editing) directoryStore.update(record);
    else directoryStore.add(record);
    setExpandedId(record.id);
  }

  function deleteContact(c: DirectoryContact) {
    if (!window.confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
    directoryStore.remove(c.id);
    if (expandedId === c.id) setExpandedId(null);
  }

  function askNexus(c: DirectoryContact) {
    ctx.sendMessage(`Who is ${c.name} and how are they connected to our work?`);
    navigate('/');
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <section
      className={classNames(
        'flex-1 min-w-0 flex flex-col bg-surface relative',
        ctx.openDocId ? 'border-r border-rule' : ''
      )}
    >
      <PageHeader
        icon={BookUser}
        title="Directory"
        subtitle={`Institutional contacts · searchable from chat${dataInfo.label ? ` · ${dataInfo.label}` : ''}`}
        search={
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search name, org, expertise…"
            className="hidden sm:block"
          />
        }
        actions={
          <button
            type="button"
            onClick={openAdd}
            className="btn btn-primary btn-sm shrink-0"
            title="Add a contact"
          >
            <Plus className="w-3.5 h-3.5" />
            Add contact
          </button>
        }
      />

      <div className="toolbar">
        {FILTER_ORDER.map((key) => {
          if (key !== 'all' && counts[key] === 0 && category !== key) return null;
          return (
            <FilterChip
              key={key}
              active={category === key}
              count={counts[key]}
              onClick={() => setCategory(key)}
            >
              {key === 'all' ? 'All' : CATEGORY_LABELS[key]}
            </FilterChip>
          );
        })}

        <div className="ml-auto flex items-center gap-2">
          <label className="text-[11px] text-gray-500 font-medium uppercase tracking-wide hidden sm:inline">
            Sort
          </label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="select w-auto py-1.5 text-[12px]"
            aria-label="Sort contacts"
          >
            <option value="name">Name</option>
            <option value="organization">Organization</option>
            <option value="category">Category</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-[1600px] mx-auto px-5 lg:px-8 py-6 lg:py-8">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search name, org, expertise…"
            className="sm:hidden mb-4 max-w-none"
          />

          {allContacts.length === 0 ? (
            <EmptyState
              icon={BookUser}
              title="Start your contact register"
              description="Add UNU staff, government counterparts, NGO partners, and collaborators. Keep email and phone here so the team can find — and chat can recommend — the right person."
              action={
                <button type="button" onClick={openAdd} className="btn btn-primary btn-sm">
                  <Plus className="w-3.5 h-3.5" />
                  Add the first contact
                </button>
              }
            />
          ) : contacts.length === 0 ? (
            <div className="data-table-empty">
              {query.trim()
                ? `No contacts match "${query}".`
                : 'No contacts in this category yet.'}
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <p className="text-[13px] text-gray-500">
                  <span className="font-semibold text-ink tabular-nums">{contacts.length}</span>
                  {' '}
                  {contacts.length === 1 ? 'contact' : 'contacts'}
                  {category !== 'all' ? ` in ${CATEGORY_LABELS[category]}` : ''}
                </p>
                <p className="text-[12px] text-gray-500 hidden md:block">
                  Click a row for expertise & notes · copy email/phone anytime
                </p>
              </div>

              <div className="data-register">
                <div className="data-register-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th className="w-8" />
                        <th>Person</th>
                        <th>Organization</th>
                        <th>Category</th>
                        <th>Location</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th className="w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.map((contact) => {
                        const open = expandedId === contact.id;
                        return (
                          <ContactRegisterRows
                            key={contact.id}
                            contact={contact}
                            open={open}
                            onToggle={() => toggleExpand(contact.id)}
                            onEdit={() => openEdit(contact)}
                            onDelete={() => deleteContact(contact)}
                            onAskNexus={() => askNexus(contact)}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {editorOpen && (
        <ContactEditor
          initial={editing ?? undefined}
          onClose={() => setEditorOpen(false)}
          onSave={saveContact}
        />
      )}
    </section>
  );
}

function ContactRegisterRows({
  contact,
  open,
  onToggle,
  onEdit,
  onDelete,
  onAskNexus,
}: {
  contact: DirectoryContact;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAskNexus: () => void;
}) {
  const location = [contact.location, contact.country].filter(Boolean).join(', ');

  return (
    <>
      <tr
        className={classNames('data-row', open && 'data-row-open')}
        onClick={onToggle}
      >
        <td className="text-gray-400 w-8">
          {open ? (
            <ChevronDown className="w-4 h-4" strokeWidth={1.75} />
          ) : (
            <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
          )}
        </td>
        <td>
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar initials={contact.avatarInitials} color={contact.avatarColor} size="sm" />
            <div className="min-w-0">
              <div className="font-semibold text-ink leading-snug truncate">{contact.name}</div>
              <div className="text-[12px] text-gray-500 truncate">{contact.role}</div>
            </div>
          </div>
        </td>
        <td>
          <div className="min-w-0">
            <div className="truncate max-w-[220px]">{contact.organization}</div>
            {contact.team && (
              <div className="text-[11px] text-gray-500 truncate max-w-[220px]">{contact.team}</div>
            )}
          </div>
        </td>
        <td>
          <span className={classNames('chip text-[10px] py-0.5 px-1.5', CATEGORY_CHIP[contact.category])}>
            {CATEGORY_LABELS[contact.category]}
          </span>
        </td>
        <td>
          <span className="text-gray-600 text-[12px]">{location || '—'}</span>
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          {contact.email ? (
            <span className="copyable">
              <a
                href={`mailto:${contact.email}`}
                className="copyable-value truncate max-w-[180px] hover:underline"
                title={contact.email}
              >
                {contact.email}
              </a>
              <CopyButton value={contact.email} label="Copy email" />
            </span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          {contact.phone ? (
            <span className="copyable">
              <a href={`tel:${contact.phone}`} className="copyable-value hover:underline">
                {contact.phone}
              </a>
              <CopyButton value={contact.phone} label="Copy phone" />
            </span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={onEdit}
              className="p-1.5 rounded-md text-gray-400 hover:text-un-blue hover:bg-un-blue-bg"
              title="Edit"
              aria-label={`Edit ${contact.name}`}
            >
              <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 rounded-md text-gray-400 hover:text-accent-red hover:bg-red-50"
              title="Delete"
              aria-label={`Delete ${contact.name}`}
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          </div>
        </td>
      </tr>
      {open && (
        <tr className="data-detail">
          <td colSpan={8}>
            <div className="data-detail-panel fade-in">
              <div className="data-detail-grid">
                <Field label="Organization" value={contact.organization} />
                {contact.team && <Field label="Team" value={contact.team} />}
                {location && <Field label="Location" value={location} icon={MapPin} />}
                {contact.email && (
                  <Field label="Email">
                    <span className="copyable">
                      <a href={`mailto:${contact.email}`} className="text-un-blue hover:underline">
                        {contact.email}
                      </a>
                      <CopyButton value={contact.email} label="Copy email" />
                    </span>
                  </Field>
                )}
                {contact.phone && (
                  <Field label="Phone">
                    <span className="copyable">
                      <a href={`tel:${contact.phone}`} className="text-un-blue hover:underline">
                        {contact.phone}
                      </a>
                      <CopyButton value={contact.phone} label="Copy phone" />
                    </span>
                  </Field>
                )}
              </div>

              {contact.expertise.length > 0 && (
                <div className="mt-4">
                  <div className="data-field-label">Expertise</div>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {contact.expertise.map((tag) => (
                      <span key={tag} className="chip chip-blue text-[11px]">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {contact.tags && contact.tags.length > 0 && (
                <div className="mt-3">
                  <div className="data-field-label">Tags</div>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {contact.tags.map((tag) => (
                      <span key={tag} className="chip chip-gray text-[11px]">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {contact.notes && (
                <div className="mt-3">
                  <div className="data-field-label">Notes</div>
                  <p className="data-field-value whitespace-pre-wrap mt-1">{contact.notes}</p>
                </div>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                {contact.email && (
                  <a href={`mailto:${contact.email}`} className="btn btn-secondary btn-sm">
                    <Mail className="w-3.5 h-3.5" />
                    Email
                  </a>
                )}
                <button type="button" onClick={onAskNexus} className="btn btn-secondary btn-sm">
                  <MessageSquare className="w-3.5 h-3.5" />
                  Ask Nexus
                </button>
                <button type="button" onClick={onEdit} className="btn btn-ghost btn-sm">
                  <Pencil className="w-3.5 h-3.5" />
                  Edit record
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Field({
  label,
  value,
  children,
  icon: Icon,
}: {
  label: string;
  value?: string;
  children?: ReactNode;
  icon?: typeof Building2;
}) {
  return (
    <div>
      <div className="data-field-label flex items-center gap-1.5">
        {Icon ? <Icon className="w-3 h-3" strokeWidth={1.75} /> : null}
        {label}
      </div>
      <div className="data-field-value">{children ?? value ?? '—'}</div>
    </div>
  );
}
