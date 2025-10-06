// api/utils/timezone.js
// Timezone utilities for handling Eastern Time (America/New_York)
// All dates and times in this application use Miami's timezone

/**
 * Gets the current time in Eastern Time as an ISO string
 * @returns {string} ISO 8601 formatted timestamp in Eastern Time
 */
export function getEasternTimeISO() {
  const now = new Date();
  // Use Intl.DateTimeFormat to get individual components in Eastern Time
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(now);
  const get = (type) => parts.find(p => p.type === type).value;

  // Construct ISO string from Eastern Time components
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
}

/**
 * Gets a Date object representing "now" in Eastern Time
 * @returns {Date} Date object adjusted to Eastern Time
 */
export function getEasternTimeDate() {
  const now = new Date();
  // Get Eastern Time components
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(now);
  const get = (type) => parts.find(p => p.type === type).value;

  // Create a new Date object with Eastern Time values
  // Note: This creates a Date in local timezone with the values from Eastern Time
  return new Date(
    parseInt(get('year')),
    parseInt(get('month')) - 1, // months are 0-indexed
    parseInt(get('day')),
    parseInt(get('hour')),
    parseInt(get('minute')),
    parseInt(get('second'))
  );
}

/**
 * Formats a datetime string to human-readable time in Eastern Time
 * @param {string} dateTimeString - ISO datetime string
 * @returns {string|null} Formatted time (e.g., "7:30 PM") or null if invalid
 */
export function formatTimeEastern(dateTimeString) {
  if (!dateTimeString) return null;
  const date = new Date(dateTimeString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York'  // Force Eastern Time
  });
}

/**
 * Checks if a date string represents a weekend day (Friday, Saturday, or Sunday)
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {string|null} 'friday', 'saturday', 'sunday', or null if not a weekend
 */
export function getWeekendDay(dateString) {
  if (!dateString) return null;

  // Parse date string as local date (not UTC) to avoid timezone shift
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0); // noon to avoid DST issues

  const dayOfWeek = date.toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'America/New_York'
  }).toLowerCase();

  return ['friday', 'saturday', 'sunday'].includes(dayOfWeek) ? dayOfWeek : null;
}

/**
 * Checks if a showtime falls within the next N days from Eastern Time "today"
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @param {number} days - Number of days to look ahead (default: 7)
 * @returns {boolean} True if the date is within the range
 */
export function isUpcoming(dateString, days = 7) {
  if (!dateString) return false;

  const today = getEasternTimeDate();
  today.setHours(0, 0, 0, 0); // Start of day

  const nextWeek = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);

  // Parse date string as local date (not UTC) to avoid timezone shift
  const [year, month, day] = dateString.split('-').map(Number);
  const showDate = new Date(year, month - 1, day, 0, 0, 0);

  return showDate >= today && showDate <= nextWeek;
}
