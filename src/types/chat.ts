import type { SourceReference } from './index';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string; // for assistant: may contain inline [n] markers matching sources
  createdAt: string;
  sources?: SourceReference[];
  confidence?: number;
  followUps?: string[];
  relatedPeopleIds?: string[];
  saved?: boolean;
  pending?: boolean;
  noAnswer?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}
