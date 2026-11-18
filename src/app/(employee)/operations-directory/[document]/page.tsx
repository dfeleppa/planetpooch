import Directory from "../Directory";

export default async function CategoryPage({ params }: PageProps<"/operations-directory/[document]">) {
  const { document } = await params;
  return <Directory slug={document} />;
}
