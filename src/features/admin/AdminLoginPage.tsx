import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { Button, Card, Form, Space, Toast, Typography } from "@douyinfe/semi-ui-19";

import { apiJson } from "@/lib/api";
import { writeAdminAuthToStorage } from "@/lib/auth";

const { Title, Text } = Typography;

export default function AdminLoginPage() {
  const router = useRouter();
  const nextPath = useMemo(() => {
    const raw = router.query.next;
    return typeof raw === "string" && raw.startsWith("/admin") ? raw : "/admin";
  }, [router.query.next]);

  const [loading, setLoading] = useState(false);

  return (
    <div style={{ maxWidth: 440, margin: "80px auto", padding: "0 16px" }}>
      <Space vertical style={{ width: "100%" }} spacing="medium">
        <div>
          <Title heading={3} style={{ marginBottom: 4 }}>
            HR 登录
          </Title>
          <Text type="tertiary">请输入后台账号密码登录。</Text>
        </div>

        <Card>
          <Form
            onSubmit={async (values) => {
              setLoading(true);
              try {
                const username = String(values.username ?? "").trim();
                const password = String(values.password ?? "").trim();
                if (!username || !password) {
                  Toast.warning("请输入用户名和密码");
                  return;
                }

                const res = await apiJson<{ userId: number; username: string; role: "HR_ADMIN" | "HR_OPERATOR" }>(
                  "/api/admin/auth/login",
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ username, password }),
                  },
                );
                if (!res.ok) {
                  Toast.error(res.message);
                  return;
                }

                // Cache for UI display only. Authorization is cookie-based.
                writeAdminAuthToStorage(localStorage, {
                  username: res.data.username,
                  role: res.data.role,
                  issuedAt: Date.now(),
                });

                await router.replace(nextPath);
              } finally {
                setLoading(false);
              }
            }}
          >
            <Form.Input field="username" label="用户名" placeholder="例如：hr01" rules={[{ required: true }]} />
            <Form.Input field="password" label="密码" mode="password" placeholder="请输入密码" rules={[{ required: true }]} />
            <Button htmlType="submit" type="primary" loading={loading} style={{ marginTop: 12 }}>
              登录
            </Button>
          </Form>
        </Card>
      </Space>
    </div>
  );
}
