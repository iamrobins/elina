"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div className="error-state"><h1>Could not load this page</h1><p>Check the backend connection and try again.</p><button className="primary-button" onClick={reset}>Retry</button></div>;
}

