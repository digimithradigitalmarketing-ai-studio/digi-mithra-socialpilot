"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, KeyRound, Mail, ShieldCheck, Trash2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { Avatar } from "@/components/avatar";
import { Badge, Button, Card, CardHeader, Field, Input, LoadingBlock } from "@/components/ui";
import { useToast } from "@/components/toast";
import { roleLabel } from "@/lib/roles";
import { errMsg, formatDate, timeAgo } from "@/lib/utils";

interface TeamRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: string;
  joined_at: string;
  last_sign_in_at: string | null;
}

/** Crops the image to a centered square and scales it to 256px webp. */
async function toSquareAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image processing is not supported in this browser");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
  if (!blob) throw new Error("Could not process the image");
  return blob;
}

function storagePathFromUrl(url: string | null | undefined) {
  const marker = "/storage/v1/object/public/avatars/";
  if (!url || !url.includes(marker)) return null;
  return decodeURIComponent(url.split(marker)[1].split("?")[0]);
}

export default function ProfilePage() {
  const supabase = createClient();
  const toast = useToast();
  const { user, profile, memberships, tenant, refresh, can } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(profile?.full_name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [team, setTeam] = useState<TeamRow[] | null>(null);
  const isAdmin = can("admin");

  useEffect(() => setName(profile?.full_name ?? ""), [profile?.full_name]);

  const loadTeam = useCallback(async () => {
    if (!isAdmin) return;
    const { data, error } = await supabase.rpc("team_activity", { p_tenant: tenant.id });
    if (error) toast(errMsg(error), "error");
    setTeam((data ?? []) as TeamRow[]);
  }, [supabase, tenant.id, isAdmin, toast]);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  const displayName = profile?.full_name || user.email || "You";

  const uploadPhoto = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast("Choose an image file", "error");
    if (file.size > 10 * 1024 * 1024) return toast("Image must be under 10 MB", "error");
    setUploading(true);
    try {
      const blob = await toSquareAvatar(file);
      const path = `${user.id}/avatar-${Date.now()}.webp`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/webp", upsert: false });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error } = await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", user.id);
      if (error) throw error;
      const old = storagePathFromUrl(profile?.avatar_url);
      if (old) await supabase.storage.from("avatars").remove([old]);
      await refresh();
      toast("Profile photo updated");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removePhoto = async () => {
    const old = storagePathFromUrl(profile?.avatar_url);
    const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
    if (error) return toast(errMsg(error), "error");
    if (old) await supabase.storage.from("avatars").remove([old]);
    await refresh();
    toast("Profile photo removed");
  };

  const saveName = async () => {
    setSavingName(true);
    const { error } = await supabase.from("profiles").update({ full_name: name.trim() || null }).eq("id", user.id);
    setSavingName(false);
    if (error) return toast(errMsg(error), "error");
    await refresh();
    toast("Name saved");
  };

  const changePassword = async () => {
    if (password.length < 8) return toast("Use at least 8 characters", "error");
    if (password !== confirm) return toast("Passwords don't match", "error");
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSavingPw(false);
    if (error) return toast(errMsg(error), "error");
    setPassword("");
    setConfirm("");
    toast("Password changed");
  };

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="tint-blue h-24 sm:h-28" />
        <div className="-mt-12 flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-4">
            <div className="relative">
              <Avatar src={profile?.avatar_url} name={displayName} size="xl" className="ring-4" />
              <button
                aria-label="Change photo"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute right-0 bottom-0 grid size-9 place-items-center rounded-full bg-brand text-on-brand shadow-md hover:bg-brand-2 disabled:opacity-60"
              >
                <Camera className="size-4" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
              />
            </div>
            <div className="min-w-0 pb-1">
              <h2 className="truncate text-xl font-bold">{displayName}</h2>
              <p className="truncate text-sm text-muted">{user.email}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>
              <Camera className="size-4" /> {profile?.avatar_url ? "Change photo" : "Upload photo"}
            </Button>
            {profile?.avatar_url && (
              <Button variant="ghost" size="sm" onClick={removePhoto}>
                <Trash2 className="size-4" /> Remove
              </Button>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Personal details" />
          <div className="space-y-4 p-5">
            <Field label="Full name">
              <div className="flex gap-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
                <Button onClick={saveName} loading={savingName} disabled={name === (profile?.full_name ?? "")}>
                  Save
                </Button>
              </div>
            </Field>
            <dl className="divide-y divide-line rounded-xl border border-line text-sm">
              {[
                { icon: Mail, label: "Email", value: user.email ?? "—" },
                { icon: ShieldCheck, label: "Email verified", value: user.email_confirmed_at ? "Yes" : "No" },
                { label: "Signed in", value: user.last_sign_in_at ? `${formatDate(user.last_sign_in_at)} (${timeAgo(user.last_sign_in_at)})` : "—" },
                { label: "Member since", value: formatDate(user.created_at, { day: "numeric", month: "short", year: "numeric" }) },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <dt className="flex items-center gap-2 text-muted">
                    {r.icon && <r.icon className="size-4" />} {r.label}
                  </dt>
                  <dd className="truncate text-right font-medium">{r.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Card>

        <Card>
          <CardHeader title="Organizations & roles" />
          <div className="divide-y divide-line">
            {memberships.map((m) => (
              <div key={m.tenant_id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.tenants.name}</p>
                  <p className="text-xs text-faint capitalize">{m.tenants.kind}</p>
                </div>
                <Badge tone={m.role === "owner" ? "green" : "gray"}>{roleLabel(m.role)}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Change password" description="Use at least 8 characters that you don't use anywhere else." />
          <div className="space-y-3 p-5">
            <Field label="New password">
              <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label="Confirm new password">
              <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
            <Button onClick={changePassword} loading={savingPw} disabled={!password}>
              <KeyRound className="size-4" /> Update password
            </Button>
          </div>
        </Card>

        {isAdmin && (
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Users className="size-4 text-brand-ink" /> Team login activity
                </span>
              }
              description={`Who has access to ${tenant.name} and when they last signed in.`}
            />
            {team === null ? (
              <LoadingBlock />
            ) : (
              <div className="divide-y divide-line">
                {team.map((t) => {
                  const n = t.full_name || t.email || "Member";
                  return (
                    <div key={t.user_id} className="flex items-center gap-3 px-5 py-3">
                      <Avatar src={t.avatar_url} name={n} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {n} {t.user_id === user.id && <span className="text-xs text-faint">(you)</span>}
                        </p>
                        <p className="truncate text-xs text-faint">{t.email}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-medium">{roleLabel(t.role)}</p>
                        <p className="text-[11px] text-faint">{t.last_sign_in_at ? `Active ${timeAgo(t.last_sign_in_at)}` : "Never signed in"}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
