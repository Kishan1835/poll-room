# Real-Time Poll Rooms

A real-time polling application built with Next.js, featuring instant result updates and anti-abuse protection.

## Features

- Create polls with 2-10 options
- Share via unique URL
- Real-time vote updates
- Anti-abuse mechanisms (fingerprinting + IP limiting)
- Mobile-responsive design

## Tech Stack

- Next.js 14
- TypeScript
- Prisma + PostgreSQL
- Tailwind CSS
- Server-Sent Events

## Anti-Abuse Mechanisms

### 1. Browser Fingerprinting
- Generates unique ID from browser characteristics
- Prevents duplicate votes from same browser
- Limitations: Different browsers/incognito bypass

### 2. IP Rate Limiting
- 1-minute cooldown per IP
- Prevents rapid bot attacks
- Limitations: VPNs can bypass, shared networks affected

## Local Development
```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Add your DATABASE_URL

# Push database schema
npx prisma db push

# Run development server
npm run dev
```

## Deployment

See DEPLOYMENT.md for full instructions.

## License

MIT