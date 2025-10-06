// api/cron/ingest-showtimes.js
// This runs every 30 minutes via Vercel Cron
import { Redis } from '@upstash/redis';
import { getEasternTimeISO, formatTimeEastern, getEasternTimeDate, getWeekendDay, isUpcoming } from '../utils/timezone.js';

export default async function handler(req, res) {
  // Verify this is a cron request (security)
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('Starting showtime ingestion...');
    
    // Initialize Upstash Redis
    const redis = new Redis({
      url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    
    // Build Agile WebSales Feed URL for O Cinema (prod3 domain)
    const agileUrl = `https://prod3.agileticketing.net/websales/feed.ashx?guid=${process.env.AGILE_GUID}&showslist=true&format=json&v=latest`;
    
    console.log('Fetching from Agile URL:', agileUrl);
    const agileResponse = await fetch(agileUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Miami-Theater-Voice-Agent/1.0'
      }
    });

    if (!agileResponse.ok) {
      throw new Error(`Agile API error: ${agileResponse.status} - ${agileResponse.statusText}`);
    }

    const contentType = agileResponse.headers.get('content-type');
    console.log('Response content-type:', contentType);

    const rawData = await agileResponse.json();
    
    // Transform the data for easy querying
    const processedData = processAgileShowtimeData(rawData);
    
    // Cache in Upstash Redis with 2-hour TTL (safety buffer)
    await redis.setex('showtimes:current', 7200, JSON.stringify(processedData));
    await redis.setex('showtimes:last_updated', 7200, getEasternTimeISO());
    
    console.log(`Successfully cached ${processedData.movies.length} movies with ${processedData.total_showtimes} showtimes`);
    
    return res.status(200).json({
      success: true,
      movies_count: processedData.movies.length,
      total_showtimes: processedData.total_showtimes,
      last_updated: getEasternTimeISO(),
      agile_last_updated: rawData.LastUpdated
    });
    
  } catch (error) {
    console.error('Ingestion error:', error);
    return res.status(500).json({ error: error.message });
  }
}

function processAgileShowtimeData(rawData) {
  // Process O Cinema's specific JSON format
  const shows = rawData.ArrayOfShows || [];
  
  const movies = shows.map(show => {
    const showtimes = (show.CurrentShowings || []).map(showing => ({
      id: showing.ID,
      date: showing.StartDate?.split('T')[0], // Extract date part
      time: formatTimeEastern(showing.StartDate), // Extract and format time
      end_time: formatTimeEastern(showing.EndDate),
      duration: showing.Duration,
      venue: showing.Venue?.Name || 'O Cinema South Beach',
      venue_address: showing.Venue ? 
        `${showing.Venue.Address1}, ${showing.Venue.City}, ${showing.Venue.State} ${showing.Venue.Zip}` : 
        '1130 Washington Ave, Miami Beach, FL 33139',
      sales_state: showing.SalesState,
      buy_link: showing.LegacyPurchaseLink,
      content_delivery: showing.ContentDelivery,
      // Additional O Cinema specific fields
      date_tbd: showing.DateTBD,
      type: showing.Type
    }));

    return {
      id: show.ID,
      external_id: show.ExternalID,
      title: show.Name,
      folder: show.Folder,
      duration: parseInt(show.Duration),
      type: show.Type,
      distributor: show.Distributor,
      rating: extractRatingFromDescription(show.ShortDescription), // O Cinema doesn't have separate rating field
      description: show.ShortDescription,
      image: show.EventImage,
      thumb_image: show.ThumbImage,
      info_link: show.InfoLink,
      streaming_enabled: show.StreamingEnabled,
      streaming_type: show.StreamingType,
      showtimes: showtimes
    };
  });

  // Group by common queries for fast lookups
  const byDate = {};
  const byWeekend = { friday: [], saturday: [], sunday: [] };
  const upcoming = [];
  let totalShowtimes = 0;

  movies.forEach(movie => {
    movie.showtimes.forEach(showtime => {
      totalShowtimes++;
      const date = showtime.date;
      if (!date) return; // Skip if no date

      // Create movie+showtime combo for easy rendering
      const movieWithShowtime = {
        ...movie,
        showtime: showtime
      };

      // Group by date
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push(movieWithShowtime);

      // Group weekend shows (Friday, Saturday, Sunday) using Eastern Time
      const weekendDay = getWeekendDay(date);
      if (weekendDay) {
        byWeekend[weekendDay].push(movieWithShowtime);
      }

      // Upcoming shows (next 7 days) using Eastern Time
      if (isUpcoming(date, 7)) {
        upcoming.push(movieWithShowtime);
      }
    });
  });

  return {
    movies,
    by_date: byDate,
    weekend: byWeekend,
    upcoming: upcoming,
    total_showtimes: totalShowtimes,
    last_updated: getEasternTimeISO(),
    agile_last_updated: rawData.LastUpdated,
    source: rawData.SourceLink,
    venue_info: {
      name: "O Cinema South Beach",
      address: "1130 Washington Ave, Miami Beach, FL 33139",
      corp_org: "O Cinema"
    }
  };
}

// Helper functions for O Cinema data processing
function extractRatingFromDescription(description) {
  // O Cinema descriptions don't have standard ratings, so we'll extract if present
  // or default to 'NR' for independent films
  const ratingMatch = description?.match(/\b(G|PG|PG-13|R|NC-17|NR|Unrated)\b/i);
  return ratingMatch ? ratingMatch[1] : 'NR';
}