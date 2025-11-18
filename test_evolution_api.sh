#!/bin/bash

# Script para testar Evolution API
# Substitua as variáveis abaixo com suas credenciais

EVOLUTION_API_URL="https://sua-evolution-api.com/instance/SUA_INSTANCIA"
EVOLUTION_API_KEY="SUA_API_KEY_AQUI"
TEST_NUMBER="5511999999999"  # Número de teste

echo "🔍 Testando Evolution API..."
echo "URL: $EVOLUTION_API_URL/checkNumber"
echo "Número de teste: $TEST_NUMBER"
echo ""

# Fazer requisição
curl -X POST "$EVOLUTION_API_URL/checkNumber" \
  -H "Content-Type: application/json" \
  -H "apikey: $EVOLUTION_API_KEY" \
  -d "{\"number\": \"$TEST_NUMBER\"}" \
  -w "\n\nHTTP Status: %{http_code}\n" \
  -v

echo ""
echo "✅ Teste concluído!"
echo ""
echo "Resultado esperado:"
echo "- HTTP Status: 200 (sucesso) ou 201"
echo "- Resposta JSON: {\"exists\": true/false, \"jid\": \"...\"}"
echo ""
echo "Se der erro:"
echo "- 401/403: API Key inválida"
echo "- 404: URL incorreta"
echo "- 500: Erro no servidor Evolution"
