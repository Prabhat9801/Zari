import type { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

/**
 * Notifications are written inside the same transaction as the event that
 * caused them, so a customer is never told about something that got rolled back.
 */
export async function notify(
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    type: NotificationType;
    title: string;
    body?: string;
    linkUrl?: string;
    data?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body ?? null,
      linkUrl: params.linkUrl ?? null,
      data: (params.data ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export async function notifyMany(
  tx: Prisma.TransactionClient,
  userIds: string[],
  params: {
    type: NotificationType;
    title: string;
    body?: string;
    linkUrl?: string;
    data?: Record<string, unknown>;
  },
): Promise<void> {
  if (userIds.length === 0) return;
  await tx.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type: params.type,
      title: params.title,
      body: params.body ?? null,
      linkUrl: params.linkUrl ?? null,
      data: (params.data ?? {}) as Prisma.InputJsonValue,
    })),
  });
}

/** Posts a system line into an order/request conversation ("Milestone: Cutting"). */
export async function postSystemMessage(
  tx: Prisma.TransactionClient,
  conversationId: string,
  senderId: string,
  body: string,
): Promise<void> {
  await tx.message.create({
    data: { conversationId, senderId, body, isSystem: true },
  });
  await tx.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date() },
  });
}

export async function auditLog(
  tx: Prisma.TransactionClient,
  params: {
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
    ip?: string | null;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: params.actorId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      before: (params.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (params.after ?? undefined) as Prisma.InputJsonValue | undefined,
      ip: params.ip ?? null,
    },
  });
}
