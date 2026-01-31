import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { Button, Card, Form, Modal, Space, Table, Tag, Toast, Typography } from "@douyinfe/semi-ui-19";
import { IconDelete, IconPlus, IconRefresh, IconSend } from "@douyinfe/semi-icons";

import PageHeader from "@/components/admin/PageHeader";
import { apiJson } from "@/lib/api";
import { readAdminAuthFromStorage } from "@/lib/auth";
import { formatDate, toYmd } from "@/lib/date";
import type { AdminRole } from "@/lib/roles";

const { Text } = Typography;

type CampaignListItem = {
  id: number;
  name: string;
  effectiveDate: string;
  status: "draft" | "published" | "archived";
  publishedAt: string | null;
};

export default function CampaignsPage() {
  const router = useRouter();
  const [role] = useState<AdminRole | null>(() => {
    if (typeof window === "undefined") return null;
    return readAdminAuthFromStorage(localStorage)?.role ?? null;
  });
  const isAdmin = role === "HR_ADMIN";

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CampaignListItem[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  const [publishLoadingId, setPublishLoadingId] = useState<number | null>(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState<number | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await apiJson<CampaignListItem[]>("/api/admin/campaigns");
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

  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.create === "1") setCreateOpen(true);
  }, [router.isReady, router.query.create]);

  async function publishCampaign(id: number) {
    if (!isAdmin) {
      Toast.warning("仅管理员可以发布活动");
      return;
    }

    Modal.confirm({
      title: "确认发布？",
      content: "发布后员工即可查询；金额/绩效将被锁定，后续只能由管理员填写原因后修正。",
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
      content: "仅草稿活动允许删除；该活动下的明细也会一并删除。",
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

  const columns = useMemo(
    () => [
      { title: "活动名称", dataIndex: "name" },
      { title: "生效日期", dataIndex: "effectiveDate", render: (v: string) => formatDate(v) },
      {
        title: "状态",
        dataIndex: "status",
        render: (v: string) => {
          if (v === "draft") return <Tag color="blue">草稿</Tag>;
          if (v === "published") return <Tag color="green">已发布</Tag>;
          if (v === "archived") return <Tag color="grey">已归档</Tag>;
          return v;
        },
      },
      {
        title: "操作",
        dataIndex: "id",
        render: (id: number, record: CampaignListItem) => (
          <Space>
            <Link href={`/admin/campaigns/${id}`}>
              <Button size="small" type="tertiary">
                详情
              </Button>
            </Link>
            <Link href={`/admin/campaigns/${id}/items`}>
              <Button size="small" type="primary">
                明细
              </Button>
            </Link>

            {record.status === "draft" ? (
              <Button
                size="small"
                type="warning"
                icon={<IconSend />}
                disabled={!isAdmin}
                loading={publishLoadingId === id}
                onClick={() => void publishCampaign(id)}
              >
                发布
              </Button>
            ) : null}

            {record.status === "draft" ? (
              <Button
                size="small"
                type="danger"
                icon={<IconDelete />}
                loading={deleteLoadingId === id}
                onClick={() => void deleteCampaign(id)}
              >
                删除
              </Button>
            ) : null}
          </Space>
        ),
      },
    ],
    [deleteLoadingId, isAdmin, publishLoadingId],
  );

  return (
    <Space vertical style={{ width: "100%" }} spacing="medium">
      <PageHeader
        title="涨薪活动"
        subtitle="创建活动、录入明细、发布后员工可查。"
        backHref="/admin"
        backText="返回仪表盘"
        actions={
          <Space>
            <Button type="primary" icon={<IconPlus />} onClick={() => setCreateOpen(true)}>
              创建活动
            </Button>
            <Button type="tertiary" icon={<IconRefresh />} loading={loading} onClick={() => void refresh()}>
              刷新
            </Button>
          </Space>
        }
      />

      <Card>
        <Table
          columns={columns}
          dataSource={data}
          loading={loading}
          rowKey="id"
          pagination={{ pageSize: 20 }}
          empty={<Text type="tertiary">暂无活动</Text>}
        />
      </Card>

      <Modal
        title="创建活动"
        visible={createOpen}
        onCancel={() => setCreateOpen(false)}
        footer={null}
        closeOnEsc
        centered
        width={860}
      >
        <Form
          onSubmit={async (values) => {
            setCreateLoading(true);
            try {
              const body = {
                name: String(values.name ?? "").trim(),
                startDate: toYmd(values.startDate),
                endDate: toYmd(values.endDate),
                effectiveDate: toYmd(values.effectiveDate),
              };

              if (!body.name) {
                Toast.error("活动名称不能为空");
                return;
              }
              if (!body.effectiveDate) {
                Toast.error("生效日期不能为空");
                return;
              }

              const res = await apiJson<{ id: number }>("/api/admin/campaigns", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              });
              if (!res.ok) {
                Toast.error(res.message);
                return;
              }

              setCreateOpen(false);
              Toast.success("创建成功");
              void refresh();

              Modal.confirm({
                title: "创建成功",
                content: "是否立即进入明细详情？",
                okText: "进入明细",
                cancelText: "留在列表",
                onOk: async () => {
                  await router.push(`/admin/campaigns/${res.data.id}/items`);
                },
              });
            } finally {
              setCreateLoading(false);
            }
          }}
        >
          <Form.Input field="name" label="活动名称" rules={[{ required: true, message: "请输入活动名称" }]} />
          <Form.Slot label="开始/结束日期（可选）">
            <Space>
              <Form.DatePicker field="startDate" type="date" format="yyyy-MM-dd" placeholder="开始日期" />
              <Form.DatePicker field="endDate" type="date" format="yyyy-MM-dd" placeholder="结束日期" />
            </Space>
          </Form.Slot>
          <Form.DatePicker
            field="effectiveDate"
            label="涨薪生效日期"
            type="date"
            format="yyyy-MM-dd"
            placeholder="生效日期"
            rules={[{ required: true, message: "请选择生效日期" }]}
          />
          <Space>
            <Button type="primary" htmlType="submit" loading={createLoading}>
              创建
            </Button>
             
          </Space>
        </Form>
      </Modal>
    </Space>
  );
}
