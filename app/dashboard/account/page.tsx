"use client";

import { FormEvent, useEffect, useState } from "react";
import { UserAvatar } from "@/components/UserAvatar";
import { Card, ErrorBanner, FieldHint, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth, type AuthUser } from "@/lib/auth";
import { normalizeRoleName } from "@/lib/roles";

const inputClass = "field";

export default function AccountPage() {
  const { user, refresh } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileOk, setProfileOk] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passError, setPassError] = useState<string | null>(null);
  const [passOk, setPassOk] = useState<string | null>(null);
  const [passSaving, setPassSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setName(user.name || "");
    setEmail(user.email || "");
    setPhone(user.phone || "");
  }, [user]);

  async function onSaveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileError(null);
    setProfileOk(null);
    setProfileSaving(true);
    try {
      await api<{ user: AuthUser }>("/auth/me", {
        method: "PATCH",
        json: { name, email, phone: phone.trim() || null },
      });
      await refresh();
      setProfileOk("Profil berhasil disimpan.");
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : "Gagal menyimpan profil");
    } finally {
      setProfileSaving(false);
    }
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    setPassError(null);
    setPassOk(null);
    if (newPassword !== confirmPassword) {
      setPassError("Konfirmasi password tidak cocok");
      return;
    }
    setPassSaving(true);
    try {
      await api("/auth/password", {
        method: "POST",
        json: {
          current_password: currentPassword,
          new_password: newPassword,
        },
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPassOk("Password berhasil diubah.");
    } catch (err) {
      setPassError(err instanceof ApiError ? err.message : "Gagal mengubah password");
    } finally {
      setPassSaving(false);
    }
  }

  if (!user) return null;

  return (
    <div>
      <PageHeader
        eyebrow="Akun"
        title="Pengaturan akun"
        subtitle="Perbarui profil dan password Anda."
      />

      <Card className="mt-2 overflow-hidden p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-4 border-b border-[var(--line)] pb-5">
          <UserAvatar name={user.name} email={user.email} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold tracking-tight">{user.name}</p>
            <p className="mt-0.5 truncate text-sm text-[var(--muted)]">{user.email}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {normalizeRoleName(user.role?.name) || "-"}
            </p>
          </div>
        </div>

        <form onSubmit={onSaveProfile} className="mt-5 grid max-w-xl gap-4 md:grid-cols-2">
          <h2 className="text-base font-semibold md:col-span-2">Profil</h2>
          <div className="md:col-span-2">
            <ErrorBanner message={profileError} />
            {profileOk && (
              <p className="mb-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                {profileOk}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium">Nama</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Telepon</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
              placeholder="Opsional"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium">Email</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
            <FieldHint>Email dipakai untuk login.</FieldHint>
          </div>
          <div className="md:col-span-2">
            <button type="submit" className="btn-primary" disabled={profileSaving}>
              {profileSaving ? "Menyimpan..." : "Simpan profil"}
            </button>
          </div>
        </form>
      </Card>

      <Card className="mt-4 max-w-xl overflow-hidden p-5 sm:p-6">
        <form onSubmit={onChangePassword} className="grid gap-4">
          <h2 className="text-base font-semibold">Ubah password</h2>
          <ErrorBanner message={passError} />
          {passOk && (
            <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              {passOk}
            </p>
          )}
          <div>
            <label className="block text-sm font-medium">Password saat ini</label>
            <input
              required
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Password baru</label>
            <input
              required
              type="password"
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
            />
            <FieldHint>Minimal 8 karakter.</FieldHint>
          </div>
          <div>
            <label className="block text-sm font-medium">Konfirmasi password baru</label>
            <input
              required
              type="password"
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <button type="submit" className="btn-primary" disabled={passSaving}>
              {passSaving ? "Menyimpan..." : "Ubah password"}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
