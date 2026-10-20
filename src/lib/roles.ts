// Display names for database roles, matching the owner / admin / manager / staff / client model.
export const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  editor: "Staff · Content",
  support: "Staff · Support",
  analyst: "Staff · Analyst",
  approver: "Client · Approver",
  viewer: "Client · View only",
};

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  owner: "Billing, organization deletion and everything an admin can do.",
  admin: "All workspaces, team, connections and settings.",
  manager: "Runs a workspace: connections, approvals, automations and content.",
  editor: "Creates and schedules content, handles inbox and CRM.",
  support: "Handles inbox conversations, contacts, leads and tasks.",
  analyst: "Reads reports and analytics.",
  approver: "Client access: reviews and approves content before it goes live.",
  viewer: "Client access: read-only view of the workspace.",
};

export const roleLabel = (role: string) => ROLE_LABELS[role] ?? role;
