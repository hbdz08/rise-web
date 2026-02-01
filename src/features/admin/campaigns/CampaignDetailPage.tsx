import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, Descriptions, Form, Modal, Space, Tag, Toast, Typography } from "@douyinfe/semi-ui-19";

import PageHeader from "@/components/admin/PageHeader";
import { apiJson } from "@/lib/api";
import { readAdminAuthFromStorage } from "@/lib/auth";
import { formatDate, formatDateTime, toYmd } from "@/lib/date";
import { canArchiveCampaign, canPublishCampaign, roleLabel } from "@/lib/permissions";

type CampaignDetail = {
  id: number;
  name: string;
  startDate: string | null;
  endDate: string | null;
  effectiveDate: string;
  status: "draft" | "published" | "archived";
  publishedAt: string | null;
  itemsCount: number;
  createdAt: string;
  updatedAt: string;
};

const { Text } = Typography;

export default function CampaignDetailPage() {
  const router = useRouter();
  const id = String(router.query.id ?? "");
  const idNum = Number(id);

  const [role] = useState(() => {
    if (typeof window === "undefined") return null;
    return readAdminAuthFromStorage(localStorage)?.role ?? null;
  });

  const [loading, setLoading] = useState(false);
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  async function refresh() {
    if (!Number.isFinite(idNum) || idNum <= 0) return;
    setLoading(true);
    try {
      const res = await apiJson<CampaignDetail>(`/api/admin/campaigns/${idNum}`);
      if (!res.ok) {
        Toast.error(res.message);
        return;
      }
      setCampaign(res.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const statusTag = useMemo(() => {
    const s = campaign?.status;
    if (s === "draft") return <Tag color="blue">草稿</Tag>;
    if (s === "published") return <Tag color="green">已发布</Tag>;
    if (s === "archived") return <Tag color="grey">已归档</Tag>;
    return <Tag color="grey">未知</Tag>;
  }, [campaign?.status]);

  const status = campaign?.status ?? "draft";
  const canPublish = canPublishCampaign(role, status);
  const canArchive = canArchiveCampaign(role, status);
  const canEdit = status === "draft";

  return (
    <Space vertical style={{ width: "100%" }} spacing="medium">
      <PageHeader
        title="活动详情"
        subtitle={`活动ID：${id || "-"}`}
        backHref="/admin/campaigns"
        backText="返回活动列表"
        actions={
          <Space>
            {statusTag}
            <Button type="tertiary" disabled={!canEdit} onClick={() => setEditOpen(true)}>
              编辑活动
            </Button>
            <Link href={`/admin/campaigns/${encodeURIComponent(id)}/items`}>
              <Button type="primary" disabled={!id}>
                查看活动明细
              </Button>
            </Link>
            <Button
              type="tertiary"
              disabled={!canPublish}
              loading={loading}
              onClick={() => {
                if (!idNum) return;
                Modal.confirm({
                  title: "确认发布？",
                  content: (
                    <Space vertical spacing="tight">
                      <Text type="tertiary">当前角色：{roleLabel(role)}</Text>
                      <Text type="tertiary">
                        发布后员工即可查询；金额/绩效将被锁定，后续只能由管理员填写原因（不少于 5 字）进行修正。
                      </Text>
                    </Space>
                  ),
                  onOk: async () => {
                    const res = await apiJson<unknown>(`/api/admin/campaigns/${idNum}/publish`, { method: "POST" });
                    if (!res.ok) {
                      Toast.error(res.message);
                      return;
                    }
                    Toast.success("已发布");
                    await refresh();
                  },
                });
              }}
            >
              发布
            </Button>
            <Button
              type="tertiary"
              disabled={!canArchive}
              loading={loading}
              onClick={() => {
                if (!idNum) return;
                Modal.confirm({
                  title: "确认归档？",
                  content: (
                    <Space vertical spacing="tight">
                      <Text type="tertiary">当前角色：{roleLabel(role)}</Text>
                      <Text type="tertiary">归档后全员只读，管理员也不可修正。</Text>
                    </Space>
                  ),
                  onOk: async () => {
                    const res = await apiJson<unknown>(`/api/admin/campaigns/${idNum}/archive`, { method: "POST" });
                    if (!res.ok) {
                      Toast.error(res.message);
                      return;
                    }
                    Toast.success("已归档");
                    await refresh();
                  },
                });
              }}
            >
              归档
            </Button>
            <Button type="tertiary" loading={loading} onClick={() => void refresh()}>
              刷新
            </Button>
          </Space>
        }
      />

      <Card>
        <Descriptions
          size="small"
          data={[
            { key: "活动名称", value: campaign?.name ?? "-" },
            { key: "生效日期", value: formatDate(campaign?.effectiveDate ?? null) },
            {
              key: "活动区间",
              value: `${formatDate(campaign?.startDate ?? null)} ~ ${formatDate(campaign?.endDate ?? null)}`,
            },
            { key: "已录入人数", value: String(campaign?.itemsCount ?? 0) },
            { key: "发布时间", value: formatDateTime(campaign?.publishedAt ?? null) },
          ]}
        />
      </Card>

      <Modal title="编辑活动" visible={editOpen} onCancel={() => setEditOpen(false)} footer={null} closeOnEsc>
        <Form
          key={`${editOpen ? "1" : "0"}-${campaign?.updatedAt ?? "0"}`}
          initValues={{
            name: campaign?.name ?? "",
            startDate: campaign?.startDate ?? null,
            endDate: campaign?.endDate ?? null,
            effectiveDate: campaign?.effectiveDate ?? null,
          }}
          onSubmit={async (values) => {
            if (!campaign || !idNum) return;

            const nextName = String(values.name ?? "").trim();
            const nextStartDate = toYmd(values.startDate);
            const nextEndDate = toYmd(values.endDate);
            const nextEffectiveDate = toYmd(values.effectiveDate);

            if (!nextName) {
              Toast.error("活动名称不能为空");
              return;
            }
            if (!nextEffectiveDate) {
              Toast.error("生效日期不能为空");
              return;
            }

            const body: Record<string, unknown> = {};

            if (nextName !== campaign.name) body.name = nextName;

            // PATCH 接口用空字符串表示“清空日期”，以区分“未提交该字段”。
            if (nextStartDate == null) {
              if (campaign.startDate != null) body.startDate = "";
            } else if (nextStartDate !== campaign.startDate) {
              body.startDate = nextStartDate;
            }

            if (nextEndDate == null) {
              if (campaign.endDate != null) body.endDate = "";
            } else if (nextEndDate !== campaign.endDate) {
              body.endDate = nextEndDate;
            }

            if (nextEffectiveDate !== campaign.effectiveDate) body.effectiveDate = nextEffectiveDate;

            if (!Object.keys(body).length) {
              Toast.info("未修改任何内容");
              setEditOpen(false);
              return;
            }

            setEditLoading(true);
            try {
              const res = await apiJson<unknown>(`/api/admin/campaigns/${idNum}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              });
              if (!res.ok) {
                Toast.error(res.message);
                return;
              }
              Toast.success("已保存");
              setEditOpen(false);
              await refresh();
            } finally {
              setEditLoading(false);
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
            label="调薪生效日期"
            type="date"
            format="yyyy-MM-dd"
            placeholder="生效日期"
            rules={[{ required: true, message: "请选择生效日期" }]}
          />
          <Button type="primary" htmlType="submit" loading={editLoading}>
            保存
          </Button>
        </Form>
      </Modal>
    </Space>
  );
}
