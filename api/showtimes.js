// api/showtimes.js
// ElevenLabs Client Tool endpoint
import { Redis } from '@upstash/redis';

export default async function handler(req, res) {
  // Enable CORS for ElevenLabs
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Initialize Upstash Redis
    const redis = new Redis({
      url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    // Get query parameters
    const { 
      date, 
      movie_title, 
      day_type,  // 'weekend', 'today', 'tomorrow'
      time_preference // 'evening', 'afternoon', 'night'
    } = req.method === 'GET' ? req.query : req.body;

    // Fetch cached data (with development fallback)
    let cachedData, lastUpdated;

    try {
      cachedData = await redis.get('showtimes:current');
      lastUpdated = await redis.get('showtimes:last_updated');
    } catch (error) {
      console.log('Redis error:', error.message);
      // Development fallback with mock data
      if (process.env.VERCEL_ENV !== 'production') {
        console.log('Using mock data for development');
        cachedData = getDevelopmentMockData();
        lastUpdated = new Date().toISOString();
      } else {
        throw error; // Re-throw in production
      }
    }

    if (!cachedData) {
      return res.status(503).json({
        error: 'Showtime data unavailable. Please try again in a few minutes.'
      });
    }

    const showtimes = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
    let results = [];

    // Handle different query types
    if (day_type === 'weekend') {
      results = getWeekendShowtimes(showtimes);
    } else if (day_type === 'today') {
      const today = new Date().toISOString().split('T')[0];
      results = getShowtimesByDate(showtimes, today);
    } else if (day_type === 'tomorrow') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      results = getShowtimesByDate(showtimes, tomorrowStr);
    } else if (date) {
      results = getShowtimesByDate(showtimes, date);
    } else if (movie_title) {
      results = getShowtimesByMovie(showtimes, movie_title);
    } else {
      // Default: next 3 days
      results = getUpcomingShowtimes(showtimes, 3);
    }

    // Apply time preference filter
    if (time_preference) {
      results = filterByTimePreference(results, time_preference);
    }

    // Format for ElevenLabs (clean, readable)
    const formatted = formatForVoiceAgent(results);

    // Generate a conversational summary for voice response
    const conversationalSummary = generateConversationalSummary(formatted, {
      date,
      movie_title,
      day_type,
      time_preference
    });

    return res.status(200).json({
      success: true,
      data: formatted,
      conversational_summary: conversationalSummary,
      last_updated: lastUpdated,
      query_info: {
        date,
        movie_title,
        day_type,
        time_preference,
        results_count: formatted.length
      }
    });

  } catch (error) {
    console.error('Query error:', error);
    return res.status(500).json({ error: 'Failed to fetch showtimes' });
  }
}

// Helper functions
function getWeekendShowtimes(showtimes) {
  const weekend = showtimes.weekend;
  return [
    ...weekend.friday,
    ...weekend.saturday,
    ...weekend.sunday
  ];
}

function getShowtimesByDate(showtimes, date) {
  return showtimes.by_date[date] || [];
}

function getShowtimesByMovie(showtimes, movieTitle) {
  const movie = showtimes.movies.find(m => 
    m.title.toLowerCase().includes(movieTitle.toLowerCase())
  );
  return movie ? [movie] : [];
}

function getUpcomingShowtimes(showtimes, days = 3) {
  const results = [];
  const today = new Date();
  
  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    
    const dayShowtimes = showtimes.by_date[dateStr] || [];
    results.push(...dayShowtimes);
  }
  
  return results;
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

