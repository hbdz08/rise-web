import dynamic from "next/dynamic";

const AdminUsersPage = dynamic(() => import("@/features/admin/AdminUsersPage"), { ssr: false });

export default AdminUsersPage;

