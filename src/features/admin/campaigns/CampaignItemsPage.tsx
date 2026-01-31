import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import {
  Button,
  Card,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  TextArea,
  Toast,
  Typography,
  Upload,
} from "@douyinfe/semi-ui-19";

import PageHeader from "@/components/admin/PageHeader";
import { apiJson } from "@/lib/api";
import { readAdminAuthFromStorage } from "@/lib/auth";
import { formatDate } from "@/lib/date";
import type { AdminRole } from "@/lib/roles";

const { Text } = Typography;

type CampaignStatus = "draft" | "published" | "archived";

type CampaignDetail = {
  id: number;
  name: string;
  effectiveDate: string;
  status: CampaignStatus;
};

type CampaignItemRow = {
  itemId: number | null;
  employeeId: number;
  name: string;
  dept: string;
  raiseAmount: string | null;
  performanceGrade: "S" | "A" | "B" | "C" | null;
  remark: string | null;
};

type Grade = "S" | "A" | "B" | "C";

export default function CampaignItemsPage() {
  const router = useRouter();
  const id = String(router.query.id ?? "");
  const campaignId = Number(id);

  const [role] = useState<AdminRole | null>(() => {
    if (typeof window === "undefined") return null;
    const auth = readAdminAuthFromStorage(localStorage);
    return auth?.role ?? null;
  });

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [items, setItems] = useState<CampaignItemRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editRow, setEditRow] = useState<CampaignItemRow | null>(null);
  const [editRaiseAmount, setEditRaiseAmount] = useState<number>(0);
  const [editGrade, setEditGrade] = useState<Grade>("A");
  const [editRemark, setEditRemark] = useState<string>("");

  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [overrideRow, setOverrideRow] = useState<CampaignItemRow | null>(null);
  const [overrideRaiseAmount, setOverrideRaiseAmount] = useState<number>(0);
  const [overrideGrade, setOverrideGrade] = useState<Grade>("A");
  const [overrideRemark, setOverrideRemark] = useState<string>("");
  const [overrideReason, setOverrideReason] = useState<string>("");

  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState<{
    successCount: number;
    failCount: number;
    errors: Array<{ row: number; message: string }>;
  } | null>(null);

  async function refresh() {
    if (!Number.isFinite(campaignId) || campaignId <= 0) return;
    setLoading(true);
    try {
      const campRes = await apiJson<CampaignDetail>(`/api/admin/campaigns/${campaignId}`);
      if (!campRes.ok) {
        Toast.error(campRes.message);
        return;
      }
      setCampaign(campRes.data);

      const itemsRes = await apiJson<CampaignItemRow[]>(`/api/admin/campaigns/${campaignId}/items`);
      if (!itemsRes.ok) {
        Toast.error(itemsRes.message);
        return;
      }
      setItems(itemsRes.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const status = campaign?.status ?? "draft";
  const isPublished = status === "published";
  const isDraft = status === "draft";
  const isArchived = status === "archived";
  const isAdmin = role === "HR_ADMIN";

  const statusTag = useMemo(() => {
    if (status === "draft") return <Tag color="blue">草稿</Tag>;
    if (status === "published") return <Tag color="green">已发布</Tag>;
    return <Tag color="grey">已归档</Tag>;
  }, [status]);

  return (
    <Space vertical style={{ width: "100%" }} spacing="medium">
      <PageHeader
        title="活动明细"
        subtitle={`活动：${campaign?.name ?? "-"}（ID：${id || "-"}，生效：${formatDate(campaign?.effectiveDate ?? null)}）`}
        backHref="/admin/campaigns"
        backText="返回活动列表"
        actions={
          <Space>
            {statusTag}
            <Link href={`/admin/campaigns/${encodeURIComponent(id)}`}>
              <Button type="tertiary" disabled={!Number.isFinite(campaignId) || campaignId <= 0}>
                返回活动详情
              </Button>
            </Link>
            <Button type="tertiary" loading={loading} onClick={() => void refresh()}>
              刷新
            </Button>
          </Space>
        }
      />

      <Card>
        <Space style={{ width: "100%", justifyContent: "space-between" }}>
          <Text type="tertiary">
            {isPublished
              ? "已发布：普通 HR 不允许修改；仅管理员可修正（需填写原因>=5字）。"
              : isArchived
                ? "已归档：全员只读。"
                : "草稿：允许录入、导入覆盖。"}
          </Text>
          <Space>
            <Button
              type="tertiary"
              disabled={!Number.isFinite(campaignId) || campaignId <= 0}
              onClick={() => window.open(`/api/admin/campaigns/${campaignId}/items/import-template`, "_blank")}
            >
              下载导入模板
            </Button>
            <Upload
              accept=".xlsx"
              action={`/api/admin/campaigns/${campaignId}/items/import`}
              withCredentials
              showUploadList={false}
              disabled={!isDraft}
              onSuccess={(res0) => {
                let json: any = res0;
                try {
                  if (typeof res0 === "string") json = JSON.parse(res0);
                } catch {
                  // ignore
                }
                if (!json?.ok) {
                  Toast.error(json?.message ?? "导入失败");
                  return;
                }
                setImportResult(json.data);
                setImportOpen(true);
                Toast.success("导入完成");
                void refresh();
              }}
              onError={() => Toast.error("导入失败")}
            >
              <Button type="tertiary" disabled={!isDraft}>
                导入明细（Excel）
              </Button>
            </Upload>
            <Button
              type="primary"
              disabled={!Number.isFinite(campaignId) || campaignId <= 0}
              onClick={() => window.open(`/api/admin/campaigns/${campaignId}/items/export`, "_blank")}
            >
              导出明细（Excel）
            </Button>
          </Space>
        </Space>
      </Card>

      <Card>
        <Table
          columns={[
            { title: "姓名", dataIndex: "name" },
            { title: "部门", dataIndex: "dept" },
            { title: "调薪金额(元)", dataIndex: "raiseAmount" },
            { title: "绩效等级", dataIndex: "performanceGrade" },
            { title: "备注", dataIndex: "remark" },
            {
              title: "操作",
              dataIndex: "employeeId",
              render: (_employeeId: number, row: CampaignItemRow) => {
                if (isDraft) {
                  return (
                    <Button
                      size="small"
                      type="primary"
                      onClick={() => {
                        setEditRow(row);
                        setEditRaiseAmount(Number(row.raiseAmount ?? 0));
                        setEditGrade((row.performanceGrade ?? "A") as Grade);
                        setEditRemark(row.remark ?? "");
                        setEditOpen(true);
                      }}
                    >
                      {row.itemId ? "编辑" : "录入"}
                    </Button>
                  );
                }

                if (isPublished && isAdmin && row.itemId) {
                  return (
                    <Button
                      size="small"
                      type="warning"
                      onClick={() => {
                        setOverrideRow(row);
                        setOverrideRaiseAmount(Number(row.raiseAmount ?? 0));
                        setOverrideGrade((row.performanceGrade ?? "A") as Grade);
                        setOverrideRemark(row.remark ?? "");
                        setOverrideReason("");
                        setOverrideOpen(true);
                      }}
                    >
                      修正
                    </Button>
                  );
                }

                return <Text type="tertiary">只读</Text>;
              },
            },
          ]}
          dataSource={items}
          loading={loading}
          rowKey="employeeId"
          pagination={{ pageSize: 20 }}
          empty={<Text type="tertiary">暂无数据</Text>}
        />
      </Card>

      <Modal
        title={editRow?.itemId ? "编辑明细" : "录入明细"}
        visible={editOpen}
        onCancel={() => setEditOpen(false)}
        closeOnEsc
        footer={
          <Space>
            <Button
              type="primary"
              loading={editSaving}
              disabled={!editRow}
              onClick={async () => {
                if (!editRow) return;
                if (!Number.isFinite(editRaiseAmount)) {
                  Toast.warning("调薪金额不正确");
                  return;
                }
                if (!["S", "A", "B", "C"].includes(editGrade)) {
                  Toast.warning("请选择绩效等级");
                  return;
                }

                setEditSaving(true);
                try {
                  const res = await apiJson<{ itemId: number }>(`/api/admin/campaigns/${campaignId}/items`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      employeeId: editRow.employeeId,
                      raiseAmount: Number(editRaiseAmount.toFixed(2)),
                      performanceGrade: editGrade,
                      remark: editRemark.trim() ? editRemark.trim() : null,
                    }),
                  });
                  if (!res.ok) {
                    Toast.error(res.message);
                    return;
                  }
                  Toast.success("已保存");
                  setEditOpen(false);
                  await refresh();
                } finally {
                  setEditSaving(false);
                }
              }}
            >
              保存
            </Button>
            <Button type="tertiary" onClick={() => setEditOpen(false)}>
              取消
            </Button>
          </Space>
        }
      >
        {!editRow ? (
          <Text type="tertiary">请选择一条记录</Text>
        ) : (
          <Space vertical style={{ width: "100%" }} spacing="medium">
            <Text>
              员工：<Text strong>{editRow.name}</Text>（{editRow.dept}）
            </Text>
            <div>
              <Text>调薪金额（元，可为负数）</Text>
              <InputNumber
                style={{ width: "100%", marginTop: 6 }}
                min={-999999999}
                precision={2}
                value={editRaiseAmount}
                onChange={(v) => setEditRaiseAmount(Number(v ?? 0))}
              />
            </div>
            <div>
              <Text>绩效等级</Text>
              <Select
                style={{ width: "100%", marginTop: 6 }}
                value={editGrade}
                optionList={[
                  { label: "S", value: "S" },
                  { label: "A", value: "A" },
                  { label: "B", value: "B" },
                  { label: "C", value: "C" },
                ]}
                onChange={(v) => setEditGrade(v as Grade)}
              />
            </div>
            <div>
              <Text>备注（可选）</Text>
              <TextArea
                style={{ width: "100%", marginTop: 6 }}
                value={editRemark}
                onChange={(v) => setEditRemark(String(v))}
                maxCount={200}
              />
            </div>
          </Space>
        )}
      </Modal>

      <Modal
        title="管理员修正"
        visible={overrideOpen}
        onCancel={() => setOverrideOpen(false)}
        closeOnEsc
        footer={
          <Space>
            <Button
              type="warning"
              loading={overrideSaving}
              disabled={!overrideRow}
              onClick={async () => {
                if (!overrideRow?.itemId) return;
                if (!Number.isFinite(overrideRaiseAmount)) {
                  Toast.warning("调薪金额不正确");
                  return;
                }
                if (!["S", "A", "B", "C"].includes(overrideGrade)) {
                  Toast.warning("请选择绩效等级");
                  return;
                }
                const reason = overrideReason.trim();
                if (!reason) {
                  Toast.warning("请填写修正原因");
                  return;
                }
                if (reason.length < 5) {
                  Toast.warning("修正原因至少 5 个字");
                  return;
                }

                setOverrideSaving(true);
                try {
                  const res = await apiJson<unknown>(
                    `/api/admin/campaigns/${campaignId}/items/${overrideRow.itemId}/admin-override`,
                    {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        raiseAmount: Number(overrideRaiseAmount.toFixed(2)),
                        performanceGrade: overrideGrade,
                        remark: overrideRemark.trim() ? overrideRemark.trim() : null,
                        overrideReason: reason,
                      }),
                    },
                  );
                  if (!res.ok) {
                    Toast.error(res.message);
                    return;
                  }
                  Toast.success("已修正");
                  setOverrideOpen(false);
                  await refresh();
                } finally {
                  setOverrideSaving(false);
                }
              }}
            >
              提交修正
            </Button>
            <Button type="tertiary" onClick={() => setOverrideOpen(false)}>
              取消
            </Button>
          </Space>
        }
      >
        {!overrideRow ? (
          <Text type="tertiary">请选择一条记录</Text>
        ) : (
          <Space vertical style={{ width: "100%" }} spacing="medium">
            <Text>
              员工：<Text strong>{overrideRow.name}</Text>（{overrideRow.dept}）
            </Text>
            <div>
              <Text>调薪金额（元，可为负数）</Text>
              <InputNumber
                style={{ width: "100%", marginTop: 6 }}
                min={-999999999}
                precision={2}
                value={overrideRaiseAmount}
                onChange={(v) => setOverrideRaiseAmount(Number(v ?? 0))}
              />
            </div>
            <div>
              <Text>绩效等级</Text>
              <Select
                style={{ width: "100%", marginTop: 6 }}
                value={overrideGrade}
                optionList={[
                  { label: "S", value: "S" },
                  { label: "A", value: "A" },
                  { label: "B", value: "B" },
                  { label: "C", value: "C" },
                ]}
                onChange={(v) => setOverrideGrade(v as Grade)}
              />
            </div>
            <div>
              <Text>备注（可选）</Text>
              <TextArea
                style={{ width: "100%", marginTop: 6 }}
                value={overrideRemark}
                onChange={(v) => setOverrideRemark(String(v))}
                maxCount={200}
              />
            </div>
            <div>
              <Text strong>修正原因（必填，至少 5 个字）</Text>
              <Input
                style={{ width: "100%", marginTop: 6 }}
                value={overrideReason}
                onChange={(v) => setOverrideReason(String(v))}
                maxLength={200}
                showClear
                placeholder="例如：HR 更正绩效等级录入错误"
              />
            </div>
          </Space>
        )}
      </Modal>

      <Modal
        title="导入结果"
        visible={importOpen}
        onCancel={() => setImportOpen(false)}
        closeOnEsc
        footer={
          <Button type="primary" onClick={() => setImportOpen(false)}>
            确定
          </Button>
        }
      >
        {!importResult ? (
          <Text type="tertiary">暂无结果</Text>
        ) : (
          <Space vertical style={{ width: "100%" }} spacing="medium">
            <Text>
              成功：<Text strong>{importResult.successCount}</Text>　失败：
              <Text strong>{importResult.failCount}</Text>
            </Text>
            {importResult.errors.length ? (
              <Table
                size="small"
                columns={[
                  { title: "行号", dataIndex: "row", width: 80 },
                  { title: "错误", dataIndex: "message" },
                ]}
                dataSource={importResult.errors.slice(0, 50)}
                pagination={false}
                rowKey={(r) => (r ? `${String(r.row)}-${r.message}` : String(Math.random()))}
              />
            ) : (
              <Text type="tertiary">没有错误行</Text>
            )}
            {importResult.errors.length > 50 ? <Text type="tertiary">仅展示前 50 条错误</Text> : null}
          </Space>
        )}
      </Modal>
    </Space>
  );
}
