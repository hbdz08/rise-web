import { useEffect, useMemo, useState } from "react";
import { Banner, Button, Card, Form, Image, Space, Tag, Timeline, Typography } from "@douyinfe/semi-ui-19";
import { IconRefresh } from "@douyinfe/semi-icons";

import { formatDate } from "@/lib/date";

type QueryResult =
  | {
      ok: true;
      data: {
        name: string;
        dept: string;
        records: Array<{
          campaignName: string;
          effectiveDate: string;
          raiseAmount: string;
          performanceGrade: "S" | "A" | "B" | "C";
          remark: string | null;
        }>;
      };
    }
  | { ok: false; message: string };

type CaptchaPayload = { ok: true; data: { svg: string } } | { ok: false; message: string };

const { Title, Text } = Typography;

function formatAdjust(raiseAmount: string | null): { typeLabel: string; amountText: string } {
  if (!raiseAmount) return { typeLabel: "-", amountText: "-" };
  const n = Number(raiseAmount);
  if (!Number.isFinite(n)) return { typeLabel: "调薪", amountText: String(raiseAmount) };
  const abs = Math.abs(n).toFixed(2);
  if (n > 0) return { typeLabel: "涨薪", amountText: `+${abs}` };
  if (n < 0) return { typeLabel: "降薪", amountText: `-${abs}` };
  return { typeLabel: "不变", amountText: "0.00" };
}

function adjustTagColor(raiseAmount: string): "green" | "orange" | "grey" {
  const n = Number(raiseAmount);
  if (!Number.isFinite(n)) return "grey";
  if (n > 0) return "green";
  if (n < 0) return "orange";
  return "grey";
}

function gradeTagColor(g: "S" | "A" | "B" | "C"): "green" | "blue" | "orange" | "grey" {
  if (g === "S") return "green";
  if (g === "A") return "blue";
  if (g === "B") return "orange";
  return "grey";
}

