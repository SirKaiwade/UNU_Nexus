import { useOutletContext } from 'react-router-dom';
import ChatThread from './ChatThread';
import type { ShellContext } from './AppShell';

export default function ChatPage() {
  const ctx = useOutletContext<ShellContext>();
  return (
    <ChatThread
      conversation={ctx.activeConversation}
      onSend={ctx.sendMessage}
      onOpenDocument={ctx.openDocument}
      onToggleSave={ctx.toggleSave}
      openDocId={ctx.openDocId}
      setCitationRail={ctx.setCitationRail}
    />
  );
}
