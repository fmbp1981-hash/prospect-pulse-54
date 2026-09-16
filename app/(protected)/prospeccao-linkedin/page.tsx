'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Linkedin, Search, ExternalLink, Building2 } from 'lucide-react';
import { toast } from 'sonner';

interface LinkedinSearchContact {
  id: string;
  name: string;
  roleTitle: string | null;
  linkedinUrl: string;
  locationRaw: string | null;
  companyName: string | null;
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

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Linkedin className="h-6 w-6 text-primary" />
          Prospecção LinkedIn
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Busca pessoas no LinkedIn via camada pública, sem login e sem risco de banimento de
          conta. Os resultados ficam em uma área separada — nada é enviado ao CRM automaticamente.
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
            <div className="flex items-center justify-between">
              <CardTitle>Resultado</CardTitle>
              <div className="flex gap-2">
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
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Nome</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Cargo</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Empresa</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Local</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Perfil</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {result.contacts.map(contact => (
                      <tr key={contact.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2 font-medium">{contact.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{contact.roleTitle ?? '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {contact.companyName ? (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {contact.companyName}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{contact.locationRaw ?? '—'}</td>
                        <td className="px-3 py-2">
                          <a
                            href={contact.linkedinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline flex items-center gap-1"
                          >
                            Ver perfil <ExternalLink className="h-3 w-3" />
                          </a>
                        </td>
                      </tr>
                    ))}
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