function formatForVoiceAgent(results) {
  // Format data to be easily spoken by voice agent
  return results.map(item => {
    const movie = item.title || item.movie_title;
    const showtime = item.showtime || item.showtimes?.[0];

    return {
      movie_title: movie,
      date: showtime?.date,
      time: formatTimeForVoice(showtime?.time),
      theater: showtime?.theater,
      rating: item.rating,
      runtime: item.runtime,
      special_format: getSpecialFormat(showtime),
      // Human-readable summary for voice
      summary: generateShowtimeSummary(movie, showtime)
    };
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

function generateConversationalSummary(results, queryParams) {
  const { date, movie_title, day_type, time_preference } = queryParams;
  const count = results.length;

  if (count === 0) {
    if (movie_title) {
      return `I couldn't find any showtimes for "${movie_title}". Would you like me to search for a different movie or show you what's currently playing?`;
    } else if (date) {
      return `I don't see any showtimes for ${formatDateForVoice(date)}. Would you like to check a different date?`;
    } else if (day_type) {
      const dayText = day_type === 'today' ? 'today' : day_type === 'tomorrow' ? 'tomorrow' : 'this weekend';
      return `I don't have any showtimes available for ${dayText}. Let me know if you'd like to check different dates.`;
    }
    return "I don't see any showtimes matching your request. Would you like me to show you what's currently playing?";
  }

  let summary = `I found ${count} showtime${count > 1 ? 's' : ''}`;

  // Add context based on search parameters
  if (movie_title) {
    const movieName = results[0]?.movie_title;
    summary += ` for ${movieName}`;
  } else if (day_type === 'today') {
    summary += ' for today';
  } else if (day_type === 'tomorrow') {
    summary += ' for tomorrow';
  } else if (day_type === 'weekend') {
    summary += ' for this weekend';
  } else if (date) {
    summary += ` for ${formatDateForVoice(date)}`;
  }

  if (time_preference) {
    const timeText = time_preference === 'afternoon' ? 'afternoon' :
                    time_preference === 'evening' ? 'evening' : 'night';
    summary += ` in the ${timeText}`;
  }

  summary += '.';

  // Add first result as example
  if (count === 1) {
    summary += ` ${results[0].summary}`;
  } else if (count <= 3) {
    summary += ` Here are your options: ${results.map(r => r.summary).join('. ')}`;
  } else {
    summary += ` Here are the first few: ${results.slice(0, 2).map(r => r.summary).join('. ')}`;
    summary += ` And ${count - 2} more showtimes available.`;
  }

  return summary;
}

function getSpecialFormat(showtime) {
  const formats = [];
  if (showtime?.is_3d) formats.push('3D');
  if (showtime?.is_imax) formats.push('IMAX');
  return formats.join(', ') || null;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });
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

function getDevelopmentMockData() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const todayStr = today.toISOString().split('T')[0];
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  return {
    movies: [
      {
        id: 1,
        title: "The Substance",
        duration: 140,
        rating: "R",
        description: "A fading celebrity decides to use a black market drug...",
        showtimes: [
          { date: todayStr, time: "2:00 PM", theater: "O Cinema South Beach" },
          { date: todayStr, time: "7:30 PM", theater: "O Cinema South Beach" },
          { date: tomorrowStr, time: "4:15 PM", theater: "O Cinema South Beach" }
        ]
      },
      {
        id: 2,
        title: "Anora",
        duration: 139,
        rating: "R",
        description: "A young sex worker from Brooklyn gets her chance at a Cinderella story...",
        showtimes: [
          { date: todayStr, time: "5:00 PM", theater: "O Cinema South Beach" },
          { date: tomorrowStr, time: "7:45 PM", theater: "O Cinema South Beach" }
        ]
      }
    ],
    by_date: {
      [todayStr]: [
        { title: "The Substance", showtime: { date: todayStr, time: "2:00 PM", theater: "O Cinema South Beach" }, rating: "R" },
        { title: "Anora", showtime: { date: todayStr, time: "5:00 PM", theater: "O Cinema South Beach" }, rating: "R" },
        { title: "The Substance", showtime: { date: todayStr, time: "7:30 PM", theater: "O Cinema South Beach" }, rating: "R" }
      ],
      [tomorrowStr]: [
        { title: "The Substance", showtime: { date: tomorrowStr, time: "4:15 PM", theater: "O Cinema South Beach" }, rating: "R" },
        { title: "Anora", showtime: { date: tomorrowStr, time: "7:45 PM", theater: "O Cinema South Beach" }, rating: "R" }
      ]
    },
    weekend: { friday: [], saturday: [], sunday: [] },
    upcoming: [
      { title: "The Substance", showtime: { date: todayStr, time: "2:00 PM", theater: "O Cinema South Beach" }, rating: "R" },
      { title: "Anora", showtime: { date: todayStr, time: "5:00 PM", theater: "O Cinema South Beach" }, rating: "R" }
    ],
    total_showtimes: 5
  };
}