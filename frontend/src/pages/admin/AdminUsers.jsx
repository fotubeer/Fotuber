import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { UserPlus, Pencil, Trash2, ShieldCheck, User } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

const emptyUser = { email: "", name: "", password: "", role: "staff", phone: "" };

const AdminUsers = () => {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/users/staff");
      setUsers(data);
    } catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...editing };
      if (!payload.password) delete payload.password;
      if (editing.id) {
        await api.patch(`/users/staff/${editing.id}`, payload);
        toast.success("Kullanıcı güncellendi");
      } else {
        await api.post("/users/staff", payload);
        toast.success("Personel eklendi");
      }
      setEditing(null);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const remove = async (u) => {
    try {
      await api.delete(`/users/staff/${u.id}`);
      toast.success("Silindi");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const roleBadge = (r) => r === "admin" ? (
    <Badge className="bg-amber-100 text-amber-700 border-amber-300 gap-1">
      <ShieldCheck className="w-3 h-3" /> Yönetici
    </Badge>
  ) : (
    <Badge className="bg-slate-100 text-slate-700 border-slate-300 gap-1">
      <User className="w-3 h-3" /> Personel
    </Badge>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight" data-testid="admin-users-title">Personel Hesapları</h1>
          <p className="text-sm text-slate-500 mt-1">
            Yönetici (admin) tüm sistemi görür. Personel yalnızca günlük nakit girişi yapabilir ve kasa devrini kaydeder.
          </p>
        </div>
        <Button
          data-testid="user-add-btn"
          onClick={() => setEditing({ ...emptyUser })}
          className="bg-slate-900 hover:bg-slate-800"
        >
          <UserPlus className="w-4 h-4 mr-2" /> Yeni Personel
        </Button>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Kayıtlı Personel & Yöneticiler</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ad Soyad</TableHead>
                <TableHead>E-posta</TableHead>
                <TableHead>Telefon</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead className="text-right">Aksiyon</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">Kayıt yok.</TableCell></TableRow>
              )}
              {users.map((u) => (
                <TableRow key={u.id} data-testid={`user-row-${u.id}`}>
                  <TableCell className="font-medium">
                    {u.name}
                    {u.id === me?.id && <span className="ml-2 text-xs text-slate-400">(siz)</span>}
                  </TableCell>
                  <TableCell className="text-slate-600">{u.email}</TableCell>
                  <TableCell className="text-slate-600">{u.phone || "—"}</TableCell>
                  <TableCell>{roleBadge(u.role)}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="outline" onClick={() => setEditing({ ...u, password: "" })} data-testid={`user-edit-${u.id}`}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    {u.id !== me?.id && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="destructive" data-testid={`user-delete-${u.id}`}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{u.name} silinsin mi?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Bu kullanıcı silinecek ve bir daha giriş yapamayacak. Bu işlem geri alınamaz.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove(u)} className="bg-red-600 hover:bg-red-700">Sil</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent data-testid="user-dialog">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Personel Düzenle" : "Yeni Personel Ekle"}</DialogTitle>
            <DialogDescription>
              Şifre alanını boş bırakırsanız mevcut şifre korunur (düzenlemede). Yeni kullanıcıda zorunludur.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-semibold text-slate-900 mb-1 block">Ad Soyad</Label>
                  <Input data-testid="user-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Ali Yılmaz" />
                </div>
                <div>
                  <Label className="text-sm font-semibold text-slate-900 mb-1 block">E-posta</Label>
                  <Input data-testid="user-email" type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} disabled={!!editing.id} placeholder="ali@fotuber.com.tr" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-semibold text-slate-900 mb-1 block">Telefon</Label>
                  <Input data-testid="user-phone" value={editing.phone || ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} placeholder="0501..." />
                </div>
                <div>
                  <Label className="text-sm font-semibold text-slate-900 mb-1 block">Rol</Label>
                  <Select value={editing.role} onValueChange={(v) => setEditing({ ...editing, role: v })}>
                    <SelectTrigger data-testid="user-role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="staff">Personel (Sadece günlük nakit)</SelectItem>
                      <SelectItem value="admin">Yönetici (Tüm yetkiler)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-sm font-semibold text-slate-900 mb-1 block">
                  {editing.id ? "Yeni Şifre (boş bırakırsanız mevcut korunur)" : "Şifre"}
                </Label>
                <Input
                  data-testid="user-password"
                  type="text"
                  value={editing.password || ""}
                  onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                  placeholder="En az 6 karakter"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Vazgeç</Button>
            <Button data-testid="user-save-btn" onClick={save} disabled={saving} className="bg-slate-900 hover:bg-slate-800">
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsers;
