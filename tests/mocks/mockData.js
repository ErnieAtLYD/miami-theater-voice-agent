// Mock data for testing
export function getMockShowtimesData() {
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

export function getMockAgileResponse() {
  return {
    LastUpdated: "2024-01-15T10:00:00Z",
    SourceLink: "https://prod3.agileticketing.net/websales/",
    ArrayOfShows: [
      {
        ID: "123",
        ExternalID: "ext-123",
        Name: "The Substance",
        Duration: "140",
        Type: "Feature",
        Distributor: "Mubi",
        ShortDescription: "A fading celebrity decides to use a black market drug...",
        EventImage: "substance.jpg",
        ThumbImage: "substance_thumb.jpg",
        InfoLink: "https://ocinema.org/substance",
        StreamingEnabled: false,
        StreamingType: null,
        CurrentShowings: [
          {
            ID: "show-1",
            StartDate: "2024-01-15T14:00:00Z",
            EndDate: "2024-01-15T16:20:00Z",
            Duration: 140,
            Venue: {
              Name: "O Cinema South Beach",
              Address1: "1130 Washington Ave",
              City: "Miami Beach",
              State: "FL",
              Zip: "33139"
            },
            SalesState: "OnSale",
            LegacyPurchaseLink: "https://tickets.ocinema.org/123",
            ContentDelivery: "Physical",
            DateTBD: false,
            Type: "Standard"
          }
        ]
      }
    ]
  };
}

// Mock Redis client
export class MockRedis {
  constructor() {
    this.data = new Map();
  }

  async get(key) {
    return this.data.get(key) || null;
  }

  async setex(key, ttl, value) {
    this.data.set(key, value);
    return 'OK';
  }

  clear() {
    this.data.clear();
  }
}