import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * App-wide safety net. Before this, an uncaught render-time exception
 * anywhere in the tree (e.g. the movementId crash — see
 * getMovementDisplayName in exerciseGrouping.ts) unmounted the entire
 * React tree with no fallback UI: a blank/black screen and nothing in
 * the visible app to tell the user what happened.
 *
 * This doesn't fix the underlying bug class (a data-shape mismatch can
 * still throw), it just makes the failure visible and recoverable
 * instead of silent and total.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // TODO: wire to Sentry/monitoring if available.
    console.error('[ErrorBoundary] caught render error:', error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ color: 'var(--muted-foreground, #888)', maxWidth: '28rem' }}>
            This screen hit an unexpected error and couldn't load. Your workout data is safe —
            try going back to the home screen.
          </p>
          <button
            onClick={this.handleReload}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: '0.5rem',
              background: '#111',
              color: '#fff',
              fontWeight: 500,
            }}
          >
            Back to Dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
