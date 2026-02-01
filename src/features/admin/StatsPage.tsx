import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { Banner, Button, Card, Select, Space, Switch, Table, Tag, Toast, Typography } from "@douyinfe/semi-ui-19";
import { IconHistogram, IconRefresh } from "@douyinfe/semi-icons";

import PageHeader from "@/components/admin/PageHeader";
import { apiJson } from "@/lib/api";
import { readAdminAuthFromStorage } from "@/lib/auth";
import { formatDate } from "@/lib/date";
import type { AdminRole } from "@/lib/roles";

type CampaignListItem = {
  id: number;
  name: string;
  effectiveDate: string;
  status: "draft" | "published" | "archived";
  publishedAt: string | null;
};

type Kind = "raise" | "cut";

type LeaderboardRow = {
  employeeId: number;
  name: string;
  dept: string;
  amount: string;
  itemsCount: number;
  campaignsCount: number;
};

type LeaderboardPayload = {
  scope: "campaign" | "all";
  kind: Kind;
  includeDraft: boolean;
  limit: number;
  campaignId?: number;
  rows: LeaderboardRow[];
};

const { Title, Text } = Typography;

function kindLabel(k: Kind): string {
  return k === "raise" ? "调薪" : "降薪";
}

function kindTagColor(k: Kind): "green" | "orange" {
  return k === "raise" ? "green" : "orange";
}

function formatAmount(amount: string): { text: string; color: "green" | "orange" | "grey" } {
  const n = Number(amount);
  if (!Number.isFinite(n)) return { text: String(amount), color: "grey" };
  if (n > 0) return { text: `+${Math.abs(n).toFixed(2)}`, color: "green" };
  if (n < 0) return { text: `-${Math.abs(n).toFixed(2)}`, color: "orange" };
  return { text: "0.00", color: "grey" };
}

