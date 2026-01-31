import dynamic from "next/dynamic";

const QueryPage = dynamic(() => import("@/features/query/QueryPage"), { ssr: false });

export default QueryPage;

