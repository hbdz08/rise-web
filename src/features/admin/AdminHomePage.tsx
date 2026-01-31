import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/router";
import { Button, Card, Modal, Space, Tag, Toast, Typography } from "@douyinfe/semi-ui-19";
import { IconCalendar, IconDelete, IconHistogram, IconList, IconRefresh, IconSend, IconSetting, IconUser } from "@douyinfe/semi-icons";

import PageHeader from "@/components/admin/PageHeader";
import { apiJson } from "@/lib/api";
import { readAdminAuthFromStorage } from "@/lib/auth";
import { formatDate } from "@/lib/date";
import { roleLabel } from "@/lib/permissions";
import type { AdminRole } from "@/lib/roles";

const { Title, Text } = Typography;

type CampaignListItem = {
  id: number;
  name: string;
  effectiveDate: string;
  status: "draft" | "published" | "archived";
  publishedAt: string | null;
};

type EmployeeListItem = {
  id: number;
  status: "active" | "inactive";
};

function StatTile({
  label,
  value,
  desc,
  tone,
}: {
  label: string;
  value: string | number;
  desc?: string;
  tone?: "primary" | "success" | "warning";
}) {
  const bg =
    tone === "success"
      ? "rgba(52, 199, 89, 0.10)"
      : tone === "warning"
        ? "rgba(255, 149, 0, 0.12)"
        : "var(--app-accent-bg)";
  const border =
    tone === "success"
      ? "rgba(52, 199, 89, 0.25)"
      : tone === "warning"
        ? "rgba(255, 149, 0, 0.25)"
        : "var(--app-accent-border)";

  return (
    <div
      style={{
        flex: "1 1 220px",
        minWidth: 220,
        padding: 16,
        borderRadius: 14,
        border: `1px solid ${border}`,
        background: bg,
      }}
    >
      <Text type="tertiary" className="app-page-subtitle">
        {label}
      </Text>
      <Title heading={3} style={{ margin: "6px 0 2px 0" }}>
        {value}
      </Title>
      {desc ? (
        <Text type="tertiary" className="app-page-subtitle">
          {desc}
        </Text>
      ) : null}
    </div>
  );
}

