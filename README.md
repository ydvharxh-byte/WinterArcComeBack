# 📚 Study OS

> A unified, high-performance academic operating system for study tracking, AI tutoring, spaced repetition, daily planning, tasks, fitness, nutrition, and the Winter Arc.

---

## ✨ Features

- **🎯 Unified Dashboard (`/`)**: Daily schedule, real-time study goals, prioritized tasks, next-best-action AI recommendations, and XP streak.
- **📖 Study Engine (`/study` & `/study/topic/[id]`)**: Deep topic tracking, NCERT & outside questions evidence tracking, theory lessons, spaced revision, and mastery heatmaps.
- **🤖 AI Tutor & Question Generator (`/tutor`)**: OpenAI/BazaarLink-compatible multi-turn interactive tutor, diagnostic reasoning, and personalized question generation.
- **📅 Interactive Planner (`/planner`)**: Time-blocked schedule, study blocks, workouts, meals, and habit milestones on a single timeline.
- **📋 Task Management (`/tasks`)**: Priority-ranked task board with tags, deadlines, and XP rewards.
- **❄️ Winter Arc Challenge (`/winter-arc`)**: 90-day discipline arc tracker with daily score metrics (study, habits, gym, nutrition).
- **💪 Fitness & Nutrition Tracker (`/fitness` & `/nutrition`)**: Track push/pull/legs workouts, personal bests, running splits, and macros.
- **📝 Spaced Revision & Mistakes Log (`/formulas`, `/notes`, `/mistakes`)**: Mistake notebook with error categorization, active recall formulas, and lecture notes PDF organizer.
- **📊 Analytics (`/analytics`)**: Study time distributions, topic mastery breakdowns, and productivity heatmaps.

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- Node.js (v20+ recommended)
- pnpm or npm

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Start Development Server
```bash
pnpm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

> **💡 Zero-Config Database:**
> Study OS includes an embedded persistent database engine that runs locally with **zero external dependencies**. No need to configure PostgreSQL or Docker for local development.

---

## 🗄️ Database Options

### Local (Embedded)
By default, when `DATABASE_URL` is omitted, Study OS automatically uses a local persistent database saved under `.data/study-os`.

### Production / Cloud PostgreSQL
To connect to a managed PostgreSQL database (Neon, Supabase, Railway, AWS RDS, or Docker):
1. Copy `.env.example` to `.env.local`
2. Provide your connection string:
   ```env
   DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=require
   ```
3. Run migrations:
   ```bash
   pnpm run db:migrate
   ```

---

## 🤖 AI Configuration (Optional)

Configure your LLM provider in `.env.local` or through the in-app **Settings → AI** panel:

```env
AI_API_KEY=your_api_key_here
AI_BASE_URL=https://api.bazaarlink.ai/v1
AI_MODEL=your_selected_model
```

---

## 🛠️ Available Scripts

- `pnpm run dev` - Starts the development server on `http://localhost:3000`
- `pnpm run build` - Builds the application for production using Next.js Turbopack
- `pnpm run start` - Runs the built production server
- `pnpm run typecheck` - Runs TypeScript strict type checking
- `pnpm run lint` - Runs ESLint code quality checks
- `pnpm run db:migrate` - Applies database schema migrations
- `pnpm run db:generate` - Generates new Drizzle schema migrations

---

## 🚢 Deployment to Production (Vercel / Railway / Render)

1. Push your repository to GitHub.
2. Import into **Vercel** (or Railway/Render).
3. Add the following environment variable in the dashboard:
   - `DATABASE_URL`: Connection string to your cloud PostgreSQL database (e.g. Neon or Supabase).
   - *(Optional)* `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`.
4. Deploy! Next.js will build and deploy automatically.
