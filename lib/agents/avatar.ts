/**
 * Pure helpers for the agent avatar (shared by the client AgentAvatar component
 * and unit tests). No React / next dependencies so they are trivially testable.
 *
 * @module lib/agents/avatar
 */

/**
 * Derive the square "-headshot" variant path for an agent photo. Stored agent
 * photos are often full-body / environmental portraits that crop badly into a
 * small circular avatar; agents can ship a square headshot named
 * `<photo>-headshot.<ext>` for the avatar. Returns '' when there is no photo.
 *
 * e.g. "/images/agents/maya-allan.jpg" → "/images/agents/maya-allan-headshot.jpg"
 */
export function headshotVariant(photo: string | null | undefined): string {
  if (!photo) return '';
  return photo.replace(/(\.[a-zA-Z0-9]+)(\?.*)?$/, '-headshot$1$2');
}

/** First letters of up to two name words, uppercased (avatar initials). */
export function avatarInitials(name: string | null | undefined): string {
  return (name || '')
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
