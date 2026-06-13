import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeHighlight from "rehype-highlight";
import dayjs from "dayjs";
import "dayjs/locale/ko";
import Link from "next/link";

dayjs.locale("ko");

export default async function PublicArchivePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const post = await prisma.archivePost.findUnique({
    where: { slug },
    include: {
      author: { select: { name: true } },
      project: { select: { name: true } },
    },
  });

  if (!post || !post.published) notFound();

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-indigo-700">
            문화체육위원회
          </Link>
          <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
            {post.project.name}
          </span>
        </div>
      </header>

      {/* Article */}
      <article className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-4 leading-tight">{post.title}</h1>
        <div className="flex items-center gap-3 text-sm text-gray-400 mb-10 pb-8 border-b border-gray-100">
          <span className="font-medium text-gray-600">{post.author.name}</span>
          <span>·</span>
          <span>{dayjs(post.publishedAt ?? post.updatedAt).format("YYYY년 M월 D일")}</span>
        </div>
        <div className="prose prose-gray max-w-none prose-headings:font-bold prose-a:text-indigo-600 prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded">
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeHighlight]}>{post.content}</ReactMarkdown>
        </div>
      </article>

      <footer className="text-center py-8 text-xs text-gray-300 border-t border-gray-100 mt-12">
        문화체육위원회 아카이브
      </footer>
    </div>
  );
}
