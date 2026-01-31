import { useEffect, useMemo, useState } from "react";
import { Button, Card, DatePicker, Descriptions, Input, Modal, Select, Space, Table, Tag, Toast, Typography } from "@douyinfe/semi-ui-19";
import { IconDownload, IconRefresh, IconSearch } from "@douyinfe/semi-icons";

import PageHeader from "@/components/admin/PageHeader";
import { apiJson } from "@/lib/api";
import { auditActionLabel, auditEntityLabel, auditFieldLabel } from "@/lib/auditLabels";
import { formatDateTime, toYmd } from "@/lib/date";

const { Text } = Typography;

type AuditLogRow = {
  id: number;
  actorId: number | null;
  actorUsername: string | null;
  action: string;
  entity: string;
  entityId: string;
  campaignId: number | null;
  campaignName: string | null;
  campaignEffectiveDate: string | null;
  employeeId: number | null;
  employeeName: string | null;
  employeeDept: string | null;
  targetAdminUsername: string | null;
  reason: string | null;
  beforeJson: unknown | null;
  afterJson: unknown | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

function fmtVal(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > 120 ? `${s.slice(0, 120)}...` : s;
  } catch {
    return String(v);
  }
}

function buildChangeSummary(before: unknown, after: unknown): string {
  if (!after || typeof after !== "object") return "";
  const a = after as Record<string, unknown>;
  const b = before && typeof before === "object" ? (before as Record<string, unknown>) : {};

  const keys = Object.keys(a);
  if (!keys.length) return "";

  const parts: string[] = [];
  for (const k of keys) {
    const av = a[k];
    const bv = b[k];
    if (fmtVal(av) === fmtVal(bv)) continue;
    parts.push(`${auditFieldLabel(k)}: ${fmtVal(bv)} -> ${fmtVal(av)}`);
  }
  return parts.join("；");
}

