import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";
import MarkdownRenderer from "@/components/MarkdownRenderer";

export default async function PublicArchivePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const post = await withDbRetry(
    () =>
      prisma.archivePost.findUnique({
        where: { shareToken: slug },
      }),
    { operation: `public-archive:get:${slug}` }
  );

  if (!post || post.visibility !== "EXTERNAL" || !post.shareEnabled) notFound();

  return (
    <div className="min-h-screen bg-white">
      <article className="max-w-3xl mx-auto px-6 py-12 md:py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-4 leading-tight">{post.title}</h1>
        <div className="mb-10 pb-8 border-b border-gray-100" />
        <MarkdownRenderer content={post.content} className="prose prose-gray max-w-none prose-headings:font-bold prose-a:text-indigo-600 prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded" />
      </article>
    </div>
  );
}
