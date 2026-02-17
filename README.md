# 🗳️ Real-Time Poll Rooms

> Create a poll. Share the link. Watch votes roll in live.

**Live Demo → [real-poll-room.vercel.app](https://real-poll-room.vercel.app)**

---

## What It Does

Real-Time Poll Rooms lets anyone create a quick poll, share it via a unique link, and watch results update in real-time across all browsers — no sign-up, no refresh needed.

Built as a full-stack assignment to demonstrate real-time communication, database persistence, and anti-abuse mechanisms.

---

## Screenshots

| Create a Poll | Vote & See Results |
|:---:|:---:|
| Fill in your question and options | Results update live as votes come in |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, TypeScript, Tailwind CSS |
| Backend | Next.js API Routes (TypeScript) |
| Database | PostgreSQL via [NeonDB](https://neon.tech) |
| ORM | Prisma |
| Real-time | Server-Sent Events (SSE) |
| Deployment | Vercel |

---

## Features

- **Create polls** with 2–10 options
- **Shareable link** generated instantly after creation
- **Real-time results** — all viewers see updates without refreshing
- **Anti-abuse protection** — two independent mechanisms (see below)
- **Persistent** — polls and votes survive page refreshes and server restarts
- **No login required** — fully anonymous

---

## Anti-Abuse Mechanisms

### 1. Browser Fingerprinting

A fingerprint is generated client side in `lib/fingerprint.ts` by hashing together browser characteristics: screen resolution , timezone, language , platform , hardware concurrency, user agent , and a lightweight canvas render . The fingerprint is stored in `localStorage` so it's consistent across page refreshes. It's sent with every vote request, and the server checks whether that fingerprint has already voted on that specific poll . If it has , the vote is rejected with a `409 Conflict`. 

**What it prevents:** A user refreshing the page and voting again , or speedily clicking the vote button multiple times. 

**Limitations:** Using a different browser or opening incognito mode generates a modern fingerprint since `localStorage` is isolated per context .

---

### 2. IP-Based Rate Limiting

On the server side (`app/api/polls/[id]/vote/route.ts`), the client IP is extracted from the `x forwarded for` header (set by Vercel). Before recording a vote, the server queries the `votes` table to check if this IP has voted on this poll within the live 5 minutes . If yes, the request is rejected with a `429 Too Many Requests`. 

**What it prevents:** The incognito bypass  even with a fresh fingerprint in a private window , the IP is still the same . Also slows down any scripted voting attempts from a exclusive network . 

**Why 5 minutes:** Long sufficient to suggestively slow down abuse , short sufficient that users on shared networks (office, cafe) aren't permanently locked out.

**Limitations:** VPN users can switch IPs between votes. On monolithic shared networks (corporate proxy), the first voter can unknowingly block others for 1 minutes  the fingerprint check partially compensates here since different devices have different fingerprints.

---

### Why Two Mechanisms?

They target different bypass methods . Fingerprinting catches the elementary "refresh and vote again" case . IP limiting catches the "open incognito" bypass . Bypassing both simultaneously requires switching browsers AND changing your IP — high enough friction for a casual poll.

---

## Edge Cases Handled

- **Empty options at creation** — blank option fields are filtered out before validation. A form with 3 options where one is clean still works if the odd 2 are valid. 
- **Concurrent votes** — two users voting at the same moment both succeed . Each is an autarkic `INSERT`, and the broadcast fires for each.
 - **Division by zero** — polls with 0 votes return `0%` for entirely options rather than `NaN`. 
- **SSE connection drops** — if `EventSource` errors out , it closes and `fetchPoll()` is called again after 5 seconds to re-establish. 
- **Invalid poll ID** — `/poll/nonexistent` returns a `404` from the API; the frontend redirects back to home.
- **Out-of-bounds option index** — the vote API validates `optionIndex` against `poll.options .length` server side, so crafted requests can't vote for a non existent option. 
- **Next .js 15 params** — `params` in dynamic routes is now a `Promise`. All route handlers type it as `Promise<{ id: string }>` and `await` it before use .
---

## Known Limitations

- **SSE is in process** — the connection pool lives in server memory (`Map<pollId, Set<controller>>`). On Vercel's serverless model , each invocation can be a different instance, so a vote processed by one instance may not broadcast to clients connected to another. At contemptible traffic this is seldom an issue. The decent fix is Redis Pub/Sub. 
- **Fingerprinting isn't foolproof** — switching browsers or devices gives a fresh fingerprint . Motivated users can vote multiple times with sufficient effort . 
- **IP spoofing** — `x forwarded for` can be manipulated. On Vercel this is less of a concern since Vercel controls the header , but it's not bulletproof. - **No poll expiry or deletion** — polls live forever . There's no creator dashboard or TTL .

---

## Local Development

### Prerequisites
- Node.js 18+
- A PostgreSQL database (NeonDB free tier works)

### Setup

```bash
# Clone the repo
git clone https://github.com/your-username/poll-rooms.git
cd poll-rooms

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# → Fill in your DATABASE_URL in .env

# Push the schema to your database
npx prisma generate
npx prisma db push

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

```env
DATABASE_URL="postgresql://user:password@host/db?sslmode=require"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

---

## Project Structure

```
poll-rooms/
├── app/
│   ├── api/
│   │   └── polls/
│   │       ├── route.ts                  # POST /api/polls — create poll
│   │       └── [id]/
│   │           ├── route.ts              # GET /api/polls/:id — fetch poll
│   │           ├── vote/
│   │           │   └── route.ts          # POST /api/polls/:id/vote — submit vote
│   │           └── stream/
│   │               └── route.ts          # GET /api/polls/:id/stream — SSE
│   ├── poll/
│   │   └── [id]/
│   │       └── page.tsx                  # Poll viewing + voting page
│   ├── page.tsx                          # Homepage — create poll
│   └── layout.tsx
├── lib/
│   ├── prisma.ts                         # Prisma client singleton
│   └── fingerprint.ts                    # Browser fingerprint generation
└── prisma/
    └── schema.prisma                     # Poll + Vote models
```

---

## Database Schema

```prisma
model Poll {
  id        String   @id @default(cuid())
  question  String
  options   String[]
  createdAt DateTime @default(now())
  votes     Vote[]
}

model Vote {
  id          String   @id @default(cuid())
  pollId      String
  optionIndex Int
  fingerprint String   // anti-abuse #1
  ipAddress   String?  // anti-abuse #2
  userAgent   String?
  createdAt   DateTime @default(now())

  poll Poll @relation(fields: [pollId], references: [id], onDelete: Cascade)

  @@index([pollId])
  @@index([fingerprint, pollId])
  @@index([ipAddress, pollId])
}
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/polls` | Create a new poll |
| `GET` | `/api/polls/:id` | Get poll data + vote counts |
| `POST` | `/api/polls/:id/vote` | Submit a vote |
| `GET` | `/api/polls/:id/stream` | SSE stream for real-time updates |

---

## Deployment

The app is deployed on Vercel with NeonDB as the database.

For your own deployment:
1. Push code to GitHub
2. Import project on [vercel.com](https://vercel.com)
3. Add environment variable: `DATABASE_URL`
4. Deploy — Vercel runs `prisma generate` automatically via the `postinstall` script
5. Add `NEXT_PUBLIC_APP_URL` pointing to your production URL and redeploy

---

## What I'd Improve Next

- **Redis Pub/Sub** for SSE broadcasting across serverless instances
- **Automated tests** (Jest for unit, Playwright for E2E)
- **Poll expiry** — creator can set a time limit
- **CAPTCHA** on vote endpoint for high-traffic polls
- **Vote change** — allow users to update their vote before poll closes
- **Creator dashboard** — edit/delete polls, view vote timestamps

---
