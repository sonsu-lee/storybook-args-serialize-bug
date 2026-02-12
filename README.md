# Storybook args serialization freeze

Minimal reproduction for a bug where Storybook freezes the browser tab when `args` contain non-serializable values (functions, React refs, React components as object properties).

No error message is shown. The tab just locks up.

## The bug

Passing non-serializable values through Storybook's `args` works fine on the first story load. But switching to another story with the same kind of args freezes the browser.

### Why only on story *switch*, not first load?

1. **First load** — args live in the Preview's in-process memory. `inferArgTypes` runs but if `ref.current` is still `null`, there's nothing to recurse into. Everything works.
2. **Story switch** — by now React has rendered and `ref.current` points to a real DOM element. `inferArgTypes` runs again during `prepareStory`, and `inferType()` recursively traverses every property of the DOM element, its parent nodes, React Fiber internals, etc. — causing exponential traversal that freezes the tab.

## Root cause

**The freeze is NOT in `telejson.stringify()`** — it's in `inferType()` within `inferArgTypes.ts`.

This function recursively traverses **all properties** of any object to infer arg types for the Controls panel. The existing `visited` Set uses `new Set(visited)` at each branch for sibling path independence, so the same object reached via different paths is not detected as a cycle.

When `ref.current` points to a DOM element:

```
inferType(ref)                          // { current: HTMLFormElement }
  → inferType(ref.current)              // HTMLFormElement (200+ properties)
    → inferType(element.parentNode)     // another DOM element
      → inferType(parentNode.__reactFiber$xxx)  // React Fiber node
        → inferType(fiber.stateNode)    // back to element via different path
          → ... (exponential, not caught by visited Set)
```

### Fix: [PR #33834](https://github.com/storybookjs/storybook/pull/33834)

Added an `isPlainObject` guard in `inferType()`. Non-plain objects (DOM elements, class instances, `Map`, `Set`, etc.) are returned as opaque types instead of being recursed into. `Date`, `RegExp`, and `Error` are handled explicitly to avoid false warnings.

## How to reproduce

```bash
pnpm install
pnpm storybook
```

Then, **in this exact order**:

1. Click **"Bug/Chat > Default"** — renders fine (first load, ref.current is null)
2. Click **"Bug/Chat > Loading"** — browser freezes (ref.current now points to DOM element)
3. Kill the tab, reopen Storybook, click **"Bug/Chat > WorkingWithRender"** — works fine regardless of navigation order

The difference: `WorkingWithRender` moves non-serializable values into the `render` function, so they never enter the args system.

## What makes args non-serializable

The `Chat` component takes a `fetcher` prop modeled after Remix's `useFetcher()`:

```typescript
interface ChatFetcher {
  submit: (data: FormData) => void;        // function
  Form: React.ComponentType<{ children }>; // React component (also a function)
  state: "idle" | "loading";
}
```

And a `formRef`:

```typescript
formRef: RefObject<HTMLFormElement | null>; // ref object → becomes DOM element after render
```

## Workaround

Move non-serializable values out of `args` and into the `render` function:

```tsx
// freezes
export const Default: Story = {
  args: {
    fetcher: createMockFetcher(),
    formRef: createRef(),
  },
};

// works
export const Safe: Story = {
  args: { placeholder: "Type here..." },
  render: (args) => (
    <Chat {...args} fetcher={createMockFetcher()} formRef={createRef()} />
  ),
};
```

## Related issues

All caused by the same root cause — `inferType()` recursing into non-plain objects:

- [#33821](https://github.com/storybookjs/storybook/issues/33821) — Browser freeze with non-serializable args (2025)
- [#17098](https://github.com/storybookjs/storybook/issues/17098) — Infinite loop with array of objects in args (2021)
- [#19575](https://github.com/storybookjs/storybook/issues/19575) — Array/object with JSX elements causes hang (2022)
- [#28750](https://github.com/storybookjs/storybook/issues/28750) — Story with array holding JSX freezes (2024)
- [#17482](https://github.com/storybookjs/storybook/issues/17482) — Passing multiple components as array props crashes (2021)
- [#16855](https://github.com/storybookjs/storybook/issues/16855) — Circular structure to JSON for Angular class instance (2022)

Possibly related (different code path):

- [#29381](https://github.com/storybookjs/storybook/issues/29381) — Circular structure to JSON in docs hover (2024)

## Stack

- React 19, TypeScript, Vite
- Storybook 10.2.8
