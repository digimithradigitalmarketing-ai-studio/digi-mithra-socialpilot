export type TenantRole = "owner" | "admin" | "manager" | "editor" | "support" | "analyst" | "viewer" | "approver";
export type WsRole = "admin" | "manager" | "editor" | "support" | "analyst" | "viewer" | "approver";

export type Provider = "instagram" | "facebook" | "whatsapp" | "google_business" | "youtube" | "linkedin" | "tiktok" | "x";

export interface Plan {
  id: string;
  name: string;
  price_inr: number | null;
  max_workspaces: number;
  max_accounts: number;
  max_posts_per_month: number;
  max_users: number;
  ai_credits_per_month: number;
  features: string[];
  sort_order: number;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  kind: "business" | "agency";
  created_at: string;
}

export interface Membership {
  tenant_id: string;
  user_id: string;
  role: TenantRole;
  tenants: Tenant;
}

export interface Workspace {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  industry: string | null;
  timezone: string;
  brand_settings: Record<string, unknown>;
  created_at: string;
}

export interface SocialAccount {
  id: string;
  tenant_id: string;
  workspace_id: string;
  provider: Provider;
  provider_account_id: string;
  display_name: string | null;
  handle: string | null;
  status: "pending" | "connected" | "expired" | "error" | "disconnected";
  capabilities: { can_publish?: boolean; can_read_messages?: boolean; can_reply?: boolean; can_read_reviews?: boolean };
  scopes: string[];
  is_demo: boolean;
  last_checked_at: string | null;
  created_at: string;
}

export type PostStatus =
  | "draft"
  | "approval_pending"
  | "approved"
  | "rejected"
  | "scheduled"
  | "publishing"
  | "published"
  | "partially_failed"
  | "failed";

export interface ContentPost {
  id: string;
  tenant_id: string;
  workspace_id: string;
  campaign_id: string | null;
  title: string | null;
  body: string;
  media_ids: string[];
  hashtags: string[];
  status: PostStatus;
  requires_approval: boolean;
  scheduled_at: string | null;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PostTarget {
  id: string;
  post_id: string;
  social_account_id: string;
  customized_body: string | null;
  status: "pending" | "publishing" | "published" | "failed" | "skipped";
  external_post_id: string | null;
  error: string | null;
  published_at: string | null;
}

export interface MediaAsset {
  id: string;
  tenant_id: string;
  workspace_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  tags: string[];
  created_at: string;
}

export interface Contact {
  id: string;
  tenant_id: string;
  workspace_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  handle: string | null;
  source: string | null;
  tags: string[];
  marketing_consent: boolean;
  notes: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  tenant_id: string;
  workspace_id: string;
  contact_id: string | null;
  channel: string;
  subject: string | null;
  status: "open" | "pending" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  assigned_to: string | null;
  unread_count: number;
  last_message_at: string;
  is_demo: boolean;
  contacts?: Contact | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound" | "note";
  body: string;
  sender_name: string | null;
  is_ai_draft: boolean;
  created_at: string;
}

export interface PipelineStage {
  id: string;
  name: string;
  position: number;
  color: string;
  is_won: boolean;
  is_lost: boolean;
}

export interface Lead {
  id: string;
  tenant_id: string;
  workspace_id: string;
  contact_id: string | null;
  stage_id: string | null;
  title: string;
  value_inr: number;
  source: string | null;
  event_date: string | null;
  assigned_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  contacts?: Pick<Contact, "id" | "name" | "phone" | "email"> | null;
}

export interface Workflow {
  id: string;
  tenant_id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  trigger_type: "message_received" | "lead_created" | "manual";
  status: "draft" | "active" | "paused";
  version: number;
  definition: { nodes: WorkflowNode[] };
  created_at: string;
  updated_at: string;
}

export type WorkflowNodeType =
  | "condition"
  | "create_lead"
  | "add_tag"
  | "set_priority"
  | "notify"
  | "ai_draft"
  | "wait"
  | "approval"
  | "end";

export interface WorkflowNode {
  type: WorkflowNodeType;
  config: Record<string, string>;
}

export interface Notification {
  id: string;
  tenant_id: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}
