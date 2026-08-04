import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { formatApiError } from "@/lib/api";
import { toast } from "sonner";

const Register = () => {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", surname: "", email: "", phone: "", password: "" });
  const [kvkk, setKvkk] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!kvkk) {
      toast.error("Devam etmek için KVKK aydınlatma metnini kabul etmelisiniz.");
      return;
    }
    setBusy(true);
    try {
      await register({ ...form, kvkk_consent: kvkk, marketing_consent: marketing });
      toast.success("Kayıt oluşturuldu. Randevu alabilirsiniz.");
      nav("/randevu");
    } catch (err) {
      toast.error(formatApiError(err, "Kayıt oluşturulamadı"));
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="glass rounded-2xl p-8">
          <h1 className="font-serif text-3xl mb-1">Kayıt Ol</h1>
          <p className="text-sm text-neutral-400 mb-6">Randevu almak için birkaç saniye.</p>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-neutral-400 text-xs">Ad</Label>
                <Input data-testid="reg-name" value={form.name} onChange={upd("name")} className="bg-neutral-950 border-neutral-800 text-neutral-100 mt-1" required />
              </div>
              <div>
                <Label className="text-neutral-400 text-xs">Soyad</Label>
                <Input data-testid="reg-surname" value={form.surname} onChange={upd("surname")} className="bg-neutral-950 border-neutral-800 text-neutral-100 mt-1" required />
              </div>
            </div>
            <div>
              <Label className="text-neutral-400 text-xs">Telefon</Label>
              <Input data-testid="reg-phone" value={form.phone} onChange={upd("phone")} className="bg-neutral-950 border-neutral-800 text-neutral-100 mt-1" required />
            </div>
            <div>
              <Label className="text-neutral-400 text-xs">E-posta</Label>
              <Input data-testid="reg-email" type="email" value={form.email} onChange={upd("email")} className="bg-neutral-950 border-neutral-800 text-neutral-100 mt-1" required />
            </div>
            <div>
              <Label className="text-neutral-400 text-xs">Şifre</Label>
              <Input data-testid="reg-password" type="password" value={form.password} onChange={upd("password")} className="bg-neutral-950 border-neutral-800 text-neutral-100 mt-1" required minLength={6} />
            </div>

            <div className="pt-2 space-y-3 border-t border-neutral-800 mt-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  data-testid="reg-kvkk"
                  checked={kvkk}
                  onCheckedChange={(v) => setKvkk(!!v)}
                  className="mt-0.5 border-neutral-700 data-[state=checked]:bg-[#d4af37] data-[state=checked]:text-black data-[state=checked]:border-[#d4af37]"
                  required
                />
                <span className="text-xs text-neutral-400 leading-relaxed">
                  <span className="text-[#d4af37]">*</span> <b className="text-neutral-200">KVKK Aydınlatma Metni</b>'ni okudum,
                  kişisel verilerimin randevu yönetimi ve iletişim amacıyla Fotuber Studio
                  tarafından işlenmesini kabul ediyorum.
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  data-testid="reg-marketing"
                  checked={marketing}
                  onCheckedChange={(v) => setMarketing(!!v)}
                  className="mt-0.5 border-neutral-700 data-[state=checked]:bg-[#d4af37] data-[state=checked]:text-black data-[state=checked]:border-[#d4af37]"
                />
                <span className="text-xs text-neutral-400 leading-relaxed">
                  Kampanya, indirim ve etkinlik bilgilendirmelerini SMS, e-posta ve WhatsApp
                  üzerinden almak istiyorum. (İsteğe bağlı — istediğiniz zaman iptal
                  edebilirsiniz.)
                </span>
              </label>
            </div>

            <Button data-testid="reg-submit-btn" type="submit" disabled={busy || !kvkk} className="w-full rounded-full bg-[#d4af37] text-black hover:bg-[#b5952f] h-11 disabled:opacity-50">
              {busy ? "Oluşturuluyor..." : "Kayıt Ol"}
            </Button>
          </form>
          <div className="mt-6 text-sm text-neutral-400 text-center">
            Zaten hesabınız var mı? <Link to="/giris" className="text-[#d4af37] link-underline">Giriş yapın</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
