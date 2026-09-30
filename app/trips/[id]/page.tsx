import TripScreen from "@/components/trip/TripScreen";

export default async function TripPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TripScreen tripId={id} />;
}
