import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Paperclip, Loader2 } from 'lucide-react';
import { ingestFile, persistDocToCloud, type UploadedDoc } from '../lib/uploads';
import { useAuth } from '../lib/auth';
import { supabaseConfigured } from '../lib/supabase';
import { classNames } from '../lib/format';

interface Props {
  onSend: (text: string) => void;
  onAttached?: (docs: UploadedDoc[]) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export default function Composer({
  onSend,
  onAttached,
  placeholder,
  autoFocus = true,
}: Props) {
  const { user } = useAuth();
  const [value, setValue] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [value]);

  function submit() {
    const v = value.trim();
    if (!v) return;
    onSend(v);
    setValue('');
  }

  async function onFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    const errors: string[] = [];
    const attached: UploadedDoc[] = [];
    const cloud = supabaseConfigured();
    for (const file of Array.from(files)) {
      const result = await ingestFile(file);
      if (!result.ok && result.error) {
        errors.push(result.error);
        continue;
      }
      if (result.doc) {
        attached.push(result.doc);
        if (cloud && user?.email) {
          const saved = await persistDocToCloud(result.doc, user.email);
          if (!saved.ok && saved.error) errors.push(saved.error);
        }
      }
    }
    if (attached.length) onAttached?.(attached);
    setUploading(false);
    if (errors.length) setUploadError(errors[0]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const canSend = Boolean(value.trim());

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,.txt,.md,.markdown,text/plain,text/markdown"
        className="hidden"
        onChange={(e) => onFilesSelected(e.target.files)}
      />
      <div
        className={classNames(
          'composer-shell composer-elevated',
          focused && 'composer-shell-focused'
        )}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={placeholder ?? 'Ask anything…'}
          className="textarea composer-input pl-3 pr-24 resize-none min-h-[52px] py-3.5 text-[15px] leading-relaxed"
        />
        <div className="absolute right-2 bottom-2 flex items-center gap-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            aria-label="Attach a document"
            title="Attach a file to this chat"
            className="w-9 h-9 rounded-full text-gray-400 hover:text-un-blue hover:bg-un-blue-bg flex items-center justify-center disabled:opacity-50 transition-colors"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Paperclip className="w-4 h-4" strokeWidth={1.75} />
            )}
          </button>
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send"
            className={classNames(
              'w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150',
              canSend
                ? 'bg-un-blue text-white hover:bg-un-blue-dark shadow-sm scale-100'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed scale-95'
            )}
          >
            <ArrowUp className="w-4 h-4" strokeWidth={2.25} />
          </button>
        </div>
      </div>
      {uploadError && (
        <div className="mt-2 text-[12px] text-accent-red fade-in">{uploadError}</div>
      )}
    </form>
  );
}
