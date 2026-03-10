/**
 * Notification Engine — event-driven notifications
 */

import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export type NotificationType = 'new_match' | 'price_drop' | 'showing_confirmed' | 'offer_status' | 'listing_update' | 'system';
export type NotificationChannel = 'in_app' | 'email' | 'sms';

export interface CreateNotificationInput {
  recipient_type: 'agent' | 'lead';
  recipient_id: bigint;
  channel?: NotificationChannel;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Create a notification (checks preferences first).
 */
export async function createNotification(input: CreateNotificationInput) {
  // Check preferences
  const prefs = await prisma.notificationPreference.findUnique({
    where: {
      recipient_type_recipient_id: {
        recipient_type: input.recipient_type,
        recipient_id: input.recipient_id,
      },
    },
  });

  // Check if notification type is enabled
  if (prefs) {
    const typeKey = input.type as string;
    if (typeKey === 'new_match' && !prefs.new_match) return null;
    if (typeKey === 'price_drop' && !prefs.price_drop) return null;
    if ((typeKey === 'showing_confirmed') && !prefs.showing_updates) return null;
    if (typeKey === 'offer_status' && !prefs.offer_updates) return null;

    // Check channel
    if (input.channel === 'sms' && !prefs.sms_enabled) {
      input.channel = 'in_app'; // Fallback to in-app
    }
  }

  const notification = await prisma.notification.create({
    data: {
      recipient_type: input.recipient_type,
      recipient_id: input.recipient_id,
      channel: input.channel ?? 'in_app',
      type: input.type,
      title: input.title,
      body: input.body,
      data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
      status: input.channel === 'in_app' ? 'delivered' : 'pending',
      sent_at: input.channel === 'in_app' ? new Date() : null,
    },
  });

  return notification;
}

/**
 * Create notifications in bulk (e.g., new listing match for all interested leads).
 */
export async function bulkNotify(inputs: CreateNotificationInput[]): Promise<number> {
  let created = 0;
  for (const input of inputs) {
    try {
      const result = await createNotification(input);
      if (result) created++;
    } catch (err) {
      console.warn('[notifications] Failed to create:', err);
    }
  }
  return created;
}

/**
 * Mark notification as read.
 */
export async function markRead(notificationId: bigint) {
  return prisma.notification.update({
    where: { id: notificationId },
    data: { read_at: new Date() },
  });
}

/**
 * Mark all notifications as read for a recipient.
 */
export async function markAllRead(recipientType: string, recipientId: bigint) {
  return prisma.notification.updateMany({
    where: {
      recipient_type: recipientType,
      recipient_id: recipientId,
      read_at: null,
    },
    data: { read_at: new Date() },
  });
}

/**
 * Get unread count.
 */
export async function getUnreadCount(recipientType: string, recipientId: bigint): Promise<number> {
  return prisma.notification.count({
    where: {
      recipient_type: recipientType,
      recipient_id: recipientId,
      read_at: null,
    },
  });
}
