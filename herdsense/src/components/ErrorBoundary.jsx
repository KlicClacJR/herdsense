import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Keep console logging for debugging, but also show a UI fallback.
    // eslint-disable-next-line no-console
    console.error('HerdSense screen crashed:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 16,
            margin: 16,
            borderRadius: 12,
            border: '1px solid #fecaca',
            background: '#fef2f2',
            color: '#7f1d1d',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Something crashed while rendering.</div>
          <div style={{ marginBottom: 12, opacity: 0.9 }}>
            This prevents a blank white screen. Reload, or switch tabs to continue.
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 12 }}>
            {String(this.state.error?.message || this.state.error || 'Unknown error')}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: 12,
              background: '#2D6A4F',
              color: 'white',
              border: 'none',
              padding: '10px 12px',
              borderRadius: 8,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

