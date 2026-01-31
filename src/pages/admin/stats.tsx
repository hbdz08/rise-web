import dynamic from "next/dynamic";

const StatsPage = dynamic(() => import("@/features/admin/StatsPage"), { ssr: false });

export default StatsPage;

