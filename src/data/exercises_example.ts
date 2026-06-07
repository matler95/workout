export interface Exercise {
  id: string;
  name: string;
  category: 'push' | 'pull' | 'legs' | 'abs' | 'full_body';
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: 'full_gym' | 'bodyweight';
  equipmentType: 'barbell' | 'dumbbell' | 'smith' | 'machine' | 'kettlebell' | 'band' | 'bodyweight' | 'other';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  instructions: string;
}

export const exerciseDatabase: Exercise[] = [
  // Push exercises
  {
    id: 'bench-press',
    name: 'Barbell Bench Press',
    category: 'push',
    primaryMuscles: ['chest'],
    secondaryMuscles: ['triceps', 'front_delts'],
    equipment: 'full_gym',
    equipmentType: 'barbell',
    difficulty: 'intermediate',
    instructions: '1. Lie on bench, grip bar slightly wider than shoulders\n2. Lower bar to mid-chest\n3. Press back up until arms fully extended\n4. Keep shoulder blades retracted'
  },
  {
    id: 'pushup',
    name: 'Push-Up',
    category: 'push',
    primaryMuscles: ['chest'],
    secondaryMuscles: ['triceps', 'front_delts'],
    equipment: 'bodyweight',
    equipmentType: 'bodyweight',
    difficulty: 'beginner',
    instructions: '1. Start in plank position, hands shoulder-width\n2. Lower body until chest nearly touches floor\n3. Push back up to starting position\n4. Keep core tight throughout'
  },
  {
    id: 'overhead-press',
    name: 'Overhead Press',
    category: 'push',
    primaryMuscles: ['front_delts', 'side_delts'],
    secondaryMuscles: ['triceps', 'upper_chest'],
    equipment: 'full_gym',
    equipmentType: 'barbell',
    difficulty: 'intermediate',
    instructions: '1. Stand with bar at shoulder height\n2. Press overhead until arms fully extended\n3. Lower back to shoulders with control\n4. Keep core braced'
  },
  {
    id: 'dips',
    name: 'Parallel Bar Dips',
    category: 'push',
    primaryMuscles: ['chest', 'triceps'],
    secondaryMuscles: ['front_delts'],
    equipment: 'bodyweight',
    equipmentType: 'bodyweight',
    difficulty: 'intermediate',
    instructions: '1. Grip parallel bars, arms extended\n2. Lower body by bending elbows\n3. Push back up to starting position\n4. Lean forward for chest emphasis'
  },
  // Pull exercises
  {
    id: 'pullup',
    name: 'Pull-Up',
    category: 'pull',
    primaryMuscles: ['lats', 'upper_back'],
    secondaryMuscles: ['biceps', 'rear_delts'],
    equipment: 'bodyweight',
    equipmentType: 'bodyweight',
    difficulty: 'intermediate',
    instructions: '1. Hang from bar, hands shoulder-width apart\n2. Pull chest to bar\n3. Lower with control\n4. Full arm extension at bottom'
  },
  {
    id: 'barbell-row',
    name: 'Barbell Row',
    category: 'pull',
    primaryMuscles: ['upper_back', 'lats'],
    secondaryMuscles: ['biceps', 'rear_delts'],
    equipment: 'full_gym',
    equipmentType: 'barbell',
    difficulty: 'intermediate',
    instructions: '1. Hinge at hips, bar hanging at arms length\n2. Pull bar to lower chest\n3. Lower with control\n4. Keep back flat throughout'
  },
  {
    id: 'deadlift',
    name: 'Deadlift',
    category: 'pull',
    primaryMuscles: ['hamstrings', 'glutes', 'lower_back'],
    secondaryMuscles: ['upper_back', 'traps'],
    equipment: 'full_gym',
    equipmentType: 'barbell',
    difficulty: 'advanced',
    instructions: '1. Stand with bar over mid-foot\n2. Grip bar, set back flat\n3. Drive through heels, extend hips and knees\n4. Stand fully erect, then lower with control'
  },
  {
    id: 'facepull',
    name: 'Face Pull',
    category: 'pull',
    primaryMuscles: ['rear_delts', 'upper_back'],
    secondaryMuscles: ['side_delts'],
    equipment: 'full_gym',
    equipmentType: 'dumbbell',
    difficulty: 'beginner',
    instructions: '1. Set cable at upper chest height\n2. Pull rope towards face\n3. External rotation at end position\n4. Squeeze shoulder blades together'
  },
  // Legs exercises
  {
    id: 'squat',
    name: 'Barbell Back Squat',
    category: 'legs',
    primaryMuscles: ['quads', 'glutes'],
    secondaryMuscles: ['hamstrings', 'lower_back'],
    equipment: 'full_gym',
    equipmentType: 'barbell',
    difficulty: 'intermediate',
    instructions: '1. Bar on upper back, feet shoulder-width\n2. Descend by bending knees and hips\n3. Go to parallel or below\n4. Drive through heels to stand'
  },
  {
    id: 'bulgarian-split-squat',
    name: 'Bulgarian Split Squat',
    category: 'legs',
    primaryMuscles: ['quads', 'glutes'],
    secondaryMuscles: ['hamstrings'],
    equipment: 'full_gym',
    equipmentType: 'dumbbell',
    difficulty: 'intermediate',
    instructions: '1. Rear foot elevated on bench\n2. Lower by bending front knee\n3. Keep torso upright\n4. Drive through front heel to stand'
  },
  {
    id: 'romanian-deadlift',
    name: 'Romanian Deadlift',
    category: 'legs',
    primaryMuscles: ['hamstrings', 'glutes'],
    secondaryMuscles: ['lower_back'],
    equipment: 'full_gym',
    equipmentType: 'barbell',
    difficulty: 'intermediate',
    instructions: '1. Stand holding bar at hip level\n2. Hinge at hips, lower bar down shins\n3. Feel stretch in hamstrings\n4. Drive hips forward to stand'
  },
  {
    id: 'leg-press',
    name: 'Leg Press',
    category: 'legs',
    primaryMuscles: ['quads', 'glutes'],
    secondaryMuscles: ['hamstrings'],
    equipment: 'full_gym',
    equipmentType: 'machine',
    difficulty: 'beginner',
    instructions: '1. Sit in machine, feet shoulder-width on platform\n2. Lower platform by bending knees\n3. Push through heels to extend legs\n4. Do not lock out knees completely'
  },
  // Abs exercises
  {
    id: 'plank',
    name: 'Plank',
    category: 'abs',
    primaryMuscles: ['abs', 'core'],
    secondaryMuscles: ['lower_back'],
    equipment: 'bodyweight',
    equipmentType: 'bodyweight',
    difficulty: 'beginner',
    instructions: '1. Forearms and toes on ground\n2. Body in straight line\n3. Hold position\n4. Keep core tight, glutes squeezed'
  },
  {
    id: 'hanging-leg-raise',
    name: 'Hanging Leg Raise',
    category: 'abs',
    primaryMuscles: ['abs', 'hip_flexors'],
    secondaryMuscles: ['core'],
    equipment: 'bodyweight',
    equipmentType: 'bodyweight',
    difficulty: 'advanced',
    instructions: '1. Hang from bar\n2. Raise legs to 90 degrees\n3. Lower with control\n4. Minimize swinging'
  },
  {
    id: 'cable-crunch',
    name: 'Cable Crunch',
    category: 'abs',
    primaryMuscles: ['abs'],
    secondaryMuscles: ['core'],
    equipment: 'bodyweight',
    equipmentType: 'bodyweight',
    difficulty: 'beginner',
    instructions: '1. Kneel facing cable machine\n2. Hold rope attachment at head\n3. Crunch down, bringing elbows to knees\n4. Squeeze abs at bottom'
  },
];
