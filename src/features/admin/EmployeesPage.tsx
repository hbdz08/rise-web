import { useEffect, useMemo, useState } from "react";
import { Button, Card, Form, Input, Modal, Select, Space, Table, Tag, Toast, Typography, Upload } from "@douyinfe/semi-ui-19";
import { IconDownload, IconPlus, IconRefresh, IconSearch, IconUpload } from "@douyinfe/semi-icons";

import PageHeader from "@/components/admin/PageHeader";
import { apiJson } from "@/lib/api";

const { Text } = Typography;

type EmployeeListItem = {
  id: number;
  name: string;
  dept: string;
  jobTitle: string | null;
  status: "active" | "inactive";
  idLast6: string;
  phoneMasked: string;
  createdAt: string;
  updatedAt: string;
};

type ImportResult = {
  successCount: number;
  failCount: number;
  errors: Array<{ row: number; message: string }>;
};

export default function EmployeesPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<EmployeeListItem[]>([]);

  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editUser, setEditUser] = useState<EmployeeListItem | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await apiJson<EmployeeListItem[]>("/api/admin/employees");
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
      { title: "姓名", dataIndex: "name" },
      { title: "部门", dataIndex: "dept" },
      { title: "职位", dataIndex: "jobTitle" },
      { title: "身份证后6位", dataIndex: "idLast6" },
      { title: "手机号", dataIndex: "phoneMasked" },
      {
        title: "状态",
        dataIndex: "status",
        render: (v: EmployeeListItem["status"]) =>
          v === "active" ? <Tag color="green">启用</Tag> : <Tag color="grey">停用</Tag>,
      },
      {
        title: "操作",
        dataIndex: "id",
        render: (_: unknown, row: EmployeeListItem) => (
          <Space>
            <Button
              size="small"
              type="tertiary"
              onClick={() => {
                setEditUser(row);
                setEditOpen(true);
              }}
            >
              编辑
            </Button>
            <Button
              size="small"
              type={row.status === "active" ? "danger" : "primary"}
              onClick={() => {
                Modal.confirm({
                  title: row.status === "active" ? "确认停用该员工？" : "确认启用该员工？",
                  content: row.status === "active" ? "停用后不会出现在活动明细列表中。" : "启用后会出现在活动明细列表中。",
                  onOk: async () => {
                    const res = await apiJson<unknown>(`/api/admin/employees/${row.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: row.status === "active" ? "inactive" : "active" }),
                    });
                    if (!res.ok) {
                      Toast.error(res.message);
                      return;
                    }
                    Toast.success("操作成功");
                    await refresh();
                  },
                });
              }}
            >
              {row.status === "active" ? "停用" : "启用"}
            </Button>
          </Space>
        ),
      },
    ],
    [],
  );

  const stats = useMemo(() => {
    let active = 0;
    let inactive = 0;
    for (const r of data) {
      if (r.status === "active") active++;
      else inactive++;
    }
    return { total: data.length, active, inactive };
  }, [data]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return data.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      const hay = `${r.name} ${r.dept} ${r.jobTitle ?? ""} ${r.idLast6} ${r.phoneMasked}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data, keyword, statusFilter]);

  return (
    <Space vertical style={{ width: "100%" }} spacing="medium">
      <PageHeader
        title="人员管理"
        subtitle="支持 Excel 导入/导出、启用/停用、编辑员工信息。"
        actions={
          <Space>
            <Button
              type="tertiary"
              icon={<IconDownload />}
              onClick={() => window.open("/api/admin/employees/import-template", "_blank")}
            >
              下载导入模板
            </Button>
            <Upload
              accept=".xlsx"
              action="/api/admin/employees/import"
              withCredentials
              showUploadList={false}
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
                setImportResult(json.data as ImportResult);
                setImportOpen(true);
                Toast.success("导入完成");
                void refresh();
              }}
              onError={() => Toast.error("导入失败")}
            >
              <Button type="tertiary" icon={<IconUpload />}>
                导入
              </Button>
            </Upload>
            <Button type="primary" icon={<IconDownload />} onClick={() => window.open("/api/admin/employees/export", "_blank")}>
              导出
            </Button>
            <Button icon={<IconPlus />} onClick={() => setCreateOpen(true)}>
              新增
            </Button>
            <Button type="tertiary" icon={<IconRefresh />} loading={loading} onClick={() => void refresh()}>
              刷新
            </Button>
          </Space>
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
              placeholder="搜索：姓名 / 部门 / 职位 / 身份证后6位 / 手机号(脱敏)"
              style={{ width: 380 }}
            />
            <Select
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as any)}
              optionList={[
                { label: "全部状态", value: "all" },
                { label: "启用", value: "active" },
                { label: "停用", value: "inactive" },
              ]}
              style={{ width: 140 }}
            />
            <Button
              type="tertiary"
              onClick={() => {
                setKeyword("");
                setStatusFilter("all");
              }}
            >
              重置
            </Button>
          </Space>
          <Text type="tertiary" className="app-page-subtitle">
            共 {stats.total} 人（启用 {stats.active} / 停用 {stats.inactive}）
          </Text>
        </Space>

        <div style={{ marginTop: 12 }}>
          <Table
            columns={columns}
            dataSource={filtered}
            loading={loading}
            rowKey="id"
            pagination={{ pageSize: 20 }}
            onRow={(row) => ({
              onDoubleClick: () => {
                if (!row) return;
                setEditUser(row);
                setEditOpen(true);
              },
              style: { cursor: row ? "pointer" : "default" },
            })}
            empty={<Text type="tertiary">暂无数据</Text>}
          />
        </div>
      </Card>

      <Modal
        title="新增员工"
        visible={createOpen}
        onCancel={() => setCreateOpen(false)}
        footer={null}
        closeOnEsc
      >
        <Form
          onSubmit={async (values) => {
            setCreateLoading(true);
            try {
              const body = {
                name: String(values.name ?? "").trim(),
                dept: String(values.dept ?? "").trim(),
                jobTitle: values.jobTitle ? String(values.jobTitle).trim() : null,
                idNo: String(values.idNo ?? "").trim(),
                phone: String(values.phone ?? "").trim(),
              };

              const res = await apiJson<{ id: number }>("/api/admin/employees", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              });
              if (!res.ok) {
                Toast.error(res.message);
                return;
              }
              Toast.success("创建成功");
              setCreateOpen(false);
              await refresh();
            } finally {
              setCreateLoading(false);
            }
          }}
        >
          <Form.Input field="name" label="姓名" rules={[{ required: true, message: "请输入姓名" }]} />
          <Form.Input field="dept" label="部门" rules={[{ required: true, message: "请输入部门" }]} />
          <Form.Input field="jobTitle" label="职位（可选）" />
          <Form.Input
            field="idNo"
            label="身份证号（18位）"
            rules={[
              { required: true, message: "请输入身份证号" },
              { pattern: /^\d{17}[\dXx]$/, message: "身份证号格式不正确" },
            ]}
          />
          <Form.Input
            field="phone"
            label="手机号"
            rules={[
              { required: true, message: "请输入手机号" },
              { pattern: /^1\d{10}$/, message: "手机号格式不正确" },
            ]}
          />
          <Space style={{ marginTop: 12 }}>
            <Button htmlType="submit" type="primary" loading={createLoading}>
              保存
            </Button>
            <Button type="tertiary" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
          </Space>
        </Form>
      </Modal>

      <Modal
        title="编辑员工"
        visible={editOpen}
        onCancel={() => setEditOpen(false)}
        footer={null}
        closeOnEsc
      >
        {!editUser ? (
          <Text type="tertiary">请选择员工</Text>
        ) : (
          <Form
            initValues={{
              name: editUser.name,
              dept: editUser.dept,
              jobTitle: editUser.jobTitle ?? "",
              status: editUser.status,
              phone: "",
            }}
            onSubmit={async (values) => {
              setEditLoading(true);
              try {
                const body: Record<string, unknown> = {
                  name: String(values.name ?? "").trim(),
                  dept: String(values.dept ?? "").trim(),
                  jobTitle: values.jobTitle ? String(values.jobTitle).trim() : null,
                  status: String(values.status ?? editUser.status),
                };
                const phone = String(values.phone ?? "").trim();
                if (phone) body.phone = phone;

                const res = await apiJson<unknown>(`/api/admin/employees/${editUser.id}`, {
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
                setEditUser(null);
                await refresh();
              } finally {
                setEditLoading(false);
              }
            }}
          >
            <Form.Input field="name" label="姓名" rules={[{ required: true, message: "请输入姓名" }]} />
            <Form.Input field="dept" label="部门" rules={[{ required: true, message: "请输入部门" }]} />
            <Form.Input field="jobTitle" label="职位（可选）" />
            <Form.Select
              field="status"
              label="状态"
              optionList={[
                { label: "启用(active)", value: "active" },
                { label: "停用(inactive)", value: "inactive" },
              ]}
            />
            <Form.Input
              field="phone"
              label={`手机号（可选，当前：${editUser.phoneMasked}）`}
              placeholder="不修改请留空"
              rules={[{ pattern: /^$|^1\\d{10}$/, message: "手机号格式不正确" }]}
            />
            <Space style={{ marginTop: 12 }}>
              <Button htmlType="submit" type="primary" loading={editLoading}>
                保存
              </Button>
              <Button type="tertiary" onClick={() => setEditOpen(false)}>
                取消
              </Button>
            </Space>
          </Form>
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
