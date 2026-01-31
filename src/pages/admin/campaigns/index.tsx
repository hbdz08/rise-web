import dynamic from "next/dynamic";

const CampaignsPage = dynamic(() => import("@/features/admin/campaigns/CampaignsPage"), { ssr: false });

export default CampaignsPage;

