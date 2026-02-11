'use client';

import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center px-4 bg-white">
          <div className="text-center max-w-md">
            <h1 className="text-2xl font-bold text-gray-900 mb-3">
              Something went wrong
            </h1>
            <p className="text-gray-600 mb-6">
              We&apos;re sorry for the inconvenience. Please refresh the page or
              contact us at{' '}
              <a href="tel:+16462584460" className="text-brand-gold hover:underline">
                646-258-4460
              </a>
              .
            </p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="px-6 py-2.5 bg-brand-gold text-white font-semibold rounded-lg hover:bg-brand-gold/90 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