export default function QueryPage() {
  const [captchaSvg, setCaptchaSvg] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);

  const captchaSrc = useMemo(() => {
    if (!captchaSvg) return "";
    return `data:image/svg+xml;utf8,${encodeURIComponent(captchaSvg)}`;
  }, [captchaSvg]);

  async function refreshCaptcha() {
    const res = await fetch("/api/public/captcha");
    const json = (await res.json()) as CaptchaPayload;
    if (json.ok) setCaptchaSvg(json.data.svg);
  }

  useEffect(() => {
    void refreshCaptcha();
  }, []);

  return (
    <div className="app-public-page">
      <div className="app-public-container">
        <div className="app-public-hero">
          <Title heading={2} style={{ margin: 0 }}>
            员工调薪查询
          </Title>
          <Text type="tertiary" className="app-page-subtitle">
            输入身份证号 + 当前手机号验证后，按时间线展示已发布活动的调薪记录。
          </Text>
        </div>

        <div className="app-public-grid">
          <Card>
          <Form
            onSubmit={async (values) => {
              setLoading(true);
              setResult(null);
              try {
                const res = await fetch("/api/public/query", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(values),
                });
                const json = (await res.json()) as QueryResult;
                setResult(json);
              } finally {
                setLoading(false);
                void refreshCaptcha();
              }
            }}
          >
            <Form.Input
              field="idNo"
              label="身份证号（18位）"
              placeholder="请输入身份证号"
              size="large"
              rules={[
                { required: true, message: "请输入身份证号" },
                { pattern: /^\d{17}[\dXx]$/, message: "身份证号格式不正确" },
              ]}
            />
            <Form.Input
              field="phone"
              label="手机号"
              placeholder="请输入手机号"
              size="large"
              rules={[
                { required: true, message: "请输入手机号" },
                { pattern: /^1\d{10}$/, message: "手机号格式不正确" },
              ]}
            />

            <Form.Slot label="图形验证码">
              <div className="app-captcha-row">
                <Form.Input
                  field="captcha"
                  noLabel
                  placeholder="请输入验证码"
                  rules={[{ required: true, message: "请输入验证码" }]}
                  size="large"
                  style={{ flex: 1, minWidth: 160 }}
                />
                <div className="app-captcha-image" onClick={() => void refreshCaptcha()} title="点击刷新验证码">
                  {captchaSrc ? (
                    <Image src={captchaSrc} alt="captcha" width={120} height={44} preview={false} />
                  ) : (
                    <div style={{ width: 120, height: 44 }} />
                  )}
                </div>
                <Button icon={<IconRefresh />} size="large" type="tertiary" onClick={() => void refreshCaptcha()}>
                  刷新
                </Button>
              </div>
            </Form.Slot>

            <div className="app-public-actions">
              <Button htmlType="submit" type="primary" loading={loading} size="large" block>
                查询
              </Button>
              <Button
                type="tertiary"
                size="large"
                block
                onClick={() => {
                  setResult(null);
                }}
              >
                清空结果
              </Button>
            </div>
          </Form>
          </Card>

          <Card>
            {!result ? (
              <div className="app-public-result-empty">
                <Banner type="info" closeIcon={null} description="提交查询后，这里会按时间线展示你的调薪记录。" />
                <Text type="tertiary" className="app-page-subtitle">
                  为保障信息安全：需要身份证号、当前手机号与图形验证码同时验证。
                </Text>
              </div>
            ) : result.ok ? (
              <Space vertical spacing="medium" style={{ width: "100%" }}>
                <Space style={{ width: "100%", justifyContent: "space-between" }} align="center">
                  <Text>
                    姓名：<Text strong>{result.data.name}</Text>　部门：<Text strong>{result.data.dept}</Text>
                  </Text>
                  <Tag color="blue" size="small">
                    已验证
                  </Tag>
                </Space>

                {result.data.records.length ? (
                  <>
                    <Banner
                      type="success"
                      closeIcon={null}
                      description={`已查询到 ${result.data.records.length} 条调薪记录`}
                    />
                    <Timeline mode="left" className="app-query-timeline">
                      {result.data.records.map((r, idx) => {
                        const f = formatAdjust(r.raiseAmount);
                        const n = Number(r.raiseAmount);
                        const type: "default" | "success" | "warning" = Number.isFinite(n)
                          ? n > 0
                            ? "success"
                            : n < 0
                              ? "warning"
                              : "default"
                          : "default";

                        return (
                          <Timeline.Item key={String(idx) + r.effectiveDate + r.campaignName} type={type}>
                            <div className="app-query-record">
                              <div className="app-query-record-head">
                                <Text strong>{r.campaignName}</Text>
                                <Text type="tertiary" className="app-page-subtitle">
                                  {formatDate(r.effectiveDate)}
                                </Text>
                              </div>

                              <div className="app-query-record-main">
                                <Tag color={adjustTagColor(r.raiseAmount)} size="small">
                                  {f.typeLabel}
                                </Tag>
                                <span
                                  className={
                                    "app-query-amount " +
                                    (Number.isFinite(n) ? (n > 0 ? "pos" : n < 0 ? "neg" : "zero") : "zero")
                                  }
                                >
                                  {f.amountText} <span className="app-query-amount-unit">元</span>
                                </span>
                                <Tag color={gradeTagColor(r.performanceGrade)} size="small">
                                  {r.performanceGrade}
                                </Tag>
                              </div>

                              <div className="app-query-record-remark">
                                <Text type="tertiary" className="app-page-subtitle">
                                  备注：
                                </Text>
                                <Text>{r.remark?.trim() ? r.remark : "-"}</Text>
                              </div>
                            </div>
                          </Timeline.Item>
                        );
                      })}
                    </Timeline>
                  </>
                ) : (
                  <Banner type="warning" closeIcon={null} description="未查询到调薪信息，如有疑问，请联系 HR。" />
                )}
              </Space>
            ) : (
              <Banner type="danger" closeIcon={null} description={result.message} />
            )}
          </Card>
        </div>

        <div style={{ marginTop: 14 }}>
          <Text type="tertiary" size="small" className="app-page-subtitle">
            提示：本页面仅用于查询结果展示；请勿频繁刷新或重复提交。
          </Text>
        </div>
      </div>
    </div>
  );
}
