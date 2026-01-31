import { useEffect, useMemo, useState } from "react";
import { Button, Card, Input, Select, Space, Table, Tag, Toast, Typography } from "@douyinfe/semi-ui-19";
import { IconRefresh, IconSearch } from "@douyinfe/semi-icons";

import PageHeader from "@/components/admin/PageHeader";
import { apiJson } from "@/lib/api";
import { formatDateTime } from "@/lib/date";

const { Text } = Typography;

type AuditLogRow = {
  id: number;
  action: string;
  entity: string;
  entityId: string;
  reason: string | null;
  createdAt: string;
};

export default function AuditLogsPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AuditLogRow[]>([]);

  const [keyword, setKeyword] = useState("");
  const [entityFilter, setEntityFilter] = useState<"all" | string>("all");
  const [actionFilter, setActionFilter] = useState<"all" | string>("all");

  async function refresh() {
    setLoading(true);
    try {
      const res = await apiJson<AuditLogRow[]>("/api/admin/audit-logs");
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
  }, []);

  const columns = useMemo(
    () => [
      { title: "时间", dataIndex: "createdAt", render: (v: string) => formatDateTime(v) },
      {
        title: "动作",
        dataIndex: "action",
        render: (v: string) => <Tag color="blue">{v}</Tag>,
      },
      {
        title: "对象",
        dataIndex: "entity",
        render: (v: string) => <Tag color="grey">{v}</Tag>,
      },
      { title: "对象ID", dataIndex: "entityId" },
      { title: "原因", dataIndex: "reason" },
    ],
    [],
  );

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
    return data.filter((r) => {
      if (entityFilter !== "all" && r.entity !== entityFilter) return false;
      if (actionFilter !== "all" && r.action !== actionFilter) return false;
      if (!q) return true;
      const hay = `${r.action} ${r.entity} ${r.entityId} ${r.reason ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data, keyword, entityFilter, actionFilter]);

  return (
    <Space vertical style={{ width: "100%" }} spacing="medium">
      <PageHeader
        title="审计日志"
        subtitle="记录关键操作（创建活动、导入、发布、管理员修正、账号变更等）。"
        actions={
          <Button type="tertiary" icon={<IconRefresh />} loading={loading} onClick={() => void refresh()}>
            刷新
          </Button>
        }
      />
      <Card>
        <Space style={{ width: "100%", justifyContent: "space-between" }} align="center">
          <Space wrap>
            <Input
              prefix={<IconSearch />}
              showClear
              value={keyword}
              onChange={(v) => setKeyword(v)}
              placeholder="搜索：动作 / 对象 / 对象ID / 原因"
              style={{ width: 360 }}
            />
            <Select
              value={entityFilter}
              onChange={(v) => setEntityFilter(String(v))}
              optionList={[{ label: "全部对象", value: "all" }, ...entities.map((e) => ({ label: e, value: e }))]}
              style={{ width: 180 }}
            />
            <Select
              value={actionFilter}
              onChange={(v) => setActionFilter(String(v))}
              optionList={[{ label: "全部动作", value: "all" }, ...actions.map((a) => ({ label: a, value: a }))]}
              style={{ width: 220 }}
            />
            <Button
              type="tertiary"
              onClick={() => {
                setKeyword("");
                setEntityFilter("all");
                setActionFilter("all");
              }}
            >
              重置
            </Button>
          </Space>
          <Text type="tertiary" className="app-page-subtitle">
            共 {data.length} 条，当前展示 {filtered.length} 条
          </Text>
        </Space>

        <div style={{ marginTop: 12 }}>
          <Table
            columns={columns}
            dataSource={filtered}
            loading={loading}
            rowKey="id"
            pagination={{ pageSize: 20 }}
            empty={<Text type="tertiary">暂无日志</Text>}
          />
        </div>
      </Card>
    </Space>
  );
}
