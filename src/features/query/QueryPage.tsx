import { useEffect, useMemo, useState } from "react";
import { Banner, Button, Card, Form, Image, Space, Tag, Timeline, Typography } from "@douyinfe/semi-ui-19";
import { IconAlertCircle, IconHelpCircle, IconMinusCircle, IconRefresh, IconTickCircle } from "@douyinfe/semi-icons";

import { formatDate } from "@/lib/date";

type NoticePayload =
  | {
      ok: true;
      data: {
        campaigns: Array<{
          id: number;
          name: string;
          startDate: string | null;
          endDate: string | null;
          effectiveDate: string;
          publishedAt: string | null;
        }>;
      };
    }
  | { ok: false; message: string };

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

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function ymdToInt(s: string): number {
  return Number(s.replace(/-/g, ""));
}

function hashToIndex(input: string, size: number): number {
  // Simple stable hash for picking a "random-ish" message (no crypto).
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % Math.max(1, size);
}

type AmountStatus = "pos" | "neg" | "zero" | "invalid";

function amountStatus(raiseAmount: string | null): AmountStatus {
  if (!raiseAmount) return "invalid";
  const n = Number(raiseAmount);
  if (!Number.isFinite(n)) return "invalid";
  if (n > 0) return "pos";
  if (n < 0) return "neg";
  return "zero";
}

function statusLabel(s: AmountStatus): string {
  if (s === "pos") return "优秀";
  if (s === "neg") return "下调";
  if (s === "zero") return "继续加油";
  return "调薪";
}

function statusTagColor(s: AmountStatus): "green" | "red" | "blue" | "grey" {
  if (s === "pos") return "green";
  if (s === "neg") return "red";
  if (s === "zero") return "blue";
  return "grey";
}

function StatusBadge({ status }: { status: AmountStatus }) {
  const color = statusTagColor(status);
  const label = statusLabel(status);
  const icon =
    status === "pos" ? (
      <IconTickCircle size="small" />
    ) : status === "neg" ? (
      <IconAlertCircle size="small" />
    ) : status === "zero" ? (
      <IconMinusCircle size="small" />
    ) : (
      <IconHelpCircle size="small" />
    );

  return (
    <span className="app-status-icon-wrap" title={label}>
      <Tag color={color} size="small" className="app-status-icon" aria-label={label}>
        {icon}
      </Tag>
    </span>
  );
}

function pickMessage(s: AmountStatus, seed: string): string {
  const pos = [
    "干得漂亮！这波上调是实打实的认可。",
    "你很强！保持势头，下一次也拿下。",
    "恭喜加薪：继续冲，把成绩打出来。",
    "好样的！你的努力正在被看见。",
  ];
  const neg = [
    "本次结果不理想：别慌，先把原因问清楚。",
    "这次先踩刹车：下一周期，把它赢回来。",
    "下调很少见：建议尽快和主管/HR核对原因与目标。",
    "现在是调整时刻：把改进计划落到周、落到日。",
  ];
  const zero = [
    "这次没加没减：继续加油，下一次争取上调！",
    "0 不是终点，是起跑线：继续冲。",
    "稳住节奏，把目标打穿，结果自然来。",
    "差一点点：把这一点点变成上调。",
  ];
  const list = s === "pos" ? pos : s === "neg" ? neg : s === "zero" ? zero : ["结果已更新。"];
  return list[hashToIndex(seed, list.length)]!;
}

