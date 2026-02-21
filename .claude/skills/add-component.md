# Add React Component

Use this skill when creating a new React component. Replace [PLACEHOLDERS] with specifics.

## Component spec

Name: [ComponentName]
File: [src/frontend/src/components/ComponentName.jsx]
Purpose: [what it does]
Props: [list prop names + types]
Events emitted: [e.g. onShare(tripData), onChange(items)]

## Step 1 — Write the component test first (TDD)

In `src/frontend/src/components/__tests__/ComponentName.test.jsx`:
```jsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ComponentName from '../ComponentName';

describe('ComponentName', () => {
  it('renders with required props', () => {
    render(<ComponentName [requiredProp]={mockValue} />);
    expect(screen.getByText(/expected text/i)).toBeInTheDocument();
  });

  it('calls onEvent when user interacts', async () => {
    const mockHandler = vi.fn();
    const user = userEvent.setup();
    render(<ComponentName onEvent={mockHandler} />);
    await user.click(screen.getByRole('button', { name: /button label/i }));
    expect(mockHandler).toHaveBeenCalledWith(expectedArg);
  });

  it('shows empty state when no data', () => {
    render(<ComponentName data={[]} />);
    expect(screen.getByText(/empty state message/i)).toBeInTheDocument();
  });
});
```

Run `cd src/frontend && npm test` — confirm tests fail.

## Step 2 — Implement the component

```jsx
// src/frontend/src/components/ComponentName.jsx
import { useState } from 'react';

// PostHog: import at top of file if events needed
// import posthog from 'posthog-js';

export default function ComponentName({ propA, propB, onEvent }) {
  const [localState, setLocalState] = useState(null);

  const handleAction = () => {
    // posthog.capture('component_action', { /* props */ });
    onEvent?.(localState);
  };

  return (
    <div className="[tailwind classes] dark:[dark-mode classes]">
      {/* Accessibility: aria-label on icon buttons, aria-live on dynamic content */}
      <button
        onClick={handleAction}
        aria-label="[descriptive label for screen readers]"
        className="..."
      >
        [button text]
      </button>
    </div>
  );
}
```

## Checklist for every component

### Tailwind
- Use existing color tokens: `sprout-green`, `sprout-dark`, `warm-white`, `soft-gray`
- Responsive: `sm:`, `lg:` breakpoints
- Dark mode: `dark:bg-gray-800 dark:text-gray-100` on all surfaces

### Accessibility
- `aria-label` on all icon-only buttons
- `aria-live="polite"` on loading/status regions
- `role="status"` on success toasts
- `role="alert"` on error messages
- Focus management: after modal open, focus first interactive element

### PostHog events (fire on meaningful user actions)
```js
posthog.capture('event_name', {
  // NO PII — never include names, emails, weights, heights
  category: 'component_category',
  action: 'user_action',
});
```

### Dark mode
Every background and text class needs a dark variant:
```jsx
className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
```

### Definition of Done
- [ ] Component test passes (`cd src/frontend && npm test`)
- [ ] Dark mode looks correct
- [ ] aria-label on interactive elements without visible text
- [ ] PostHog event fires on key action
- [ ] No console errors
- [ ] Mobile (sm) + desktop (lg) layouts verified
