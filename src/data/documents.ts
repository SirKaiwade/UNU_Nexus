import type { KnowledgeDocument } from '../types';

export const documents: KnowledgeDocument[] = [];

export function getDocument(id: string): KnowledgeDocument | undefined {
  return documents.find((d) => d.id === id);
}
