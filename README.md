# Type Harder

A multiplayer typing race game using paragraphs from Eliezer Yudkowsky's "The Sequences". Race against friends to see who can type faster while learning rationality concepts.

## Features

- **Multiplayer Racing**: Create rooms with 6-character shareable codes
- **Real-time Progress**: See everyone's typing progress live with WPM tracking
- **Exact Typing Required**: Must type each word correctly to advance
- **Educational Content**: Paragraphs from readthesequences.com

## Project Structure

```
src/
├── routes/          # TanStack Router pages
│   ├── index.tsx    # Home - create/join rooms
│   ├── room.$roomCode.tsx    # Game room (lobby, racing, and results)
│   └── stats.tsx    # User statistics with paginated race history
convex/
├── games.ts         # Room creation, joining, and race logic
├── users.ts         # User management with Clerk integration
├── stats.ts         # User statistics and race history queries
├── aggregates.ts    # O(1) random selection with Convex aggregates
├── dbHelpers.ts     # Encapsulated database operations with aggregate maintenance
├── scraping.ts      # Content fetching and database operations
└── schema.ts        # Tables: sequences, rooms, games, players, roomMembers, scrapingProgress
```
