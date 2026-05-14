# Devils Insight AI

운영 및 인수인계 문서는 [HANDOVER.md](./HANDOVER.md)를 확인하세요.

이 폴더가 공식 작업 경로이자 유일한 git 저장소입니다.

- 공식 작업 경로: `/Users/sj/Desktop/Utah Devils/AI 플랫폼 개발/utah-devils-analytics`
- 상위 폴더의 예전 git 저장소는 비활성화되어 더 이상 사용하지 않습니다.


![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o-412991?style=flat-square&logo=openai)
![Vercel](https://img.shields.io/badge/Vercel-Seoul_icn1-black?style=flat-square&logo=vercel)

**Live:** https://utah-devils-analytics.vercel.app

---

## Overview

Devils Insight AI was built to solve a real operational problem.

Managing a university baseball club meant scattered Excel files, manually
calculated batting averages after every game, and post-game feedback that
took hours to produce. The data existed — but without structure, it never
became insight.

This platform integrates player records, game scheduling, lineup construction,
and AI-powered analysis into a single system. It is not a prototype.
It is deployed, actively used by the club, and continuously improved
through real operational feedback.

---

## Features

| Feature | Description |
|---|---|
| **Dashboard** | Team KPIs, batting & pitching leaderboards, auto-calculated OPS / ERA / WHIP |
| **Player Detail** | Season-by-season trend charts, AI analysis report per player |
| **Player Comparison** | Radar chart comparison across 5 dimensions |
| **AI Team Analysis** | GPT-4o powered team strengths, weaknesses & strategic recommendations |
| **AI Game Review** | Post-game AI feedback from field notes or uploaded game records |
| **Lineup Simulator** | Drag-and-drop batting order with real-time projected AVG / OBP / OPS |
| **Schedule Calendar** | Monthly game calendar with W/L/D result tracking |
| **Data Upload** | Batch CSV/Excel upload via Papa Parse → Supabase upsert |

---

## Tech Stack

```
Frontend      Next.js 16 (App Router, React Server Components)
Database      Supabase (PostgreSQL, Row Level Security)
AI Engine     OpenAI API (GPT-4o)
Deployment    Vercel (Seoul Edge, icn1)
Language      TypeScript
Styling       Tailwind CSS
Charts        Chart.js
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│            Client  (Browser / Mobile PWA)               │
│    Next.js 16  ·  React Server Components               │
│    App Router  ·  Tailwind CSS  ·  Chart.js             │
└────────────────────────┬────────────────────────────────┘
                         │  HTTPS
┌────────────────────────▼────────────────────────────────┐
│              Vercel Edge  (Seoul icn1)                   │
│    SSR / SSG / API Routes  ·  Middleware Auth Guard     │
└──────────────┬──────────────────────┬───────────────────┘
               │  Supabase Client      │  OpenAI SDK
┌──────────────▼──────────┐  ┌─────────▼─────────────────┐
│   Supabase (PostgreSQL) │  │      OpenAI API            │
│   ├─ players            │  │      Model: gpt-4o         │
│   ├─ batting_stats      │  │      Structured prompts    │
│   ├─ pitching_stats     │  │      temp: 0.4             │
│   ├─ games              │  └───────────────────────────┘
│   └─ lineups            │
│   RLS: per-role policy  │
└─────────────────────────┘
```

---

## Database Schema

```sql
players         -- name, number, position
batting_stats   -- hits, HR, SB, walks · OPS computed at query time
pitching_stats  -- ERA, WHIP, IP, K   · computed at query time
games           -- opponent, date, result CHECK ('W','L','D')
lineups         -- order_data JSONB
```

All derived metrics (OPS, ERA, WHIP) are computed at read time —
never stored — to guarantee mathematical consistency.

---

## Key Design Decisions

**React Server Components for data fetching**  
Supabase credentials stay server-side. Initial render arrives
with data already embedded — no client-side loading states.

**Row Level Security at the database layer**  
Public read, authenticated write. Access control enforced by
the database itself, not application code.

**Structured AI prompting**  
Derived metrics are computed before the prompt is built.
GPT-4o receives calculated numbers, not raw counting stats.
`temperature: 0.4` reduces hallucination on numerical reasoning.

**Computed columns**  
`total_bases` uses PostgreSQL `GENERATED ALWAYS AS` —
a single source of truth for slugging percentage calculation.

---

## Local Development

```bash
git clone https://github.com/SEJINKIM-git/utah-devils-analytics
cd utah-devils-analytics
npm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=your_openai_key
```

```bash
npm run dev
```

---

## Roadmap

- [ ] Situation-centric game logging (inning / base state / leverage)
- [ ] AI Action Cards for in-game decision support
- [ ] Similar Cases retrieval engine
- [ ] Post-Game Decision Review (structured judgment retrospective)
- [ ] Supabase Realtime — live stat updates during games
- [ ] Attendance & condition tracking

---

## Background

This platform was presented at **TEK Club Demo Day, May 2026**  
at the University of Utah Asia Campus.

It is, to the developer's knowledge, the first systematically built  
and deployed AI-powered analytics platform for a university baseball  
club at IGC.

---

## Built by

**Sejin Kim** — Operations Leader, Utah Devils Baseball Club  
GitHub: [@SEJINKIM-git](https://github.com/SEJINKIM-git)  
Instagram: [@sejin_k111](https://instagram.com/sejin_k111)

---

*Utah Devils Baseball Club · Est. 2022 · University of Utah Asia Campus*
```

---
