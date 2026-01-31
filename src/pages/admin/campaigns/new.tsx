import dynamic from "next/dynamic";

const NewCampaignPage = dynamic(() => import("@/features/admin/campaigns/NewCampaignPage"), { ssr: false });

export default NewCampaignPage;

