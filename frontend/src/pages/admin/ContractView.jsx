import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { api, formatApiError } from "@/lib/api";
import { Printer, ArrowLeft, Copy, Check, MessageCircle, QrCode, Download, Pencil } from "lucide-react";
import { toast } from "sonner";
import ContractSheet from "@/components/ContractSheet";

export default function ContractView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [c, setC] = useState(null);
  const [s, setS] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const load = () => api.get(`/appt-pro/contracts/${id}`)
    .then(({ data }) => { setC(data.contract); setS(data.settings); })
    .catch((e) => toast.error(formatApiError(e)));
  useEffect(() => { load(); }, [id]);

  if (!c || !s) return <div className="min-h-screen flex items-center justify-center text-neutral-500">Yükleniyor…</div>;

  const publicUrl = `${window.location.origin}/sozlesme/${c.public_token}`;
  const phone = (c.party_phone || c.bride_phone || c.groom_phone || "").replace(/\D/g, "");
  const waPhone = phone.startsWith("0") ? "9" + phone : (phone.startsWith("9") ? phone : "90" + phone);
  const waText = encodeURIComponent(`Merhaba, ${s.company_name} hizmet sözleşmenizi aşağıdaki linkten inceleyip onaylayabilirsiniz:\n${publicUrl}`);
  const waUrl = `https://wa.me/${waPhone}?text=${waText}`;

  const copyLink = () => { navigator.clipboard?.writeText(publicUrl); setCopied(true); toast.success("Link kopyalandı"); setTimeout(() => setCopied(false), 1800); };

  const downloadPdf = async () => {
    try {
      const res = await api.get(`/appt-pro/contracts/${id}/pdf`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a"); a.href = url; a.download = `sozlesme-${id.slice(0, 8)}.pdf`;
      document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
    } catch (e) { toast.error(formatApiError(e, "PDF indirilemedi")); }
  };

  return (
    <div className="min-h-screen bg-neutral-100 py-6 text-neutral-900">
      <style>{`
        @media print { .no-print { display: none !important; } body { background: #fff !important; }
          .sheet { box-shadow: none !important; margin: 0 !important; width: 100% !important; } @page { size: A4; margin: 12mm; } }
      `}</style>

      <div className="no-print max-w-[860px] mx-auto mb-4 flex flex-wrap items-center gap-2 px-4">
        <button onClick={() => navigate("/admin/randevular")} data-testid="contract-back" className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 mr-auto">
          <ArrowLeft size={16} /> Randevular
        </button>
        {c.approval_status === "approved"
          ? <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5" data-testid="contract-status"><Check size={15} /> Onaylandı</span>
          : <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5" data-testid="contract-status">Onay Bekliyor</span>}
        <a href={waUrl} target="_blank" rel="noreferrer" data-testid="contract-whatsapp"
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold px-4 py-2.5 hover:bg-emerald-500"><MessageCircle size={16} /> WhatsApp ile Gönder</a>
        <button onClick={copyLink} data-testid="contract-copy" className="inline-flex items-center gap-2 rounded-lg bg-white border border-neutral-300 text-neutral-900 text-sm font-semibold px-4 py-2.5 hover:bg-neutral-50">
          {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />} Linki Kopyala</button>
        <button onClick={() => navigate(`/admin/randevu-duzenle/${c.id}`)} data-testid="contract-edit" className="inline-flex items-center gap-2 rounded-lg bg-white border border-neutral-300 text-neutral-900 text-sm font-semibold px-4 py-2.5 hover:bg-neutral-50"><Pencil size={16} /> Düzenle</button>
        <button onClick={() => setShowQr((v) => !v)} data-testid="contract-qr-toggle" className="inline-flex items-center gap-2 rounded-lg bg-white border border-neutral-300 text-neutral-900 text-sm font-semibold px-4 py-2.5 hover:bg-neutral-50"><QrCode size={16} /> QR</button>
        <button onClick={downloadPdf} data-testid="contract-pdf" className="inline-flex items-center gap-2 rounded-lg bg-white border border-neutral-300 text-neutral-900 text-sm font-semibold px-4 py-2.5 hover:bg-neutral-50"><Download size={16} /> PDF İndir</button>
        <button onClick={() => window.print()} data-testid="contract-print" className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 text-white text-sm font-semibold px-5 py-2.5 hover:bg-neutral-800"><Printer size={16} /> Yazdır</button>
      </div>

      {showQr && (
        <div className="no-print max-w-[860px] mx-auto mb-4 flex justify-center">
          <div className="bg-white p-5 rounded-2xl border border-neutral-200 text-center" data-testid="contract-qr">
            <QRCodeCanvas value={publicUrl} size={180} />
            <p className="text-xs text-neutral-500 mt-2">Müşteri QR'ı okutup sözleşmeyi açar ve onaylar</p>
          </div>
        </div>
      )}

      <ContractSheet contract={c} settings={s} />
    </div>
  );
}
