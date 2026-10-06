import { api, setActiveSpace } from './api';
import { getText, setText } from './prefs';

/** Shared spaces: switch between Personal and a household, invite, join, and see who owes whom. */

export interface Space { id: string; name: string; kind: 'personal' | 'business' | 'household'; role: string; members: { name: string; you: boolean }[] }
export interface Split { totalMinor: number; shareMinor: number; people: { id: string; name: string; paidMinor: number; balanceMinor: number }[]; settle: { from: string; to: string; amountMinor: number }[] }

export const listSpaces = (splitFor?: string) => api<{ active: string; spaces: Space[]; split: Split | null }>(`/api/mobile/spaces${splitFor ? `?split=${splitFor}` : ''}`);
export const createSpace = (name: string) => api<{ id: string }>('/api/mobile/spaces', { body: { action: 'create', name } });
export const inviteToSpace = (spaceId: string) => api<{ code: string }>('/api/mobile/spaces', { body: { action: 'invite', spaceId } });
export const joinSpace = (code: string) => api<{ id: string }>('/api/mobile/spaces', { body: { action: 'join', code } });
export const leaveSpace = (spaceId: string) => api('/api/mobile/spaces', { body: { action: 'leave', spaceId } });

/** Remember the choice across launches. */
export async function switchSpace(id: string | null) { setActiveSpace(id); await setText('space', id); }
export async function restoreSpace() { setActiveSpace(await getText('space')); }
