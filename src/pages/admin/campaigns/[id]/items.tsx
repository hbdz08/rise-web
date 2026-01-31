import dynamic from "next/dynamic";

const CampaignItemsPage = dynamic(() => import("@/features/admin/campaigns/CampaignItemsPage"), { ssr: false });

export default CampaignItemsPage;

