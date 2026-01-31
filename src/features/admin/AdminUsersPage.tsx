import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { Button, Card, Form, Input, Modal, Select, Space, Table, Tag, Toast, Typography } from "@douyinfe/semi-ui-19";
import { IconPlus, IconRefresh, IconSearch } from "@douyinfe/semi-icons";

import PageHeader from "@/components/admin/PageHeader";
import { apiJson } from "@/lib/api";

const { Text } = Typography;

type AdminUser = {
  id: number;
  username: string;
  role: "HR_ADMIN" | "HR_OPERATOR";
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
};

export default function AdminUsersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AdminUser[]>([]);

  const [keyword, setKeyword] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | AdminUser["role"]>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | AdminUser["status"]>("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await apiJson<AdminUser[]>("/api/admin/users");
      if (!res.ok) {
        if (res.message === "FORBIDDEN") {
          Toast.error("无权限访问该页面");
          await router.replace("/admin");
          return;
        }
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
      { title: "用户名", dataIndex: "username" },
      {
        title: "角色",
        dataIndex: "role",
        render: (v: AdminUser["role"]) =>
          v === "HR_ADMIN" ? <Tag color="orange">管理员</Tag> : <Tag color="blue">录入员</Tag>,
      },
      {
        title: "状态",
        dataIndex: "status",
        render: (v: AdminUser["status"]) =>
          v === "active" ? <Tag color="green">启用</Tag> : <Tag color="grey">禁用</Tag>,
      },
      {
        title: "操作",
        dataIndex: "id",
        render: (_: unknown, row: AdminUser) => (
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
              type="warning"
              onClick={() => {
                setResetUser(row);
                setResetOpen(true);
              }}
            >
              重置密码
            </Button>
            <Button
              size="small"
              type="danger"
              onClick={() => {
                Modal.confirm({
                  title: row.status === "active" ? "确认禁用该账号？" : "确认启用该账号？",
                  content: row.status === "active" ? "禁用后该账号无法登录。" : "启用后该账号可再次登录。",
                  onOk: async () => {
                    const res = await apiJson<unknown>(`/api/admin/users/${row.id}`, {
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
              {row.status === "active" ? "禁用" : "启用"}
            </Button>
            <Button
              size="small"
              type="danger"
              onClick={() => {
                Modal.confirm({
                  title: "确认删除该账号？",
                  content: "删除为软删除：会禁用账号并释放用户名（不可恢复）。",
                  onOk: async () => {
                    const res = await apiJson<unknown>(`/api/admin/users/${row.id}`, { method: "DELETE" });
                    if (!res.ok) {
                      Toast.error(res.message);
                      return;
                    }
                    Toast.success("已删除");
                    await refresh();
                  },
                });
              }}
            >
              删除
            </Button>
          </Space>
        ),
      },
    ],
    [],
  );

  const stats = useMemo(() => {
    let admin = 0;
    let operator = 0;
    let active = 0;
    let inactive = 0;
    for (const r of data) {
      if (r.role === "HR_ADMIN") admin++;
      else operator++;
      if (r.status === "active") active++;
      else inactive++;
    }
    return { total: data.length, admin, operator, active, inactive };
  }, [data]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return data.filter((r) => {
      if (roleFilter !== "all" && r.role !== roleFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return r.username.toLowerCase().includes(q);
    });
  }, [data, keyword, roleFilter, statusFilter]);

  return (
    <Space vertical style={{ width: "100%" }} spacing="medium">
      <PageHeader
        title="账号管理"
        subtitle="仅 HR_ADMIN 可创建/修改/禁用账号。"
        actions={
          <Space>
            <Button type="primary" icon={<IconPlus />} onClick={() => setCreateOpen(true)}>
              新增账号
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
              placeholder="搜索用户名"
              style={{ width: 280 }}
            />
            <Select
              value={roleFilter}
              onChange={(v) => setRoleFilter(v as any)}
              optionList={[
                { label: "全部角色", value: "all" },
                { label: "管理员", value: "HR_ADMIN" },
                { label: "录入员", value: "HR_OPERATOR" },
              ]}
              style={{ width: 140 }}
            />
            <Select
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as any)}
              optionList={[
                { label: "全部状态", value: "all" },
                { label: "启用", value: "active" },
                { label: "禁用", value: "inactive" },
              ]}
              style={{ width: 140 }}
            />
            <Button
              type="tertiary"
              onClick={() => {
                setKeyword("");
                setRoleFilter("all");
                setStatusFilter("all");
              }}
            >
              重置
            </Button>
          </Space>
          <Text type="tertiary" className="app-page-subtitle">
            共 {stats.total} 个（管理员 {stats.admin} / 录入员 {stats.operator}，启用 {stats.active} / 禁用 {stats.inactive}）
          </Text>
        </Space>

        <div style={{ marginTop: 12 }}>
          <Table
            columns={columns}
            dataSource={filtered}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 20 }}
            onRow={(row) => ({
              onDoubleClick: () => {
                if (!row) return;
                setEditUser(row);
                setEditOpen(true);
              },
              style: { cursor: row ? "pointer" : "default" },
            })}
            empty={<Text type="tertiary">暂无账号</Text>}
          />
        </div>
      </Card>

      <Modal title="新增账号" visible={createOpen} onCancel={() => setCreateOpen(false)} footer={null} closeOnEsc>
        <Form
          onSubmit={async (values) => {
            setCreateLoading(true);
            try {
              const username = String(values.username ?? "").trim();
              const password = String(values.password ?? "").trim();
              const role = String(values.role ?? "HR_OPERATOR");

              const res = await apiJson<{ id: number }>("/api/admin/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password, role }),
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
          <Form.Input field="username" label="用户名" rules={[{ required: true, message: "请输入用户名" }]} />
          <Form.Input
            field="password"
            label="初始密码"
            mode="password"
            rules={[
              { required: true, message: "请输入初始密码" },
              { min: 8, message: "密码至少 8 位" },
            ]}
          />
          <Form.Select
            field="role"
            label="角色"
            initValue="HR_OPERATOR"
            optionList={[
              { label: "录入员（HR_OPERATOR）", value: "HR_OPERATOR" },
              { label: "管理员（HR_ADMIN）", value: "HR_ADMIN" },
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
        title="编辑账号"
        visible={editOpen}
        onCancel={() => setEditOpen(false)}
        footer={null}
        closeOnEsc
      >
        {!editUser ? (
          <Text type="tertiary">请选择账号</Text>
        ) : (
          <Form
            initValues={{ username: editUser.username, role: editUser.role, status: editUser.status }}
            onSubmit={async (values) => {
              setEditLoading(true);
              try {
                const role = String(values.role ?? editUser.role);
                const status = String(values.status ?? editUser.status);
                const res = await apiJson<unknown>(`/api/admin/users/${editUser.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ role, status }),
                });
                if (!res.ok) {
                  Toast.error(res.message);
                  return;
                }
                Toast.success("已更新");
                setEditOpen(false);
                setEditUser(null);
                await refresh();
              } finally {
                setEditLoading(false);
              }
            }}
          >
            <Form.Input field="username" label="用户名" disabled />
            <Form.Select
              field="role"
              label="角色"
              optionList={[
                { label: "录入员（HR_OPERATOR）", value: "HR_OPERATOR" },
                { label: "管理员（HR_ADMIN）", value: "HR_ADMIN" },
              ]}
            />
            <Form.Select
              field="status"
              label="状态"
              optionList={[
                { label: "启用(active)", value: "active" },
                { label: "禁用(inactive)", value: "inactive" },
              ]}
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
        title="重置密码"
        visible={resetOpen}
        onCancel={() => setResetOpen(false)}
        footer={null}
        closeOnEsc
      >
        {!resetUser ? (
          <Text type="tertiary">请选择账号</Text>
        ) : (
          <Form
            onSubmit={async (values) => {
              setResetLoading(true);
              try {
                const password = String(values.password ?? "").trim();
                const res = await apiJson<unknown>(`/api/admin/users/${resetUser.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ password }),
                });
                if (!res.ok) {
                  Toast.error(res.message);
                  return;
                }
                Toast.success("密码已重置");
                setResetOpen(false);
                setResetUser(null);
              } finally {
                setResetLoading(false);
              }
            }}
          >
            <Text>
              账号：<Text strong>{resetUser.username}</Text>
            </Text>
            <Form.Input
              field="password"
              label="新密码"
              mode="password"
              rules={[
                { required: true, message: "请输入新密码" },
                { min: 8, message: "密码至少 8 位" },
              ]}
            />
            <Space style={{ marginTop: 12 }}>
              <Button htmlType="submit" type="warning" loading={resetLoading}>
                重置
              </Button>
              <Button type="tertiary" onClick={() => setResetOpen(false)}>
                取消
              </Button>
            </Space>
          </Form>
        )}
      </Modal>
    </Space>
  );
}
