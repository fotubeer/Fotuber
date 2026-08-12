import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft, Users, UserPlus, Trash2, KeyRound, Power, Loader2, Crown, MessageCircle,
} from "lucide-react";
import { studioApi, clearStudioToken } from "@/lib/studioApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function StudioTeam() {
  const navigate = useNavigate();
  const [acc, setAcc] = useState(null);
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", username: "", password: "" });
  const [adding, setAdding] = useState(false);

  const isOwner = acc?.current_user?.is_owner;

  const loadTeam = useCallback(async () => {
    try { setTeam((await studioApi.get("/studio/employees")).data); } catch {}
  }, []);

  useEffect(() => {
    studioApi.get("/studio/me")
      .then((r) => setAcc(r.data.account))
      .catch(() => navigate("/studyo"))
      .finally(() => setLoading(false));
    loadTeam();
  }, [navigate, loadTeam]);

  const addEmployee = async () => {
    if (!form.name.trim() || !form.username.trim() || form.password.length < 4) {
      toast.error("Ad, kullanıcı adı ve en az 4 karakter şifre girin"); return;
    }
    setAdding(true);
    try {
      await studioApi.post("/studio/employees", form);
      toast.success("Çalışan eklendi");
      setForm({ name: "", username: "", password: "" });
      loadTeam();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Eklenemedi");
    } finally { setAdding(false); }
  };

  const toggleActive = async (emp) => {
    await studioApi.patch(`/studio/employees/${emp.id}`, { active: !emp.active });
    loadTeam();
  };

  const resetPw = async (emp) => {
    const pw = window.prompt(`${emp.name} için yeni şifre (min 4):`);
    if (!pw || pw.length < 4) { if (pw !== null) toast.error("Şifre çok kısa"); return; }
    await studioApi.post(`/studio/employees/${emp.id}/reset-password`, { password: pw });
    toast.success("Şifre yenilendi");
  };

  const removeEmp = async (emp) => {
    if (!window.confirm(`${emp.name} kaldırılsın mı?`)) return;
    await studioApi.delete(`/studio/employees/${emp.id}`);
    toast.success("Çalışan kaldırıldı");
    loadTeam();
  };

  const logout = async () => {
    try { await studioApi.post("/studio/logout"); } catch {}
    clearStudioToken();
    navigate("/studyo");
  };

  if (loading || !acc) return <div className="min-h-screen grid place-items-center bg-neutral-950 text-white/60">Yükleniyor…</div>;

  return (
    <div data-testid="studio-team" className="min-h-screen bg-neutral-950 text-white">
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-6">
          <button data-testid="team-back" onClick={() => navigate("/studyo/panel")} className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white">
            <ArrowLeft className="w-4 h-4" /> Panel
          </button>
          <div className="flex items-center gap-2 ml-1">
            <Users className="w-5 h-5 text-amber-400" />
            <h1 className="text-xl font-semibold">Ekip</h1>
          </div>
          <span className="ml-auto text-xs text-white/50">{acc.current_user?.name} · {isOwner ? "Firma Sahibi" : "Çalışan"}</span>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2"><Users className="w-4 h-4" /> Çalışanlar</h2>
            {team && <span data-testid="team-usage" className="text-xs text-white/50">{team.used_users}/{team.max_users} kullanıcı</span>}
          </div>

          <div className="space-y-2" data-testid="team-list">
            <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-400/20 px-3 py-2">
              <Crown className="w-4 h-4 text-amber-400" />
              <div className="text-sm">{team?.owner?.name} <span className="text-white/40 text-xs">(Firma Sahibi)</span></div>
            </div>
            {team?.employees?.map((e) => (
              <div key={e.id} data-testid={`team-emp-${e.id}`} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
                <div className={`w-2 h-2 rounded-full ${e.active ? "bg-emerald-400" : "bg-white/30"}`} />
                <div className="min-w-0">
                  <div className="text-sm truncate">{e.name}</div>
                  <div className="text-[11px] text-white/40 truncate">@{e.username}{!e.active && " · pasif"}</div>
                </div>
                {isOwner && (
                  <div className="ml-auto flex items-center gap-1">
                    <button data-testid={`team-toggle-${e.id}`} onClick={() => toggleActive(e)} title={e.active ? "Pasifleştir" : "Aktifleştir"} className="p-1.5 rounded hover:bg-white/10 text-white/60"><Power className="w-3.5 h-3.5" /></button>
                    <button data-testid={`team-reset-${e.id}`} onClick={() => resetPw(e)} title="Şifre yenile" className="p-1.5 rounded hover:bg-white/10 text-white/60"><KeyRound className="w-3.5 h-3.5" /></button>
                    <button data-testid={`team-del-${e.id}`} onClick={() => removeEmp(e)} title="Kaldır" className="p-1.5 rounded hover:bg-red-500/20 text-red-300"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
            ))}
            {team?.employees?.length === 0 && <div className="text-sm text-white/40 py-2">Henüz çalışan yok.</div>}
          </div>

          {isOwner && (
            <div className="mt-4 pt-4 border-t border-white/10">
              {team?.can_add ? (
                <div className="space-y-2" data-testid="team-add-form">
                  <div className="grid grid-cols-2 gap-2">
                    <Input data-testid="team-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ad Soyad" className="h-9 bg-white/5 border-white/10" />
                    <Input data-testid="team-username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="Kullanıcı adı" className="h-9 bg-white/5 border-white/10" />
                  </div>
                  <Input data-testid="team-password" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Şifre (min 4)" className="h-9 bg-white/5 border-white/10" />
                  <Button data-testid="team-add-btn" onClick={addEmployee} disabled={adding} className="w-full gap-2 bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold">
                    {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Çalışan Ekle
                  </Button>
                </div>
              ) : (
                <div data-testid="team-limit-note" className="text-xs text-amber-200/80 bg-amber-500/10 rounded-lg px-3 py-2">
                  Paket kullanıcı limitine ({team?.max_users}) ulaştınız. Daha fazla çalışan için paketinizi yükseltin.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-xs text-white/50">
          <MessageCircle className="w-4 h-4 text-amber-400/80 shrink-0" />
          Ekip sohbeti artık sağ alttaki yüzen sohbet balonundan her sayfada kullanılabilir (3+ kullanıcılı paketlerde aktif).
        </div>

        <button onClick={logout} className="mt-6 text-xs text-white/40 hover:text-red-300">Çıkış yap</button>
      </div>
    </div>
  );
}
