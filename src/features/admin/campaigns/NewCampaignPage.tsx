import { useState } from "react";
import { useRouter } from "next/router";
import { Button, Card, Form, Space, Toast } from "@douyinfe/semi-ui-19";

import PageHeader from "@/components/admin/PageHeader";
import { apiJson } from "@/lib/api";
import { toYmd } from "@/lib/date";

export default function NewCampaignPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <Space vertical style={{ width: "100%" }} spacing="medium">
      <PageHeader
        title="创建活动"
        subtitle="活动发布后，普通 HR 不允许再修改金额/绩效。"
        backHref="/admin/campaigns"
        backText="返回活动列表"
      />

      <Card>
        <Form
          onSubmit={async (values) => {
            setLoading(true);
            try {
              const body = {
                name: String(values.name ?? "").trim(),
                startDate: toYmd(values.startDate),
                endDate: toYmd(values.endDate),
                effectiveDate: toYmd(values.effectiveDate),
              };

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
              Toast.success("创建成功");
              await router.push(`/admin/campaigns/${res.data.id}`);
            } finally {
              setLoading(false);
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
          <Button type="primary" htmlType="submit" loading={loading}>
            创建活动
          </Button>
        </Form>
      </Card>
    </Space>
  );
}
