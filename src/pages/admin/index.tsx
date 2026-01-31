import dynamic from "next/dynamic";

const AdminHomePage = dynamic(() => import("@/features/admin/AdminHomePage"), { ssr: false });

export default AdminHomePage;

