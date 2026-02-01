import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { Avatar, Button, Dropdown, Layout, LocaleProvider, Nav, Typography } from "@douyinfe/semi-ui-19";
import { IconCalendar, IconExit, IconHistogram, IconHome, IconKey, IconList, IconSetting, IconUser } from "@douyinfe/semi-icons";

import zhCN from "@douyinfe/semi-ui-19/lib/es/locale/source/zh_CN";

import ThemeToggle from "@/components/ThemeToggle";
import { apiJson } from "@/lib/api";
import { clearAdminAuthFromStorage, readAdminAuthFromStorage } from "@/lib/auth";
import type { AdminRole } from "@/lib/roles";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

type Props = {
  children: React.ReactNode;
};

type NavItemKey =
  | "/admin"
  | "/admin/employees"
  | "/admin/campaigns"
  | "/admin/stats"
  | "/admin/audit-logs"
  | "/admin/users";

function pickSelectedKey(pathname: string): NavItemKey {
  if (pathname.startsWith("/admin/employees")) return "/admin/employees";
  if (pathname.startsWith("/admin/campaigns")) return "/admin/campaigns";
  if (pathname.startsWith("/admin/stats")) return "/admin/stats";
  if (pathname.startsWith("/admin/audit-logs")) return "/admin/audit-logs";
  if (pathname.startsWith("/admin/users")) return "/admin/users";
  return "/admin";
}

function roleLabel(role: AdminRole): string {
  return role === "HR_ADMIN" ? "管理员" : "录入员";
}

export default function AdminLayout({ children }: Props) {
  const router = useRouter();
  const selectedKey = useMemo(() => pickSelectedKey(router.pathname), [router.pathname]);

  const [auth] = useState(() => {
    if (typeof window === "undefined") return null;
    return readAdminAuthFromStorage(localStorage);
  });
  const username = auth?.username ?? "-";
  const role = auth?.role ?? null;

  const navItems = useMemo(() => {
    const items: Array<{ itemKey: NavItemKey; text: string; icon: React.ReactNode }> = [
      { itemKey: "/admin", text: "仪表盘", icon: <IconHome /> },
      { itemKey: "/admin/employees", text: "人员管理", icon: <IconUser /> },
      { itemKey: "/admin/campaigns", text: "调薪活动", icon: <IconCalendar /> },
      { itemKey: "/admin/stats", text: "统计分析", icon: <IconHistogram /> },
      { itemKey: "/admin/audit-logs", text: "审计日志", icon: <IconList /> },
    ];
    if (role === "HR_ADMIN") {
      items.splice(3, 0, { itemKey: "/admin/users", text: "账号管理", icon: <IconSetting /> });
    }
    return items;
  }, [role]);

  return (
    <LocaleProvider locale={zhCN}>
      <Layout className="app-admin-root" style={{ height: "100%" }}>
        <Sider style={{ background: "transparent", padding: 16 }}>
          <div
            style={{
              padding: 14,
              borderRadius: 14,
              border: "1px solid var(--app-surface-border)",
              background: "var(--app-surface-bg)",
              boxShadow: "var(--app-surface-shadow)",
              marginBottom: 12,
            }}
          >
            <Text strong style={{ fontSize: 16 }}>
              调薪系统
            </Text>
            <div style={{ marginTop: 6 }}>
              <Text type="tertiary" className="app-page-subtitle">
                HR 后台管理
              </Text>
            </div>
          </div>

          <Nav
            style={{
              borderRadius: 14,
              overflow: "hidden",
              border: "1px solid var(--app-surface-border)",
              background: "var(--app-surface-bg)",
              boxShadow: "var(--app-surface-shadow)",
            }}
            selectedKeys={[selectedKey]}
            items={navItems}
            onSelect={({ itemKey }) => router.push(String(itemKey))}
            footer={{ collapseButton: true }}
          />
        </Sider>

        <Layout style={{ background: "transparent" }}>
          <Header
            style={{
              background: "transparent",
              padding: "16px 20px 0 0",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 12,
            }}
          >
            <ThemeToggle />

            <Dropdown
              trigger="click"
              position="bottomRight"
              zIndex={9999}
              render={
                <Dropdown.Menu>
                  <Dropdown.Item
                    icon={<IconExit />}
                    onClick={() => {
                      void (async () => {
                        await apiJson<unknown>("/api/admin/auth/logout", { method: "POST" });
                        clearAdminAuthFromStorage(localStorage);
                        router.replace("/admin/login");
                      })();
                    }}
                  >
                    退出登录
                  </Dropdown.Item>
                </Dropdown.Menu>
              }
            >
              {/* Wrap with span so the trigger always has a stable DOM node. */}
              <span style={{ display: "inline-flex" }}>
                {/* Avoid Button.icon => Semi renders IconButton (tooltip trigger may fail). */}
                <Button theme="borderless">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                    <Avatar size="small">{String(username ?? "U").slice(0, 1).toUpperCase()}</Avatar>
                    <UserText username={username} role={role} />
                  </span>
                </Button>
              </span>
            </Dropdown>
          </Header>

          <Content className="app-admin-main">
            <div className="app-admin-container">{children}</div>
          </Content>
        </Layout>
      </Layout>
    </LocaleProvider>
  );
}

function UserText({ username, role }: { username: string; role: AdminRole | null }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <IconKey />
      <span>
        {username}
        {role ? `（${roleLabel(role)}）` : ""}
      </span>
    </span>
  );
}
