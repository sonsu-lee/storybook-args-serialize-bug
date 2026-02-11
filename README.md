# Storybook args serialization freeze

Minimal reproduction for a bug where Storybook freezes the browser tab when `args` contain non-serializable values (functions, React refs, React components as object properties).

No error message is shown. The tab just locks up.

## The bug

Passing non-serializable values through Storybook's `args` works fine on the first story load. But switching to another story with the same kind of args freezes the browser.

This happens because story switching triggers `STORY_ARGS_UPDATED`, which makes the Manager process call `telejson.stringify()` on the args. Non-serializable values cause an infinite loop in the stringify call, and since there's no try-catch around it, the main thread blocks indefinitely.

### Why only on story *switch*, not first load?

1. **First load** — args live in the Preview's in-process memory. No serialization happens. Everything works.
2. **Story switch** — Manager receives args via PostMessage channel, tries to serialize them for its internal state and the Controls panel. `telejson.stringify()` hits the non-serializable value, loops forever, tab dies.

## How to reproduce

```bash
pnpm install
pnpm storybook
```

Then, **in this exact order**:

1. Click **"Bug/Chat > Default"** — renders fine (first load, no serialization)
2. Click **"Bug/Chat > Loading"** — browser freezes (story switch triggers stringify)
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
formRef: RefObject<HTMLFormElement | null>; // ref object
```

None of these can survive `JSON.stringify` / `telejson.stringify`.

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

## Root cause in Storybook source (as of 10.x)

| Location | Problem |
|---|---|
| `PostMessageTransport.send()` — `code/core/src/channels/postmessage/index.ts` | `telejson.stringify()` call has no try-catch |
| `WebSocketTransport.sendNow()` — `code/core/src/channels/websocket/index.ts` | Same issue |
| `argsHash()` — `code/addons/docs/src/blocks/SourceContainer.tsx` | Uses `maxDepth: 50`, way too deep for complex objects |

## Related issues

- [#17098](https://github.com/storybookjs/storybook/issues/17098) (2021)
- [#19575](https://github.com/storybookjs/storybook/issues/19575) (2022)
- [#16855](https://github.com/storybookjs/storybook/issues/16855) (2024)
- [#29381](https://github.com/storybookjs/storybook/issues/29381) (2024)
- [#33802](https://github.com/storybookjs/storybook/issues/33802) (2025, 10.x)
- [#15718](https://github.com/storybookjs/storybook/issues/15718)

## Stack

- React 19, TypeScript, Vite
- Storybook 10.2.8
