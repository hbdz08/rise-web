import dynamic from "next/dynamic";

const AdminLoginPage = dynamic(() => import("@/features/admin/AdminLoginPage"), { ssr: false });

export default AdminLoginPage;

