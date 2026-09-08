import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { Loader2, CheckCircle2, Ticket } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

// Guest entry pass — shows the guest their personal QR to present at the door.
export default function GuestPass() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/api/invitations/checkin/${token}`);
        if (!r.ok) { setErr("Geçersiz giriş kodu."); return; }
        setInfo(await r.json());
      } catch (e) { setErr("Yüklenemedi."); }
      finally { setLoading(false); }
    })();
  }, [token]);

  if (loading) return <div className="min-h-screen grid place-items-center bg-slate-950 text-white"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (err) return <div className="min-h-screen grid place-items-center bg-slate-950 text-white px-6 text-center">{err}</div>;

  const names = info.invitation?.person2 ? `${info.invitation.person1} & ${info.invitation.person2}` : info.invitation?.person1;

  return (
    <div className="min-h-screen grid place-items-center px-5 py-10" style={{ background: "radial-gradient(900px 500px at 50% -10%, #3b1258 0%, #1a0f2e 45%, #0b0510 100%)" }} data-testid="guest-pass">
      <div className="w-full max-w-xs bg-white rounded-3xl overflow-hidden shadow-2xl">
        <div className="bg-[#190826] text-center py-5 px-4">
          <div className="text-[#e9c96e] text-xs uppercase tracking-[0.3em] flex items-center justify-center gap-1"><Ticket className="w-4 h-4" /> Giriş Kartı</div>
          <div className="text-white mt-1" style={{ fontFamily: "'Great Vibes', cursive", fontSize: "1.9rem" }}>{names}</div>
        </div>
        <div className="p-6 text-center">
          <div className="text-lg font-semibold text-slate-900" data-testid="pass-guest-name">{info.name} {info.surname}</div>
          {info.guest_count > 1 && <div className="text-sm text-slate-500">{info.guest_count} kişi</div>}
          <div className="my-5 flex justify-center">
            <div className="bg-white p-2 rounded-xl border-2 border-slate-100">
              <QRCodeCanvas value={`${window.location.origin}/gecis/${token}`} size={190} data-testid="pass-qr" />
            </div>
          </div>
          {info.checked_in ? (
            <div className="inline-flex items-center gap-2 text-emerald-600 font-medium" data-testid="pass-checked-in"><CheckCircle2 className="w-5 h-5" /> Giriş yapıldı</div>
          ) : (
            <div className="text-sm text-slate-500">Girişte bu kartı görevliye gösterin.</div>
          )}
        </div>
        <div className="bg-slate-50 text-center py-3 text-[11px] text-slate-400 tracking-wide">Fotuber · fotuber.com.tr</div>
      </div>
    </div>
  );
}