export default function AdminHomePage() {
  const router = useRouter();

  const [role] = useState<AdminRole | null>(() => {
    if (typeof window === "undefined") return null;
    return readAdminAuthFromStorage(localStorage)?.role ?? null;
  });
  const isAdmin = role === "HR_ADMIN";

  const [loading, setLoading] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([]);
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);

  const [publishLoadingId, setPublishLoadingId] = useState<number | null>(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState<number | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [cRes, eRes] = await Promise.all([
        apiJson<CampaignListItem[]>("/api/admin/campaigns"),
        apiJson<EmployeeListItem[]>("/api/admin/employees"),
      ]);

      if (!cRes.ok) Toast.error(cRes.message);
      else setCampaigns(cRes.data);

      if (!eRes.ok) Toast.error(eRes.message);
      else setEmployees(eRes.data);
    } catch (e) {
      Toast.error(String(e instanceof Error ? e.message : "加载失败"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function publishCampaign(id: number) {
    if (!isAdmin) {
      Toast.warning("仅管理员可以发布活动");
      return;
    }

    Modal.confirm({
      title: "确认发布？",
      content: (
        <Space vertical spacing="tight">
          <Text type="tertiary">当前角色：{roleLabel(role)}</Text>
          <Text type="tertiary">
            发布后员工即可查询；金额/绩效将被锁定，后续只能由管理员填写原因（不少于 5 字）后修正。
          </Text>
        </Space>
      ),
      okText: "发布",
      cancelText: "取消",
      onOk: async () => {
        setPublishLoadingId(id);
        try {
          const res = await apiJson(`/api/admin/campaigns/${id}/publish`, { method: "POST" });
          if (!res.ok) {
            Toast.error(res.message);
            return;
          }
          Toast.success("已发布");
          void refresh();
        } finally {
          setPublishLoadingId(null);
        }
      },
    });
  }

  async function deleteCampaign(id: number) {
    Modal.confirm({
      title: "确认删除？",
      content: (
        <Space vertical spacing="tight">
          <Text type="tertiary">当前角色：{roleLabel(role)}</Text>
          <Text type="tertiary">仅草稿活动允许删除；该活动下的明细也会一并删除（不可恢复）。</Text>
        </Space>
      ),
      okText: "删除",
      cancelText: "取消",
      onOk: async () => {
        setDeleteLoadingId(id);
        try {
          const res = await apiJson(`/api/admin/campaigns/${id}`, { method: "DELETE" });
          if (!res.ok) {
            Toast.error(res.message);
            return;
          }
          Toast.success("已删除");
          void refresh();
        } finally {
          setDeleteLoadingId(null);
        }
      },
    });
  }

  const quickCards = useMemo(() => {
    const items: Array<{
      title: string;
      desc: string;
      icon: ReactNode;
      href: string;
      tag?: ReactNode;
    }> = [
      {
        title: "人员管理",
        desc: "维护员工信息、Excel 导入/导出",
        icon: <IconUser />,
        href: "/admin/employees",
      },
      {
        title: "涨薪活动",
        desc: "创建活动、录入/导入明细、发布后员工可查",
        icon: <IconCalendar />,
        href: "/admin/campaigns",
        tag: <Tag color="blue">核心</Tag>,
      },
      {
        title: "审计日志",
        desc: "追踪关键操作，便于回溯",
        icon: <IconList />,
        href: "/admin/audit-logs",
      },
      {
        title: "统计分析",
        desc: "查看活动/全局涨薪、降薪排行",
        icon: <IconHistogram />,
        href: "/admin/stats",
      },
    ];

    if (role === "HR_ADMIN") {
      items.push({
        title: "账号管理",
        desc: "新增/禁用账号、重置密码",
        icon: <IconSetting />,
        href: "/admin/users",
        tag: <Tag color="orange">管理员</Tag>,
      });
    }

    return items;
  }, [role]);

  const stats = useMemo(() => {
    const c = { total: campaigns.length, draft: 0, published: 0, archived: 0 };
    for (const r of campaigns) {
      if (r.status === "draft") c.draft++;
      else if (r.status === "published") c.published++;
      else c.archived++;
    }

    const e = { total: employees.length, active: 0, inactive: 0 };
    for (const r of employees) {
      if (r.status === "active") e.active++;
      else e.inactive++;
    }

    return { campaigns: c, employees: e };
  }, [campaigns, employees]);

  const draftCampaigns = useMemo(() => {
    return campaigns
      .filter((c) => c.status === "draft")
      .sort((a, b) => b.id - a.id)
      .slice(0, 6);
  }, [campaigns]);

  return (
    <Space vertical style={{ width: "100%" }} spacing="medium">
      <PageHeader
        title="仪表盘"
        subtitle="高频操作入口。建议：先导入人员 → 创建活动 → 录入/导入明细 → 发布。"
        backHref={null}
        actions={
          <Space>
            <Button type="tertiary" icon={<IconRefresh />} loading={loading} onClick={() => void refresh()}>
              刷新
            </Button>
            <Button type="primary" onClick={() => router.push("/admin/campaigns?create=1")}>
              创建活动
            </Button>
          </Space>
        }
      />

      <Card>
        <Title heading={5} style={{ marginTop: 0 }}>
          概览
        </Title>
        <Space wrap spacing="medium" style={{ width: "100%" }}>
          <StatTile label="活动总数" value={stats.campaigns.total} desc={`草稿 ${stats.campaigns.draft} / 已发布 ${stats.campaigns.published}`} />
          <StatTile label="待发布活动" value={stats.campaigns.draft} tone={stats.campaigns.draft ? "warning" : "success"} desc={stats.campaigns.draft ? "建议尽快发布，避免遗漏" : "当前没有待发布"} />
          <StatTile label="员工总数" value={stats.employees.total} desc={`启用 ${stats.employees.active} / 停用 ${stats.employees.inactive}`} />
          <StatTile label="系统提示" value={isAdmin ? "管理员" : "录入员"} desc={isAdmin ? "可发布/修正已发布活动" : "可录入草稿明细"} tone={isAdmin ? "primary" : "success"} />
        </Space>
      </Card>

      {campaigns.length === 0 ? (
        <Card>
          <Title heading={5} style={{ marginTop: 0 }}>
            还没有创建活动
          </Title>
          <Text type="tertiary" className="app-page-subtitle">
            先创建一个「草稿活动」，再录入/导入明细，最后发布给员工查询。
          </Text>
          <div style={{ marginTop: 12 }}>
            <Button type="primary" onClick={() => router.push("/admin/campaigns?create=1")}>
              立即创建活动
            </Button>
          </div>
        </Card>
      ) : (
        <Card>
          <Space style={{ width: "100%", justifyContent: "space-between" }} align="center">
            <div>
              <Title heading={5} style={{ marginTop: 0, marginBottom: 2 }}>
                待发布活动
              </Title>
              <Text type="tertiary" className="app-page-subtitle">
                仅草稿活动会展示在这里（最多显示 6 条）。
              </Text>
            </div>
            <Button type="tertiary" onClick={() => router.push("/admin/campaigns")}>
              查看全部
            </Button>
          </Space>

          {draftCampaigns.length === 0 ? (
            <div style={{ marginTop: 12 }}>
              <Tag color="green">全部已发布</Tag>
              <Text type="tertiary" className="app-page-subtitle" style={{ marginLeft: 8 }}>
                目前没有草稿活动。
              </Text>
            </div>
          ) : (
            <Space vertical spacing="tight" style={{ width: "100%", marginTop: 12 }}>
              {draftCampaigns.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid var(--app-surface-border)",
                    background: "var(--app-surface-bg)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <Space spacing="tight">
                      <Tag color="blue">草稿</Tag>
                      <Text strong style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 520 }}>
                        {c.name}
                      </Text>
                    </Space>
                    <div style={{ marginTop: 2 }}>
                      <Text type="tertiary" className="app-page-subtitle">
                        生效日期：{formatDate(c.effectiveDate)}
                      </Text>
                    </div>
                  </div>

                  <Space>
                    <Button size="small" type="tertiary" onClick={() => router.push(`/admin/campaigns/${c.id}`)}>
                      详情
                    </Button>
                    <Button size="small" type="primary" onClick={() => router.push(`/admin/campaigns/${c.id}/items`)}>
                      明细
                    </Button>
                    <Button
                      size="small"
                      type="warning"
                      icon={<IconSend />}
                      disabled={!isAdmin}
                      loading={publishLoadingId === c.id}
                      onClick={() => void publishCampaign(c.id)}
                    >
                      发布
                    </Button>
                    <Button
                      size="small"
                      type="danger"
                      icon={<IconDelete />}
                      loading={deleteLoadingId === c.id}
                      onClick={() => void deleteCampaign(c.id)}
                    >
                      删除
                    </Button>
                  </Space>
                </div>
              ))}
            </Space>
          )}
        </Card>
      )}

      <Space wrap spacing="medium" style={{ width: "100%" }}>
        {quickCards.map((c) => (
          <div
            key={c.href}
            role="button"
            tabIndex={0}
            onClick={() => void router.push(c.href)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") void router.push(c.href);
            }}
            style={{ width: 320, cursor: "pointer" }}
          >
            <Card>
            <Space style={{ width: "100%", justifyContent: "space-between" }} align="start">
              <Space>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--app-accent-bg)",
                    border: "1px solid var(--app-accent-border)",
                  }}
                >
                  {c.icon}
                </div>
                <div>
                  <Space>
                    <Title heading={5} style={{ margin: 0 }}>
                      {c.title}
                    </Title>
                    {c.tag ?? null}
                  </Space>
                  <Text type="tertiary" className="app-page-subtitle">
                    {c.desc}
                  </Text>
                </div>
              </Space>
            </Space>
            </Card>
          </div>
        ))}
      </Space>

      <Card>
        <Title heading={5} style={{ marginTop: 0 }}>
          操作提示
        </Title>
        <Space vertical spacing="tight">
          <Text type="tertiary" className="app-page-subtitle">
            1) 活动发布后普通 HR 不允许再修改金额/绩效；仅管理员可修正（必须填写原因不少于 5 字）。
          </Text>
          <Text type="tertiary" className="app-page-subtitle">
            2) 员工查询基于「身份证号 + 当前手机号 + 图形验证码」。手机号变更需先在人员管理里更新。
          </Text>
          <Text type="tertiary" className="app-page-subtitle">
            3) 同一员工在同一活动只允许一条记录（系统已强约束）。
          </Text>
        </Space>
      </Card>
    </Space>
  );
}
