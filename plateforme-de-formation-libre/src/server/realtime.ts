import crypto from 'crypto';
import type { Response } from 'express';

interface SseClient {
  id: string;
  userId: number;
  res: Response;
}

const clients = new Map<string, SseClient>();
const streamTickets = new Map<string, { userId: number; expiresAt: number }>();

export function issueStreamTicket(userId: number): string {
  const now = Date.now();
  for (const [k, v] of streamTickets.entries()) {
    if (v.expiresAt < now) streamTickets.delete(k);
  }
  const ticket = crypto.randomBytes(24).toString('base64url');
  streamTickets.set(ticket, { userId, expiresAt: now + 60_000 });
  return ticket;
}

export function consumeStreamTicket(ticket: string): number | null {
  const entry = streamTickets.get(ticket);
  if (!entry) return null;
  streamTickets.delete(ticket);
  if (Date.now() > entry.expiresAt) return null;
  return entry.userId;
}

export function addNotificationClient(userId: number, res: Response): string {
  const id = crypto.randomBytes(8).toString('hex');
  clients.set(id, { id, userId, res });
  return id;
}

export function removeNotificationClient(clientId: string): void {
  clients.delete(clientId);
}

export function broadcastNotificationEvent(params: {
  targetUserId?: number | null;
  targetScope?: 'current_users' | 'all_including_future' | 'targeted';
  payload: Record<string, unknown>;
}): void {
  const data = `event: notification\ndata: ${JSON.stringify(params.payload)}\n\n`;
  for (const [id, client] of clients.entries()) {
    if (params.targetUserId && client.userId !== params.targetUserId) {
      continue;
    }
    try {
      client.res.write(data);
    } catch {
      clients.delete(id);
    }
  }
}

export function getRealtimeStats() {
  return { connectedClients: clients.size };
}
