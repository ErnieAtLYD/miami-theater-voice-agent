import { describe, test, expect } from '@jest/globals';

// Helper functions extracted for testing
function formatTimeForVoice(timeStr) {
  if (!timeStr) return '';

  // Convert 24-hour format to more natural speech format
  const [hours, minutes] = timeStr.split(':');
  const hour = parseInt(hours);
  const min = minutes;

  if (min === '00') {
    // Just say the hour for times like "2:00 PM"
    if (hour === 12) return '12 PM';
    if (hour === 0) return '12 AM';
    if (hour > 12) return `${hour - 12} PM`;
    return `${hour} AM`;
  } else {
    // Include minutes for times like "2:30 PM"
    if (hour === 12) return `12:${min} PM`;
    if (hour === 0) return `12:${min} AM`;
    if (hour > 12) return `${hour - 12}:${min} PM`;
    return `${hour}:${min} AM`;
  }
}

function formatDateForVoice(dateStr) {
  if (!dateStr) return '';

  const date = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Check if it's today or tomorrow
  const isToday = dateStr === today.toISOString().split('T')[0];
  const isTomorrow = dateStr === tomorrow.toISOString().split('T')[0];

  if (isToday) return 'today';
  if (isTomorrow) return 'tomorrow';

  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });
}

function filterByTimePreference(results, preference) {
  return results.filter(item => {
    const time = item.showtime?.time || item.showtimes?.[0]?.time;
    if (!time) return true;

    const hour = parseInt(time.split(':')[0]);

    switch (preference) {
      case 'afternoon':
        return hour >= 12 && hour < 17;
      case 'evening':
        return hour >= 17 && hour < 21;
      case 'night':
        return hour >= 21;
      default:
        return true;
    }
  });
}

function generateShowtimeSummary(movie, showtime) {
  const dateStr = formatDateForVoice(showtime?.date);
  const timeStr = formatTimeForVoice(showtime?.time);
  const theater = showtime?.theater;

  let summary = `${movie} is showing`;
  if (dateStr) summary += ` on ${dateStr}`;
  if (timeStr) summary += ` at ${timeStr}`;
  if (theater) summary += ` at ${theater}`;

  return summary;
}

describe('Helper Functions', () => {
  describe('formatTimeForVoice', () => {
    test('handles empty input', () => {
      expect(formatTimeForVoice('')).toBe('');
      expect(formatTimeForVoice(null)).toBe('');
      expect(formatTimeForVoice(undefined)).toBe('');
    });

    test('formats hour-only times correctly', () => {
      expect(formatTimeForVoice('9:00')).toBe('9 AM');
      expect(formatTimeForVoice('12:00')).toBe('12 PM');
      expect(formatTimeForVoice('0:00')).toBe('12 AM');
      expect(formatTimeForVoice('15:00')).toBe('3 PM');
      expect(formatTimeForVoice('21:00')).toBe('9 PM');
    });

    test('formats times with minutes correctly', () => {
      expect(formatTimeForVoice('9:30')).toBe('9:30 AM');
      expect(formatTimeForVoice('12:15')).toBe('12:15 PM');
      expect(formatTimeForVoice('0:45')).toBe('12:45 AM');
      expect(formatTimeForVoice('15:30')).toBe('3:30 PM');
      expect(formatTimeForVoice('21:45')).toBe('9:45 PM');
    });
  });

  describe('formatDateForVoice', () => {
    test('handles empty input', () => {
      expect(formatDateForVoice('')).toBe('');
      expect(formatDateForVoice(null)).toBe('');
      expect(formatDateForVoice(undefined)).toBe('');
    });

    test('identifies today and tomorrow', () => {
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      expect(formatDateForVoice(today)).toBe('today');
      expect(formatDateForVoice(tomorrowStr)).toBe('tomorrow');
    });

    test('formats other dates with day name', () => {
      const futureDate = '2024-12-25';
      const result = formatDateForVoice(futureDate);
      expect(result).toMatch(/\w+day, \w+ \d+/); // e.g., "Wednesday, December 25"
    });
  });

  describe('filterByTimePreference', () => {
    const mockResults = [
      { showtime: { time: '10:00' } }, // 10 AM
      { showtime: { time: '14:00' } }, // 2 PM
      { showtime: { time: '19:00' } }, // 7 PM
      { showtime: { time: '22:00' } }, // 10 PM
    ];

    test('filters afternoon showtimes', () => {
      const filtered = filterByTimePreference(mockResults, 'afternoon');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].showtime.time).toBe('14:00');
    });

    test('filters evening showtimes', () => {
      const filtered = filterByTimePreference(mockResults, 'evening');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].showtime.time).toBe('19:00');
    });

    test('filters night showtimes', () => {
      const filtered = filterByTimePreference(mockResults, 'night');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].showtime.time).toBe('22:00');
    });

    test('returns all results for unknown preference', () => {
      const filtered = filterByTimePreference(mockResults, 'unknown');
      expect(filtered).toHaveLength(4);
    });

    test('handles missing time data gracefully', () => {
      const resultsWithMissingTime = [
        { showtime: { time: '14:00' } },
        { showtime: {} }, // no time
        { }, // no showtime
      ];

      const filtered = filterByTimePreference(resultsWithMissingTime, 'afternoon');
      expect(filtered).toHaveLength(3); // all included, time-less items default to true
    });
  });

  describe('generateShowtimeSummary', () => {
    test('generates complete summary with all data', () => {
      const movie = "The Substance";
      const showtime = {
        date: new Date().toISOString().split('T')[0], // today
        time: '19:30',
        theater: 'O Cinema South Beach'
      };

      const summary = generateShowtimeSummary(movie, showtime);
      expect(summary).toBe('The Substance is showing on today at 7:30 PM at O Cinema South Beach');
    });

    test('handles missing showtime data', () => {
      const summary = generateShowtimeSummary("Test Movie", null);
      expect(summary).toBe('Test Movie is showing');
    });

    test('handles partial showtime data', () => {
      const movie = "Test Movie";
      const showtime = { time: '19:00' };

      const summary = generateShowtimeSummary(movie, showtime);
      expect(summary).toBe('Test Movie is showing at 7 PM');
    });
  });
});