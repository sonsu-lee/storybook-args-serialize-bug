import { type RefObject, type ReactNode } from "react";

export interface ChatFetcher {
  submit: (data: FormData) => void;
  Form: React.ComponentType<{ children: ReactNode }>; // non-serializable (function)
  state: "idle" | "loading";
}

export interface ChatProps {
  fetcher: ChatFetcher;
  formRef: RefObject<HTMLFormElement | null>; // non-serializable (ref)
  placeholder?: string;
}

export function Chat({
  fetcher,
  formRef,
  placeholder = "Type a message...",
}: ChatProps) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    fetcher.submit(formData);
  };

  return (
    <fetcher.Form>
      <form ref={formRef} onSubmit={handleSubmit}>
        <input name="message" placeholder={placeholder} />
        <button type="submit" disabled={fetcher.state === "loading"}>
          Send
        </button>
      </form>
    </fetcher.Form>
  );
}
