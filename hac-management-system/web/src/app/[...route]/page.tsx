import Portal from "@/components/Portal";
export default async function Page({
  params,
}: {
  params: Promise<{ route: string[] }>;
}) {
  const { route } = await params;
  return <Portal route={route} />;
}
