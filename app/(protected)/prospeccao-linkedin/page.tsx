'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Linkedin, Search, ExternalLink, Building2, Sparkles, UserPlus, Check } from 'lucide-react';
import { toast } from 'sonner';

interface LinkedinSearchContact {
  id: string;
  name: string;
  roleTitle: string | null;
  linkedinUrl: string;
  locationRaw: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  convertedLeadId: string | null;
}

interface LinkedinSearchSummary {
  jobId: string;
  found: number;
  created: number;
  skippedSuppressed: number;
  skippedDuplicate: number;
  contacts: LinkedinSearchContact[];
}

function toList(value: string): string[] {
  return value
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

export default function ProspeccaoLinkedInPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [locations, setLocations] = useState('');
  const [currentJobTitles, setCurrentJobTitles] = useState('');
  const [currentCompanies, setCurrentCompanies] = useState('');
  const [maxItems, setMaxItems] = useState(20);
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<LinkedinSearchSummary | null>(null);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error('Informe um termo de busca (ex: cargo, empresa ou nome)');
      return;
    }

    setIsSearching(true);
    setResult(null);
    try {
      const res = await fetch('/api/prospecting/linkedin/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchQuery,
          locations: toList(locations),
          currentJobTitles: toList(currentJobTitles),
          currentCompanies: toList(currentCompanies),
          maxItems,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(typeof json.error === 'string' ? json.error : 'Erro ao buscar no LinkedIn');
        return;
      }

      const data = json.data as LinkedinSearchSummary;
      setResult(data);
      toast.success(
        `${data.found} perfis encontrados — ${data.created} novos, ${data.skippedDuplicate} já existiam`
      );
    } catch {
      toast.error('Erro ao conectar com a API de prospecção');
    } finally {
      setIsSearching(false);
    }
  };

  const updateContact = (id: string, patch: Partial<LinkedinSearchContact>) => {
    setResult(prev =>
      prev
        ? { ...prev, contacts: prev.contacts.map(c => (c.id === id ? { ...c, ...patch } : c)) }
        : prev
    );
  };

  const handleEnrich = async (contact: LinkedinSearchContact) => {
    setEnrichingId(contact.id);
    try {
      const res = await fetch(`/api/contacts/${contact.id}/enrich`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        toast.error(typeof json.error === 'string' ? json.error : 'Erro ao enriquecer contato');
        return;
      }
      const data = json.data as { contact: { email: string | null; phone: string | null }; emailFound: boolean; phoneFound: boolean };
      updateContact(contact.id, { email: data.contact.email, phone: data.contact.phone });
      if (data.emailFound || data.phoneFound) {
        toast.success('Contato enriquecido com dados do site institucional');
      } else {
        toast.info('Não encontramos email/telefone públicos no site da empresa');
      }
    } catch {
      toast.error('Erro ao conectar com a API de enriquecimento');
    } finally {
      setEnrichingId(null);
    }
  };

  const handlePromote = async (contact: LinkedinSearchContact) => {
    setPromotingId(contact.id);
    try {
      const res = await fetch(`/api/contacts/${contact.id}/promote`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        toast.error(typeof json.error === 'string' ? json.error : 'Erro ao enviar para o CRM');
        return;
      }
      const lead = json.data as { id: string };
      updateContact(contact.id, { convertedLeadId: lead.id });
      toast.success('Lead criado na Tabela de Leads — origem "LinkedIn"');
    } catch {
      toast.error('Erro ao conectar com a API de conversão');
    } finally {
      setPromotingId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Linkedin className="h-6 w-6 text-primary" />
          Prospecção LinkedIn
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Busca pessoas no LinkedIn via camada pública, sem login e sem risco de banimento de
          conta. Os resultados ficam em uma área separada — use <strong>Enriquecer</strong> para
          tentar achar email/telefone e <strong>Enviar para o CRM</strong> para criar o lead
          (origem &quot;LinkedIn&quot;, identificável na Tabela de Leads e no Dashboard).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nova busca</CardTitle>
          <CardDescription>Preencha ao menos o termo de busca. Os demais filtros são opcionais.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="searchQuery">Termo de busca <span className="text-red-500">*</span></Label>
            <Input
              id="searchQuery"
              placeholder="ex: Marketing Manager, Diretor Financeiro..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="locations">Localizações (separadas por vírgula)</Label>
              <Input
                id="locations"
                placeholder="Brazil, São Paulo"
                value={locations}
                onChange={e => setLocations(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="jobTitles">Cargos-alvo (separados por vírgula)</Label>
              <Input
                id="jobTitles"
                placeholder="Marketing Manager, CMO"
                value={currentJobTitles}
                onChange={e => setCurrentJobTitles(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="companies">Empresas-alvo (URLs LinkedIn, separadas por vírgula)</Label>
              <Input
                id="companies"
                placeholder="https://www.linkedin.com/company/..."
                value={currentCompanies}
                onChange={e => setCurrentCompanies(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="maxItems">Máximo de perfis</Label>
              <Input
                id="maxItems"
                type="number"
                min={1}
                max={100}
                value={maxItems}
                onChange={e => setMaxItems(Number(e.target.value) || 20)}
              />
            </div>
          </div>

          <Button onClick={handleSearch} disabled={isSearching} className="gap-2">
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Buscar no LinkedIn
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle>Resultado</CardTitle>
              <div className="flex gap-2 flex-wrap">
                <Badge variant="secondary">{result.found} encontrados</Badge>
                <Badge className="bg-green-100 text-green-800">{result.created} novos</Badge>
                {result.skippedDuplicate > 0 && (
                  <Badge variant="outline">{result.skippedDuplicate} já existiam</Badge>
                )}
                {result.skippedSuppressed > 0 && (
                  <Badge variant="destructive">{result.skippedSuppressed} suprimidos</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {result.contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum contato novo — todos os perfis encontrados já existiam na base.
              </p>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm min-w-[900px]">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Nome</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Cargo</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Empresa</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Email</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Telefone</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Perfil</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {result.contacts.map(contact => {
                      const hasContactInfo = Boolean(contact.email || contact.phone);
                      return (
                        <tr key={contact.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-3 py-2 font-medium whitespace-nowrap">{contact.name}</td>
                          <td className="px-3 py-2 text-muted-foreground">{contact.roleTitle ?? '—'}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {contact.companyName ? (
                              <span className="flex items-center gap-1 whitespace-nowrap">
                                <Building2 className="h-3 w-3" />
                                {contact.companyName}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{contact.email ?? '—'}</td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{contact.phone ?? '—'}</td>
                          <td className="px-3 py-2">
                            <a
                              href={contact.linkedinUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline flex items-center gap-1 whitespace-nowrap"
                            >
                              Ver perfil <ExternalLink className="h-3 w-3" />
                            </a>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex gap-2">
                              {!hasContactInfo && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1"
                                  disabled={enrichingId === contact.id}
                                  onClick={() => handleEnrich(contact)}
                                >
                                  {enrichingId === contact.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Sparkles className="h-3 w-3" />
                                  )}
                                  Enriquecer
                                </Button>
                              )}
                              {contact.convertedLeadId ? (
                                <Badge variant="outline" className="gap-1">
                                  <Check className="h-3 w-3" /> No CRM
                                </Badge>
                              ) : (
                                <Button
                                  size="sm"
                                  className="gap-1"
                                  disabled={promotingId === contact.id}
                                  onClick={() => handlePromote(contact)}
                                >
                                  {promotingId === contact.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <UserPlus className="h-3 w-3" />
                                  )}
                                  Enviar para o CRM
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
