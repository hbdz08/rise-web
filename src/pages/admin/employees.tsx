import dynamic from "next/dynamic";

const EmployeesPage = dynamic(() => import("@/features/admin/EmployeesPage"), { ssr: false });

export default EmployeesPage;

