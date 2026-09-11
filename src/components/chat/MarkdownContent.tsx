"use client";

import {
  Children,
  isValidElement,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

/**
 * Minimal hast shape for the line-splitting plugin below.
 * Kept local so no extra hast/unist dependency is needed.
 */
interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: {
    className?: Array<string | number> | string;
    [key: string]: unknown;
  };
  children?: HastNode[];
}

/**
 * Split element children on newlines, cloning ancestor spans per line so
 * highlight markup survives. Returns one entry per visual line.
 */
function splitLines(children: HastNode[]): HastNode[][] {
  const lines: HastNode[][] = [[]];
  for (const child of children) {
    if (child.type === "text") {
      const parts = (child.value ?? "").split("\n");
      parts.forEach((part, index) => {
        if (index > 0) lines.push([]);
        if (part !== "") lines[lines.length - 1].push({ ...child, value: part });
      });
    } else if (child.children) {
      const nested = splitLines(child.children);
      nested.forEach((nestedLine, index) => {
        if (index > 0) lines.push([]);
        if (nestedLine.length > 0) {
          lines[lines.length - 1].push({ ...child, children: nestedLine });
        }
      });
    } else {
      lines[lines.length - 1].push({ ...child });
    }
  }
  return lines;
}

/**
 * rehype plugin: wrap each code line in `<span class="code-line">`.
 * Line numbers themselves are rendered via CSS counters, so copied text
 * and screen readers never see them.
 */
function rehypeCodeLines() {
  return (tree: HastNode) => {
    const visit = (node: HastNode) => {
      if (
        node.type === "element" &&
        node.tagName === "pre" &&
        node.children?.[0]?.type === "element" &&
        node.children[0].tagName === "code"
      ) {
        const code = node.children[0];
        const lines = splitLines(code.children ?? []);
        // Highlighted code ends with a newline; drop the trailing empty line.
        if (lines.length > 0 && lines[lines.length - 1].length === 0) {
          lines.pop();
        }
        code.children = lines.map((line) => ({
          type: "element",
          tagName: "span",
          properties: { className: ["code-line"] },
          children: line,
        }));
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

/** Extract the `language-xxx` class from the rendered <code> element. */
function languageOf(children: ReactNode): string | null {
  let language: string | null = null;
  Children.forEach(children, (child) => {
    if (isValidElement<{ className?: string }>(child)) {
      const match = /language-([\w+-]+)/.exec(child.props.className ?? "");
      if (match) language = match[1];
    }
  });
  return language;
}

/** Raw code text from the React tree (immune to CSS line numbers). */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode; className?: string }>(node)) {
    const text = textOf(node.props.children);
    // Each .code-line span is one visual line.
    return (node.props.className ?? "").split(" ").includes("code-line")
      ? text + "\n"
      : text;
  }
  return "";
}

function CodeBlock({ children }: ComponentProps<"pre">) {
  const [copied, setCopied] = useState(false);
  const language = languageOf(children);

  async function handleCopy() {
    const text = textOf(children).replace(/\n$/, "");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions, insecure context); stay silent.
    }
  }

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-block-language">{language ?? "code"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="code-block-copy"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>{children}</pre>
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
        rehypePlugins={[rehypeHighlight, rehypeCodeLines]}
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
