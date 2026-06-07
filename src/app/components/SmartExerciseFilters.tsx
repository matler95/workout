import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Star, Filter } from 'lucide-react';
import type { Exercise } from '../../data/exercises';
import type { UserProfile } from '../../utils/api';

interface SmartExerciseFiltersProps {
  exercises: Exercise[];
  profile?: UserProfile;
  onSelectExercise?: (exercise: Exercise) => void;
  filterByMuscle?: string[];
  maxResults?: number;
}

export function SmartExerciseFilters({
  exercises,
  profile,
  onSelectExercise,
  filterByMuscle = [],
  maxResults = 5,
}: SmartExerciseFiltersProps) {
  const [filterMode, setFilterMode] = useState<'recommended' | 'all'>('recommended');

  const filteredAndRanked = useMemo(() => {
    let candidates = exercises;

    // Filter by user preferences
    if (profile) {
      if (profile.equipment === 'bodyweight') {
        candidates = candidates.filter(e => e.equipment === 'bodyweight');
      }
      if (profile.experienceLevel === 'beginner') {
        candidates = candidates.filter(e => e.difficulty !== 'advanced');
      }
    }

    // Filter by muscle groups if specified
    if (filterByMuscle.length > 0) {
      candidates = candidates.filter(e =>
        filterByMuscle.some(m =>
          e.primaryMuscles.includes(m) || e.secondaryMuscles.includes(m)
        )
      );
    }

    // Score and rank exercises
    const scored = candidates.map(ex => {
      let score = 50; // base

      // Difficulty match (0-20)
      if (profile) {
        if (profile.experienceLevel === 'beginner' && ex.difficulty === 'beginner') {
          score += 20;
        } else if (profile.experienceLevel === 'intermediate' && ex.difficulty !== 'advanced') {
          score += 15;
        } else if (profile.experienceLevel === 'advanced' && ex.difficulty === 'advanced') {
          score += 20;
        }
      }

      // Compound exercises bonus (0-15)
      if (ex.primaryMuscles.length >= 2 || ex.secondaryMuscles.length >= 2) {
        score += 15;
      }

      // Equipment match (0-15)
      if (profile && ex.equipment === profile.equipment) {
        score += 15;
      }

      // Popularity heuristic - exercises with descriptions are usually more reliable (0-10)
      if (ex.notes || ex.tempo) {
        score += 10;
      }

      return { exercise: ex, score: Math.min(100, score) };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, filterMode === 'recommended' ? maxResults : undefined);
  }, [exercises, profile, filterByMuscle, filterMode, maxResults]);

  if (filteredAndRanked.length === 0) {
    return (
      <Card>
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">No exercises match your filters</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Smart Exercise Recommendations
          </CardTitle>
          <Button
            variant={filterMode === 'recommended' ? 'outline' : 'ghost'}
            size="sm"
            onClick={() => setFilterMode(filterMode === 'recommended' ? 'all' : 'recommended')}
            className="text-xs h-7"
          >
            {filterMode === 'recommended' ? 'Top 5' : 'All'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {filteredAndRanked.map(({ exercise, score }, i) => (
          <div
            key={exercise.id}
            className="flex items-start justify-between p-2.5 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-accent/50 transition-colors"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-medium text-sm">{exercise.name}</p>
                {i === 0 && (
                  <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                    <Star className="w-3 h-3 mr-0.5" />
                    Top pick
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap gap-1">
                {exercise.primaryMuscles.map(m => (
                  <Badge key={m} className="text-xs" variant="default">
                    {m.replace(/_/g, ' ')}
                  </Badge>
                ))}
              </div>

              <div className="flex gap-2 mt-1.5 text-xs text-muted-foreground">
                {exercise.difficulty !== 'beginner' && (
                  <span>• {exercise.difficulty}</span>
                )}
                <span>• {(exercise.equipmentType || exercise.equipment).replace('_', ' ')}</span>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1">
              <div className="text-right">
                <div className="text-lg font-bold text-primary">{score}%</div>
                <p className="text-xs text-muted-foreground">match</p>
              </div>
              {onSelectExercise && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onSelectExercise(exercise)}
                  className="text-xs h-7 mt-1"
                >
                  Add
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
