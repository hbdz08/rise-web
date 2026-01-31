import type { ReactNode } from "react";
import Link from "next/link";
import { Button, Card, Space, Typography } from "@douyinfe/semi-ui-19";
import { IconChevronLeft } from "@douyinfe/semi-icons";

const { Title, Text } = Typography;

type Props = {
  title: string;
  subtitle?: string;
  backHref?: string | null;
  backText?: string;
  actions?: ReactNode;
};

export default function PageHeader({
  title,
  subtitle,
  backHref = "/admin",
  backText = "返回仪表盘",
  actions,
}: Props) {
  return (
    <Card className="app-page-header">
      <Space style={{ width: "100%", justifyContent: "space-between" }} align="start">
        <Space align="start">
          {backHref ? (
            <Link href={backHref}>
              <Button theme="borderless" icon={<IconChevronLeft />}>
                {backText}
              </Button>
            </Link>
          ) : null}
          <div>
            <Title heading={4} style={{ margin: 0, fontSize: 18 }}>
              {title}
            </Title>
            {subtitle ? (
              <Text type="tertiary" className="app-page-subtitle">
                {subtitle}
              </Text>
            ) : null}
          </div>
        </Space>
        {actions ? <Space>{actions}</Space> : null}
      </Space>
    </Card>
  );
}
