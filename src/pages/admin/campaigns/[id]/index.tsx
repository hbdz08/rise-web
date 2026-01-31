import dynamic from "next/dynamic";

const CampaignDetailPage = dynamic(() => import("@/features/admin/campaigns/CampaignDetailPage"), { ssr: false });

export default CampaignDetailPage;

