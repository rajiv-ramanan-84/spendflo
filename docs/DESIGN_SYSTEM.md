# SpendFlo Design System

## Overview

A modern, accessible, and production-ready design system inspired by top-tier products like Railway and Anthropic Claude. Built with React, TypeScript, Tailwind CSS, and Framer Motion.

## Design Principles

### 1. **Clarity**
- Clear visual hierarchy
- Consistent spacing and typography
- Obvious interactive elements
- Purposeful use of color

### 2. **Simplicity**
- Minimal cognitive load
- Clean, uncluttered interfaces
- Progressive disclosure
- Focused user flows

### 3. **Feedback**
- Immediate visual feedback for all actions
- Loading states for async operations
- Success/error notifications
- Smooth micro-interactions

### 4. **Accessibility**
- WCAG 2.1 AA compliant
- Keyboard navigation support
- Proper ARIA labels
- Color contrast ratios

### 5. **Performance**
- Optimized animations (60fps)
- Lazy loading
- Code splitting
- Minimal bundle size

## Color Palette

### Primary Colors
```css
Blue 50:  #eff6ff
Blue 100: #dbeafe
Blue 500: #3b82f6  /* Primary actions */
Blue 600: #2563eb  /* Primary hover */
Blue 700: #1d4ed8  /* Primary active */
```

### Status Colors
```css
/* Success */
Green 50:  #f0fdf4
Green 600: #16a34a
Green 700: #15803d

/* Warning */
Yellow 50:  #fefce8
Yellow 600: #ca8a04
Yellow 700: #a16207

/* Danger */
Red 50:  #fef2f2
Red 600: #dc2626
Red 700: #b91c1c

/* Info */
Blue 50:  #eff6ff
Blue 600: #2563eb
Blue 700: #1d4ed8
```

### Neutral Colors
```css
Gray 50:  #f9fafb  /* Backgrounds */
Gray 100: #f3f4f6  /* Subtle backgrounds */
Gray 200: #e5e7eb  /* Borders */
Gray 300: #d1d5db  /* Borders hover */
Gray 500: #6b7280  /* Secondary text */
Gray 700: #374151  /* Primary text */
Gray 900: #111827  /* Headings */
```

## Typography

### Font Family
```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
```

### Font Sizes
```css
text-xs:   0.75rem  (12px)  /* Labels, hints */
text-sm:   0.875rem (14px)  /* Body text */
text-base: 1rem     (16px)  /* Default */
text-lg:   1.125rem (18px)  /* Section headers */
text-xl:   1.25rem  (20px)  /* Modal titles */
text-2xl:  1.5rem   (24px)  /* Page subtitles */
text-3xl:  1.875rem (30px)  /* Page titles */
```

### Font Weights
```css
font-normal:   400  /* Body text */
font-medium:   500  /* Emphasis */
font-semibold: 600  /* Subheadings */
font-bold:     700  /* Headings */
```

## Spacing Scale

Based on 4px baseline:

```css
0.5: 2px
1:   4px
1.5: 6px
2:   8px
3:   12px
4:   16px
5:   20px
6:   24px
8:   32px
12:  48px
16:  64px
```

## Components

### Button

**Variants**: primary, secondary, ghost, danger
**Sizes**: sm, md, lg

```tsx
import Button from '@/components/ui/Button';

<Button variant="primary" size="md">
  Save Changes
</Button>

<Button variant="secondary" loading={true}>
  Loading...
</Button>

<Button variant="danger" icon={<TrashIcon />}>
  Delete
</Button>
```

**States**:
- Default
- Hover (subtle shadow, darker background)
- Active (pressed state)
- Disabled (50% opacity)
- Loading (spinner animation)

### Badge

**Variants**: success, warning, danger, info, neutral
**Sizes**: sm, md

```tsx
import Badge from '@/components/ui/Badge';

<Badge variant="success" dot>Active</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="danger">Revoked</Badge>
```

**Features**:
- Optional status dot indicator
- Ring border for depth
- Proper semantic colors

### Input

**Features**:
- Label support
- Error messages
- Hint text
- Left/right icons
- Focus states

```tsx
import Input from '@/components/ui/Input';

<Input
  label="API Key Name"
  placeholder="Production API"
  error={errors.name}
  hint="A descriptive name for this key"
  leftIcon={<KeyIcon />}
/>
```

**States**:
- Default (gray border)
- Focus (blue ring, no border)
- Error (red border, red ring)
- Disabled (gray background)

### Modal

**Sizes**: sm, md, lg, xl, full

```tsx
import Modal from '@/components/ui/Modal';

<Modal
  isOpen={isOpen}
  onClose={handleClose}
  title="Create API Key"
  description="Generate a new key for API access"
  size="lg"
>
  {/* Modal content */}
</Modal>
```

**Features**:
- Backdrop blur
- Smooth animations (fade + scale)
- Click outside to close
- ESC key support
- Auto-focus management

### Empty State

```tsx
import EmptyState from '@/components/ui/EmptyState';

<EmptyState
  icon={<KeyIcon />}
  title="No API keys yet"
  description="Create your first API key to get started"
  action={{
    label: 'Create API Key',
    onClick: handleCreate,
  }}
/>
```

### Skeleton

```tsx
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton';

// Simple skeleton
<Skeleton className="h-4 w-32" />

// Table skeleton
<TableSkeleton rows={5} />
```

### Toast

**Variants**: success, error, warning, info