function prettyJson(v: unknown): string {
  if (v == null) return "";
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export default function AuditLogsPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AuditLogRow[]>([]);
  const [detail, setDetail] = useState<AuditLogRow | null>(null);

  const [keyword, setKeyword] = useState("");
  const [entityFilter, setEntityFilter] = useState<string>("");
  const [actionFilter, setActionFilter] = useState<string>("");
  const [actorId, setActorId] = useState<string>("");
  const [campaignId, setCampaignId] = useState<string>("");
  const [fromDate, setFromDate] = useState<any>(null);
  const [toDate, setToDate] = useState<any>(null);

  function buildQuery() {
    const qs = new URLSearchParams();
    if (entityFilter) qs.set("entity", entityFilter);
    if (actionFilter) qs.set("action", actionFilter);
    if (actorId.trim()) qs.set("actorId", actorId.trim());
    if (campaignId.trim()) qs.set("campaignId", campaignId.trim());

    const from = toYmd(fromDate);
    const to = toYmd(toDate);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);

    qs.set("limit", "800");
    return qs.toString();
  }

  async function refresh() {
    setLoading(true);
    try {
      const qs = buildQuery();
      const res = await apiJson<AuditLogRow[]>(`/api/admin/audit-logs${qs ? `?${qs}` : ""}`);
      if (!res.ok) {
        Toast.error(res.message);
        return;
      }
      setData(res.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entities = useMemo(() => {
    const s = new Set<string>();
    for (const r of data) s.add(r.entity);
    return Array.from(s).sort();
  }, [data]);

  const actions = useMemo(() => {
    const s = new Set<string>();
    for (const r of data) s.add(r.action);
    return Array.from(s).sort();
  }, [data]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return data;
    return data.filter((r) => {
      const hay = `${r.actorUsername ?? ""} ${r.actorId ?? ""} ${r.targetAdminUsername ?? ""} ${r.action} ${r.entity} ${r.entityId} ${r.campaignId ?? ""} ${r.campaignName ?? ""} ${r.employeeName ?? ""} ${r.employeeDept ?? ""} ${r.reason ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data, keyword]);

  const columns = useMemo(
    () => [
      { title: "时间", dataIndex: "createdAt", width: 190, render: (v: string) => formatDateTime(v) },
      {
        title: "操作者",
        dataIndex: "actorUsername",
        width: 200,
        render: (_: unknown, r: AuditLogRow) => (
          <Space spacing="tight">
            <Text>{r.actorUsername ?? "-"}</Text>
            {r.actorId ? <Tag color="grey">#{r.actorId}</Tag> : <Tag color="light-blue">匿名</Tag>}
          </Space>
        ),
      },
      {
        title: "动作",
        dataIndex: "action",
        width: 220,
        render: (v: string) => (
          <Space spacing="tight">
            <Tag color="blue">{auditActionLabel(v)}</Tag>
            <Text type="tertiary" style={{ fontSize: 12 }}>
              {v}
            </Text>
          </Space>
        ),
      },
      {
        title: "对象",
        dataIndex: "entity",
        width: 200,
        render: (v: string) => (
          <Space spacing="tight">
            <Tag color="grey">{auditEntityLabel(v)}</Tag>
            <Text type="tertiary" style={{ fontSize: 12 }}>
              {v}
            </Text>
          </Space>
        ),
      },
      {
        title: "关联信息",
        dataIndex: "entityId",
        render: (_: unknown, r: AuditLogRow) => {
          const parts: string[] = [];
          if (r.campaignName) {
            const suffix = r.campaignEffectiveDate ? `（生效：${r.campaignEffectiveDate}）` : "";
            parts.push(`活动：${r.campaignName}${suffix}`);
          } else if (r.campaignId) {
            parts.push(`活动ID：${r.campaignId}`);
          }

          if (r.employeeName) parts.push(`人员：${r.employeeDept ?? ""}${r.employeeDept ? " / " : ""}${r.employeeName}`);
          else if (r.employeeId) parts.push(`人员ID：${r.employeeId}`);

          if (r.targetAdminUsername) parts.push(`目标账号：${r.targetAdminUsername}`);

          if (!parts.length && r.entityId) parts.push(`对象ID：${r.entityId}`);
          return (
            <Space vertical spacing="tight" style={{ width: "100%" }}>
              {parts.length ? parts.map((p) => <Text key={p}>{p}</Text>) : <Text type="tertiary">-</Text>}
            </Space>
          );
        },
      },
      {
        title: "变更摘要",
        dataIndex: "afterJson",
        render: (_: unknown, r: AuditLogRow) => {
          const s = buildChangeSummary(r.beforeJson, r.afterJson);
          return s ? <Text>{s}</Text> : <Text type="tertiary">-</Text>;
        },
      },
      { title: "原因", dataIndex: "reason", width: 240, render: (v: string | null) => (v ? <Text>{v}</Text> : <Text type="tertiary">-</Text>) },
      {
        title: "详情",
        dataIndex: "id",
        width: 90,
        render: (_: unknown, r: AuditLogRow) => (
          <Button type="tertiary" size="small" onClick={() => setDetail(r)}>
            查看
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <Space vertical style={{ width: "100%" }} spacing="medium">
      <PageHeader
        title="审计日志"
        subtitle="记录关键操作：创建/修改/导入/发布/删除/修正/登录/员工查询等，支持筛选与导出。"
        actions={
          <Space>
            <Button
              type="tertiary"
              icon={<IconDownload />}
              onClick={() => {
                const qs = buildQuery();
                window.open(`/api/admin/audit-logs/export${qs ? `?${qs}` : ""}`, "_blank");
              }}
            >
              导出
            </Button>
            <Button type="tertiary" icon={<IconRefresh />} loading={loading} onClick={() => void refresh()}>
              刷新
            </Button>
          </Space>
        }
      />

      <Card>
        <Space style={{ width: "100%", justifyContent: "space-between" }} align="start">
          <Space wrap>
            <Input
              prefix={<IconSearch />}
              showClear
              value={keyword}
              onChange={(v) => setKeyword(v)}
              placeholder="本地搜索：操作者/动作/对象/活动/人员/原因"
              style={{ width: 320 }}
            />
            <Input showClear value={campaignId} onChange={(v) => setCampaignId(String(v))} placeholder="活动ID（筛选）" style={{ width: 160 }} />
            <Input showClear value={actorId} onChange={(v) => setActorId(String(v))} placeholder="操作者ID（筛选）" style={{ width: 160 }} />
            <DatePicker type="date" format="yyyy-MM-dd" value={fromDate} onChange={(v) => setFromDate(v)} placeholder="开始日期" />
            <DatePicker type="date" format="yyyy-MM-dd" value={toDate} onChange={(v) => setToDate(v)} placeholder="结束日期" />

            <Select
              showClear
              value={entityFilter || undefined}
              onChange={(v) => setEntityFilter(String(v ?? ""))}
              placeholder="对象（筛选）"
              style={{ width: 200 }}
              optionList={[
                { label: "全部对象", value: "" },
                ...entities.map((e) => ({ label: `${auditEntityLabel(e)}（${e}）`, value: e })),
              ]}
            />
            <Select
              showClear
              value={actionFilter || undefined}
              onChange={(v) => setActionFilter(String(v ?? ""))}
              placeholder="动作（筛选）"
              style={{ width: 240 }}
              optionList={[
                { label: "全部动作", value: "" },
                ...actions.map((a) => ({ label: `${auditActionLabel(a)}（${a}）`, value: a })),
              ]}
            />

            <Button
              type="tertiary"
              onClick={() => {
                setKeyword("");
                setEntityFilter("");
                setActionFilter("");
                setActorId("");
                setCampaignId("");
                setFromDate(null);
                setToDate(null);
              }}
            >
              重置
            </Button>
            <Button type="primary" onClick={() => void refresh()}>
              应用筛选
            </Button>
          </Space>

          <Text type="tertiary" className="app-page-subtitle">
            当前加载 {data.length} 条，本地匹配 {filtered.length} 条
          </Text>
        </Space>

        <div style={{ marginTop: 12 }}>
          <Table columns={columns} dataSource={filtered} loading={loading} rowKey="id" pagination={{ pageSize: 20 }} empty={<Text type="tertiary">暂无日志</Text>} />
        </div>
      </Card>

      <Modal
        title={detail ? `${auditActionLabel(detail.action)}（#${detail.id}）` : "详情"}
        visible={!!detail}
        onCancel={() => setDetail(null)}
        footer={
          <Button type="primary" onClick={() => setDetail(null)}>
            关闭
          </Button>
        }
        style={{ width: 900, maxWidth: "92vw" }}
      >
        {detail ? (
          <Space vertical spacing="medium" style={{ width: "100%" }}>
            <Descriptions
              data={[
                { key: "时间", value: formatDateTime(detail.createdAt) },
                { key: "操作者", value: `${detail.actorUsername ?? "-"}${detail.actorId ? ` (#${detail.actorId})` : ""}` },
                { key: "动作", value: `${auditActionLabel(detail.action)}（${detail.action}）` },
                { key: "对象", value: `${auditEntityLabel(detail.entity)}（${detail.entity}）` },
                { key: "对象ID", value: detail.entityId || "-" },
                { key: "活动", value: detail.campaignName ? `${detail.campaignName}${detail.campaignEffectiveDate ? `（生效：${detail.campaignEffectiveDate}）` : ""}` : detail.campaignId ? String(detail.campaignId) : "-" },
                { key: "人员", value: detail.employeeName ? `${detail.employeeDept ?? ""}${detail.employeeDept ? " / " : ""}${detail.employeeName}` : detail.employeeId ? String(detail.employeeId) : "-" },
                { key: "目标账号", value: detail.targetAdminUsername || "-" },
                { key: "原因", value: detail.reason || "-" },
                { key: "IP", value: detail.ip || "-" },
                { key: "User-Agent", value: detail.userAgent || "-" },
              ]}
            />

            <Card>
              <Text strong>变更摘要</Text>
              <div style={{ marginTop: 8 }}>
                {buildChangeSummary(detail.beforeJson, detail.afterJson) ? (
                  <Text>{buildChangeSummary(detail.beforeJson, detail.afterJson)}</Text>
                ) : (
                  <Text type="tertiary">-</Text>
                )}
              </div>
            </Card>

            <Space style={{ width: "100%" }} align="start" spacing="medium">
              <Card style={{ flex: 1 }}>
                <Text strong>Before</Text>
                <pre style={{ marginTop: 8, maxHeight: 320, overflow: "auto", fontSize: 12 }}>{prettyJson(detail.beforeJson)}</pre>
              </Card>
              <Card style={{ flex: 1 }}>
                <Text strong>After</Text>
                <pre style={{ marginTop: 8, maxHeight: 320, overflow: "auto", fontSize: 12 }}>{prettyJson(detail.afterJson)}</pre>
              </Card>
            </Space>
          </Space>
        ) : null}
      </Modal>
    </Space>
  );
}
