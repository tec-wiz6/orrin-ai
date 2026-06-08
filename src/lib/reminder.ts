export interface Reminder {
  id: string;
  text: string;
  time: number; // unix ms
  fired: boolean;
  createdAt: number;
  rawInput: string;
}

const REMINDERS_KEY = "orrin_reminders";

export function loadReminders(): Reminder[] {
  try {
    const raw = localStorage.getItem(REMINDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveReminders(reminders: Reminder[]) {
  try {
    localStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders));
  } catch { console.warn("Storage full"); }
}

export function addReminder(reminder: Reminder) {
  const reminders = loadReminders();
  reminders.push(reminder);
  saveReminders(reminders);
}

export function markFired(id: string) {
  const reminders = loadReminders();
  const updated = reminders.map(r => r.id === id ? { ...r, fired: true } : r);
  saveReminders(updated);
}

export function deleteReminder(id: string) {
  const reminders = loadReminders();
  saveReminders(reminders.filter(r => r.id !== id));
}

export function clearFiredReminders() {
  const reminders = loadReminders();
  saveReminders(reminders.filter(r => !r.fired));
}

export function parseReminderTime(text: string): number | null {
  const now = new Date();
  const lower = text.toLowerCase();

  // "at 2pm", "at 14:00", "at 2:30pm"
  const timeMatch = lower.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2] || "0");
    const meridiem = timeMatch[3];

    if (meridiem === "pm" && hours !== 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;

    const target = new Date();
    target.setHours(hours, minutes, 0, 0);

    // If time has passed today, schedule for tomorrow
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }

    return target.getTime();
  }

  // "in 30 minutes", "in 2 hours"
  const inMatch = lower.match(/in\s+(\d+)\s*(minute|min|hour|hr|second|sec)/);
  if (inMatch) {
    const amount = parseInt(inMatch[1]);
    const unit = inMatch[2];
    let ms = 0;
    if (unit.startsWith("sec")) ms = amount * 1000;
    else if (unit.startsWith("min")) ms = amount * 60 * 1000;
    else if (unit.startsWith("hour") || unit.startsWith("hr")) ms = amount * 60 * 60 * 1000;
    return now.getTime() + ms;
  }

  // "tomorrow at 9am"
  if (lower.includes("tomorrow")) {
    const tomorrowMatch = lower.match(/tomorrow.*?at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (tomorrowMatch) {
      let hours = parseInt(tomorrowMatch[1]);
      const minutes = parseInt(tomorrowMatch[2] || "0");
      const meridiem = tomorrowMatch[3];
      if (meridiem === "pm" && hours !== 12) hours += 12;
      if (meridiem === "am" && hours === 12) hours = 0;
      const target = new Date();
      target.setDate(target.getDate() + 1);
      target.setHours(hours, minutes, 0, 0);
      return target.getTime();
    }
  }

  return null;
}
