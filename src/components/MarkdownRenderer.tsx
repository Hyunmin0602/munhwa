import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

const safeClassName = (value?: string | string[]) => (Array.isArray(value) ? value : value?.split(/\s+/) ?? [])
  .filter((className) => className.startsWith("md-"))
  .join(" ") || undefined;

const allowedTags = [...(defaultSchema.tagNames ?? []), "div", "section", "span", "figure", "figcaption", "details", "summary"];
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...new Set(allowedTags)],
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "className", "id", "title", "ariaLabel", "ariaDescribedBy"],
    div: [...(defaultSchema.attributes?.div ?? []), "className"],
    section: ["dataFootnotes", "className"],
    span: ["className"],
    figure: ["className"],
    figcaption: ["className"],
    a: [...(defaultSchema.attributes?.a ?? []), "href", "title", "target", "rel"],
    img: [...(defaultSchema.attributes?.img ?? []), "src", "alt", "width", "height", "loading"],
    td: [...(defaultSchema.attributes?.td ?? []), "colSpan", "rowSpan", "align"],
    th: [...(defaultSchema.attributes?.th ?? []), "colSpan", "rowSpan", "align"],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ["https", "mailto"],
    src: ["https"],
  },
};

function safeUrl(url: string) {
  if (url.startsWith("/")) return url;
  try {
    return new URL(url).protocol === "https:" ? url : "";
  } catch {
    return "";
  }
}

export default function MarkdownRenderer({ content, className }: { content: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeHighlight]}
        urlTransform={safeUrl}
        components={{
          a: ({ href, children, node, ...props }) => {
            void node;
            return <a {...props} href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
          },
          div: ({ className: value, node, ...props }) => {
            void node;
            return <div {...props} className={safeClassName(value)} />;
          },
          section: ({ className: value, node, ...props }) => {
            void node;
            return <section {...props} className={safeClassName(value)} />;
          },
          span: ({ className: value, node, ...props }) => {
            void node;
            return <span {...props} className={safeClassName(value)} />;
          },
          figure: ({ className: value, node, ...props }) => {
            void node;
            return <figure {...props} className={safeClassName(value)} />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
