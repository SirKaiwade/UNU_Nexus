import type { Person } from '../types';
import { directoryStore } from './directory';

export function getPeople(): Person[] {
  return directoryStore.get();
}

export function getPerson(id: string): Person | undefined {
  return directoryStore.get().find((p) => p.id === id);
}
