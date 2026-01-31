import dynamic from "next/dynamic";

const AuditLogsPage = dynamic(() => import("@/features/admin/AuditLogsPage"), { ssr: false });

export default AuditLogsPage;

