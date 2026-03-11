import dynamic from "next/dynamic";

// Chargement client-only (canvas, window, etc.)
const FutureVisionSuite = dynamic(
  () => import("@/components/FutureVisionSuite"),
  { ssr: false }
);

export default function Home() {
  return <FutureVisionSuite />;
}
