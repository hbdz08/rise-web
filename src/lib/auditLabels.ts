export function auditActionLabel(action: string): string {
  const map: Record<string, string> = {
    // Campaigns
    CAMPAIGN_CREATE: "创建活动",
    CAMPAIGN_UPDATE: "修改活动",
    CAMPAIGN_PUBLISH: "发布活动",
    CAMPAIGN_ARCHIVE: "归档活动",
    CAMPAIGN_DELETE: "删除活动",

    // Employees
    EMPLOYEE_CREATE: "新增人员",
    EMPLOYEE_UPDATE: "修改人员",
    EMPLOYEE_IMPORT: "导入人员",

    // Items
    RAISE_ITEM_UPSERT: "录入/修改活动明细",
    CAMPAIGN_ITEMS_IMPORT: "导入活动明细",
    RAISE_ITEM_ADMIN_OVERRIDE: "管理员修正（发布后）",

    // Admin users
    ADMIN_USER_CREATE: "新增管理员账号",
    ADMIN_USER_UPDATE: "修改管理员账号",
    ADMIN_USER_RESET_PASSWORD: "重置管理员密码",
    ADMIN_USER_DELETE: "删除管理员账号",

    // Auth / public
    ADMIN_LOGIN_SUCCESS: "后台登录成功",
    ADMIN_LOGIN_FAIL: "后台登录失败",
    PUBLIC_QUERY: "员工查询",
    PUBLIC_QUERY_FAIL: "员工查询失败",
  };
  return map[action] ?? action;
}

export function auditEntityLabel(entity: string): string {
  const map: Record<string, string> = {
    raise_campaigns: "调薪活动",
    raise_items: "活动明细",
    employees: "人员",
    admin_users: "管理员账号",
    public_query: "员工查询",
  };
  return map[entity] ?? entity;
}

export function auditFieldLabel(field: string): string {
  const map: Record<string, string> = {
    // Common
    ok: "是否成功",
    reason: "原因",

    // Employee
    name: "姓名",
    dept: "部门",
    jobTitle: "岗位/职务",
    status: "状态",
    idLast6: "身份证后 6 位",
    phoneMasked: "手机号（脱敏）",
    phoneChanged: "手机号（是否变更）",

    // Campaign
    campaignId: "活动ID",
    campaignName: "活动名称",
    effectiveDate: "生效日期",
    startDate: "开始日期",
    endDate: "结束日期",

    // Raise item
    employeeId: "人员ID",
    raiseAmount: "调整金额",
    performanceGrade: "绩效等级",
    remark: "备注",
    overrideReason: "修正原因",

    // Admin user
    username: "用户名",
    role: "角色",
    passwordChanged: "密码（是否变更）",
  };
  return map[field] ?? field;
}
