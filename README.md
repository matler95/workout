# Fitness Tracker App

A comprehensive, mobile-first PWA for fitness tracking with smart workout planning and progress monitoring.

## Features

### Authentication
- Email/password signup and login
- Supabase-powered authentication
- Secure session management

### Onboarding Flow (10 Steps)
1. User name
2. Primary fitness goal
3. Gym experience level
4. Demographics (gender, age, height, weight)
5. Available equipment
6. Training availability (days/week, session length)
7. Preferred workout style (full body, upper/lower, PPL, bro split)
8. Ab training preferences
9. Recovery & lifestyle data
10. Injury history

### Workout Planning
- **Intelligent Exercise Selection**: Exercises filtered by equipment, experience level, and workout style
- **Muscle Group Visualization**: See which muscles are trained in each workout
- **Session Length Prediction**: Automatic calculation with warnings for overly long sessions
- **Customizable Templates**: Pre-built templates based on workout style (PPL, Upper/Lower, etc.)

### Main Screens

#### Dashboard
- Welcome message with current date
- Weekly workout progress tracker
- Readiness score (based on sleep, stress, activity)
- Calorie and protein targets
- Bodyweight chart
- Next workout quick-start

#### Plan
- Weekly workout overview
- Exercise list for each day
- Quick start buttons
- Edit workout plan

#### Progress (4 Tabs)
- **Body**: Bodyweight trends, BMI, estimated body composition
- **Strength**: Weight progression per exercise
- **Volume**: Sets per muscle group
- **Streaks**: Consistency tracking with heatmap

#### Library
- Searchable exercise database
- Filter by category and equipment
- Expandable exercise cards with instructions
- Primary/secondary muscle info

#### Profile
- User profile display
- Settings: units (metric/imperial), theme, language (EN/PL)
- Notification preferences
- Data management

### Active Workout
- Warmup phase with guidelines
- Exercise-by-exercise progression
- Set tracking with custom weight/reps
- 2-minute rest timer (skippable)
- Exercise navigation (skip forward)
- Post-workout feedback collection
- Automatic workout logging

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Styling**: Tailwind CSS v4
- **Routing**: React Router v7
- **Charts**: Recharts
- **Forms**: React Hook Form
- **Backend**: Supabase (Auth + PostgreSQL)
- **Database**: Supabase PostgreSQL (relational tables with RLS)

## Database Schema

The app uses 5 relational tables with Row-Level Security:

| Table | Purpose |
|-------|---------|
| `user_profiles` | Onboarding answers, preferences (units, theme, language) |
| `workout_plans` | One row per workout day per user (exercises stored as JSONB) |
| `workout_sessions` | One row per completed workout |
| `workout_sets` | One row per set completed — powers strength charts & progressive overload |
| `bodyweight_log` | Daily weight entries |

Plus 3 helper views:
- `best_sets_per_session` — best set per exercise per session
- `weekly_volume` — weekly volume aggregated by exercise
- `workouts_per_week` — workout counts per week per user

## Getting Started

### Prerequisites
- Supabase account and project
- Node.js 18+ and pnpm

### Installation

1. Install dependencies:
```bash
pnpm install
```

2. Copy the environment file and fill in your Supabase credentials:
```bash
cp .env.example .env.local
# Edit .env.local and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

3. Run the database migration:
   - Open your Supabase project dashboard
   - Navigate to SQL Editor
   - Paste and run the contents of `data_migration/migration.sql`
   - This creates all tables, RLS policies, and helper views

4. Start the development server:
```bash
pnpm run dev
```

## Algorithms (To Be Enhanced)

The app includes foundational algorithms for:

1. **Progressive Overload**: Track weight increases over time
2. **Calorie Calculation**: BMR + activity level adjustments based on goals
3. **Protein Targets**: 2.2g per kg bodyweight
4. **Readiness Score**: Combines sleep, stress, and activity metrics
5. **Session Length**: Warmup + (exercises × sets × rest time)
6. **Exercise Filtering**: Equipment, experience, and workout-style based

These will become more sophisticated as workout data accumulates.

## Security & Privacy

- User passwords are hashed by Supabase Auth
- Row-Level Security (RLS) ensures users can only access their own data
- All database queries run with the user's authenticated session
- PII is minimized - only data required for workout algorithms is collected

## Roadmap

- [ ] Enhanced progressive overload algorithms
- [ ] Exercise video/image demonstrations
- [ ] Social features (optional workout sharing)
- [ ] Advanced analytics and insights
- [ ] Nutrition tracking integration
- [ ] Apple Health / Google Fit sync
- [ ] PWA offline support
- [ ] Push notifications

## License

MIT