function formatAdjust(raiseAmount: string | null): { typeLabel: string; amountText: string } {
  if (!raiseAmount) return { typeLabel: "-", amountText: "-" };
  const n = Number(raiseAmount);
  if (!Number.isFinite(n)) return { typeLabel: "调薪", amountText: String(raiseAmount) };
  const abs = Math.abs(n).toFixed(2);
  if (n > 0) return { typeLabel: "调薪", amountText: `+${abs}` };
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

function campaignPhase(c: { startDate: string | null; endDate: string | null; effectiveDate: string }): {
  label: string;
  color: "green" | "blue" | "orange" | "grey";
} {
  const t = ymdToInt(todayYmd());
  const start = c.startDate ? ymdToInt(c.startDate) : null;
  const end = c.endDate ? ymdToInt(c.endDate) : null;

  if (start != null && t < start) return { label: "未开始", color: "blue" };
  if (end != null && t > end) return { label: "已结束", color: "grey" };
  if (start != null || end != null) return { label: "进行中", color: "green" };

  const eff = ymdToInt(c.effectiveDate);
  if (t < eff) return { label: "已发布（待生效）", color: "blue" };
  return { label: "已生效", color: "green" };
}

export default function QueryPage() {
  const [captchaSvg, setCaptchaSvg] = useState<string>("");
  const [notice, setNotice] = useState<NoticePayload | null>(null);
  const [noticeLoading, setNoticeLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [expandedRemarkKeys, setExpandedRemarkKeys] = useState<Record<string, boolean>>({});

  const captchaSrc = useMemo(() => {
    if (!captchaSvg) return "";
    return `data:image/svg+xml;utf8,${encodeURIComponent(captchaSvg)}`;
  }, [captchaSvg]);

  async function refreshNotice() {
    setNoticeLoading(true);
    try {
      const res = await fetch("/api/public/notice");
      const json = (await res.json()) as NoticePayload;
      setNotice(json);
    } catch {
      setNotice({ ok: false, message: "通知加载失败" });
    } finally {
      setNoticeLoading(false);
    }
  }

  async function refreshCaptcha() {
    const res = await fetch("/api/public/captcha");
    const json = (await res.json()) as CaptchaPayload;
    if (json.ok) setCaptchaSvg(json.data.svg);
  }

  useEffect(() => {
    void refreshCaptcha();
    void refreshNotice();
  }, []);

  const latestCampaign = useMemo(() => {
    if (!notice || !notice.ok) return null;
    return notice.data.campaigns[0] ?? null;
  }, [notice]);

  const noticeBanner = useMemo(() => {
    if (noticeLoading && !notice) {
      return (
        <Banner
          type="info"
          fullMode={false}
          bordered
          closeIcon={null}
          title="最新活动通知"
          description="正在加载最新通知..."
        />
      );
    }

    if (!notice) return null;

    if (!notice.ok) {
      return (
        <Banner
          type="warning"
          fullMode={false}
          bordered
          closeIcon={null}
          title="最新活动通知"
          description={notice.message || "通知加载失败"}
        >
          <Button size="small" type="tertiary" loading={noticeLoading} onClick={() => void refreshNotice()}>
            刷新
          </Button>
        </Banner>
      );
    }

    if (!latestCampaign) {
      return (
        <Banner
          type="info"
          fullMode={false}
          bordered
          closeIcon={null}
          title="最新活动通知"
          description="暂无已发布活动，请以 HR 通知为准。"
        >
          <Button size="small" type="tertiary" loading={noticeLoading} onClick={() => void refreshNotice()}>
            刷新
          </Button>
        </Banner>
      );
    }

    const phase = campaignPhase(latestCampaign);

    return (
      <Banner
        type={phase.color === "green" ? "success" : phase.color === "orange" ? "warning" : "info"}
        fullMode={false}
        bordered
        closeIcon={null}
        title={
          <Space spacing="tight">
            <Text strong>最新活动：{latestCampaign.name}</Text>
            <Tag color={phase.color} size="small">
              {phase.label}
            </Tag>
          </Space>
        }
        description={
          <Space vertical spacing="tight">
            <Text type="tertiary" className="app-page-subtitle">
              生效日期：{formatDate(latestCampaign.effectiveDate)}
              {latestCampaign.startDate || latestCampaign.endDate ? (
                <>
                  {" "}
                  活动周期：{formatDate(latestCampaign.startDate)} ~ {formatDate(latestCampaign.endDate)}
                </>
              ) : null}
            </Text>
            <Text type="tertiary" className="app-page-subtitle">
              提示：活动发布后本页会自动展示最新通知；如未看到更新，可点击右侧“刷新”。
            </Text>
          </Space>
        }
      >
        <Button size="small" type="tertiary" loading={noticeLoading} onClick={() => void refreshNotice()}>
          刷新
        </Button>
      </Banner>
    );
  }, [latestCampaign, notice, noticeLoading]);

  const resultSummary = useMemo(() => {
    if (!result || !result.ok) return null;
    const records = result.data.records ?? [];
    if (!records.length) return null;

    let pos = 0;
    let neg = 0;
    let zero = 0;
    for (const r of records) {
      const s = amountStatus(r.raiseAmount);
      if (s === "pos") pos += 1;
      else if (s === "neg") neg += 1;
      else if (s === "zero") zero += 1;
    }

    const latest = records[0]!;
    const s = amountStatus(latest.raiseAmount);
    const raw = Number(latest.raiseAmount);
    const abs = Number.isFinite(raw) ? Math.abs(raw).toFixed(2) : null;
    const seed = `${latest.campaignName}|${latest.effectiveDate}|${latest.raiseAmount}`;

    const title =
      s === "pos"
        ? `战报：优秀！本次上调 ${abs ?? "-"} 元`
        : s === "neg"
          ? `战报：本次下调 ${abs ?? "-"} 元`
          : s === "zero"
            ? "战报：本次未调整（0.00 元）"
            : "战报：本次结果已更新";

    return {
      status: s,
      title,
      description: pickMessage(s, seed),
      statsText: `上调 ${pos} / 下调 ${neg} / 未调整 ${zero}`,
      total: records.length,
    };
  }, [result]);

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

        {/* {noticeBanner ? <div className="app-public-notice">{noticeBanner}</div> : null} */}

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
                    {captchaSrc ? <Image src={captchaSrc} alt="captcha" width={120} height={44} preview={false} /> : <div style={{ width: 120, height: 44 }} />}
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
                    setExpandedRemarkKeys({});
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
                    {resultSummary ? (
                      <Banner
                        className="app-query-summary"
                        fullMode={false}
                        bordered
                        closeIcon={null}
                        type={resultSummary.status === "pos" ? "success" : resultSummary.status === "neg" ? "danger" : "info"}
                        title={
                          <Space spacing="tight">
                            <Text strong>{resultSummary.title}</Text>
                            <StatusBadge status={resultSummary.status} />
                          </Space>
                        }
                        description={
                          <Space vertical spacing="tight">
                            <Text>{resultSummary.description}</Text>
                            <Text type="tertiary" className="app-page-subtitle">
                              本次查询共 {resultSummary.total} 条记录；{resultSummary.statsText}
                            </Text>
                            {resultSummary.status === "neg" ? (
                              <Text type="tertiary" className="app-page-subtitle">
                                提醒：如对结果有疑问，请联系 HR 进一步确认。
                              </Text>
                            ) : null}
                          </Space>
                        }
                      />
                    ) : null}

                    <Timeline mode="left" className="app-query-timeline">
                      {result.data.records.map((r, idx) => {
                        const s = amountStatus(r.raiseAmount);
                        const f = formatAdjust(r.raiseAmount);
                        const n = Number(r.raiseAmount);
                        const type: "default" | "success" | "warning" = Number.isFinite(n)
                          ? n > 0
                            ? "success"
                            : n < 0
                              ? "warning"
                              : "default"
                          : "default";

                        const recordKey = `${r.campaignName}|${r.effectiveDate}|${r.raiseAmount}|${idx}`;
                        const remark = r.remark?.trim() ? r.remark.trim() : "-";
                        // Default to expanded so HR 的备注能直观看到；太长时允许手动收起。
                        const expanded = expandedRemarkKeys[recordKey] ?? true;
                        const remarkTooLong = remark !== "-" && remark.length > 80;
                        const battleLine = pickMessage(s, recordKey);

                        return (
                          <Timeline.Item key={recordKey} type={type}>
                            <div className={`app-query-record ${s}`}>
                              <div className="app-query-record-head">
                                <Space spacing="tight">
                                  <Text strong>{r.campaignName}</Text>
                                  <StatusBadge status={s} />
                                </Space>
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
                                <Tag color="grey" size="small">
                                  绩效：{r.performanceGrade}
                                </Tag>
                              </div>

                              <div className={`app-query-record-mood ${s}`}>
                                <Text>{battleLine}</Text>
                              </div>

                              {s === "neg" ? (
                                <div className="app-query-record-warn">
                                  <Text type="tertiary" className="app-page-subtitle">
                                    建议：尽快联系主管/HR确认原因与下一周期目标，争取把它赢回来。
                                  </Text>
                                </div>
                              ) : null}

                              <div className="app-query-record-remark">
                                <Text type="tertiary" className="app-page-subtitle">
                                  备注：
                                </Text>
                                <div style={{ width: "100%" }}>
                                  <div className={remarkTooLong && !expanded ? "app-remark-clamp" : ""}>
                                    <Text>{remark}</Text>
                                  </div>
                                  {remarkTooLong ? (
                                    <div style={{ marginTop: 6 }}>
                                      <Button
                                        type="tertiary"
                                        size="small"
                                        onClick={() => {
                                          setExpandedRemarkKeys((prev) => ({ ...prev, [recordKey]: !expanded }));
                                        }}
                                      >
                                        {expanded ? "收起" : "展开"}
                                      </Button>
                                    </div>
                                  ) : null}
                                </div>
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