```tsx
import Toast from '@/components/ui/Toast';

<Toast
  isOpen={showToast}
  onClose={() => setShowToast(false)}
  message="API key copied successfully"
  variant="success"
  duration={3000}
/>
```

**Features**:
- Auto-dismiss after duration
- Manual close button
- Slide in animation
- Position: bottom-right

## Animations

### Timing Functions
```css
ease-out:    cubic-bezier(0, 0, 0.2, 1)    /* UI elements appearing */
ease-in:     cubic-bezier(0.4, 0, 1, 1)     /* UI elements disappearing */
ease-in-out: cubic-bezier(0.4, 0, 0.2, 1)   /* General transitions */
```

### Durations
```css
duration-100: 100ms  /* Micro-interactions */
duration-200: 200ms  /* Standard transitions */
duration-300: 300ms  /* Larger animations */
duration-500: 500ms  /* Page transitions */
```

### Common Patterns

**Fade In**:
```tsx
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.2 }}
/>
```

**Slide Up**:
```tsx
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.2, ease: 'easeOut' }}
/>
```

**Scale**:
```tsx
<motion.div
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0, scale: 0.95 }}
  transition={{ duration: 0.2 }}
/>
```

**Stagger Children**:
```tsx
{items.map((item, index) => (
  <motion.div
    key={item.id}
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.05 }}
  >
    {item.content}
  </motion.div>
))}
```

## Layout Patterns

### Page Layout
```tsx
<div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    {/* Page content */}
  </div>
</div>
```

### Card
```tsx
<div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
  {/* Card content */}
</div>
```

### Section Header
```tsx
<div className="flex items-center justify-between mb-8">
  <div>
    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
      Title
    </h1>
    <p className="text-gray-600 mt-1">
      Description
    </p>
  </div>
  <Button>Action</Button>
</div>
```

## Utility Functions

### `cn()` - Class Name Merger
```tsx
import { cn } from '@/lib/design/utils';

<div className={cn(
  'base-class',
  condition && 'conditional-class',
  variant === 'primary' && 'primary-class'
)} />
```

### `formatDate()`
```tsx
import { formatDate } from '@/lib/design/utils';

formatDate('2025-01-15')  // "Jan 15"
formatDate(null)          // "Never"
```

### `copyToClipboard()`
```tsx
import { copyToClipboard } from '@/lib/design/utils';

const handleCopy = async () => {
  const success = await copyToClipboard(text);
  if (success) {
    showToast('Copied!', 'success');
  }
};
```

### `debounce()`
```tsx
import { debounce } from '@/lib/design/utils';

const debouncedSearch = debounce((query: string) => {
  performSearch(query);
}, 300);
```

## Best Practices

### 1. **Consistent Spacing**
Use the spacing scale consistently:
```tsx
// Good
<div className="mb-8">        // Large section spacing
<div className="space-y-4">   // Item spacing
<div className="gap-3">        // Small gaps

// Avoid
<div className="mb-7">        // Non-standard value
```

### 2. **Proper Color Usage**
```tsx
// Good
<p className="text-gray-700">   // Body text
<p className="text-gray-500">   // Secondary text
<h1 className="text-gray-900">  // Headings

// Avoid
<p className="text-gray-800">   // Not in color palette
```

### 3. **Semantic HTML**
```tsx
// Good
<button onClick={handleClick}>Click</button>

// Avoid
<div onClick={handleClick}>Click</div>
```

### 4. **Loading States**
Always show loading feedback:
```tsx
{loading ? (
  <TableSkeleton rows={5} />
) : (
  <Table data={data} />
)}
```

### 5. **Error Handling**
Always handle and display errors:
```tsx
try {
  await action();
  showToast('Success!', 'success');
} catch (error) {
  showToast('Failed to perform action', 'error');
}
```

### 6. **Accessibility**
```tsx
// Good
<button aria-label="Close modal">
  <XIcon />
</button>

// Avoid
<div onClick={close}>
  <XIcon />
</div>
```

## Responsive Design

### Breakpoints
```css
sm:  640px   /* Small tablets */
md:  768px   /* Tablets */
lg:  1024px  /* Laptops */
xl:  1280px  /* Desktops */
2xl: 1536px  /* Large desktops */
```

### Usage
```tsx
<div className="
  px-4 sm:px-6 lg:px-8
  py-4 sm:py-6 lg:py-8
  grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3
">
  {/* Responsive content */}
</div>
```

## Performance Tips

### 1. **Lazy Load Components**
```tsx
const HeavyComponent = lazy(() => import('./HeavyComponent'));
```

### 2. **Memoize Expensive Calculations**
```tsx
const expensiveValue = useMemo(() => {
  return calculateValue(data);
}, [data]);
```

### 3. **Debounce User Input**
```tsx
const debouncedOnChange = debounce(handleChange, 300);
```

### 4. **Optimize Images**
```tsx
<Image
  src="/image.jpg"
  alt="Description"
  width={800}
  height={600}
  loading="lazy"
/>
```

## Testing

### Visual Testing
Test all component states:
- Default
- Hover
- Active/Pressed
- Focus
- Disabled
- Loading
- Error

### Accessibility Testing
- Keyboard navigation
- Screen reader support
- Color contrast
- Focus indicators

## Resources

- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Framer Motion Documentation](https://www.framer.com/motion/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [React Best Practices](https://react.dev/learn)

## Updates

Design system updates should be documented here with date and version.

**v1.0.0** - 2025-01-15
- Initial design system
- Core components (Button, Badge, Modal, Input, Toast)
- Utility functions
- Animation patterns
