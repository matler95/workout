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
- **Backend**: Supabase (auth + edge functions)
- **Server**: Hono (Deno)
- **Database**: Supabase KV Store

## Getting Started

### Prerequisites
- Supabase account and project
- Node.js 18+ and pnpm

### Installation

1. Install dependencies:
\`\`\`bash
pnpm install
\`\`\`

2. The Supabase connection is already configured via the Make platform

3. Deploy the Supabase edge function:
   - Go to your Supabase project dashboard
   - Navigate to Edge Functions
   - Deploy the \`server\` function from \`supabase/functions/server/\`

### Running the App

The Vite dev server is already running in the Make environment. Access the app through the Make preview panel.

## Backend API Endpoints

All endpoints are prefixed with \`/make-server-975f4bc8\`:

### Auth
- \`POST /auth/signup\` - Create new user account
- \`GET /auth/session\` - Get current session

### Profile
- \`POST /profile/onboarding\` - Save onboarding data
- \`GET /profile\` - Get user profile

### Workouts
- \`POST /workouts/plan\` - Save workout plan
- \`GET /workouts/plan\` - Get workout plan
- \`POST /workouts/log\` - Log completed workout
- \`GET /workouts/history\` - Get workout history

### Progress
- \`POST /progress/bodyweight\` - Save bodyweight entry
- \`GET /progress/bodyweight\` - Get bodyweight history

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
- Sensitive operations require authentication tokens
- PII is minimized - only data required for workout algorithms is collected
- Make is designed for prototyping; for production, implement additional security measures

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
