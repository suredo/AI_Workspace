"use client";

import { useRef, useState, type ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function CodeBlock({ children }: ComponentProps<"pre">) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const text = preRef.current?.innerText ?? "";
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 rounded-md border border-gray-300 bg-white px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <pre ref={preRef}>{children}</pre>
    </div>
  );
}

function MarkdownLink(props: ComponentProps<"a">) {
  return <a {...props} target="_blank" rel="noopener noreferrer" />;
}

function MarkdownTable({ children }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table>{children}</table>
    </div>
  );
}

export default function MarkdownContent({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ pre: CodeBlock, a: MarkdownLink, table: MarkdownTable }}
      >
        {content}
      </ReactMarkdown>
      {streaming && (
        <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-current align-middle" />
      )}
    </div>
  );
}
