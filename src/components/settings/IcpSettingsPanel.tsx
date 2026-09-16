'use client';

import { useEffect, useState, useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import type { IcpSettingsFormData } from '@/lib/validations/icp-settings.validation';

function toLines(values: string[]): string {
  return values.join('\n');
}

function fromLines(text: string): string[] {
  return text
    .split('\n')
    .map(v => v.trim())
    .filter(Boolean);
}

const EMPTY_FORM: IcpSettingsFormData = {
  targetCategories: [],
  targetCities: [],
  targetStates: [],
  targetSeniorities: [],
  targetDepartments: [],
  minEmployeeCount: null,
  maxEmployeeCount: null,
  requireContactChannel: true,
};

export function IcpSettingsPanel() {
  const [form, setForm] = useState<IcpSettingsFormData>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/icp-settings');
      if (!res.ok) return;
      const json = await res.json() as { data: IcpSettingsFormData };
      setForm(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/icp-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        toast.error('Não foi possível salvar o Perfil de Cliente Ideal');
        return;
      }
      const json = await res.json() as { data: IcpSettingsFormData };
      setForm(json.data);
      toast.success('Perfil de Cliente Ideal salvo — os próximos leads serão filtrados por esses critérios');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Carregando Perfil de Cliente Ideal...</span>
      </div>
    );
  }

  return (
    <div id="icp-settings">
      <div className="mb-4">
        <h3 className="font-medium text-sm">Perfil de Cliente Ideal (ICP)</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Configure uma vez os atributos do lead que sua empresa quer prospectar.
          Todo novo lead (de qualquer canal) é comparado automaticamente contra
          esses critérios — sem restrição configurada, todo lead com dado mínimo
          utilizável passa.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="icp-categories">Categorias/segmentos-alvo (uma por linha)</Label>
          <Textarea
            id="icp-categories"
            rows={4}
            placeholder={"Restaurante\nPizzaria\nClínica odontológica"}
            value={toLines(form.targetCategories)}
            onChange={e => setForm(f => ({ ...f, targetCategories: fromLines(e.target.value) }))}
          />
          <p className="text-xs text-muted-foreground">Vazio = aceita qualquer categoria.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="icp-cities">Cidades-alvo (uma por linha)</Label>
          <Textarea
            id="icp-cities"
            rows={4}
            placeholder={"São Paulo, SP\nCampinas, SP"}
            value={toLines(form.targetCities)}
            onChange={e => setForm(f => ({ ...f, targetCities: fromLines(e.target.value) }))}
          />
          <p className="text-xs text-muted-foreground">Vazio = aceita qualquer cidade.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 mt-4">
        <div className="space-y-1.5">
          <Label htmlFor="icp-min-employees">Porte mínimo (nº de funcionários)</Label>
          <Input
            id="icp-min-employees"
            type="number"
            min={0}
            value={form.minEmployeeCount ?? ''}
            onChange={e => setForm(f => ({
              ...f,
              minEmployeeCount: e.target.value === '' ? null : Number(e.target.value),
            }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="icp-max-employees">Porte máximo (nº de funcionários)</Label>
          <Input
            id="icp-max-employees"
            type="number"
            min={0}
            value={form.maxEmployeeCount ?? ''}
            onChange={e => setForm(f => ({
              ...f,
              maxEmployeeCount: e.target.value === '' ? null : Number(e.target.value),
            }))}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Porte só se aplica hoje ao canal LinkedIn (companies/contacts) — o canal
        Google Maps ainda não coleta esse dado.
      </p>

      <div className="flex items-center justify-between mt-4 rounded-md border p-3">
        <div>
          <p className="text-sm font-medium">Exigir canal de contato</p>
          <p className="text-xs text-muted-foreground">
            Sem telefone, WhatsApp, e-mail ou site, o lead fica em quarentena em
            vez de qualificado — não dá pra abordar quem não tem como contatar.
          </p>
        </div>
        <Switch
          checked={form.requireContactChannel}
          onCheckedChange={checked => setForm(f => ({ ...f, requireContactChannel: checked }))}
        />
      </div>

      <div className="mt-4">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar Perfil de Cliente Ideal
        </Button>
      </div>
    </div>
  );
}
