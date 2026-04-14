export function SearchPanel() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-8 text-center">
      <div className="mb-3 text-neutral-600">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>
      <p className="text-xs text-neutral-500 leading-relaxed">
        Search across sessions.<br />
        <span className="text-neutral-600">Coming soon.</span>
      </p>
    </div>
  );
}
