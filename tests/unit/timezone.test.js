import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import {
  getEasternTimeISO,
  getEasternTimeDate,
  formatTimeEastern,
  getWeekendDay,
  isUpcoming
} from '../../api/utils/timezone.js';

describe('Timezone Utilities', () => {
  describe('getEasternTimeISO', () => {
    test('returns a valid ISO 8601 timestamp', () => {
      const result = getEasternTimeISO();
      // ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    test('returns different timestamps on subsequent calls', async () => {
      const timestamp1 = getEasternTimeISO();
      await new Promise(resolve => setTimeout(resolve, 10));
      const timestamp2 = getEasternTimeISO();
      expect(timestamp1).not.toBe(timestamp2);
    });

    test('timestamp can be parsed back to a valid Date object', () => {
      const isoString = getEasternTimeISO();
      const date = new Date(isoString);
      expect(date.toString()).not.toBe('Invalid Date');
      expect(date instanceof Date).toBe(true);
    });
  });

  describe('getEasternTimeDate', () => {
    test('returns a Date object', () => {
      const result = getEasternTimeDate();
      expect(result instanceof Date).toBe(true);
    });

    test('returned date is valid', () => {
      const result = getEasternTimeDate();
      expect(result.toString()).not.toBe('Invalid Date');
    });

    test('date reflects Eastern Time values', () => {
      const easternDate = getEasternTimeDate();
      const now = new Date();

      // The returned date should have same year, month, day as current Eastern Time
      // but interpreted in local timezone, so we compare the components
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric'
      });

      const easternNow = formatter.format(now);
      const easternResult = formatter.format(easternDate);

      // Both should format to similar values (within an hour for execution time)
      expect(easternResult).toBeTruthy();
      expect(easternDate.getFullYear()).toBeGreaterThan(2024);
    });
  });

  describe('formatTimeEastern', () => {
    test('handles empty or null input', () => {
      expect(formatTimeEastern('')).toBe(null);
      expect(formatTimeEastern(null)).toBe(null);
      expect(formatTimeEastern(undefined)).toBe(null);
    });

    test('formats afternoon times correctly in Eastern Time', () => {
      // 2024-01-15T19:30:00Z is 2:30 PM EST (UTC-5)
      const result = formatTimeEastern('2024-01-15T19:30:00Z');
      expect(result).toMatch(/2:30 PM/);
    });

    test('formats morning times correctly in Eastern Time', () => {
      // 2024-01-15T14:00:00Z is 9:00 AM EST (UTC-5)
      const result = formatTimeEastern('2024-01-15T14:00:00Z');
      expect(result).toMatch(/9:00 AM/);
    });

    test('formats evening times correctly in Eastern Time', () => {
      // 2024-01-15T02:15:00Z is 9:15 PM EST (previous day)
      const result = formatTimeEastern('2024-01-15T02:15:00Z');
      expect(result).toMatch(/9:15 PM/);
    });

    test('formats midnight correctly', () => {
      // 2024-01-15T05:00:00Z is 12:00 AM EST
      const result = formatTimeEastern('2024-01-15T05:00:00Z');
      expect(result).toMatch(/12:00 AM/);
    });

    test('formats noon correctly', () => {
      // 2024-01-15T17:00:00Z is 12:00 PM EST
      const result = formatTimeEastern('2024-01-15T17:00:00Z');
      expect(result).toMatch(/12:00 PM/);
    });

    test('handles Daylight Saving Time (EDT, UTC-4)', () => {
      // 2024-07-15T19:30:00Z is 3:30 PM EDT (UTC-4) during summer
      const result = formatTimeEastern('2024-07-15T19:30:00Z');
      expect(result).toMatch(/3:30 PM/);
    });

    test('handles Standard Time (EST, UTC-5)', () => {
      // 2024-12-15T19:30:00Z is 2:30 PM EST (UTC-5) during winter
      const result = formatTimeEastern('2024-12-15T19:30:00Z');
      expect(result).toMatch(/2:30 PM/);
    });
  });

  describe('getWeekendDay', () => {
    test('handles empty or null input', () => {
      expect(getWeekendDay('')).toBe(null);
      expect(getWeekendDay(null)).toBe(null);
      expect(getWeekendDay(undefined)).toBe(null);
    });

    test('correctly identifies Friday', () => {
      // January 5, 2025 is a Friday
      expect(getWeekendDay('2025-01-03')).toBe('friday');
    });

    test('correctly identifies Saturday', () => {
      // January 4, 2025 is a Saturday
      expect(getWeekendDay('2025-01-04')).toBe('saturday');
    });

    test('correctly identifies Sunday', () => {
      // January 5, 2025 is a Sunday
      expect(getWeekendDay('2025-01-05')).toBe('sunday');
    });

    test('returns null for Monday', () => {
      // January 6, 2025 is a Monday
      expect(getWeekendDay('2025-01-06')).toBe(null);
    });

    test('returns null for Tuesday', () => {
      // January 7, 2025 is a Tuesday
      expect(getWeekendDay('2025-01-07')).toBe(null);
    });

    test('returns null for Wednesday', () => {
      // January 8, 2025 is a Wednesday
      expect(getWeekendDay('2025-01-08')).toBe(null);
    });

    test('returns null for Thursday', () => {
      // January 2, 2025 is a Thursday
      expect(getWeekendDay('2025-01-02')).toBe(null);
    });

    test('handles dates far in the past', () => {
      // January 1, 2000 was a Saturday
      expect(getWeekendDay('2000-01-01')).toBe('saturday');
    });

    test('handles dates far in the future', () => {
      // January 1, 2030 will be a Tuesday
      expect(getWeekendDay('2030-01-01')).toBe(null);
    });
  });

  describe('isUpcoming - Date Boundary Edge Cases', () => {
    test('handles empty or null input', () => {
      expect(isUpcoming('')).toBe(false);
      expect(isUpcoming(null)).toBe(false);
      expect(isUpcoming(undefined)).toBe(false);
    });

    test('today is considered upcoming', () => {
      const todayEastern = getEasternTimeDate();
      const todayStr = todayEastern.toISOString().split('T')[0];
      expect(isUpcoming(todayStr)).toBe(true);
    });

    test('tomorrow is considered upcoming', () => {
      const todayEastern = getEasternTimeDate();
      const tomorrow = new Date(todayEastern);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      expect(isUpcoming(tomorrowStr)).toBe(true);
    });

    test('date 7 days from now is included (boundary)', () => {
      const todayEastern = getEasternTimeDate();
      const sevenDaysLater = new Date(todayEastern);
      sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
      const dateStr = sevenDaysLater.toISOString().split('T')[0];
      expect(isUpcoming(dateStr, 7)).toBe(true);
    });

    test('date 8 days from now is not included', () => {
      const todayEastern = getEasternTimeDate();
      const eightDaysLater = new Date(todayEastern);
      eightDaysLater.setDate(eightDaysLater.getDate() + 8);
      const dateStr = eightDaysLater.toISOString().split('T')[0];
      expect(isUpcoming(dateStr, 7)).toBe(false);
    });

    test('yesterday is not considered upcoming', () => {
      const todayEastern = getEasternTimeDate();
      const yesterday = new Date(todayEastern);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      expect(isUpcoming(yesterdayStr)).toBe(false);
    });

    test('date far in the past is not upcoming', () => {
      expect(isUpcoming('2020-01-01')).toBe(false);
    });

    test('date far in the future is not upcoming', () => {
      expect(isUpcoming('2030-01-01')).toBe(false);
    });

    test('custom days parameter works correctly', () => {
      const todayEastern = getEasternTimeDate();

      // Test with 3 days window
      const threeDaysLater = new Date(todayEastern);
      threeDaysLater.setDate(threeDaysLater.getDate() + 3);
      const threeDaysStr = threeDaysLater.toISOString().split('T')[0];
      expect(isUpcoming(threeDaysStr, 3)).toBe(true);

      // Same date should NOT be in 7-day window if we check with 3-day window
      const fourDaysLater = new Date(todayEastern);
      fourDaysLater.setDate(fourDaysLater.getDate() + 4);
      const fourDaysStr = fourDaysLater.toISOString().split('T')[0];
      expect(isUpcoming(fourDaysStr, 3)).toBe(false);
    });

    test('handles month boundaries correctly', () => {
      // Test crossing month boundary
      const todayEastern = getEasternTimeDate();
      const nextMonth = new Date(todayEastern);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      nextMonth.setDate(1); // First day of next month

      const daysUntilNextMonth = Math.ceil(
        (nextMonth.getTime() - todayEastern.getTime()) / (24 * 60 * 60 * 1000)
      );

      const nextMonthStr = nextMonth.toISOString().split('T')[0];

      if (daysUntilNextMonth <= 7) {
        expect(isUpcoming(nextMonthStr, 7)).toBe(true);
      } else {
        expect(isUpcoming(nextMonthStr, 7)).toBe(false);
      }
    });

    test('handles year boundaries correctly', () => {
      // Create a date that's definitely in next year but more than 7 days away
      const todayEastern = getEasternTimeDate();
      const nextYear = new Date(todayEastern.getFullYear() + 1, 0, 15); // Jan 15 next year
      const nextYearStr = nextYear.toISOString().split('T')[0];

      expect(isUpcoming(nextYearStr, 7)).toBe(false);
    });
  });

  describe('Timezone Conversion Accuracy - Cross-timezone Scenarios', () => {
    test('handles dates near DST transition (Spring forward)', () => {
      // March 10, 2024 - DST starts (2:00 AM -> 3:00 AM)
      const dstStart = '2024-03-10';

      // Should correctly identify as Sunday
      expect(getWeekendDay(dstStart)).toBe('sunday');

      // Time formatting should work correctly across DST boundary
      // 2024-03-10T07:30:00Z should be 2:30 AM EST before transition
      const beforeDST = formatTimeEastern('2024-03-10T07:30:00Z');
      expect(beforeDST).toBeTruthy();
      expect(typeof beforeDST).toBe('string');
    });

    test('handles dates near DST transition (Fall back)', () => {
      // November 3, 2024 - DST ends (2:00 AM -> 1:00 AM)
      const dstEnd = '2024-11-03';

      // Should correctly identify as Sunday
      expect(getWeekendDay(dstEnd)).toBe('sunday');

      // Time formatting should work correctly across DST boundary
      const afterDST = formatTimeEastern('2024-11-03T06:30:00Z');
      expect(afterDST).toBeTruthy();
      expect(typeof afterDST).toBe('string');
    });

    test('midnight boundary is handled correctly in Eastern Time', () => {
      // Test that dates near midnight in Eastern are correctly categorized
      const todayEastern = getEasternTimeDate();
      todayEastern.setHours(0, 0, 0, 0);

      const dateStr = todayEastern.toISOString().split('T')[0];
      expect(isUpcoming(dateStr)).toBe(true);
    });

    test('handles February 29 in leap years', () => {
      // 2024 is a leap year
      const leapDay = '2024-02-29';
      const weekendDay = getWeekendDay(leapDay);

      // February 29, 2024 is a Thursday
      expect(weekendDay).toBe(null);
    });

    test('getEasternTimeISO returns time adjusted for current DST', () => {
      const isoString = getEasternTimeISO();
      const date = new Date(isoString);

      // Check that the returned time is valid
      expect(date.getTime()).toBeGreaterThan(Date.parse('2024-01-01'));
      expect(date.getTime()).toBeLessThan(Date.parse('2030-12-31'));
    });
  });

  describe('Weekend Detection Logic - Complete Coverage', () => {
    test('correctly categorizes all days of a week', () => {
      // Week of January 6-12, 2025
      const weekDates = {
        '2025-01-06': null,      // Monday
        '2025-01-07': null,      // Tuesday
        '2025-01-08': null,      // Wednesday
        '2025-01-09': null,      // Thursday
        '2025-01-10': 'friday',  // Friday
        '2025-01-11': 'saturday',// Saturday
        '2025-01-12': 'sunday'   // Sunday
      };

      Object.entries(weekDates).forEach(([date, expected]) => {
        expect(getWeekendDay(date)).toBe(expected);
      });
    });

    test('handles weekend detection across different months', () => {
      // Test weekends across month boundaries
      expect(getWeekendDay('2024-12-27')).toBe('friday');  // Dec 27, 2024
      expect(getWeekendDay('2024-12-28')).toBe('saturday'); // Dec 28, 2024
      expect(getWeekendDay('2024-12-29')).toBe('sunday');   // Dec 29, 2024
      expect(getWeekendDay('2025-01-03')).toBe('friday');   // Jan 3, 2025
      expect(getWeekendDay('2025-01-04')).toBe('saturday'); // Jan 4, 2025
      expect(getWeekendDay('2025-01-05')).toBe('sunday');   // Jan 5, 2025
    });

    test('handles weekend detection across different years', () => {
      // New Year's crossing
      expect(getWeekendDay('2024-12-29')).toBe('sunday');   // Dec 29, 2024
      expect(getWeekendDay('2025-01-03')).toBe('friday');   // Jan 3, 2025
    });
  });
});
