import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '2.5rem',
          textAlign: 'center',
          background: '#fff',
          borderRadius: '0.75rem',
          margin: '1.25rem',
          boxShadow: '0 0.25rem 0.75rem rgba(0,0,0,0.1)',
          color: '#1e3a5f'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1.25rem' }}>⚠️</div>
          <h2 style={{ margin: '0 0 0.625rem 0' }}>Application Error</h2>
          <p style={{ color: '#64748b', fontSize: '0.95em', marginBottom: '1.25rem' }}>
            A rendering error occurred. This is often caused by missing map data or an unexpected feature property.
          </p>
          <pre style={{
            background: '#f1f5f9',
            padding: '0.9375rem',
            borderRadius: '0.375rem',
            fontSize: '0.8em',
            overflowX: 'auto',
            textAlign: 'left',
            marginBottom: '1.25rem',
            maxHeight: '12.5rem'
          }}>
            {this.state.error?.toString()}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '0.5rem',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            Reload and Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
