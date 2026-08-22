import React from "react";
import { Check } from "lucide-react";

const tl = (n) => `${Number(n || 0).toLocaleString("tr-TR")} ₺`;

const fillTokens = (body, c) =>
  (body || "")
    .replaceAll("{{toplam}}", Number(c.total || 0).toLocaleString("tr-TR"))
    .replaceAll("{{cayma}}", Number(c.deposit_amount || 0).toLocaleString("tr-TR"))
    .replaceAll("{{kalan}}", Number(c.remaining_amount || 0).toLocaleString("tr-TR"));

const Line = ({ k, v, strong }) => (
  <div className="flex justify-between gap-3 py-0.5">
    <span style={{ opacity: 0.6 }}>{k}</span>
    <span className="text-right" style={{ fontWeight: strong ? 800 : 500 }}>{v}</span>
  </div>
);

const ConsentRow = ({ label, yes, accent }) => (
  <div className="flex items-center gap-2">
    <span className="inline-flex items-center justify-center w-4 h-4 rounded-sm border"
      style={{ background: yes ? accent : "transparent", borderColor: yes ? accent : "#9ca3af", color: "#fff" }}>
      {yes && <Check size={12} />}
    </span>
    <span>{label}</span>
    <span className="ml-auto font-semibold">{yes ? "EVET" : "HAYIR"}</span>
  </div>
);

