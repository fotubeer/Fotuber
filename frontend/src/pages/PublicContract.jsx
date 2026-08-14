import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "@/lib/api";
import { Check, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import ContractSheet from "@/components/ContractSheet";

export default function PublicContract() {
  const { token } = useParams();
  const [c, setC] = useState(null);
  const [s, setS] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const load = () => axios.get(`${API_BASE}/appt-pro/public/contracts/${token}`)
    .then(({ data }) => { setC(data.contract); setS(data.settings); setName(data.contract.party_name || ""); })
    .catch(() => setNotFound(true));
  useEffect(() => { load(); }, [token]);

  const approve = async () => {
    if (!accepted) { toast.error("Onaylamak için kutucuğu işaretleyin"); return; }
    setSaving(true);
    try {
      await axios.post(`${API_BASE}/appt-pro/public/contracts/${token}/approve`, { approver_name: name, accepted: true });
      toast.success("Sözleşme onaylandı, teşekkürler!");
      load();
    } catch (e) { toast.error("Onay kaydedilemedi"); }
    finally { setSaving(false); }
  };

  if (notFound) return <div className="min-h-screen flex items-center justify-center text-neutral-500">Sözleşme bulunamadı.</div>;
  if (!c || !s) return <div className="min-h-screen flex items-center justify-center text-neutral-500">Yükleniyor…</div>;

  const isApproved = c.approval_status === "approved";

  return (
    <div className="min-h-screen bg-neutral-100 py-6" data-testid="public-contract">
      <div className="max-w-[860px] mx-auto mb-4 px-4">
        {isApproved ? (
          <div className="rounded-2xl bg-emerald-600 text-white p-4 flex items-center gap-3" data-testid="pc-approved-banner">
            <Check size={22} /> <div><div className="font-semibold">Bu sözleşme onaylandı</div><div className="text-sm opacity-90">{c.approver_name} · {(c.approved_at || "").slice(0, 10)}</div></div>
          </div>
        ) : (
          <div className="rounded-2xl bg-white border border-neutral-200 p-4">
            <div className="flex items-center gap-2 font-semibold text-neutral-800 mb-1"><ShieldCheck size={18} className="text-neutral-700" /> Sözleşme Onayı</div>
            <p className="text-sm text-neutral-500">Lütfen aşağıdaki sözleşmeyi inceleyip onaylayın.</p>
          </div>
        )}
      </div>

      <ContractSheet contract={c} settings={s} />

      {!isApproved && (
        <div className="max-w-[860px] mx-auto mt-5 px-4 pb-16">
          <div className="rounded-2xl bg-white border border-neutral-200 p-5 space-y-4">
            <div>
              <label className="text-sm font-medium text-neutral-700">Ad Soyad</label>
              <input data-testid="pc-name" value={name} onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full h-11 rounded-lg border border-neutral-300 px-3 outline-none focus:border-neutral-900" />
            </div>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="checkbox" data-testid="pc-accept" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1" />
              <span>{s.acceptance_text || "Sözleşmenin tüm maddelerini okudum, anladım ve kabul ediyorum."}</span>
            </label>
            <button onClick={approve} disabled={saving} data-testid="pc-approve"
              className="w-full h-12 rounded-xl bg-neutral-900 text-white font-semibold hover:bg-neutral-800 disabled:opacity-60">
              {saving ? "Kaydediliyor…" : "Sözleşmeyi Onayla"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
