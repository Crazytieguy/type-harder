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
│   ├── room.$roomCode.tsx    # Game lobby with ready states
│   ├── race.$roomCode.tsx    # Active race with word validation
│   └── results.$roomCode.tsx # Final rankings and statistics
convex/
├── games.ts         # Room creation, joining, and race logic
├── users.ts         # User management with Clerk integration
├── scraping.ts      # Node.js action for content fetching
├── scrapingMutations.ts  # Database operations for content
└── schema.ts        # Tables: sequences, gameRooms, players, scrapingProgress
```
