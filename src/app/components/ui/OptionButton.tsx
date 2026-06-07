import React from 'react';
import { Check } from 'lucide-react';
import { cn } from './utils';

interface OptionButtonProps {
  selected: boolean;
  onClick: () => void;
  label: string;
  sub?: string;
  icon?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

/**
 * OptionButton — a pill/card-style selectable option.
 *
 * Replaces bare radio inputs and the `optionGrid` helper buttons throughout
 * the app. Shows a light outlined state by default, shifting to an accent
 * fill + checkmark when selected.
 */
export function OptionButton({
  selected,
  onClick,
  label,
  sub,
  icon,
  className,
  disabled = false,
}: OptionButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        // base
        'relative w-full text-left rounded-2xl border px-4 py-3.5 transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        // unselected
        !selected && 'bg-background border-border/70 hover:border-primary/40 hover:bg-accent/30',
        // selected
        selected &&
          'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-600 shadow-sm shadow-emerald-200/60 dark:shadow-emerald-900/40',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {icon && (
          <span className={cn('mt-0.5 text-lg leading-none', selected ? 'opacity-100' : 'opacity-60')}>
            {icon}
          </span>
        )}

        <div className="flex-1 min-w-0">
          <p
            className={cn(
              'text-sm font-medium leading-snug',
              selected ? 'text-emerald-900 dark:text-emerald-100' : 'text-foreground',
            )}
          >
            {label}
          </p>
          {sub && (
            <p
              className={cn(
                'text-xs mt-0.5 leading-relaxed',
                selected ? 'text-emerald-700/80 dark:text-emerald-300/80' : 'text-muted-foreground',
              )}
            >
              {sub}
            </p>
          )}
        </div>

        {/* Checkmark badge */}
        <div
          className={cn(
            'flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-all duration-200 mt-0.5',
            selected
              ? 'bg-emerald-500 dark:bg-emerald-600 scale-100 opacity-100'
              : 'border border-border/50 bg-muted/40 scale-90 opacity-0',
          )}
        >
          <Check className="w-3 h-3 text-white" strokeWidth={2.5} />
        </div>
      </div>
    </button>
  );
}

interface OptionGroupProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; sub?: string; icon?: React.ReactNode }>;
  cols?: 1 | 2;
  className?: string;
}

/**
 * OptionGroup — renders a grid of OptionButtons with single-select semantics.
 *
 * Usage:
 *   <OptionGroup
 *     value={data.primaryGoal}
 *     onChange={v => setData({ ...data, primaryGoal: v })}
 *     options={[
 *       { value: 'build_muscle', label: 'Build Muscle' },
 *       { value: 'lose_fat',     label: 'Lose Fat' },
 *     ]}
 *   />
 */
export function OptionGroup<T extends string>({
  value,
  onChange,
  options,
  cols = 2,
  className,
}: OptionGroupProps<T>) {
  return (
    <div
      className={cn(
        'grid gap-2.5',
        cols === 2 ? 'grid-cols-2' : 'grid-cols-1',
        className,
      )}
    >
      {options.map(opt => (
        <OptionButton
          key={opt.value}
          selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          label={opt.label}
          sub={opt.sub}
          icon={opt.icon}
        />
      ))}
    </div>
  );
}