export default function StatsPage() {
  const router = useRouter();

  const [role] = useState<AdminRole | null>(() => {
    if (typeof window === "undefined") return null;
    return readAdminAuthFromStorage(localStorage)?.role ?? null;
  });
  const isAdmin = role === "HR_ADMIN";

  const [loading, setLoading] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([]);

  const [includeDraft, setIncludeDraft] = useState(false);
  const [limit, setLimit] = useState(20);

  const [campaignId, setCampaignId] = useState<number | null>(null);
  const [campaignKind, setCampaignKind] = useState<Kind>("raise");
  const [allKind, setAllKind] = useState<Kind>("raise");

  const [campaignBoard, setCampaignBoard] = useState<LeaderboardPayload | null>(null);
  const [allBoard, setAllBoard] = useState<LeaderboardPayload | null>(null);

  async function refreshCampaigns() {
    const res = await apiJson<CampaignListItem[]>("/api/admin/campaigns");
    if (!res.ok) {
      Toast.error(res.message);
      return;
    }
    setCampaigns(res.data);
  }

  async function refreshLeaderboards(next?: { campaignId?: number | null }) {
    const cid = next?.campaignId ?? campaignId;
    if (!cid) return;

    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("scope", "campaign");
      qs.set("campaignId", String(cid));
      qs.set("kind", campaignKind);
      qs.set("limit", String(limit));
      if (includeDraft) qs.set("includeDraft", "1");

      const res = await apiJson<{ rows: LeaderboardPayload["rows"] } & Omit<LeaderboardPayload, "rows">>(
        `/api/admin/stats/leaderboard?${qs.toString()}`,
      );
      if (!res.ok) {
        Toast.error(res.message);
        return;
      }
      setCampaignBoard(res.data);
    } finally {
      setLoading(false);
    }
  }

  async function refreshAllLeaderboard() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("scope", "all");
      qs.set("kind", allKind);
      qs.set("limit", String(limit));
      if (includeDraft) qs.set("includeDraft", "1");

      const res = await apiJson<{ rows: LeaderboardPayload["rows"] } & Omit<LeaderboardPayload, "rows">>(
        `/api/admin/stats/leaderboard?${qs.toString()}`,
      );
      if (!res.ok) {
        Toast.error(res.message);
        return;
      }
      setAllBoard(res.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshCampaigns();
  }, []);

  useEffect(() => {
    if (!campaigns.length) return;
    // Default: the newest campaign (regardless of status). It's useful in drafts before publishing.
    if (campaignId == null) setCampaignId(campaigns[0].id);
  }, [campaignId, campaigns]);

  useEffect(() => {
    void refreshAllLeaderboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allKind, includeDraft, limit]);

  useEffect(() => {
    void refreshLeaderboards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, campaignKind, includeDraft, limit]);

  const campaignOptions = useMemo(() => {
    return campaigns.map((c) => ({
      label: `${c.name}（${formatDate(c.effectiveDate)}）`,
      value: c.id,
      status: c.status,
    }));
  }, [campaigns]);

  const selectedCampaign = useMemo(() => {
    if (!campaignId) return null;
    return campaigns.find((c) => c.id === campaignId) ?? null;
  }, [campaignId, campaigns]);

  const selectedCampaignStatusTag = useMemo(() => {
    if (!selectedCampaign) return null;
    if (selectedCampaign.status === "draft") return <Tag color="blue">草稿</Tag>;
    if (selectedCampaign.status === "published") return <Tag color="green">已发布</Tag>;
    return <Tag color="grey">已归档</Tag>;
  }, [selectedCampaign]);

  const tableColumns = useMemo(
    () => [
      {
        title: "排名",
        dataIndex: "employeeId",
        width: 90,
        render: (_: unknown, __: LeaderboardRow, idx: number) => <Text strong>#{idx + 1}</Text>,
      },
      { title: "部门", dataIndex: "dept", width: 220 },
      { title: "姓名", dataIndex: "name", width: 180 },
      {
        title: "调薪金额(元)",
        dataIndex: "amount",
        render: (v: string) => {
          const { text, color } = formatAmount(v);
          return <Tag color={color}>{text}</Tag>;
        },
      },
    ],
    [],
  );

  return (
    <Space vertical style={{ width: "100%" }} spacing="medium">
      <PageHeader
        title="统计分析"
        subtitle="查看某个活动的调薪/降薪排行，以及所有活动的累计排行。"
        backHref="/admin"
        backText="返回仪表盘"
        actions={
          <Space>
            <Button icon={<IconHistogram />} type="tertiary" onClick={() => router.push("/admin/campaigns")}>
              去活动管理
            </Button>
            <Button icon={<IconRefresh />} type="tertiary" loading={loading} onClick={() => void refreshCampaigns()}>
              刷新活动列表
            </Button>
          </Space>
        }
      />

      <Card>
        <Space style={{ width: "100%", justifyContent: "space-between" }} align="center">
          <div>
            <Title heading={5} style={{ marginTop: 0, marginBottom: 2 }}>
              筛选
            </Title>
            <Text type="tertiary" className="app-page-subtitle">
              默认仅统计已发布/已归档活动；如需查看草稿数据可打开「包含草稿」。
            </Text>
          </div>
          <Space>
            <Text type="tertiary" className="app-page-subtitle">
              包含草稿
            </Text>
            <Switch checked={includeDraft} onChange={(v) => setIncludeDraft(Boolean(v))} />
            <Select
              style={{ width: 140 }}
              value={limit}
              onChange={(v) => setLimit(Number(v))}
              optionList={[
                { label: "Top 10", value: 10 },
                { label: "Top 20", value: 20 },
                { label: "Top 50", value: 50 },
              ]}
            />
          </Space>
        </Space>
      </Card>

      <Space wrap spacing="medium" style={{ width: "100%" }}>
        <Card style={{ flex: "1 1 520px", minWidth: 420 }}>
          <Space style={{ width: "100%", justifyContent: "space-between" }} align="start">
            <div>
              <Title heading={5} style={{ marginTop: 0, marginBottom: 2 }}>
                某个活动排行
              </Title>
              <Text type="tertiary" className="app-page-subtitle">
                {campaignId ? (
                  <>
                    当前展示：<Tag color={kindTagColor(campaignKind)}>{kindLabel(campaignKind)}</Tag>
                    {selectedCampaignStatusTag ? <span style={{ marginLeft: 8 }}>{selectedCampaignStatusTag}</span> : null}
                  </>
                ) : (
                  "请选择一个活动"
                )}
              </Text>
            </div>
            <Space>
              <Select
                style={{ width: 320 }}
                value={campaignId ?? undefined}
                placeholder="选择活动"
                optionList={campaignOptions.map((o) => ({
                  label: o.label,
                  value: o.value,
                }))}
                onChange={(v) => {
                  const id = Number(v);
                  setCampaignId(Number.isFinite(id) ? id : null);
                }}
              />
              <Select
                style={{ width: 140 }}
                value={campaignKind}
                optionList={[
                  { label: "调薪排行", value: "raise" },
                  { label: "降薪排行", value: "cut" },
                ]}
                onChange={(v) => setCampaignKind(String(v) as Kind)}
              />
            </Space>
          </Space>

          {selectedCampaign?.status === "draft" && !includeDraft ? (
            <div style={{ marginTop: 12 }}>
              <Banner
                type="warning"
                description="当前活动是草稿，默认不统计草稿数据。可在上方打开「包含草稿」后查看排行。"
              />
            </div>
          ) : null}

          <div style={{ marginTop: 12 }}>
            <Table
              columns={tableColumns}
              dataSource={campaignBoard?.rows ?? []}
              rowKey={(r) => (r ? String(r.employeeId) : String(Math.random()))}
              pagination={false}
              loading={loading}
              empty={<Text type="tertiary">暂无数据</Text>}
            />
          </div>
        </Card>

        <Card style={{ flex: "1 1 520px", minWidth: 420 }}>
          <Space style={{ width: "100%", justifyContent: "space-between" }} align="start">
            <div>
              <Title heading={5} style={{ marginTop: 0, marginBottom: 2 }}>
                所有活动累计排行
              </Title>
              <Text type="tertiary" className="app-page-subtitle">
                按员工累计调薪金额汇总（同一员工跨多个活动会累加）。
              </Text>
            </div>
            <Space>
              <Select
                style={{ width: 140 }}
                value={allKind}
                optionList={[
                  { label: "调薪累计", value: "raise" },
                  { label: "降薪累计", value: "cut" },
                ]}
                onChange={(v) => setAllKind(String(v) as Kind)}
              />
            </Space>
          </Space>

          <div style={{ marginTop: 12 }}>
            <Table
              columns={[
                ...tableColumns,
                {
                  title: "调薪次数",
                  dataIndex: "itemsCount",
                  width: 110,
                },
                {
                  title: "涉及活动数",
                  dataIndex: "campaignsCount",
                  width: 120,
                },
              ]}
              dataSource={allBoard?.rows ?? []}
              rowKey={(r) => (r ? String(r.employeeId) : String(Math.random()))}
              pagination={false}
              loading={loading}
              empty={<Text type="tertiary">暂无数据</Text>}
            />
          </div>
        </Card>
      </Space>

      {!isAdmin ? (
        <Card>
          <Text type="tertiary" className="app-page-subtitle">
            提示：发布/删除等敏感操作仅管理员可用。你当前角色为「录入员」，可查看统计但不能发布活动。
          </Text>
        </Card>
      ) : null}
    </Space>
  );
}
