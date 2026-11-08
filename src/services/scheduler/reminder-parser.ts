/**
 * Parses user reminder prompts into structured reminder text and an ISO date.
 */
export interface ParsedReminder {
  reminderText: string;
  remindAt: string; // ISO string
}

export function parseReminderInput(input: string, now: Date = new Date()): ParsedReminder | null {
  const text = input.trim().replace(/^\/remind(?:er)?\s+/i, '');

  // Pattern 1: Relative duration: "in X m/min/minutes/h/hours/d/days <text>"
  // e.g., "in 15m check oven" or "/remind in 2h meeting"
  const relativeMatch = text.match(/^(?:remind\s+(?:me\s+)?(?:to\s+)?)?in\s+(\d+)\s*(m|min|mins|minutes|h|hr|hrs|hours|d|day|days)\s+(?:to\s+)?(.+)$/i);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2].toLowerCase();
    const reminderText = relativeMatch[3].trim();

    let targetTime = new Date(now.getTime());
    if (unit.startsWith('m')) {
      targetTime = new Date(targetTime.getTime() + amount * 60 * 1000);
    } else if (unit.startsWith('h')) {
      targetTime = new Date(targetTime.getTime() + amount * 60 * 60 * 1000);
    } else if (unit.startsWith('d')) {
      targetTime = new Date(targetTime.getTime() + amount * 24 * 60 * 60 * 1000);
    }

    return {
      reminderText,
      remindAt: targetTime.toISOString()
    };
  }

  // Pattern 2: "remind me to <action> in <X> minutes/hours"
  // e.g., "remind me to check the oven in 15 minutes"
  const trailingRelativeMatch = text.match(/^(?:remind\s+(?:me\s+)?(?:to\s+)?)(.+?)\s+in\s+(\d+)\s*(m|min|mins|minutes|h|hr|hrs|hours|d|day|days)$/i);
  if (trailingRelativeMatch) {
    const reminderText = trailingRelativeMatch[1].trim();
    const amount = parseInt(trailingRelativeMatch[2], 10);
    const unit = trailingRelativeMatch[3].toLowerCase();

    let targetTime = new Date(now.getTime());
    if (unit.startsWith('m')) {
      targetTime = new Date(targetTime.getTime() + amount * 60 * 1000);
    } else if (unit.startsWith('h')) {
      targetTime = new Date(targetTime.getTime() + amount * 60 * 60 * 1000);
    } else if (unit.startsWith('d')) {
      targetTime = new Date(targetTime.getTime() + amount * 24 * 60 * 60 * 1000);
    }

    return {
      reminderText,
      remindAt: targetTime.toISOString()
    };
  }

  // Pattern 3: Specific clock time: "at <HH:MM> or <H am/pm> <text>"
  // e.g., "at 3 pm renew my netflix subscription" or "remind me at 15:30 team meeting"
  const clockMatch = text.match(/^(?:remind\s+(?:me\s+)?(?:to\s+)?)?at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s+(?:to\s+)?(.+)$/i);
  if (clockMatch) {
    let hours = parseInt(clockMatch[1], 10);
    const minutes = clockMatch[2] ? parseInt(clockMatch[2], 10) : 0;
    const meridian = clockMatch[3] ? clockMatch[3].toLowerCase() : null;
    const reminderText = clockMatch[4].trim();

    if (meridian === 'pm' && hours < 12) hours += 12;
    if (meridian === 'am' && hours === 12) hours = 0;

    const targetTime = new Date(now.getTime());
    targetTime.setHours(hours, minutes, 0, 0);

    // If time has already passed today, schedule for tomorrow
    if (targetTime.getTime() <= now.getTime()) {
      targetTime.setDate(targetTime.getDate() + 1);
    }

    return {
      reminderText,
      remindAt: targetTime.toISOString()
    };
  }

  // Pattern 4: "remind me to <action> at <time>"
  // e.g., "remind me to renew my netflix subscription at 3 pm"
  const trailingClockMatch = text.match(/^(?:remind\s+(?:me\s+)?(?:to\s+)?)(.+?)\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (trailingClockMatch) {
    const reminderText = trailingClockMatch[1].trim();
    let hours = parseInt(trailingClockMatch[2], 10);
    const minutes = trailingClockMatch[3] ? parseInt(trailingClockMatch[3], 10) : 0;
    const meridian = trailingClockMatch[4] ? trailingClockMatch[4].toLowerCase() : null;

    if (meridian === 'pm' && hours < 12) hours += 12;
    if (meridian === 'am' && hours === 12) hours = 0;

    const targetTime = new Date(now.getTime());
    targetTime.setHours(hours, minutes, 0, 0);

    if (targetTime.getTime() <= now.getTime()) {
      targetTime.setDate(targetTime.getDate() + 1);
    }

    return {
      reminderText,
      remindAt: targetTime.toISOString()
    };
  }

  return null;
}
