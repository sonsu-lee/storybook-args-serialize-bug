import { createRef } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Chat, type ChatFetcher } from "./Chat";

function createMockFetcher(state: "idle" | "loading" = "idle"): ChatFetcher {
  return {
    submit: () => console.log("submitted"),
    Form: ({ children }) => <div>{children}</div>, // React component = function
    state,
  };
}

// args with non-serializable values
const meta = {
  title: "Bug/Chat",
  component: Chat,
  args: {
    fetcher: createMockFetcher(),
    formRef: createRef<HTMLFormElement>(),
    placeholder: "Type a message...",
  },
} satisfies Meta<typeof Chat>;

export default meta;
type Story = StoryObj<typeof meta>;

// Story A: renders fine on first click (no serialization needed for initial load)
export const Default: Story = {};

// Story B: switching from Default to this story causes browser freeze
// (Manager tries to stringify args via telejson → infinite loop on non-serializable values)
export const Loading: Story = {
  args: {
    fetcher: createMockFetcher("loading"),
    placeholder: "Sending...",
  },
};

// WORKAROUND: move non-serializable values into render function → bypasses args serialization
export const WorkingWithRender: Story = {
  args: { placeholder: "Type here..." },
  render: (args) => (
    <Chat {...args} fetcher={createMockFetcher()} formRef={createRef()} />
  ),
};