// Ortak sözleşme A4 görünümü — admin tasarım ayarlarını uygular.
export default function ContractSheet({ contract: c, settings: s }) {
  const d = s.design || {};
  const accent = d.accent_color || "#111827";
  const textColor = d.text_color || "#1a1a1a";
  const titleFont = d.title_font || "'Great Vibes', cursive";
  const bodyFont = d.body_font || "'Manrope', sans-serif";
  const align = d.header_align || "left";

  const brand = c.brand_variant === "photo"
    ? (s.brand_name_photo || s.company_name)
    : (s.brand_name_venue || s.company_name);
  const clauses = c.brand_variant === "photo"
    ? (s.clauses_photo && s.clauses_photo.length ? s.clauses_photo : s.clauses)
    : s.clauses;

  const coupleName = `${c.bride_name || ""}${c.bride_name && c.groom_name ? " & " : ""}${c.groom_name || ""}`.trim() || c.customer_name || "—";
  const today = (c.created_at || new Date().toISOString()).slice(0, 10).split("-").reverse().join(".");
  const partyRoleLabel = { gelin: "Gelin", damat: "Damat", diger: "Diğer" }[c.party_role] || "—";

  const Emblem = () => {
    if (s.logo_url) return <img src={s.logo_url} alt="logo" className="h-16 object-contain" />;
    if (d.show_emblem === false) return null;
    return (
      <div className="text-center leading-none" style={{ color: accent }}>
        <div className="text-[9px] tracking-[0.3em] font-semibold">{d.emblem_top_text || "STUDIO"}</div>
        <div style={{ fontSize: 52, fontWeight: 900, fontFamily: "Georgia, serif", lineHeight: 0.9 }}>{d.emblem_letter || "F"}</div>
        <div style={{ fontFamily: "'Great Vibes', cursive", fontSize: 18 }}>{d.emblem_bottom_text || "Görsel Sanat"}</div>
      </div>
    );
  };

  return (
    <div className="sheet bg-white mx-auto shadow-xl p-4 sm:p-[46px]" data-testid="contract-sheet"
      style={{ width: "820px", maxWidth: "95%", fontFamily: bodyFont, color: textColor }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 flex-wrap pb-4" style={{ borderBottom: `2px solid ${accent}` }}>
        <div className={`flex items-center gap-4 ${align === "center" ? "mx-auto text-center flex-col" : ""}`}>
          <Emblem />
          <div className={align === "center" ? "text-center" : ""}>
            <div style={{ fontFamily: titleFont, fontSize: Number(d.title_size || 30), color: accent, lineHeight: 1.1 }}>{brand}</div>
            <div className="text-[13px] font-semibold" style={{ letterSpacing: "0.35em", opacity: 0.55 }}>{d.subtitle || "HİZMET SÖZLEŞMESİ"}</div>
          </div>
        </div>
        <div className="text-right text-xs" style={{ opacity: 0.55 }}>
          <div>SÖZLEŞME TARİHİ</div>
          <div className="font-semibold text-sm" style={{ opacity: 1 }}>{today}</div>
        </div>
      </div>

      {/* Parties + finance */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 mt-5 text-[13px]">
        <div className="rounded-xl border p-4" style={{ borderColor: "#e5e7eb" }}>
          <div className="text-[10px] font-bold tracking-widest mb-2" style={{ opacity: 0.45 }}>MÜŞTERİ BİLGİLERİ</div>
          <Line k="Çiftin İsmi" v={coupleName} />
          <Line k="Sözleşme Sahibi" v={`${c.party_name || "—"} (${partyRoleLabel})`} />
          <Line k="T.C. Kimlik No" v={c.party_tc || "—"} />
          <Line k="Telefon" v={c.party_phone || "—"} />
          <Line k="E-posta" v={c.party_email || "—"} />
          <Line k="Adres" v={c.party_address || "—"} />
          <Line k="Gelin Tel" v={c.bride_phone || "—"} />
          <Line k="Damat Tel" v={c.groom_phone || "—"} />
        </div>
        <div className="rounded-xl border p-4" style={{ borderColor: "#e5e7eb" }}>
          <div className="text-[10px] font-bold tracking-widest mb-2" style={{ opacity: 0.45 }}>ORGANİZASYON & ÖDEME</div>
          <Line k="Tarih" v={c.event_date || "—"} />
          <Line k="Saat" v={c.event_time || "—"} />
          <Line k="Mekan" v={c.venue || "—"} />
          <div className="my-2 border-t border-dashed" style={{ borderColor: "#e5e7eb" }} />
          <Line k="Toplam Hizmet Bedeli" v={tl(c.subtotal)} />
          {Number(c.discount_percent) > 0 && <Line k={`İndirim (%${c.discount_percent})`} v={`- ${tl(c.discount_amount)}`} />}
          <Line k="Net Tutar" v={tl(c.total)} strong />
          <Line k="Cayma Bedeli (Peşinat)" v={tl(c.deposit_amount)} />
          <Line k="Kalan Ödeme" v={tl(c.remaining_amount)} strong />
          {c.payment_method && <Line k="Ödeme Şekli" v={c.payment_method === "card" ? "Kart" : "Nakit"} />}
        </div>
      </div>

      {/* Hizmet seçimi */}
      <div className="mt-5">
        <div className="text-center text-sm font-bold tracking-widest py-1.5 rounded text-white" style={{ background: accent }}>HİZMET SEÇİMİ</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-3 text-[13px]">
          {(c.line_items || []).map((it, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-sm text-white" style={{ background: accent }}><Check size={12} /></span>
              <span className="flex-1">{it.label}</span>
              {Number(it.price) > 0 && <span style={{ opacity: 0.5 }}>{tl(it.price)}</span>}
            </div>
          ))}
          {(c.line_items || []).length === 0 && <div style={{ opacity: 0.4 }}>Seçim yok</div>}
        </div>
      </div>

      {/* Medya izni */}
      <div className="mt-5 rounded-xl border p-4 text-[13px]" style={{ borderColor: "#e5e7eb" }}>
        <div className="text-[10px] font-bold tracking-widest mb-2" style={{ opacity: 0.45 }}>GÖRSEL KULLANIM İZNİ (KVKK)</div>
        <div className="space-y-1.5">
          <ConsentRow label="Çekilen fotoğraf/videoların sosyal medyada paylaşımına izin veriyorum" yes={c.consent_social} accent={accent} />
          <ConsentRow label="Ürün, tanıtım ve kampanyalarda kullanılmasına izin veriyorum" yes={c.consent_marketing} accent={accent} />
        </div>
      </div>

      {/* Maddeler */}
      <div className="mt-5">
        <div className="text-center text-sm font-bold tracking-widest py-1.5 rounded text-white" style={{ background: accent }}>SÖZLEŞME MADDELERİ VE ÖDEME PLANI</div>
        <div className="mt-3 space-y-3 text-[11.5px] leading-relaxed">
          {(clauses || []).map((cl, i) => (
            <div key={i}>
              <div className="font-bold italic" style={{ color: accent }}>{cl.title}</div>
              <div className="whitespace-pre-line">{fillTokens(cl.body, c)}</div>
            </div>
          ))}
          {s.acceptance_text && (
            <div className="mt-3 p-3 rounded-lg font-medium" style={{ background: "#f8fafc", border: "1px solid #e5e7eb" }}>
              {s.acceptance_text}
            </div>
          )}
        </div>
      </div>

      {/* Onay durumu */}
      {c.approval_status === "approved" && (
        <div className="mt-4 flex items-center gap-2 text-sm font-semibold" style={{ color: "#059669" }}>
          <Check size={16} /> Dijital olarak onaylandı{c.approver_name ? ` — ${c.approver_name}` : ""}{c.approved_at ? ` (${c.approved_at.slice(0, 10)})` : ""}
        </div>
      )}

      {/* İmza */}
      <div className="mt-8 grid grid-cols-2 gap-6 sm:gap-10 text-center text-sm">
        <div><div className="border-t pt-2 font-semibold" style={{ borderColor: "#9ca3af" }}>HİZMET VEREN</div></div>
        <div>
          {c.signature && <img src={c.signature} alt="imza" className="h-16 mx-auto object-contain" data-testid="contract-signature" />}
          <div className="border-t pt-2 font-semibold" style={{ borderColor: "#9ca3af" }}>HİZMET ALAN</div>
        </div>
      </div>
      <div className="text-center text-[10px] mt-4" style={{ opacity: 0.4 }}>İş bu sözleşmenin bir nüshası müşteride, diğer nüshası firmamızda kalacaktır.</div>
    </div>
  );
}
